Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$pkgPath = Join-Path $repoRoot "package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$versionText = if ($pkg.version -eq "1.0.0") { "v1.0" } else { "v$($pkg.version)" }

$indexHtmlPath = Join-Path $repoRoot "src\renderer\index.html"
if (Test-Path $indexHtmlPath) {
  $html = [System.IO.File]::ReadAllText($indexHtmlPath, [System.Text.Encoding]::UTF8)
  $html = [regex]::Replace($html, 'v[0-9]+(\.[0-9]+)*', $versionText)
  [System.IO.File]::WriteAllText($indexHtmlPath, $html, (New-Object System.Text.UTF8Encoding $false))
}

$sidebarFiles = @(
  (Join-Path $PSScriptRoot "installerSidebar.bmp"),
  (Join-Path $PSScriptRoot "uninstallerSidebar.bmp")
)

foreach ($filePath in $sidebarFiles) {
  if (-not (Test-Path $filePath)) { continue }

  $srcImg = [System.Drawing.Image]::FromFile($filePath)
  $bmp = New-Object System.Drawing.Bitmap($srcImg.Width, $srcImg.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($srcImg, 0, 0, $srcImg.Width, $srcImg.Height)
  $srcImg.Dispose()

  # Clear existing version text inside the pill (x=55..109, y=145..158)
  $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(76, 75, 73))
  $g.FillRectangle($bgBrush, 55, 145, 54, 14)

  # Draw new version string centered inside the pill
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $font = New-Object System.Drawing.Font("Consolas", 8.5, [System.Drawing.FontStyle]::Bold)
  $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 181, 38))
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF(48, 143, 68, 18)
  $g.DrawString($versionText, $font, $textBrush, $rect, $sf)

  $sf.Dispose()
  $textBrush.Dispose()
  $font.Dispose()
  $bgBrush.Dispose()
  $g.Dispose()

  $bmp.Save($filePath, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bmp.Dispose()
  Write-Host "Updated installer sidebar BMP with version $versionText : $filePath"
}
