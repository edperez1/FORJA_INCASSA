$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$datos = Get-Content (Join-Path $PSScriptRoot 'entidades.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$bmp = New-Object System.Drawing.Bitmap 4000,3000
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::FromArgb(246,248,250))
$titulo = New-Object System.Drawing.Font 'Segoe UI',38,([System.Drawing.FontStyle]::Bold)
$cabecera = New-Object System.Drawing.Font 'Segoe UI',23,([System.Drawing.FontStyle]::Bold)
$texto = New-Object System.Drawing.Font 'Consolas',18
$nota = New-Object System.Drawing.Font 'Segoe UI',20
$oscuro = [System.Drawing.Brushes]::DarkSlateGray
$g.DrawString('INCASA | Diagrama de clases de las entidades', $titulo, $oscuro, 90,45)
$g.DrawString('Modelo Java/JPA actual · atributos privados · métodos omitidos para facilitar la lectura', $nota, $oscuro, 95,115)
$pos = @{
 ElementoCatalogo=@(1460,220); Producto=@(90,590); Materia=@(860,590);
 UnidadMedida=@(1630,590); Area=@(2400,590); Produccion=@(480,1130);
 Pesaje=@(480,2050); Bascula=@(1780,1760); Usuario=@(3170,970);
 Auditoria=@(3170,1910); Sesion=@(2410,2450)
}
$rects=@{}
foreach ($c in $datos) {
 $p=$pos[$c.name]; $h=110+($c.fields.Count*32)
 $rects[$c.name]=[System.Drawing.RectangleF]::new($p[0],$p[1],650,$h)
}
function Ligne($points, $dashed=$false, $triangle=$false, $label='') {
 $pen=New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(85,103,116)),3
 if($dashed){$pen.DashStyle='Dash'}
 $pts=@($points | ForEach-Object { [System.Drawing.PointF]::new($_[0],$_[1]) })
 $g.DrawLines($pen,[System.Drawing.PointF[]]$pts)
 $last=$pts[-1]; $prev=$pts[-2]; $dx=$last.X-$prev.X; $dy=$last.Y-$prev.Y
 $len=[Math]::Sqrt($dx*$dx+$dy*$dy); $ux=$dx/$len; $uy=$dy/$len
 $a=[System.Drawing.PointF]::new($last.X-22*$ux+11*$uy,$last.Y-22*$uy-11*$ux)
 $b=[System.Drawing.PointF]::new($last.X-22*$ux-11*$uy,$last.Y-22*$uy+11*$ux)
 if($triangle){$g.FillPolygon([System.Drawing.Brushes]::White,[System.Drawing.PointF[]]@($last,$a,$b));$g.DrawPolygon($pen,[System.Drawing.PointF[]]@($last,$a,$b))}
 else{$g.DrawLines($pen,[System.Drawing.PointF[]]@($a,$last,$b))}
 if($label){$at=$pts[1];$size=$g.MeasureString($label,$nota);$lx=[Math]::Min($at.X+8,3950-$size.Width);$g.FillRectangle([System.Drawing.Brushes]::White,$lx,$at.Y-35,$size.Width,$size.Height);$g.DrawString($label,$nota,$oscuro,$lx,$at.Y-35)}
 $pen.Dispose()
}
# Herencia: triángulo hueco hacia la clase base.
Ligne @(@(415,590),@(415,520),@(1600,520),@(1600,458)) $false $true
Ligne @(@(1185,590),@(1185,540),@(1700,540),@(1700,458)) $false $true
Ligne @(@(1955,590),@(1955,458)) $false $true
Ligne @(@(2725,590),@(2725,500),@(2010,500),@(2010,458)) $false $true
# Asociaciones JPA dirigidas, con multiplicidad del destino.
Ligne @(@(550,1130),@(550,880),@(415,880),@(415,700)) $false $false 'producto: 1'
Ligne @(@(720,1130),@(720,940),@(1185,940),@(1185,700)) $false $false 'materia: 1'
Ligne @(@(900,1130),@(900,1000),@(1955,1000),@(1955,732)) $false $false 'unidad: 1'
Ligne @(@(1130,1230),@(2800,1230),@(2800,700)) $false $false 'áreaProceso: 1'
Ligne @(@(1130,1300),@(2920,1300),@(2920,850),@(2850,850),@(2850,700)) $false $false 'áreaDestino: 1'
Ligne @(@(805,2050),@(805,2010),@(805,$rects['Produccion'].Bottom)) $false $false 'producción: 1 (0..* pesajes)'
Ligne @(@(1130,2130),@(1620,2130),@(1620,1880),@(1780,1880)) $false $false 'báscula: 1'
Ligne @(@(2105,1760),@(2105,1470),@(2570,1470),@(2570,700)) $false $false 'área: 0..1'
# Referencias escalares, no asociaciones JPA.
Ligne @(@(3060,2540),@(3900,2540),@(3900,1320),@(3820,1320)) $true $false 'usuarioId: 1 (FK SQL)'
Ligne @(@(3495,1910),@(3495,1790),@(3495,1400)) $true $false 'usuarioId: referencia lógica'
foreach ($c in $datos) {
 $r=$rects[$c.name]
 $g.FillRectangle([System.Drawing.Brushes]::White,$r)
 $pen=New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(95,117,126)),2
 $g.DrawRectangle($pen,$r.X,$r.Y,$r.Width,$r.Height)
 $brush=New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(0,112,65))
 $g.FillRectangle($brush,$r.X,$r.Y,$r.Width,65)
 $g.DrawString($c.name,$cabecera,[System.Drawing.Brushes]::White,$r.X+20,$r.Y+12)
 $g.DrawString(('«'+$c.table+'»'),$nota,$oscuro,$r.X+20,$r.Y+70)
 $y=$r.Y+108
 foreach($f in $c.fields){$g.DrawString($f,$texto,$oscuro,$r.X+20,$y);$y+=32}
 $pen.Dispose();$brush.Dispose()
}
$g.DrawString('Leyenda', $cabecera,$oscuro,1650,2190)
$g.DrawString("Línea continua + flecha: asociación JPA (origen 0..*).`nTriángulo hueco: herencia Java.`nLínea discontinua: referencia mediante ID escalar.`nAuditoria.entidad + entidadId: referencia lógica a distintos tipos.`nLos IDs de operario/apertura/cierre también son escalares.`nRol, EstadoProduccion y TipoPesaje son enums.`nFlyway administra el esquema; no es una entidad Java.",$nota,$oscuro,1650,2250)
$path=Join-Path $PSScriptRoot 'INCASA-diagrama-clases.png'
$bmp.Save($path,[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$bmp.Dispose()
Write-Output $path
