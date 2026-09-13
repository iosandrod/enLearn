$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path -LiteralPath '.env.production')) {
  Copy-Item -LiteralPath '.env.production.example' -Destination '.env.production'
  Write-Error 'Created .env.production. Fill in the production values, then run this script again.'
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker is not running. Start Docker Desktop and retry.'
}

docker compose --env-file .env.production up -d --build
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Compose failed to start the application.'
}

docker compose --env-file .env.production ps
