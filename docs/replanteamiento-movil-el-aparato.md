# El teléfono es otro aparato

Replanteamiento del móvil del 12 de septiembre de 2026, a partir de **tres
capturas del dueño con la app en la mano** (Revisión, Inicio y Dieta, en tema
oscuro), **las 44 capturas de la app de cliente de Coachway**
(`capturas/referencias/coachway/features app y movil/`) y **las 9 de la app
móvil de Efort** (`capturas/referencias/efortcoach/app movil/`), contrastadas
archivo a archivo contra el código.

> **Su veredicto, literal:** «Veo demasiada información, no es nada cómoda ni
> intuitiva, no parece una app móvil, sino una adaptación de lo que está en la
> web del PC.»
>
> Tiene razón, y no es una impresión: **es literalmente lo que hace el código**.
> El §1 lo demuestra con cifras.

> **Se ve tocándolo:** [`movil-el-aparato.html`](movil-el-aparato.html) — las
> cuatro pantallas a 390 px, clicables, con el conmutador **Antes / Después**
> encima de cada una.

Este estudio **sustituye la visión** de
[`replanteamiento-movil.md`](replanteamiento-movil.md) (cinco vueltas, 11–12
sep). Lo que aquel construyó —la sesión como estado, la cinta de hojas, la
pastilla del pulgar, la regla— **no se tira: es el cimiento**. Lo que cambia es
el marco que lo rodea, que es lo que el dueño está mirando.

---

## 1 · Por qué parece la web del PC: no lo parece, lo es

Siete hallazgos, todos verificados en el código o medidos sobre sus propias
capturas (escala 390/331 = 1,178; la pantalla útil de Safari en un iPhone 13 son
**664 px**, medidos en la 2.ª vuelta).

### 1.1 · El portal del cliente son las pantallas del entrenador con una prop

No es una metáfora. Es la firma de los componentes:

| Pantalla del cliente | Lo que monta |
|---|---|
| `ClientStart` (Inicio) | `<Dashboard audience="client" />` — **el panel del entrenador entero**, 405 líneas y doce tarjetas |
| `ClientCheckInsRoute` (Revisión) | `<AnthropometryPanel audience="client">` + `<ReviewHistory audience="client">` |
| `ReviewLayout` | `audience="client"` |

**Dieciséis componentes del producto aceptan `audience`.** Un interruptor no es
un diseño: es la misma pantalla con dos permisos. Por eso la Revisión del
cliente acaba con el «Check-in semanal · Anterior / Siguiente» del entrenador al
pie, que es lo que se ve en su captura.

Ni Coachway ni Efort hacen esto. Los dos tienen **dos productos**: un panel web
para el entrenador y una app para el atleta, con piezas distintas.

### 1.2 · El cromo de escritorio viaja al teléfono

`Header.jsx` se monta en el portal: **Logo + «Buscar ⌘K» + campana + avatar**,
58 px pegados arriba con cristal (`--header-h`, `chasis.css:15`).

Un **buscador con atajo de teclado** en el teléfono de un cliente que tiene
cinco pantallas. `paletteShortcut()` le dibuja un `⌘K` a alguien que no tiene
teclado.

- **Efort** pone ahí su logo y el estado de sincronización. Nada más.
- **Coachway** pone ahí **la marca del entrenador** (portada con foto y logotipo:
  «AURA · ONLINE COACHING»). Es su jugada de marca blanca, y es contenido, no
  cromo.
- Nosotros ponemos un buscador de escritorio.

### 1.3 · Cuatro planos antes del primer dato, medidos en sus capturas

**Mi revisión**

```
  0 ─  57  cabecera (logo · buscar ⌘K · campana · avatar)
 57 ─  90  banda «Estás viendo el portal de Javier López»
104 ─ 132  fichas Check-in / Fotos
155 ─ 191  «Mi revisión» (h1 a 42 px)
    ~198   «Semana 17 · te toca hoy»
    ~236   empieza la primera caja
    ~342   ← el ÚNICO verbo de la pantalla: «Entregar mi semana»
```

**236 px —el 36 % de la pantalla— gastados antes de que empiece el contenido.**
Y el único verbo cae a 342 px del borde: en el tercio medio, que es la zona a la
que el pulgar **no** llega sin recolocar la mano.

**Mi dieta** es peor: la primera cifra de la pantalla —**2300 kcal**, que es
literalmente a lo que se entra— cae a **~598 px**. En una pantalla de 664, el
dato está en el último centímetro del primer pantallazo. Encima de él: título,
subtítulo, un párrafo de tres líneas explicando qué es una dieta por macros, y
dos cajas de pautas.

**Mi inicio**: la gráfica cae por debajo del pliegue.

> **La misma medida, reproducible.** Las cifras de arriba salen de sus capturas,
> que están en modo «Ver como» y por tanto llevan la banda de previsualización
> (33 px) que un cliente de verdad no ve. Para poder medir los dos lados con la
> misma regla, el prototipo reconstruye el «Antes» desde el código y con los
> tokens del producto, y **lleva su propia cinta métrica**: mide en vivo dónde
> cae lo primero que cada pantalla tiene que decir. Medido con Chromium:
>
> | Pantalla | Lo primero · **ANTES** | · **DESPUÉS** |
> |---|---|---|
> | Hoy | «Seguir», a **326 px** | «Seguir donde lo dejaste», a **193 px** |
> | Entreno | — | «Empezar la sesión», a **84 px** |
> | Dieta | «2300 kcal», a **668 px** | la cifra del día, a **149 px** |
> | Revisión / Tú | «Entregar mi semana», a **355 px** | «Empezar», a **191 px** |
>
> Y las cuatro pantallas del «Después» **caben enteras sin bajar**: la última
> fila de la portada cae a 571 px, con la barra del pulgar a 596.
>
> El 355 del prototipo y el 342 de su captura coinciden dentro del 4 %, así que
> la reconstrucción es fiel. En la dieta la reconstrucción es **más severa** que
> la app real (668 contra los ~565 de su captura sin la banda), porque reparte
> el aire de `--s5` entre todos los bloques y la app real aprieta alguno. La
> conclusión no cambia en ninguna de las dos medidas: **la cifra de la dieta no
> entra en el primer pantallazo.**

De referencia, medido sobre sus propias láminas (escalando el móvil de la
maqueta a 390 px de ancho): **la portada de Efort pone el entrenamiento de hoy a
~160 px**. Coachway es más caro —su portada abre con la portada de marca del
entrenador, que se lleva unos 200 px— pero su verbo («Start check-in») es **la
primera pieza después del saludo**, no la cuarta.

### 1.4 · La pantalla se explica a sí misma, tres veces seguidas

En la dieta, por este orden:

1. La pestaña de abajo dice **«Dieta»**.
2. El `h1` dice **«Mi dieta»** (42 px, `--fs-2xl`).
3. El subtítulo dice **«Lo que te ha pautado tu entrenador, comida a comida.»**
4. Y un párrafo dice **«Tu plan es por macros: no hay un menú cerrado, sino los
   objetivos de arriba. Reparte los alimentos como quieras siempre que cuadres
   esas cifras al final del día.»** (`ClientDiet.jsx:304`)

Cuatro renglones para decir lo que la pantalla ya enseña. Lo mismo en la
revisión: *«Cuando la tengas lista, entrégala para que tu entrenador la
revise.»* + *«Confirmas el peso, subes las fotos y ya está.»*
(`ClientWeek.jsx:223` y `:264`) — dos frases de manual alrededor de un botón.

**Ni una sola pantalla de Efort tiene título de página.** Coachway tiene uno y
es «Hey Jane!».

### 1.5 · Caja dentro de caja dentro de caja

`ClientDiet.jsx` pinta **nueve `Panel`**. `AnthropometryPanel`, seis. En la
captura de la dieta se ven tres niveles seguidos: el panel «Pautas de tu
entrenador» → dos sub-tarjetas («Agua», «Fuera de casa») → dentro, título y
texto.

El `Panel` es una primitiva de escritorio: **sirve para recortar una columna
dentro de un ancho de 1440**. En 390 px el ancho de la pantalla ya es el
contenedor, así que cada caja solo añade dos filetes, dos radios y 40 px de
relleno lateral que le quita al contenido.

Las dos referencias hacen lo contrario: **grupos de filas sobre el papel**, con
filete entre filas y un rótulo pequeño encima. La pantalla «Steps» de Coachway
es una lista de doce renglones `fecha → cifra` sin una sola tarjeta dentro.

### 1.6 · Las gráficas son instrumentos de escritorio metidos con calzador

`Trayectoria.jsx` mide **124 px de alto** con `PAD = {left: 36, right: 62}`. En
un teléfono, descontando el margen de página y el relleno del panel, quedan
~306 px de ancho: **98 px son ejes y 208 px son curva**. Un tercio del lienzo es
regla. Con doce semanas, cada semana mide 17 px, y las etiquetas van a 9-10 px.

Eso es lo que él llama «las gráficas horribles», y es exacto: es un instrumento
diseñado para 520 px de costado, encogido a la mitad sin rediseñarse.

`ui/charts.jsx` exporta ocho instrumentos (`BandChart`, `BarBandChart`,
`Sparkline`, `ProgressRing`, `MacroDonut`, `MeterList`, `StackedShareChart`…).
El cliente hereda cinco a través del `Dashboard`. **Ninguno se pensó para una
mano.**

### 1.7 · Cinco pestañas, ninguna es un verbo, y cero imágenes

- **Inicio · Rutina · Dieta · Revisión · Calendario**: cinco archivadores. Son
  sitios donde se guarda algo, no cosas que se hacen. Coachway pone
  Today/Chat/Food/Workouts/Profile —con **Chat**, que es lo que un cliente abre
  de verdad—. Efort pone cuatro iconos.
- **`grep` de `<img>` en todo `src/components/Client/`: un resultado**, y es la
  foto que sube el propio cliente. Cero fotos de ejercicio, cero platos, cero
  cara del entrenador. Las dos referencias llevan miniatura real en cada
  ejercicio. Ya estaba escrito como pendiente en la 3.ª vuelta («lo que no se
  arregló es la carne») y sigue igual.

### 1.8 · Y un hallazgo que conviene saber: está juzgando el tema sin terminar

Desde el 11 de septiembre **la app arranca en claro** (`lib/useTheme.jsx`), y
todo el acabado de la tanda 0 —papel templado, sombras teñidas con la tinta del
papel, secundario subido a 7,8:1, radios +1— **se hizo solo en el tema claro**.
Sus tres capturas son del oscuro, donde el portal sigue siendo el de la v1.

No es una excusa: **los siete hallazgos de arriba son ciertos en los dos
temas**. Pero el hierro del portal es trabajo que falta, y hay que contarlo.

---

## 2 · Las tres leyes del aparato

### Ley 1 · La app no se presenta, se pone a trabajar

**Fuera el titular de pantalla en el teléfono.** La barra del pulgar ya dice
dónde estás; repetirlo a 42 px gasta el 15 % del alto en decir lo sabido. Arriba
va **el estado** —una línea de 13 px— y debajo, inmediatamente, la cosa.

Y fuera la prosa explicativa: una app no se explica, se usa. Lo que hoy es un
párrafo pasa a ser, o nada, o una línea en el sitio donde hace falta.

> **La regla dura, y es medible:** en el teléfono, **el primer dato o el primer
> verbo de cada pantalla está por encima de los 260 px.**
> Hoy: Revisión 342 · Dieta 598 · Inicio ~700.

### Ley 2 · Una pantalla, un sujeto; lo demás se empuja

El escritorio apila paneles porque tiene ancho de sobra y el ojo salta. El
teléfono no apila: **empuja**. Todo lo secundario deja de ser un panel más abajo
y pasa a ser **una fila que abre su propia pantalla**, o una hoja que sube.

El scroll deja de ser la navegación. Hoy la navegación del portal es *bajar*, y
por eso «hay demasiada información»: está toda a la vez porque no hay otro sitio
donde ponerla.

### Ley 3 · El cliente deja de heredar el instrumental del entrenador

Se acaban las props `audience` en el teléfono. El cliente tiene **sus piezas**, y
son pocas: una cifra grande, una línea sin ejes, una lista de filas.

> **La gráfica del entrenador no baja al móvil.** Baja **una cifra y una
> tendencia**; quien quiera la curva la abre tocando la cifra. Un panel de
> análisis es para quien analiza doce personas, no para quien se pesa.

---

## 3 · El chasis: lo que desaparece

**No hay cabecera.** Los 58 px vuelven al contenido. Sus cuatro piezas:

| Pieza | Adónde va |
|---|---|
| Buscar `⌘K` | **Fuera.** Cinco pantallas no se buscan, y no hay teclado |
| Campana | A la portada, que ya tiene `ClientUpdates`, + punto en la pestaña |
| Avatar / cuenta | A la pestaña «Tú» |
| Logo | **Decisión abierta:** aquí es donde Coachway pone la marca del entrenador |

**Cuatro destinos, no cinco.** Y el criterio es cuántas veces al mes se abre:

```
  Hoy        Entreno        Dieta          Tú
  ───        ───────        ─────          ──
  lo que     la cinta       el día         la revisión, las fotos,
  toca y     de hojas       y sus          el peso, el calendario,
  lo que                    comidas        tus datos, tu cuenta
  espera
```

«Calendario» no es un destino de barra: se abre dos veces al mes. **«Revisión»
tampoco**, y esto es lo contrario de esconderla: **el ritual se convoca desde
Hoy**, con su tarjeta y su verbo, que es exactamente lo que hace Coachway con su
«Time for a check-in · Start check-in». Una pestaña permanente para algo que
importa un día de cada siete es una pestaña apagada seis días.

---

## 4 · Las cuatro pantallas

### 4.1 · Hoy

**Antes:** saludo a 42 px → sesión a medias → avisos → tu peso → `GroupHead «Tu
progreso»` → **el panel del entrenador entero** → entregables → carpeta. Siete
bloques; la gráfica bajo el pliegue.

**Después**, de arriba abajo y todo por encima de los 500 px:

1. **Una línea de estado**: `Jueves 12 · Bloque 2, semana 10 de 10`. 13 px.
2. **La tarjeta de hoy**, y solo una: o «La dejaste a medias · Pull A · Seguir»,
   o «Hoy te toca Pull A · Empezar», o «Descansas». Es la única superficie
   elevada de la pantalla y lleva el único botón lleno.
3. **Tu peso**, como cifra: `76,9 kg` a 42 px, con la regla debajo
   (empezaste → hoy → objetivo). Se toca y sube la curva.
4. **Tres filas**, sin cajas: `Tu semana · te toca hoy ›` · `Tu progreso ›` ·
   `Lo que te ha dejado tu entrenador · 2 ›`.

El panel de progreso **no desaparece**: deja de ser el pie de la portada y pasa
a ser su propia pantalla, detrás de la fila. Es la Ley 2 aplicada: la misma
información, a un toque en vez de a cuatro pantallas de scroll.

### 4.2 · Entreno

Aquí el cimiento está bien y se conserva entero: **la cinta de hojas**, una hoja
por sesión, el gesto de deslizar, la pastilla del pulgar, la sesión como estado.
Lo que cambia es el marco:

- **La cabecera de la sesión es el chasis**, como en Coachway: nombre de la
  sesión, cuántos ejercicios, y **la regla de la sesión** —un tramo por
  ejercicio— pintada en el canto. No hay `h1` de pantalla, no hay migas.
- **Cada ejercicio abre con su miniatura**, si la hay. Es la diferencia visual
  más grande entre nuestra hoja y las dos referencias, y no es de estilo: una
  lista de nombres es un índice, una lista con cara es un programa.
  **Esto depende de la decisión de la 4.ª vuelta** («el vídeo no pasa por la
  app, todo WhatsApp»), y es una decisión que conviene revisar: la miniatura no
  es el vídeo.
- **Fuera el registro con cajas**: la serie es un renglón de tabla —`serie ·
  objetivo · kg · reps · ✓`— como Efort. Hoy cada serie es una tarjeta.

### 4.3 · Dieta

**Antes:** título, subtítulo, párrafo de tres líneas, pautas en caja doble,
«Objetivo» en caja con una tabla dentro, «Pasos diarios» en otra caja. La cifra,
a 598 px.

**Después:**

1. **La cinta de días arriba** —`L M X J V S D`, el de hoy encendido, los altos
   marcados—. Es el único mando y es la firma de la pantalla.
2. **La cifra del día, a 200 px**: `2300 kcal`, y debajo los tres macros en una
   sola línea de tres columnas, sin caja, sin anillos.
3. **Las comidas**, plegadas, una fila cada una.
4. **`Pautas de tu entrenador · 2 ›`** — una fila. Son dos frases que se leen
   una vez en la vida, no el segundo bloque de la pantalla.
5. **`Pasos · 11.000 ›`** — otra fila.

El párrafo de los macros: **se borra**. Si hace falta explicarlo, cabe en el pie
de la cifra, en cinco palabras: *«reparte como quieras, cuadra el día»*.

### 4.4 · Tú

La pantalla que no existe y que recoge lo que hoy está tirado por el pie de
Inicio (`ClientCalendarFeed`, `ClientPrivacy`, `ClientFolder`), en la 5.ª
pestaña y en el menú de la cabecera:

- Arriba, **la semana**: entregada / te toca hoy / revisada, con su verbo.
- **Tus fotos**, en grande y deslizables —como Coachway—, no tres columnas de
  110 px con título y descripción cada una.
- Y filas: `Tu peso y tus medidas ›` · `Tu calendario ›` · `Tus documentos ›` ·
  `Tus datos y privacidad ›` · `Tu cuenta ›`.

---

## 5 · La firma: la regla, y nada más

La casa ya tiene su firma y es la correcta —viene del oficio, no de un catálogo
de estilos—: **la regla graduada**, el canto de la cinta métrica.

Está medio construida (`TuPeso` es ya una aguja; la regla de la sesión está
especificada). La apuesta es **jugárselo todo a ella y retirar lo que compita**:

| Dónde | Qué mide |
|---|---|
| Hoy | **la regla del peso** — empezaste · hoy · objetivo |
| Entreno | **la regla de la sesión** — un tramo por ejercicio, una muesca por serie |
| Dieta | **la cinta de días** — siete muescas, la de hoy encendida |
| Tú | **la regla de las semanas** — una muesca por semana, las entregadas marcadas |

Un instrumento, cuatro lecturas, y es literalmente de lo que va el producto:
medir. **Fuera de la regla, en el teléfono no hay ninguna otra gráfica** —solo
detrás de un toque.

---

## 6 · Lo que NO se copia

- **De Coachway, no se copia el verde ni la serif itálica.** Es su firma; con
  ella puesta somos una copia peor. Lo que sí se le copia es estructural: la
  portada con un solo verbo, la lista sin cajas, la foto grande, la ficha del
  ejercicio en hoja con pestañas (Detalles / Notas / Historial / Gráficas).
- **De Efort, no se copia la densidad.** Su tabla de series a cuatro columnas
  funciona para un powerlifter que mira RPE; para el cliente medio es una hoja
  de cálculo. Lo que sí se le copia: **cero títulos de página**, la cabecera de
  una línea, la portada que enseña el entreno de hoy y punto.
- **Y no se copia el contador de calorías de nadie.** Está decidido: **la dieta
  pauta, no contabiliza** — sin anillos, sin código de barras.

---

## 7 · Los movimientos

| # | Movimiento | Dónde |
|---|---|---|
| **Tanda 1 · el marco** | | |
| `A-01` | Fuera `Header` del portal en <640; los 58 px al contenido | `App.jsx`, `Header.jsx` |
| `A-02` | Fuera `PageHead` del portal en <640; entra `EstadoDePantalla` (una línea) | `ClientStart`, `ClientDietRoute`, `ClientCheckInsRoute`, `ClientRoutineRoute` |
| `A-03` | **Profundidad máxima 1**: `Panel` pierde caja en <640 y entra `ui/Grupo` (filas sobre papel) | `piezas.css`, `ui/primitives` |
| `A-04` | Cuatro destinos: `Hoy · Entreno · Dieta · Tú`; nace `/mi/tu` | `routes.jsx`, `ClientLayout` |
| **Tanda 2 · las pantallas** | | |
| `A-05` | `Hoy`: una tarjeta + tres filas; el `Dashboard` sale de la portada a `/mi/progreso` | `ClientStart` |
| `A-06` | `Dieta`: cinta de días, la cifra a 200 px, pautas y pasos a filas; muere el párrafo | `ClientDiet` |
| `A-07` | `Tú`: la pantalla nueva, con las fotos en grande | nuevo |
| `A-08` | Se retiran las props `audience` del portal en el teléfono | 16 archivos |
| **Tanda 3 · la carne y el acabado** | | |
| `A-09` | Las gráficas del cliente: una cifra + una línea sin ejes; la curva, a un toque | `Trayectoria`, `charts.jsx` |
| `A-10` | La miniatura del ejercicio (**depende de la decisión del §8.2**) | `ExerciseList`, `FichaEjercicioCliente` |
| `A-11` | El registro de la serie: renglón de tabla, no tarjeta | `SetCell`, `ExerciseList` |
| `A-12` | **El hierro del portal**: aplicarle el acabado que solo tiene el papel | `tokens.css` |

---

## 8 · Las decisiones que no son mías

1. **¿Cuatro pestañas y «Tú», o se quedan las cinco?** Cambia el aterrizaje del
   portal, que él aprobó hace cuatro días. Recomiendo cuatro.
2. **¿Entra la miniatura del ejercicio?** El 10 de septiembre decidió que el
   vídeo va por WhatsApp. Una miniatura no es un vídeo, y es la diferencia más
   visible con las dos referencias. Recomiendo que sí, con la foto que el
   entrenador ya puede subir a la ficha.
3. **¿La cabecera del cliente lleva la marca del entrenador?** Es la jugada de
   marca blanca de Coachway y es una decisión de producto y de precio, no de
   diseño.
4. **¿Chat?** Coachway lo tiene de segunda pestaña y es lo que más se abre.
   Nosotros no tenemos ninguno y todo va por WhatsApp. No lo propongo —es una
   fase entera—, pero es el hueco más grande frente a la referencia.
5. **¿Se trabaja el hierro del portal o el teléfono arranca en claro como el
   resto?** Sus capturas son del tema que no se ha terminado.
