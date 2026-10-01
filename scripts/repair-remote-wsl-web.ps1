[CmdletBinding()]
param(
  [string]$ProjectPath = 'C:\project\enLearn',
  [string]$Distro = 'Ubuntu-22.04',
  [int]$WebPort = 8081,
  [int]$TunnelPort = 18081,
  [int]$PublicPort = 80,
  [System.Security.SecureString]$TaskPassword,
  [switch]$Build,
  [switch]$NoCache,
  [switch]$CleanMemory,
  [switch]$SkipTrigger,
  [switch]$SkipCompose
)

$ErrorActionPreference = 'Stop'

$wsl = Join-Path ${env:ProgramFiles} 'WSL\wsl.exe'
if (-not (Test-Path -LiteralPath $wsl)) {
  $wsl = Join-Path $env:WINDIR 'System32\wsl.exe'
}
$netsh = Join-Path $env:WINDIR 'System32\netsh.exe'
$linuxProjectPath = '/mnt/c/project/enLearn'
$composeFile = "$linuxProjectPath/docker-compose.yml"
$envFile = "$linuxProjectPath/.env.production"
$triggerProjectPath = "$linuxProjectPath/infra/triggerdev"
$triggerComposeFile = "$triggerProjectPath/docker-compose.yml"
$triggerEnvFile = "$triggerProjectPath/.env"
$triggerClickhouseVolume = 'trigger_clickhouse'
$tunnelService = 'enlearn-host-tunnel.service'
$keepAliveTask = 'enLearn WSL KeepAlive'
$startupTask = 'enLearn-Start-Services'

if (-not (Test-Path -LiteralPath $wsl)) {
  throw "WSL executable not found: $wsl"
}
if (-not (Test-Path -LiteralPath $ProjectPath)) {
  throw "Project directory not found: $ProjectPath"
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath 'docker-compose.yml'))) {
  throw "docker-compose.yml not found in: $ProjectPath"
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath '.env.production'))) {
  throw "Missing .env.production in: $ProjectPath"
}
if (-not $SkipTrigger -and -not (Test-Path -LiteralPath (Join-Path $ProjectPath 'infra\triggerdev\.env'))) {
  throw "Missing Trigger environment file: $(Join-Path $ProjectPath 'infra\triggerdev\.env')"
}

function Invoke-WslRoot {
  param(
    [Parameter(Mandatory)]
    [string]$Command
  )

  & $wsl -d $Distro -u root -e bash -lc $Command
  if ($LASTEXITCODE -ne 0) {
    throw "WSL command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

function Test-HttpEndpoint {
  param(
    [Parameter(Mandatory)]
    [string]$Uri,
    [int]$TimeoutSec = 5
  )

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec $TimeoutSec
    return ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Wait-WslHttp {
  param(
    [Parameter(Mandatory)]
    [string]$Uri,
    [int]$Attempts = 30
  )

  for ($i = 1; $i -le $Attempts; $i++) {
    & $wsl -d $Distro -u root -e bash -lc "curl -fsS -o /dev/null --max-time 3 '$Uri'" 2>$null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 2
  }
  throw "WSL endpoint did not become ready: $Uri"
}

function Wait-WindowsHttp {
  param(
    [Parameter(Mandatory)]
    [string]$Uri,
    [int]$Attempts = 30
  )

  for ($i = 1; $i -le $Attempts; $i++) {
    if (Test-HttpEndpoint -Uri $Uri -TimeoutSec 3) {
      return
    }
    Start-Sleep -Seconds 2
  }
  throw "Windows endpoint did not become ready: $Uri"
}

function Wait-WslHealthy {
  param(
    [Parameter(Mandatory)]
    [string]$ComposeFile,
    [Parameter(Mandatory)]
    [string]$EnvFile,
    [Parameter(Mandatory)]
    [string]$Service,
    [int]$Attempts = 150
  )

  for ($i = 1; $i -le $Attempts; $i++) {
    $id = "trigger-$Service-1"
    $state = (& $wsl -d $Distro -u root -e bash -lc "docker inspect -f '{{.State.Status}}' '$id'" 2>$null | Select-Object -First 1).Trim()
    $health = (& $wsl -d $Distro -u root -e bash -lc "docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' '$id'" 2>$null | Select-Object -First 1).Trim()
    if ($state -eq 'running' -and ($health -eq 'healthy' -or $health -eq 'no-healthcheck')) {
      return
    }
    if ($state -eq 'exited' -or $state -eq 'dead') {
      break
    }
    Start-Sleep -Seconds 2
  }

  Write-Host "=== Trigger $Service diagnostics ===" -ForegroundColor Red
  & $wsl -d $Distro -u root -e bash -lc "docker compose -p trigger -f '$ComposeFile' --env-file '$EnvFile' ps '$Service'"
  & $wsl -d $Distro -u root -e bash -lc "docker logs --tail 80 'trigger-$Service-1'"
  throw "Trigger service did not become healthy: $Service"
}

function Add-PortProxy {
  param(
    [ValidateSet('v4tov4', 'v6tov4')]
    [string]$Type,
    [Parameter(Mandatory)]
    [string]$ListenAddress,
    [Parameter(Mandatory)]
    [int]$ListenPort,
    [Parameter(Mandatory)]
    [string]$ConnectAddress,
    [Parameter(Mandatory)]
    [int]$ConnectPort
  )

  & $netsh interface portproxy delete $Type listenaddress=$ListenAddress listenport=$ListenPort 2>$null | Out-Null
  & $netsh interface portproxy add $Type listenaddress=$ListenAddress listenport=$ListenPort connectaddress=$ConnectAddress connectport=$ConnectPort | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not add Windows port proxy $ListenAddress`:$ListenPort -> $ConnectAddress`:$ConnectPort"
  }
}

function Repair-LongRunningTask {
  param(
    [Parameter(Mandatory)]
    [string]$TaskName
  )

  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Warning "Scheduled task '$TaskName' was not found; skipping it."
    return
  }

  $details = (& schtasks.exe /Query /TN $TaskName /FO LIST /V | Out-String)
  if ($details -match '72:00:00') {
    if (-not $TaskPassword) {
      Write-Warning "Task '$TaskName' still has a 72-hour limit. Pass -TaskPassword once to remove it."
    } else {
      $xmlPath = Join-Path $env:TEMP ("{0}.xml" -f ([guid]::NewGuid()))
      $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($TaskPassword)
      $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
      try {
        & schtasks.exe /Query /TN $TaskName /XML | Set-Content -LiteralPath $xmlPath -Encoding UTF8
        if ($LASTEXITCODE -ne 0) {
          throw "Could not export scheduled task XML"
        }

        [xml]$taskXml = Get-Content -LiteralPath $xmlPath -Raw
        $taskNamespace = 'http://schemas.microsoft.com/windows/2004/02/mit/task'
        $executionLimit = $taskXml.Task.Settings.ExecutionTimeLimit
        if (-not $executionLimit) {
          $executionLimit = $taskXml.CreateElement('ExecutionTimeLimit', $taskNamespace)
          [void]$taskXml.Task.Settings.AppendChild($executionLimit)
        }
        $executionLimit.InnerText = 'PT0S'
        $taskXml.Save($xmlPath)

        $runAs = $task.Principal.UserId
        if ([string]::IsNullOrWhiteSpace($runAs)) {
          $runAs = "$env:COMPUTERNAME\$env:USERNAME"
        }
        & schtasks.exe /Create /TN $TaskName /XML $xmlPath /RU $runAs /RP $plainPassword /F | Out-Null
        if ($LASTEXITCODE -ne 0) {
          throw "schtasks returned exit code $LASTEXITCODE"
        }
      } finally {
        if ($passwordPointer -ne [IntPtr]::Zero) {
          [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
        }
        $plainPassword = $null
        Remove-Item -LiteralPath $xmlPath -Force -ErrorAction SilentlyContinue
      }
    }
  }

  & schtasks.exe /Run /TN $TaskName | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not start scheduled task: $TaskName"
  }
}

function Invoke-MemoryCleanup {
  Write-Host 'Releasing Linux page cache...' -ForegroundColor Cyan
  Invoke-WslRoot 'sync; echo 3 > /proc/sys/vm/drop_caches'

  if (-not $CleanMemory) {
    return
  }

  Write-Host 'Cleaning stopped containers, dangling images, and build cache...' -ForegroundColor Cyan
  Invoke-WslRoot 'timeout --foreground 20s docker container prune -f || true'
  Invoke-WslRoot 'timeout --foreground 20s docker image prune -f || true'
  Invoke-WslRoot 'timeout --foreground 20s docker builder prune -f || true'

  if (-not $SkipTrigger) {
    Write-Host 'Restarting ClickHouse to release long-lived memory pages...' -ForegroundColor Cyan
    Invoke-WslRoot 'docker restart trigger-clickhouse-1'
  }
}

Write-Host 'Removing the 72-hour limit from WSL startup tasks...' -ForegroundColor Cyan
Repair-LongRunningTask -TaskName $keepAliveTask
Repair-LongRunningTask -TaskName $startupTask
Start-Sleep -Seconds 3

Write-Host 'Starting WSL...' -ForegroundColor Cyan
& $wsl -d $Distro -u root -e /bin/true
if ($LASTEXITCODE -ne 0) {
  throw "Could not start WSL distribution: $Distro"
}

Write-Host 'Waiting for Docker...' -ForegroundColor Cyan
$dockerReady = $false
for ($i = 1; $i -le 30; $i++) {
  & $wsl -d $Distro -u root -e bash -lc 'docker info >/dev/null 2>&1' 2>$null
  if ($LASTEXITCODE -eq 0) {
    $dockerReady = $true
    break
  }
  Start-Sleep -Seconds 2
}
if (-not $dockerReady) {
  throw 'Docker did not become ready inside WSL.'
}

Invoke-MemoryCleanup

if (-not $SkipCompose) {
  if ($Build) {
    Write-Host 'Building enLearn api/web images...' -ForegroundColor Cyan
    $buildOptions = '--pull=false'
    if ($NoCache) { $buildOptions += ' --no-cache' }
    Invoke-WslRoot "cd '$linuxProjectPath' && docker compose -p enlearn -f '$composeFile' --env-file '$envFile' build $buildOptions api web"
  }

  $mode = if ($Build) { 'with rebuilt images' } else { 'without rebuilding' }
  Write-Host "Ensuring enLearn api/web containers are running $mode..." -ForegroundColor Cyan
  $composeCommand = "cd '$linuxProjectPath' && docker compose -p enlearn -f '$composeFile' --env-file '$envFile' up -d --no-build api web"
  if ($Build) {
    $composeCommand = "cd '$linuxProjectPath' && docker compose -p enlearn -f '$composeFile' --env-file '$envFile' up -d --no-build --force-recreate --no-deps api web"
  }
  Invoke-WslRoot $composeCommand
}

Write-Host 'Waiting for the Web container inside WSL...' -ForegroundColor Cyan
Wait-WslHttp -Uri "http://127.0.0.1:$WebPort/"

if (-not $SkipTrigger) {
  Write-Host 'Starting Trigger infrastructure in dependency order...' -ForegroundColor Cyan
  $triggerBase = "cd '$triggerProjectPath' && docker compose -p trigger -f '$triggerComposeFile' --env-file '$triggerEnvFile'"
  Write-Host 'Ensuring completed ClickHouse migrations are not retried by the Trigger image...' -ForegroundColor Cyan
  $triggerEnvSetting = ((& $wsl -d $Distro -u root -e bash -lc "grep -E '^SKIP_CLICKHOUSE_MIGRATIONS=' '$triggerEnvFile'" 2>$null) -join "`n").Trim()
  if ([string]::IsNullOrWhiteSpace($triggerEnvSetting)) {
    Add-Content -LiteralPath (Join-Path $ProjectPath 'infra\triggerdev\.env') -Value "`n# Prevent goose from failing when ClickHouse is already fully migrated.`nSKIP_CLICKHOUSE_MIGRATIONS=1" -Encoding UTF8
    Write-Host 'Added SKIP_CLICKHOUSE_MIGRATIONS=1 to Trigger environment.' -ForegroundColor DarkCyan
  }
  Write-Host 'Repairing Trigger ClickHouse volume permissions without deleting data...' -ForegroundColor Cyan
  Invoke-WslRoot "$triggerBase stop clickhouse"
  Invoke-WslRoot "docker run --rm --user 0 --entrypoint /bin/sh -v '$($triggerClickhouseVolume):/bitnami/clickhouse' 'bitnamilegacy/clickhouse:latest' -c 'chown -R 1001:1001 /bitnami/clickhouse && chmod -R u+rwX /bitnami/clickhouse'"
  Invoke-WslRoot "$triggerBase up -d --no-build postgres redis clickhouse s2-init s2 electric registry minio docker-proxy"

  foreach ($service in @('postgres', 'redis', 'clickhouse', 'electric', 'registry', 'minio', 'docker-proxy')) {
    Write-Host "Waiting for Trigger $service..." -ForegroundColor DarkCyan
    Wait-WslHealthy -ComposeFile $triggerComposeFile -EnvFile $triggerEnvFile -Service $service
  }

  Write-Host 'Starting Trigger webapp and supervisor...' -ForegroundColor Cyan
  Invoke-WslRoot "$triggerBase up -d --no-build --force-recreate --no-deps webapp"
  Wait-WslHealthy -ComposeFile $triggerComposeFile -EnvFile $triggerEnvFile -Service 'webapp'
  Invoke-WslRoot "$triggerBase up -d --no-build --force-recreate --no-deps supervisor"
  Wait-WslHealthy -ComposeFile $triggerComposeFile -EnvFile $triggerEnvFile -Service 'supervisor'
  Wait-WslHttp -Uri 'http://127.0.0.1:8030/healthcheck'
}

Write-Host 'Restarting the stable WSL-to-Windows HTTP tunnel...' -ForegroundColor Cyan
Invoke-WslRoot "systemctl restart '$tunnelService'"
Wait-WindowsHttp -Uri "http://127.0.0.1:$TunnelPort/"

Write-Host 'Repairing Windows port forwarding...' -ForegroundColor Cyan
Add-PortProxy -Type v4tov4 -ListenAddress '0.0.0.0' -ListenPort $PublicPort -ConnectAddress '127.0.0.1' -ConnectPort $TunnelPort
Add-PortProxy -Type v4tov4 -ListenAddress '127.0.0.1' -ListenPort $WebPort -ConnectAddress '127.0.0.1' -ConnectPort $TunnelPort

# Some Windows clients resolve localhost to ::1 first. Keep the IPv6 loopback path working too.
try {
  Add-PortProxy -Type v6tov4 -ListenAddress '::1' -ListenPort $WebPort -ConnectAddress '127.0.0.1' -ConnectPort $TunnelPort
} catch {
  Write-Warning "IPv6 localhost proxy was not added: $($_.Exception.Message)"
}

Write-Host 'Validating local and public entry points...' -ForegroundColor Cyan
Wait-WindowsHttp -Uri "http://127.0.0.1:$WebPort/"
Wait-WindowsHttp -Uri "http://localhost:$WebPort/"
Wait-WindowsHttp -Uri "http://127.0.0.1:$PublicPort/"

Write-Host "`n=== Port proxy ===" -ForegroundColor DarkCyan
& $netsh interface portproxy show all

Write-Host "`n=== enLearn Compose status ===" -ForegroundColor DarkCyan
& $wsl -d $Distro -u root -e bash -lc "cd '$linuxProjectPath' && docker compose -p enlearn -f '$composeFile' --env-file '$envFile' ps"

if (-not $SkipTrigger) {
  Write-Host "`n=== Trigger Compose status ===" -ForegroundColor DarkCyan
  & $wsl -d $Distro -u root -e bash -lc "cd '$triggerProjectPath' && docker compose -p trigger -f '$triggerComposeFile' --env-file '$triggerEnvFile' ps"
}

Write-Host "`n=== WSL startup tasks ===" -ForegroundColor DarkCyan
Get-ScheduledTask -TaskName $keepAliveTask, $startupTask -ErrorAction SilentlyContinue |
  Select-Object TaskName, State |
  Format-Table -AutoSize

Write-Host "`nAll services completed: http://localhost:$WebPort/ and Trigger :8030 are responding." -ForegroundColor Green
