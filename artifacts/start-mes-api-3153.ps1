$ErrorActionPreference = 'Stop'

$env:API_PORT = '3153'
$env:ENLEARN_DEBUG_SUPABASE_FETCH = '1'
$line = Get-Content .env |
  Where-Object { $_ -match '^DIRECT_URL=' } |
  Select-Object -Last 1
$url = [uri](($line -split '=', 2)[1].Trim('"', "'"))
$builder = [System.UriBuilder]$url
$builder.Host = 'db.bzidwylepgsxavvdtvvl.supabase.co'
$builder.UserName = 'postgres'
$env:DIRECT_URL = $builder.Uri.AbsoluteUri
Remove-Item Env:ALL_PROXY, Env:HTTP_PROXY, Env:HTTPS_PROXY -ErrorAction SilentlyContinue

pnpm --dir api exec tsx src/standalone.ts
