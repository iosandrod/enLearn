[CmdletBinding()]
param(
  [ValidateSet('Changed', 'All', 'Path')]
  [string]$Mode = 'Changed',
  [string[]]$Path,
  [ValidateSet('Ftps', 'Ftp')]
  [string]$Protocol,
  [string]$HostName,
  [int]$Port,
  [string]$RemoteRoot,
  [string]$ConfigPath = '.ftp-sync.local.ps1'
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')

function Get-ConfigValue {
  param([hashtable]$Config, [string]$Key, [string]$EnvironmentName, [object]$ParameterValue)
  if ($null -ne $ParameterValue -and "$ParameterValue" -ne '') { return $ParameterValue }
  if ($Config.ContainsKey($Key) -and $null -ne $Config[$Key] -and "$($Config[$Key])" -ne '') { return $Config[$Key] }
  $environmentValue = [Environment]::GetEnvironmentVariable($EnvironmentName)
  if ($null -ne $environmentValue -and $environmentValue -ne '') { return $environmentValue }
  return $null
}

$config = @{}
$configFile = Join-Path (Get-Location) $ConfigPath
if (Test-Path -LiteralPath $configFile) {
  . $configFile
  if ($null -ne $FtpSyncConfig) { $config = $FtpSyncConfig }
}

$resolvedProtocol = Get-ConfigValue $config 'Protocol' 'ENLEARN_FTP_PROTOCOL' $Protocol
if (-not $resolvedProtocol) { $resolvedProtocol = 'Ftps' }
$resolvedHost = Get-ConfigValue $config 'Host' 'ENLEARN_FTP_HOST' $HostName
$resolvedPort = Get-ConfigValue $config 'Port' 'ENLEARN_FTP_PORT' $Port
$resolvedRemoteRoot = Get-ConfigValue $config 'RemoteRoot' 'ENLEARN_FTP_REMOTE_ROOT' $RemoteRoot
$resolvedUser = Get-ConfigValue $config 'User' 'ENLEARN_FTP_USER' $null
$resolvedPassword = Get-ConfigValue $config 'Password' 'ENLEARN_FTP_PASSWORD' $null
$usePassive = Get-ConfigValue $config 'UsePassive' 'ENLEARN_FTP_PASSIVE' $null

if (-not $resolvedHost) { throw 'Missing FTP host. Set ENLEARN_FTP_HOST or configure .ftp-sync.local.ps1.' }
if (-not $resolvedRemoteRoot) { throw 'Missing remote root. Set ENLEARN_FTP_REMOTE_ROOT or configure .ftp-sync.local.ps1.' }
if (-not $resolvedUser) { $resolvedUser = Read-Host 'FTP username' }
if (-not $resolvedPassword) {
  $securePassword = Read-Host 'FTP password' -AsSecureString
  $resolvedPassword = [System.Net.NetworkCredential]::new('', $securePassword).Password
}
if (-not $resolvedPort) { $resolvedPort = 21 }
if ($null -eq $usePassive) { $usePassive = $true }

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
  '(^|[\\/])\.tmp-ai-pgdata([\\/]|$)'
)

function Test-Excluded { param([string]$RelativePath)
  $normalized = $RelativePath -replace '\\', '/'
  foreach ($pattern in $excluded) { if ($normalized -match $pattern) { return $true } }
  return $false
}

function Get-RelativePath { param([string]$FullPath)
  return $FullPath.Substring($root.Length).TrimStart('\\', '/')
}

function Get-FilesToUpload {
  if ($Mode -eq 'Path') {
    if (-not $Path -or $Path.Count -eq 0) { throw '-Mode Path requires -Path.' }
    $candidates = foreach ($entry in $Path) {
      $full = Join-Path $root $entry
      if (-not (Test-Path -LiteralPath $full)) { throw "Path not found: $entry" }
      $item = Get-Item -LiteralPath $full
      if ($item.PSIsContainer) { Get-ChildItem -LiteralPath $full -File -Recurse | ForEach-Object { $_.FullName } }
      else { $item.FullName }
    }
  } elseif ($Mode -eq 'All') {
    $candidates = Get-ChildItem -LiteralPath $root -File -Recurse | ForEach-Object { $_.FullName }
  } else {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw '-Mode Changed requires Git. Use -Mode All or -Mode Path.' }
    $tracked = @(git diff --name-only --diff-filter=ACMRTUXB HEAD)
    $untracked = @(git ls-files --others --exclude-standard)
    $candidates = @($tracked + $untracked) | Where-Object { $_ -and $_.Trim() } | ForEach-Object { Join-Path $root $_ }
  }

  $result = @()
  foreach ($candidate in ($candidates | Sort-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    $fullPath = (Resolve-Path -LiteralPath $candidate).Path
    $relative = Get-RelativePath $fullPath
    if (-not (Test-Excluded $relative)) { $result += [PSCustomObject]@{ FullPath = $fullPath; RelativePath = $relative } }
  }
  return $result
}

function Join-FtpUri { param([string]$RelativePath)
  $segments = @($resolvedRemoteRoot.Trim('/').Split('/') + ($RelativePath -replace '\\', '/').Split('/')) | Where-Object { $_ -ne '' }
  $escaped = $segments | ForEach-Object { [Uri]::EscapeDataString($_) }
  # FtpWebRequest uses ftp:// for both FTP and FTPS; EnableSsl controls TLS.
  return "ftp://${resolvedHost}:$resolvedPort/" + ($escaped -join '/')
}

function Invoke-FtpRequest { param([string]$Uri, [string]$Method, [byte[]]$Body)
  $request = [System.Net.FtpWebRequest]::Create([Uri]$Uri)
  $request.Method = $Method
  $request.Credentials = [System.Net.NetworkCredential]::new($resolvedUser, $resolvedPassword)
  $request.UseBinary = $true; $request.UsePassive = [bool]$usePassive; $request.KeepAlive = $false
  $request.Timeout = 60000; $request.ReadWriteTimeout = 60000; $request.EnableSsl = ($resolvedProtocol -eq 'Ftps')
  if ($Method -eq [System.Net.WebRequestMethods+Ftp]::UploadFile) {
    $request.ContentLength = $Body.Length
    $stream = $request.GetRequestStream()
    try { $stream.Write($Body, 0, $Body.Length) } finally { $stream.Dispose() }
  }
  $response = $request.GetResponse()
  try { return $response.StatusDescription } finally { $response.Dispose() }
}

function Ensure-RemoteDirectory { param([string]$RelativePath)
  $parts = ($RelativePath -replace '\\', '/').Split('/')
  if ($parts.Count -lt 2) { return }
  $current = ''
  for ($index = 0; $index -lt ($parts.Count - 1); $index++) {
    if (-not $parts[$index]) { continue }
    $current = if ($current) { "$current/$($parts[$index])" } else { $parts[$index] }
    try { [void](Invoke-FtpRequest (Join-FtpUri $current) ([System.Net.WebRequestMethods+Ftp]::MakeDirectory) ([byte[]]::new(0))) }
    catch [System.Net.WebException] { }
  }
}

$files = @(Get-FilesToUpload)
if ($files.Count -eq 0) { Write-Host 'No files to upload.'; exit 0 }
Write-Host "Uploading $($files.Count) file(s) via $resolvedProtocol to $resolvedHost..."
$failed = @()
foreach ($file in $files) {
  try {
    Ensure-RemoteDirectory $file.RelativePath
    $body = [IO.File]::ReadAllBytes($file.FullPath)
    [void](Invoke-FtpRequest (Join-FtpUri $file.RelativePath) ([System.Net.WebRequestMethods+Ftp]::UploadFile) $body)
    Write-Host "Uploaded $($file.RelativePath)" -ForegroundColor Green
  } catch {
    $failed += "$($file.RelativePath): $($_.Exception.Message)"
    Write-Warning "Failed $($file.RelativePath): $($_.Exception.Message)"
  }
}
if ($failed.Count -gt 0) { throw "FTP sync failed for $($failed.Count) file(s)." }
Write-Host 'FTP sync completed.' -ForegroundColor Green
