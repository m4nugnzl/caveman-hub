# Coachway · Las capturas: la mecánica de gestión, pieza a pieza

Análisis de las 19 capturas de la app real (`capturas/referencias/coachway/`,
6 sep 2026). El dossier 01–05 se hizo desde su web pública; esto es **el producto
por dentro**, y lo que importa aquí no es la piel (ya juzgada en 02) sino la
MECÁNICA: cómo gestionan clientes, programas, ejercicios, alimentos, formularios
y ajustes. Cada sección cierra con el contraste contra nuestro código, verificado
archivo a archivo — no de memoria.

El veredicto en una línea: **su ventaja no es diseño (el nuestro es mejor) ni
criterio (recetan; nosotros no): es CONTENIDO con media (1.772 ejercicios con
vídeo, 1.819 ingredientes, 1.100 recetas) y GESTIÓN A ESCALA (colas con
contador, acciones en bloque, ajustes por cliente).** Los dos son alcanzables
sin traicionar ninguna ley de la casa.

**Segunda edición (mismo día, tras el veredicto del dueño** — «buenas ideas
pero sin demasiada unicidad; piensa la app como un todo; rediseña cómo se
crean los bloques»**):** el estudio se reordena alrededor de DOS LEYES que ya
son nuestras y que todo lo demás instancia:

1. **El material viene a la mesa.** Nunca vas tú al almacén: lo que hace falta
   para decidir aparece donde se decide. Ya es la doctrina de `catalog.js`
   («ir a importar es el paso que nadie da»); falta aplicarla al entreno. Y la
   versión nuestra es más fuerte que la suya: su cajón es un almacén genérico;
   el nuestro es EL CLIENTE (su gimnasio, su historial, sus restricciones).
2. **Cada cambio dice su tramo.** Ya está en el dominio (`block.overrides[]`
   con fromWeek/toWeek, «Hasta cuándo» en el alta). Su Draft/Publish es un
   binario; lo nuestro es una política. Falta hacerlo VISIBLE (el registro del
   bloque — la pieza pendiente del acuerdo del 4 sep).

El rediseño estructural que sale de ahí es **el banco del bloque** (§3-bis).

---

## 1. La lista de clientes (`clients`, `features clients`, `client plan`)

**Lo que se ve:**

- **Pestañas de estado con contador**: Active 2 · Pending 0 · Paused 0 ·
  Ended 2. Cuatro estados de verdad, no dos.
- **Fila de filtros de atención, cada uno con su cifra**: All 2 · Failed
  payments 0 · Unread messages 2 · No messages 0 · New check-ins 1 · Blocked
  automations 0 · Missing check-ins 2 · Ending soon 0 · Tasks overdue 1.
  La cifra está ANTES de pulsar: la lista entera se lee de un vistazo sin
  abrir nada. Es su «¿a quién tengo que escribir hoy?» contestado en la
  cabecera.
- **Columnas**: nombre, estado en píldora, tags (etiquetas libres, «Wieght
  Loss» en rosa), último mensaje con fecha, planes activos como iconos
  (cuchillo/actividad), duración («26 Jan – ∞»), menú de fila.
- **Hover sobre los iconos de plan** → popover con los planes vivos: «Meal ·
  Jan 26 · John mealplan (2.500 calories)» y «Workout · Strength Training».
  El dato viene a ti sin entrar en la ficha.
- **Selección múltiple** → barra de acciones en bloque: Retry Charging ·
  Broadcast · Assign Automation · Assign Coach.
- **Broadcast**: un mensaje a los seleccionados con chips de variables
  (Client First Name, Client Full Name, Coach Full Name), adjuntos, y aviso
  de que llega como push. Cada cliente lo recibe como chat 1:1.

**Lo nuestro** (`src/domain/portfolio.js`): la cartera ya invierte el
planteamiento igual que ellos —«detecta los problemas y los ordena», alertas
accionables con umbrales laxos (7 d sin entrenar, 10 d sin peso, 45 d sin
fotos)— y la barra de tinta del replanteamiento ya ordena por urgencia. Pero:

- **Estados**: solo activo/archivado (`isArchived`). No hay «pausado»
  (vacaciones, lesión) ni «pendiente de empezar»: hoy un cliente de agosto
  que vuelve en octubre o genera alertas o se archiva, y ninguna de las dos
  es verdad.
- **Sin tags** (verificado: cero menciones en `portfolio.js`). Con 30+
  clientes, «los de pérdida de grasa» o «los presenciales» no se pueden
  filtrar de ninguna manera.
- **Sin acciones en bloque ni mensaje a varios**: no hay chat, así que no hay
  broadcast. El aviso a toda la cartera («me voy de vacaciones del 12 al 19»)
  hoy son N conversaciones de WhatsApp.
- Los contadores de cola existen en Inicio (`colasDeInicio`), pero la vista
  de tabla `/clientes` no los enseña como filtros pulsables.

## 2. La revisión del check-in (`client development section` ×2)

**Lo que se ve:**

- Navegación **Previous / Next entre check-ins** — el historial se hojea sin
  salir; banda «Latest check-in» con **Mark as read** (el estado de la cola
  se limpia a mano, no al abrir).
- Tarjetas de rating con delta: Average 2.82/5 (+3 %) en rojo, Mood · Energy ·
  Nutrition · Progress · Sleep en 5/5 con su Δ%. Cada métrica de la semana con
  su tendencia respecto a la anterior.
- Respuestas del cuestionario en texto plano, tal cual las escribió.
- **Aguja de peso**: −8 kg total, con inicial 80 → actual 72 → objetivo 70 en
  una sola figura. Al lado, la meta del cliente escrita («Build Habits»).
- Fotos de progreso Back/Front/Side con toggle **Overview/Comparison**.
- Gráficas: media de rating en el tiempo, pasos, y un selector «Metrics» con
  dropdown de métrica + rango de fechas.

**Lo nuestro — corrección de la 2ª edición**: la primera edición proponía
«hojear entre revisiones» y eso YA EXISTE y mejor: la espina
(`TimelineSpine.jsx`) es a la vez selector de semana, contexto histórico y
mapa; y `Anteriores.jsx` pone las últimas seis al lado con tu última
respuesta entera. Contra esta captura, a la Revisión le falta exactamente UNA
cosa: en la pantalla de decidir no está escrito **hacia dónde va esta
persona**. 72,4 kg viniendo de 80… ¿camino de qué? El objetivo vive en la
ficha (`goals.js`, verificado: `BodyCard.jsx` no lo enseña), a dos clics de
donde se decide. El movimiento es una pieza, no un rediseño: **la aguja
(empezó → hoy → objetivo) y la frase de la meta, en la cabecera** (A6).
«Sin reproches» sigue: informa del destino, no juzga el paso.

## 3. El creador de programas (`client training program creator` 1–5)

**Lo que se ve:**

- **Panel-biblioteca fijo a la izquierda** con dos pestañas — Exercises y
  **Sections** — buscador, filtro y drag. El ejercicio se añade con «+» o
  arrastrando. Las «sections» son plantillas de grano fino: tu mejor día de
  pierna, guardado y arrastrable.
- Sesiones como **chips horizontales** (Push · Pull · Day 3 · Day 4 · Day5 · +)
  con engranaje por sesión; el chip activo en verde.
- Cada ejercicio es una fila con inputs inline: Sets · Weight · Min Reps ·
  Max Reps · Rest (sec). Desplegada, enseña **serie a serie** (1/2/3, cada una
  con kg y rango) y la fila de **alternativas**: «+1 alternatives», chips con
  los sustitutos y «+ Add alternative».
- **Menú por ejercicio**: Show Weight · Add Superset · Add Drop Set · Change
  set type (Weight & Reps / Rep Range & Weight / Time & Weight / Time &
  Distance / AMRAP & Weight) · Move to section · Delete.
- Ciclo de edición explícito: badge **Draft** → Publish; tras publicar,
  **Local changes** con Save / Discard Changes. Toast «Workout section saved».
- Estado vacío con dos salidas: Create Session / **Apply Template**.

**Lo nuestro** (`training.js`, `blocks.js`, `AddExerciseForm.jsx`,
`VistaBloque.jsx`): en lo conceptual vamos POR DELANTE — el plan vive en el
bloque con tramos («en el bloque / unas semanas / solo este microciclo», el
alcance se decide al añadir), los bloques cerrados quedan congelados y
comparables, y el registro por serie con RIR opcional existe
(`targetReps`/`targetRir` por serie). Lo que no existe:

- **Tipos de serie**: ni superset, ni drop set, ni tiempo, ni AMRAP como
  estructura (solo como texto en `targetReps` — «AMRAP» se admite al importar,
  `routineSheet.js:104`, pero la app no sabe qué significa).
- **Descanso por ejercicio**: no hay campo rest (el patrón «2 y 1» de
  `training.js` es descanso entre DÍAS, no entre series).
- **Alternativas predefinidas**: nada. El cliente que encuentra la máquina
  ocupada te escribe o improvisa. Es la pieza más alineada con nuestra
  filosofía («el criterio lo puso el entrenador antes», 05-lecciones §A5) y
  además ya tenemos DÓNDE decidirla: el álbum de maquinaria del gimnasio del
  cliente (`equipment.js`) sabe qué hay para cada músculo.
- **Plantillas de sección**: `CopyToClientPanel` copia entre clientes e
  `ImportDayDialog` trae días, pero no hay biblioteca de piezas propias
  («guarda este día como plantilla») ni panel lateral desde el que arrastrar.

## 3-bis. El banco del bloque (el rediseño estructural, 2ª edición)

El diagnóstico de fondo no son campos que faltan: es que **crear un bloque hoy
son TRES MOMENTOS en tres sitios** — `DefinirBloque` (ventana), la vista del
bloque (pantalla), `EscribirHoja` (otra ventana) — y el material que informa
el criterio está en otras pestañas o no existe: el álbum de su gimnasio
(`equipment.js`) en su pestaña, el historial por ejercicio
(`strengthByExercise`) en popups, las piezas propias en ninguna parte. La
lección estructural de Coachway es UNA MESA con el material al lado; la
nuestra tiene que ganarle en lo único que importa: su cajón es un almacén
genérico, **el nuestro es este cliente**.

**El banco**: una superficie con tres zonas.

- **El material** (cajón lateral, plegable): pestañas «Su gimnasio» (las fotos
  de sus máquinas, por grupo muscular — mientras programas pierna ves qué
  tiene para pierna), «Su historial» (últimos pesos y tendencia por
  ejercicio), «Tus piezas» (días guardados, arrastrables). No es catálogo:
  es contexto. El buscador con catálogo sigue inline en la hoja, como hoy.
- **La mesa** (centro): la rejilla de hojas de `VistaBloque` con la gramática
  nueva impresa con la tipografía de la hoja — superserie A1/A2, bajada,
  AMRAP, descanso —, no con chips de colores. Definir un bloque nuevo deja de
  ser ventana: es el primer gesto del banco (nace siendo el anterior, con su
  diff, como ya hace `DefinirBloque`).
- **El margen** (derecha): con qué se juzga — el volumen contra MRV que ya
  vive ahí, y **el registro del bloque**: cada cambio con su tramo («desde
  M12», «M16–M18», «solo M17») y sus dos salidas (volver al bloque /
  ascender). Es la pieza pendiente (e) del acuerdo del 4 sep, y sustituye
  con ventaja al Draft/Publish de Coachway.

Lo que NO cambia: la línea de bloques (5 versiones ya juzgadas), la
estructura del microciclo, la herencia con diff, «el móvil ejecuta» (el banco
es de escritorio; el portal solo gana el timer de descanso y el toque de
alternativa).

## 4. La biblioteca de ejercicios (`exercise library` ×3)

**Lo que se ve:**

- **1.772 ejercicios**, tabla con: miniatura, nombre, iconos de contenido
  (vídeo ✓ / imagen ✓), grupo muscular, equipamiento (Barbell · Dumbbell ·
  Machine · Bodyweight · Cable · Other), badge **Personal / System**.
- Filtros por grupo muscular y equipamiento; orden; paginación (71 páginas).
- **Create/Edit Exercise** en cajón lateral, wizard de 2 pasos: nombre,
  descripción («describe the exercise and proper form», 2.048 caracteres),
  vídeo subido (MP4/MOV 50 MB) **o enlace de YouTube**, imagen (10 MB). El
  editor enseña el vídeo reproducible y la lámina anatómica con el músculo
  encendido en rojo.
- Lo personal y lo del sistema conviven en una sola lista con badge — mismo
  criterio que nuestro catálogo mezclado.

**Lo nuestro**: el ejercicio es `{name, muscle}` — un autocompletado
(`AddExerciseForm.jsx`) sobre biblioteca del coach + catálogo global de **101
ejercicios sembrados** (`0033_catalog.sql`), sin vídeo, sin imagen, sin
descripción, sin equipamiento. La decisión de no tener pantalla de catálogo
(`catalog.js`: «el momento en que necesitas "Lentejas" es mientras montas la
dieta») es buena y se conserva; lo que falta no es la pantalla, es **la ficha
del ejercicio**: qué es, cómo se hace, qué necesita. Nota: el vídeo de
demostración es la feature con mejor encaje en «el móvil ejecuta» — quien está
delante de la máquina con el móvil es exactamente quien necesita verlo. No
choca con la orden sobre «la carne» (miniaturas en la hoja del coach); es otra
pantalla y otro usuario. Queda como decisión del dueño (§9).

## 5. Los ingredientes (`ingredient library`)

**Lo que se ve:**

- **1.819 ingredientes**; búsqueda «by name, SKU…»; filtros Category · Tags ·
  **Country** (United Kingdom activo) · Type; columnas: kcal/100 g, chips de
  macros (P/C/F con icono y gramos), categoría (Fruits and Vegetables, Pantry
  and Groceries, Local Shop Items…), país (Global), badge System.
- Productos de marca conviviendo con genéricos («100% Hype Whey, Vanilla, NP
  Nutrition», «Al forno pasta sauce (Dolmio)») — el catálogo baja hasta el
  supermercado, con el país para que un danés no vea marcas británicas.

**Lo nuestro**: biblioteca de equipo + catálogo de **179 alimentos** (0033)
con macros/100 g y unidad natural; `foodMatch.js` ata nombres importados con
tres respuestas honestas (seguro/dudoso/desconocido); `foodEquiv.js` hace
equivalencias. La mecánica es mejor que la suya (su búsqueda no aprende de tus
dietas); el catálogo es 10× más corto y sin marcas. Crecerlo es **dato, no
código**: la tabla, sus categorías y su regla de solo-lectura ya existen; una
migración con 800–1.500 alimentos de tablas de composición españolas (BEDCA)
+ marcas comunes de supermercado español sería la versión nuestra del
«Country: Spain» que ellos presumen — y en español, que su app del cliente
no habla.

## 6. El plan de comidas (`client meal plan` ×2)

**Lo que se ve:**

- Plan por comidas con objetivo kcal por comida y barras de macros con delta
  («−46 g / 53 g (−7 g)»); tarjetas de receta CON FOTO, etiquetas dietéticas
  (Vegetarian · Pescetarian · +7) y kcal/macros por ración.
- **Create Template**: título, imagen, calorías objetivo con «Recommended:
  2.166 kcal/day — Apply» (sale del TDEE calculado en la ficha), split de
  macros (presets o custom), comidas con toggle y **reparto porcentual
  arrastrable** (Breakfast 28 % · 700 kcal | Lunch 35 % | Dinner 37 %),
  comidas custom, preferencias dietéticas (include) y alérgenos (exclude)
  como chips — y el generador rellena con recetas que aterrizan en el
  objetivo.

**Lo nuestro** (`nutrition.js`, `dietSheet.js`, `MealCard.jsx`,
`foodEquiv.js`): dieta por comidas con objetivos y re-escalado
(`ReescalarMenu`), importación de hojas reales, equivalencias. **El generador
NO se copia**: «la app no receta» (decisión firme, 05-lecciones §C). Pero tres
piezas del cajón son criterio del coach, no receta de la app: el «recommended
kcal — Apply» (nosotros ya calculamos TDEE en la radiografía; acercarlo al
formulario de objetivo es un atajo, no una prescripción), el **reparto
porcentual visual** entre comidas (hoy los objetivos por comida se escriben a
mano), y las **etiquetas de alérgenos/preferencias en el alimento** para que
el buscador avise («contiene gluten» junto a un cliente celíaco es
información, y la ley de la casa es exactamente esa: resaltar, nunca
proponer).

## 7. Los formularios (`forms`, `client onboarding form`)

**Lo que se ve:**

- **Forms como sección de primer nivel** con lista: título, tipo (Onboarding /
  Check-in), **idioma con bandera**; se pueden tener varios del mismo tipo
  (uno por tipo de cliente, uno por idioma).
- Builder de dos paneles: paleta a la izquierda con **Smart Fields** — Goal
  weight, Body measurements (elige métricas: Weight kg…), Circumference
  measurements (Arm/Chest/Forearm/Hip/Thigh/Waist, «Add Metric»),
  Progression photos (1–5), Food preferences, **Eating disorder screening
  («using validated questions»)**, Activity level («will be used to calculate
  the daily caloric needs»), Ingredient exclusion — y Standard Fields
  (single choice, texto…) debajo. Canvas con drag, borrado por fila,
  Settings y Update.
- El smart field no es una pregunta: es un ENCHUFE — lo que se contesta cae
  en la ficha, alimenta el TDEE, filtra el generador. Exactamente nuestro
  criterio de `intakeForm.js` («lo que faltaba no era qué preguntar, era
  QUIÉN CONTESTA»), con más enchufes.

**Lo nuestro** (`intakeForm.js`, `protocol.js`, `intake.js`): el cuestionario
de alta elige entre los campos de la ficha (19) + hasta 8 preguntas propias;
el check-in se configura por cliente en el protocolo y cada respuesta numérica
es una serie. La arquitectura es LA MISMA IDEA y está mejor fundada (sin
catálogo paralelo de preguntas). Los huecos: **un solo formulario de alta por
entrenador** (quien lleva pérdida de grasa y powerlifters pregunta lo mismo a
los dos), las **medidas/fotos como smart fields del alta** (hoy la
antropometría inicial la mete el coach a mano), y el **cribado de TCA con
preguntas validadas** — pieza pequeña, sensibilidad enorme, y encaja con
nuestro RGPD serio (`privacy.js`).

## 8. Los ajustes por cliente (`client settings`)

**Lo que se ve:**

- Panel por cliente: **Hide nutritional information · Hide weight
  information · Hide chat** (toggles), Allow video/audio messages con
  duración máxima, **No contact alert** («Alert after N days», «Activity that
  resets timer: Any activity», vacío = apagado), y «Change check-in form &
  schedule».
- Detrás, la ficha Overview: BMR/TDEE/kcal recomendadas, **ED Assessment: No
  Risk**, chips de preferencias/alergias («Low Carbs», «Contains Gluten» en
  rojo), plan de comida y último entreno actuales, tendencia de check-ins.

**Lo nuestro**: el protocolo por cliente (`protocol.js`) ES esto para
módulos de entreno — la idea de «el entrenador decide qué existe en su app»
la tenemos desde antes. Faltan dos familias: la **visibilidad de números**
(ocultar peso/kcal a quien tiene mala relación con la comida — barato, enorme
en oficio, ya señalado en 05-lecciones §A6; hoy `preferences.js` no lo
contempla) y los **umbrales de alerta por cliente** (los de `portfolio.js`
son globales: 7/10/45 días; para el cliente de 2 sesiones/semana o el que
está de vacaciones, poder decir «avísame a los 14» o «este mes no avises» es
la diferencia entre una cola útil y una que grita).

---

## 9. El plan de crecimiento, por tandas (2ª edición: 18 movimientos)

**Estado (7 sep 2026): tanda A EJECUTADA salvo A4** — A1 pausa (migración
0093, `pauseOf` silencia alertas vigente y avisa al vencer, `PauseRow` en
«Acceso y baja»; el pausado SIGUE contando para el tope del plan, decisión
deliberada contra el abuso de asientos — ver la migración), A2 etiquetas
(columna `tags`, editor en «Quién es», filtro con cuenta en Clientes), A3
umbral por cliente (`alertDays` en el protocolo con la general de respaldo,
sección «Cuándo avisarte» solo por cliente, fuera de la plantilla vía
`NOT_COMPARED_KEYS`), A5 filtros con contador (los `PORTFOLIO_FILTERS` que ya
existían, ahora chips con cifra en /clientes), A6 el destino
(`goal.targetWeightKg` opcional saneado, la aguja empezó→hoy→objetivo y la
nota de la meta en el hero de la Revisión, editor en línea en «Cómo va»).
**A4 (ocultar peso/kcal) queda pendiente a propósito**: exige pasar por cada
pantalla del portal con la demo delante — a medias sería una privacidad que
gotea. Validado: lint, types, verify, 1.704 pruebas y build en verde.

**Estado (7 sep 2026, 3ª sesión): A4 HECHA, y con ella se cierra la tanda A.**
`protocol.hidden = { weight, nutrition }` (sin migración: vive en
`preferences.protocol`), en `NOT_COMPARED_KEYS` como los servicios y la vara —
«poner al día» devolviéndole el peso a esa persona sería el peor botón posible.
La regla no viaja por propiedades sino por un CONTEXTO montado en el portal
(`components/Client/Oculto.jsx`): fuera de él el valor por defecto es «no se
oculta nada», así que ningún componente compartido puede llevarse el silencio a
la pantalla del entrenador, y la pantalla que se añada mañana no nace enseñando
lo que no debe. Lo que se retira, pantalla a pantalla y con la demo delante:
«Cómo vas» y «Tu cuerpo» enteras del panel (con sus ventanas), la cifra de peso
de «Desde que empezaste», el ritmo del objetivo y la palanca de calorías de «Tu
plan», la escalera de kcal bajo la curva y la columna de kcal del «a fondo», las
cuatro cifras y el historial del check-in —la casilla del día dice «anotado» y
queda el recuento—, el paso del peso del asistente (la semana se cierra con el
promedio que la aplicación ya sabe, sin enseñarlo), el pie de cada foto y la
variación entre las dos, el peso de cada línea del histórico de revisiones, las
filas de kcal del diff del plan, y en la dieta el objetivo, el resumen del día,
su ventana, el anillo de cada comida y las cuatro columnas de cada alimento —el
menú se queda entero: qué come y cuánto—. Lo que NO se toca: el cliente sigue
anotando sus pesajes (el gesto es suyo), sus datos siguen siendo suyos y se los
descarga en «Mis datos y privacidad», y el entrenador lo ve todo. Los dos
interruptores están en el protocolo DE ESA PERSONA: en Ajustes → Protocolo con
cliente elegido y en el diálogo «El protocolo de X» de la cartera
(`VisibilitySection`). De la tanda D se cierra además el resto de D14: el alta
elige formulario cuando hay más de uno (`NewClientForm` → `addClient({
intakeFormId })`, que ya estaba esperando). Validado: lint, types, verify, 1.773
pruebas y build en verde, más capturas del portal en escritorio y móvil con dos
clientes de la demo (todo oculto / solo las kcal) y de la pantalla del
entrenador, que no cambia.

**Estado (7 sep 2026, 2ª sesión): tandas B y D ejecutadas, C sembrada.**

- **Tanda B entera** (orden B10 → B6 → B7 → B8/B9): el registro del bloque como
  tarjeta del margen con tramo y sus dos salidas (`TarjetaRegistro`); el banco
  —cajón de material con «Su gimnasio / Su historial / Tus piezas»
  (`CajonDeMaterial`), y definir (`DefinirBloque`) y escribir (`EscribirHoja`)
  dejan de ser ventanas y pasan a la mesa—; la gramática de serie como dato
  (`enlazado`/`bajada`/`restSeconds` + `targetKind` que por fin entiende el
  AMRAP que el importador ya admitía), impresa con la tipografía de la hoja en
  rejilla, hoja y portal, y el timer del portal usa el descanso pautado; las
  alternativas previstas (`exercise.alternatives`, se escriben en la mesa y se
  imprimen donde se ejecuta); y tus piezas (`domain/pieces`, en
  `preferences.piezas`). *Pendiente de B8: el canje con un toque en el móvil —
  exige decidir cómo se registra lo hecho sin mentirle al 1RM.*
- **Tanda D salvo lo que es cartera**: D14 varios formularios de alta
  (`coachIntakeForms`, editor con pestañas en el protocolo, el alta copia la
  elegida vía `addClient({ intakeFormId })` — *el selector del diálogo de
  invitar queda para la sesión de cartera*); D15 medidas «día 0»
  (`IntakeMeasures` → antropometría, con su interruptor `askMeasures`); D16
  cribado SCOFF (`domain/scoff`, apagado de serie, resultado solo en la ficha
  del coach). *D17 (aviso a varios) es superficie de /clientes: cartera.*
- **Tanda C**: esquema 0094 (equipamiento y descripción del ejercicio,
  etiquetas del alimento) + siembras 0095 (~130 ejercicios CON ficha, y fichas
  para los clásicos) y 0096 (~120 alimentos españoles con marcas y etiquetas).
  Calidad antes que la cifra ×8/×10: cada fila es prescribible y el catálogo
  crece por tandas aditivas — quedan tandas de dato por sembrar. C12 en código:
  `foodConflicts` y el aviso pasivo en el buscador de la dieta.

Validado: lint, types, verify, 1.751 pruebas y build en verde. Las migraciones
0094–0096 están escritas y sin aplicar a ninguna base.

Cada movimiento cuelga de una de las dos leyes. Las leyes de la casa siguen
mandando: la app no receta · el móvil ejecuta, el PC planifica · el plan vive
en el bloque · sin reproches · la Revisión no se rediseña.

**Tanda A — Gestión a escala** (código puro, sin contenido nuevo):

- A1. Estados de cliente: + `paused` (con fecha de vuelta; silencia alertas y
  no cuenta sesiones) y + `pending` (alta hecha, aún no empieza). Toca
  `portfolio.js`, `billing`, el disparador del límite de plan.
- A2. Tags de cliente + filtro en cartera y en la barra de tinta.
- A3. Umbral de alerta por cliente (ley 2; los globales de `THRESHOLDS`
  pasan a ser el defecto).
- A4. Visibilidad por cliente: ocultar peso/kcal en su portal. Dos toggles en
  el protocolo, que ya es el sitio de «qué existe en su app».
- A5. Filtros con contador en `/clientes` (el dato ya está en
  `buildPortfolio`; es enseñar la cifra antes del clic).
- A6. El destino en la Revisión: la aguja (empezó → hoy → objetivo) y la meta
  escrita del cliente, en la cabecera. Nada más de esa pantalla.

**Tanda B — El banco del bloque** (el rediseño; ver §3-bis). Orden interno:
B10 → B6 → B7 → B8/B9 — el registro primero, porque hace visible el modelo
que ya existe y guía el resto:

- B6. La mesa única: definir, ver y escribir en una superficie; los tres
  momentos de hoy, un banco. El cajón de material es EL CLIENTE (su gimnasio,
  su historial, tus piezas), no un almacén.
- B7. La gramática de serie: superserie, bajada, por tiempo, AMRAP y descanso
  como estructura de datos, impresa con la tipografía de la hoja. El
  importador ya reconoce los nombres.
- B8. Alternativas predefinidas desde su gimnasio: el coach deja 1–3
  sustitutos; el móvil los ofrece con un toque; `equipment.js` avisa si su
  gimnasio no tiene esa máquina.
- B9. Tus piezas («guardar este día»; biblioteca propia; arrastrar al banco).
  Media pieza ya existe en `cloneExerciseAsTemplate`.
- B10. El registro del bloque: cada cambio con su tramo y sus dos salidas
  (volver al bloque / ascender). La pieza pendiente (e) del 4 sep.

**Tanda C — El contenido** (dato, no código; lo más caro y lo más visible):

- C11. Catálogo de alimentos ×8: BEDCA + marcas de supermercado español, con
  categoría y unidad natural. Migración sobre `catalog_foods` tal cual.
- C12. Etiquetas de alérgenos/dieta en alimentos + aviso pasivo en el buscador
  contra las restricciones del cliente (información, nunca filtro impuesto —
  la misma gramática que el aviso del multipower en el banco).
- C13. Catálogo de ejercicios ×10 con equipamiento (el enchufe de B8) y
  descripción; y — **decisión del dueño** — vídeo de demostración en el
  portal. No es «la carne» descartada: es la ejecución en el móvil.

**Tanda D — El alta y el cierre del bucle**:

- D14. Varios formularios de alta (por tipo de cliente), eligiendo plantilla
  al invitar. `intakeForm.js` pasa de objeto único a lista con id.
- D15. Medidas y fotos «día 0» del propio cliente → caen en
  `anthropometry`/`photos` como primera medición.
- D16. Cribado TCA opcional (SCOFF, 5 preguntas validadas), resultado solo
  para el coach.
- D17. Aviso a varios: texto a N clientes seleccionados, entregado como aviso
  individual en el portal (`updates.js`). Sin chat de por medio; el hilo del
  cliente sigue siendo el estudio aparte.

Lo que las capturas enseñan y se DESCARTA, con su porqué: el generador de
planes (la app no receta), **Draft/Publish** (nuestro tramo es una política,
no un binario — copiarlo sería un retroceso; B10 lo deja atrás), las
automatizaciones de secuencias (plantilla-y-masa, no artesanía), el CRM de
leads con UTM (fase de negocio muy posterior), y su estética (la nuestra es
mejor y es nuestra).
