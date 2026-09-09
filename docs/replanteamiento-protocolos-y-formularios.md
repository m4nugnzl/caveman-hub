# Replanteamiento: el protocolo es un plan de acciones, no un panel de ajustes

> **Encargo (8 sep 2026).** *«El siguiente paso natural es reformular por
> completo la hoja protocolo. El objetivo de la hoja es definir ciertos
> protocolos o acciones bajo premisas concretas, establecer planes de acción,
> asignar a clientes concretos formularios o cosas concretas, poder crear
> acciones. Los formularios deberían poder crearse en formularios de forma libre
> y definirse en protocolo su uso, o asignarse a clientes bajo ciertas acciones,
> o lo que sea. Estudia, analiza y replantea correctamente ambas ventanas.»*

Cinco verbos, y ninguno de los cinco existe hoy: **definir bajo premisas**,
**establecer planes**, **asignar**, **crear acciones**, **definir el uso**.

Lo que hay es una pantalla que declara **qué existe** para una persona. Lo que se
pide es una pantalla que declare **qué pasa, y cuándo**.

---

## 1. El diagnóstico, verificado en el código

No son impresiones. Cada punto lleva el fichero donde se comprueba.

### D1 · Hay dos editores del mismo formulario, y los dos están vivos

`ConstructorFormulario.jsx` (591 líneas, lienzo con panel contextual) en
`/formularios`, y `IntakeFormSection.jsx` (476 líneas, lista de casillas) dentro
de `/protocolos#alta`. **Los dos escriben lo mismo**: `coachPrefs.intakeForms`,
por `intakeFormsToPreferences`.

Y ya han divergido. El constructor tiene «Ver como cliente», tarjeta por
pregunta, marca de obligatoria en el canto y el control real del cliente en el
carril. La sección del protocolo tiene lo que al constructor le falta: renombrar,
quitar, «hacerla la principal» y el recuento por tanda (`8/13`). **Ninguno de los
dos hace el trabajo entero**, así que hoy hay preguntas que solo se pueden tocar
en un sitio y verbos que solo están en el otro.

Lo grave es que está escrito que no se hiciera. El docblock de
`FormulariosPanel.jsx` dice, sobre el check-in y la sesión: *«copiarlas aquí
sería el tercer editor de lo mismo, que es justo lo que este replanteamiento vino
a quitar»*. Se evitó el tercero y se dejó el segundo.

### D2 · Un formulario NO se puede asignar a un cliente que ya existe

`newClientPreferences(coachPrefs, { intakeFormId })` copia el formulario **solo
al dar de alta** (`lib/protocolTemplate.js:303`, llamado desde
`useClients.js:731`). No hay ninguna acción, en ninguna pantalla, que le cambie o
le mande un formulario a alguien que ya está dentro.

La pantalla lo sabe y lo dice en un `Notice`:

> *«El cuestionario de {cliente} es el que se le copió el día que entró, y desde
> aquí no cambia.»*

Es decir: **la pantalla declara la carencia en vez de resolverla**, y la carencia
es literalmente la mitad del encargo («asignar a clientes concretos formularios o
cosas concretas»).

### D3 · El selector de destino miente en uno de sus cinco apartados

`ProtocolPanel` abre con un `TargetPicker` que gobierna la pantalla entera
—«estás configurando: mi plantilla / Marta»— salvo `IntakeFormSection`, que lo
ignora porque el formulario vive en la cuenta del entrenador. Se avisa con un
`Notice`, pero un aviso no arregla un fallo de estructura: es un editor con un
mando global que uno de sus hijos desobedece.

### D4 · El protocolo es singular donde el resto del producto ya es plural

`intakeForms` es una lista con nombre y tope (`MAX_FORMS = 6`). El protocolo es
**uno solo** (`profiles.preferences.protocolTemplate`). Quien lleva pérdida de
grasa y powerlifting no puede tener dos formas de trabajar — que es el perfil que
paga. Estaba escrito en `docs/replanteamiento-del-taller.md` §4 y no se construyó.

### D5 · No hay premisas. Todo el protocolo es «siempre»

`defaultProtocol()` son nueve claves y ninguna tiene condición: `services`,
`modules`, `questions`, `checkinQuestions`, `custom`, `checkin`, `weighIns`,
`alertDays`, `hidden`. Lo único con algo parecido a un disparador es `alertDays`
(«avísame si pasan N días sin…») y `weighIns` (una cuenta semanal).

No existe **cuándo** se pide el check-in: ni día, ni cada cuántas semanas, ni
recordatorio. La semana es semanal por convención del código, no por decisión de
nadie. Coachway une «check-in form & schedule» en una sola fila; nosotros tenemos
la primera mitad.

### D6 · Las acciones ya existen — encerradas en el alta

`domain/intake.js` guarda un paso así:

```js
{ id, label, owner: 'client' | 'coach', link?, file?, done, auto? }
```

Dueño, lo que entrega, estado y automarcado. **Eso es una acción, completa.**
Tiene catálogo (`INTAKE_CATALOG`, 12 entradas), pasos propios (`addCustomStep`,
`MAX_CUSTOM_STEPS = 6`), orden (`moveStep`), reparto (`setStepOwner`) y salida al
portal del cliente (`IntakeTasks.jsx`).

Lo único que le falta es **cuándo**. Está clavado en un momento —el alta— y hasta
el nombre lo encierra: `INTAKE_CATALOG`, `clientSteps`, `IntakeSteps`.

No hay que inventar el primitivo. Hay que sacarlo de su momento.

### D7 · «El procedimiento» promete una línea de tiempo y entrega un índice

`LineaDelProcedimiento` pinta cinco momentos en orden con su resumen vivo, y cada
uno es un enlace a un ancla. La lectura es buena —dice qué le pasa a un cliente y
cuándo—, pero **debajo no hay momentos: hay cinco cajones de ajustes**. Se lee un
procedimiento y se edita un panel de control. El carril es la promesa que la
izquierda no cumple.

### D8 · Formularios no contiene dos de los tres formularios del producto

`FormulariosPanel` es una tabla de una a seis filas donde:

- la columna **«Cuándo»** dice siempre `Cuando entra` — está escrito a mano;
- la columna **«Dónde se usa»** no es un dato, es una conjetura:
  `formularios.length > 1 ? 'Se elige al invitar' : 'Todas las altas'`.

Y debajo, dos enlaces a `/protocolos#checkin` y `/protocolos#sesion` con el
rótulo «Lo que preguntas después». O sea: **la pantalla de formularios avisa de
que dos de los tres formularios están en otra pantalla.**

### D9 · Tres cuestionarios, dos modelos, dos editores, dos sitios

| | Dónde se guarda | Catálogo | Preguntas propias | Editor |
|---|---|---|---|---|
| El alta | `preferences.intakeForm(s)` | `PROFILE_FIELDS` (19) | `text · number · yesno`, tope 8 | `ConstructorFormulario` **y** `IntakeFormSection` |
| La sesión | `protocol.questions` | `SESSION_QUESTIONS` | `scale · text` con `min/max/color`, tope 6 | `QuestionEditor` |
| La semana | `protocol.checkinQuestions` | `CHECKIN_QUESTIONS` | las mismas de arriba | `QuestionEditor` |

El constructor bonito sirve para **uno de los tres**. Los otros dos se editan con
una lista de casillas con flechitas de subir y bajar.

### D10 · Los «enchufes» son el mejor hallazgo del constructor y no salen de él

El constructor inventó una idea buena: un **enchufe** no es una pregunta, es una
pieza de la ficha que se enciende entera y **dice a dónde va lo que se conteste**
(«Medidas de partida → a su antropometría»). Son cuatro: datos de partida,
medidas, salud, cribado.

Pues bien: los perímetros y los pliegues del check-in son exactamente eso —caen
en su antropometría— y se configuran en `CheckinBlocksSection`, en otra pantalla,
con otra gramática (un `SegmentedControl` de tres estados) que no se parece en
nada a la tarjeta de enchufe. Y los pesajes semanales, igual.

### D11 · «Ver como cliente» no es una previsualización

Llama a `openClientView('/mi/alta')` y **navega al portal real**; sin cliente
activo, un toast que pide que abras a alguien primero. En una pantalla del Taller
—que no habla de clientes— eso es un salto de contexto disfrazado de vista previa.

---

## 2. La tesis

> **Un protocolo es una lista de acciones con su premisa. Un formulario es una de
> las cosas que una acción pide.**

De ahí salen las dos ventanas sin discutir nada más:

- **`/protocolos`** deja de decir *qué existe* y pasa a decir *qué pasa, y
  cuándo*. Es un plan, y se edita como se edita un formulario: lienzo de acciones
  a la izquierda, la acción tocada a la derecha.
- **`/formularios`** deja de ser el cajón de las altas y pasa a ser **el cajón de
  todo lo que se pregunta** —el alta, el parte de la sesión y el check-in de la
  semana—, con un solo editor. El protocolo no edita preguntas: **elige cuál y
  dice cuándo**.

Eso es, palabra por palabra, lo que pide el encargo: *«los formularios deberían
poder crearse en formularios de forma libre y definirse en protocolo su uso»*.

Y de paso, las dos ventanas pasan a tener **la misma gramática** —lienzo · panel
contextual— que es la que el producto ya usa en Ejercicios y en el constructor, y
la que se aprobó en la tanda 3 del banco de dos planos.

---

## 3. El modelo: qué es lectura nueva y qué es modelo nuevo

Esta es la parte que hace el replanteamiento barato o carísimo, así que va
declarada pieza a pieza. **Casi todo el plan sale del dato de hoy.**

### 3.1 · La acción

```js
accion = {
  id,
  hace,       // pedir | dar | hacer | avisar
  que,        // formId, peso, perimetros, pliegues, fotos, o texto libre
  cuando,     // la premisa (abajo)
  quien,      // client | coach        <- ya existe: intake.owners
  link, file, // lo que entrega        <- ya existe: intake.links / intake.files
  required,   // sin esto no se da por hecho <- ya existe en dos sitios
}
```

Las cuatro clases de `hace` no se inventan: son las cuatro que ya hay repartidas.

| `hace` | De dónde sale hoy |
|---|---|
| **pedir** | `intakeForm`, `protocol.questions`, `checkinQuestions`, `checkin.perimeters/folds`, `weighIns`, pasos con `owner: client` |
| **dar** | pasos con `link: true` (vídeo de bienvenida, rutina, anamnesis) |
| **hacer** | pasos del entrenador (análisis postural, onboarding, cobro) |
| **avisar** | `alertDays` (`training`, `weight`) |

### 3.2 · La premisa

| Premisa | ¿Existe hoy? |
|---|---|
| `al entrar` | Sí — es el único momento que hay (`intake.steps`) |
| `al terminar de entrenar` | Sí, implícito — módulo `sessionFeedback` + `questions` |
| `cada semana` | Sí, implícito — el check-in es semanal por convención |
| `el día X · cada N semanas` | **NO** — hueco declarado (D5) |
| `a las N semanas de entrar` | **NO** |
| `si pasan N días sin …` | Sí — `alertDays` |
| `cuando se lo mandes tú` | **NO** — y es lo que resuelve D2 |

### 3.3 · Lo que se deriva sin tocar una sola columna

La línea de acciones de cualquier protocolo de hoy se pinta **entera** con
`clientProtocol()` + `clientIntake()` + `coachIntakeForms()`:

```
AL ENTRAR                     intake.steps (con owner y link/file)
                              + intakeForm (la acción «pídele el alta»)
AL TERMINAR DE ENTRENAR       protocol.questions, si el módulo sessionFeedback
CADA SEMANA                   weighIns · checkin.perimeters · checkin.folds
                              · checkinQuestions
SI PASAN N DÍAS SIN …         alertDays.training · alertDays.weight
```

No hay migración para esto. **Es la misma jugada que ya hizo
`LineaDelProcedimiento`**, llevada hasta el final: allí la lectura nueva se quedó
en un índice y aquí se convierte en el editor.

### 3.4 · Lo que SÍ es modelo nuevo (tres cosas, y ninguna necesita migración)

1. **`profiles.preferences.protocols.items[]`** — protocolos con nombre e id.
   Patrón calcado de `coachIntakeForms`: sin lista, el protocolo único de hoy *es*
   la lista, y quien no cree un segundo no nota nada.
   `clients.preferences.protocol` **no se toca** (sigue siendo la copia aplicada y
   la única verdad de cada cliente); se le añade `protocolId` para poder decir «2
   excepciones sobre Powerlifting».
2. **El cuándo del check-in** — `day`, `every`, `remindAfter` dentro del
   protocolo, con la convención de hoy como valor por defecto (lunes, cada 1, sin
   recordatorio) para que nadie note el cambio.
3. **La acción suelta** — un paso en `clients.preferences.intake.steps` que puede
   ser «pídele el formulario X». `intake.js` ya guarda pasos propios por cliente;
   lo que falta es que un paso pueda **apuntar a un formulario** y el gesto que lo
   mande. Con eso, «asignar a un cliente concreto un formulario» son dos clics y
   cero tablas nuevas.

### 3.5 · Y los tres cuestionarios pasan a ser objetos con nombre

`formularios[]` gana un campo `momento` (`alta` · `sesion` · `semana`), y el
protocolo apunta a **tres ids** en vez de llevar las preguntas dentro.

El lado del cliente **no cambia**: al aplicar el protocolo se le copia la lista de
preguntas resuelta a `clients.preferences.protocol`, exactamente como hoy se le
copia `intakeForm`. Es el mismo motivo de siempre —el cliente no puede leer el
perfil de su entrenador (`profiles`, 0002)— y la misma solución que ya está
escrita en `domain/intakeForm.js`. `clientProtocol()` sigue saneando igual.

Lo que **no** se unifica es el almacenamiento de las preguntas propias:
`intakeForm.custom` (`text·number·yesno`) y `protocol.custom` (`scale·text` con
`min/max/lowerIsBetter/color`) se quedan como están. Unificarlos sería una
migración de datos de todos los clientes para ganar elegancia y perder el color de
las series de la analítica. **Lo que se unifica es el editor**, que recibe su
vocabulario de tipos por parámetro — igual que `QuestionEditor` ya recibe `list` y
`catalogo`.

---

## 4. Ventana 1 · `/protocolos`

### Antes

```
Protocolos
──────────────────────────────────────────────────────────┬──────────────────
 Estás configurando                                       │ El procedimiento
 [Mi plantilla] [Marta] [Nerea] [Javi·excepción] …         │  1 Qué llevas
 «Tu forma de trabajar»                  [Poner al día]   │    Entreno · Dieta
──────────────────────────────────────────────────────────│  2 Cuando entra
 Qué llevas       > 2 casillas                            │    Alta · 14 preg
 El alta          > 12 pasos + 19 casillas + 4 tandas     │  3 Lo que ve
 La aplicación    > 4 perfiles + 6 módulos + 2 avisos     │    5 piezas
                    + 2 «qué no ve»                       │  4 Cada sesión
 La sesión        > catálogo + orden + propias            │    3 preguntas
 El check-in      > pesajes + 2 bloques + catálogo        │  5 Cada semana
                                                          │    6 preguntas
```

Una pantalla. Un protocolo. Ocho bloques de conmutadores. El carril de la derecha
cuenta la historia que la izquierda no cuenta.

### Después, primer nivel: **la lista**

```
Protocolos                                            [+ Nuevo protocolo]
─────────────────────────────────────────────────────────────────────────
 Protocolo             Qué lleva            Acciones      Clientes
 Asesoría completa     Entreno · Dieta      12            18
 Solo entreno          Entreno               7             6
 Powerlifting          Entreno · Revisión    9             2
                                                          ─────
 Nadie sin protocolo.                                      26
```

Misma cinta y misma caja que Clientes, Ejercicios, Alimentos y Formularios: es la
sexta lista del Taller y no inventa chasis (la ley de `aire-de-las-hojas`).

### Después, segundo nivel: **el protocolo abierto**

```
< Asesoría completa            18 clientes · 3 atrasados   [Ver como cliente]
────────────────────────────────────────────────────┬────────────────────────
 QUÉ LE LLEVAS   Entreno · Dieta          [lápiz]   │   LA ACCIÓN
                                                    │
 ── AL ENTRAR ──────────────────────────────────    │   Pídele un formulario
  · Pídele    Alta general      14 preguntas   ·    │   ┌──────────────────┐
  · Pídele    Las fotos de su gimnasio              │   │  Cuál            │
  · Dale      Vídeo de bienvenida  youtu.be/…       │   │  [Alta general v]│
  · Haz tú    Análisis postural                     │   │  > 14 preguntas  │
                                                    │   │    Editarlo →    │
 ── AL TERMINAR DE ENTRENAR ───────────────────     │   └──────────────────┘
  · Pídele    El parte           3 preguntas        │
                                                    │   Cuándo
 ── CADA SEMANA · lunes ────────────────────────    │   [Al entrar        v]
  · Pídele    El check-in        6 preguntas        │
              su peso, sus perímetros, sus pliegues │   Quién lo hace
                                                    │   ( ) Tú   (o) Él
  · Recuérdaselo el martes si no lo ha entregado    │
                                                    │   [x] Hace falta para
 ── A LAS 4 SEMANAS ────────────────────────────    │       dar el alta por
  · Pídele    Sus fotos de progreso                 │       hecha
                                                    │
 ── SI PASAN 10 DÍAS SIN ENTRENAR ──────────────    │   ── CÓMO LO VE ÉL ──
  · Avísame                                         │   ┌──────────────────┐
                                                    │   │ (el control real,│
 [+ Añadir acción]                                  │   │  apagado)        │
                                                    │   └──────────────────┘
```

Cinco decisiones de diseño, y el porqué de cada una:

1. **Los rótulos son las premisas, no los apartados.** «Al entrar», «Cada
   semana», «Si pasan 10 días sin entrenar». La numeración `01/02/03` de
   `LineaDelProcedimiento` **se retira**: la casa dice que solo vale si el
   contenido es una secuencia, y aquí ya no lo es —«si pasan 10 días» no va
   después de «cada semana», va en otro eje—. El rótulo *es* la información.
2. **Cada renglón contiene un verbo y un sujeto**: `Pídele · Dale · Haz tú ·
   Avísame`. Es la queja C de `aire-de-las-hojas` («nuestras filas nombran la
   cosa, las suyas la contienen») contestada por donde de verdad se contesta: no
   apretando el relleno, sino poniendo información en la fila.
3. **El carril derecho es la acción tocada, con el control real del cliente
   debajo.** Es exactamente `ConstructorFormulario`, incluida la vitrina hundida
   `.como-la-ve` que reutiliza `Pregunta` del portal. El carril **nunca está
   vacío**: sin selección manda la primera acción, como en Ejercicios.
4. **«Qué le llevas» y los módulos NO son acciones y no entran en la línea.** Un
   servicio no pasa en ningún momento: es el alcance. Va arriba, en una línea, con
   su lápiz. Los módulos igual — son piezas que existen, no cosas que ocurren.
5. **El selector de destino desaparece de aquí** (ver §6).
6. **Las piezas del check-in NO son acciones sueltas** *(corregido el 8 sep, con
   las dos pantallas ya construidas)*. Este documento las dibujaba arriba como
   tres renglones —«Su peso», «Sus perímetros», «El check-in»— y a la vez §5 las
   convertía en **enchufes** del formulario de la semana. Se construyeron las dos
   cosas, y el resultado es que `weighIns`, `checkin.perimeters`,
   `checkin.folds` y `askPhotos` tenían **dos interruptores en dos pantallas**:
   D1 otra vez, en otro sitio. Cada semana pasa UNA cosa —se le pide su
   check-in— y el renglón la resume («su peso, sus perímetros y sus pliegues ·
   6 preguntas»). El protocolo se queda con el cuándo, el a quién y el
   recordatorio; el qué vive entero en el formulario, donde ya estaba su mando.

### `[+ Añadir acción]` — el selector

Misma pieza que «¿Qué quieres preguntar?» del constructor: en el protocolo vacío
ocupa la pantalla y **enseña el producto** en vez de esconderlo tras un botón.

```
                        ¿Qué pasa, y cuándo?
             Empieza por lo que quieres que ocurra.

 PÍDELE                DALE                  HAZ TÚ            AVÍSAME
  Un formulario         Un vídeo              Una casilla       Si no entrena
  Su peso               Un documento          tuya              Si no se pesa
  Sus perímetros        Una nota                                Si no entrega
  Sus pliegues                                                  el check-in
  Sus fotos
  Un archivo
```

Y después, el **cuándo**, con las siete premisas de §3.2. Dos pasos, y el segundo
es el que hoy no existe.

---

## 5. Ventana 2 · `/formularios`

### Antes

```
Formularios                                        [+ Nuevo formulario]
────────────────────────────────────────────────────────────────────────
 Formulario     Cuándo          Preguntas   Dónde se usa
 Alta general   Cuando entra    14          Todas las altas      [ed] [x]

 Lo que preguntas después
  · El check-in de cada semana   -> se configura en el protocolo
  · Lo de después de entrenar    -> se configura en el protocolo
```

Una tabla de una fila con una columna escrita a mano, una columna adivinada, y un
pie que avisa de que aquí no están los otros dos formularios.

### Después

```
Formularios                                        [+ Nuevo formulario]
─────────────────────────────────────────────────────────────────────────────
 Formulario           Momento             Preguntas        Lo usan
 Alta general         Al entrar           14               Asesoría completa
 Alta de fuerza       Al entrar            9               Powerlifting
 El parte             Tras entrenar        3               Asesoría · Solo entreno
 Check-in del lunes   Cada semana          6 + 2 medidas   Asesoría completa
 Revisión mensual     Cada 4 semanas       4 + fotos       Asesoría completa
 ────────────────────────────────────────────────────────────────────────────
 Sin usar: «Alta express» — ningún protocolo la pide.
```

- **«Momento»** deja de estar escrito a mano: sale del `momento` del formulario.
- **«Lo usan»** deja de ser una conjetura: son los protocolos que lo referencian.
  Es la columna que ni Coachway ni Efort tienen, y ahora dice la verdad.
- **La última fila importa**: un formulario que no pide nadie es trabajo perdido,
  y hoy no hay forma de saberlo.

### El constructor, uno solo — CONSTRUIDO el 8 sep (parte y check-in)

`ConstructorLibre` es ya EL constructor del parte, del check-in y del suelto:
los tres se editan como una lista de elementos. La traducción vive en el dominio
—`elementosDe` lee cualquier formulario como elementos y `desdeElementos` lo
devuelve a su forma de siempre—, así que el portal, la revisión y la analítica
siguen leyendo exactamente lo mismo.

Lo que eso cambia para el entrenador, que es lo que pedía («son opciones
semifijas, no puedes hacer tú una»):

- El catálogo es una **estantería**: coges «Adherencia a la dieta», la renombras,
  le cambias la escala o le pones una regla, y **su serie no se parte** porque
  conserva el `origen`.
- Peso, perímetros, pliegues y fotos son **elementos del oficio** dentro del
  lienzo, con su mando propio (cuántos pesajes, obligatorio u opcional). Ya no
  hay enchufes en una pantalla y acciones en otra.
- Cada momento solo ofrece **lo que sabe guardar** (`tiposDeMomento`): el parte y
  el check-in guardan escala o texto, así que no se ofrece «Elegir una» para que
  sus opciones se pierdan en silencio al guardar. Y el tope de seis preguntas
  propias se dice en la lámina en vez de tirar la séptima al recargar.

**El alta se queda con `ConstructorFormulario`**: su modelo son campos de perfil
y no preguntas, y no tiene puente todavía. Es lo único que queda de la tanda 2.

### El constructor, uno solo, con tres vocabularios

`ConstructorFormulario` se queda **tal cual está** —lienzo, tarjetas, selector,
carril con el control real— y recibe por parámetro qué se puede poner dentro:

| Momento | Catálogo | Enchufes | Tipos propios |
|---|---|---|---|
| **Al entrar** | `PROFILE_FIELDS` (19) | datos de partida · medidas · salud · cribado | `text · number · yesno` |
| **Tras entrenar** | `SESSION_QUESTIONS` | — | `scale · text` |
| **Cada semana** | `CHECKIN_QUESTIONS` | **peso · perímetros · pliegues · fotos** | `scale · text` |

La fila en negrita es D10 resuelto: los bloques del check-in dejan de ser un
`SegmentedControl` en otra pantalla y pasan a ser **enchufes**, que es lo que
siempre fueron —cada uno dice a dónde cae lo que se conteste—. Sus tres estados
(obligatorio · opcional · apagado) no se pierden: apagado = no está en el lienzo;
obligatorio/opcional = la marca del canto, que es la misma que ya llevan las
preguntas del alta.

Y desde el 8 sep es el ÚNICO sitio donde se encienden: el protocolo dejó de
ofrecerlas en «Añadir acción» y su carril las enseña en lectura, con la puerta
para venir aquí. Un campo, un mando.

**`IntakeFormSection.jsx` muere** (476 líneas). Con él muere D1, y muere D3 —el
único bloque que desobedecía al selector de destino ya no está en esa pantalla.

**`QuestionEditor.jsx` muere** (228 líneas) en cuanto el constructor cubre los
otros dos momentos. Con una salvedad importante: hoy lo reutiliza
`ClientSettings.jsx` (el diálogo «El protocolo de X» de la cartera), así que tiene
que morir **después** de que ese diálogo tenga sustituto, no antes.

---

## 5-bis. El acabado: lo que hace que las dos mitades sean una

> *«Este tipo de cosas son las que hemos de pulir mucho para que el hacer por
> parte del entrenador y el cómo lo ve el cliente proporcionen una experiencia
> única.»* — 8 sep, con las capturas de Efort y Coachway delante.

La estructura de §4 y §5 estaba bien y el acabado no. Cuatro movimientos, cada
uno leído de una referencia concreta y traducido a nuestra ley, no copiado.

### A · El renglón CONTIENE el campo (de Coachway)

En su constructor, la tarjeta «Circumference measurements» lleva dentro sus
medidas reales —`Arm (cm)`, `Chest (cm)`, `Waist (cm)`— cada una con su mando y
su aspa, y un «+ Add Metric» al pie. En el nuestro, la fila decía
«Perímetros · 9 sitios».

Esta es exactamente **la enfermedad «C» que quedó declarada y sin curar** en el
estudio del aire: *«en Coachway cada renglón CONTIENE el campo; en el nuestro
cada renglón NOMBRA la cosa. Nuestra lista es un índice, la suya es el
formulario»*. Y es también la respuesta de verdad al blanco sobrante: un índice
de diez entradas no llena la hoja por mucho que se le apriete el relleno.

Se aplica a todo lo que tiene partes: perímetros (9 filas), pliegues (6), fotos
(las tomas), el peso (la cifra semanal), el enlace de una entrega, el umbral de
un aviso. La tarjeta abierta enseña sus filas; cerrada, se resume.

### B · El disco dice de qué clase es (de Coachway, con nuestra paleta)

Sus «smart fields» llevan baldosa cuadrada con matiz por familia. El hallazgo es
bueno —una lista monocroma obliga a leer cada fila para saber qué es cada cosa—,
pero su forma no es nuestra.

Aquí es un **disco**, y el matiz sale de `--data-*`, que son los colores de los
discos de competición. No es una excepción a la ley: `tokens.css` dice que el
color es del dato y la señal del acento, y `ley-del-color` remata «discos
distinguen». Es el mismo mecanismo que la cartera ya usa para las etiquetas
(`tonoDe`, ocho matices). El acento sigue siendo, y solo, lo que se puede tocar.

| Familia | Disco |
|---|---|
| Pídele un formulario / una pregunta | `--data-blue` |
| Medidas, peso, fotos (lo que cae en su antropometría) | `--data-violet` |
| Dale algo | `--data-teal` |
| Haz tú | `--data-amber` |
| Avísame | `--data-orange` |

### C · El selector es una lámina, no una rejilla (de Efort)

Su pantalla dice **«What would you like to ask? / Start with what you want to
know»** sobre una ilustración, y debajo dos columnas de **icono + palabra**, sin
una sola caja. Silencio y aire. La mía era una rejilla de botones con canto:
mucho más ruidosa para hacer menos.

El nuestro: la lámina (una ilustración de fichas y un mando), la pregunta
**«¿Qué quieres que pase?»**, el subtítulo **«Empieza por lo que quieres que
ocurra»**, y cuatro columnas silenciosas —Pídele · Dale · Haz tú · Avísame—. El
segundo paso, «¿Y cuándo?», enseña al lado lo que va a pasar.

### D · La guía de medición — y aquí la firma es nuestra

Es la pieza que Efort enseña entera: lámina del cuerpo con puntos numerados,
cómo se mide cada sitio y la regla de oro —*«same placement and conditions each
time»*—.

**Hoy pedimos nueve perímetros y seis pliegues sin explicar ni uno.** Ni al
entrenador ni al cliente. Un dato mal tomado no es un dato peor: es ruido que
ensucia la serie contra la que se compara todo lo demás.

Nuestra versión, con lo que la diferencia:

- Los sitios son **los nuestros** (`PERIMETER_LABELS`), que no son los suyos:
  nueve medidas en **seis sitios** —pecho, brazo, ombligo, glúteo, muslo,
  gemelo—, con los pares izquierdo/derecho dichos como pares. Ellos miden
  cuello, hombros y cintura; nosotros ombligo. Copiar su lista sería pedir cosas
  que la aplicación no guarda.
- Cada sitio lleva **cómo** se mide y **el error de siempre**: «sin meter tripa;
  es el sitio donde más se falsea sin querer», «relajado, no en tensión: el mismo
  brazo contraído da tres centímetros más».
- La firma: **la regla** de `tokens.css` —las marcas de graduación— encabeza la
  lámina. La casa dice que solo aparece donde de verdad hay una escala, y una
  guía de medición es el sitio más literal que existe para decir «aquí se mide».
- **La misma lámina la ven los dos.** El entrenador al configurarla; el cliente
  junto al campo, en su portal. Un solo componente, y por tanto una sola verdad.

### E · Y el carril derecho ENSEÑA el portal, no lo describe

Era una caja hundida con una frase. Ahora es el portal del cliente con su chasis
y el control real: la escala del parte con su tope marcado y sus dos pies («Muy
fácil» / «Al límite»), las opciones de una pregunta de una respuesta, las filas
de las medidas con su unidad, el hueco de las tres fotos.

Esto no es una maqueta paralela: es `Pregunta`, **exportada desde
`Client/IntakeQuestions.jsx` con `soloLectura`**, que ya existe desde la tanda 3
del banco de dos planos. Un segundo renderizador se queda atrás el día que se
añada una clase de pregunta, y entonces la muestra miente — que es peor que no
tenerla.

Y donde no hay nada que enseñar, el plano lo **dice** en vez de quedarse vacío:
«Es una casilla tuya, el cliente no la ve»; «Los pliegues no se le piden: eso es
plicómetro y mano entrenada». La regla del banco de dos planos es que ningún
carril derecho está vacío.

---

## 6. Asignar cosas a un cliente concreto

Es la mitad del encargo y hoy no existe (D2). Va por dos sitios, y ninguno es
`/protocolos`.

### 6.1 · Su protocolo sale del selector y se va a donde está él

Hoy, para tocarle algo a Marta hay dos caminos que hacen casi lo mismo: el
`TargetPicker` de `/protocolos` y el diálogo «El protocolo de X» de `/clientes`
(que ya reutiliza `ModulesSection`, `CheckinBlocksSection`, `QuestionEditor` ×2,
`AlertsSection` y `VisibilitySection`). La regla ya está dictada desde la 4ª
pasada de la cartera: *«los ajustes y darle clic al cliente hacen prácticamente lo
mismo»*.

Con protocolos con nombre, el selector deja de tener sentido: **la lista de
protocolos ya es el «quién»**. Así que:

- `/protocolos` habla solo de **tus formas de trabajar**. Cero clientes en un
  carril de chips.
- Lo de una persona concreta vive en **su** diálogo, que pasa a estar completo
  —hoy le faltan `ServicesSection` e `IntakeSteps`, que solo están en
  `/protocolos`—.
- «Poner al día», «quién se ha quedado atrás» y «quién tiene excepción» **no se
  pierden**: suben a la cinta del protocolo abierto («18 clientes · 3 atrasados ·
  2 excepciones [Poner al día]»), que es donde se leen mejor que en un carril de
  cuarenta nombres.

Y «Ver como cliente» deja de dar un toast: el protocolo sabe quién lo lleva, así
que puede entrar por uno de ellos.

### 6.2 · «Mandarle algo» — la acción suelta

Desde su ficha, desde la cartera y desde la barra de lote:

```
        Mandarle algo a Marta
 ───────────────────────────────────────
  Un formulario   [Alta de fuerza     v]
  Un vídeo        pegar enlace
  Un documento    subir archivo
  Una casilla     escríbela
 ───────────────────────────────────────
  Le aparece en su portal, en su lista de
  tareas. Se marca sola cuando la haga.
                        [Mandársela]
```

Cae en `clients.preferences.intake.steps` como un paso más con `owner: client`. El
portal **ya sabe pintarlo** (`IntakeTasks.jsx` lee `clientSteps` y le pone
destino), el entrenador **ya lo ve marcarse solo** (`stepDone`), y el aviso **ya
tiene canal** (`updates.js`). Es la pieza que menos código nuevo necesita y la que
más pedía el encargo.

---

## 7. Lo que muere, y por qué no se echa de menos

| Muere | Líneas | A dónde va |
|---|---|---|
| `IntakeFormSection.jsx` | 476 | Al constructor, que ya lo hacía mejor |
| `QuestionEditor.jsx` | 228 | Al constructor, con vocabulario `scale` |
| `LineaDelProcedimiento.jsx` | 124 | Se convierte en la línea de acciones, que es editable |
| `TargetPicker.jsx` | 205 | Al diálogo del cliente + la cinta del protocolo |
| `CheckinBlocksSection.jsx` | 102 | A enchufes del formulario de la semana |
| `PresetsSection.jsx` | 48 | A «empieza por» al crear un protocolo nuevo |
| El pie `.taller-otros` de Formularios | — | Las dos filas pasan a ser filas de la tabla |

**Sobreviven intactos** `ServicesSection`, `ModulesSection`, `AlertsSection`,
`VisibilitySection` y `ConstructorFormulario`: reciben `(protocol, onSave)` o
`(form, onChange)` y se recolocan sin reescribirse. Eso es lo que hace este
replanteamiento asumible.

---

## 8. Dónde este documento contradice a la doctrina escrita

Obligación de CLAUDE.md §16. Tres contradicciones, todas declaradas:

1. **`ProtocolPanel.jsx` defiende el selector de destino** —*«construirlas como
   dos pantallas significaría dos copias del mismo editor que acabarían
   divergiendo»*—. El argumento era bueno con **una** plantilla. Con protocolos
   con nombre, el destino ya lo dice la lista, y el editor sigue siendo uno solo:
   el del cliente es el mismo componente con otro `onSave`, que es exactamente lo
   que `ClientSettings.jsx` ya hace hoy sin duplicar nada.
2. **`IntakeFormSection.jsx` defiende vivir dentro del protocolo** —*«es la misma
   decisión que las otras cuatro de esta pantalla»*—. Lo era mientras el
   formulario no fuera un objeto con nombre. Desde que hay varios, elegir cuál se
   usa es del protocolo y **cómo es cada uno** es del formulario. La frontera es
   la del encargo.
3. **`domain/intake.js` dice que el alta es un momento** y todo su vocabulario lo
   asume. Aquí se propone sacar el primitivo del momento. Es una ampliación, no
   una vuelta atrás: los pasos de hoy son las acciones con premisa `al entrar`, y
   ningún cliente pierde nada.

---

## 9. Riesgos, dichos antes de tocar nada

1. **`matchesTemplate` / `isException` / `needsTemplate` comparan contra *la*
   plantilla** (`lib/protocolTemplate.js`). Con varias, comparan contra la que
   lleva puesta el cliente; y con formularios por referencia, hay que **resolver
   antes de comparar**. Si se hace mal, la cartera dice «tiene excepciones» a todo
   el mundo. **Va con pruebas antes que con pantalla.**
2. **`NOT_COMPARED_KEYS` tiene que crecer con `protocolId`** y `templateForClient`
   con él: las dos listas contestan la misma pregunta desde los dos lados y si
   discrepan, un cliente sale «distinto» justo después de igualarlo.
3. **`clientProtocol()` descarta lo que no conoce.** Cualquier clave nueva que
   viva dentro de `protocol` (el `day`/`every`/`remindAfter`) tiene que entrar en
   el saneado **en el mismo commit**, o desaparece en el primer cambio.
4. Los `id` de sección (`#alta`, `#checkin`, `#sesion`) **están enlazados desde
   fuera** (la ficha del cliente, Formularios). Al desaparecer las secciones hay
   que redirigir, no romper.
5. `verify-styles.mjs` exige que toda clase exista en CSS y que los iconos sean
   13/15/20. `npm run catalogo` regenera el catálogo congelado de la radiografía.
   Añadir rutas rompe `analytics.test.js`; tocar el reparto de acciones del
   contexto rompe `AppContext.test.jsx`.

---

## 10. El orden de trabajo

**Tanda 1 · El dominio, sin pantalla** (es donde está el riesgo)
`domain/actions.js`: leer la línea de acciones de un protocolo de hoy y escribirla
de vuelta, sin perder nada. `protocols[]` con nombre. `protocolId` en el cliente.
`matchesTemplate` resolviendo antes de comparar. Pruebas contra la demo real.

**Tanda 2 · `/formularios` se queda con los tres cuestionarios**
`momento` en el formulario, el constructor recibe su vocabulario, mueren
`IntakeFormSection` y el pie `.taller-otros`. La columna «Lo usan» dice la verdad.

**Tanda 3 · `/protocolos` es la lista + el banco de acciones**
La lista, el protocolo abierto, el selector «¿Qué pasa, y cuándo?», la cinta con
atrasados y excepciones. Muere el `TargetPicker`.

**Tanda 4 · Lo del cliente concreto**
El diálogo «El protocolo de X» se completa (servicios + acciones), nace «Mandarle
algo», muere `QuestionEditor`.

**Tanda 5 · El cuándo de verdad**
`day` / `every` / `remindAfter`, la premisa «a las N semanas», y el recordatorio al
cliente por `updates.js` — que es la pieza de Coachway que mejor encaja con la ley
de «sin reproches»: le quita al entrenador el papel de policía sin que la app
juzgue a nadie.

---

## 11. Las cuatro decisiones que hacen falta antes de construir

1. **¿El cliente concreto sale de `/protocolos`?** *(§6.1)* Recomendación: sí — ya
   tiene su diálogo en la cartera y hoy hay dos caminos para lo mismo, que es la
   queja que ya se puso una vez sobre la cartera.
2. **¿Los tres cuestionarios pasan a ser objetos con nombre, o solo se unifica el
   editor?** *(§3.5)* Con nombre es más trabajo y es lo que pide el encargo
   («definirse en protocolo su uso»). Solo el editor es media tanda y deja la
   columna «Lo usan» a medias.
3. **¿Entran las premisas nuevas ahora** —«a las N semanas», «cuando se lo mandes
   tú»— **o la tanda 3 se limita a reordenar lo que ya hay?**
4. **¿El recordatorio al cliente entra?** *(tanda 5)* Es lo único de todo esto que
   le habla al cliente sin que el entrenador pulse nada.

---

## 12. Lo CONSTRUIDO (8 sep 2026)

«Me parece bien, procede.» Las cuatro decisiones de §11 se tomaron en la
dirección recomendada y quedan declaradas: el cliente concreto **sale** de
`/protocolos`, los tres cuestionarios pasan a ser **objetos con nombre**, las
premisas nuevas **entran**, y el recordatorio **entra apagado de fábrica**.

### Tanda 1 · El dominio (donde estaba el riesgo)

- `domain/formularios.js` — los tres cuestionarios como objetos con `momento`.
  **Mudanza silenciosa**: sin lista guardada, los de siempre SON la lista
  (`heredados()` reconstruye las altas de `intakeForms` y arma el parte y el
  check-in con lo que haya en `protocolTemplate`). Ids fijos `form_sesion` /
  `form_semana` para que un protocolo que los apunte no se quede huérfano.
- `domain/protocolos.js` — protocolos con nombre, el mismo patrón.
  `resolveProtocolo` produce la forma que el cliente ya sabe leer.
- `domain/acciones.js` — la línea de acciones: lectura, `anadirAccion`,
  `quitarAccion`, el catálogo de «¿qué pasa?» con sus premisas válidas, y
  `mandarleAlgo`.
- `lib/protocolTemplate.js` — la capa que **resuelve antes de comparar**:
  `planDe`, `planDeCliente`, `necesitaSuPlan`, `protegidoDeSuPlan`,
  `igualASuPlan`, `parchePara`. Las primitivas de siempre no se tocaron.
- **89 pruebas nuevas**, y dos hallazgos que salieron de ellas:
  1. Mover a alguien de protocolo **sin aplicárselo** lo deja «sin decidir y
     desviado», que `isProtected` protege a propósito. Por eso cambiar de
     protocolo **aplica en el mismo gesto**, no solo apunta.
  2. `applyProtocolToClient` fusionaba por sección a ciegas: con `protocolId`
     —un valor suelto, no un objeto— habría guardado `{ 0: 'p', 1: '2' }` sin
     fallar ni avisar. Ahora una sección se fusiona y un valor suelto se
     reemplaza.

### Tanda 2 · `/formularios` con los tres cuestionarios

Columnas «Momento» y «Lo usan» con datos de verdad, y la fila que dice que un
formulario no lo pide nadie. **Un solo constructor** que recibe su vocabulario
del momento; los bloques del check-in pasan a ser **enchufes** con su mando.
Nace `GuiaDeMedidas` (los 6 sitios de `PERIMETER_LABELS`, el cómo y el error de
siempre, encabezada por la regla). `SessionFeedback` gana `soloLectura` para que
el carril enseñe el control real. **Muere `IntakeFormSection.jsx`** (476 líneas).

### Tanda 3 · `/protocolos` como lista + banco de acciones

`ProtocolosPanel.jsx`: la lista con su disco, y el protocolo abierto como línea
de acciones agrupada por premisa, con la regla en el rótulo, el disco de familia
por `data-tono` y el carril de la acción tocada. El selector «¿Qué pasa?» → «¿Y
cuándo?». El día y la frecuencia del check-in se editan en el rótulo de su
premisa. **Mueren** `ProtocolPanel`, `TargetPicker`, `LineaDelProcedimiento`,
`PresetsSection` e `IntakeSteps` — unas 1.360 líneas con `IntakeFormSection`.

### Tanda 4 · Lo del cliente concreto

`ClientSettings` gana: **cuál lleva puesto** (y cambiarlo, aplicando al momento),
«Ponerle al día», `ServicesSection` y **«Mandarle algo»** — la acción suelta que
cae en sus pasos propios, se pinta en su portal y se marca sola. El alta elige
protocolo además de formulario.

### Tanda 5 · El cuándo, y que llegue

`schedule` (`day` / `every` / `remindAfter`) vive **dentro de `protocol`** y pasa
por `clientProtocol`, porque tiene que viajarle al cliente: el recordatorio se
calcula en su portal y el portal solo lee su fila. Entra en `COMPARED_KEYS` — la
prueba que vigila que ninguna clave se quede fuera por olvido lo exigía.
`recordatorioDeSemana` en `updates.js`, apagado de fábrica, sin reproche, y
diciendo lo único que el cliente no sabe: **cuándo se espera que lo entregue**.
No cuenta en la campana.

### Validado

`npm run lint`, `npm run types`, `npm run verify`, **1.887 pruebas** y
`npm run build`, todo en verde. *Salvo dos ficheros que no son de este trabajo:*
`WorkoutLogEditor.jsx` y `CabeceraDelBloque.jsx`, del creador de bloques que se
lleva en otra sesión, tienen clases sin CSS y un import sin usar. No se han
tocado.

### Lo que queda declarado y sin hacer

- **`QuestionEditor.jsx` sigue vivo**: lo usa `ClientSettings` para las preguntas
  de una persona. Muere cuando ese diálogo adopte el constructor, no antes.
- **La guía de medidas todavía no la ve el cliente**: el componente está hecho
  para los dos, pero solo está montada en el constructor. Falta colgarla del
  campo de perímetros en su portal.
- **`every` no filtra todavía**: se guarda y se enseña, pero el check-in se sigue
  pidiendo todas las semanas. Cambia `weeklyCheckIn`, que es otra tanda.
