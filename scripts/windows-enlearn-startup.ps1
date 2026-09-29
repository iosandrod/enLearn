[CmdletBinding()]
param(
  [string]$Distro = 'Ubuntu-22.04'
)

$ErrorActionPreference = 'Continue'
$WindowsProjectRoot = 'C:\project\enLearn'
$AllInOneScript = Join-Path $WindowsProjectRoot 'scripts\repair-remote-wsl-web.ps1'
$LogDirectory = Join-Path $WindowsProjectRoot '.codex-server-logs'
$LogPath = Join-Path $LogDirectory 'windows-enlearn-startup.log'
$PowerShellPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null

function Write-StartupLog {
  param([string]$Message)
  $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

Write-StartupLog "Starting unified enLearn and Trigger supervisor for $Distro."

while ($true) {
  try {
    & $PowerShellPath -NoProfile -ExecutionPolicy Bypass -File $AllInOneScript
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) {
      Write-StartupLog 'Unified startup completed successfully; keeping the task alive.'
      while ($true) {
        Start-Sleep -Seconds 300
      }
    }
    Write-StartupLog "Unified startup exited with code $exitCode; retrying in 30 seconds."
  } catch {
    Write-StartupLog "Unified startup error: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 30
}
