param(
  [string]$ApiUrl = "http://localhost:8030",
  [string]$OrgSlug = "enlearn-792d",
  [string]$ProjectName = "enlearn-workflow-local",
  [string]$EnvName = "dev",
  [string]$Profile = "default",
  [string]$EnvFile = ".env",
  [int]$WaitSeconds = 120,
  [switch]$EngineOnly
)

$ErrorActionPreference = "Stop"

function Mask-Secret([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  if ($Value.Length -le 12) { return "***" }
  return "$($Value.Substring(0, 8))...$($Value.Substring($Value.Length - 4))"
}

function Normalize-Url([string]$Value) {
  return ($Value.TrimEnd("/"))
}

function Read-DotEnv([string]$Path) {
  $result = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $result }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) { continue }

    $index = $trimmed.IndexOf("=")
    $key = $trimmed.Substring(0, $index).Trim()
    $value = $trimmed.Substring($index + 1).Trim()
    $value = $value -replace '^[ "'']+|[ "'']+$', ''
    $result[$key] = $value
  }

  return $result
}

function Set-DotEnvValue([string]$Path, [string]$Key, [string]$Value) {
  $lines = @()
  if (Test-Path -LiteralPath $Path) {
    $lines = @(Get-Content -LiteralPath $Path)
  }

  $pattern = "^\s*$([regex]::Escape($Key))\s*="
  $updated = $false
  $next = foreach ($line in $lines) {
    if ($line -match $pattern) {
      $updated = $true
      "$Key=$Value"
    } else {
      $line
    }
  }

  if (-not $updated) {
    $next += "$Key=$Value"
  }

  Set-Content -LiteralPath $Path -Value $next -Encoding UTF8
}

function Invoke-TriggerApi(
  [string]$Method,
  [string]$Path,
  [string]$Token,
  [object]$Body = $null
) {
  $headers = @{
    Authorization = "Bearer $Token"
    "Content-Type" = "application/json"
  }

  $uri = "$(Normalize-Url $ApiUrl)$Path"
  $params = @{
    Method = $Method
    Uri = $uri
    Headers = $headers
    TimeoutSec = 30
  }

  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 20)
  }

  return Invoke-RestMethod @params
}

function Test-TriggerToken([string]$Token) {
  if ([string]::IsNullOrWhiteSpace($Token) -or -not $Token.StartsWith("tr_pat_")) {
    return $false
  }

  try {
    Invoke-TriggerApi -Method "GET" -Path "/api/v2/whoami" -Token $Token | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Read-TriggerCliToken([string]$ExpectedApiUrl, [string]$ProfileName) {
  $candidates = @(
    (Join-Path $env:APPDATA "xdg.config\trigger\config.json"),
    (Join-Path $env:APPDATA "trigger\config.json"),
    (Join-Path $HOME ".config\trigger\config.json")
  )

  foreach ($path in $candidates) {
    if (-not (Test-Path -LiteralPath $path)) { continue }

    try {
      $config = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
      $profileSettings = $config.profiles.$ProfileName
      if ($null -eq $profileSettings -and $ProfileName -eq "default" -and $config.currentProfile) {
        $profileSettings = $config.profiles.($config.currentProfile)
      }
      if ($null -eq $profileSettings) { continue }

      $sameApi = (Normalize-Url $profileSettings.apiUrl) -eq (Normalize-Url $ExpectedApiUrl)
      if ($sameApi -and $profileSettings.accessToken) {
        return $profileSettings.accessToken
      }
    } catch {
      continue
    }
  }

  return $null
}

function Resolve-ProjectList([object]$Response) {
  if ($Response -is [array]) { return @($Response) }
  if ($Response.projects) { return @($Response.projects) }
  if ($Response.data -and $Response.data.projects) { return @($Response.data.projects) }
  if ($Response.data -is [array]) { return @($Response.data) }
  return @()
}

function Wait-TriggerDev() {
  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  $healthUrl = "$(Normalize-Url $ApiUrl)/healthcheck"

  Write-Host "Waiting for Trigger.dev at $healthUrl ..."
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -eq 200) {
        Write-Host "Trigger.dev is healthy."
        return
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  throw "Timed out waiting for Trigger.dev. Start it with: pnpm triggerdev:up"
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

if (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile = Join-Path $repoRoot $EnvFile
}

Wait-TriggerDev

$envMap = Read-DotEnv $EnvFile

if ($EngineOnly) {
  if ([string]::IsNullOrWhiteSpace($envMap["TRIGGER_PROJECT_REF"])) {
    throw "EngineOnly requires TRIGGER_PROJECT_REF in $EnvFile."
  }
  if ([string]::IsNullOrWhiteSpace($envMap["TRIGGER_SECRET_KEY"])) {
    throw "EngineOnly requires TRIGGER_SECRET_KEY in $EnvFile."
  }

  Set-DotEnvValue -Path $EnvFile -Key "TRIGGER_API_URL" -Value (Normalize-Url $ApiUrl)
  Write-Host ""
  Write-Host "Trigger.dev engine-only mode is ready."
  Write-Host "TRIGGER_API_URL=$(Normalize-Url $ApiUrl)"
  Write-Host "TRIGGER_PROJECT_REF=$($envMap["TRIGGER_PROJECT_REF"])"
  Write-Host "TRIGGER_SECRET_KEY=$(Mask-Secret $envMap["TRIGGER_SECRET_KEY"])"
  Write-Host "TRIGGER_ACCESS_TOKEN is not required by the backend runtime."
  exit 0
}

$accessToken = $env:TRIGGER_ACCESS_TOKEN
if (-not (Test-TriggerToken $accessToken)) {
  $accessToken = $envMap["TRIGGER_ACCESS_TOKEN"]
}
if (-not (Test-TriggerToken $accessToken)) {
  $accessToken = Read-TriggerCliToken -ExpectedApiUrl $ApiUrl -ProfileName $Profile
}

if (-not (Test-TriggerToken $accessToken)) {
  Write-Host "No valid Trigger.dev personal access token found."
  Write-Host "Starting Trigger.dev CLI login. Complete the printed login URL, then this script will continue."
  pnpm --dir services/workflow-api exec trigger login -a $ApiUrl --no-browser --profile $Profile
  if ($LASTEXITCODE -ne 0) {
    throw "Trigger.dev CLI login failed."
  }
  $accessToken = Read-TriggerCliToken -ExpectedApiUrl $ApiUrl -ProfileName $Profile
}

if (-not (Test-TriggerToken $accessToken)) {
  throw "Unable to resolve a valid TRIGGER_ACCESS_TOKEN."
}

$projectRef = $envMap["TRIGGER_PROJECT_REF"]
$projectEnv = $null

if ($projectRef) {
  try {
    $projectEnv = Invoke-TriggerApi -Method "GET" -Path "/api/v1/projects/$projectRef/$EnvName" -Token $accessToken
    Write-Host "Reusing existing Trigger.dev project $projectRef."
  } catch {
    Write-Host "Existing TRIGGER_PROJECT_REF is not usable. A new project will be resolved."
    $projectRef = $null
    $projectEnv = $null
  }
}

if (-not $projectRef) {
  $projects = @()
  try {
    $projects = Resolve-ProjectList (Invoke-TriggerApi -Method "GET" -Path "/api/v1/projects" -Token $accessToken)
  } catch {
    $projects = @()
  }

  $existingProject = $projects | Where-Object { $_.name -eq $ProjectName } | Select-Object -First 1
  if ($existingProject) {
    $projectRef = $existingProject.externalRef
    Write-Host "Found existing Trigger.dev project $projectRef."
  } else {
    Write-Host "Creating Trigger.dev project '$ProjectName' in org '$OrgSlug' ..."
    $createdProject = Invoke-TriggerApi -Method "POST" -Path "/api/v1/orgs/$OrgSlug/projects" -Token $accessToken -Body @{ name = $ProjectName }
    $projectRef = $createdProject.externalRef
    if (-not $projectRef) {
      throw "Trigger.dev project creation did not return externalRef."
    }
    Write-Host "Created Trigger.dev project $projectRef."
  }

  $projectEnv = Invoke-TriggerApi -Method "GET" -Path "/api/v1/projects/$projectRef/$EnvName" -Token $accessToken
}

$secretKey = $projectEnv.apiKey
if (-not $secretKey) {
  throw "Trigger.dev env '$EnvName' did not return apiKey."
}

Set-DotEnvValue -Path $EnvFile -Key "TRIGGER_API_URL" -Value (Normalize-Url $ApiUrl)
Set-DotEnvValue -Path $EnvFile -Key "TRIGGER_PROJECT_REF" -Value $projectRef
Set-DotEnvValue -Path $EnvFile -Key "TRIGGER_SECRET_KEY" -Value $secretKey
Set-DotEnvValue -Path $EnvFile -Key "TRIGGER_ACCESS_TOKEN" -Value $accessToken

Write-Host ""
Write-Host "Trigger.dev env values have been written to $EnvFile"
Write-Host "TRIGGER_API_URL=$(Normalize-Url $ApiUrl)"
Write-Host "TRIGGER_PROJECT_REF=$projectRef"
Write-Host "TRIGGER_SECRET_KEY=$(Mask-Secret $secretKey)"
Write-Host "TRIGGER_ACCESS_TOKEN=$(Mask-Secret $accessToken)"
