# Logotipos de servicios externos

Aquí van los logotipos **oficiales** de cada integración, en SVG y con el nombre
del `id` del proveedor (ver `src/domain/integrations.js`):

```
notion.svg
stripe.svg
```

## Por qué no están en el repositorio

Son marcas registradas de terceros. Cada empresa publica su propio archivo con sus
condiciones de uso, y lo correcto es cogerlo de ahí en lugar de redibujarlo:

- **Notion** — https://www.notion.com/brand
- **Stripe** — https://stripe.com/newsroom/brand-assets

## Qué pasa si falta uno

`BrandMark` dibuja un monograma con la inicial. Se ve claramente como un marcador
de posición, que es mejor que una aproximación hecha a mano: una aproximación
parece el logotipo de verdad sin serlo, y eso es peor que no ponerlo.

## Formato

Cuadrado (o casi), fondo transparente, y que se lea bien a 26 px — es el tamaño al
que se muestra en el catálogo. Si el archivo oficial es un lockup horizontal con el
nombre al lado, usa solo la marca.
