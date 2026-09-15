# El portal no es una vista: es un producto

Replanteamiento completo del portal del cliente — **13 de septiembre de 2026**.

Escrito con la aplicación delante: cuenta de cliente real
(`marta@ejemplo.invalid`) contra la base local, capturada a **1440, 834 y 390 px**
en tema claro. Las láminas están en `capturas/portal-13sep/`.

> **Se ve tocándolo:** [`portal-cliente.html`](portal-cliente.html) — las cuatro
> pantallas, clicables, con el conmutador **Antes / Después** y **Teléfono / PC**.

## Qué relación tiene con lo que ya hay

El 12 de septiembre, [`replanteamiento-movil-el-aparato.md`](replanteamiento-movil-el-aparato.md)
diagnosticó lo mismo **para el teléfono** y de sus doce movimientos se
construyeron ocho: `A-01`…`A-07` están en el árbol, sin commitear. Ese trabajo
**no se tira y no se repite**: la barra del pulgar, los cuatro destinos, la cinta
de días, la cifra del día, `ClientTu` y la línea de estado son el suelo de lo que
viene aquí.

Lo que aquel estudio dejó fuera es exactamente lo que falta:

1. **Solo bajó a `max-width: 639.98px`.** A 834 y a 1440 px el portal sigue
   siendo, literalmente, el de antes — con la cabecera de CAVEMAN HUB incluida.
2. **Era un plan de resta.** Quitó cabecera, título, párrafos y cajas. El
   encargo de hoy también pide lo contrario: que sea vistoso, que enganche, que
   se entienda de un vistazo. Eso hay que ponerlo, no quitarlo.
3. **Su tanda 3 —la traducción del contenido del entrenador— no se hizo.**
   `A-08`…`A-12` siguen abiertos, y ahí está el fallo más gordo del producto,
   que el §2.3 documenta por primera vez.

---

## 1 · El chasis: a 834 y a 1440 el portal es la app del entrenador

### 1.1 · La cabecera fea existe, y existe en dos de los tres anchos

`piezas.css:2855` la esconde: `body:has(.layout-portal) .app-header {display:none}`
— **dentro de un `@media (max-width: 639.98px)`**. Por encima de 640 px el
cliente sigue viendo los 58 px de `Header.jsx`:

```
[▦ CAVEMAN HUB]                      [🔍 Buscar Ctrl K]  [ME]
```

Tres piezas y ninguna es suya: la **marca del fabricante** (él contrató a una
persona, no a una plataforma), un **buscador con atajo de teclado** sobre cuatro
pantallas, y su avatar, que ya tiene sitio en «Tú».

### 1.2 · En la tableta se ven las DOS navegaciones a la vez

Medido a 834 px (`capturas/portal-13sep/tablet-inicio.png`): arriba la cabecera
con el buscador, abajo la barra del pulgar con los cuatro destinos. Dos chasis
apilados sobre **1.112 px de alto de los que 560 están vacíos**.

### 1.3 · En el PC no hay diseño de escritorio: hay el móvil estirado

A 1440 px el portal es `layout-narrow` a lo ancho, y lo que se estira son piezas
pensadas para una mano:

| Pieza | En el teléfono | A 1440 px |
|---|---|---|
| La regla del peso | 340 px de recorrido | **1.780 px** de recorrido para 6 kg |
| La fila «Tu progreso ›» | el galón a 24 px del texto | el galón a **1.850 px** del texto |
| La cinta de días | siete muescas seguidas | siete rótulos separados **270 px** |
| La tarjeta de la sesión | 330 px de alto, llena | 330 px de alto, **1.900 de ancho** |

Y las pantallas acaban a media página: `/mi/dieta` mide **900 px de alto en una
ventana de 900**, con dos tercios en blanco.

### 1.4 · Lo que se propone: dos muebles, no dos productos

> **Corrección del dueño (13 sep), y manda.** La primera versión de este estudio
> proponía **un folio de 560 px en los tres anchos**: el mismo mueble en todas
> partes. Su respuesta fue que no — *«en el móvil ha de ser muy sencilla y fácil;
> en el PC puede replantearse de otra forma y darle más información»*. Tiene
> razón, y lo que sigue es la versión corregida.

Un cliente **de pie en el gimnasio** y un cliente **sentado en su casa un domingo
por la tarde** no vienen a lo mismo. El primero viene a hacer una cosa; el
segundo viene a mirar cómo va. Darles la misma pantalla es el mismo error que
darle al cliente la del entrenador, un piso más abajo.

**El teléfono ejecuta la jornada. El escritorio es el repaso.**

Y lo que hace que esto **no sean dos productos que mantener** es dónde está la
costura, que ya existe:

> En el teléfono, todo lo secundario está **a un toque** —la curva detrás de la
> cifra, el histórico detrás del ejercicio, las equivalencias detrás del
> alimento—. **Ese segundo nivel es la página derecha del escritorio.** Mismo
> contenido, mismo componente, otro mueble: en el móvil sube como capa, en el PC
> está abierto al lado.

No hay un «modo PC» con datos que el móvil no tenga. Hay **una arquitectura de
dos niveles** que en 390 px se recorre tocando y en 1440 px se ve entera.

```
TELÉFONO — una cosa a la vez        ESCRITORIO — el cuaderno abierto
┌───────────────────┐              ┌────┬────────────────┬────────────────┐
│ ▏▎▍▌▋▊▉ la cinta  │              │ ⌂  │ ▏▎▍▌▋▊▉▉▊▋▌▍▎▏ la cinta         │
├───────────────────┤              │Hoy ├────────────────┼────────────────┤
│  lo que toca      │              │ ▤  │                │                │
│  la cifra         │              │Ent │  LO PAUTADO    │  LO QUE PASÓ   │
│  ▔▔▔●▔▔▔          │              │ ◗  │  lo que toca   │  lo tuyo       │
│  fila ›  ────────────╮           │Die │  hacer         │                │
├───────────────────┤  │ a un      │ ☺  │                │  ← lo que en   │
│ Hoy Ent Die  Tú   │  │ toque     │Tú  │                │    el móvil    │
└───────────────────┘  ╰──────────────────────────────────  es una capa   │
                                   └────┴────────────────┴────────────────┘
```

El nombre del mueble de escritorio es literal y sale del oficio: **el cuaderno de
entreno abierto**. Página izquierda, lo que hay que hacer; página derecha, lo que
ya hiciste. La cinta graduada cruza las dos por arriba.

La cabecera de la marca **no existe en ninguno de los tres anchos**. La tableta
(834 px) se comporta como el teléfono: una página y la barra del pulgar. El
cuaderno se abre a partir de **1024 px**, que es donde caben dos páginas de 440
sin apretar ninguna.

### 1.5 · Qué enseña el escritorio, sección por sección

Todo lo de la columna derecha **es dato del cliente que ya está en la base**; no
hay ni una pieza nueva de dominio.

| | Página izquierda · lo pautado | Página derecha · lo tuyo | Qué gana frente al móvil |
|---|---|---|---|
| **Hoy** | **la semana entera**: los 7 días en filas — qué sesión, qué día de dieta, si te pesaste, si entregaste | tu peso con la regla y **la curva**, y la última nota de tu entrenador | el móvil solo dice **hoy**; aquí se ve la semana |
| **Entreno** | la sesión completa, ejercicio a ejercicio, apuntable | **tu histórico de ESE ejercicio**: kg × reps semana a semana, y la indicación de tu entrenador | en el móvil es una línea («la vez anterior 100 × 8»); aquí son ocho semanas |
| **Dieta** | el día con **todas las comidas desplegadas** | las **equivalencias** del alimento en el que estás, y las pautas escritas | en el móvil las comidas van plegadas y las equivalencias, a dos toques |
| **Tú** | **las fotos comparadas**: semana 1 al lado de hoy, los tres ángulos, grandes | **el hilo**: semana a semana, lo que entregaste y lo que te contestó (`check_ins.coach_notes` + los vídeos de `review_links`) | en el móvil son tres recuadros de 110 px y una lista |

### 1.6 · La ley que impedía que esto volviera a ser el panel del entrenador

> ## ⚠ ESTA LEY LA LEVANTÓ EL DUEÑO EL 14 DE SEPTIEMBRE
>
> Su encargo fue literal: *«para el rediseño del pc del cliente parte de la
> aplicación del entrenador, está bien que el cliente pueda ver información de
> volumen, gráficas de dieta y progreso etc.»*. Preguntado en directo por esta
> contradicción, la zanjó así: **«estaría bien que el pc le permitiese al
> cliente ver información útil para él»**.
>
> Lo que cambia y lo que no:
>
> - **El filtro deja de ser DE QUIÉN ES EL INSTRUMENTO y pasa a ser PARA QUÉ LE
>   SIRVE A ÉL.** Los kilos que ha movido cada semana, la curva de su peso, la
>   evolución de sus calorías y la progresión de un ejercicio suyo son datos
>   sobre él: bajan. La mesa de reparto de la dieta —con la que se MONTA un día,
>   no con la que se come— no baja, y no por ser del entrenador sino porque no
>   contesta ninguna pregunta suya. Es la misma criba, con mejor criterio.
> - **La traducción del §2.4 sigue en pie y ahora pesa MÁS**, no menos: si baja
>   el instrumento, tiene que bajar hablando su idioma. «MRV», «microciclo»,
>   «tonelaje» y «adherencia» siguen sin poder escribirse en su pantalla.
> - **`P-04` queda cancelado tal como estaba escrito** («fuera MRV, tonelaje y
>   mapa corporal»). Se reescribe como traducción, no como amputación.
> - **La ley que SÍ se conserva entera** es la de más abajo aplicada al
>   teléfono: allí no cabe todo y el criterio de qué baja no cambia. El
>   escritorio es el que se abre.
>
> Lo que sigue queda como estaba escrito, para que se vea qué se levantó.

### 1.6-bis · El texto original de la ley

«Más información en el PC» es **exactamente** el argumento que produjo el
`Dashboard` con MRV dentro del portal. Así que el permiso viene con su ley:

> **En el escritorio el cliente tiene más de LO SUYO. Nunca los instrumentos del
> entrenador.**
>
> **Lo suyo** — lo que ha hecho, lo que le han dicho, lo que le toca, sus fotos,
> su peso, su comida. Cabe todo.
>
> **Del entrenador** — el porqué: MRV, tonelaje por microciclo, volumen por
> grupo, adherencia, «en rumbo», la mesa de reparto. **No baja ni a 1440 px.**

Y el vocabulario **no cambia con el ancho**: la tabla del §2.4 vale igual en el
teléfono y en el cuaderno.

---

## 2 · El contenido del entrenador no está traducido

Esto es el corazón del encargo y es donde está la avería de verdad.

### 2.1 · Dieciocho componentes se pintan con una prop

`grep -rl audience src/components/` → **18 archivos**. El portal monta las
pantallas del entrenador con `audience="client"`:

| Ruta del cliente | Lo que monta de verdad |
|---|---|
| `/mi/progreso` | `<Dashboard audience="client" />` |
| `/mi/evolucion` | `<AnthropometryPanel>` + `<ReviewHistory>` |
| `/mi/calendario` | `<CalendarPanel audience="client" />` |
| `/mi/dieta` (macros) | `<PlanDia>` — la mesa de reparto del entrenador |

### 2.2 · Lo que eso le hace leer, contado de su pantalla

**`/mi/progreso` en el teléfono** (`capturas/portal-13sep/movil-progreso.png`,
**2.482 px de alto: 3,7 pantallas**):

- *«En rumbo: -0,34 kg/semana. Objetivo: -0,3 kg/semana (0.5 % del peso). Media
  de 8 semanas.»* — un **veredicto** sobre su plan. La casa tiene decidido que
  la aplicación resalta información y **no receta**; aquí le está poniendo nota.
- *«Bloque 1 · M1–10 · 75 series/microciclo · 28 % registradas»*
- *«Tonelaje por microciclo»*, en barras **violetas**.
- *«Volumen del bloque»* con mapa corporal y una leyenda que dice **`sin series`
  → `MRV`**. MRV es *maximum recoverable volume*. En la pantalla de un cliente.

**`/mi/evolucion` a 1440** (`pc-evolucion.png`): siete campos de pesaje, una
curva con el eje en **`2026-07-06`** (fecha ISO), cuatro tarjetas —«Último peso ·
Media últimos 3 · **Variación total** · **Ritmo semanal**»— y una tabla de **31
registros con papelera en cada fila**. Y el mismo dato, su peso, sale **azul** en
las tarjetas y **ámbar** en la tabla: dos tintas para una cifra, que es
justamente lo que la ley del color de la casa prohíbe.

**`/mi/tu`** enseña *«Se te quedaron sin entregar:»* y cuatro botones con cuatro
semanas. Un muro de reproche a quien entra a hacer lo de esta semana.

### 2.3 · LA AVERÍA: en un plan por macros, la comida no le llega

Verificado en el código y reproducido con datos reales.

`ClientDiet.jsx:243` pinta las comidas dentro de `{cerrado && …}`, donde
`cerrado = plan.type === 'closed'`. **Con `type === 'macros'` —que es el valor
por defecto de `emptyNutrition()` y el de cinco de los seis clientes de la
demo— `MealCard` no se monta nunca.** Lo que se pinta en su lugar es `PlanDia`,
que es la mesa del entrenador.

Sembré en la base local el plan de Marta con lo que un entrenador escribe de
verdad: dos días (Entreno / Descanso), el reparto de la semana, **7 comidas, 8
opciones y 21 alimentos con sus gramos**. Esto es lo que ella ve
(`dieta2-pc-dieta.png`):

```
                      KCAL     P     C     G    PESO
  Objetivo del plan   1750   140   150    62
1 Desayuno              —     —     —     —    20 %
2 Comida                —     —     —     —    27 %
3 Cena                  —     —     —     —    15 %
  Repartidas            —     —     —     —    sin repartir
  Suman                1078   114    75    36    62 %
  con las opciones abiertas
```

**Ni un alimento.** Los 21 que le escribió su entrenador están en la base de
datos y no llegan a la pantalla. Lo que llega es una hoja de cálculo con
guiones, «Repartidas», «sin repartir» y un «62 %» que ella no sabe qué juzga.

Es la mitad de un producto de asesoría que no se entrega. Es el primer
movimiento de la lista y no admite discusión de diseño.

### 2.4 · El vocabulario, pantalla por pantalla

Medido sobre el `innerText` de las seis rutas:

| Ruta | Palabras | Jerga del entrenador que aparece |
|---|---|---|
| `/mi/inicio` | 69 | Bloque, fase |
| `/mi/rutina` | 260 | microciclo ×3, Bloque ×2, pautado, series ×4 |
| `/mi/dieta` | 90 | Repartidas, sin repartir, Suman |
| `/mi/tu` | 100 | — |
| `/mi/evolucion` | 191 | Variación total, Ritmo semanal, Media últimos, Check-in ×2 |
| `/mi/progreso` | 220 | microciclo ×4, MRV ×2, Bloque, series ×2 |

Lo que se propone no es un diccionario: es **borrar el instrumento y escribir la
frase del cliente**. Donde no se puede borrar, se traduce.

| Dice hoy | Dirá |
|---|---|
| `Bloque 1 · Microciclo 10 de 10` | `Semana 10 de 10` |
| `38 de 40 entrenamientos · 95 % de lo pautado` | `38 entrenamientos desde el 2 de julio` |
| `Tonelaje por microciclo` | `Los kilos que has movido cada semana` |
| `Volumen del bloque · MRV` | *(fuera del portal)* |
| `En rumbo: -0,34 kg/semana` | `Bajas 0,3 kg por semana. Es lo que te puso tu entrenador.` |
| `Variación total` / `Ritmo semanal` | `Desde que empezaste` / `Cada semana` |
| `Repartidas` / `Suman con las opciones abiertas` | *(fuera del portal)* |
| `Check-in semanal` | `Tu semana` |
| `2026-07-06` | `6 jul` |
| `Se te quedaron sin entregar: …` | *(fuera — no se le pasa factura a nadie al entrar)* |

---

## 3 · Sus quehaceres, contados en toques

Lo que un cliente viene a hacer, y lo que le cuesta hoy:

| Quehacer | Hoy | Después |
|---|---|---|
| Ver qué le toca | 0 toques ✔ | 0 |
| Empezar y apuntar | 1 toque ✔ | 1 |
| **Pesarse** | Tú → Tu peso y tus medidas → buscar la casilla del día → escribir · **3 toques y una búsqueda** | **1: el campo está en Hoy** |
| **Ver qué come hoy** | **imposible en un plan por macros** (§2.3) | **1 toque: la comida se despliega** |
| Entregar la semana | Tú → Entregar mi semana | igual, pero **convocada desde Hoy** |
| Leer a su entrenador | no hay sitio donde viva su voz | en la línea del ejercicio y en la comida |

El pesaje es el caso claro: es lo que la asesoría le pide **cada semana**, y es
lo que está más lejos. Sube a Hoy, como una línea con su campo — no como una
pantalla a la que hay que llegar.

---

## 4 · El plan de diseño

### Color — dos tintas, y ninguna nueva

El portal **no estrena paleta**: hereda la del producto y **retira cinco**.

```
--papel    #f7f6f2     el papel templado
--tinta    #1b1a17     lo que se lee
--tinta-2  #514d45     lo que acompaña (7,8:1)
--filete   #e7e3d9     lo que separa
--señal    #3b49df     lo que se toca, y solo eso
```

Fuera del portal: el **violeta** del tonelaje, la **menta** del mapa corporal, el
**ámbar** del histórico de peso, el **verde** del «en rumbo» y el semáforo de
macros. En el portal el color no juzga a nadie: **azul lo que invita, tinta lo
que informa**. Cinco paletas menos es la mitad del «poco vistoso»: lo que hace
ruidosa una pantalla no es tener poco color, es tener cinco.

### Tipo — una familia, tres papeles

Archivo ya está autoalojada con sus tres cortes, así que esto no cuesta una
descarga:

- **Archivo Expanded 600** — las cifras y el nombre de la sesión. El dorsal.
- **Archivo 400/600** — el cuerpo.
- **Archivo *itálica* 500** — **lo que dice tu entrenador, y nada más.**

Esa tercera voz es la decisión tipográfica del portal. El portal tiene una cosa
que el panel del entrenador no tiene —**una persona hablándote**— y hasta hoy esa
persona no aparece por ninguna parte. La cursiva la hace reconocible sin añadir
ni un color ni una caja.

Escala del portal, cuatro escalones en vez de los seis del escritorio:
**34 / 20 / 15 / 13**.

### Layout — el folio

Una columna de 560 px en los tres anchos (§1.4). Profundidad máxima **1**: o
filas sobre el papel, o una tarjeta, nunca las dos anidadas.

### Firma — **la cinta graduada es el chasis**

La casa ya eligió su instrumento y viene del oficio: la regla. Lo que falta es
jugárselo del todo. **Los 44 px de arriba de cada pantalla dejan de ser un título
y pasan a ser una regla de verdad**, siempre en el mismo sitio, siempre midiendo
dónde estás:

| Pantalla | Qué mide la cinta |
|---|---|
| Hoy | las semanas del bloque · la de hoy encendida |
| Entreno | los ejercicios de la sesión · una muesca por serie |
| Dieta | los siete días del ciclo · el de hoy encendido |
| Tú | las semanas · las entregadas, marcadas |

Con ella muere la cabecera de CAVEMAN HUB: el sitio del logotipo lo ocupa una
pieza que **dice algo**. Y fuera de la cinta y de la regla del peso, **en el
portal no hay ninguna otra gráfica**: la curva se abre tocando la cifra.

### Lo que revisé de este plan antes de escribirlo

La primera versión daba a la voz del entrenador **un tinte cálido propio** y una
caja con filete a la izquierda. Es exactamente lo que saldría para cualquier
portal con mensajes dentro, y además rompía la cuenta de dos tintas justo en el
párrafo donde la defiendo. Se retira: **la voz va en cursiva y con cara**, que es
más barato y más específico. Lo que se gana en audacia se gasta entero en la
cinta.

---

## 4-bis · Lo que las referencias enseñan del teléfono (14 sep)

Repaso de las 54 capturas de **Efort** (`capturas/referencias/efortcoach/`, su
lanzamiento «A new app for your athletes») y **Coachway**
(`capturas/referencias/coachway/features app y movil/`). Lo que las dos hacen
igual, que es lo que hay que mirar:

| Lo que hacen las dos | Lo que teníamos |
|---|---|
| **Barra inferior de 5 destinos** con punto de aviso | ✅ ya, con 4 |
| **Hoja inferior con asa**, arrastrable para cerrar | ✅ ya (`Hoja`, `Modal` < 640) |
| **Pestañas dentro de la hoja del ejercicio** — Coachway: `Details · Notes · History · Charts` | ✅ ya: `Cómo · Lo que hiciste · Tu nota · Tu marca` |
| **Tira de días arrastrable** arriba de la nutrición | ✅ ya (`CintaDeDias`) |
| **Cabecera de sesión con progreso segmentado** y cronómetro | ✅ ya (`BarraDeSesion`, muescas) |
| **Gráfica de progresión por ejercicio** (Max Weight, Max Reps, Total Volume) | ❌ **faltaba** → `M-02` |
| **Deslizar entre destinos con el dedo** | ❌ **faltaba** → `M-01` |
| **Miniatura del ejercicio en cada fila** | ❌ y **no se puede**: ver abajo |

**El diagnóstico honesto es que el teléfono estaba mucho más cerca de las
referencias de lo que parecía.** Lo que faltaba no era el mueble —está
construido desde la tanda A del 12 sep— sino **dos gestos y una gráfica**.

> **La miniatura queda descartada por DATO, no por diseño.** Lo señaló el dueño
> —*«los ejercicios no tienen miniatura actualmente»*— y está verificado:
> `catalog_exercises` (0033, ampliada en 0094 con equipamiento y descripción) no
> tiene ninguna columna de imagen, y el único `<img>` del portal es la foto que
> sube el propio cliente. Ponerla cuesta columna + cubo + sembrar ~130 fichas,
> que es una tanda de contenido como la C, no un movimiento de diseño. Cierra
> la decisión 2 del estudio del 12 sep.

---

## 5 · Los movimientos

> **Estado (14 sep 2026): construida la tanda 1 y dos movimientos nuevos del
> teléfono.** Lo que está en el árbol, sin commitear, con capturas reales a
> 390/834/1440 contra la cuenta de `marta@ejemplo.invalid`:
>
> - **`P-01`** — la comida llega en un plan por macros. Verificado con el plan
>   sembrado (2 días, 7 comidas, 21 alimentos): antes la pantalla decía «1950
>   kcal» y «Pasos 9000» y nada más; ahora salen Desayuno, Comida y Cena con lo
>   que llevan. `PlanDia` sale del portal y la fila «Lo que suman tus opciones»
>   deja de colgar de `cerrado`.
> - **`P-02a`** — la cabecera de CAVEMAN HUB sale del portal **hasta 1023,98**.
>   La regla vivía en el corte del teléfono; el corte correcto es el de la
>   NAVEGACIÓN, y a 834 px se veían los dos chasis a la vez.
> - **`P-02c` (nuevo)** — el escritorio del cliente deja de ser el teléfono
>   estirado: `/mi/inicio` y `/mi/dieta` heredan la forma del Resumen del
>   entrenador (`.resumen` + `.resumen-lado`, con `.resumen-trabajo` nueva). Por
>   consulta de contenedor, así que **no hay un segundo mueble que mantener**:
>   a 390 px las dos columnas vuelven a ser una pila en el mismo orden.
> - **`M-01` (nuevo)** — **deslizar entre destinos con el dedo**
>   (`lib/useDeslizarEntreDestinos.js`). Probado: navega en los dos sentidos,
>   hace goma en los topes, lo vertical le gana, un arrastre corto no cuenta, y
>   una tira horizontal con recorrido se queda el gesto. Apagado con sesión
>   viva, por lo mismo que se retira la barra del pulgar.
> - **`M-02` (nuevo)** — la pestaña «Tu marca» de la ficha del ejercicio gana
>   **su curva** (la serie tope de cada día). Es la pestaña «Charts» de las
>   referencias, y de paso muere la palabra «tonelaje» en la pantalla de un
>   cliente.
> - **Y un remate de paso**: `.decide-verbo` medía `width: 100%` sin corte, o
>   sea un botón primario de 1.400 px en el escritorio.
>
> Validado: lint, types, verify, build y 2.469 pruebas en verde. Las **2 que
> fallan (`foodEquivCatalogo.test.js`) fallan igual con todo esto guardado en
> `git stash`**: son del catálogo de alimentos y vienen de antes.

| # | Movimiento | Dónde |
|---|---|---|
| **Tanda 1 · lo que está roto** | | |
| `P-01` | ✅ **La comida llega en un plan por macros**: `MealCard` deja de colgar de `cerrado`; `PlanDia` sale del portal | `ClientDiet.jsx` |
| `P-02` | ✅ (a) Fuera `Header` del portal hasta 1023,98 · ⏳ (b) en el escritorio sigue: es lo único que sostiene su cuenta hasta que exista la cinta de `P-09` | `jornada.css`, `piezas.css` |
| `P-02c` | ✅ **El escritorio deja de ser el teléfono estirado**: inicio y dieta con la forma del Resumen | `ClientStart`, `ClientDietRoute`, `revision.css` |
| `M-01` | ✅ **Deslizar entre destinos** con el dedo, sin robarle el gesto a las tiras | `lib/useDeslizarEntreDestinos.js`, `ClientLayout` |
| `M-02` | ✅ **La curva de progresión** en «Tu marca» + fuera «tonelaje» | `FichaEjercicioCliente` |
| `P-0X` | ✅ **Cómo va tu dieta**: la evolución de sus kcal y su peso, que llevaba meses guardada y no veía nadie | `Client/TuDieta.jsx` |
| `P-02b` | **El cuaderno abierto ≥1024**: riel vertical + dos páginas de 440, y el segundo nivel del móvil montado en la derecha en vez de como capa | `ClientLayout`, nuevo `Client/Cuaderno` |
| `P-03` | Fuera el muro de «se te quedaron sin entregar» | `ClientTu`, `ClientWeek` |
| **Tanda 2 · la traducción** | | |
| `P-04` | `/mi/progreso` deja de ser el `Dashboard`: cifra, frase y la curva a un toque. Fuera MRV, tonelaje y mapa corporal | `ClientProgresoRoute` (nuevo cuerpo) |
| `P-05` | `/mi/evolucion` deja de ser `AnthropometryPanel`: el pesaje, la regla y el histórico en filas; fuera las cuatro KPI, la papelera y la fecha ISO | `ClientCheckInsRoute` |
| `P-06` | **El pesaje sube a Hoy**, en una línea con su campo | `ClientStart` |
| `P-07` | El vocabulario, pantalla por pantalla (§2.4) | 11 pantallas |
| `P-08` | Se retiran las props `audience` del portal en **todos** los anchos | 18 archivos |
| **Tanda 3 · la piel y la carne** | | |
| `P-09` | **La cinta graduada como chasis**, con sus cuatro lecturas | nuevo `Client/CintaDelPortal` |
| `P-10` | **El entrenador aparece donde habla**: cara + cursiva, en la indicación del ejercicio, las pautas de la dieta y la respuesta a la semana | ⚠ ver §6 |
| `P-11` | La miniatura del ejercicio | `ExerciseList`, `FichaEjercicioCliente` |
| `P-12` | El registro de la serie: renglón, no tarjeta (21 tarjetas = 2.491 px) | `SetCell`, `ExerciseList` |
| `P-13` | Una sola paleta: fuera violeta, menta, ámbar y semáforo | `charts.jsx`, `revision.css` |
| `P-14` | Movimiento: la cascada al entrar, la muesca que se enciende, el asiento del check. `prefers-reduced-motion` respetado | `portal.css` |
| `P-15` | Vacíos y errores del portal, escritos uno a uno | las 11 pantallas |
| **Tanda 4 · las páginas derechas del cuaderno** | *(solo ≥1024; en el móvil las mismas piezas suben como capa)* | |
| `P-16` | **La semana entera** en la izquierda de Hoy: 7 filas con sesión, día de dieta, pesaje y entrega | `hojas.js` (`buildStrip` ya la calcula) |
| `P-17` | **El histórico del ejercicio**: kg × reps semana a semana | `previousSetsBefore` / `bestSetsBefore`, que ya recorren el histórico |
| `P-18` | **Las fotos comparadas**: semana 1 contra hoy, tres ángulos | `domain/photos` (guarda semana y ángulo) |
| `P-19` | **El hilo con tu entrenador**: lo entregado y lo contestado, por semana | `check_ins.coach_notes` + `review_links` |

Las cuatro son dato que **ya existe y hoy no se enseña**. Ninguna necesita
migración. `P-17`…`P-19` tienen primo en el lado del entrenador
(`FeedbackHistory`, `ReviewHistory`, `PhotoContactSheet`): **se reescriben, no se
montan con `audience`** — eso es lo que arregla `P-08`.

---

## 6 · Lo que hace falta y todavía no existe

`P-10` **no es gratis y no depende del diseño**:

- `profiles` tiene `full_name`, `email`, `role`. **No hay foto.** Una cara pide
  una columna (`avatar_url`) y un cubo.
- El cliente **no carga hoy el perfil de su entrenador**. Hace falta una política
  de lectura. ⚠ Y con ella el `GRANT`: una `RLS` sin `GRANT` da un 403 que no se
  ve por ninguna parte — ya pasó dos veces en este repo.

Sin eso, `P-10` se queda en la cursiva y en el nombre del equipo, que ya se
puede leer. Conviene decidirlo antes de la tanda 3.

---

## 7 · Las decisiones que no son mías

1. ~~¿El folio de 560 px también en el PC?~~ **Cerrada el 13 sep: no.** El
   escritorio es el cuaderno abierto (§1.4). Lo que queda por decidir de esto es
   **el corte**: 1024 px, o esperar a 1280 para que las dos páginas vayan más
   holgadas. Recomiendo 1024 y páginas de 440.
2. **¿La cinta como chasis, o la cinta como pieza dentro de la pantalla?** Es la
   firma y es la apuesta. Recomiendo chasis.
3. **¿Se hace la foto del entrenador** (columna + cubo + política), o `P-10` se
   queda en la cursiva?
4. **¿El semáforo de macros sale del portal del todo?** Hoy juzga la comida del
   cliente en rojo y verde. Recomiendo que salga: cuadrar el reparto es trabajo
   de quien lo montó.
5. **Chat.** Sigue siendo el hueco más grande frente a Coachway y sigue sin
   proponerse: es una fase entera, no un movimiento.

---

## 8 · Cómo se reprodujo esto

```
npx supabase start                       # ya levantado
VITE_SUPABASE_URL=… npx vite --port 5199
# cuenta real: marta@ejemplo.invalid / DemoCaveman2026!
# Playwright a 1440 / 834 / 390, localStorage['caveman-theme']='light'
```

⚠ **La dieta de la demo venía vacía**: los seis clientes sembrados tienen
`days: []` y `meals: []`, así que la pantalla no enseñaba nada y el fallo del
§2.3 no se veía. Se sembró a mano el plan de Marta (dos días, 7 comidas, 21
alimentos) **en la base local, no en el repo**; `npm run demo` lo borra.
