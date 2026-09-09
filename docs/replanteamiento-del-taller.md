# Replanteamiento: la aplicación tiene dos mitades — la gente y el oficio

> **ESTADO (8 sep 2026, noche): construido y validado, sin commitear.**
>
> - **Tanda 1 · El plano nuevo** — HECHA. `COACH_TALLER` en `routes.jsx`, el
>   rótulo «Tu taller» en la barra, la cartera que asoma (corte a partir de doce),
>   Ajustes sin el protocolo (`/ajustes/protocolo` redirige a `/protocolos`), y
>   las cinco puertas también en el menú de cuenta por debajo de 1024 px, que es
>   donde no hay barra.
> - **`/protocolos`** — HECHA. La misma pantalla con su selector de destino, con
>   la cinta de la casa y `LineaDelProcedimiento` en lugar del índice de anclas:
>   cinco momentos que dicen qué le pasa a un cliente y cuándo.
> - **Tanda 2 · Formularios** — HECHA. `/formularios` con la lista y el
>   constructor: lienzo de tarjetas, selector «¿Qué quieres preguntar?» en cuatro
>   grupos (el empty state ES el selector), panel de ajustes de la pregunta
>   tocada y «Ver como cliente».
> - **Tanda 3 · El material** — HECHA en lo que no pedía migración de datos:
>   `/ejercicios` con la ficha en dos capas y la migración `0098` (`video_url`,
>   `cue`, `alternatives` en `exercises`), `/alimentos` con macros, unidad y
>   alérgenos, `/plantillas` como vitrina de `pieces.js`.
> - **PENDIENTE**: el ▶ con tu clave dentro de la rutina del cliente (móvil), el
>   «se parece a» de los alimentos, la tanda 4 entera (horizonte de Inicio,
>   calendario del check-in, chapa del protocolo en la cabecera) y la 5 (siembra).
>   Y los protocolos con NOMBRE: la pantalla está lista para la lista, el modelo
>   no se ha tocado todavía.
>
> Validado con `npm run check` entero en verde (1.782 pruebas) y con capturas
> reales de la demo local en tema claro y oscuro, incluido el guardado de la
> ficha de un ejercicio de punta a punta (UI → Supabase → vuelta a la ficha).

> **Encargo (8 sep 2026).** «Replantear estructura, organización, diseño y
> funcionalidad basándonos en Efort y Coachway. El protocolo no debería ir en
> ajustes: debería ir en la barra lateral como diseñador de procedimientos.
> Coachway tiene formularios en la barra, integrados en los procedimientos, y
> mucho más bonitos que los nuestros. Efort está haciendo el suyo, te mando
> capturas. Los dos tienen biblioteca de ejercicios y de alimentos, con la url
> donde el entrenador explica o sus pautas. Y los dos tienen power panel y
> dashboard. Nuestro Resumen me gusta mucho, pero habría que plantear un
> rediseño de la aplicación entera para estar no solo a la altura, sino por
> encima.»
>
> Este documento es la respuesta: la visión, el antes y el después de cada
> pieza, lo que arrastra en el código, lo que contradice a la doctrina escrita
> y en qué orden se hace.
>
> **Fuera de alcance a propósito:** la pantalla de Entreno y el creador de
> bloques. El dueño los está replanteando en otro hilo
> (`docs/replanteamiento-bloques-y-entrenos.md`). Aquí solo se decide **dónde
> vive el material** que esa pantalla consume, nunca cómo se escribe una hoja.

## 2ª edición — las respuestas del dueño (mismo día, tarde)

> «Para el constructor de formularios, los protocolos y los ejercicios básate en
> las imágenes que te mandé del formulario de Efort, en los mecanismos de Efort y
> en los de Coachway ya existentes.»

Y las cinco decisiones:

| | Pregunta | Respuesta |
|---|---|---|
| 1 | La cartera en la barra | *No lo sé* → **la decido yo: se colapsa** (§15.1) |
| 2 | El vídeo del ejercicio | **Sí, pero lo decide él y bien integrado** (§6) |
| 3 | Protocolos con nombre | *No lo sé* → **la decido yo: con nombre desde el primer día** (§15.3) |
| 4 | El chat | **Más adelante** — no entra, no se descarta |
| 5 | Menús guardados / que la app recete | **«El entrenador ha de tener opciones, no limitaciones»** — ver abajo |

### La regla que cambia: de «la app no receta» a «la app propone si se lo pides»

La quinta respuesta toca una ley de la casa, así que se escribe entera y con su
límite:

**La aplicación puede proponer. Nunca por su cuenta, nunca en silencio, y nunca
directamente al cliente.** Tres condiciones:

1. **Lo enciende el entrenador.** Apagado de fábrica, como los módulos del
   protocolo. Quien no lo quiera, no ve una sola sugerencia en toda la app.
2. **Lo que propone se ve como propuesta hasta que él lo firma.** Una cifra
   sugerida se distingue de una puesta —en gris, con «propuesto» al lado— y no
   viaja al cliente hasta que se aprueba. Esto no es una limitación: es lo que
   permite que la propuesta sea agresiva sin ser peligrosa.
3. **Dice de dónde sale.** «2.166 kcal — de su TDEE y su objetivo» y no
   «recomendado». Una propuesta sin su porqué es un oráculo, y a un oráculo no
   se le puede llevar la contraria.

Lo que esto habilita, en orden de utilidad real: el **reparto de kcal por
comidas** (hoy se escribe a mano; con TDEE ya calculado en la radiografía es
aritmética), los **menús guardados** y su relleno con equivalencias
(`foodEquiv` ya sabe cambiar un alimento por otro sin descuadrar el macro), la
**progresión sugerida** de un ejercicio a partir de su historial, y el
**objetivo del check-in** a partir de la tendencia. Cada una es un movimiento
propio y ninguna entra en las cinco tandas de este documento: entran cuando él
las pida, ya con permiso.

Lo que sigue prohibido no es proponer: es **que algo llegue al cliente sin
pasar por el entrenador**.

---

## 1. La visión, en una frase

**Hoy la aplicación solo sabe hablar de personas. Le falta la otra mitad: el
oficio.**

La barra lateral de Caveman Hub dice —de arriba abajo— Inicio, la cartera
entera, Cobros, Agenda y tú. Es una lista de **con quién** trabajas. En ningún
sitio está **con qué**: tu forma de preguntar, tus ejercicios, tus alimentos,
tus días guardados, tu manera de llevar a un cliente. Todo eso existe en el
código —y bastante bien hecho— pero vive escondido dentro de la pantalla que lo
consume, o dentro de Ajustes, que es donde se guardan las cosas que se tocan una
vez al año.

Coachway y Efort tienen exactamente esa mitad, y es lo que hace que parezcan
plataformas y nosotros una herramienta:

```
COACHWAY                      EFORT                    CAVEMAN HUB (hoy)
─────────────────────         ──────────────────       ───────────────────
Client Management             Home                     Inicio
  Clients · Inbox · Leads     Athletes                 ─ Marta Ruiz
  Automations · Vault         Library                  ─ Nerea Prado
Workouts                      Nutrition                ─ Javier Soto
  Exercises · Templates       Competitions             ─ … (la cartera)
Nutrition                     Billing                  Cobros
  Recipes · Ingredients       Settings                 Agenda
  Mealplans                                            ─────────────
Forms                                                  (tú, al pie)
  Forms · Metrics
```

Ellos tienen **dos planos**: la gente y el material. Nosotros tenemos uno.

La propuesta es añadir el segundo con nombre propio y con nuestra voz: **el
Taller**. No es un menú nuevo: es reconocer que un entrenador tiene un oficio
antes de tener clientes, y que la aplicación hoy le obliga a que ese oficio viva
disperso en seis sitios.

### Las tres leyes de este replanteamiento

1. **La gente y el oficio son dos planos, y no se mezclan.** La barra tiene una
   mitad de personas (Inicio, tu cartera) y una mitad de material (Protocolos,
   Formularios, Ejercicios, Alimentos, Plantillas). Ajustes vuelve a ser lo que
   debe ser: cuenta, equipo, integraciones, copia. Administración, no oficio.

2. **El material se afila en el Taller y se usa donde se trabaja.** La
   biblioteca no sustituye al buscador de la hoja ni al de la dieta: es donde
   pones tu vídeo, tu clave técnica, tus alternativas y tus marcas. El momento
   de necesitar «Lentejas» sigue siendo mientras montas la dieta
   (`domain/catalog.js` tenía razón); el momento de decidir *qué es* tu press
   banca —qué vídeo lo enseña, qué le dices siempre al cliente— no es ése.

3. **Todo lo que le llega al cliente se diseña en un solo sitio y con la misma
   gramática.** Hoy hay tres editores de preguntas distintos —el alta, la
   sesión y el check-in— en tres apartados de una misma pantalla de ajustes.
   Son el mismo objeto: un **formulario**. Uno solo, bonito, usado tres veces.

---

## 2. El diagnóstico, verificado en el código

No es opinión: es lo que hay en `master` hoy.

| Pieza | Dónde vive hoy | Qué le pasa |
|---|---|---|
| El protocolo | `Ajustes → Protocolo` (`ProtocolPanel.jsx`, 619 líneas, 5 anclas) | Es **lo más importante que decide un entrenador** —qué servicios lleva, qué pregunta, qué ve el cliente, cuándo le avisa la app— y está en el mismo cajón que la copia de seguridad. |
| El cuestionario de alta | `Protocolo → El alta` (`IntakeFormSection.jsx`, 476 líneas) | Es un panel de casillas sobre los campos de la ficha. Funciona, pero **parece un ajuste**, no un formulario. Lo bonito lo ve el cliente; el entrenador que lo diseña, no. |
| Las preguntas del check-in | `Protocolo → El check-in` (`CheckinBlocksSection` + `QuestionEditor`) | Mismo objeto que el alta, **editor distinto**. |
| Las preguntas de la sesión | `Protocolo → La sesión` (`QuestionEditor` otra vez) | Tercer sitio, misma idea. |
| Los ejercicios | `catalog_exercises` (101 sembrados + la ficha de 0094/0095) y `exercises` del equipo | **No tienen pantalla.** Se ven de refilón en un autocompletado (`AddExerciseForm.jsx`). No puedes mirar tu biblioteca, ni corregirla, ni ponerle un vídeo. |
| Los alimentos | `catalog_foods` (179 + la despensa española de 0096) y `foods` del equipo | Igual: sin pantalla. `foodEquiv.js` y `foodMatch.js` son mejores que los suyos y **no se ven**. |
| Tus piezas (días guardados) | `profiles.preferences.piezas` (`pieces.js`, tope 30) | Solo existen dentro del cajón del bloque. Guardas tu mejor día de pierna y después no hay ningún sitio donde estén tus días. |
| La visibilidad, las alertas, la pausa | `protocol.js` + el diálogo «El protocolo de X» de la cartera | Bien resuelto y **muy bien escondido**. |

Y dos ausencias que las capturas dejan a la vista:

- **La biblioteca no tiene ni escala ni voz.** Ellos presumen de 1.772
  ejercicios con vídeo y lámina y 1.819 ingredientes con país y SKU. Nosotros
  tenemos 101 y ~179 más la despensa. La cifra importa menos que el hecho de que
  **la nuestra no se puede mirar**: una biblioteca sin pantalla no se percibe
  como que existe.
- **Inicio mira hacia atrás.** Las cuatro colas (`COLAS_INICIO` en
  `portfolio.js`: por revisar, sin programar, sin señales, cobros) cuentan lo que
  ya se acumuló. El dashboard de Efort cuenta **lo que viene**: «New block needed
  10 · Block update needed 13» y un pronóstico por semanas. Nosotros tenemos las
  fechas de fin de bloque en `blocks.js` y no las usamos para eso.

---

## 3. La estructura nueva

### Antes

```
┌────────────────┬──────────────────────────────────────────────┐
│  ▣ Caveman     │                                              │
│  ⌕ buscar      │                                              │
│                │                                              │
│  ⌂ Inicio      │            el área de trabajo                │
│                │                                              │
│  Marta Ruiz  ● │                                              │
│  Nerea Prado S │                                              │
│  Javier Soto S │                                              │
│  … 23 más      │                                              │
│                │                                              │
│  ▤ Cobros      │                                              │
│  ▦ Agenda      │                                              │
│  ─────────     │                                              │
│  ◍ Tú          │  → Ajustes → Protocolo (5 apartados)         │
└────────────────┴──────────────────────────────────────────────┘
```

### Después

```
┌────────────────┬──────────────────────────────────────────────┐
│  ▣ Caveman     │                                              │
│  ⌕ buscar      │                                              │
│                │                                              │
│  ⌂ Inicio      │            el área de trabajo                │
│  ☰ Clientes 26 │                                              │
│  Marta Ruiz  ● │   (la cartera sigue viva: quien espera algo   │
│  Nerea Prado ● │    arriba, el resto detrás de «Clientes»)     │
│                │                                              │
│  TU TALLER     │  ← el plano nuevo, con antetítulo            │
│  ◎ Protocolos  │                                              │
│  ✎ Formularios │                                              │
│  ⬒ Ejercicios  │                                              │
│  ◔ Alimentos   │                                              │
│  ▤ Plantillas  │                                              │
│                │                                              │
│  ▤ Cobros      │  (siguen siendo capas, no destinos)          │
│  ▦ Agenda      │                                              │
│  ─────────     │                                              │
│  ◍ Tú          │  → Ajustes: cuenta · equipo · integraciones  │
└────────────────┴──────────────────────────────────────────────┘
```

Cinco entradas nuevas, ninguna quitada, y el antetítulo **TU TALLER** —la única
versalita de la barra— es lo que hace legible que hay dos planos. Es el recurso
de Coachway (Client Management / Workouts / Nutrition / Forms) usado una sola
vez, que es justo lo que nos hace falta: ellos necesitan cuatro grupos porque
tienen catorce entradas; nosotros necesitamos uno.

> **Ojo con la lección ya aprendida (5 sep):** en la barra, **una línea por
> persona como máximo y ningún porqué**; el motivo es de la pantalla. Con cinco
> entradas más abajo, colapsar la cartera larga deja de ser opcional: los que
> esperan algo arriba, el resto detrás de «Clientes». Es el precio de tener dos
> planos y se paga en la misma tanda.

---

## 4. Movimiento 1 · El protocolo sale de Ajustes y se convierte en un oficio

> *«Quizás el protocolo no debería ir en ajustes, sino cambiar la forma en la
> que se presenta e ir en la barra lateral, como diseñador de procedimientos o
> schedules a clientes, con un aspecto rediseñado.»*

### Antes

`Ajustes → Protocolo`: una pantalla larga con un **selector de destino** arriba
(la plantilla, o un cliente concreto) y cinco apartados apilados —Qué llevas · El
alta · La aplicación · La sesión · El check-in—. Hay **una sola plantilla** por
entrenador (`profiles.preferences.protocol`), una copia aplicada por cliente
(`clients.preferences.protocol`) y un botón «aplicar a todos».

El fallo no es la mecánica —el selector de destino es una buena decisión y hay
que conservarla— sino dos cosas:

1. **Sitio.** Está donde se guardan la copia de seguridad y las integraciones.
2. **Número.** Una sola plantilla. Quien lleva pérdida de grasa y powerlifting
   no puede tener dos formas de trabajar. Es exactamente el hueco que el alta ya
   resolvió con `intakeForms` (varios formularios, uno por tipo de cliente): el
   protocolo se quedó a medio camino.

### Después

**`/protocolos` — «Cómo trabajas».** Segunda entrada del Taller y **primera
pantalla que ve un entrenador nuevo** en vez de una cartera vacía.

```
Protocolos                                        [+ Nuevo protocolo]
────────────────────────────────────────────────────────────────────
◎ Asesoría completa            Entreno · Dieta · Revisión    18 clientes
  El alta: Alta general · Check-in: lunes · Revisión: cada 4 sem

◎ Solo entreno                 Entreno                        6 clientes
  El alta: Alta express · Check-in: lunes · Sin revisión

◎ Powerlifting                 Entreno · Revisión             2 clientes
  El alta: Alta de fuerza · Check-in: domingo · Revisión: cada 6 sem
```

Y dentro de uno, el **procedimiento contado como una línea de tiempo**, que es
lo que el encargo llama «schedule» y lo que hoy son cinco apartados sueltos:

```
Asesoría completa                             28 clientes  ·  [Ver como cliente]
──────────────────────────────────────────────────────────────────────────────
  ① CUANDO ENTRA          Alta general  ✎              14 preguntas · 4 pasos
     ↓                    Su gimnasio, medidas del día 0 y fotos
  ② LO QUE VE             Entreno · Dieta · Revisión
     ↓                    No ve: su peso, sus calorías
  ③ CADA SESIÓN           3 preguntas  ✎               esfuerzo, dolor, nota
     ↓
  ④ CADA SEMANA           Check-in del lunes  ✎        6 preguntas · 2 bloques
     ↓                    Recuérdaselo el martes si no lo entrega
  ⑤ CADA 4 SEMANAS        Revisión                     pesajes, medidas, fotos
     ↓
  ⑥ CUÁNDO AVISARTE       Sin señales a los 10 días · Cobro 3 días antes
```

Los seis pasos **son exactamente los datos que ya guarda `protocol.js`**: no hay
modelo nuevo, hay una lectura nueva. Lo que cambia es que un entrenador ve *su
manera de trabajar* de un vistazo, y no cinco cajones de configuración.

**Y una novedad de modelo, la única de este movimiento:** los protocolos tienen
nombre y son varios. El cliente lleva uno puesto; sus excepciones siguen siendo
suyas. *(Decisión tomada: entran con nombre desde el primer día. Una pantalla
«Protocolos» con un solo protocolo es un ajuste disfrazado de sección, y
rediseñarla después cuesta más que hacerla bien ahora.)*

### El calendario, que es lo que ellos llaman «schedule» y a nosotros nos falta

En el panel de ajustes por cliente de Coachway, la última fila dice **«Change
check-in form & schedule»**: el formulario y **cuándo se pide** son una sola
decisión. Nosotros tenemos la primera mitad y la segunda no existe: el check-in
es semanal por convención, y en `protocol.js` no hay ni día ni frecuencia.

Es un hueco real, y pequeño:

```
  ④ CADA SEMANA        Check-in del lunes  ✎
     ↓                 Se le abre el domingo por la tarde
                       Si no lo entrega, recuérdaselo el martes
```

Tres datos —`day` (qué día se pide), `every` (cada cuántas semanas) y
`remindAfter` (a los cuántos días se le recuerda)— en el protocolo, con la
convención de hoy como valor por defecto para que nadie note el cambio. El
recordatorio es la pieza de Coachway que mejor encaja con nuestra ley de «sin
reproches»: **le quita al entrenador el papel de policía** sin que la app juzgue
a nadie, y ya tenemos por dónde sale (`updates.js`, el mismo canal del aviso).

Y el resto de su panel de ajustes por cliente —ocultar peso, ocultar
calorías, «avisarme si no hay actividad en N días»— **ya lo tenemos construido
entero** desde el 7 sep (`protocol.hidden` con el contexto `Oculto.jsx`,
`alertDays`, la pausa). Lo único que cambia es que ahora se lee dentro del
procedimiento, en el paso que le toca, en vez de en una lista de conmutadores.

### Por qué

Porque un protocolo **es el producto que vende el entrenador**. Enseñárselo como
ajuste es enseñarle su negocio como una casilla. Y porque el número —uno solo—
es una limitación de verdad para el único perfil que nos importa: el que ya vive
de esto y lleva a treinta personas de dos o tres tipos distintos.

### Qué toca

- `profiles.preferences.protocols[]` (lista con nombre e id) al lado del
  `protocol` de siempre, **sin migración**: la columna `preferences` es abierta,
  y es literalmente el patrón que ya usa `coachIntakeForms`. Sin lista, el
  protocolo único de hoy *es* la lista; quien nunca cree un segundo no nota nada.
- `clients.preferences.protocol` **no se toca**: sigue siendo la copia aplicada
  y la fuente de verdad de cada cliente (se puede perder la plantilla, nunca lo
  que un cliente tiene puesto). Se le añade `protocolId` para saber de cuál viene
  y poder decir «tiene 2 excepciones sobre Powerlifting».
- `routes.jsx`: `/protocolos` en un plano nuevo `COACH_TALLER`;
  `SETTINGS_SECTIONS` pierde `protocolo` y `SETTINGS_HOME` pasa a `perfil`.
- `ProtocolPanel.jsx` se parte: el **estado** (destino, plantillas, guardado,
  aplicar) se conserva; los cinco apartados se recolocan en la línea de tiempo.
  Las secciones (`ModulesSection`, `AlertsSection`, `VisibilitySection`,
  `CheckinBlocksSection`) **no se reescriben**: ya reciben `(protocol, onSave)` y
  ya se reutilizan en el diálogo de la cartera. Eso es lo que hace este
  movimiento barato.

### Riesgo

El `matchesTemplate` / `isException` de `lib/protocolTemplate.js` compara contra
*la* plantilla. Con varias, compara contra **la que lleva puesta el cliente**.
Es un cambio de una función, pero si se hace mal, la cartera empieza a decir
«tiene excepciones» a todo el mundo. Va con pruebas antes que con pantalla.

---

## 5. Movimiento 2 · Formularios: sección propia y un constructor de verdad

> *«Coachway tiene formularios en la barra, se añaden a procedimientos y queda
> todo muy integrado, y tienen un aspecto radicalmente más bonito que los
> nuestros. Efort también está creando un mecanismo muy pulido.»*

### Antes

Tres editores para el mismo objeto:

- **El alta** (`IntakeFormSection`): lista de los 19 campos de la ficha con
  casillas «se pregunta / es obligatoria», más hasta 8 preguntas propias en una
  fila con un desplegable de tipo. Ya admite **varios formularios** (D14).
- **La sesión** (`QuestionEditor`): hasta N preguntas propias.
- **El check-in** (`CheckinBlocksSection` + `QuestionEditor`): bloques
  encendidos/apagados y preguntas.

Y ninguno de los tres enseña **cómo se va a ver**.

### Después

**`/formularios` — la lista, con la misma gramática que la cartera:**

```
Formularios                                          [+ Nuevo formulario]
─────────────────────────────────────────────────────────────────────────
  Alta general              Alta        14 preguntas   2 protocolos   ···
  Alta de fuerza            Alta         9 preguntas   1 protocolo    ···
  Check-in del lunes        Check-in     6 preguntas   3 protocolos   ···
  Después de entrenar       Sesión       3 preguntas   3 protocolos   ···
```

La columna que ellos no tienen y nosotros sí podemos tener es **«en qué
protocolos se usa»**: es lo que convierte una lista de formularios en un sistema
integrado en lugar de un cajón de plantillas sueltas.

### El constructor, con la gramática de Efort

Las capturas del constructor nuevo de Efort corrigen la primera versión de este
documento, que copiaba de Coachway un **carril de paleta permanente** a la
izquierda. Efort hace algo mejor y que además es la gramática que esta app ya
tiene en todas partes —*navegador · mesa · panel contextual*—:

- **No hay paleta fija.** El lienzo es el formulario y nada más. Añadir abre un
  **selector**, que en el formulario vacío ES la pantalla entera: *«¿Qué quieres
  preguntar? Empieza por lo que quieres saber»*, con las opciones agrupadas en
  **Preguntas · Seguimiento · Estructura**. Es un empty state que enseña el
  producto en vez de un lienzo en blanco con un botón.
- **A la derecha, los ajustes de LA pregunta seleccionada** (su
  `QUESTION SETTINGS`: «7. Medidas corporales», el tipo debajo, y sus opciones
  propias agrupadas por zona con conmutadores Izq./Dcho.). Nada de un panel de
  ajustes del formulario entero: el panel habla de lo que está tocado.
- **La tarjeta de pregunta lleva sus gestos en el canto**: el asa de arrastre a
  la izquierda, duplicar y borrar a la derecha, y aparecen al pasar por encima.
- Al pie del lienzo, un solo botón: **+ Añadir pregunta**.

```
┌ ‹ Alta general ───────────────── Alta · 14 preguntas ── [Ver como cliente] [Guardar] ┐
├─────────────────────────────────────────────────────┬────────────────────────────────┤
│  ▤  1 · QUIÉN ERES                                  │  AJUSTES DE LA PREGUNTA        │
│  ─────────────────────────────────────────────────  │                                │
│  ⠿  Fecha de nacimiento              obligatoria    │  7 · Medidas corporales        │
│  ⠿  Altura                           obligatoria    │  ⬓ Medidas corporales      ⓘ   │
│                                                     │                                │
│  ▤  2 · CÓMO ENTRENAS                               │  TRONCO                        │
│  ─────────────────────────────────────────────────  │  ☑ Pecho                       │
│  ⠿  Días disponibles                 obligatoria    │  ☑ Ombligo                     │
│  ⠿  ⚑ Su gimnasio       monta su álbum de máquinas  │  ☑ Glúteo                      │
│                                                     │                                │
│  ⠿  ⬓ Medidas corporales                  ⧉  ␡  ←── │  BRAZOS          Izq.  Dcho.   │
│     Pecho · Ombligo · Glúteo · Muslo · Gemelo       │  ☑ Brazo          ●     ●      │
│     ⓘ Cómo se miden                                 │                                │
│                                                     │  PIERNAS         Izq.  Dcho.   │
│              [ + Añadir pregunta ]                  │  ☑ Muslo          ●     ●      │
│                                                     │  ☑ Gemelo         ●     ●      │
└─────────────────────────────────────────────────────┴────────────────────────────────┘
```

**El selector, calcado en estructura y traducido a lo nuestro:**

```
                        ¿Qué quieres preguntar?
                     Empieza por lo que quieres saber.

  PREGUNTAS                    SEGUIMIENTO              DE SU FICHA
  ▭  Texto libre               ◔  Peso                  ⚑  Su gimnasio
  ◉  Una respuesta             ⬓  Medidas corporales    ♥  Condicionantes
  ☑  Varias respuestas         ◒  Pliegues              ⊘  Lo que no come
  ─  Escala 1–10               ◈  Fotos de progreso     ◐  Nivel de actividad
  ⛁  Un archivo                ⚕  Cribado TCA           ▦  Los 19 campos…

  ESTRUCTURA
  ▤  Apartado
```

Tres grupos y no dos: donde Efort tiene *Questions · Progress tracking ·
Layout*, nosotros tenemos una cuarta familia que ellos no pueden tener —**de su
ficha**—, porque nuestros campos no son inventados para el formulario: son los
que la aplicación ya usa en todas las demás pantallas.

### La guía de medidas: la pieza que hay que copiar entera

En la captura, la tarjeta de medidas de Efort tiene un enlace **ⓘ** que abre un
diálogo con una **lámina del cuerpo con siete puntos numerados** y, al lado, la
lista de los sitios elegidos con **cómo se mide cada uno**: *«Cintura — a media
altura entre la última costilla palpable y la cresta ilíaca»*. Y un subtítulo
que vale por toda la pantalla: **«Mismo sitio y mismas condiciones cada vez.»**

Esto no es adorno: es **la única forma de que un perímetro medido por el cliente
en su casa sirva para algo**. Nosotros pedimos nueve perímetros
(`PERIMETER_LABELS`: pecho, brazo dcho./izq., ombligo, glúteo, muslo dcho./izq.,
gemelo dcho./izq.) y seis pliegues (`FOLDS_LABELS`) **sin explicar ni uno**. La
guía es barata —una lámina SVG y catorce frases— y se pinta en los dos sitios
donde hace falta: en el constructor, para que el entrenador vea qué está
pidiendo; y **en el portal, junto al campo**, que es donde está la persona con
la cinta métrica en la mano.

Es además exactamente nuestra ley del oficio: la app no opina de la medida, pero
sí se ocupa de que se tome bien.

**La diferencia con ellos, y es nuestra ventaja, no una copia:** en Coachway los
«Smart Fields» son ocho enchufes cerrados que ellos programaron. En nuestro caso
la paleta de la izquierda **es la ficha del cliente** (`profile.js`,
`conditions.js`, `anthropometry.js`, `photos.js`, `equipment.js`, `scoff.js`,
`goals.js`) — o sea, todo lo que la aplicación ya sabe usar. `intakeForm.js` lo
dice con todas las letras: *«lo que faltaba no era qué preguntar, era quién
contesta»*. Este constructor es esa doctrina hecha pantalla.

Cuentas hechas: hoy podemos ofrecer **nueve enchufes** (peso objetivo, medidas,
fotos, su gimnasio con fotos de máquinas, condicionantes, alimentos que no come,
nivel de actividad, cribado TCA validado, y los 19 campos de ficha), frente a los
ocho de Coachway — y tres de los nuestros (su gimnasio, condicionantes,
antropometría completa) ellos no los tienen.

### Por qué el aspecto cambia tanto

Porque hoy el editor está hecho de **filas de ajuste** (casilla + etiqueta +
desplegable) y el después está hecho de **tarjetas de pregunta**: el mismo
material con el que se pinta el portal del cliente. La pregunta se ve como la va
a ver quien la conteste. Ese es el salto que el encargo llama «radicalmente más
bonito», y no depende de ninguna estética nueva: depende de dejar de dibujar un
formulario como si fuera una pantalla de preferencias.

### Qué toca

- Un dominio `domain/forms.js` que **unifica** los tres tipos (`alta`,
  `checkin`, `sesion`) sobre lo que ya existe: `intakeForm.js` (que ya tiene
  varios formularios, tope de preguntas propias y tipos), las preguntas de
  `protocol.js` y los pasos de `intake.js`. **No es un catálogo nuevo de
  preguntas** —eso sigue prohibido y con razón—: es un formato común para
  listas de preguntas que ya se guardan en tres formas parecidas.
- Migración de lectura tolerante: los formularios y protocolos existentes se
  leen tal cual; se escribe en el formato nuevo. Nada que convertir a mano.
- `IntakeSteps.jsx` ya sabe agrupar en pasos: los «apartados» del lienzo son
  eso, ahora visibles y reordenables.

### Riesgo

Es el movimiento más caro de los diez y el que más superficie toca. Se puede
partir en dos: primero **la lista y el constructor del alta** (que ya es
multiforme), y después absorber check-in y sesión.

---

## 6. Movimiento 3 · Ejercicios: la biblioteca con ficha y con tu voz

> *«Coachway tiene biblioteca de alimentos y ejercicios, lo que permite cambiar
> la forma de presentar ciertos ejercicios, añadiendo también su url donde el
> entrenador explica o sus pautas.»*

### Antes

El ejercicio es un nombre. `catalog_exercises` ganó en la 0094/0095 `equipment` y
`description`, y la biblioteca del equipo (`exercises`) sigue siendo
`{name, muscle_group}`. Ninguna de las dos cosas tiene pantalla: se ven dentro de
un autocompletado mientras montas una hoja.

### Después

**`/ejercicios`**, con la forma de lista que ya usa la cartera (banda de
cabecera, pestañas, buscador, filtros con cuenta):

```
Ejercicios                    Todos · Tuyos · Del catálogo    [+ Nuevo ejercicio]
──────────────────────────────────────────────────────────────────────────────────
  ⬒ Press banca            Pecho        Barra        ▶ tu vídeo    18 clientes
  ⬒ Remo con barra         Espalda      Barra        ▶ tu vídeo     14 clientes
  ⬒ Prensa                 Cuádriceps   Máquina                     9 clientes
  ⬒ Hip thrust             Glúteo       Barra        ▶ tu vídeo     22 clientes
```

Y **la ficha del ejercicio**, que es donde está la petición del encargo, en dos
capas que no se pisan:

```
Press banca                                                    Pecho · Barra
────────────────────────────────────────────────────────────────────────────
  DEL CATÁLOGO      Escápulas retraídas, pies fijos, la barra baja al esternón.
                    Necesita: barra, banco.

  TUYO              ▶  https://youtu.be/…            «así lo explico yo»
  ─────────────     ✎  Tu clave: «que no rebote; si el hombro molesta, cierra
                       un dedo el agarre»
                    ⇄  Alternativas: Press mancuernas · Press inclinado · Máquina
                    ⚑  Lo llevan 18 clientes  ·  se programa en 6 bloques
```

- **La capa del catálogo es referencia y no se toca** — exactamente la regla que
  fijó la 0094: la ficha vive en el catálogo, no se copia a mil bibliotecas.
- **La capa tuya es tu voz**: tu vídeo (enlace de YouTube/Drive/Vimeo, no subida
  —la subida es coste de almacenamiento y moderación que hoy no queremos—), tu
  clave técnica y tus alternativas por defecto.

### El vídeo: sí, lo decide él, y así se integra

Respuesta del dueño: *«sí, pero eso ha de poder decidirlo él y ha de estar bien
integrado»*. Las dos mitades, resueltas con mecanismos que ya existen:

**Lo decide él, en tres niveles y sin ningún ajuste nuevo:**

1. **Por ejercicio.** Un ejercicio sin enlace no enseña nada. No hay vídeo por
   defecto, no hay vídeo del catálogo, no hay vídeo de terceros: **si no lo pone
   el entrenador, no existe.**
2. **Por cliente.** El módulo `videos` ya está en `protocol.js` —*«una lista de
   ejercicios previos, con su vídeo y tus indicaciones, delante de cada
   sesión»*—. Es el interruptor que ya decide si esa persona ve vídeos, y sirve
   tal cual.
3. **Por momento.** El enlace vive en la ficha; en la hoja del entrenador **no
   se pinta nada** (la orden sobre «la carne» sigue en pie: ni miniaturas ni
   fotos en las hojas). El vídeo aparece solo en el móvil del cliente, dentro
   del ejercicio abierto.

**Y «bien integrado» quiere decir tres sitios concretos, no una pantalla nueva:**

- **En el alta del ejercicio** (`AddExerciseForm`), un campo más, opcional y en
  voz baja. Coachway lo resuelve con un conmutador —`[Subir vídeo | Enlace de
  YouTube]`— del que nosotros solo construimos la mitad derecha: se pega la URL
  y punto. Sin subida: 50 MB por ejercicio es coste de almacenamiento,
  moderación y copias, y no compra nada que un enlace no dé.
- **En la ficha del ejercicio**, con la previsualización al lado de tu clave
  técnica, porque son la misma cosa: cómo lo explicas tú.
- **En la rutina del cliente**, en el renglón del ejercicio: un ▶ discreto que
  abre el vídeo a pantalla completa **y debajo tu clave**, que es lo que de
  verdad hace falta delante de la máquina. Si no hay enlace, el renglón no
  cambia en absoluto.

Con eso, el ejercicio del portal queda con la anatomía que Efort presume en su
propia captura de historial —*«los atletas pueden consultar su rendimiento
anterior mientras entrenan»*—, y que nosotros ya tenemos a medias:

```
‹ Press banca                                              Pecho · Barra
──────────────────────────────────────────────────────────────────────────
  ▶  Vídeo (0:42)          «que no rebote; si el hombro molesta, cierra
                            un dedo el agarre»                    ← tu clave
  ──────────────────────────────────────────────────────────────────────
  HOY            4 × 8    @ 62,5 kg
  ──────────────────────────────────────────────────────────────────────
  LA ÚLTIMA VEZ  hace 6 días · 4 × 8 @ 60 kg      ← ComparativaEjercicio,
  ANTES          hace 13 días · 4 × 8 @ 60 kg        que ya existe
  ⇄  ¿No puedes? Press mancuernas · Máquina       ← tus alternativas
```

La única pieza nueva de ese renglón es el ▶ y la clave. Todo lo demás está
construido: la comparativa, el historial y las alternativas.

### Qué toca

- Migración aditiva sobre `exercises` (la biblioteca del equipo):
  `video_url text`, `cue text`, `alternatives text[]`. Tres columnas, sin
  riesgo, y **no duplican la ficha del catálogo**: son la capa del entrenador.
- Orden de lectura: lo tuyo primero, el catálogo detrás. Es el mismo criterio
  que ya aplica `mergeCatalog` con los alimentos.
- `AddExerciseForm.jsx` gana una puerta a la ficha; nada de lo que hace hoy
  cambia.
- Las alternativas se cruzan con `equipment.js` (lo que hay en su gimnasio),
  que ya existe.

---

## 7. Movimiento 4 · Alimentos: la despensa que ya tenemos, por fin visible

### Antes

179 alimentos de catálogo más la despensa española de la 0096, la biblioteca del
equipo, `foodMatch.js` (ata nombres importados con tres respuestas honestas:
seguro, dudoso, desconocido) y `foodEquiv.js` (equivalencias). **Todo invisible.**

### Después

**`/alimentos`**: lista con macros por 100 g, unidad natural, etiquetas de
alérgenos (0094), origen (tuyo / catálogo) y en cuántas dietas se usa. Con dos
cosas que Coachway no tiene:

- **«Se parece a»**: `foodMatch` puesto a la vista, para limpiar duplicados —el
  problema real de una biblioteca de equipo que crece.
- **Equivalencias como material propio**: hoy `foodEquiv` funciona dentro de una
  dieta; aquí se ven y se editan las tuyas («100 g de arroz = 120 g de patata»),
  que es criterio del entrenador y no receta de la app.

Su ventaja —1.819 ingredientes con marcas y país— es **dato, no código**: la
tabla, sus categorías y su regla de solo-lectura ya existen. Crecer el catálogo
con BEDCA y marcas de supermercado español es una migración de siembra, y es la
versión nuestra de su «Country: United Kingdom» — en español, que su app del
cliente no habla.

---

## 8. Movimiento 5 · Plantillas: donde acaban tus días guardados

`pieces.js` guarda hasta 30 días con nombre («mi mejor día de pierna») en las
preferencias del entrenador, y solo se pueden ver desde el cajón de un bloque.
Un entrenador que guarda su criterio y luego no encuentra dónde está deja de
guardarlo.

**`/plantillas`** es la vitrina: tus días, con su resumen
(`pieceSummary`: «5 ejercicios · 18 series»), en qué clientes se usaron y desde
dónde nacieron. Sin tocar el creador de bloques —eso es del otro hilo—: aquí solo
se **ven, renombran, borran y previsualizan**.

> Si el otro hilo decide que el bloque entero también se guarda como plantilla,
> esta pantalla es la casa que lo espera. No hace falta decidirlo ahora.

---

## 9. Movimiento 6 · Inicio: el «power panel» nuestro mira hacia delante

> *«Ambos tienen power panel y dashboard. Nuestro Resumen me gusta mucho.»*

Hay que separar dos cosas que se confunden:

- **El Resumen del cliente** (`dashboard/Dashboard.jsx`: Cómo va, Desde que
  empezaste, Cuerpo, Entreno, Hilo, Plan, Sensaciones) es nuestro dashboard, es
  mejor que el suyo y **no se toca**.
- **Inicio** (`Today.jsx` con las cuatro colas) es nuestro power panel, y le
  falta la mitad de delante.

### Antes

```
Por revisar 4  ·  Sin programar 3  ·  Sin señales 2  ·  Cobros 1
```

Cuatro colas de lo que ya se acumuló. Honesto, sin reproches, y **ciego al
futuro**.

### Después: la misma pantalla con un horizonte

```
ESTA SEMANA                                                 lunes 8 · septiembre
────────────────────────────────────────────────────────────────────────────────
  Te esperan            Por revisar 4 · Sin programar 3 · Sin señales 2 · Cobro 1
  Se te acaba           3 bloques terminan esta semana  →  Marta, Javier, Lucía
                        2 dietas llevan 6 semanas sin tocarse
  Ya hiciste            6 revisiones · 4 bloques programados · 2 altas
```

- **«Se te acaba»** es la traducción honesta del «New block needed 10 / Block
  update needed 13» de Efort. La diferencia es de voz: ellos dicen *qué te falta
  por hacer* (reproche); nosotros decimos *qué se termina* (hecho). El dato ya
  está en `blocks.js`.
- **«Ya hiciste»** no existe en ninguna de las dos y es lo más nuestro que hay
  aquí: el trabajo del entrenador es invisible y una aplicación que solo enseña
  pendientes acaba dando ansiedad. Es la ley de «sin reproches» llevada a su
  conclusión.
- El **Despacho de tres columnas de Coachway sigue descartado** (rechazado el 4
  sep). Inicio no es una bandeja de correo: es la pizarra de tu semana.

---

## 10. Movimiento 7 · Ajustes adelgaza y vuelve a su sitio

**Antes:** Protocolo · Equipo · Integraciones · Copia (+ Perfil, Suscripción,
Ayuda).
**Después:** Perfil · Equipo · Integraciones · Copia · Suscripción · Ayuda.

Ajustes deja de contener oficio. La consecuencia visible: `SETTINGS_HOME` deja de
ser `/ajustes/protocolo`.

---

## 11. Movimiento 8 · El cliente dice qué protocolo lleva

En la cabecera del cliente, junto a la anatomía (edad · altura · último peso),
una chapa más: **el protocolo que lleva puesto**, y si tiene excepciones, cuántas.

```
◍ Marta Ruiz    34 años · 168 cm · 61,2 kg      ◎ Asesoría completa · 2 excepciones
```

Pulsarla abre el diálogo «El protocolo de Marta» que **ya existe** (la 6ª pasada
de la cartera lo construyó entero: módulos, check-in, preguntas, alertas,
visibilidad, pausa). Lo único que cambia es que ahora también dice de dónde
viene, y que «volver a la plantilla» tiene sentido porque hay varias.

---

## 12. Movimiento 9 · El acabado: cómo se ve un formulario nuestro

El encargo dice que sus formularios son «radicalmente más bonitos». Lo son por
cuatro decisiones concretas, todas copiables sin copiar su estética:

| Lo que hacen ellos | Lo que hacemos nosotros |
|---|---|
| Cada campo es una **tarjeta** con icono de color, título y una línea que explica qué hace | Igual, pero el icono usa nuestros ocho matices de dato (`--data-*`, los mismos de `tonoDe`), no ocho colores nuevos |
| El canvas tiene **aire**: 24 px entre tarjetas, ancho contenido | Igual: `s6` entre tarjetas y el ancho de la hoja, no el de la pantalla |
| La paleta izquierda es **arrastrable** y también se pulsa | Pulsar añade al final; arrastrar coloca. Con teclado, el orden se cambia con las flechas |
| El campo inteligente **dice a dónde va lo que se conteste** | Nuestra frase es más fuerte porque es verdad: «cae en su ficha», «alimenta la revisión», «monta su álbum de máquinas» |

Y la **firma** de esta familia de pantallas —una por pantalla, la regla de la
casa— es el botón **«Ver como cliente»**: el formulario se abre en el chasis
real del portal, con el móvil dibujado, y se puede contestar en falso. Ninguna de
las dos referencias lo tiene. Es lo que convierte «configurar preguntas» en
«diseñar la experiencia de tu cliente», que es literalmente lo que el encargo
pide.

Lo que **no** entra, por doctrina ya escrita: nada de relieve ni 3D en la
selección (píldora plana), nada de degradados, el tic sigue siendo el SVG de
puntas redondas, estado en cápsula y dato en tinta, y el acento sigue siendo
`#3b49df`.

---

## 13. Lo que NO se copia, y por qué

- **El generador de dietas automático** de Coachway, *tal y como es*: te rellena
  las comidas y le llega al cliente. Lo que sí entra —por la decisión de la 2ª
  edición— es un **relleno que se enciende, se ve como propuesta y lo firmas
  tú**. La diferencia no es de potencia, es de quién responde del plan.
- **Draft / Publish** de programas. Nuestro `block.overrides` con tramos es
  mejor: cada cambio dice hasta cuándo vale.
- **Automations y Leads.** Somos una herramienta de trabajo, no un CRM de
  captación. Si algún día hace falta captar, es otra aplicación.
- **La subida de vídeo** (50 MB por ejercicio). Enlace, no fichero.
- **Su estética.** Verde bosque, papel crema y serif itálica son *su* identidad.
- **El chat, de momento.** Decisión del dueño: *«lo dejamos para más adelante»*.
  No está descartado —es un producto entero, con notificaciones, moderación,
  retención y RGPD, y hoy compite con WhatsApp— pero no entra en estas tandas.
  Cuando entre, tendrá documento propio, porque reordena Inicio.

---

## 14. Dónde este documento contradice a la doctrina escrita

CLAUDE.md §16 obliga a decirlo en voz alta:

1. **`domain/catalog.js` dice literalmente «por qué no hay pantalla de
   catálogo»** — porque obligaría a un paso previo que nadie da. Este documento
   propone dos pantallas de biblioteca. **No es una retirada de la doctrina: es
   su límite.** El buscador dentro de la dieta y de la hoja **se queda como está
   y sigue siendo la entrada principal**. La biblioteca no existe para importar,
   existe para **curar** (tu vídeo, tu clave, tus marcas, tus duplicados). Si al
   construirla aparece un flujo de «ir a importar antes de trabajar», se ha
   construido mal.
2. **La migración 0094 dice que la biblioteca del entrenador NO gana columnas**
   porque la ficha es del catálogo. Aquí se le añaden tres. La regla que se
   conserva es la de fondo: **no se copia el dato de referencia**. `video_url`,
   `cue` y `alternatives` no son la ficha del catálogo: son la capa del
   entrenador, que el catálogo no puede tener.
3. **`routes.jsx` describe tres planos** (primario, del cliente, de ajustes).
   Este documento añade un cuarto, el Taller, y le quita uno a Ajustes. El
   comentario largo de `routes.jsx` hay que reescribirlo, no dejarlo mintiendo.
4. **`docs/producto.md` §2 llama a la aplicación «un archivador»** y ordena el
   producto alrededor de la semana. El Taller no contradice eso —sigue sin haber
   archivador— pero sí añade una segunda unidad de trabajo (el material) que ese
   documento no contempla. Si esto se aprueba, se anota allí.

---

## 15. Las cinco decisiones, cerradas

**15.1 · La cartera en la barra — se colapsa.** El dueño no lo tenía claro, así
que la decido con el argumento que ya está pagado en sangre: la lección del 5 sep
dice *una línea por persona y ningún porqué*, y con cinco entradas nuevas debajo
la lista entera empuja al Taller fuera de la pantalla. La barra queda con **quien
espera algo** (los que hoy llevan punto) y **«Clientes 26»** como puerta al
resto. Nadie pierde acceso a nadie: la cartera completa es una pantalla, y la
buena. Si al usarlo con su cartera real no le convence, mover el corte es una
línea.

**15.2 · El vídeo — sí, con las tres llaves del §6.** Lo pone el entrenador por
ejercicio, el módulo `videos` decide por cliente, y no se pinta jamás en la hoja
del entrenador.

**15.3 · Protocolos con nombre — desde el primer día.** Ver §4: una sección con
un solo elemento no es una sección.

**15.4 · El chat — más adelante.** No entra y no se descarta.

**15.5 · Proponer — sí, con las tres condiciones de la 2ª edición.** Encendido
por él, marcado como propuesta hasta que lo firma, y diciendo de dónde sale.
Los menús guardados entran en el Taller; el resto de propuestas (reparto de
kcal, progresión sugerida) son movimientos propios y esperan a que los pida.

### Lo que sí queda abierto

- **Dónde acaba el Taller.** Documentos compartidos (contratos, guías en PDF —el
  «Vault» de Coachway) encajarían, y no estaban en el encargo.
- **Si el catálogo crece con marcas españolas ahora o después.** Es dato y no
  código, así que es una decisión de calendario, no de arquitectura.

---

## 16. El orden de trabajo

**Tanda 1 · El plano nuevo** *(barato, y sin él no se ve nada de lo demás)*
`COACH_TALLER` en `routes.jsx`, el antetítulo de la barra, la cartera colapsada,
`/protocolos` con la lista y la línea de tiempo del procedimiento (sin novedad de
modelo todavía), Ajustes adelgazado.

**Tanda 2 · Formularios** `/formularios` con la lista, el lienzo, el selector de
«¿qué quieres preguntar?» en tres grupos, el panel de ajustes de la pregunta
seleccionada, **la guía de medidas** (lámina + las catorce frases, en el
constructor y en el portal) y «Ver como cliente». Después absorbe check-in y
sesión.

**Tanda 3 · El material** `/ejercicios` con la ficha en dos capas (+ migración de
tres columnas) y el ▶ con tu clave en la rutina del cliente, `/alimentos` con
macros, alérgenos y «se parece a», `/plantillas` como vitrina de `pieces.js`.

**Tanda 4 · El horizonte** «Se te acaba» y «Ya hiciste» en Inicio; el calendario
del check-in (día, cada cuánto, recordatorio); la chapa del protocolo en la
cabecera del cliente.

**Tanda 5 · La escala** Siembra del catálogo de alimentos (BEDCA + marcas
españolas) y de ejercicios. Es dato, no código, y se puede hacer en paralelo con
todo lo anterior.

---

## 17. Qué gana el producto, dicho sin adornos

Hoy Caveman Hub es mejor que las dos referencias en tres sitios concretos: la
hoja de entreno (pauta, semáforo y fantasma de lo hecho), la revisión con su
espina y su histórico, y el respeto por el criterio del entrenador (la app no
receta). Y es peor en uno solo, pero es el que se ve al abrir: **parece más
pequeña de lo que es**, porque la mitad de lo que sabe hacer no tiene ninguna
puerta.

Este replanteamiento no añade capacidades nuevas casi en ningún sitio: **abre
puertas a lo que ya está construido**. Es la manera más barata que hay de estar
por encima de los dos.
