[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$Distro = 'Ubuntu-22.04',
  [string]$KeepAliveTask = 'enLearn WSL KeepAlive',
  [string]$StartupTask = 'enLearn-Start-Services',
  [switch]$PruneDocker,
  [switch]$NoStartServices,
  [switch]$SkipPublicCheck,
  [string]$PublicUrl = 'http://127.0.0.1/'
)

$ErrorActionPreference = 'Stop'

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'This script must be run as Administrator because it stops WSL and compacts a VHDX.'
  }
}

function Get-WslExecutable {
  $candidate = Join-Path ${env:ProgramFiles} 'WSL\wsl.exe'
  if (-not (Test-Path -LiteralPath $candidate)) {
    $candidate = Join-Path $env:WINDIR 'System32\wsl.exe'
  }
  if (-not (Test-Path -LiteralPath $candidate)) {
    throw "WSL executable not found: $candidate"
  }
  return $candidate
}

function Get-WslVhdxPath {
  param([Parameter(Mandatory)][string]$DistributionName)

  $lxssRoot = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Lxss'
  $entries = Get-ChildItem -LiteralPath $lxssRoot -ErrorAction Stop
  foreach ($entry in $entries) {
    $properties = Get-ItemProperty -LiteralPath $entry.PSPath
    if ($properties.DistributionName -eq $DistributionName -and $properties.BasePath) {
      $fileName = if ($properties.VhdFileName) { $properties.VhdFileName } else { 'ext4.vhdx' }
      $path = Join-Path $properties.BasePath $fileName
      if (Test-Path -LiteralPath $path) {
        return (Get-Item -LiteralPath $path).FullName
      }
    }
  }
  throw "Could not locate the VHDX for WSL distribution: $DistributionName"
}

function Stop-ScheduledTaskSafely {
  param([Parameter(Mandatory)][string]$TaskName)
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Host "Stopping scheduled task: $TaskName" -ForegroundColor DarkCyan
    & schtasks.exe /End /TN $TaskName 2>$null | Out-Null
  }
}

function Start-ScheduledTaskSafely {
  param([Parameter(Mandatory)][string]$TaskName)
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Host "Starting scheduled task: $TaskName" -ForegroundColor DarkCyan
    & schtasks.exe /Run /TN $TaskName | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Could not start scheduled task: $TaskName"
    }
  }
}

function Invoke-WslRoot {
  param(
    [Parameter(Mandatory)][string]$WslPath,
    [Parameter(Mandatory)][string]$DistributionName,
    [Parameter(Mandatory)][string]$Command
  )
  & $WslPath -d $DistributionName -u root -e bash -lc $Command
  if ($LASTEXITCODE -ne 0) {
    throw "WSL command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

function Get-SizeGb {
  param([Parameter(Mandatory)][long]$Bytes)
  return [math]::Round($Bytes / 1GB, 2)
}

Assert-Administrator
$wsl = Get-WslExecutable
$vhdxPath = Get-WslVhdxPath -DistributionName $Distro
$beforeVhdx = (Get-Item -LiteralPath $vhdxPath).Length
$beforeC = (Get-PSDrive -Name C).Free

Write-Host "VHDX: $vhdxPath" -ForegroundColor DarkCyan
Write-Host ("Before: VHDX {0} GB, C: free {1} GB" -f (Get-SizeGb $beforeVhdx), (Get-SizeGb $beforeC)) -ForegroundColor Cyan
Write-Warning 'This operation temporarily stops WSL, Docker, enLearn, and Trigger.'

try {
  Stop-ScheduledTaskSafely -TaskName $StartupTask
  Stop-ScheduledTaskSafely -TaskName $KeepAliveTask
  Start-Sleep -Seconds 2

  if ($PruneDocker) {
    Write-Host 'Pruning unused Docker artifacts; volumes are never pruned...' -ForegroundColor Cyan
    Invoke-WslRoot -WslPath $wsl -DistributionName $Distro -Command 'timeout --foreground 30s docker container prune -f || true'
    Invoke-WslRoot -WslPath $wsl -DistributionName $Distro -Command 'timeout --foreground 30s docker image prune -f || true'
    Invoke-WslRoot -WslPath $wsl -DistributionName $Distro -Command 'timeout --foreground 30s docker builder prune -f || true'
  }

  Write-Host 'Trimming free blocks inside WSL...' -ForegroundColor Cyan
  Invoke-WslRoot -WslPath $wsl -DistributionName $Distro -Command 'sync; fstrim -av'

  Write-Host 'Shutting down WSL...' -ForegroundColor Cyan
  & $wsl --shutdown
  if ($LASTEXITCODE -ne 0) {
    throw "Could not shut down WSL: exit code $LASTEXITCODE"
  }
  Start-Sleep -Seconds 3

  $diskpartScript = Join-Path $env:TEMP ("compact-wsl-{0}.txt" -f ([guid]::NewGuid()))
  try {
    @(
      ('select vdisk file="{0}"' -f $vhdxPath),
      'compact vdisk',
      'exit'
    ) | Out-File -LiteralPath $diskpartScript -Encoding ASCII

    Write-Host 'Compacting the WSL VHDX; this may take several minutes...' -ForegroundColor Cyan
    $diskpartOutput = (& diskpart.exe /s $diskpartScript 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0 -or $diskpartOutput -notmatch 'successfully compacted|成功压缩') {
      throw "DiskPart failed to compact the WSL VHDX:`n$diskpartOutput"
    }
    Write-Host 'VHDX compact completed.' -ForegroundColor Green
  } finally {
    Remove-Item -LiteralPath $diskpartScript -Force -ErrorAction SilentlyContinue
  }
} finally {
  if (-not $NoStartServices) {
    Start-ScheduledTaskSafely -TaskName $KeepAliveTask
    Start-ScheduledTaskSafely -TaskName $StartupTask
  }
}

$afterVhdx = (Get-Item -LiteralPath $vhdxPath).Length
$afterC = (Get-PSDrive -Name C).Free
$released = $afterC - $beforeC
Write-Host ("After: VHDX {0} GB, C: free {1} GB, released {2} GB" -f (Get-SizeGb $afterVhdx), (Get-SizeGb $afterC), (Get-SizeGb $released)) -ForegroundColor Green

if (-not $NoStartServices -and -not $SkipPublicCheck) {
  Write-Host "Waiting for public endpoint: $PublicUrl" -ForegroundColor Cyan
  $ready = $false
  for ($i = 1; $i -le 60; $i++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $PublicUrl -TimeoutSec 5
      if ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 500) {
        Write-Host "Endpoint returned HTTP $([int]$response.StatusCode)." -ForegroundColor Green
        $ready = $true
        break
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  if (-not $ready) {
    throw "Endpoint did not become ready: $PublicUrl"
  }
}

Write-Host 'WSL disk cleanup completed. Project files and Docker volumes were preserved.' -ForegroundColor Green
