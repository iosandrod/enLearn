param([Parameter(Mandatory = $true)][string[]]$Path)

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskMethods = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' }

function Wait-WinRtResult {
  param(
    [Parameter(Mandatory = $true)]$Operation,
    [Parameter(Mandatory = $true)][Type]$ResultType
  )

  $method = $asTaskMethods |
    Where-Object {
      $_.IsGenericMethodDefinition -and
      $_.GetGenericArguments().Count -eq 1 -and
      $_.GetParameters().Count -eq 1
    } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

$engine = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]::TryCreateFromUserProfileLanguages()
foreach ($imagePath in $Path) {
  $resolved = (Resolve-Path -LiteralPath $imagePath).Path
  $file = Wait-WinRtResult (
    [Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime]::GetFileFromPathAsync($resolved)
  ) ([Windows.Storage.StorageFile])
  $stream = Wait-WinRtResult ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) (
    [Windows.Storage.Streams.IRandomAccessStreamWithContentType]
  )
  $decoder = Wait-WinRtResult (
    [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]::CreateAsync($stream)
  ) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Wait-WinRtResult ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Wait-WinRtResult ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  Write-Output "[$resolved]"
  Write-Output $result.Text
  $stream.Dispose()
}
