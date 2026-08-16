# Recorta las capturas crudas a lo que se enseña en la portada.
#
# Una captura de pantalla entera no vende: sale la cabecera con la marca, el
# buscador, el avatar y media pantalla de cromo, que es justo lo que tiene igual
# cualquier aplicación del mundo. Lo que hay que enseñar es la tabla de series,
# los anillos de calorías y las cifras de la semana.
#
#   ENTRA  `capturas/`         las capturas crudas, tal y como salen del
#                              navegador. NO se publican: son la fuente.
#   SALE   `public/capturas/`  una pieza por sección, y eso es lo que carga la
#                              portada.
#
# Al cambiar un recorte cambian las medidas del archivo, y esas medidas están
# escritas también en `components/marketing/LandingPage.jsx` (los `ancho`/`alto`
# de cada pieza) para que el navegador reserve el hueco antes de cargarla. Este
# script las imprime al terminar: hay que llevarlas allí.
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts/recortar-capturas.ps1

Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
$origen = Join-Path $raiz 'capturas'
$destino = Join-Path $raiz 'public\capturas'
if (-not (Test-Path $destino)) { New-Item -ItemType Directory -Path $destino | Out-Null }

# nombre = @(archivo, @(x, y, ancho, alto), @(otra banda)...)
#
# Con más de una banda se APILAN, y eso no es un truco de maquetación: es la
# única forma de enseñar la rutina sin el hueco muerto que hay entre la cabecera
# del día y los ejercicios —una caja de texto vacía y una barra de estado— que en
# la aplicación se pasa de largo con el dedo y en una captura ocupa un tercio de
# la pieza. Las dos bandas son de la misma pantalla, del mismo momento y sin
# retocar; lo único que se quita es el aire.
#
# La coma delante de la primera banda no es un descuido: sin ella PowerShell
# aplana el array de arrays y una banda suelta llega como cuatro números.
$recortes = @(
  # La rutina empieza en el carril de semanas: sin él se ve un día suelto y lo
  # que hay que entender es que detrás hay un programa —ocho semanas, tres días—
  # y que el día abierto es uno de ellos.
  @{ nombre = 'rutina'; archivo = 'rutina.jpg'; bandas = @(@(31, 100, 2017, 435), @(31, 895, 2017, 385)) }
  @{ nombre = 'progreso'; archivo = 'progreso.jpg'; bandas = @(, @(31, 645, 2017, 635)) }
  @{ nombre = 'm-rutina'; archivo = 'movil\rutina.png'; bandas = @(, @(8, 92, 392, 730)) }
  @{ nombre = 'm-dieta'; archivo = 'movil\dieta.png'; bandas = @(, @(8, 150, 392, 672)) }
  @{ nombre = 'm-progreso'; archivo = 'movil\progreso.png'; bandas = @(, @(8, 95, 392, 730)) }
)

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 88

foreach ($r in $recortes) {
  $nombre = $r.nombre
  $ruta = Join-Path $origen $r.archivo
  $bandas = $r.bandas
  $img = [System.Drawing.Image]::FromFile($ruta)

  # A entero a mano: `Measure-Object` devuelve `Double`, y con eso el
  # constructor de `Bitmap` no resuelve ninguna sobrecarga y salta
  # «el parámetro no es válido», que no dice absolutamente nada.
  $ancho = [int]($bandas | ForEach-Object { $_[2] } | Measure-Object -Maximum).Maximum
  $alto = [int]($bandas | ForEach-Object { $_[3] } | Measure-Object -Sum).Sum

  $out = New-Object System.Drawing.Bitmap $ancho, $alto
  $out.SetResolution($img.HorizontalResolution, $img.VerticalResolution)

  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

  $y = 0
  foreach ($b in $bandas) {
    $origenRect = New-Object System.Drawing.Rectangle $b[0], $b[1], $b[2], $b[3]
    $destinoRect = New-Object System.Drawing.Rectangle 0, $y, $b[2], $b[3]
    $g.DrawImage($img, $destinoRect, $origenRect, [System.Drawing.GraphicsUnit]::Pixel)
    $y += $b[3]
  }

  $salida = Join-Path $destino "$nombre.jpg"
  $out.Save($salida, $codec, $params)

  "{0}.jpg = {1} x {2}" -f $nombre, $ancho, $alto

  $g.Dispose(); $out.Dispose(); $img.Dispose()
}
