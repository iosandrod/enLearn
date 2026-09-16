[CmdletBinding()]
param(
  [ValidateSet('Deploy', 'All', 'Path')]
  [string]$Mode = 'Deploy',
  [string[]]$Path,
  [string]$HostName = '117.72.155.0',
  [int]$Port = 22,
  [string]$User = 'administrator',
  [string]$RemoteRoot = 'enlearn',
  [string]$ConfigPath = '.ftp-sync.local.ps1'
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')

if (-not (Get-Command sftp -ErrorAction SilentlyContinue)) {
  throw 'OpenSSH sftp.exe is not available. Install OpenSSH Client on this machine.'
}

$configFile = Join-Path (Get-Location) $ConfigPath
if (Test-Path -LiteralPath $configFile) {
  . $configFile
  if ($null -ne $FtpSyncConfig) {
    if ($FtpSyncConfig.Host) { $HostName = $FtpSyncConfig.Host }
    if ($FtpSyncConfig.Port) { $Port = [int]$FtpSyncConfig.Port }
    if ($FtpSyncConfig.User) { $User = $FtpSyncConfig.User }
    if ($FtpSyncConfig.RemoteRoot) { $RemoteRoot = $FtpSyncConfig.RemoteRoot.Trim('/') }
  }
}

$root = (Get-Location).Path
$excluded = @(
  '^\.git([\\/]|$)',
  '(^|[\\/])node_modules([\\/]|$)',
  '(^|[\\/])\.env($|\.)',
  '(^|[\\/])\.ftp-sync\.local\.ps1$',
  '(^|[\\/])dist([\\/]|$)',
  '(^|[\\/])build([\\/]|$)',
  '(^|[\\/])\.codex-server-logs([\\/]|$)',
  '(^|[\\/])\.tmp[-_]',
  '(^|[\\/])\.tmp-ai-pgdata([\\/]|$)',
  '(^|[\\/])coverage([\\/]|$)',
  '(^|[\\/])\.VSCodeCounter([\\/]|$)',
  '(^|[\\/])\.codex-screenshots([\\/]|$)'
)

function Test-Excluded { param([string]$RelativePath)
  $normalized = $RelativePath -replace '\\', '/'
  $segments = $normalized.Split('/')
  $excludedDirectoryNames = @('.git', 'node_modules', 'dist', 'build', '.codex-server-logs', '.codex-screenshots', '.agents', '.VSCodeCounter', '$tmp', '%SystemDrive%', '.tmp-ai-pgdata', 'coverage')
  if ($segments | Where-Object { $excludedDirectoryNames -contains $_ -or $_ -like '.tmp-*' }) { return $true }
  foreach ($pattern in $excluded) { if ($normalized -match $pattern) { return $true } }
  return $false
}

function Get-RelativePath { param([string]$FullPath)
  return $FullPath.Substring($root.Length).TrimStart([char[]]'/\')
}

if ($Mode -eq 'Deploy') {
  $deployRoots = @('api', 'frontend', 'packages', 'cpp-typescript', 'public', 'scripts')
  $rootFiles = @('Dockerfile', 'docker-compose.yml', 'Caddyfile', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.dockerignore')
  $candidates = @()
  foreach ($entry in $deployRoots) {
    $full = Join-Path $root $entry
    if (Test-Path -LiteralPath $full) { $candidates += @(Get-ChildItem -LiteralPath $full -File -Recurse | ForEach-Object FullName) }
  }
  foreach ($entry in $rootFiles) {
    $full = Join-Path $root $entry
    if (Test-Path -LiteralPath $full -PathType Leaf) { $candidates += $full }
  }
} elseif ($Mode -eq 'Path') {
  if (-not $Path -or $Path.Count -eq 0) { throw '-Mode Path requires -Path.' }
  $candidates = foreach ($entry in $Path) {
    $full = Join-Path $root $entry
    if (-not (Test-Path -LiteralPath $full)) { throw "Path not found: $entry" }
    $item = Get-Item -LiteralPath $full
    if ($item.PSIsContainer) { Get-ChildItem -LiteralPath $full -File -Recurse | ForEach-Object FullName }
    else { $item.FullName }
  }
} else {
  $candidates = Get-ChildItem -LiteralPath $root -File -Recurse | ForEach-Object FullName
}

$files = @()
foreach ($candidate in ($candidates | Sort-Object -Unique)) {
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
  $fullPath = (Resolve-Path -LiteralPath $candidate).Path
  $relative = Get-RelativePath $fullPath
  if (-not (Test-Excluded $relative)) {
    $files += [PSCustomObject]@{ FullPath = $fullPath; RelativePath = ($relative -replace '\\', '/') }
  }
}
if ($files.Count -eq 0) { Write-Host 'No files to upload.'; exit 0 }

$totalBytes = [int64]0
foreach ($file in $files) { $totalBytes += (Get-Item -LiteralPath $file.FullPath).Length }

$batchPath = Join-Path ([IO.Path]::GetTempPath()) ("enlearn-sftp-{0}.batch" -f ([Guid]::NewGuid().ToString('N')))
try {
  $commands = [Collections.Generic.List[string]]::new()
  [void]$commands.Add("-mkdir $RemoteRoot")
  $knownDirectories = @{}
  foreach ($file in $files) {
    $segments = $file.RelativePath.Split('/')
    $remoteDirectory = $RemoteRoot
    for ($index = 0; $index -lt ($segments.Count - 1); $index++) {
      $remoteDirectory = "$remoteDirectory/$($segments[$index])"
      if (-not $knownDirectories.ContainsKey($remoteDirectory)) {
        $knownDirectories[$remoteDirectory] = $true
        [void]$commands.Add("-mkdir `"$remoteDirectory`"")
      }
    }
    $remotePath = "$RemoteRoot/$($file.RelativePath)"
    [void]$commands.Add("put `"$($file.FullPath)`" `"$remotePath`"")
  }
  [IO.File]::WriteAllLines($batchPath, $commands, [Text.Encoding]::ASCII)

  $sizeMiB = [math]::Round($totalBytes / 1MB, 2)
  Write-Host "Uploading $($files.Count) file(s), $sizeMiB MiB, via SFTP to $User@$HostName`:$Port/$RemoteRoot ..."
  Write-Host 'Each file displays its own transfer percentage (0%-100%). OpenSSH sftp does not expose an aggregate project percentage.'
  Write-Host 'Enter the server password when prompted.'
  & sftp -o BatchMode=no -o PreferredAuthentications=password -o PubkeyAuthentication=no -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -P $Port -b $batchPath "$User@$HostName"
  if ($LASTEXITCODE -ne 0) { throw "SFTP exited with code $LASTEXITCODE." }
  Write-Host 'SFTP sync completed.' -ForegroundColor Green
} finally {
  Remove-Item -LiteralPath $batchPath -Force -ErrorAction SilentlyContinue
}
