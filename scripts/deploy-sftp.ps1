[CmdletBinding()]
param(
  [string]$HostName = '117.72.155.0',
  [string]$User = 'administrator',
  [string]$RemoteRoot = 'enlearn'
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path (Get-Location) 'scripts\sftp-sync.ps1') -Mode Deploy -HostName $HostName -User $User -RemoteRoot $RemoteRoot
if ($LASTEXITCODE -ne 0) { throw "SFTP upload failed with exit code $LASTEXITCODE." }

& ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no -o StrictHostKeyChecking=accept-new "$User@$HostName" "cd /d C:\Users\Administrator\$RemoteRoot && docker compose --env-file .env.production up -d --build --remove-orphans"
if ($LASTEXITCODE -ne 0) { throw "Remote Docker deployment failed with exit code $LASTEXITCODE." }
