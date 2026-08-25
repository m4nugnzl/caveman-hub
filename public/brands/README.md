# Logotipos de servicios externos

Aquí van los logotipos **oficiales** de cada integración, en SVG y con el nombre
del `id` del proveedor (ver `src/domain/integrations.js`).

| Archivo | Qué es | De dónde salió |
| --- | --- | --- |
| `notion.svg` | El bloque «N» | `https://www.notion.com/images/notion-logo-block-main.svg`, enlazado desde [notion.com/brand](https://www.notion.com/brand) |
| `stripe.svg` | El icono cuadrado (la ese blanca sobre morado) | El `favicon.svg` que publica Stripe en [stripe.com/newsroom/brand-assets](https://stripe.com/newsroom/brand-assets) |
| `google.svg` | La «G» a color | [Branding guidelines](https://developers.google.com/identity/branding-guidelines) |
| `google-calendar.svg` | El icono del producto | `https://fonts.gstatic.com/s/i/productlogos/calendar_2020q4/v13/192px.svg`, el logotipo de producto que sirve Google |

`google.svg` no es una integración: es la «G» del botón **Continuar con Google**
de la pantalla de acceso. Va aquí porque el criterio es el mismo —marca de un
tercero, no se redibuja— y porque así lo carga el mismo componente.

## Por qué el de Stripe es el favicon y no «el logo»

Porque el kit oficial de Stripe (`Stripe_logo_kit.zip`, en esa misma página)
**solo trae el logotipo horizontal con la palabra**: no publican una marca
cuadrada suelta. En un azulejo de 26 px, un lockup horizontal se encoge hasta
que la palabra no se lee.

El favicon SÍ es una pieza cuadrada, oficial y publicada por Stripe en su propia
página de marca. Es el archivo correcto para este sitio, y sigue sin haber
redibujado nada.

## Se descargan, no se redibujan

Son marcas registradas de terceros y cada empresa publica su archivo con sus
condiciones de uso. Aproximar uno a mano es peor que no ponerlo: parece el
logotipo de verdad sin serlo. Se intentó con el de Notion, dos veces, y las dos
veces el resultado no era el logotipo de Notion.

Para actualizar uno, vuelve a la página de marca de la tabla y sustituye el
archivo. No lo edites a mano más allá de recortar el `<svg>` que haga falta.

## Qué pasa si falta uno

`BrandMark` dibuja un monograma con la inicial. Se ve claramente como un marcador
de posición, que es lo que se quiere: la ausencia se nota y se arregla.

## Formato

Cuadrado (o casi), y que se lea bien a 26 px — es el tamaño al que se muestra en
el catálogo. Si el archivo oficial es un lockup horizontal con el nombre al lado,
usa solo la marca.

**Tiene que ser un SVG de verdad**, o sea un archivo cuya raíz sea `<svg>`. La
página de marca de Google entrega el botón entero en HTML —un `<button>` con sus
clases y la «G» dentro— y eso guardado como `google.svg` no lo pinta ningún
navegador: `BrandMark` lo carga con un `<img>`, la carga falla y sale el
monograma, que es exactamente el síntoma de «he puesto el logo y no se ve». De
ese HTML hay que quedarse solo con el `<svg>` de dentro.

### Fondo transparente… salvo los que traen el suyo

La mayoría son un glifo sobre transparente y van sobre el azulejo claro de
`BrandMark`, que es lo que hace que el negro de Notion se vea también en tema
oscuro.

Algunos —Stripe— son un **icono de aplicación**: traen su propio fondo de color y
sus esquinas redondeadas. Esos llenan el azulejo hasta el canto en vez de flotar
dentro de él con un margen claro. Se declaran en `CON_FONDO_PROPIO`, en
`src/components/ui/BrandMark.jsx`: no hay forma de adivinarlo desde un `<img>`.

### `google_drive.svg`

El triángulo de seis colores, sobre transparente: glifo, así que NO va en
`CON_FONDO_PROPIO`.

Es la excepción a lo que dice el segundo párrafo de este documento, y conviene
saber por qué se admite aquí y no con Notion. La marca de Notion es una pieza de
tipografía —una ene con sus grosores y sus contornos medidos— y aproximarla de
memoria da algo que se parece y no es. La de Drive es **geometría pura**: un
triángulo partido en tres bandas, seis polígonos rectos y seis colores exactos.
Eso sí se reproduce sin margen de interpretación, y el archivo de aquí son esas
coordenadas.

Aun así, si algún día quieres el archivo tal cual sale de la página de marca de
Google, sustitúyelo sin más: el nombre y el tamaño son los mismos.
