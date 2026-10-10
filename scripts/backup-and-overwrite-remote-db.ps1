<#
.SYNOPSIS
Backs up the local PostgreSQL database and replaces a remote database with it.

.DESCRIPTION
The local connection is read from DIRECT_URL (preferred) or DATABASE_URL in the
selected dotenv file. The remote password is read from REMOTE_PGPASSWORD, or is
requested securely when the script starts.

The remote database is dropped and recreated before restore, so objects that
exist only on the remote side are removed. The local backup is retained under
artifacts/database-backups by default.
Restore requires a superuser so Supabase object owners, grants and function
settings can be preserved. If postgres is not a superuser, the script tries
supabase_admin with the same password before changing anything remotely.
Restore runs in one transaction; failures roll back the imported objects/data.

.EXAMPLE
.\scripts\backup-and-overwrite-remote-db.ps1

.EXAMPLE
.\scripts\backup-and-overwrite-remote-db.ps1 -Force
#>
[CmdletBinding()]
param(
  [string]$LocalEnvFile = '.env.local',
  [string]$BackupDirectory = 'artifacts/database-backups',
  [string]$RemoteHostName = '117.72.155.0',
  [ValidateRange(1, 65535)]
  [int]$RemotePort = 54322,
  [string]$RemoteDatabase = 'postgres',
  [string]$RemoteUser = 'postgres',
  [string]$RemoteAdminUser = '',
  [string]$ClientContainer = '',
  [switch]$BackupOnly,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-DotEnvValue {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [string[]]$Names
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Dotenv file not found: $Path"
  }

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -notmatch '^\s*(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<value>.*)\s*$') {
      continue
    }

    $value = $Matches.value.Trim()
    if ($value.Length -ge 2) {
      $first = $value[0]
      $last = $value[$value.Length - 1]
      if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }
    $values[$Matches.name] = $value
  }

  foreach ($name in $Names) {
    if ($values.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($values[$name])) {
      return $values[$name]
    }
  }

  throw "None of these settings were found in ${Path}: $($Names -join ', ')"
}

function ConvertFrom-PostgresUrl {
  param([Parameter(Mandatory)] [string]$Url)

  try {
    $uri = [Uri]$Url
  } catch {
    throw 'The local PostgreSQL URL is invalid.'
  }

  if ($uri.Scheme -notin @('postgres', 'postgresql')) {
    throw "Unsupported local database URL scheme: $($uri.Scheme)"
  }

  $userInfo = $uri.UserInfo -split ':', 2
  if ($userInfo.Count -lt 1 -or [string]::IsNullOrWhiteSpace($userInfo[0])) {
    throw 'The local PostgreSQL URL does not include a user name.'
  }

  $password = ''
  if ($userInfo.Count -eq 2) {
    $password = [Uri]::UnescapeDataString($userInfo[1])
  }

  $port = $uri.Port
  if ($port -lt 1) {
    $port = 5432
  }

  [pscustomobject]@{
    Host = $uri.Host
    Port = $port
    Database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
    User = [Uri]::UnescapeDataString($userInfo[0])
    Password = $password
  }
}

function ConvertFrom-SecurePassword {
  param([Parameter(Mandatory)] [Security.SecureString]$SecurePassword)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Invoke-PostgresTool {
  param(
    [Parameter(Mandatory)] [string]$Executable,
    [Parameter(Mandatory)] [string[]]$Arguments,
    [AllowEmptyString()] [string]$Password = ''
  )

  $oldPasswordEntry = Get-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  try {
    $env:PGPASSWORD = $Password
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$([IO.Path]::GetFileName($Executable)) failed with exit code $LASTEXITCODE."
    }
  } finally {
    if ($null -ne $oldPasswordEntry) {
      $env:PGPASSWORD = $oldPasswordEntry.Value
    } else {
      Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
  }
}

function Get-MajorVersion {
  param([Parameter(Mandatory)] [string]$VersionOutput)
  if ($VersionOutput -notmatch '(?i)PostgreSQL\)\s+(?<version>\d+)') {
    throw "Could not determine PostgreSQL client version from: $VersionOutput"
  }
  return [int]$Matches.version
}

function Invoke-DockerLocalPgDump {
  param(
    [Parameter(Mandatory)] [string]$DockerExecutable,
    [Parameter(Mandatory)] [string]$Container,
    [Parameter(Mandatory)] $Connection,
    [Parameter(Mandatory)] [string]$Destination,
    [Parameter(Mandatory)] [string]$Password
  )

  $containerDump = "/tmp/enlearn-$([IO.Path]::GetRandomFileName()).dump"
  $dumpArguments = @(
    'exec',
    '-e', "PGPASSWORD=$Password",
    $Container,
    'pg_dump',
    '--format=custom',
    '--compress=6',
    '--no-password',
    '--host', '127.0.0.1',
    '--port', '5432',
    '--username', $Connection.User,
    '--dbname', $Connection.Database,
    '--file', $containerDump
  )

  try {
    & $DockerExecutable @dumpArguments
    if ($LASTEXITCODE -ne 0) {
      throw "Docker PostgreSQL client failed with exit code $LASTEXITCODE."
    }

    & $DockerExecutable cp "${Container}:$containerDump" $Destination
    if ($LASTEXITCODE -ne 0) {
      throw "Could not copy the Docker backup to: $Destination"
    }
  } finally {
    & $DockerExecutable exec $Container rm -f $containerDump 2>$null
  }
}

function Invoke-DockerPgRestore {
  param(
    [Parameter(Mandatory)] [string]$DockerExecutable,
    [Parameter(Mandatory)] [string]$Container,
    [Parameter(Mandatory)] [string]$Destination,
    [Parameter(Mandatory)] [string]$Password,
    [string]$HostName,
    [int]$Port,
    [string]$User,
    [string]$Database,
    [switch]$ListOnly
  )

  $containerBackup = "/tmp/enlearn-$([IO.Path]::GetRandomFileName()).dump"
  & $DockerExecutable cp $Destination "${Container}:$containerBackup"
  if ($LASTEXITCODE -ne 0) {
    throw "Could not copy the backup into Docker container $Container."
  }

  try {
    if ($ListOnly) {
      $restoreArguments = @('exec', '-e', "PGPASSWORD=$Password", $Container, 'pg_restore')
      $restoreArguments += @('--list', $containerBackup)
      & $DockerExecutable @restoreArguments
    } else {
      $restoreArguments = @(
        'exec',
        '-e', "PGPASSWORD=$Password",
        $Container,
        'pg_restore',
        '--exit-on-error',
        '--single-transaction',
        '--no-password',
        '--host', $HostName,
        '--port', [string]$Port,
        '--username', $User,
        '--dbname', $Database,
        $containerBackup
      )
      & $DockerExecutable @restoreArguments
    }

    if ($LASTEXITCODE -ne 0) {
      throw "Docker PostgreSQL restore client failed with exit code $LASTEXITCODE."
    }
  } finally {
    & $DockerExecutable exec $Container rm -f $containerBackup 2>$null
  }
}

function Quote-SqlIdentifier {
  param([Parameter(Mandatory)] [string]$Value)
  return '"' + $Value.Replace('"', '""') + '"'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$resolvedEnvFile = $LocalEnvFile
if (-not [IO.Path]::IsPathRooted($resolvedEnvFile)) {
  $resolvedEnvFile = Join-Path $projectRoot $resolvedEnvFile
}

$resolvedBackupDirectory = $BackupDirectory
if (-not [IO.Path]::IsPathRooted($resolvedBackupDirectory)) {
  $resolvedBackupDirectory = Join-Path $projectRoot $resolvedBackupDirectory
}

$localUrl = Get-DotEnvValue -Path $resolvedEnvFile -Names @('DIRECT_URL', 'DATABASE_URL')
$local = ConvertFrom-PostgresUrl -Url $localUrl
if ([string]::IsNullOrWhiteSpace($local.Database)) {
  throw 'The local PostgreSQL URL does not include a database name.'
}

$pgDump = (Get-Command pg_dump -ErrorAction Stop).Source
$pgRestore = (Get-Command pg_restore -ErrorAction Stop).Source
$psql = (Get-Command psql -ErrorAction Stop).Source
$useDockerClient = $false
$dockerExecutable = ''

New-Item -ItemType Directory -Path $resolvedBackupDirectory -Force | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$safeDatabaseName = $local.Database -replace '[^A-Za-z0-9_.-]', '_'
$backupPath = Join-Path $resolvedBackupDirectory "$safeDatabaseName-$timestamp.dump"

Write-Host "Local source:  $($local.User)@$($local.Host):$($local.Port)/$($local.Database)" -ForegroundColor Cyan
Write-Host "Remote target: $RemoteUser@${RemoteHostName}:$RemotePort/$RemoteDatabase" -ForegroundColor Yellow
Write-Host "Backup file:   $backupPath"

Write-Host 'Creating local database backup...' -ForegroundColor Cyan
$nativeClientMajor = Get-MajorVersion -VersionOutput (& $pgDump --version)
$oldLocalPasswordEntry = Get-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
try {
  $env:PGPASSWORD = $local.Password
  $serverVersionText = (& $psql --no-password --host $local.Host --port $local.Port --username $local.User --dbname $local.Database --tuples-only --no-align --command 'SHOW server_version;') -join ' '
  if ($LASTEXITCODE -ne 0) {
    throw "Could not query the local PostgreSQL server version (exit code $LASTEXITCODE)."
  }
} finally {
  if ($null -ne $oldLocalPasswordEntry) {
    $env:PGPASSWORD = $oldLocalPasswordEntry.Value
  } else {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}
$serverMajor = Get-MajorVersion -VersionOutput "PostgreSQL) $serverVersionText"

if ($nativeClientMajor -eq $serverMajor) {
  try {
    Invoke-PostgresTool -Executable $pgDump -Password $local.Password -Arguments @(
      '--format=custom',
      '--compress=6',
      '--no-password',
      '--host', $local.Host,
      '--port', [string]$local.Port,
      '--username', $local.User,
      '--dbname', $local.Database,
      '--file', $backupPath
    )
  } catch {
    if (Test-Path -LiteralPath $backupPath) { Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue }
    throw
  }
} else {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if ($null -eq $docker) {
    throw "Local PostgreSQL server is major version $serverMajor, but pg_dump is major version $nativeClientMajor. Install a matching PostgreSQL client or Docker PostgreSQL image before retrying."
  }

  if ([string]::IsNullOrWhiteSpace($ClientContainer)) {
    $ClientContainer = (& $docker.Source ps --filter "publish=$($local.Port)" --format '{{.ID}}' | Select-Object -First 1).Trim()
  }
  if ([string]::IsNullOrWhiteSpace($ClientContainer)) {
    throw "Local PostgreSQL server is major version $serverMajor, but pg_dump is major version $nativeClientMajor, and no Docker container was found for port $($local.Port). Pass -ClientContainer or install a matching PostgreSQL client."
  }

  Write-Host "Using PostgreSQL client from Docker container $ClientContainer (server major $serverMajor)." -ForegroundColor Yellow
  $useDockerClient = $true
  $dockerExecutable = $docker.Source
  try {
    Invoke-DockerLocalPgDump -DockerExecutable $dockerExecutable -Container $ClientContainer -Connection $local -Destination $backupPath -Password $local.Password
  } catch {
    if (Test-Path -LiteralPath $backupPath) { Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue }
    throw
  }
}

if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf) -or (Get-Item -LiteralPath $backupPath).Length -eq 0) {
  throw "Backup was not created correctly: $backupPath"
}

Write-Host 'Validating backup archive...' -ForegroundColor Cyan
if ($useDockerClient) {
  Invoke-DockerPgRestore -DockerExecutable $dockerExecutable -Container $ClientContainer -Destination $backupPath -Password $local.Password -ListOnly | Out-Null
} else {
  & $pgRestore --list $backupPath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Backup validation failed: $backupPath"
  }
}

if ($BackupOnly) {
  Write-Host ''
  Write-Host 'Local backup completed successfully; remote database was not changed.' -ForegroundColor Green
  Write-Host "Backup retained at: $backupPath" -ForegroundColor Green
  exit 0
}

$remotePassword = $env:REMOTE_PGPASSWORD
if ([string]::IsNullOrEmpty($remotePassword)) {
  $securePassword = Read-Host 'Remote PostgreSQL password' -AsSecureString
  $remotePassword = ConvertFrom-SecurePassword -SecurePassword $securePassword
}
if ([string]::IsNullOrEmpty($remotePassword)) {
  throw 'The remote PostgreSQL password cannot be empty.'
}

if ([string]::IsNullOrWhiteSpace($RemoteAdminUser)) {
  $RemoteAdminUser = $RemoteUser
}

$remoteBaseArgs = @(
  '--no-psqlrc',
  '--no-password',
  '--host', $RemoteHostName,
  '--port', [string]$RemotePort,
  '--username', $RemoteAdminUser
)

Write-Host 'Checking remote PostgreSQL connection...' -ForegroundColor Cyan
Invoke-PostgresTool -Executable $psql -Password $remotePassword -Arguments ($remoteBaseArgs + @(
  '--dbname', 'template1',
  '--set', 'ON_ERROR_STOP=1',
  '--tuples-only',
  '--command', 'SELECT version();'
))

$isSuperuser = (Invoke-PostgresTool -Executable $psql -Password $remotePassword -Arguments ($remoteBaseArgs + @(
  '--dbname', 'template1', '--set', 'ON_ERROR_STOP=1',
  '--tuples-only', '--no-align', '--command', "SELECT rolsuper FROM pg_roles WHERE rolname=current_user;"
))) -join ''
if ($isSuperuser.Trim() -ne 't' -and $RemoteAdminUser -eq 'postgres') {
  Write-Host 'Trying Supabase superuser with the supplied password...' -ForegroundColor Cyan
  $RemoteAdminUser = 'supabase_admin'
  $remoteBaseArgs[$remoteBaseArgs.Length - 1] = $RemoteAdminUser
  $isSuperuser = (Invoke-PostgresTool -Executable $psql -Password $remotePassword -Arguments ($remoteBaseArgs + @(
    '--dbname', 'template1', '--set', 'ON_ERROR_STOP=1',
    '--tuples-only', '--no-align', '--command', "SELECT rolsuper FROM pg_roles WHERE rolname=current_user;"
  ))) -join ''
}
if ($isSuperuser.Trim() -ne 't') {
  throw 'Full restore requires a PostgreSQL superuser. No remote database was changed. Use -RemoteAdminUser and a suitable REMOTE_PGPASSWORD.'
}
Write-Host "Restoring with superuser: $RemoteAdminUser" -ForegroundColor Cyan

$confirmation = "OVERWRITE ${RemoteHostName}:$RemotePort/$RemoteDatabase"
if (-not $Force) {
  Write-Host ''
  Write-Host 'WARNING: The remote database will be deleted and cannot be recovered by this script.' -ForegroundColor Red
  $answer = Read-Host "Type exactly [$confirmation] to continue"
  if ($answer -cne $confirmation) {
    throw 'Confirmation did not match. The remote database was not changed; the local backup was kept.'
  }
}

$databaseIdentifier = Quote-SqlIdentifier -Value $RemoteDatabase
$ownerIdentifier = Quote-SqlIdentifier -Value $RemoteUser

Write-Host 'Dropping the remote database...' -ForegroundColor Yellow
Invoke-PostgresTool -Executable $psql -Password $remotePassword -Arguments ($remoteBaseArgs + @(
  '--dbname', 'template1',
  '--set', 'ON_ERROR_STOP=1',
  '--command', "DROP DATABASE IF EXISTS $databaseIdentifier WITH (FORCE);"
))

Write-Host 'Recreating the remote database...' -ForegroundColor Yellow
Invoke-PostgresTool -Executable $psql -Password $remotePassword -Arguments ($remoteBaseArgs + @(
  '--dbname', 'template1',
  '--set', 'ON_ERROR_STOP=1',
  '--command', "CREATE DATABASE $databaseIdentifier WITH OWNER = $ownerIdentifier TEMPLATE = template0;"
))

Write-Host 'Restoring the local backup to the remote database...' -ForegroundColor Cyan
if ($useDockerClient) {
  Invoke-DockerPgRestore -DockerExecutable $dockerExecutable -Container $ClientContainer -Destination $backupPath -Password $remotePassword -HostName $RemoteHostName -Port $RemotePort -User $RemoteAdminUser -Database $RemoteDatabase
} else {
  Invoke-PostgresTool -Executable $pgRestore -Password $remotePassword -Arguments @(
    '--exit-on-error',
    '--single-transaction',
    '--no-password',
    '--host', $RemoteHostName,
    '--port', [string]$RemotePort,
    '--username', $RemoteAdminUser,
    '--dbname', $RemoteDatabase,
    $backupPath
  )
}

$countSql = "SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast';"
Write-Host 'Verifying restored user table count...' -ForegroundColor Cyan
Invoke-PostgresTool -Executable $psql -Password $remotePassword -Arguments ($remoteBaseArgs + @(
  '--dbname', $RemoteDatabase,
  '--set', 'ON_ERROR_STOP=1',
  '--tuples-only',
  '--command', $countSql
))

Write-Host ''
Write-Host 'Remote database replacement completed successfully.' -ForegroundColor Green
Write-Host "Local backup retained at: $backupPath" -ForegroundColor Green
