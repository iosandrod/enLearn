[CmdletBinding()]
param(
  [string]$Distro = 'Ubuntu-22.04',
  [switch]$RestartServices,
  [switch]$ShutdownWsl
)

$ErrorActionPreference = 'Stop'
$wsl = Join-Path ${env:ProgramFiles} 'WSL\wsl.exe'
if (-not (Test-Path -LiteralPath $wsl)) {
  $wsl = Join-Path $env:WINDIR 'System32\wsl.exe'
}
if (-not (Test-Path -LiteralPath $wsl)) {
  throw "WSL executable not found: $wsl"
}

function Invoke-WslRoot {
  param([Parameter(Mandatory)][string]$Command)
  & $wsl -d $Distro -u root -e bash -lc $Command
  if ($LASTEXITCODE -ne 0) {
    throw "WSL command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

Write-Host '=== Memory before cleanup ===' -ForegroundColor DarkCyan
Invoke-WslRoot 'free -h; echo; docker stats --no-stream --format "{{.Name}} {{.MemUsage}} {{.MemPerc}}"'

Write-Host 'Releasing Linux page cache...' -ForegroundColor Cyan
Invoke-WslRoot 'sync; echo 3 > /proc/sys/vm/drop_caches'

Write-Host 'Removing only unused Docker artifacts (volumes are never removed)...' -ForegroundColor Cyan
Invoke-WslRoot 'timeout --foreground 20s docker container prune -f || true'
Invoke-WslRoot 'timeout --foreground 20s docker image prune -f || true'
Invoke-WslRoot 'timeout --foreground 20s docker builder prune -f || true'

if ($RestartServices) {
  Write-Host 'Restarting memory-heavy services...' -ForegroundColor Cyan
  Invoke-WslRoot 'docker restart trigger-clickhouse-1 trigger-webapp-1 trigger-supervisor-1 enlearn-api-1'
  Write-Host 'Waiting for restarted services to become healthy...' -ForegroundColor Cyan
  Invoke-WslRoot 'for i in $(seq 1 60); do api=$(docker inspect -f ''{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}'' enlearn-api-1 2>/dev/null || true); webapp=$(docker inspect -f ''{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}'' trigger-webapp-1 2>/dev/null || true); supervisor=$(docker inspect -f ''{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}'' trigger-supervisor-1 2>/dev/null || true); clickhouse=$(docker inspect -f ''{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}'' trigger-clickhouse-1 2>/dev/null || true); if [ "$api" = healthy ] && [ "$webapp" = healthy ] && [ "$supervisor" = healthy ] && [ "$clickhouse" = healthy ]; then exit 0; fi; sleep 2; done; echo "api=$api webapp=$webapp supervisor=$supervisor clickhouse=$clickhouse" >&2; exit 1'
  Invoke-WslRoot 'docker ps --format "table {{.Names}}\t{{.Status}}"'
}

Write-Host '=== Memory after cleanup ===' -ForegroundColor DarkCyan
Invoke-WslRoot 'free -h; echo; docker stats --no-stream --format "{{.Name}} {{.MemUsage}} {{.MemPerc}}"'

if ($ShutdownWsl) {
  Write-Warning 'Shutting down WSL stops all services. The Windows startup task must start them again.'
  & $wsl --shutdown
  if ($LASTEXITCODE -ne 0) {
    throw "Could not shut down WSL: exit code $LASTEXITCODE"
  }
}

Write-Host 'Memory cleanup completed. Database volumes and project files were preserved.' -ForegroundColor Green
