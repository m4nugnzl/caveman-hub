# Cajas — el portal del cliente

> **CONSTRUIDO el 14 de septiembre de 2026.** El prototipo de PC de este estudio es
> ya la visión del cliente en el monitor: `styles/portal-pc.css` y
> `components/Client/pc/`. Las cuatro tandas están hechas, incluida la tercera —ver
> y hacer son dos rutas (`/mi/rutina` y `/mi/rutina/sesion`)—. Lo que NO se hizo:
> cambiar los tokens de la casa. El lenguaje vive bajo `.pc-portal` y redefine su
> paleta ahí dentro, así que el panel del entrenador se queda como estaba.

**14 de septiembre de 2026.** Prototipo clicable en `docs/estudio-cajas.html`
(seis pantallas de PC a 1.360 y tres de teléfono a 390, verificado con Edge
headless: sin errores de JS, las cuatro capturas cargan).

Encargo del dueño, literal:

> «estudia las apps más punteras, quiero un rediseño de lo que está
> actualmente, más por cajas, más limpio, menos estilo hoja de papel, como
> hacen coachway y efort […] revisa qué errores tiene la versión del cliente
> actual y púlelo, olvidando todo lo estipulado de diseño y de contenido, la
> base es lo que tenemos hecho»

**Esto anula `estudio-la-mesa` entero** —la tesis «muere la caja», las cuatro
reglas y su prototipo— y con él la ley «la hoja es fija y solo se levanta lo
que puedes tocar ahora». Va en la dirección contraria a propósito.

---

## La frase

Una pantalla deja de ser **una hoja con cosas escritas encima** y pasa a ser
**una rejilla de cajas**: cada una con su canto, su rótulo y un solo trabajo.

---

## El hallazgo, y por qué reescribió el estudio

La primera versión daba por hecho que el lienzo crema era la enfermedad.
Se midió con un histograma de píxeles sobre `capturas/referencias/` antes de
escribir nada:

| Producto | Lienzo | % píxeles | Tarjeta | Escalón | Ancla oscura |
|---|---|---|---|---|---|
| Coachway | `#f9f7f3` cálido | 44,2 % | `#ffffff` | 1,07 | `#0b192a` · 7,9 % |
| Efort | `#f4f5f7` frío | 6,5 % | `#ffffff` | 1,09 | barra lateral |
| Caveman Hub | `#f7f6f2` cálido | — | `#ffffff` | 1,08 | **ninguna** |

**El lienzo de Coachway es más cálido y más claro que el nuestro, y su escalón
a la tarjeta es menor.** El papel no es el color. Lo que ellos tienen y
nosotros no:

1. **El canto.** `--edge-card: transparent` en `tokens.css`, con el porqué
   escrito al lado. Una caja blanca sobre crema sostenida solo por una sombra
   de 1 px no es una caja: es un trozo de papel un poco más blanco.
2. **El tamaño.** Su caja más ancha mide 680 px; la nuestra, 1.496.
3. **La cuenta.** Seis teselas + cuatro cajas en 750 px de alto, contra dos
   cajas en 1.000.
4. **El ancla.** Casi el 8 % de su pantalla es azul marino. El portal del
   cliente no tiene ni un píxel oscuro.

El lienzo se enfría igual —lo pidió el dueño y ya no cuesta nada— pero
**enfriarlo solo no habría arreglado nada**.

---

## Las doce averías, medidas

Cuenta de Marta (`marta@ejemplo.invalid`) a 1600 × 1000, capturas en
`capturas/pc-cliente-14sep/`.

| | Avería | El número |
|---|---|---|
| E‑01 | Tres anchos para seis pantallas | 1.560 / 1.320 / 880 |
| E‑02 | La caja no tiene canto | `--edge-card: transparent` |
| E‑03 | La pantalla más importante es la más estrecha | rutina: 805 px de tinta, 390 de margen a cada lado, 2.018 de alto |
| E‑04 | Cajas del ancho de la página para dos datos | «Tu peso y tus medidas · 61,0 kg» en 1.400 px |
| E‑05 | Ninguna pantalla abre con cifras | las seis abren con titular y párrafo |
| E‑06 | La enfermedad vertical | «Cómo vas» 260 px de alto para 20 de contenido |
| E‑07 | Cinco matices en «Mi progreso» | violeta, verde azulado, magenta, azul, verde |
| E‑08 | Gráficas con un punto | eje de 68,2 a 53,6 para un pesaje |
| E‑09 | Dos vocabularios | «Mis revisiones» con un h1 «Tu revisión» |
| E‑10 | Escala de lectura, no de panel | 16 px contra los 12–13 de la competencia |
| E‑11 | Rejillas que dejan huérfanos | «Cena» sola con 900 px al lado |
| E‑12 | El estado es texto gris | «a medias», «anotada», «sin anotar» |

---

## Qué se copia y a quién

| Producto | Se copia | No se copia |
|---|---|---|
| Stripe | la **tira de teselas** (rótulo · cifra · delta) | la minigráfica dentro de la tesela |
| Linear | **una sola medida** para todas las pantallas | la densidad extrema y las listas sin caja |
| Coachway | **canto, ancla oscura y barra de aviso tintada** | su verde bosque y su cursiva |
| Efort | **carril de fechas** y rótulo con icono | el semáforo sobre los macros ([[la-app-no-receta]]) |
| Hevy · Strong | **el ejercicio es una caja**, no una fila de tabla | el cronómetro que arranca solo |
| iOS Ajustes | **la columna acotada** para «Tú» | el chevron en todas las filas |

Los dos primeros renglones están **medidos** sobre nuestras capturas; los
cuatro siguientes son estructura conocida de producto, no medición.

---

## Las cinco decisiones

1. **La caja tiene canto.** `--edge-card` → `#e3e6eb`. Radio 12, sombra de
   1 px, cabecera con filete y pie donde vive el verbo.
2. **El lienzo pierde la temperatura, no la claridad.** `#f7f6f2` → `#f1f2f5`
   (escalón 1,12). Las sombras dejan el sepia: `rgba(38,32,20)` →
   `rgba(16,24,40)`. **El acento `#3b49df` no se toca.**
3. **La cinta es el ancla.** El portal pasa a `#10151d`, reutilizando el
   mecanismo de `.barra-tinta`. No abre un lenguaje nuevo: extiende al portal
   la decisión ya aprobada de la barra oscura del entrenador.
4. **Dos voces y escala de panel.** Interfaz a 13–14 px; cifras y titulares en
   Archivo. Fuera la cursiva del saludo.
5. **La tira de teselas.** Es lo único del rediseño que es información nueva y
   no maquetación.

Regla que lo acota: **ninguna caja pasa de 8 de las 12 columnas** salvo una
tabla de verdad, y solo igualan altura las cajas de la *misma fila*.

---

## Segunda vuelta — lo que el dueño corrigió al verlo

Dio por buenos **Inicio y Progreso**. Lo demás, cinco correcciones, y dos son
de producto:

1. **«Las boxes demasiado cuadradas, poco amistosa la app.»** Señaló el
   estudio del teléfono del 13 sep (`estudio-la-app-del-cliente.html`) como el
   que sí le gusta: «cajas más redondas, más amistoso, mejor diseñado». Aquel
   usa radio 20 en la tarjeta, 14 dentro y botón principal de 50 px con radio
   25 — **pastilla**. Adoptada esa escala: caja 18, pieza interior 12,
   píldoras y primario redondos del todo. **El canto y el lienzo no se tocan.**
2. **Entreno se parte en dos pantallas.** «Diferenciar si el cliente le da a
   hacer el entreno, que le lleva a una visión solo con su entreno del día […]
   y la visión de PC, que el cliente ve sus entrenamientos.» No son dos modos:
   son dos rutas. «Entreno» **no tiene un solo campo**; «En sesión» tiene
   cabecera propia, sin cinta de secciones, columna de 620, campos de kg y
   reps, historial por ejercicio, y en el teléfono la barra del pulgar deja de
   ser un menú y pasa a ser el verbo *Acabar la sesión*.
3. **Los ejercicios, uno debajo de otro.** Cae la rejilla de dos por fila —el
   truco con el que la primera versión bajaba de 2.018 px a 1.129—. En una
   sesión el orden importa y dos columnas obligan a leer en zigzag.
4. **La dieta, en columna y con una sola opción a la vista.** «Con varias
   opciones por comida es un lío.» Cada comida enseña la opción puesta; el
   resto vive en un mando callado del pie: *Opción 1 de 3 · Cambiar*.
5. **Revisión tiene un solo trabajo.** «No entiende el cliente que al final lo
   que ha de hacer es subir su revisión.» De seis cajas a **dos y un renglón**,
   y el titular deja de ser el nombre del sitio y pasa a ser el verbo:
   «Entrega tu semana». En Hoy, «Hoy» y «Te espera» eran dos cajas para la
   misma pregunta y ahora son una.

## Medido en el prototipo

| Pantalla | Hoy | En el prototipo | Cajas |
|---|---|---|---|
| Hoy | última tinta en y=730 de 1000 | 933 px llenos | 9 |
| Entreno · ver | 2.018 px en 805 de ancho, campos y programa mezclados | **880 px, sin un solo campo** | 9 |
| Entreno · hacer | — | columna de 620, solo el entreno de hoy | 6 |
| Dieta | una tarjeta huérfana en su fila | comidas en columna, una opción visible | 8 |
| Revisión | seis cajas y 1.320 de ancho por excepción | **634 px, dos cajas y un renglón** | 2 |
| Progreso | cinco matices de dato | dos | 8 |
| Tú | última tinta en y=545 de 1000 | 620 px | 5 |

Los dos titulares son **Entreno** y **Revisión**, por motivos contrarios.
Entreno baja de 2.018 a 880 porque **deja de hacer dos cosas a la vez**.
Revisión baja a dos cajas y lo que se fue no se perdió: la curva está en
Progreso y las semanas abiertas detrás de su propio verbo.

Entra además la columna **«Antes»** (lo del microciclo 9), un dato que la app
ya guarda y que el portal no enseña en ningún sitio.

Las cuentas de cajas —31 hoy contando solo `.card`, 47 aquí en siete pantallas
contando todo lo que tiene canto— **no son la misma y no se pueden restar**.
Lo que dicen es que van en direcciones opuestas.

---

## Las cuatro tandas

Ninguna toca dominio, consultas ni RLS.

1. **El chasis y la caja.** Tokens (canto, lienzo, sombras); mueren
   `.layout-portal:has(.rutina-cuerpo.es-hoja)` y `:has(.revision-cliente)`;
   la cinta a oscuro. *Ojo: el cambio de tokens se ve en el panel del
   entrenador también — hay que capturarlo.*
2. **Las teselas y la escala.** `ui/Tesela` nueva; la escala de panel con una
   clase en `.layout-portal`, no tocando `--fs-base`; fuera la cursiva.
3. **Ver y hacer son dos pantallas — la de producto.** «Entreno» se queda sin
   campos y enseña el programa con los ejercicios **uno debajo de otro**; la
   sesión pasa a **ruta propia** (cabecera propia, sin cinta, columna de 620,
   campos de kg y reps, historial por ejercicio). Toca `routes.jsx` y el
   estado de sesión —que ya existe: `BarraDeSesion`, `SesionAMedias`,
   `FocoDeLaSesion`—, así que **no es maquetación**. Aquí entra también la
   columna «Antes» y la dieta en columna con una sola opción a la vista.
4. **La voz y los remates.** Un solo vocabulario (E‑09) con rebote de rutas;
   estados en píldora (E‑12); una gráfica con menos de tres puntos se escribe
   en vez de dibujarse (E‑08); Progreso baja a dos matices (E‑07).

## Las tres decisiones del dueño

1. **¿La cinta del portal se va a oscuro?** Recomendado: sí.
2. **¿Inter o Archivo para la interfaz?** Hay interruptor en el prototipo.
   Recomendado: Inter, que es lo que ya se aprobó el 12 de septiembre.
3. **¿«Progreso» sobrevive como pantalla** o sus cifras se reparten entre las
   teselas de las otras cinco? Recomendado: sobrevive, solo con lo histórico.
