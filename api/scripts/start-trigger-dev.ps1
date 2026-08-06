param(
  [string]$ApiUrl = "http://localhost:3030",
  [string]$EnvFile = "",
  [int]$MaxConcurrentRuns = 1000000
)

$ErrorActionPreference = "Stop"

function Info($Message) {
  Write-Host "[enLearn-trigger] $Message"
}

function Read-DotEnv([string]$Path) {
  $result = @{}
  if (!(Test-Path -LiteralPath $Path)) { return $result }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (!$trimmed -or $trimmed.StartsWith("#") -or !$trimmed.Contains("=")) { continue }
    $index = $trimmed.IndexOf("=")
    $key = $trimmed.Substring(0, $index).Trim()
    $value = $trimmed.Substring($index + 1).Trim() -replace '^["'']|["'']$', ''
    $result[$key] = $value
  }
  return $result
}

function Write-WorkerEnv([string]$SourceEnvFile, [string]$TargetEnvFile, [string]$ProjectRef) {
  $lines = @()
  if (Test-Path -LiteralPath $SourceEnvFile) {
    $lines = @(Get-Content -LiteralPath $SourceEnvFile | Where-Object {
      $_ -notmatch '^\s*TRIGGER_(PROJECT_REF|SECRET_KEY|ACCESS_TOKEN)\s*='
    })
  }
  $lines += "TRIGGER_PROJECT_REF=$ProjectRef"
  Set-Content -LiteralPath $TargetEnvFile -Value $lines -Encoding UTF8
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

$sourceEnv = Read-DotEnv $EnvFile
$triggerEnvFile = $sourceEnv["TRIGGER_ENV_FILE"]
if ([string]::IsNullOrWhiteSpace($triggerEnvFile)) {
  $triggerEnvFile = Join-Path $repoRoot "..\trigger.dev-main\.env"
} elseif (![System.IO.Path]::IsPathRooted($triggerEnvFile)) {
  $triggerEnvFile = Join-Path $repoRoot $triggerEnvFile
}
if (!(Test-Path -LiteralPath $triggerEnvFile)) {
  throw "Unable to locate the Trigger.dev env file: $triggerEnvFile"
}

$triggerEnv = Read-DotEnv $triggerEnvFile
$projectName = $sourceEnv["TRIGGER_PROJECT_NAME"]
if ([string]::IsNullOrWhiteSpace($projectName)) { $projectName = "enlearn-workflow-local" }
$projectRef = $sourceEnv["TRIGGER_PROJECT_REF"]
if ([string]::IsNullOrWhiteSpace($projectRef)) { $projectRef = $triggerEnv["TRIGGER_PROJECT_REF"] }
$secretKey = $sourceEnv["TRIGGER_SECRET_KEY"]
if ([string]::IsNullOrWhiteSpace($secretKey)) { $secretKey = $triggerEnv["TRIGGER_SECRET_KEY"] }
$accessToken = $sourceEnv["TRIGGER_ACCESS_TOKEN"]
if ([string]::IsNullOrWhiteSpace($accessToken)) { $accessToken = $triggerEnv["TRIGGER_ACCESS_TOKEN"] }
if ([string]::IsNullOrWhiteSpace($projectRef) -or [string]::IsNullOrWhiteSpace($secretKey)) {
  throw "TRIGGER_PROJECT_REF and TRIGGER_SECRET_KEY are required in $EnvFile or $triggerEnvFile"
}
if ([string]::IsNullOrWhiteSpace($accessToken)) {
  throw "TRIGGER_ACCESS_TOKEN is required by the Trigger.dev CLI in $EnvFile or $triggerEnvFile"
}

$env:TRIGGER_PROJECT_NAME = $projectName
$env:TRIGGER_API_URL = $ApiUrl

$workerEnvFile = Join-Path $apiDir ".trigger.worker.env"
Write-WorkerEnv -SourceEnvFile $EnvFile -TargetEnvFile $workerEnvFile -ProjectRef $projectRef.Trim()
$env:TRIGGER_ACCESS_TOKEN = $accessToken

Info "Starting Trigger.dev worker: $ApiUrl"
try {
  & $triggerCli dev start -a $ApiUrl --env-file $workerEnvFile --max-concurrent-runs $MaxConcurrentRuns
} finally {
  Remove-Item Env:TRIGGER_ACCESS_TOKEN -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $workerEnvFile -Force -ErrorAction SilentlyContinue
}
