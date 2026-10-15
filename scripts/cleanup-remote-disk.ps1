[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$Distro = 'Ubuntu-22.04',
  [switch]$CompactVhdx,
  [switch]$SkipServiceCheck
)

$ErrorActionPreference = 'Stop'

function Get-WslPath {
  $paths = @(
    (Join-Path ${env:ProgramFiles} 'WSL\wsl.exe'),
    (Join-Path $env:WINDIR 'System32\wsl.exe')
  )
  foreach ($path in $paths) {
    if (Test-Path -LiteralPath $path) { return $path }
  }
  throw '找不到 wsl.exe。'
}

function Invoke-WslRoot {
  param([Parameter(Mandatory)][string]$Command)
  & $script:WslPath -d $Distro -u root -e bash -lc $Command
  if ($LASTEXITCODE -ne 0) {
    throw "WSL 命令失败，退出码 $LASTEXITCODE：$Command"
  }
}

function Get-Gb([long]$Bytes) {
  return [math]::Round($Bytes / 1GB, 2)
}

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw '使用 -CompactVhdx 时必须以管理员身份运行 PowerShell。'
  }
}

function Get-VhdxPath {
  $key = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Lxss'
  foreach ($entry in Get-ChildItem -LiteralPath $key) {
    $item = Get-ItemProperty -LiteralPath $entry.PSPath
    if ($item.DistributionName -eq $Distro -and $item.BasePath) {
      $name = if ($item.VhdFileName) { $item.VhdFileName } else { 'ext4.vhdx' }
      $path = Join-Path $item.BasePath $name
      if (Test-Path -LiteralPath $path) { return (Get-Item -LiteralPath $path).FullName }
    }
  }
  throw "找不到 $Distro 的 ext4.vhdx。"
}

$script:WslPath = Get-WslPath
$beforeC = (Get-PSDrive -Name C).Free

Write-Host '=== 清理前 ===' -ForegroundColor Cyan
Write-Host ("C 盘可用空间：{0} GB" -f (Get-Gb $beforeC))
Invoke-WslRoot 'df -h /; docker system df'

Write-Host '=== 清理 Docker 构建缓存和无用对象 ===' -ForegroundColor Cyan
# 明确不带 --volumes，避免误删 Supabase 数据卷。
Invoke-WslRoot 'docker builder prune -af || true'
Invoke-WslRoot 'docker image prune -af || true'
Invoke-WslRoot 'docker container prune -f || true'
Invoke-WslRoot 'docker network prune -f || true'

# 只清空日志，不删除容器。日志文件可能因多次编译/运行持续增长。
Invoke-WslRoot 'root="$(docker info --format "{{.DockerRootDir}}" 2>/dev/null || echo /var/lib/docker)"; find "$root/containers" -name "*-json.log" -type f -size +50M -exec truncate -s 0 {} \; 2>/dev/null || true'
Invoke-WslRoot 'apt-get clean 2>/dev/null || true; sync; fstrim -av 2>/dev/null || true'

if (-not $SkipServiceCheck) {
  Write-Host '=== 服务检查 ===' -ForegroundColor Cyan
  Invoke-WslRoot 'docker ps --format "{{.Names}} {{.Status}}"'
}

if ($CompactVhdx) {
  Assert-Administrator
  $vhdx = Get-VhdxPath
  $beforeVhdx = (Get-Item -LiteralPath $vhdx).Length
  Write-Warning '即将关闭 WSL，enLearn、Supabase 和其他 WSL 服务会短暂中断。'
  Invoke-WslRoot 'sync; fstrim -av 2>/dev/null || true'
  & $script:WslPath --shutdown
  if ($LASTEXITCODE -ne 0) { throw "WSL shutdown 失败，退出码 $LASTEXITCODE" }
  Start-Sleep -Seconds 3

  $diskpart = Join-Path $env:TEMP ("compact-wsl-{0}.txt" -f ([guid]::NewGuid()))
  try {
    @(
      ('select vdisk file="{0}"' -f $vhdx),
      'compact vdisk',
      'exit'
    ) | Out-File -LiteralPath $diskpart -Encoding ASCII
    $output = (& diskpart.exe /s $diskpart 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0 -or $output -notmatch 'successfully compacted|成功压缩') {
      Write-Warning "DiskPart 未能压缩 VHDX：`n$output"
    } else {
      Write-Host 'WSL VHDX 压缩完成。' -ForegroundColor Green
    }
  } finally {
    Remove-Item -LiteralPath $diskpart -Force -ErrorAction SilentlyContinue
  }

  Write-Host '正在重新启动 WSL 服务...' -ForegroundColor Cyan
  & $script:WslPath -d $Distro -e bash -lc 'docker ps >/dev/null'
  Start-Sleep -Seconds 5
  $afterVhdx = (Get-Item -LiteralPath $vhdx).Length
  Write-Host ("VHDX：{0} GB -> {1} GB" -f (Get-Gb $beforeVhdx), (Get-Gb $afterVhdx)) -ForegroundColor Green
}

$afterC = (Get-PSDrive -Name C).Free
Write-Host '=== 清理后 ===' -ForegroundColor Cyan
Write-Host ("C 盘可用空间：{0} GB，变化：{1} GB" -f (Get-Gb $afterC), (Get-Gb ($afterC - $beforeC))) -ForegroundColor Green
if (-not $SkipServiceCheck) { Invoke-WslRoot 'docker ps --format "{{.Names}} {{.Status}}"' }
Write-Host '清理完成：未删除 Docker volumes、项目源码或 Supabase 数据。' -ForegroundColor Green
