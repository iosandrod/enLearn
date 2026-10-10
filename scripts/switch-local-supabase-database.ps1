<#
.SYNOPSIS
Switches the local Supabase CLI stack between its local PostgreSQL container
and a remote PostgreSQL server.

.DESCRIPTION
Supabase CLI does not expose an external database setting for `supabase start`.
This script keeps every generated Supabase service unchanged and replaces the
database container with a TCP forwarder. The original database container and
volume are retained under a backup container name for a fast rollback.
The optional local pooler is disabled in Remote mode so it does not initialize
Supavisor metadata in the remote database. Use the direct database port instead.

Set REMOTE_PGPASSWORD before selecting Remote. The password is never written to
disk by this script.

.EXAMPLE
$env:REMOTE_PGPASSWORD = 'your-password'
./scripts/switch-local-supabase-database.ps1 -Mode Remote

.EXAMPLE
./scripts/switch-local-supabase-database.ps1 -Mode Local
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('Remote', 'Local')]
  [string]$Mode,
  [string]$ProjectId = 'hikari',
  [string]$RemoteHostName = '117.72.155.0',
  [ValidateRange(1, 65535)]
  [int]$RemotePort = 54322,
  [string]$RemoteDatabase = 'postgres',
  [string]$RemoteUser = 'postgres',
  [ValidateRange(1, 65535)]
  [int]$LocalPort = 54322,
  [string]$ProxyImage = 'alpine/socat:latest'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$databaseContainer = "supabase_db_$ProjectId"
$localBackupContainer = "supabase_db_local_$ProjectId"
$network = "supabase_network_$ProjectId"
$poolerContainer = "supabase_pooler_$ProjectId"
$realtimeContainer = "supabase_realtime_$ProjectId"
$realtimeBackupPath = Join-Path (Split-Path $PSScriptRoot -Parent) "artifacts/supabase-db-switch/$ProjectId/realtime-run.original.sh"
$realtimeRemoteScript = Join-Path $PSScriptRoot 'supabase-realtime-existing-db.sh'
$dependentContainers = @(
  "supabase_auth_$ProjectId",
  "supabase_rest_$ProjectId",
  "supabase_storage_$ProjectId",
  "supabase_realtime_$ProjectId",
  "supabase_pg_meta_$ProjectId",
  "supabase_studio_$ProjectId",
  "supabase_kong_$ProjectId"
)

function Test-ContainerExists {
  param([Parameter(Mandatory)] [string]$Name)
  $null = docker container inspect $Name 2>$null
  return $LASTEXITCODE -eq 0
}

function Invoke-Docker {
  param([Parameter(Mandatory)] [string[]]$Arguments)
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Docker command failed: docker $($Arguments -join ' ')"
  }
}

function Restart-Dependents {
  $existing = @($dependentContainers | Where-Object { Test-ContainerExists $_ })
  if ($existing.Count -gt 0) {
    Invoke-Docker -Arguments (@('restart') + $existing)
  }
}

function Stop-RemotePooler {
  if (Test-ContainerExists $poolerContainer) {
    Invoke-Docker -Arguments @('update', '--restart', 'no', $poolerContainer)
    Invoke-Docker -Arguments @('stop', $poolerContainer)
  }
}

function Set-RealtimeExistingDatabase {
  if (-not (Test-ContainerExists $realtimeContainer)) { return }
  if (-not (Test-Path -LiteralPath $realtimeBackupPath)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $realtimeBackupPath -Parent) | Out-Null
    Invoke-Docker -Arguments @('cp', "${realtimeContainer}:/app/run.sh", $realtimeBackupPath)
  }
  Invoke-Docker -Arguments @('cp', $realtimeRemoteScript, "${realtimeContainer}:/app/run.sh")
  Invoke-Docker -Arguments @('exec', $realtimeContainer, 'chmod', '755', '/app/run.sh')
}

function Wait-ForDatabase {
  param(
    [Parameter(Mandatory)] [string]$ClientImage,
    [Parameter(Mandatory)] [string]$Password
  )

  for ($attempt = 1; $attempt -le 30; $attempt++) {
    & docker run --rm --network $network --entrypoint psql `
      -e "PGPASSWORD=$Password" -e 'PGCONNECT_TIMEOUT=2' $ClientImage `
      -X -h $databaseContainer -p 5432 -U $RemoteUser -d $RemoteDatabase `
      -v ON_ERROR_STOP=1 -Atc 'SELECT inet_server_addr(), current_database(), current_user' 2>$null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 1
  }

  throw "Database did not become reachable through $databaseContainer."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker is not running. Start Docker Desktop and retry.'
}

if ($Mode -eq 'Remote') {
  $remotePassword = $env:REMOTE_PGPASSWORD
  if ([string]::IsNullOrWhiteSpace($remotePassword)) {
    throw 'Set REMOTE_PGPASSWORD in the current shell before switching to Remote mode.'
  }
  if (-not (Test-ContainerExists $databaseContainer)) {
    throw "Container $databaseContainer was not found. Run 'supabase start' first."
  }

  $activeImage = docker container inspect $databaseContainer --format '{{.Config.Image}}'
  $activeMode = docker container inspect $databaseContainer --format '{{index .Config.Labels "com.enlearn.supabase-db-mode"}}'
  if ($activeMode -eq 'remote') {
    Stop-RemotePooler
    Set-RealtimeExistingDatabase
    Invoke-Docker -Arguments @('restart', $realtimeContainer)
    Write-Host "Supabase is already using the remote database at ${RemoteHostName}:$RemotePort."
    exit 0
  }

  # Validate the endpoint and every account used by the local Supabase services
  # before changing any containers.
  foreach ($role in @('postgres', 'authenticator', 'supabase_auth_admin', 'supabase_storage_admin', 'supabase_admin', 'supabase_replication_admin')) {
    & docker run --rm --entrypoint psql -e "PGPASSWORD=$remotePassword" -e 'PGCONNECT_TIMEOUT=5' $activeImage `
      -X -h $RemoteHostName -p $RemotePort -U $role -d $RemoteDatabase `
      -v ON_ERROR_STOP=1 -Atc 'SELECT 1' *> $null
    if ($LASTEXITCODE -ne 0) {
      throw "Remote database validation failed for role '$role'. No containers were changed."
    }
  }

  if (Test-ContainerExists $localBackupContainer) {
    throw "Backup container $localBackupContainer already exists; refusing to overwrite it."
  }

  # Keep Supavisor from running metadata migrations against the remote server.
  Stop-RemotePooler

  & docker stop $databaseContainer
  if ($LASTEXITCODE -ne 0) {
    $databaseRunning = docker container inspect $databaseContainer --format '{{.State.Running}}'
    if ($databaseRunning -ne 'false') {
      throw "Docker failed to stop $databaseContainer."
    }
  }
  Invoke-Docker -Arguments @('rename', $databaseContainer, $localBackupContainer)

  try {
    Invoke-Docker -Arguments @('pull', $ProxyImage)
    Invoke-Docker -Arguments @(
      'run', '--detach',
      '--name', $databaseContainer,
      '--network', $network,
      '--network-alias', 'db',
      '--network-alias', $databaseContainer,
      '--publish', "${LocalPort}:5432",
      '--restart', 'unless-stopped',
      '--label', 'com.enlearn.supabase-db-mode=remote',
      '--label', "com.supabase.cli.project=$ProjectId",
      '--label', "com.supabase.cli.workdir=$PSScriptRoot\..",
      $ProxyImage,
      '-dd', 'TCP-LISTEN:5432,fork,reuseaddr,keepalive', "TCP:${RemoteHostName}:$RemotePort,keepalive"
    )
    Wait-ForDatabase -ClientImage $activeImage -Password $remotePassword
    Set-RealtimeExistingDatabase
    Restart-Dependents
  } catch {
    if (Test-ContainerExists $databaseContainer) {
      docker rm --force $databaseContainer *> $null
    }
    if (Test-ContainerExists $localBackupContainer) {
      docker rename $localBackupContainer $databaseContainer *> $null
      docker start $databaseContainer *> $null
    }
    Restart-Dependents
    throw
  }

  Write-Host ''
  Write-Host 'Local Supabase now uses the remote PostgreSQL database.' -ForegroundColor Green
  Write-Host "Database: ${RemoteHostName}:$RemotePort/$RemoteDatabase"
  Write-Host "Supabase API: http://127.0.0.1:54321"
  Write-Host "Supabase Studio: http://127.0.0.1:54323"
  Write-Host "Local database backup container: $localBackupContainer"
  exit 0
}

if (-not (Test-ContainerExists $databaseContainer)) {
  throw "Container $databaseContainer was not found."
}
$activeMode = docker container inspect $databaseContainer --format '{{index .Config.Labels "com.enlearn.supabase-db-mode"}}'
if ($activeMode -ne 'remote') {
  Write-Host 'Supabase is already using its local PostgreSQL database.'
  exit 0
}
if (-not (Test-ContainerExists $localBackupContainer)) {
  throw "Local backup container $localBackupContainer was not found. Run 'supabase stop' and 'supabase start' to recreate the local stack."
}

Invoke-Docker -Arguments @('rm', '--force', $databaseContainer)
Invoke-Docker -Arguments @('rename', $localBackupContainer, $databaseContainer)
Invoke-Docker -Arguments @('start', $databaseContainer)
if ((Test-ContainerExists $realtimeContainer) -and (Test-Path -LiteralPath $realtimeBackupPath)) {
  Invoke-Docker -Arguments @('cp', $realtimeBackupPath, "${realtimeContainer}:/app/run.sh")
  Invoke-Docker -Arguments @('exec', $realtimeContainer, 'chmod', '755', '/app/run.sh')
}
Restart-Dependents
if (Test-ContainerExists $poolerContainer) {
  Invoke-Docker -Arguments @('update', '--restart', 'unless-stopped', $poolerContainer)
  Invoke-Docker -Arguments @('start', $poolerContainer)
}

Write-Host ''
Write-Host 'Local Supabase now uses its local PostgreSQL database.' -ForegroundColor Green
Write-Host "Database: 127.0.0.1:$LocalPort/postgres"
