# Logotipos de servicios externos

Aquí van los logotipos **oficiales** de cada integración, en SVG y con el nombre
del `id` del proveedor (ver `src/domain/integrations.js`):

```
notion.svg
stripe.svg
google.svg
```

`google.svg` no es una integración: es la «G» del botón **Continuar con Google**
de la pantalla de acceso. Va aquí porque el criterio es el mismo —marca de un
tercero, no se redibuja— y porque así lo carga el mismo componente.

## Por qué no están en el repositorio

Son marcas registradas de terceros. Cada empresa publica su propio archivo con sus
condiciones de uso, y lo correcto es cogerlo de ahí en lugar de redibujarlo:

- **Notion** — https://www.notion.com/brand
- **Stripe** — https://stripe.com/newsroom/brand-assets
- **Google** — https://developers.google.com/identity/branding-guidelines (la «G»
  a color, no el lockup con la palabra)

## Qué pasa si falta uno

`BrandMark` dibuja un monograma con la inicial. Se ve claramente como un marcador
de posición, que es mejor que una aproximación hecha a mano: una aproximación
parece el logotipo de verdad sin serlo, y eso es peor que no ponerlo.

## Formato

Cuadrado (o casi), fondo transparente, y que se lea bien a 26 px — es el tamaño al
que se muestra en el catálogo. Si el archivo oficial es un lockup horizontal con el
nombre al lado, usa solo la marca.

**Tiene que ser un SVG de verdad**, o sea un archivo cuya raíz sea `<svg>`. La
página de marca de Google entrega el botón entero en HTML —un `<button>` con sus
clases y la «G» dentro— y eso guardado como `google.svg` no lo pinta ningún
navegador: `BrandMark` lo carga con un `<img>`, la carga falla y sale el
monograma, que es exactamente el síntoma de «he puesto el logo y no se ve». De
ese HTML hay que quedarse solo con el `<svg>` de dentro.
