# La rutina y el bloque — replanteamiento

**Encargo** (7 sep 2026): el bloque es hoy la pantalla principal de Entreno y
no acaba de funcionar como *visión de conjunto*: las hojas apenas se usan, las
piezas de la pantalla no se leen como una sola cosa. La propuesta del dueño:
**rutina y bloque como estados de lo mismo** — ver la línea y la evolución,
poder encadenar bloques con duraciones concretas y verlos juntos, ver las
características del bloque, sus hojas y su distribución, y el material del
cliente (gimnasio, patologías) sin salir.

Lo que se conserva, porque el dueño dice que ya funciona: el bloque como
**división grande** de la rutina, la **distribución entera a la vista** para
valorar, reordenar y detectar fallos, y las **gráficas de volumen**.

**Prototipo clicable** (antes y después, con las averías señalables):
<https://claude.ai/code/artifact/9a7029d6-9a2e-4a54-ac76-a74eb82282b3>

> ⚠ **SUPERADO EN PARTE** (7 sep, tarde). El dueño rechazó el compositor
> construido aquí («feo, mal diseñado, poca visión global del conjunto») y pidió
> replantear el sistema entero. La §3 («tres verbos, tres superficies») y la §5
> («las dos superficies») quedan **sustituidas** por
> [`replanteamiento-del-bloque-vigente.md`](replanteamiento-del-bloque-vigente.md):
> componer deja de ser una habitación y pasa a ser un estado de la rutina.
>
> Y una **segunda corrección del dueño, la misma tarde, que anula más cosas**:
> «no me gusta el concepto del calendario, no tiene por qué haber una
> programación o previsión; yo hago un bloque y hasta que no haya que hacer
> cambios grandes, el bloque sigue». Con eso quedan **ANULADAS A-01, A-02, M-01
> y M-02**: no hay bloques previstos, no hay ascenso y la duración no se promete.
> Siguen vigentes A-03, A-04, A-05, M-03, M-04, la §5-bis/5-ter sobre Coachway
> y la §6.
>
> ✎ **ENMIENDA a la anulación de M-01** (22 sep 2026, decisión del dueño). La
> previsión vuelve, pero **opcional**: con el creador del plan (el popup Plan
> del roadmap) el entrenador puede dejar bloques en borrador detrás del abierto.
> Lo que dijo el 7 de septiembre sigue valiendo como norma por defecto:
> - Un bloque sin borradores detrás sigue abierto como hoy, sin fecha de fin.
> - Ningún borrador empieza solo: ni por fecha, ni al cumplir su duración
>   prevista, ni con el «que se abra solo» del cliente. Empieza cuando el
>   entrenador pulsa «Empezar ahora», y solo el primero de la lista.
> - Rellenar un borrador (escribir sus hojas) no lo empieza.
>
> Lo que **no** vuelve es la forma de M-01. Los borradores no van dentro de
> `program.blocks` con `fromWeek: null`, sino en una columna aparte,
> `workout_data.draft_blocks`. Todo el código, y también `continue_program`
> (0109) y `training_summaries` (0110), supone que el último bloque de `blocks`
> es el abierto, y unas cuarenta escrituras reconstruyen la lista desde
> `blocksOf`. Un borrador ahí dentro pasaría por el bloque en curso o se
> perdería al guardar. Tampoco vuelven `plannedBlocks`, `liveBlocks` ni
> `promoteNextBlock`. A-01, A-02 y M-02 siguen anuladas.

---

## El borrador, construido (22 sep 2026)

Hecho en la rama `borrador-del-bloque`, sin commitear. **Migración 0133**, que
se aplica ANTES de publicar: añade `workout_data.draft_blocks` (jsonb, `[]` por
defecto, con un CHECK de que es una lista). Una versión anterior de la app no
conoce la columna, así que ni la manda ni la pisa.

| Pieza | Dónde |
|---|---|
| El modelo y sus reglas | `src/domain/borradores.js` (17 pruebas en `borradores.test.js`) |
| La frontera con la base | `mapWorkoutFromDb` / `mapWorkoutToDb`: la clave solo viaja si la fila la trae |
| Las acciones | `useWorkout`: añadir, cambiar (rellenar), quitar, devolver y empezar |
| Rellenar | El Compositor con `?borrador=<id>`: «Guardar el borrador» |
| Empezar | «Empezar ahora», en el Compositor y en la lista de bloques |
| Dónde se ven | `ListaDeBloques`, sección «Lo previsto» |
| Contra la base | `supabase/tests/bloques-en-borrador.test.js` (4 pruebas) |

**La forma**: `{id, name, plannedWeeks, intent?, note?, sessions?,
mobilityDrills?, microciclo?, referencias?}`. El orden del array es el orden en
el tiempo y no lleva fechas: su sitio sale del final previsto del abierto.
`plannedWeeks` cuenta MICROCICLOS —en un rotativo de 10 días, 4 son 40 días
(`diasDelBorrador`)—.

**Rellenar no es empezar.** Guardar el borrador escribe en `draft_blocks` y no
abre nada. «Empezar ahora» cierra el bloque abierto y abre este con **el mismo
id** en UNA escritura (`openNextBlock` acepta `id`, y el borrador sale de la
lista en el mismo paso). Solo se ofrece en el primero, con al menos una hoja
(`sePuedeEmpezar`).

**Qué pasa con lo que ya existe.** Nada: un programa sin borradores se lee y se
escribe como siempre. Los borradores viajan al replicar un cliente
(`replicateClient`), no se pintan en el portal, y `continue_program` y
`training_summaries` siguen leyendo solo `blocks`. Quitar un borrador se
deshace, y cualquier cambio en ellos es un paso de ⌘Z (`mismoPlan`).

**Lo que falta** (su fase): el creador del plan —donde se crean y se ordenan en
la barra segmentada—, la vista de temporada y la lente. Hoy un borrador nace
desde el Compositor («Guardar como borrador», con duración prevista) y se
ordena por cómo se creó.

## Estado de construcción (7 sep 2026)

| Tanda | Estado |
|---|---|
| **1 · El bloque se puede describir** | **HECHA.** `blockTraits` con `intent`/`plannedWeeks`/`note` + `setBlockTraitsIn` (dominio, 15 pruebas nuevas); `horizonteDeBloque` cuenta contra la duración prevista y devuelve `posicion`/`previstas`; la acción `setBlockTraits` en la fachada; `DefinirBloque` pide «a qué juega» y «qué se persigue»; la línea vuelve a tener horizonte en el bloque abierto —solo cuando hay duración prevista—. |
| **2 · El compositor sale fuera** | **EN CURSO.** Ruta `/c/:id/rutina/componer` con las tres puertas, y el compositor **rediseñado con la anatomía de Coachway** (§5-ter): cabecera con las características, biblioteca fija con buscador que AÑADE, hojas como pastillas y filas con sus cifras en campos rotulados. `DefinirBloque.jsx` desaparece, absorbido. Pendiente: sacar `EquipmentNote` y el pliegue de condicionantes de la rutina, y quitarle el cajón a `VistaBloque`. |
| **3 · La rutina tiene páginas** | Sin empezar. |
| **4 · El futuro existe** | Sin empezar. |
| **5 · El grano fino** | Sin empezar. |

Validado en cada paso con `lint · types · verify · 1.766 pruebas · build`, y las
dos pantallas capturadas contra la demo local con datos reales (Marta Ruiz, 10
microciclos y 3 bloques). Nada commiteado.

---

## 1. Qué hay hoy (inventario verificado)

| Pieza | Dónde | Qué hace |
|---|---|---|
| Modelo de bloque | `src/domain/blocks.js` | Rangos de semanas sobre `program.microcycles`. El último tiene `toWeek: null` y es *el abierto*. Desde el 4 sep, el **plan vive en el bloque** (`block.sessions`) y las excepciones por semana son `overrides` con tramo. |
| Línea de bloques | `Workout/LineaDeBloques.jsx` | Pastillas de bloque + microciclos del seleccionado. Navega. La usan el entrenador y el portal. |
| Vista de bloque | `Workout/VistaBloque.jsx` | El banco: **cajón** (gimnasio, historial, piezas) · **plan** (línea + estructura del microciclo + rejilla de hojas) · **costado** (cifras, volumen/MRV, registro de cambios, progresión). |
| Vista de hoja | `Workout/WorkoutLogEditor.jsx` (`?v=hoja`) | Las series de una semana concreta: registro, calentamiento, comparativas, excepciones. |
| Definir bloque | `Workout/DefinirBloque.jsx` | Hereda el bloque anterior, enseña qué has cambiado, y **solo existe al crear**. |
| Historial | `Workout/HistorialPopup.jsx` | Ventana `lg`: tonelaje semana a semana de todo el programa + cada bloque con sus cifras, semanas y bitácora. |

---

## 2. El diagnóstico: cinco averías verificadas

### A-01 · Un bloque no se puede **prever**

`blocksOf` (blocks.js:34) garantiza que el último bloque esté abierto, y
`openNextBlock` (blocks.js:84) cierra el actual **en la última semana montada**
y abre el siguiente. Consecuencia exacta: **no existe el bloque de después**.
La línea solo puede dibujar pasado y presente, y «plantear varios bloques
encadenados con duraciones concretas» —lo que pide el encargo— hoy es
literalmente irrepresentable.

### A-02 · La duración prevista se pide, se guarda y no la lee nadie

`DefinirBloque.jsx:442` envía `plannedWeeks`; `useWorkout.js:1033` lo escribe
en el bloque. **Ningún componente ni función lo lee.** El entrenador teclea una
duración que no vuelve a aparecer en ninguna pantalla.

Y donde parecería estar, miente: `horizonteDeBloque` (blocks.js:540) calcula
`restantes` como «última semana MONTADA − semana en curso». «Le quedan 2
semanas» significa en realidad «quedan 2 microciclos ya creados», que es otra
cosa: si el bloque previsto era de 6 y van 3 montados, dice 0.

### A-03 · Un bloque no tiene características, solo nombre

Los campos reales de un bloque son `id · name · fromWeek · toWeek ·
weeklySplit · mobilityDrills · sessions · overrides · log · plannedWeeks(muerto)`.
No hay intención (acumulación, intensificación, descarga), ni nota, ni objetivo.
Todo lo que el entrenador sabe de *por qué* existe ese bloque cabe en una
cadena de texto: «Bloque 2».

Además, `DefinirBloque` **solo se abre al crear**: después, de un bloque se
puede cambiar el nombre y poco más. Un bloque no se puede *revisar*.

### A-04 · La visión de conjunto ya existe… en una ventana, y solo mira atrás

`HistorialPopup` es exactamente la vista de conjunto que el encargo pide —el
tonelaje de todo el programa y bloque a bloque con sus cifras y sus cambios—
pero vive detrás del título de una tarjeta del costado, se abre como modal
encima del trabajo, y es **puro retrovisor**: no puede enseñar lo que viene
porque lo que viene no existe (A-01).

O sea: la pieza está construida y guardada en el cajón equivocado.

### A-05 · Dos niveles que compiten, y un material que cambia de forma

La jerarquía `bloque → hoja` está bien argumentada en el código
(`WorkoutLogEditor.jsx:290-310`), pero el trabajo real ya no la usa: el plan se
escribe en el bloque, el cliente registra en el móvil, y a la hoja solo se baja
para **una excepción de esa semana** o **para leer lo ejecutado**. Un nivel
entero de navegación para dos gestos ocasionales.

Y peor: **el contexto del cliente cambia de forma según el nivel**.

- `ConditionsNote` (patologías) → pliegue encima de todo, en los dos niveles.
- `EquipmentNote` (gimnasio) → pliegue, **solo en la hoja** (`WorkoutLogEditor.jsx:1003`).
- `CajonDeMaterial` (gimnasio + historial + piezas) → columna, **solo en el bloque**.

El gimnasio se dibuja de dos maneras distintas a un clic de distancia. Eso es,
en concreto, el «queda todo un poco inconexo».

---

## 3. La idea: **tres verbos, tres superficies**

> Entreno hace tres trabajos en una sola superficie —**componer, consultar y
> leer**— y el mobiliario de componer (el cajón de material, el MRV, el
> registro) está puesto encima de los otros dos.

Esa es la tesis de fondo, y es la del dueño (7 sep, segunda vuelta): *«una vez
editada la rutina no tiene sentido que te muestre su maquinaria, sus
condicionantes… eso es más bien a la hora de crear las cosas para acordarse»*.
De ahí sale todo lo demás:

- **Componer** es un sitio al que se entra y del que se sale, no un momento
  dentro de otra pantalla. Es el único con el material al lado.
- **Consultar** —qué entrena esta persona— es el día a día, y va limpio: sin
  cajón, sin biblioteca, sin taller.
- **Leer** —encadenar, ver la evolución y la variabilidad— es una lectura a la
  que se va a propósito. El dueño lo dice exacto: *«poder medir esa evolución y
  ver la variabilidad es brutal, pero ya está»*. Vale mucho, y no es la casa.

Y dentro de «consultar y leer», el bloque y la hoja **no compiten**: son el
mismo objeto a distinto alcance, y se pasa de uno a otro como se pasa de
página. Es la respuesta literal del dueño a la pregunta de qué forma tiene la
rutina: *«tanto la visión de bloque como las hojas podría estar bien, pero
habría que poder ver la visión global cuando se quisiese, como si fuesen
páginas o subsecciones»*.

> **Nota:** esto anula la regla que este mismo documento escribió en su primera
> versión («si acaba habiendo línea *y* pestañas, la propuesta ha fallado»). Con
> el compositor fuera, la línea deja de ser el mando y un paginador es honesto.

### El modelo que lo sostiene: una línea, tres estados

> La rutina no es la suma de los bloques: **la rutina es la línea, y el bloque
> es el tramo que tienes abierto encima de ella.**

Un bloque pasa a tener tres estados, y la pantalla los enseña juntos:

```
  ██████████  ██████████████  ▓▓▓▓▓▓▓▓▓▓▓▓  ░░░░░░░░  ░░░░░░░░░░░░
  B1 Adaptación  B2 Acumulación  B3 Intensificación  B4 Descarga  B5 Acumulación
  4 sem · cerrado  6 sem · cerrado   4 sem · ABIERTO   1 sem        5 sem
                                     ▲ va por la 3ª    previsto     previsto
```

- **cerrado** — pasó. Tiene semanas, entrenamientos y bitácora.
- **abierto** — es el de ahora. Tiene semanas montadas y, si se pidió, una
  duración prevista contra la que se puede contar de verdad.
- **previsto** — todavía no toca la línea de semanas: tiene nombre, intención,
  duración y (opcionalmente) su plan ya escrito. Cuando el abierto termina, el
  previsto se **asciende**: coge `fromWeek` y empieza a montar microciclos.

Que el previsto **no tenga `fromWeek`** es la decisión importante del modelo:
así ninguna función que hoy recorre semanas (`blockOfWeek`, `weeksOfBlock`,
`resolvedMicrocycles`, `planOfDay`…) necesita enterarse de que existe el
futuro. El futuro es un plan, no un pasado en blanco.

---

## 4. El modelo (dominio)

> ✎ Anulada el 7 sep y enmendada el 22 sep: la previsión vuelve como borradores
> opcionales en `workout_data.draft_blocks`, no con esta forma. Ver la enmienda
> al principio del documento.

**M-01 · Bloques previstos.** `program.blocks` admite, detrás del abierto,
bloques con `fromWeek: null`. `blocksOf` sigue devolviendo la cadena entera; se
añaden `plannedBlocks(program)` y `liveBlocks(program)` para que cada consumidor
pida lo suyo, y `promoteNextBlock(program)` para el ascenso. Las funciones de
semana filtran por `fromWeek != null` — es el único cambio que tocan.

**M-02 · La duración, viva.** `plannedWeeks` deja de ser un campo muerto:
`horizonteDeBloque` pasa a contar contra la duración prevista cuando la hay
(«va por la 3ª de 4 · después, Descarga») y contra las semanas montadas cuando
no. Es el arreglo más barato del documento y desbloquea la línea entera.

**M-03 · Las características.** Al bloque se le añaden tres campos, todos del
entrenador y ninguno calculado:

```js
{ intent: 'acumulacion' | 'intensificacion' | 'descarga' | 'adaptacion' | null,
  plannedWeeks: 4,
  note: 'Subir intensidad en básicos, accesorios al mínimo' }
```

La intención **no receta nada**: colorea el tramo de la línea, ordena la lectura
del conjunto y explica el bloque al cliente en el portal. Es rótulo, no
algoritmo.

**M-04 · Definir se convierte en revisar.** `DefinirBloque` deja de ser solo el
alta: el mismo formulario abre sobre un bloque existente (abierto o previsto)
para tocar nombre, intención, duración, nota y hojas. Su mejor pieza —«qué has
cambiado respecto al anterior», `cambiosContra`— pasa a servir también de
comparador entre bloques en la vista de conjunto.

Sin migración de datos: son claves nuevas en la columna `jsonb` que ya existe
(0086), y un bloque sin ellas se lee como hasta ahora.

---

## 5. Las dos superficies

Prototipo clicable de las dos:
<https://claude.ai/code/artifact/9a7029d6-9a2e-4a54-ac76-a74eb82282b3>

### A · LA RUTINA — `/c/:id/rutina`

Una cabecera que no cambia (quién · qué bloque · qué microciclo · **Componer**)
y tres páginas del mismo objeto:

```
┌───────────────────────────────────────────────────────────────┐
│ La rutina de Marta   Intensificación · microciclo 3 de 4      │
│                                                  [ Componer ] │
│ Conjunto · 5 bloques    Bloque · 4 hojas    Día · Pierna      │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│   la página elegida, a ancho completo y sin muebles al lado   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

- **Conjunto** — la lectura. La línea con los cinco tramos y sus estados; el
  tonelaje por microciclo de todo el programa; y una tabla bloque a bloque con
  series, tonelaje, **variación** dentro del bloque, cumplimiento y **qué hojas
  entraron y salieron**. Es `HistorialPopup` sacado de la ventana y extendido
  hacia delante.
- **Bloque** — la distribución entera: características (intención, duración,
  nota), el reparto del microciclo, las cuatro hojas con sus ejercicios a ancho
  completo, el volumen contra el MRV como franja bajo la rejilla, y lo tocado
  con su tramo. Es para lo que el dueño dice que creó el bloque: valorar,
  reordenar, ver el fallo.
- **Día** — la hoja de una sesión: carril de días y de microciclos arriba, y los
  ejercicios con su pauta y el fantasma de la vez anterior. Se retoca aquí y lo
  tocado queda apuntado con su tramo.

**Lo que sale de esta superficie:** el cajón de material, `EquipmentNote` y el
pliegue de condicionantes. No porque estorben, sino porque **su sitio es el
otro**.

### B · EL COMPOSITOR — `/c/:id/rutina/componer`

Se entra con «Componer» y se sale guardando. Es el único sitio con el material
al lado, que es cuando de verdad sirve para acordarse.

```
┌──────────────┬────────────────────────────────────────────────┐
│ CONDICIONAN- │  ← La rutina   Bloque nuevo…      [ Guardar ]  │
│ TES (fijos)  ├────────────────────────────────────────────────┤
│              │  Nombre · Intención · Duración · Qué persigue  │
│ Gimnasio     │  Sus días:  [Push][Pull][Pierna]  [+ día]      │
│ Historial    │  ─────────────────────────────────────────────  │
│ Piezas       │  ⠿ Press banca   [series][reps][RIR][desc] ⋯   │
│              │      alternativas: multipower · mancuernas     │
│ (se pulsa y  │  ⠿ Press militar [series][reps][RIR][desc] ⋯   │
│  entra)      │  ─────────────────────────────────────────────  │
│              │  ◆ Su hernia: sin carga axial máxima…          │
│              │  Qué has cambiado respecto a Intensificación   │
└──────────────┴────────────────────────────────────────────────┘
```

El primer gesto son **tres puertas** (decisión del dueño, 7 sep): *en blanco* ·
*heredar el anterior con su diff* (la recomendada: en hipertrofia el bloque
siguiente casi siempre es el anterior con tres cambios) · *desde una pieza
tuya*. Después, el flujo de Coachway con nuestro material: días como pastillas
con su «+ día», ejercicios como filas editables en sitio (series · reps · RIR ·
descanso), alternativas por ejercicio, y el diff contra el bloque del que
hereda siempre a la vista.

Y una pieza que Coachway no puede tener: **el aviso del condicionante donde se
decide** —«el press militar de pie carga columna; en su gimnasio hay
multipower»—. Información, nunca receta: [la app no receta] sigue mandando.

---

## 5-bis. Coachway: qué hace bien al crear rutinas

Segunda lectura de las cinco capturas de su creador de programas
(`capturas/referencias/coachway/client training program creator 1-5.png`),
mirando solo la mecánica de montar una rutina.

| Lo suyo | Veredicto |
|---|---|
| **La cabecera dice en qué estado está el plan**: «Strength Training Dave · Draft» → Publish → «Local changes» con Save / Discard. | **La lección sí, el mecanismo no.** El binario Draft/Publish es más pobre que nuestro tramo (`overrides` con fromWeek/toWeek), pero tienen razón en que la cabecera tiene que decir **qué es esto y en qué estado está**. Es justo lo que M-03 le da al bloque: intención, duración, estado. |
| **Biblioteca fija al lado**, dos pestañas (Exercises · Sections), buscador y arrastre. | **Ya construido y mejor**: el `CajonDeMaterial` es ESTE cliente —su gimnasio, su historial, tus piezas—, no un almacén de 1.772 ejercicios de nadie. |
| **Sesiones como pastillas en fila** (Push · Pull · Day 3 · +), con engranaje por sesión. | **No copiar el selector**: sus pastillas enseñan UNA sesión cada vez, y el dueño valora precisamente ver la distribución entera. Sí vale el engranaje por hoja, que ya está en el menú de la columna. |
| **Edición en la propia fila**: Sets · Weight · Min Reps · Max Reps · Rest sin abrir nada; desplegando, serie a serie y las alternativas. | **Hueco real en la rejilla**: hoy la columna enseña `4 × 6-8` y para cambiarlo hay que abrir «escribir la hoja». En una rejilla que existe para valorar y retocar, la pauta debería editarse donde se lee. |
| **«Move to section»**: mover un ejercicio a otro día desde su propio menú. | **No existe.** `moveBlockExerciseIn` (blocks.js:1165) solo reordena DENTRO de un día. Y reordenar entre hojas es literalmente para lo que el dueño dice que creó la vista de bloque. |
| Tipos de serie (superserie, bajada, tiempo, AMRAP) y descanso por ejercicio. | **Ya construido** en la tanda B: `targetKind`, `enlazado`, `bajada`, `restSeconds`. |
| Estado vacío con dos salidas: Create Session / Apply Template. | **Ya construido**: «Escribir el primero» / «Traer de un fichero». |

**Y lo que enseña por omisión, que es lo más útil:** su programa es **plano**. No
tiene semanas, ni bloques, ni periodización — por eso su respuesta a «el plan ha
cambiado» es un badge de *Local changes*. No pueden enseñar evolución porque no
tienen eje temporal. La línea no es terreno disputado: es terreno vacío.

De aquí salen dos movimientos más, los dos dentro de la tanda 4:

- **M-05 · La pauta se edita en la rejilla.** Series y objetivo, en la columna,
  con el mismo alcance que ya tiene el resto (al bloque, o solo a esta semana).
- **M-06 · Mover un ejercicio a otra hoja.** Arrastrando entre columnas, con el
  gesto que la rejilla ya usa para ordenar.

---

## 5-ter. El compositor, contra su creador de programas

Primera versión construida y **rechazada por el dueño**: «horriblemente feo, mal
adaptado, diseñado y gestionado». Tenía razón, y el porqué se lee comparándola
con las cinco capturas de su builder:

| Lo que fallaba | Lo que hace Coachway | Lo que se ha hecho |
|---|---|---|
| **El formulario se comía la pantalla**: nombre a todo lo ancho, duración, cinco pastillas de intención y otro campo de texto — el plan empezaba a media pantalla, en una tarjeta pequeña. | Las características son **la cabecera**: título, badge de estado y las acciones, todo en una línea de 56 px. | Cabecera con el nombre editable pulsándolo y dos **chapas** (`A qué juega`, `Abierto`) que solo se abren si se van a tocar. La nota baja al pie. |
| **El carril era un álbum de fotos**: el gimnasio del cliente en miniaturas grandes y desiguales, sin buscador y sin poder añadir nada. Ocupaba un cuarto del ancho sin participar en el trabajo. | La biblioteca es **la herramienta**: buscador, lista densa, y un `+` por fila. | `BibliotecaDelCliente`: buscador, lista con `+`, y **lo que ESTA persona levanta en cada fila** («130 kg ↑»), que es lo que su almacén de 1.772 ejercicios de nadie no puede tener. |
| **Las hojas, una rejilla de tarjetas medio vacías** con «+ hoja» punteado al lado, compitiendo con la hoja vacía. | Las sesiones son **pastillas en fila**, y se trabaja una cada vez. | Carril de pastillas con su cuenta de series dentro; la abierta ocupa la mesa. Ver la distribución entera sigue siendo trabajo de la página **Bloque**, no del compositor. |
| **La fila del ejercicio era un formulario**: bajo cada nombre, cuatro controles de ancho distinto (enlazar, remate, descanso, alternativa). | Campos con rótulo en columnas fijas (Sets · Reps · Rest) y el resto detrás de `⋯`. | Las **cifras** (series · reps · descanso) en campos rotulados y alineados en vertical; los **verbos** al menú de la fila. Cambio en `EscribirHoja`, así que lo gana también la rutina. |
| El alta, dos renglones dentro de una caja hundida. | — | Una sola línea. Se queda porque es lo único que permite escribir un ejercicio **que aún no existe**; la biblioteca es para lo que ya está. |

Lo que sigue sin copiarse: su bloque nace siempre vacío (el nuestro hereda y
enseña el diff) y su Draft/Publish (nuestro tramo dice desde cuándo y hasta
cuándo).

---

## 6. Lo que NO cambia

- El bloque sigue siendo un **corte** en la línea de semanas, no un contenedor:
  quitarlo no borra entrenamientos (blocks.js:135).
- El plan sigue viviendo en el bloque, y las excepciones con su tramo.
- La hoja de series, su gramática y su fantasma: es la identidad de la casa.
- **La app no receta**: la intención del bloque la escribe el entrenador; nada
  propone cargas, duraciones ni descargas.
- La línea sigue siendo la misma pieza en el portal del cliente, de solo leer.

---

## 7. Orden propuesto

| Tanda | Piezas | Por qué |
|---|---|---|
| **1 · El bloque se puede describir** | M-02 (la duración deja de mentir) + M-03 (intención, duración, nota) | Dominio puro, con sus pruebas y sin UI nueva. Arregla un campo muerto y una frase falsa, y el compositor lo necesita para existir. |
| **2 · El compositor sale fuera** ⭐ | Ruta propia con las tres puertas; `DefinirBloque` + `EscribirHoja` + `CajonDeMaterial` se mudan allí; `EquipmentNote` y el pliegue de condicionantes salen de la rutina; M-04 (definir = revisar) | El corazón del replanteamiento. Es sobre todo **mudanza** —las piezas están construidas— y por sí sola ya deja la rutina limpia. |
| **3 · La rutina tiene páginas** | Cabecera fija + paginador; `HistorialPopup` deja de ser modal y pasa a ser la página Conjunto; fuera el `?v=hoja` | Convierte dos pantallas con muebles distintos en un objeto con tres alcances. |
| **4 · El futuro existe** | M-01 (bloques previstos, sin `fromWeek`) + la línea con tramos previstos + el ascenso a mano | Encadenar con duración y verlo junto. Va después porque ya no es la puerta de Entreno, sino una página. |
| **5 · El grano fino** | M-05 (la pauta se edita en sitio), M-06 (mover un ejercicio a otra hoja), el aviso del condicionante dentro del compositor | Lo que el estudio de Coachway dejó pendiente, ya sobre la estructura nueva. |

---

## 8. La prueba del algodón

Con las tandas 1-3 puestas:

1. Abrir a Marta y ver **qué entrena**, sin un solo mueble de taller en
   pantalla: ni gimnasio, ni MRV, ni biblioteca.
2. Pasar de la distribución del bloque a la hoja del jueves y de ahí al
   conjunto de las 20 semanas **sin cambiar de pantalla ni de gramática**.
3. Pulsar «Componer», montar el bloque siguiente heredando el actual con su
   diff, con su gimnasio y sus condicionantes al lado, y volver.
4. Y que en ningún momento haya hecho falta preguntarse dónde estabas ni por
   qué había aparecido un mueble nuevo.

Con la 4: dejar escrito que después van una descarga de 1 semana y otra
acumulación de 5, y verlas en la línea, en gris, con su ancho.

---

## 9. Riesgos y puntos a decidir

- **`resolvedMicrocycles` y el portal**: un bloque previsto no debe aparecer
  como programa del cliente hasta ascender. Hay que auditarlo explícitamente.
- **Ascenso automático o a mano**: cuando el abierto agota su duración prevista,
  ¿el previsto entra solo al montar el siguiente microciclo, o lo confirma el
  entrenador? Recomendación: **a mano**, con la línea diciendo que toca; abrir
  un bloque es una decisión, y así está escrito hoy.
- **Duración prevista vs. realidad**: un bloque de 4 previsto que va por la 6ª
  no es un error que haya que regañar. La línea lo dice y calla.
- **El compositor no puede ser una segunda app.** Si acaba teniendo su propia
  cabecera de cliente, su propio menú y su propia manera de guardar, hemos
  cambiado dos pantallas mezcladas por dos productos. Entra, hace su trabajo y
  devuelve.
- **Salir del compositor tiene que ser seguro.** Hoy todo se guarda al
  instante; una superficie que se abre «para componer» invita a esperar un
  borrador. Decisión recomendada: **sigue guardando al instante** —el tramo ya
  dice desde cuándo aplica cada cambio— y «Guardar y volver» solo vuelve. Un
  borrador de verdad sería otro modelo, y sería copiar el Draft/Publish que ya
  descartamos.
- **La página Día y el portal del cliente no son la misma hoja.** El móvil
  ejecuta; esta es la de escritorio. No unificarlas por parecerse.
