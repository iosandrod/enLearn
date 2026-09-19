$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'artifacts/douyin-workflow-video'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$ffmpeg = (Get-Command ffmpeg).Source
$font = 'C\:/Windows/Fonts/NotoSansSC-VF.ttf'

$scenes = @(
  @{ Name = '01-hook'; Kind = 'color'; Duration = 4; Bg = '07111f'; Head = '一条流程，自动跑完审批闭环'; Sub = 'enLearn · 工厂制造管理平台'; Image = $null },
  @{ Name = '02-design'; Kind = 'image'; Duration = 5; Bg = '07111f'; Head = '① 拖拽节点，搭好业务流程'; Sub = '条件分支 · 多人审批 · 自动同步'; Image = (Join-Path $root 'artifacts/trigger-workflow-canvas-tools.png') },
  @{ Name = '03-submit'; Kind = 'image'; Duration = 5; Bg = '07111f'; Head = '② 一键发起，状态实时可见'; Sub = '审批实例 · 当前节点 · 流程进度'; Image = (Join-Path $root 'artifacts/approval-console-desktop.png') },
  @{ Name = '04-task'; Kind = 'image'; Duration = 5; Bg = '07111f'; Head = '③ 待办任务，集中处理'; Sub = '统一工作台 · 快速定位 · 及时执行'; Image = (Join-Path $root 'artifacts/task-console-desktop.png') },
  @{ Name = '05-monitor'; Kind = 'image'; Duration = 5; Bg = '07111f'; Head = '④ 全链路监控，结果可追踪'; Sub = '运行状态 · 节点详情 · 异常可定位'; Image = (Join-Path $root 'artifacts/workflow-runtime-monitor-page.png') },
  @{ Name = '06-cta'; Kind = 'color'; Duration = 6; Bg = '0b6e69'; Head = '让每一次协同都有迹可循'; Sub = '私信“流程” · 预约系统演示'; Image = $null }
)

function Quote-Ff($value) {
  return $value.Replace(':', '\:').Replace("'", "\'")
}

$files = @()
foreach ($scene in $scenes) {
  $target = Join-Path $outDir ($scene.Name + '.mp4')
  $head = Quote-Ff $scene.Head
  $sub = Quote-Ff $scene.Sub
  $common = "drawtext=fontfile='${font}':text='enLearn  /  WORKFLOW':fontcolor=white@0.92:fontsize=34:x=70:y=90,drawtext=fontfile='${font}':text='$head':fontcolor=white:fontsize=62:line_spacing=16:x=70:y=170,drawtext=fontfile='${font}':text='$sub':fontcolor=white@0.76:fontsize=30:x=70:y=340,drawbox=x=70:y=315:w=110:h=6:color=19d3c5@0.95:t=fill,drawtext=fontfile='${font}':text='流程协同 · 数据驱动 · 结果透明':fontcolor=white@0.58:fontsize=24:x=70:y=1810"
  if ($scene.Kind -eq 'image') {
    $filter = "scale=1000:-1:force_original_aspect_ratio=decrease,pad=1080:1320:(ow-iw)/2:430:color=$($scene.Bg),$common,fade=t=in:st=0:d=0.35,fade=t=out:st=$($scene.Duration - 0.45):d=0.45"
    & $ffmpeg -y -loop 1 -i $scene.Image -t $scene.Duration -vf $filter -r 30 -pix_fmt yuv420p -an $target | Out-Null
  } else {
    $filter = "color=c=$($scene.Bg):s=1080x1920:r=30,$common,fade=t=in:st=0:d=0.35,fade=t=out:st=$($scene.Duration - 0.45):d=0.45"
    & $ffmpeg -y -f lavfi -i $filter -t $scene.Duration -r 30 -pix_fmt yuv420p -an $target | Out-Null
  }
  if ($LASTEXITCODE -ne 0) { throw "FFmpeg failed while creating $target" }
  $files += $target
}

$concat = Join-Path $outDir 'concat.txt'
($files | ForEach-Object { "file '$($_.Replace("'", "'\\''"))'" }) | Set-Content -Encoding ascii $concat
$final = Join-Path $root 'artifacts/douyin-workflow-demo.mp4'
& $ffmpeg -y -f concat -safe 0 -i $concat -c copy -movflags +faststart $final | Out-Null
if ($LASTEXITCODE -ne 0) { throw "FFmpeg failed while creating $final" }

Write-Output "Created: $final"
Write-Output "Duration: 30 seconds, 1080x1920, silent master"
