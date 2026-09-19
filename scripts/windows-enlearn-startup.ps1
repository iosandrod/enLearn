[CmdletBinding()]
param(
  [string]$Distro = 'Ubuntu-22.04',
  [string]$LinuxProjectRoot = '/mnt/c/project/enLearn',
  [int]$ListenPort = 80,
  [int]$ContainerPort = 8081
)

$ErrorActionPreference = 'Continue'
$WindowsProjectRoot = 'C:\project\enLearn'
$TriggerProjectRoot = "$LinuxProjectRoot/infra/triggerdev"
$LogDirectory = Join-Path $WindowsProjectRoot '.codex-server-logs'
$LogPath = Join-Path $LogDirectory 'windows-enlearn-startup.log'
$WslPath = Join-Path ${env:ProgramFiles} 'WSL\wsl.exe'
if (-not (Test-Path -LiteralPath $WslPath)) {
  $WslPath = Join-Path $env:WINDIR 'System32\wsl.exe'
}

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null

function Write-StartupLog {
  param([string]$Message)
  $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

# Keep one WSL process alive. If WSL or Docker fails later, the loop retries it.
# A literal here-string keeps Bash variables from being expanded by PowerShell.
$linuxCommand = @'
set +e
cd '__PROJECT_ROOT__'
until docker info >/dev/null 2>&1; do
  sleep 5
done
until docker compose --env-file .env.production up -d --remove-orphans; do
  echo 'Main Compose startup failed; retrying in 15 seconds.'
  sleep 15
done

if [ -f '__TRIGGER_ROOT__/.env' ]; then
  until docker compose --env-file '__TRIGGER_ROOT__/.env' -f '__TRIGGER_ROOT__/docker-compose.yml' up -d --remove-orphans; do
    echo 'Trigger Compose startup failed; retrying in 15 seconds.'
    sleep 15
  done
else
  echo 'Trigger deployment skipped: infra/triggerdev/.env is missing'
fi

ip=$(hostname -I | awk '{print $1}')
if [ -n "$ip" ]; then
  /mnt/c/Windows/System32/netsh.exe interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=__LISTEN_PORT__ >/dev/null 2>&1 || true
  /mnt/c/Windows/System32/netsh.exe interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=__LISTEN_PORT__ connectaddress="$ip" connectport=__CONTAINER_PORT__ >/dev/null 2>&1 || /mnt/c/Windows/System32/netsh.exe interface portproxy set v4tov4 listenaddress=0.0.0.0 listenport=__LISTEN_PORT__ connectaddress="$ip" connectport=__CONTAINER_PORT__ >/dev/null 2>&1
fi
exec tail -f /dev/null
'@
$linuxCommand = $linuxCommand.Replace('__PROJECT_ROOT__', $LinuxProjectRoot)
$linuxCommand = $linuxCommand.Replace('__TRIGGER_ROOT__', $TriggerProjectRoot)
$linuxCommand = $linuxCommand.Replace('__LISTEN_PORT__', [string]$ListenPort)
$linuxCommand = $linuxCommand.Replace('__CONTAINER_PORT__', [string]$ContainerPort)

Write-StartupLog "Starting WSL supervisor for $Distro."
while ($true) {
  try {
    & $WslPath -d $Distro --exec /bin/sh -lc $linuxCommand 2>&1 | ForEach-Object {
      Write-StartupLog ([string]$_)
    }
    $exitCode = $LASTEXITCODE
    Write-StartupLog "WSL supervisor exited with code $exitCode; retrying in 10 seconds."
  } catch {
    Write-StartupLog "WSL supervisor error: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 10
}
