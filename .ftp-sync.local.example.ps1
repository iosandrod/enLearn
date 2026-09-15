# Copy this file to .ftp-sync.local.ps1 (already ignored by Git), then edit it.
# Prefer ENLEARN_FTP_PASSWORD over storing Password in this file.
$FtpSyncConfig = @{
  Protocol   = 'Ftps'       # Ftps or Ftp
  Host       = '117.72.155.0'
  Port       = 21
  User       = 'administrator'
  RemoteRoot = '/enlearn'
  UsePassive = $true
}
