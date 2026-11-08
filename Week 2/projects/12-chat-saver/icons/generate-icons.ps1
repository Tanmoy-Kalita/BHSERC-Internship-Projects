Add-Type -AssemblyName System.Drawing
[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null

$sizes = @(16, 32, 48, 128)
foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.Clear([System.Drawing.Color]::FromArgb(5, 150, 105))

    # Draw a simple chat bubble icon
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $size/16)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $scale = $size / 128
    $points = @(
        (32*$scale, 96*$scale), (32*$scale, 32*$scale),
        (96*$scale, 32*$scale), (96*$scale, 64*$scale)
    )
    $gfx.DrawLines($pen, $points)

    $points2 = @(
        (44*$scale, 76*$scale), (56*$scale, 64*$scale), (76*$scale, 84*$scale)
    )
    $pen2 = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $size/20)
    $pen2.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen2.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $gfx.DrawLines($pen2, $points2)

    # Checkmark
    $points3 = @(
        (86*$scale, 38*$scale), (90*$scale, 42*$scale), (98*$scale, 34*$scale)
    )
    $pen3 = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $size/25)
    $pen3.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen3.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $gfx.DrawLines($pen3, $points3)

    $bmp.Save("icon$size.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $gfx.Dispose()
}
Write-Host 'Icons created successfully'