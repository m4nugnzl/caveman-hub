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
# ══ Todo va en TEMA OSCURO ═══════════════════════════════════════════════════
#
# Y no es una preferencia estética: la portada es de noche fija (`.lp-noche`),
# así que una captura del tema claro pegada ahí es un rectángulo blanco de 800 px
# en mitad de un lienzo casi negro. Aquí hubo justo eso —las piezas de escritorio
# claras y las de móvil oscuras, en la misma escena— y la costura se veía sin
# buscarla: la ventana del ordenador parecía de otra página que la del teléfono
# apoyado encima.
#
# ══ Y todas a la MISMA ESCALA ════════════════════════════════════════════════
#
# Esto es lo que hace falta explicar, porque no se ve venir. Las capturas crudas
# están tomadas con zooms distintos: en unas la columna de contenido de la
# aplicación mide 765 px y en otras 1025. Recortadas tal cual y puestas a la
# misma anchura en la página, la letra de una sale un 30 % más grande que la de
# la otra — y en un carrusel, donde tres piezas pasan una detrás de otra en el
# mismo hueco, ese salto de tamaño se lee como que son tres productos.
#
# `escala` es lo que iguala eso. Y lo que cambió —porque la pieza de la dieta se
# veía PIXELADA en la página— es DÓNDE se aplica:
#
#   · Antes se aplicaba al ARCHIVO: la captura de 1032 px se guardaba reducida a
#     770. Eso tira un tercio de los píxeles del original, y después la página la
#     volvía a estirar hasta los 858 px que mide la ventana. Reducir y volver a
#     ampliar es la receta exacta de la letra sucia: lo que se pierde al reducir
#     no vuelve, y al ampliar solo se hace más grande el destrozo.
#
#   · Ahora se aplica al ANCHO DE PINTADO: el archivo se guarda a tamaño NATIVO,
#     con todos los píxeles que tenía la captura, y `escala` solo dice a cuántos
#     píxeles de CSS hay que enseñarlo (`css` en la salida). La pieza se ve
#     exactamente del mismo tamaño que antes —el ancho de pintado no cambia— pero
#     con un 34 % más de píxeles dentro, así que el navegador la REDUCE en vez de
#     ampliarla. Reducir siempre sale nítido.
#
# La regla que queda, y es la de siempre: **una captura no se amplía nunca**. Lo
# que antes lo garantizaba era el tope de 880 px de la ventana; ahora lo garantiza
# cada pieza con su propio ancho de pintado.
#
# ══ Y `dpr`, que es lo que por fin arregla la letra sucia ════════════════════
#
# Las capturas nuevas están tomadas con el navegador a DENSIDAD DOBLE (F12 → el
# icono de móvil → «Responsive» → DPR 2 → «Capture screenshot»). Un archivo así
# trae dos píxeles por cada píxel de CSS que tenía la pantalla, y eso cambia una
# cuenta:
#
#   ancho de pintado = ancho del archivo / dpr * escala
#
# `escala` sigue significando lo mismo —igualar el zoom entre capturas— y `dpr`
# es lo único que se añade: cuántos píxeles de archivo hay por píxel de pantalla.
# Las piezas se pintan al MISMO tamaño que antes, así que la maqueta no se toca,
# y llevan dentro cuatro veces más píxeles. Ahí se acaba lo de «se ve pixelado»,
# también en un portátil al 125 %, que es donde más se notaba.
#
# Sin `dpr`, 1. La única pieza que sigue así es el check-in, que no se ha vuelto
# a tomar.
#
# ── Lo que hay que vigilar al recortar una captura de DPR 2 ────────────────
# Que no entre la barra de búsqueda flotante. En una captura de página entera el
# navegador dibuja los elementos fijos a la altura del pliegue, o sea en mitad
# del contenido, y ahí no hay forma de quitarla: hay que cortar por encima.
#
# Al cambiar un recorte cambian las medidas del archivo, y esas medidas están
# escritas también en `components/marketing/LandingPage.jsx` (los `ancho`/`alto`
# de cada pieza, y el `css` de las de escritorio) para que el navegador reserve el
# hueco antes de cargarla y sepa hasta dónde puede estirarla. Este script las
# imprime al terminar: hay que llevarlas allí.
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts/recortar-capturas.ps1

Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
$origen = Join-Path $raiz 'capturas'
$destino = Join-Path $raiz 'public\capturas'
if (-not (Test-Path $destino)) { New-Item -ItemType Directory -Path $destino | Out-Null }

# nombre = @(archivo, escala, @(x, y, ancho, alto), @(otra banda)...)
#
# Con más de una banda se APILAN, y eso no es un truco de maquetación: es la
# única forma de enseñar una pantalla sin el hueco muerto que la separa por
# dentro —la caja de aviso de que estás previsualizando el portal, el aire entre
# la cabecera del día y los ejercicios— que en la aplicación se pasa de largo con
# el dedo y en una captura ocupa un tercio de la pieza. Las bandas son de la
# misma pantalla, del mismo momento y sin retocar; lo único que se quita es el
# aire.
#
# La coma delante de la primera banda no es un descuido: sin ella PowerShell
# aplana el array de arrays y una banda suelta llega como cuatro números.
$recortes = @(
  # ══ EL PAR 01: LA SESIÓN ══════════════════════════════════════════════════
  #
  # Y es la MISMA sesión que enseña el móvil de al lado: «Legs A», del mismo
  # cliente y del mismo momento —seis series de veintiuna—. Aquí estuvo un día
  # de «Push» mientras el teléfono enseñaba «Legs», y esa es justo la costura
  # que se le ve a un par: dos pantallas puestas juntas para decir «lo tuyo y lo
  # suyo son lo mismo» y contando dos días distintos.
  #
  # Dos bandas: la cabecera del día con su barra de avance, y los dos ejercicios
  # enteros. Entre medias se quita el calentamiento en vídeo — sale en el móvil
  # de al lado, y repetirlo aquí es gastar un tercio de la ventana en decir lo
  # mismo dos veces.
  @{ nombre = 'p-sesion'; archivo = 'pc\sesion2x.png'; dpr = 2; escala = 0.8038
     bandas = @(@(91, 216, 1916, 200), @(91, 866, 1916, 928)) }

  # ══ EL PAR 02: LA COMIDA ══════════════════════════════════════════════════
  #
  # El editor de una comida: el campo de la nota que él verá tal cual, las cinco
  # opciones, el objetivo de la comida contra lo que suman los alimentos de
  # verdad y la lista con sus cantidades. O sea el TRABAJO, no el resultado.
  #
  # Es además la que de verdad hace par con el teléfono: las cinco opciones que
  # se ven aquí son exactamente las cinco que él abre en el móvil.
  #
  # Corta después de «Nueces» y no más abajo: ahí empieza la banda de la barra
  # de búsqueda flotante, y una fila de alimento partida por una pastilla de
  # «Ctrl K» se lee como una captura mal hecha.
  @{ nombre = 'p-comidas'; archivo = 'pc\comidas2x.png'; dpr = 2; escala = 0.6058; techo = 1920
     bandas = @(, @(89, 11, 2542, 1154)) }

  # ══ LA SECUENCIA DE LA SEMANA ═════════════════════════════════════════════
  #
  # Las tres herramientas con las que se cierra una semana: el roadmap marca el
  # objetivo, el check-in mide lo que ha pasado y el resumen lo junta todo para
  # decidir la siguiente. Y encadenan de verdad —el roadmap pone −0,47 kg/sem y
  # el check-in mide −0,44—, que es lo que convierte tres capturas en una
  # secuencia.
  #
  # ── Del roadmap va SOLO la tarjeta del roadmap ────────────────────────────
  # Debajo tiene la tabla de «todas las métricas», y ahí sale una adherencia del
  # 13 %. Es dato de demostración y no significa nada, pero en una portada un
  # 13 % en grande es lo único que se lee de esa tabla.
  @{ nombre = 'p-roadmap'; archivo = 'pc\roadmap2x.png'; dpr = 2; escala = 0.6002; techo = 1920
     bandas = @(, @(88, 48, 2566, 560)) }

  # ── Las dos que siguen sin volver a tomarse a densidad doble ──────────────
  #
  # Se pintan a los mismos 770 px que las demás, así que se ven del mismo tamaño
  # y de la misma escala de letra; lo que no tienen es margen de píxeles para una
  # pantalla al 125 % o para un teléfono de densidad triple.
  @{ nombre = 'p-checkin'; archivo = 'pc\revisiones.png'; escala = 0.9948
     bandas = @(, @(8, 8, 774, 450)) }

  # La ficha del cliente, ENTERA y por debajo del nombre.
  #
  # ── Y por qué no sale de la captura de DPR 2 ──────────────────────────────
  # Porque esa la cruza la barra de búsqueda flotante justo por encima de las
  # gráficas, y ahí no hay recorte que salve: cualquier corte por encima de la
  # barra parte las dos tarjetas por la mitad, que es exactamente lo que se veía
  # —una imagen recortada—. Con la captura de siempre la ficha sale completa:
  # los cuatro indicadores arriba y las dos gráficas debajo, con sus ejes y sus
  # leyendas.
  #
  # Lo que sí se hereda de la otra es DÓNDE empieza: por debajo de «Javier
  # López», porque un nombre propio en grande en mitad de una portada convierte
  # una herramienta en la ficha de una persona concreta.
  #
  # Para pasarla a densidad doble hace falta volver a tomarla con la ventana más
  # ALTA que la página, que es lo que manda la barra flotante al pie donde le
  # toca en vez de a mitad del contenido.
  @{ nombre = 'p-ficha'; archivo = 'pc\ficha.png'; escala = 0.603
     bandas = @(, @(60, 66, 1277, 432)) }

  # ── LOS MÓVILES DEL CLIENTE ───────────────────────────────────────────────
  # SIN la cabecera de la aplicación. Aquí iba —el logotipo, la lupa y el avatar,
  # sesenta píxeles— con el argumento de que ese cromo hacía que el recorte
  # pareciera un teléfono encendido. Y era al revés: dentro de un marco de
  # iPhone, con su barra de estado y su muesca justo encima, la cabecera web es
  # una TERCERA barra apilada sobre las otras dos. Tres franjas de cromo antes de
  # llegar al contenido, y ninguna es el producto.
  #
  # Lo que sí se queda es la barra de abajo: dice de un vistazo que el cliente
  # tiene cinco secciones y no una pantalla suelta, y es lo que se ve en una
  # aplicación de móvil de verdad. Va en su propia banda porque en las capturas
  # de página entera el navegador la dibuja a la altura del pliegue, o sea en
  # mitad del contenido: hay que ir a buscarla donde esté y traerla al pie.
  #
  # Los dos con la MISMA PROPORCIÓN, porque los dos van dentro del mismo bisel:
  # dos piezas de distinta proporción en el mismo marco se leen como dos
  # teléfonos distintos. Lo que ya no es igual es la densidad —la del portal se
  # tomó desde la vista previa del entrenador, que es una columna de 390 px— y
  # eso no se arregla desde aquí: hace falta volver a tomarla con el navegador en
  # DPR 2 sobre la aplicación del cliente.
  @{ nombre = 'm-rutina'; archivo = 'movil\rutina2x.png'
     bandas = @(@(0, 156, 430, 642), @(0, 900, 430, 58)) }
  # Y esta con el techo bajo: el teléfono de la portada mide 250 px como mucho,
  # así que 1317 px de archivo son cinco veces lo que se llega a pintar — 218 kB
  # de los que se ven cuarenta.
  @{ nombre = 'm-dieta'; archivo = 'movil\dieta2x.png'; dpr = 2; techo = 768
     bandas = @(@(0, 25, 1317, 1994), @(0, 2096, 1317, 150)) }
)

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
# 94 y no 90. Estas piezas son TEXTO sobre fondo plano, que es lo peor que se le
# puede dar a un JPEG: el ruido del bloque se pega justo al canto de las letras.
# Los cuatro puntos de calidad son unos kilobytes por pieza y se notan en las
# cifras pequeñas, que es lo único que hay que poder leer.
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 94

foreach ($r in $recortes) {
  $nombre = $r.nombre
  $ruta = Join-Path $origen $r.archivo
  $bandas = $r.bandas
  $escala = if ($r.ContainsKey('escala')) { [double]$r.escala } else { 1.0 }
  # Cuántos píxeles de archivo hay por cada píxel de pantalla. Ver la cabecera.
  $dpr = if ($r.ContainsKey('dpr')) { [double]$r.dpr } else { 1.0 }
  $img = [System.Drawing.Image]::FromFile($ruta)

  # A entero a mano: `Measure-Object` devuelve `Double`, y con eso el
  # constructor de `Bitmap` no resuelve ninguna sobrecarga y salta
  # «el parámetro no es válido», que no dice absolutamente nada.
  $ancho = [int]($bandas | ForEach-Object { $_[2] } | Measure-Object -Maximum).Maximum
  $alto = [int]($bandas | ForEach-Object { $_[3] } | Measure-Object -Sum).Sum
  # El archivo va a tamaño nativo; lo que se calcula aquí es a cuántos píxeles de
  # CSS se pinta, que es lo que hay que llevar a `LandingPage.jsx`.
  $anchoCss = [int][Math]::Round($ancho / $dpr * $escala)

  $out = New-Object System.Drawing.Bitmap $ancho, $alto
  $out.SetResolution($img.HorizontalResolution, $img.VerticalResolution)

  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  # Sin esto, cada banda se dibuja con medio píxel de margen y entre dos bandas
  # apiladas aparece una línea clara de un píxel: la costura del montaje, justo
  # lo que no puede verse.
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $y = 0.0
  foreach ($b in $bandas) {
    $h = [double]$b[3]
    $origenRect = New-Object System.Drawing.RectangleF $b[0], $b[1], $b[2], $b[3]
    $destinoRect = New-Object System.Drawing.RectangleF 0, $y, ([double]$b[2]), $h
    $g.DrawImage($img, $destinoRect, $origenRect, [System.Drawing.GraphicsUnit]::Pixel)
    $y += $h
  }

  # ── Y aquí se le quita el peso que no se ve ────────────────────────────────
  #
  # Una captura de DPR 2 trae MÁS píxeles de los que ninguna pantalla va a
  # pintar. La pieza de la dieta en el móvil son 1317 px de archivo para
  # dibujarse en 250: cinco veces la resolución que hace falta, y 218 kB en una
  # portada que se abre casi siempre con datos.
  #
  # `techo` es el tope de píxeles del archivo, y sale de una cuenta: el ancho al
  # que se pinta por TRES. Con eso una pantalla de densidad triple —el teléfono
  # más fino que hay— sigue recibiendo un píxel de imagen por píxel suyo, y a
  # partir de ahí no hay nada que ganar porque el ojo no lo distingue.
  #
  # Se aplica al final y de una vez, sobre el montaje ya compuesto: reducir cada
  # banda por separado dejaría medio píxel de desajuste entre ellas, que es la
  # costura que el `PixelOffsetMode` de arriba existe para evitar.
  if ($r.ContainsKey('techo') -and $ancho -gt [int]$r.techo) {
    $techo = [int]$r.techo
    $altoTecho = [int][Math]::Round($alto * $techo / $ancho)
    $reducido = New-Object System.Drawing.Bitmap $techo, $altoTecho
    $reducido.SetResolution($img.HorizontalResolution, $img.VerticalResolution)
    $gr = [System.Drawing.Graphics]::FromImage($reducido)
    $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gr.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gr.DrawImage($out, (New-Object System.Drawing.Rectangle 0, 0, $techo, $altoTecho))
    $gr.Dispose(); $g.Dispose(); $out.Dispose()
    $out = $reducido
    $g = $null
    $ancho = $techo; $alto = $altoTecho
  }

  $salida = Join-Path $destino "$nombre.jpg"
  $out.Save($salida, $codec, $params)

  "{0,-12} {1,4} x {2,-4}  css {3,4}  ({4})" -f "$nombre.jpg", $ancho, $alto, $anchoCss,
    ([Math]::Round($ancho / $alto, 2))

  if ($g) { $g.Dispose() }
  $out.Dispose(); $img.Dispose()
}
