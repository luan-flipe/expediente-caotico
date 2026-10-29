# Deriva os ícones do PWA e o favicon de assets-src/icon/icone.png (System.Drawing, sem dependências).
# Uso: powershell -File scripts/gerar-icones.ps1
Add-Type -AssemblyName System.Drawing
$raiz = Split-Path -Parent $PSScriptRoot
$origem = [System.Drawing.Image]::FromFile((Join-Path $raiz "assets-src/icon/icone.png"))
$saida = Join-Path $raiz "apps/web/public/icons"
New-Item -ItemType Directory -Force $saida | Out-Null

# escala = fração do lado ocupada pela arte; o resto é preenchido com o escuro do cenário
function Salvar($nome, $lado, $escala) {
  $bmp = New-Object System.Drawing.Bitmap($lado, $lado)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::FromArgb(255, 24, 22, 18))
  $t = [int]($lado * $escala)
  $m = [int](($lado - $t) / 2)
  $g.DrawImage($origem, $m, $m, $t, $t)
  $g.Dispose()
  $bmp.Save((Join-Path $saida $nome), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

Salvar "icon-512.png" 512 1.0
Salvar "icon-192.png" 192 1.0
# maskable: a máscara pode cortar até 10% por lado; a arte fica a 86% para o rosto e a cadeira ficarem dentro da zona segura
Salvar "maskable-512.png" 512 0.86
Salvar "apple-touch-icon.png" 180 1.0
Salvar "favicon-32.png" 32 1.0
Salvar "favicon-16.png" 16 1.0
$origem.Dispose()
