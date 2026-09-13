$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

docker compose --env-file .env.production down
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Compose failed to stop the application.'
}
