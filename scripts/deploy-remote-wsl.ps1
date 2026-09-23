param(
  [string]$ProjectPath = 'C:\project\enLearn',
  [string]$Distro = 'Ubuntu-22.04',
  [string]$PublicUrl = 'http://117.72.155.0/',
  [switch]$NoCache
)

$ErrorActionPreference = 'Stop'

$wsl = 'C:\Program Files\WSL\wsl.exe'
$composeFile = '/mnt/c/project/enLearn/docker-compose.yml'
$envFile = '/mnt/c/project/enLearn/.env.production'
$projectDir = '/mnt/c/project/enLearn'
$hostForwardPort = 18081

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

function Invoke-Compose {
  param([string[]]$Arguments)

  & $wsl -d $Distro -e bash -lc "cd '$projectDir' && docker compose -p enlearn -f '$composeFile' --env-file '$envFile' $($Arguments -join ' ')"
  if ($LASTEXITCODE -ne 0) {
    throw "Remote Docker Compose command failed with exit code $LASTEXITCODE"
  }
}

function Ensure-WindowsPortProxy {
  Write-Host 'Refreshing Windows HTTP port forwarding...' -ForegroundColor Cyan
  & netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=80 2>$null
  & netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=80 connectaddress=127.0.0.1 connectport=$hostForwardPort
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not configure Windows port 80 forwarding.'
  }
}

Write-Host "Checking WSL and Docker..." -ForegroundColor Cyan
& $wsl -d $Distro -e bash -lc 'docker info >/dev/null'
if ($LASTEXITCODE -ne 0) {
  throw "Docker is not available in WSL distribution: $Distro"
}

Write-Host 'Building api and web images...' -ForegroundColor Cyan
$buildArgs = @('build', '--pull=false')
if ($NoCache) { $buildArgs += '--no-cache' }
$buildArgs += @('api', 'web')
Invoke-Compose $buildArgs

Write-Host 'Replacing api and web containers...' -ForegroundColor Cyan
Invoke-Compose @('up', '-d', '--no-build', '--force-recreate', '--no-deps', 'api', 'web')

Ensure-WindowsPortProxy

Write-Host 'Checking service status...' -ForegroundColor Cyan
Invoke-Compose @('ps')

Write-Host 'Checking internal HTTP endpoints...' -ForegroundColor Cyan
& $wsl -d $Distro -e bash -lc "curl -fsS -o /dev/null http://127.0.0.1:8081/ && curl -fsS -o /dev/null http://127.0.0.1:8030/healthcheck"
if ($LASTEXITCODE -ne 0) {
  throw 'Internal web or Trigger health check failed.'
}

if ($PublicUrl) {
  Write-Host "Checking public URL: $PublicUrl" -ForegroundColor Cyan
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri ($PublicUrl + '?deploy_check=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -Headers @{ 'Cache-Control' = 'no-cache' }
    if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode)" }
    Write-Host "Public URL returned HTTP $($response.StatusCode)." -ForegroundColor Green
  } catch {
    throw "Public URL check failed: $($_.Exception.Message)"
  }
}

Write-Host ''
Write-Host 'Deployment completed successfully.' -ForegroundColor Green
