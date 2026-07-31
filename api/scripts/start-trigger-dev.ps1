param(
  [string]$ApiUrl = "http://localhost:3030",
  [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"

function Info($Message) {
  Write-Host "[enLearn-trigger] $Message"
}

function Test-EnLearnTriggerWorkerRunning($RepoRoot) {
  $repoRootPattern = "*$RepoRoot*"

  try {
    $process = Get-CimInstance Win32_Process |
      Where-Object {
        if (!$_.CommandLine -or $_.ProcessId -eq $PID) {
          return $false
        }

        $isEnLearnProcess = $_.CommandLine -like $repoRootPattern
        $isTriggerDevWorker =
          ($_.CommandLine -like "*trigger.dev*dist*esm*index.js*dev*start*") -or
          ($_.CommandLine -like "*trigger.dev*devWatchdog.js*") -or
          ($_.CommandLine -like "*trigger dev start*")

        return $isEnLearnProcess -and $isTriggerDevWorker
      } |
      Select-Object -First 1

    return $null -ne $process
  } catch {
    Info "Process scan failed, continuing to start Trigger.dev worker."
    return $false
  }
}

$apiDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$repoRoot = Resolve-Path (Join-Path $apiDir "..")

if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  if (![string]::IsNullOrWhiteSpace($env:INIT_CWD)) {
    $EnvFile = Join-Path $env:INIT_CWD ".env"
  } else {
    $EnvFile = Join-Path $repoRoot ".env"
  }
}

if (!(Test-Path -LiteralPath $EnvFile)) {
  throw "Missing env file: $EnvFile"
}

if (Test-EnLearnTriggerWorkerRunning $repoRoot) {
  Info "Trigger.dev worker is already running for enLearn. Skip starting another one."
  exit 0
}

$triggerCli = Join-Path $apiDir "node_modules\.bin\trigger.cmd"
if (!(Test-Path -LiteralPath $triggerCli)) {
  $triggerCli = "trigger"
}

Info "Starting Trigger.dev worker: $ApiUrl"
& $triggerCli dev start -a $ApiUrl --env-file $EnvFile
