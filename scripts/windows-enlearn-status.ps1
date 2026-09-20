[CmdletBinding()]
param(
  [string]$Distro = 'Ubuntu-22.04',
  [string]$LinuxProjectRoot = '/mnt/c/project/enLearn',
  [int]$ListenPort = 80
)

$ErrorActionPreference = 'Continue'
$WslPath = Join-Path ${env:ProgramFiles} 'WSL\wsl.exe'
if (-not (Test-Path -LiteralPath $WslPath)) {
  $WslPath = Join-Path $env:WINDIR 'System32\wsl.exe'
}

Write-Host '=== WSL ===' -ForegroundColor Cyan
& $WslPath --list --verbose

Write-Host "`n=== Docker Compose ===" -ForegroundColor Cyan
$composeCommand = "cd '$LinuxProjectRoot' && docker compose --env-file .env.production ps"
& $WslPath -d $Distro --exec /bin/sh -lc $composeCommand

Write-Host "`n=== Trigger Compose ===" -ForegroundColor Cyan
$triggerCommand = "cd '$LinuxProjectRoot/infra/triggerdev' && if [ -f .env ]; then docker compose --env-file .env -f docker-compose.yml ps; else echo 'Trigger .env is missing'; fi"
& $WslPath -d $Distro --exec /bin/sh -lc $triggerCommand

Write-Host "`n=== Port Proxy ===" -ForegroundColor Cyan
& (Join-Path $env:WINDIR 'System32\netsh.exe') interface portproxy show v4tov4

Write-Host "`n=== HTTP ===" -ForegroundColor Cyan
try {
  $response = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/" -f $ListenPort) -UseBasicParsing -TimeoutSec 10
  Write-Host ("HTTP {0} {1}" -f [int]$response.StatusCode, $response.StatusDescription) -ForegroundColor Green
} catch {
  Write-Host ("HTTP check failed: {0}" -f $_.Exception.Message) -ForegroundColor Red
}

Write-Host "`n=== Startup Task ===" -ForegroundColor Cyan
& (Join-Path $env:WINDIR 'System32\schtasks.exe') /Query /TN 'enLearn-Start-Services' /FO LIST /V
