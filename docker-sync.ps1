param(
  [ValidateSet('all', 'api', 'web')]
  [string]$Service = 'all'
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path -LiteralPath '.env.production')) {
  Copy-Item -LiteralPath '.env.production.example' -Destination '.env.production'
  throw 'Created .env.production. Fill in its values, then run this script again.'
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker is not running. Start Docker Desktop and retry.'
}

$composeArgs = @(
  'compose',
  '--env-file', '.env.production',
  'up', '-d', '--build', '--remove-orphans'
)

if ($Service -ne 'all') {
  # A targeted refresh should not rebuild or recreate the other service.
  $composeArgs += '--no-deps'
  $composeArgs += $Service
}

& docker @composeArgs
if ($LASTEXITCODE -ne 0) {
  throw "Failed to rebuild and restart Docker service: $Service"
}

docker compose --env-file .env.production ps
if ($LASTEXITCODE -ne 0) {
  throw 'Docker services started, but their status could not be read.'
}

Write-Host ''
Write-Host 'Docker code sync completed.' -ForegroundColor Green
Write-Host 'Frontend: http://localhost:8081'
