Add-Type -AssemblyName System.Drawing

$srcPath = "d:\food\mobile_app\assets\icon.png"
$destForegroundPath = "d:\food\mobile_app\assets\icon_adaptive_foreground.png"
$destSplashPath = "d:\food\mobile_app\assets\splash_icon.png"

# Load source image
$srcBmp = [System.Drawing.Image]::FromFile($srcPath)

# 1. Generate icon_adaptive_foreground.png (Safe zone: 260x260 on 512x512 canvas)
$canvasWidth = 512
$canvasHeight = 512
$targetWidth = 260
$targetHeight = 260

$x = ($canvasWidth - $targetWidth) / 2
$y = ($canvasHeight - $targetHeight) / 2

$newBmp = New-Object System.Drawing.Bitmap($canvasWidth, $canvasHeight)
$g = [System.Drawing.Graphics]::FromImage($newBmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($srcBmp, $x, $y, $targetWidth, $targetHeight)

$newBmp.Save($destForegroundPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$newBmp.Dispose()
Write-Host "SUCCESS: Generated icon_adaptive_foreground.png at $destForegroundPath!"

# 2. Generate splash_icon.png (Even smaller: 200x200 on 512x512 canvas)
$targetWidthSplash = 200
$targetHeightSplash = 200

$xSplash = ($canvasWidth - $targetWidthSplash) / 2
$ySplash = ($canvasHeight - $targetHeightSplash) / 2

$newBmpSplash = New-Object System.Drawing.Bitmap($canvasWidth, $canvasHeight)
$gSplash = [System.Drawing.Graphics]::FromImage($newBmpSplash)
$gSplash.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gSplash.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gSplash.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$gSplash.Clear([System.Drawing.Color]::Transparent)
$gSplash.DrawImage($srcBmp, $xSplash, $ySplash, $targetWidthSplash, $targetHeightSplash)

$newBmpSplash.Save($destSplashPath, [System.Drawing.Imaging.ImageFormat]::Png)
$gSplash.Dispose()
$newBmpSplash.Dispose()
Write-Host "SUCCESS: Generated splash_icon.png at $destSplashPath!"

# Cleanup source
$srcBmp.Dispose()
