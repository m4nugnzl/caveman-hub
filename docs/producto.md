# Replanteamiento del producto

> **Estado: FASES 1 a 4 CONSTRUIDAS.** La 5 sigue siendo propuesta y está sin
> hacer a propósito (ver §7 y §8).
>
> Fecha: agosto de 2026.
>
> Sale de una observación del autor —«la portada y la aplicación parecen dos
> productos distintos, y la portada está por encima»— y de comprobar que tenía
> razón por un motivo distinto del que parecía. No es un rediseño visual: el
> lenguaje visual está bien y no se toca (§4.4). Lo que se replantea es **cómo
> está partida la aplicación en pantallas**.
>
> **Qué decide este documento:** la tesis (§1–§3), la estructura propuesta (§4),
> la gramática de composición (§5) y el orden de trabajo (§7).
>
> **Qué NO decide:** las cinco preguntas de §8, que son suyas y hay que
> contestarlas antes de tocar `routes.jsx`.

---

## 0. Lo primero: lo que NO hay que tocar

Esto es un producto en producción, con dinero real cobrado desde el 13 de agosto
de 2026 y con datos del artículo 9 dentro. Antes de proponer nada, la lista de lo
que este replanteamiento **no** puede rozar:

- **`domain/`**. Son funciones puras, probadas, sin React. Todo lo que sigue
  cambia dónde se pintan las cosas, no cómo se calculan. Si una propuesta obliga
  a tocar una regla de negocio, la propuesta está mal.
- **RLS como única frontera de autorización.** Ninguna pantalla nueva puede
  necesitar que JavaScript decida quién ve qué.
- **`lib/saveQueue.js` y el control de concurrencia.** Resuelven tres fallos
  reales y bien (`auditoria.md` 1.3, 4).
- **Los tokens y el lenguaje visual** (`src/styles/tokens.css`). Ver §4.4.
- **Las rutas retiradas siguen redirigiendo.** Están en marcadores y en enlaces
  pegados en WhatsApp. Cada fusión que se haga aquí añade una redirección más, no
  quita ninguna.

---

## 1. La portada ya dijo qué es el producto

La página pública no es marketing pegado por encima: es la única pieza del
proyecto que tuvo que decidir **qué es esto** en una frase, y lo decidió bien.

Lo que dice, literal:

| Dónde | Qué dice |
|---|---|
| Héroe | «Todos tus clientes, *en un solo sitio*» |
| Sección 1 | «Tú lo montas aquí, él lo ve *en su móvil*» — le montas la semana **y él la registra**; le cuadras la dieta **y él elige** |
| Sección 2 | **«La semana se cierra»** — el roadmap → el check-in → el resumen |
| Su propia explicación | «Marcas el objetivo, mides lo que sale y decides la semana siguiente» |

Eso es una tesis de producto completa, y es buena. **Caveman Hub no es un sitio
donde guardar rutinas: es un bucle semanal entre dos personas.** El entrenador
marca, el cliente ejecuta y entrega, el entrenador lee y decide la semana
siguiente. Todo lo demás del producto —las fotos, la analítica, el calendario,
las integraciones— cuelga de ese bucle o no significa nada.

La portada además lo *compone* así: cinco secciones, una gramática (`lp-sec`),
un ritmo, y la sección del bucle tiene el raíl que dibuja el orden. Se lee como
una pieza porque **cuenta una cosa sola**.

---

## 2. La aplicación es un archivador

Y ahí está la fractura. La aplicación no está partida por el bucle: está partida
por los **módulos de datos**.

Las secciones de un cliente son, hoy:

```
Progreso · Rutina · Nutrición · Revisión · Calendario · Ficha
```

Que es, casi exactamente, la lista de tablas: `workout_data`, `nutrition_plans`,
`anthropometry` + `progress_photos`, `calendar`, `clients`. Cada una es un cajón
bien hecho, con su propio selector de semana, su propia cabecera y su propio
vocabulario. Ninguna sabe en qué semana está la otra.

**El síntoma más claro ya está documentado en el propio proyecto.** El README
explica que «Fotos» y «Check-ins» eran dos secciones y son una sola tarea, y da
la prueba de que el corte estaba mal:

> «hubo que inventar un *modo* (`ReviewSession`, con barra flotante) para poder
> terminar la tarea cruzando de una sección a otra».

Ese argumento es correcto y está aplicado un nivel demasiado abajo. **Cerrar la
semana de un cliente es exactamente la misma situación, una planta más arriba:**
mirar lo que le programaste (Rutina), ver lo que ha hecho y ha entregado
(Revisión), comprobar si la dieta le cuadró (Nutrición) y decidir la siguiente
(Progreso). Cuatro secciones, cuatro selectores de semana, ninguna barra que
sostenga la tarea. La única tarea que la portada llama «el producto» es la única
que la aplicación no tiene modelada.

### Lo que se puede contar sin opinar

| Hecho | Medida |
|---|---|
| Formas distintas de escribir un título de sección | **5** (`<h2>`, `<h2 class="section-title">`, `<span class="section-title">`, `<h2 style={{fontSize}}>`, `<h3>`) en 105 encabezados |
| Pantallas que usan `PageHead`, la primitiva escrita para eso | **3** de unas 20 — y su comentario explica este problema exacto |
| `<Panel>` frente a `className="card"` escrito a mano | 54 archivos / **37 veces** a mano |
| Selectores de semana distintos, sin código compartido | **5** (`WeekPicker`, `MicrocycleBar`, `WeekAnglePicker`, `.checkin-week`, el de analítica) |
| Familias de clases CSS a medida de una pantalla | ~**50** (`warmup-`, `set-`, `studio-`, `folio-`, `macro-`, `rmap-`, `wiz-`, `scale-`, `meal-`…) |
| Líneas de `index.css` para la portada / para la aplicación | **1.820** para 5 secciones / ~4.500 para ~40 pantallas |

> **Este inventario está caducado, y hay que decirlo aquí y no en otro sitio**
> (26 de agosto de 2026). Se midió contra el código y quedan tres filas vivas de
> las seis: los encabezados, `Panel`, la regla del `card` a mano (nueve casos) y
> las familias de CSS. Las otras **están cerradas**: hay 30 pantallas con
> `PageHead`, y sobre todo **ya no hay cinco selectores de semana** — `WeekPicker`
> es la primitiva única y la usan el editor de rutina, el estudio de fotos y el
> portal; `.checkin-week` nunca fue un selector, es la rejilla de siete días
> donde se meten los pesajes, y el «periodo» de Analítica es un rango, no una
> semana. Quien planifique trabajo a partir de esta tabla, que la vuelva a medir
> antes: se ha recomendado dos veces un frente que ya estaba hecho.

La última fila es el resumen de todo: la portada recibió cuatro veces más diseño
por pantalla. No porque sea más importante, sino porque **se diseñó entera de una
vez y la aplicación se diseñó función a función**, que es justo lo que dice la
observación que abre este documento.

---

## 3. La prueba de que esto importa: el bucle no se cierra

Hasta aquí es estética y orden. Esto ya no.

De `informes/estado.json`, generado el 16 de agosto de 2026 contra la base de
datos real:

```
embudo · se registró                    4
embudo · dio de alta un cliente         3
embudo · le programó algo               3
embudo · le dio acceso al portal        1   ←
embudo · revisó un check-in             1

clientes · total                       15
clientes · con portal (%)            13,3   ←  2 de 15
programas · clientes con programa (%) 46,7
revisión · entregados sin contestar +7d  0
```

**El bucle que la portada vende se cierra en el 13 % de los clientes.** Tres
entrenadores programan; uno solo ha llegado a que su cliente entre. La mitad
«cliente» de la aplicación —la que la portada enseña en un iPhone, la que
justifica la frase «y él la registra»— casi no existe en producción.

### Y ahora la parte honesta: hay dos causas, y la barata no es esta

No voy a vender un replanteamiento de la navegación como la cura de este número,
porque hay una explicación más simple y ya está escrita en `monetizacion.md` 4.3:

> «No hay correo transaccional. La invitación se copia a mano y se pega en
> WhatsApp. Funciona con cinco clientes y no con cuarenta.»

Invitar a un cliente hoy es: entrar en su ficha, generar el enlace, copiarlo,
abrir WhatsApp, buscar a la persona, pegarlo y explicarle qué es. Con esa
fricción, un 13 % es un número perfectamente explicable **sin ninguna teoría de
diseño**.

Así que el orden correcto es:

1. **Correo transaccional** (`monetizacion.md` 4.3). Es más barato que todo lo de
   este documento junto y ataca la causa más probable del número. Va primero.
2. **Y aun así el replanteamiento sigue en pie**, por un motivo que el embudo
   también enseña: de los tres que programaron, **uno** revisó un check-in. Los
   otros dos montaron el plan y ahí se quedaron. Programar es lo que un
   entrenador ya sabe hacer en cualquier herramienta; **revisar y contestar es lo
   único que esto hace mejor que una hoja de cálculo**, y es lo que la aplicación
   no pone delante de nadie. Está repartido en cuatro cajones.

El dato que lo remata es el último: **«entregados sin contestar +7d: 0»**. Cuando
un check-in llega, se contesta. El problema no es que el entrenador ignore el
bucle: es que la aplicación no le lleva hasta él.

---

## 4. El replanteamiento: la semana es la unidad, no la sección

Una sola idea, y de ella sale todo lo demás:

> **Las secciones de un cliente dejan de ser sus módulos de datos y pasan a ser
> sus horizontes de tiempo.**

Hoy la pregunta que ordena el menú es «¿qué tipo de dato quiero tocar?». Pasa a
ser «¿de cuándo estamos hablando?», que es la que un entrenador se hace de
verdad: *esta semana* / *este bloque* / *estos meses* / *siempre*.

### 4.1 El entrenador: de seis secciones a cuatro

| Nueva sección | Horizonte | Qué es hoy | Qué contesta |
|---|---|---|---|
| **Su semana** | Esta semana | Revisión + la semana activa de Rutina + el cuadre de Nutrición | «¿Qué le puse, qué ha hecho, qué me ha entregado y qué le contesto?» |
| **Su plan** | Este bloque | Rutina completa + Nutrición + roadmap + protocolo | «¿Qué le tengo montado, y qué le cambio?» |
| **Su progreso** | Meses | Progreso + Analítica + fotos + medidas | «¿Esto está funcionando?» |
| **Su ficha** | Siempre | Ficha + calendario + acceso al portal + datos personales | «¿Quién es, desde cuándo, qué me paga, qué guardo de él?» |

Lo que gana cada una:

- **«Su semana» es la sección que hoy no existe**, y es la que la portada vende.
  Una semana concreta, con las cuatro cosas juntas: lo programado, lo ejecutado,
  lo entregado (peso, fotos, sensaciones) y el sitio donde se contesta. `Review­
  Session` —el modo con barra flotante— **desaparece**, porque deja de haber dos
  sitios que cruzar: la tarea entera cabe en una pantalla. Un modo que existe
  para pegar dos pantallas es la prueba de que faltaba una.
- **«Su plan» es donde vive el trabajo lento**, y separarlo de la semana quita de
  en medio el editor de microciclos cuando lo que estás haciendo es revisar. Hoy
  Rutina es las dos cosas a la vez y por eso pesa tanto.
- **«Su progreso» absorbe las fotos**, que hoy están en Revisión por ser un
  archivo que se sube y deberían estar donde se *leen*: al lado de la curva de
  peso. Subirlas sigue siendo del cliente; compararlas es un gesto de meses, no
  de semana.
- **«Su ficha» absorbe el calendario**, que es la sección con menos uso y menos
  relación con las demás.

**Nivel 1 no cambia:** «Hoy» y «Clientes» se quedan como están. Son buenas y su
razonamiento (README) es correcto: una cuenta lo que *ha pasado*, la otra lo que
*falta*. Lo único que cambia es que «Hoy», al pulsar sobre un check-in entregado,
ya no aterriza en un cajón: aterriza en **la semana de esa persona**.

### 4.2 El cliente: de cinco entradas a tres

El portal es lo que ve quien paga y es lo que la portada enseña en un iPhone.
Hoy tiene cinco entradas que son un espejo de las del entrenador.

| Nueva sección | Qué es hoy |
|---|---|
| **Mi semana** | Mi rutina (la sesión de hoy) + Mi dieta + Mi evolución (check-in y fotos) |
| **Mi progreso** | Mi progreso + Mi analítica |
| **Mi plan** | La rutina completa y la dieta completa, para consultar |

El argumento es más fuerte aquí que en el panel: **un cliente abre esto en el
gimnasio, con una mano y con datos.** `routes.jsx` ya lo sabe —ordena sus
secciones por uso y no por simetría—, pero se quedó a medias: siguen siendo
cinco destinos para lo que es un solo gesto («¿qué me toca hoy y qué tengo que
entregar?»).

> ⚠️ **Esto entra en conflicto con una decisión documentada** y hay que decidirlo
> a conciencia: el comentario de `CLIENT_SECTIONS` defiende el orden actual y la
> barra inferior de cuatro destinos. La propuesta no lo contradice en el fondo
> —el criterio sigue siendo el uso— pero sí cambia el resultado. Es la pregunta
> 2 de §8.

### 4.3 Qué desaparece, qué se fusiona y qué pasa con las URLs

Nada se borra. Todo se mueve, y toda ruta vieja redirige:

| Ruta de hoy | Destino |
|---|---|
| `/c/:id/resumen`, `/c/:id/analitica` | `/c/:id/progreso` (dos niveles, como ahora) |
| `/c/:id/revision`, `/c/:id/revision/fotos` | `/c/:id/semana` · las fotos, a `/c/:id/progreso/fotos` |
| `/c/:id/rutina` | `/c/:id/plan` (y la semana activa, dentro de `/semana`) |
| `/c/:id/nutricion` | `/c/:id/plan/dieta` |
| `/c/:id/calendario`, `/c/:id/ficha` | `/c/:id/ficha` |
| `/mi/inicio`, `/mi/analitica` | `/mi/progreso` |
| `/mi/rutina`, `/mi/dieta`, `/mi/evolucion` | `/mi/semana` |

Esto **duplica la tabla de redirecciones**, que ya tiene cinco entradas vivas. Es
el coste real de la propuesta y hay que asumirlo con los ojos abiertos: cada
fusión añade deuda de compatibilidad para siempre, porque estos enlaces están
pegados en conversaciones de WhatsApp de gente que no va a volver a pedirlos.

### 4.4 Qué NO cambia, y es la mayor parte

Esto es un replanteamiento de estructura, no de estética. Se quedan **intactos**:

- **El lenguaje visual entero.** «Hierro y tiza», los discos, las dos tierras, la
  regla, la etiqueta troquelada, Archivo. Está bien pensado, está documentado y
  la portada demuestra que funciona. No se cambia ni un token.
- **`domain/`, RLS, la cola de guardado, el control de concurrencia.**
- **«Hoy» y «Clientes»**, con su razonamiento.
- **Ajustes** y sus siete secciones.
- **La paleta de comandos** — que, de hecho, mejora sola: sus dos niveles pasan de
  «cliente → 7 secciones» a «cliente → 4».

---

## 5. La gramática

Esta es la parte que arregla la sensación de «conjunto de cosas» aunque la
estructura de §4 se quede en el cajón. Son reglas, no sugerencias: cada una
existe porque hoy se incumple.

### 5.1 Una pantalla

**Toda pantalla se abre con `PageHead`. Sin excepciones.**

```
PageHead → título (h1) · subtítulo (una línea, opcional) · UNA acción primaria
```

- El `h1` es el nombre de la pantalla, no un saludo. «Hola, Javier» es cortesía y
  no es estructura: repetido en siete pantallas, para un lector de pantalla son
  siete pantallas con el mismo nombre.
- **Una** acción primaria. Si hay dos, una de las dos es secundaria; si hay tres,
  la pantalla hace dos cosas y hay que partirla.
- Nada de controles antes del `PageHead`. Hoy Rutina, Revisión, Calendario y
  Ficha entran directamente en barras de herramientas, y por eso cambiar de
  sección se siente como cambiar de aplicación.

### 5.1 bis · El nivel que faltaba: el grupo

Al montar la gramática apareció un caso que §5.1 y §5.2 no cubrían: pantallas que
no son una lista de bloques sino **dos tandas de bloques con asuntos distintos**.
La nutrición es el ejemplo: abría con «Plan nutricional» y a media pantalla ponía
«Menú estructurado» con exactamente el mismo peso —dos `h2` idénticos, o sea dos
pantallas pegadas para un lector de pantalla—.

La jerarquía definitiva son **cuatro niveles y ni uno más**:

| Pieza | Etiqueta | Qué nombra | Cuántas por pantalla |
|---|---|---|---|
| `PageHead` | `h1` | cómo se llama esta pantalla | exactamente 1 |
| `GroupHead` | `h2`, en troquelada | de qué va esta tanda de bloques | 0, 1 o 2 |
| `Panel title` | troquelada | qué es este bloque | las que hagan falta |
| `Panel rango="bloque"` | `h2` | …cuando el bloque es media pantalla | ídem |
| `SectionTitle` | `h3` | una pieza dentro de un bloque | ídem |

El grupo va en troquelada y no a tamaño de titular porque **no compite con la
pantalla: la ordena por dentro**.

> **Enmienda (26 de agosto de 2026).** La fila del `rango="bloque"` no estaba, y
> el tablero de la revisión enseñó por qué hacía falta. Sus bloques no son
> tarjetas: «Su cuerpo» son tres tramos —lo que cuenta el cliente, sus fotos y
> sus medidas— y cada tramo se nombra con la troquelada. Nombrar con esa MISMA
> troquelada el bloque que los contiene deja la pantalla sin un solo nivel de
> jerarquía: el continente y el contenido hablan igual de alto.
>
> Se resolvió durante un tiempo con una cabecera propia en tres archivos del
> tablero —`.bloque-head`, `.bloque-say`, `.bloque-titulo`, `.bloque-sub`—, que
> era `.panel-head` copiada con otros nombres, o sea el defecto de §2 otra vez.
> Ahora es un rango de `Panel` y lo puede pedir cualquier pantalla.

### 5.2 Un bloque

**Todo bloque es un `Panel` con cabecera.** Un `<h2>` suelto flotando sobre una
rejilla no es un bloque: es texto encima de otra cosa.

```
Panel
├── cabecera:  etiqueta troquelada  ·  [acción del bloque, si la tiene]
└── cuerpo
```

- El título de un bloque va en **etiqueta troquelada** (versalita, 700,
  `--tracking-stencil`), no en `<h2>`. Los tokens ya dicen que la troquelada es
  lo que estructura la pantalla ahora que el cromo no puede usar color; hay que
  usarla para eso en vez de para decorar cuatro sitios.
  **Con una excepción, la de §5.1 bis:** un bloque que ocupa media pantalla y
  que tiene tramos con su propia troquelada dentro pide `rango="bloque"`, y
  entonces su título es un `h2` de verdad. La regla que no cambia es que ese
  `h2` lo emite `Panel` — nunca se escribe suelto.
- Las acciones del bloque viven **en su cabecera**, alineadas a la derecha.
  Nunca sueltas entre el título y el contenido, que es donde están hoy en
  Nutrición («Copiar desde días de descanso» flotando al lado de unas pestañas).
- **Sin filete debajo.** Se probó con uno y convierte la pantalla en una rejilla
  de tabla: seis bloques son seis líneas horizontales más. Tampoco lleva la
  regla, que es lo primero que uno piensa: los tokens dicen que solo sale donde
  de verdad hay una escala, y repetirla en cada bloque la haría textura.
- Jerarquía completa, la de §5.1 bis. Si hace falta un quinto nivel, la pantalla
  está mal partida.

### 5.3 El dato, y quién puede tener color

La regla ya existe —«el cromo no tiene color, el color es del dato»— y se
incumple porque **cada pantalla elige el color de su métrica en línea**. En
Revisión, las cuatro cifras salen blanca, ámbar, blanca y azul, y ese reparto no
significa nada.

- **Una métrica tiene un color, y lo tiene siempre**, en toda la aplicación. El
  peso es el azul del disco de 20 en el resumen, en la analítica, en el check-in
  y en la tarjeta pequeña. Eso se declara **una vez**, en `domain/`, al lado del
  catálogo de widgets que ya existe (`domain/preferences.js`).
- **Una cifra sin serie no lleva color.** Va en tinta plena. Hoy se colorean
  cifras sueltas para «darles vida», y el efecto es el contrario: cuando todo
  tiene color, el color deja de avisar de nada.
- **Ninguna pantalla escribe `style={{ color: … }}`** salvo para el color de un
  dato que viene de `domain/`. Hoy hay una veintena de sitios que lo hacen a
  mano.

### 5.4 La fila de métricas

El propio `index.css` ya declara el orden canónico y dice por qué:

> «etiqueta, cifra grande, píldora de variación, gráfico ancho y bajo — porque
> esa repetición es lo que hace que veinte tarjetas distintas se lean como un
> solo producto».

No se cumple: en la ficha, de cuatro tarjetas seguidas una lleva línea, otra
nada, otra un borrón y otra una barra de macros. La regla:

- **Las cuatro piezas, en ese orden, siempre.** Una métrica sin serie temporal no
  inventa otro dibujo: deja el hueco del gráfico vacío, y ese hueco vacío ya
  informa —esta métrica todavía no tiene historia—.
- **Una fila de métricas tiene 2 o 4 tarjetas.** Tres deja un hueco que el ojo
  lee como un error.

### 5.5 Navegación: dos planos, nunca tres

Hoy el portal del cliente apila cuatro capas de cromo antes del primer dato:
tarjeta de saludo → pestañas → **dos tarjetas grandes que también son
navegación** (Mi progreso / Análisis) → cabecera de bloque con su botón.

- **Un plano de navegación se dibuja de una sola forma.** Nivel 1, pestañas.
  Nivel 2, carril de chips. Y no hay nivel 3.
- **Una tarjeta nunca es navegación.** Si lleva a otro sitio, es un chip, una
  pestaña o un enlace. Las dos tarjetas-pestaña del portal se convierten en dos
  chips del carril, que es lo que son.
- **El saludo no es una pantalla.** Va en la cabecera de la aplicación, junto al
  avatar, o no va.

> **Enmienda (27 de agosto de 2026): «Progreso» deja de tener dos niveles.**
>
> El resumen y el análisis eran dos pantallas —y el análisis, por dentro, otra
> barra de cuatro pestañas—. Las dos contestan la MISMA pregunta con distinto
> detalle, así que el segundo nivel no ordenaba nada: obligaba a un viaje (salir
> de donde estás, cargar otra pantalla, buscar el gráfico, volver) para mirar
> algo que se quiere mirar **al lado** de lo que lo motivó.
>
> Ahora es una sola pantalla, y el detalle se abre EN SU SITIO: cada pieza del
> resumen resume una de las cuatro preguntas de `domain/reading.js`, y su título
> es la puerta de la ventana que la contesta entera. No es un plano de
> navegación nuevo —una ventana no te lleva a ninguna parte, ni cambia la URL, ni
> hay que volver de ella—, y es el gesto que Entreno («Ver toda la progresión ↗»)
> y Dieta («Ver el día ↗») ya usaban.
>
> Esto no toca la regla: **sigue habiendo dos planos y ninguno más**. Lo que se
> retira es el segundo nivel de una sección que no lo necesitaba, con él
> `analytics/ProgressLayout.jsx` y el carril de dos chips del portal del cliente.
> `/c/:id/analitica` y `/mi/analitica` siguen dadas de alta y rebotan al panel:
> están en marcadores.
>
> La tabla de §4.3 propone `/c/:id/progreso` para fusionar las dos rutas. No hace
> falta: la fusión es de PANTALLAS, no de URLs, y la que se queda ya se llama
> `resumen`.

> **Enmienda (28 de agosto de 2026): el Resumen son TRES BLOQUES.**
>
> Unificada la pantalla, faltaba ordenarla. Un entrenador no mira «métricas»:
> mira tres cosas, y en este orden.
>
> | Bloque | La pregunta | Qué lleva |
> |---|---|---|
> | **Objetivos** | ¿hacia dónde, y se está consiguiendo? | la fase de hoy con su progreso, el ritmo buscado contra el real, el veredicto, y las cuatro palancas (kcal, pasos, cardio, días) |
> | **Evolución** | ¿qué dice el cuerpo? | el peso contra las calorías **o los pasos** —misma banda, se elige—, las medidas, y lo que contesta en el check-in |
> | **Entrenamiento** | ¿qué está pasando en el gimnasio? | volumen **pautado** del bloque y su media semanal, series registradas, tonelaje, sensaciones de sesión y progresión por cargas |
>
> Cada bloque es un `Panel rango="bloque"` —el rango que §5.1 bis reservaba para
> esto— y su cabecera abre la ventana que lo desarrolla. La columna lateral
> desaparece: sus cifras viven donde miden algo. El roadmap deja de ocupar el pie
> de la página y se abre desde Objetivos, porque es una herramienta de
> planificar y no una lectura.
>
> Dos datos que estaban guardados y no se enseñaban en NINGUNA pantalla entran
> aquí: los **pasos** que le pautas (eran una foto de cada revisión, como las
> kcal) y lo que contesta en el **check-in** semanal —adherencia, hambre, sueño,
> estrés—, que solo se podía leer abriendo la revisión de esa semana concreta.

> **Corrección (28 de agosto de 2026): tres bloques apilados eran dos metros de
> página.** El contenido de arriba se queda; la forma pasa a ser la de Entreno y
> Dieta, que es donde ya estaba resuelta:
>
> - **Una fila de mando** con los dos asuntos como PESTAÑAS —Evolución y
>   Entrenamiento—, cada una con su punto de aviso. Apiladas había que recorrer
>   la primera entera para llegar a la segunda.
> - **La hoja a lo ancho** y **el objetivo en una columna pegajosa**, igual que
>   el menú y la tarjeta de objetivo en Dieta: es contra lo que se cuadra todo, y
>   como bloque apilado desaparecía al desplazar.
> - **La progresión es de la RUTINA, no del ejercicio.** Los días son pestañas y
>   debajo va su tabla: una fila por semana, una columna por grupo muscular con
>   lo hecho sobre lo pautado, y el tonelaje con su barra. Un entrenador no
>   progresa ejercicios sueltos: progresa sesiones.
>
> **Corrección (28 de agosto de 2026, tarde): el Resumen es un MOSAICO.**
> Cuarto intento y el que se queda. Las dos hojas en pestañas fallaban por lo
> mismo que las diez cajas del principio pero al revés: para ver el entreno
> había que dejar de ver el cuerpo, y un panel existe para verlo todo a la vez.
> Y la columna del objetivo —tres filas de «Busca / Va a / Ahora»— era una tabla
> de laboratorio.
>
> Ahora son SIETE TARJETAS en una rejilla de dos columnas; las que llevan una
> serie o una tabla ocupan el ancho entero. Cada una abre su ventana. La
> referencia es el panel principal del competidor.
>
> **La regla que lo salva de parecer un laboratorio: cada tarjeta tiene UNA
> forma, y la forma es del dato.** El medidor del ritmo —con la zona buena
> pintada y la aguja dentro o fuera, que es la resta que antes había que hacer de
> cabeza y con signos cruzados—, la escalera bajo la curva del peso, la franja de
> macros, la tabla de la rutina con su barra de tonelaje, los medidores del
> volumen con la marca del MRV, las barras de lo subjetivo. Siete instrumentos
> porque son siete medidas. **Ninguna lleva icono decorativo**: con icono, siete
> tarjetas se leen como un menú; sin él, como siete medidas.
>
> Dos detalles que hacen que se lea como un panel y no como cajas sueltas: las
> tarjetas de una misma fila **miden lo mismo** (`stretch`, no `start`), y hay
> **una sola tarjeta encendida** con la lumbre —la del veredicto—, porque dos ya
> no señalan nada.
>
> Y tres cosas se bajan de tono porque gritaban sin motivo: el **veredicto** (un
> «En dirección contraria» a tamaño de titular alarma cada vez que se abre la
> ficha; lo que distingue un veredicto es la marca, no el tamaño), el **recuento
> de pesajes** (es intendencia: dice si el promedio es de fiar, no cómo va
> nadie) y la **adherencia** (lo normal es que esté bien; importa cuando se cae,
> y como curva gastaba el primer vistazo en decir «sí» doce veces). Sale también
> el **1RM estimado**: es una estimación y presentarla con la misma cara que un
> tonelaje medido invita a leerla como un dato.

> **Enmienda (21 de septiembre de 2026): el plan apunta a una fecha.**
>
> Diseñar sesiones lo hace cualquier hoja de cálculo. Lo que no hace es el mapa
> temporal: dónde está el atleta, hacia dónde va, qué viene después y qué
> veníamos haciendo. Las piezas ya existían —fases con fechas (0028), cruces
> (0073), bloques con intención y duración prevista, competiciones y objetivos
> en el calendario (0009)—, pero sueltas. Esta enmienda las conecta sin tabla
> nueva de objetivos ni de temporadas. El razonamiento entero, con los datos de
> la demo, está en `docs/eje-temporal.md`.
>
> | Pieza | Dónde vive | Qué hace |
> |---|---|---|
> | **El destino** | `client_events.ancla` (0122), un evento `race` o `goal` marcado | la fecha contra la que se mide el plan, con su cuenta atrás |
> | **La competición** | `client_events.competicion` (jsonb) | federación, categoría, sede y, si la categoría es por peso, el peso LÍMITE |
> | **La temporada** | se deriva: las fases entre un destino y el siguiente | se llama como su destino; no hay tabla |
> | **El eje** | `roadmap/EjeTemporal`, dentro de Sus fases | fases y bloques en dos carriles sobre las mismas fechas, con hoy y el destino |
>
> Las reglas que no se negocian:
>
> - **Fase y bloque no se anidan.** La fase es la dirección del cuerpo y va por
>   fechas; el bloque es la estructura del entreno y va por microciclos. Se
>   dibujan en paralelo. El bloque llega al calendario por la fecha de sus
>   microciclos (`tramoDelBloque`), **nunca** por `weekStartOfProgramWeek`,
>   que en la demo se equivocaba entre 3 y 21 semanas en cuatro de seis
>   clientes.
> - **Las fases no se enlazan con el destino: se miden contra él.** El tramo
>   hacia un destino son las fases que empiezan antes que él y después del
>   anterior. Llega si la última acaba la víspera o el mismo día; si no, el
>   hueco o el exceso **se dibujan**, rayados en tinta. No es un error de
>   validación ni un veredicto.
> - **Mover el destino no mueve las fases.** El diálogo dice qué pasa y ofrece
>   una casilla desmarcada para mover las que aún no han empezado
>   (`shift_future_phases`, todo o nada). Las pasadas y la de hoy no se tocan
>   nunca: cambiaría cómo se juzgó cada semana vivida. Estirarlas no se ofrece.
> - **Solo el entrenador toca un destino.** El cliente lo ve y no puede
>   moverlo, marcarlo hecho ni borrarlo (RLS, 0122). Puede apuntar su carrera,
>   y si su entrenador la marca como destino, a partir de ahí es del entrenador.
> - **El peso objetivo es uno y del cliente.** No hay peso por fase: el destino
>   de una fase ya es su arranque + ritmo × semanas. `effectiveGoal` lo conserva
>   también cuando manda una fase (antes se perdía y el portal dejaba de
>   enseñarlo).
> - **La app enseña, no reajusta.** No propone fases para tapar un hueco, no
>   reparte un exceso, no avisa y no sincroniza con federaciones. Cualquiera de
>   esas tres cosas se propone aparte, cuando se haya visto cómo se usa esto.
>
> Dónde se ve: el destino y el eje, en **Sus fases**; la cuenta atrás, debajo de
> la fase en la franja del **Resumen** y en la cabecera del **Inicio** del
> cliente; el calendario marca el evento como «destino del plan». Se fija en
> Sus fases y no en el calendario: es una decisión sobre el plan, y el plan se
> decide en un solo sitio.
>
> Lo que queda abierto: de dónde saldría el calendario de las federaciones
> naturales (`docs/eje-temporal.md` §6), y el desfase de
> `weekStartOfProgramWeek` en la cartera, la revisión y la línea de tiempo, que
> merece un encargo propio.

> **Enmienda (21 de septiembre de 2026): el roadmap es una línea, una tabla y el replanteo.**
>
> Con el destino puesto, falta ver el camino. El roadmap son tres cosas sobre las
> mismas fechas: la **línea** de la temporada (el peso real contra el esperado,
> con las fases de fondo), la **tabla** con una fila por semana, pasadas y
> futuras, con lo pautado y lo que pasó, y el **replanteo**: el entrenador toma
> el peso real de una semana como base nueva y sigue desde ahí. Todo se enlaza
> por fecha y se deriva; el único enlace explícito sigue siendo el destino. El
> razonamiento entero, con los números de la demo, está en
> `docs/roadmap-replanteo.md`.
>
> | Pieza | Dónde vive | Qué hace |
> |---|---|---|
> | **El replanteo** | `client_phases.replanteos` (0123), una lista jsonb en la fase | semana (lunes), peso base guardado como número, ritmo en %, nota y cuándo se decidió |
> | **La expectativa** | se deriva: `expectativaDeFase`, una recta por tramos | cada semana compara su media con el esperado del **jueves**: media contra media |
> | **Las intervenciones** | eventos `refeed` y `diet_break` (0123), con `hasta` y `kcal` | se enlazan con la fase por fecha; las vacaciones son `rest` con `hasta` |
> | **La tabla** | se deriva: una fila por **semana natural** | fase, peso medio, esperado, desviación, dieta pautada, bloque, intervenciones, replanteo, revisión |
>
> Las reglas que no se negocian:
>
> - **El sistema enseña la desviación; no sugiere replanteos, no reajusta solo,
>   no avisa.** La tabla no destaca qué semana convendría igualar ni colorea la
>   desviación como alarma: enseña el número con su signo.
> - **El replanteo es explícito y fechado.** Lo hace el entrenador desde una
>   fila pasada con media («Igualar aquí»). Uno por semana; se puede quitar. Un
>   replanteo que se queda fuera de su fase al acortarla se ignora al leer y no
>   se borra.
> - **La expectativa original no se pierde.** Se sigue calculando desde el
>   arranque de la fase y se dibuja como fantasma hasta su final; la desviación
>   se lee contra la vigente y contra la original. Las intermedias no se
>   prolongan.
> - **`phaseProjection` solo crece.** Sin replanteos devuelve lo mismo que antes;
>   con ellos, `objetivo` es el vigente y aparecen `objetivoOriginal`,
>   `desvioOriginal`, `base` y `replanteo`.
> - **El veredicto semanal juzga contra el ritmo del replanteo.** `phaseGoal(fase,
>   fecha)` devuelve el ritmo del último replanteo hasta esa fecha; la forma de
>   `effectiveGoal` no cambia. Si no, la tarjeta diría «Por debajo del ritmo» de
>   quien va justo al ritmo que se acaba de poner.
> - **El ritmo se guarda en % y se enseña también en kg/semana**, calculados
>   sobre la base **del tramo**, nunca sobre el peso de hoy: «0,6 % · −0,49
>   kg/sem». «Mismo ritmo» en un replanteo es el mismo %.
> - **Una intervención no mueve la recta.** Un diet break en mitad de una
>   definición se marca en la tabla y se sombrea en la línea; si después hay que
>   igualar, se iguala a mano.
> - **Refeed y diet break los escribe solo el entrenador** (RLS, 0123); el
>   cliente los ve. Las vacaciones siguen siendo de los dos. Las kcal se ocultan
>   con `useOculto()` a quien no las ve.
> - **La descarga no es un evento.** Es la intención `descarga` del bloque, o un
>   `rest` si es una semana suelta. Dos sitios para decirlo acabarían diciendo
>   cosas distintas.
> - **La tabla va por semana natural** y no se construye con `reviewTimeline`
>   (semana de programa). La dieta pautada sale de las revisiones cerradas y no
>   se proyecta más allá de la semana actual. Las semanas sin fase son filas, no
>   un error.
>
> El cliente lee sus fases enteras (0028), así que sus replanteos le llegan;
> enseñarle el fantasma es una decisión de pantalla.
>
> Lo que queda abierto: dónde se ven la línea y la tabla, y su diseño; y si la
> base original debe salir de la media de su semana en vez de un pesaje suelto,
> que movería cifras que ya se enseñan.

> **Enmienda (21 de septiembre de 2026): el roadmap vive en Revisiones.**
>
> Se probó como pestaña de la ficha, con dos vistas, y se retiró el mismo día.
> Duplicaba lo que ya hacía la revisión: la espina de Revisiones es el selector
> de semana, el contexto histórico y el mapa del proceso, que es justo el papel
> del roadmap. Así que la espina crece hasta ser la línea del roadmap y no hay
> pantalla aparte.
>
> | Pieza | Dónde | Qué hace |
> |---|---|---|
> | **La espina plegada** (por defecto) | arriba de Revisiones (`review/TimelineSpine`) | la banda de fase, el esperado, la media, hoy y la marca del cruce o del destino; sin eje de kilos; señalar una semana la elige para toda la pantalla |
> | **La espina desplegada** | el mismo sitio | la línea entera: fases, esperado por tramos, fantasmas de igualado, caminos del cruce, hechos, escalera de kcal con hilos y zoom Temporada / Fase |
> | **Revisión** (por defecto, debajo) | el conmutador bajo la espina | la revisión de la semana elegida, que es el detalle de una semana del roadmap |
> | **Semanas** | el mismo conmutador | el libro (`roadmap/LibroDelPlan`): una fila por semana, pasadas y futuras, agrupadas por fase; pulsar una fila la elige y vuelve a Revisión |
> | **Igualar aquí** | la barra de cierre (`ReviewDecision`), junto a los cambios de pauta | se decide al cerrar la semana, y antes de confirmar enseña la línea con el antes y el después; en ningún otro sitio |
> | **El plan** | una ventana (`roadmap/PlanDelRoadmap`) | se edita: el destino y el peso objetivo arriba del todo, y debajo las fases, el cruce con su pregunta y «Elegir»; se abre desde la banda de fase de la espina y desde la tarjeta del Resumen |
> | **La tarjeta del Resumen** | `dashboard/TarjetaRoadmap` | fase y semana N de M, el desvío o los días sin pesar y los días al cruce o al destino; lleva a Revisiones con la espina desplegada en la semana de hoy (`?espina=abierta&en=hoy`) |
>
> Reglas que se añaden:
>
> - **Alto fijo.** La línea no se estira a lo ancho de la pantalla: con más
>   ancho se alarga hasta un tope (1.280 px) y no se aplana.
> - **La espina recuerda su estado**, en ese aparato, **pero abre plegada si
>   hay una revisión pendiente**: desplegada, en un portátil de 1.366 px, empuja
>   la revisión por debajo del pliegue. Desde el Resumen se pide desplegada, y
>   eso manda.
> - **El libro se lee a su ancho**: columnas fijas y juntas, nunca repartidas a
>   pantalla completa. Dos grupos con cabecera ligera, «Pauta» (kcal, pasos,
>   cardio) y «Peso» (media, esperado, desvío), más los hechos; cada fase con
>   la cabecera de bloque de Historial.
> - **Se puede abrir cualquier semana con datos**, además de las que tienen
>   rutina montada: las semanas en las que se pesó o entregó
>   (`reviewableWeeks`, `active`). Si no, la espina y el libro enseñaban semanas
>   que no se podían elegir.
> - **El cliente ve su línea en su revisión**, plegada y encima de «Tus
>   semanas» (`Client/TuRoadmap`). Solo se mira: no elige semana ni abre el
>   plan. Sin los fantasmas ni la marca del igualado: ve el esperado vigente,
>   no cómo se ajustó. La nota de un igualado no se enseña en ningún sitio. Su
>   pantalla `/mi/roadmap` se retira.
>
> Siguen valiendo las reglas que trajo la pestaña:
>
> - **Un dato viejo no se disfraza de actual.** Si el último pesaje tiene más de
>   siete días, se dice «sin pesajes desde el …» en vez de una cifra.
> - **Un carril vacío no se dibuja.** Sin hechos no hay columna ni franja de
>   hechos; sin bloques, no hay columna de bloque; sin kcal pautadas, no hay
>   escalera.
> - **El bloque de una semana lo decide su jueves**, como la fase. Cuando el
>   bloque acaba (o acaban sus semanas previstas) y no hay otro, la semana dice
>   «Sin bloque».
> - **El cruce tiene una pregunta** (`client_phases.next_question`, 0125), y
>   sus caminos son las respuestas: «¿Llega al Nacional con margen?» → «Sí, con
>   margen» → Transición. La pregunta se escribe con los caminos y se borra con
>   ellos. Si un cruce de antes no la tiene, el plan la pide en su sitio.
>
> `dashboard/FasesPopup` se retira, y con la pestaña se van su tira del Resumen
> y el detalle de semana: lo que hacían lo hacen la tarjeta, la espina y el
> modo Revisión.

> **Enmienda (22 de septiembre de 2026): primero las semanas, después la revisión.**
>
> Supera a la de ayer en la portada y en el libro. Revisiones giraba alrededor
> del formulario de una semana, y desde fuera no se sabía en qué semana estaba
> el cliente ni cuál tocaba. Ahora se entra por el MAPA de sus semanas, y la
> revisión es el detalle de una de ellas, con su propia dirección.
>
> | Pieza | Dónde | Qué hace |
> |---|---|---|
> | **La portada** | `/c/:id/semana` (`review/PortadaDeSemanas`) | una frase arriba si hay algo que revisar («Te toca revisar la S11 · del 14 sept · Entregó»); debajo, cada fase es una tira con la cabecera de Historial: la gráfica de peso arriba (pesajes tenues por día, la media unida a sus vecinas, el esperado discontinuo) y sus casillas debajo, columna a columna; las pasadas plegadas, la actual abierta, las futuras debajo; dos lentes, **Nutrición** y **Entreno** |
> | **La lente de Entreno** | la portada, con el conmutador (`review/PortadaDeEntreno`) | las mismas semanas agrupadas por **BLOQUE**, con la fase como banda fina de fondo: columnas de tonelaje sobre las casillas —un solo color y un solo tope para todos los bloques—, una hilera de puntos bajo la columna **solo en las semanas incompletas** (●●●●○), las casillas con lo que levantó, y debajo los **ejercicios de referencia** del bloque con su línea (los elige el entrenador; por defecto, los tres con más series). Un bloque en borrador se ve solo en contorno, sin columnas. Datos, no veredictos |
> | **La casilla** | la portada | cinco estados por su FORMA, planos, sin sombra: revisada (tinte y tic), pendiente (la única rellena, de azul), en curso (canto azul), sin check-in (canto discontinuo), futura (punteada, con el esperado); sin verde ni rojo (`domain/estadosDeSemana`) |
> | **La semana** | `/c/:id/semana/<lunes>` (`Coach/WeekReview`) | peso contra esperado con la semana por dentro, de lunes a domingo, y la anterior en gris (`review/SemanaPorDias`); pauta vigente y qué cambió, entreno, fotos y lo que contestó; ‹ › a la de al lado |
> | **Las fotos** | la tarjeta del cuerpo (`review/ComparaFotos`) | los cuatro ángulos de dos semanas en parejas de antes y ahora; por defecto el inicio de la fase contra ahora; se pulsa una semana de la cabecera y se elige su casilla (atajos: inicio de la fase, inicio); hueco «Sin foto» si falta un ángulo; la lateral antigua se empareja cuando se declara su lado, una vez por cliente; la pareja se abre con cortinilla |
> | **El plan** | la misma ventana (`roadmap/PlanDelRoadmap`), en dos pestañas | se abre desde la cabecera de la portada y desde la tarjeta del Resumen, por **Temporada**: la temporada entera dibujada (`roadmap/VistaDeTemporada`) —fases de fondo, peso real contra lo esperado, fantasmas de igualado, el cruce con sus dos caminos, los hechos en su franja y la escalera de kcal con sus hilos—, con zoom Temporada / Fase; señalar una semana enseña su globo y pulsarla lleva a su revisión y cierra la ventana. La pestaña **Plan** es la de siempre (`roadmap/RoadmapPanel`): ahí se edita. El lado del cliente no lleva pestañas |
>
> Reglas que se añaden:
>
> - **Una semana pide los entrenos que dice la secuencia de su bloque.** La
>   cuenta es la MISMA que reparte la dieta del cliente —`(días desde el ancla)
>   mod (número de casillas)`, ver `semanaDelCliente`— para que lente y dieta no
>   den dos respuestas distintas, con el ancla del bloque de cada semana y no la
>   del que corre hoy. En un rotativo unas semanas piden cinco y otras cuatro, y
>   la hilera lo enseña. Sin secuencia escrita no hay hilera: «0 de 0» sería
>   inventarse que ese bloque no pedía entrenar. El día saltado sigue aparcado
>   (`docs/estudio-microciclo-secuencia.md` §1.4).
>
> - **Los ejercicios de referencia se guardan como `{ ejercicioId?, nombre }`,**
>   la misma forma que ya llevaba un bloque en borrador, y la lente junta los
>   registros del nombre guardado con los del nombre actual de ese id: renombrar
>   un ejercicio no parte su línea en dos. La propuesta no se escribe hasta que
>   el entrenador cambia algo.
>
> - **La temporada y las tiras son el MISMO dibujo a distinto zoom.** Una sola
>   escala de kilos con sus dos modos (`roadmap/escalaDePeso`: por ventana, con
>   8 % de aire y mínimo de dos kilos; o por fase, compartiendo píxeles por kilo
>   entre tiras), un solo día-a-píxel con sus dos modos (`roadmap/geometria`:
>   `escalaX` por fecha, `escalaPorColumnas` por semanas) y un solo trazo del
>   peso (`roadmap/TrazoDelPeso`: pesajes en su día, media unida, hueco
>   punteado), con la tinta `.progreso-*` que ya usaba la gráfica del Resumen.
>   Ninguno de los dos modos manda sobre el otro: quien dibuja elige.
>
> - **Pendiente es lo que pide la cola de Inicio** (`reviewState` en `ready` o
>   `missing`), con una sola forma; el texto distingue «Entregó» de «Sin
>   subir». Una entrega vieja sin contestar también es pendiente, y la frase la
>   cuenta («y 1 más sin contestar»).
> - **La barra de cierre solo sale en la pendiente.** Cerrar, ajustar e igualar
>   son la respuesta a la semana que toca. La revisada se LEE (lo que decidiste
>   y lo que le dijiste); la futura enseña lo planificado; la de sin check-in lo
>   dice en una línea y enseña lo que sí hay.
> - **Cada semana se nombra por su lunes**, no por su número: las revisiones se
>   guardan por (cliente, lunes) y el número depende de la fecha de alta.
>   «Revisar» en Inicio aterriza en la pendiente (`row.review.weekStart`);
>   `?en=hoy` redirige al lunes de hoy; `?espina=abierta` se retira.
> - **Quincenal: un periodo, una pieza.** Las casillas de un mismo periodo van
>   pegadas y con un solo estado (`periodStartOf`, exportado de `calendar`).
> - **La misma proporción, no el mismo rango.** Todas las tiras de un cliente
>   usan los mismos píxeles por kilo, y cada una se recorta a su fase. La
>   columna sale de lo que cabe en la casilla (80 px completa, 52 compacta, sin
>   unidad ni fecha); si no cabe, la tira se parte antes: nunca desplazamiento
>   lateral. En el teléfono, de cinco en cinco como mucho.
>
> Se retiran de Revisiones la espina (`review/TimelineSpine`), el conmutador
> Revisión / Semanas y el libro (`roadmap/LibroDelPlan`): la portada hace lo que
> hacían los tres. La espina sigue viva en la revisión del cliente
> (`Client/TuRoadmap`). No cambia el dominio de la revisión: ni
> `reviewableWeeks`, ni el cierre, ni `planSnapshot`. La versión del cliente
> (`/mi/evolucion/semanas[/:lunes]`) está propuesta y sin construir.

> **Enmienda (23 de septiembre de 2026): el creador del plan, en barras.**
>
> La pestaña **Plan** de «El plan» deja de ser la lista de fases
> (`roadmap/RoadmapPanel`, que se queda para el lado del cliente) y pasa a ser
> el creador del boceto aprobado el 22 sep («El plan en barras», 3.ª vuelta):
> `roadmap/CreadorDelPlan`, con su dibujo en `roadmap/BarraDelPlan`, sus fichas
> en `roadmap/MesaDelPlan` y sus cuentas en `domain/creadorDelPlan`.
>
> | Pieza | Qué hace |
> |---|---|
> | **La cabecera** | tres datos que la barra no dice: el destino con su cuenta atrás y cómo llegan las fases (o los caminos del cruce), el peso objetivo con lo esperado al acabar la última fase, y la pregunta del cruce con su fecha. Cada uno abre su ficha para cambiarlo |
> | **La barra** | una columna por semana natural, sin cajas ni sombras. La fase a 22 px del color de su dirección (hecha en sólido, la de hoy rellena hasta hoy con un punto debajo, lo que queda en tinte); los bloques a 15 px en tinta neutra y POR DÍAS, con un corte por microciclo (el rotativo, por vuelta), el borrador rayado y la descarga como trazo fino; los hechos con su icono y un tallo hasta una muesca; la regla cada cuatro semanas más hoy y el destino. Nada escrito dentro de los segmentos: al señalar una semana sale el globo de la casa (`ui/Globo`) |
> | **Las tiras** | 26 semanas como mucho y nunca más estrechas de 14 px por semana: si no cabe, se parte antes (`partirEnTiras`). Nunca desplazamiento lateral |
> | **El arrastre** | el final de una fase, del bloque abierto o de un borrador. Encaja en la semana, o en la vuelta si el bloque es rotativo, con un muelle discreto. Mientras se arrastra solo se dibuja; se escribe al soltar |
> | **La mesa** | al pulsar una fase, un bloque, un hecho o el cruce se abre su ficha debajo de la barra, sin caja; con «+ fase», «+ bloque» (en borrador) y «+ hecho», su alta |
>
> Reglas que se añaden:
>
> - **Alargar una fase empuja TODAS las que empiezan detrás; acortarla las
>   trae.** El destino y los bloques no se mueven. Una fase acabada no tiene asa
>   y una en curso no puede acabar antes de hoy ni ninguna durar menos de una
>   semana. Se hace en una transacción (`estirar_fase`, 0136): son varias filas
>   y con el EXCLUDE de la 0028 el orden importa.
> - **El asa del bloque abierto escribe su `plannedWeeks` y NO crea
>   microciclos**, que se siguen montando en Entreno; no baja de los ya
>   montados. La del borrador escribe el suyo, y los borradores de detrás se
>   mueven solos porque su sitio se deriva. Un bloque cerrado no tiene asa.
> - **Los pesos de los extremos son lecturas.** Entrada: si la fase empezó, la
>   base de su recta de lo esperado (el mismo número que dibuja la línea); si
>   es futura, lo esperado al acabar la anterior. Salida: entrada + ritmo ×
>   semanas, o la vigente si se igualó (con la original en su ficha). Se guarda
>   el ritmo; escribir el peso de salida enseña el ritmo que sale antes de
>   aceptarlo. Con semanas igualadas el atajo no se ofrece: su ritmo de ahora
>   sale del último igualado.
> - **Deshacer en todo.** Cada gesto se apunta con su inverso: el aviso lleva
>   «Deshacer», los mandos salen cuando hay algo que deshacer y ⌘Z / ⌘⇧Z
>   funcionan con la ventana abierta. Un arrastre entero es un paso.
> - **Una semana de un bloque semanal nombra el microciclo de su JUEVES**; la
>   de un rotativo, todos los que toca («M3–M4»). La regla vive en un solo
>   sitio: `microciclosDeLaSemana` (`domain/blocks`).

### 5.6 La lista corta de lo prohibido

Para poder revisar un diff sin discutir:

1. Una pantalla sin `PageHead`.
2. Un `<h2>` fuera de un `Panel`.
3. `className="card"` escrito a mano (existe `<Panel>`).
4. Un `style={{ color }}` que no venga de `domain/`.
5. Una tarjeta que navegue.
6. Un texto truncado con `…` en una columna que podía ser más ancha. Hoy «Hoy»
   enseña «Franco Es…» y «Sin cuenta enlaz…»: eso no es un problema de longitud,
   es una columna mal dimensionada.
7. Un selector de semana nuevo. Hay cinco; el objetivo es uno.
8. La palabra «Eliminar». Ver 5.7.
9. Las palabras «Tirar», «Agregar», «Crear» o «Agendar» como rótulo de un
   control, y un sexto dibujo del verbo de añadir. Ver 5.8.

### 5.7 Quitar y borrar no son lo mismo

La papelera aparecía con tres verbos —«Quitar serie», «Eliminar sesión»,
«Borrar este vídeo»— y los tres se leían como sinónimos, así que el gesto no
decía nada sobre lo que iba a pasar. No son sinónimos: hay dos gestos
distintos debajo, y el vocabulario los tapaba.

**Quitar** — sacar del plan algo que pusiste tú: una serie, una comida, una
pauta, una hoja, un bloque, una fase. Lo que se quita se puede volver a poner
porque el original eras tú.

**Borrar** — destruir un registro o un archivo: lo que él anotó o subió. Un
pesaje, una foto, un vídeo, una sesión entrenada, una revisión. No vuelve, y
por eso siempre pasa por `confirm` con `tone: 'danger'`.

**Eliminar** no existe. Era el comodín que dejaba las dos categorías mezcladas:
con él puesto, la misma palabra tapaba «esto lo puedes rehacer» y «esto no
vuelve nunca», que es justo lo que hay que saber ANTES de pulsar.

La prueba de la regla es el mensaje: si la confirmación tiene que decir «no se
puede recuperar», el verbo es borrar. Si puede decir «Deshacer», es quitar.

### 5.8 Un gesto, un dibujo, una palabra

§5.7 arregló la papelera y dejó el resto del vocabulario sin ley. Medido el 11
sep 2026 sobre la aplicación entera: **el verbo de añadir tenía siete dibujos** y
**deshacerse de algo, cinco palabras**. Ninguna de las dos cosas es un problema
de estilo: la misma pantalla enseñaba el mismo gesto de dos formas, y eso obliga
a aprender la aplicación dos veces.

**Añadir tiene dos formas, y solo dos.**

· **«+ cosa», en azul y sin caja** (`ui/BotonMas`) — uno más de la lista que ya
  está delante: una serie, un ejercicio, un alimento, una pregunta, una acción,
  un paso. Va **al pie de la lista a la que añade**, porque es donde va a
  aparecer lo que se añada, y el sustantivo va en minúscula: el signo es el
  verbo. Es la ley de los gestos —la caja se enciende, el verbo va en azul— y la
  del color —azul invita—.
· **«Nuevo/Nueva cosa», botón primario en la cinta** — dar de alta una pieza que
  no existía, en la pantalla que es su colección: un alimento, un ejercicio, un
  formulario, un protocolo, un cliente, una etiqueta. Una por pantalla.

Y un tercer caso que no es una forma nueva: **el botón que cierra un alta ya
abierta dice «Añadir»**, a secas, porque el campo que tiene al lado ya dice qué.

No existen «Agregar», «Crear», «Agendar» ni «Dar de alta» como rótulo de un
control. Tampoco la caja discontinua a todo el ancho: era el dibujo que hacía que
el Taller se leyera como un formulario al lado de Entreno.

**Deshacerse de algo tiene cuatro palabras, una por gesto.** Las dos primeras
son §5.7; las otras dos son lo que faltaba:

| Palabra | Qué es | La prueba |
|---|---|---|
| **Quitar** | sacar del plan algo que pusiste tú | puede decir «Deshacer» |
| **Borrar** | destruir lo que él anotó o subió, y lo tuyo que no vuelve —una plantilla del cajón— | tiene que decir «no se puede recuperar» |
| **Descartar** | no quedarse con algo que ni llegó a formar parte de nada: una grabación, un aviso que te llega | no había nada puesto que sacar |
| **Cancelar** | cerrar un formulario abierto sin guardar. El par de «Guardar» | no toca nada de lo que ya estaba |

**Vaciar** no es una quinta: es «quitar todo» de un recipiente —el portapapeles,
las anotaciones de una foto— y por eso no lleva nombre propio.

Y **«Tirar» no existe**, por el mismo motivo que no existe «Eliminar»: era un
sinónimo de borrar vivo en una sola pantalla, y un sinónimo en un producto es una
pregunta («¿esto es otra cosa?») cada vez que aparece.

### 5.9 Cada clase de pregunta tiene su mando

El cuestionario de la semana es lo que el cliente contesta todos los domingos, y
el 14 sep 2026 eran **nueve rampas idénticas de diez barras**, una debajo de
otra, distinguidas solo por el enunciado. El tipo de pregunta ya era siete
(`QUESTION_KINDS`), pero el tipo no es lo único que tiene que cambiar de una
pregunta a la siguiente.

**Un control por clase de pregunta, y ninguno prestado.** La escala es una rampa
que se llena (`ui/Escala`); el sí/no son dos mandos con su visto y su aspa
(`ui/Opciones`, `sino`) y no dos píldoras iguales; una cifra que se cuenta lleva
sus dos botones (`ui/Contador`) y no un campo de texto; dónde duele se señala en
el cuerpo (`ui/ZonaDelCuerpo`). Un control nuevo entra por el `switch` de
`SessionFeedback`, que es el único sitio donde se decide esto.

**Y una escala tampoco es una sola cosa: se contesta con SU INSTRUMENTO**
(`instrumento`). Entre el 14 y el 15 sep 2026 esto se probó primero con un icono
distinto dentro de los mismos once discos —cubiertos la adherencia, un cerebro el
estrés—, y no era la cura: **unos cubiertos no son la adherencia, son la comida**,
y el mismo dibujo repetido once veces en fila deja de ser un icono y pasa a ser
textura. Seguía siendo el mismo control nueve veces, con adorno.

Lo que de verdad cambia de una pregunta a otra es cómo se contesta. Son cuatro:

| Instrumento | Qué clase de pregunta | Dónde |
|---|---|---|
| **Estrellas**, de 1 a 5 | lo que se VALORA | adherencia, sueño, digestiones |
| **Caras**, de 1 a 5 | lo que se SIENTE | sensaciones, ganas de seguir |
| **Depósito**, de 1 a 5 | lo que se GASTA | energía |
| **Rampa** de discos, de 0 a 10 | la CANTIDAD | RPE, dolor, hambre, agujetas, fatiga, estrés, entrenos |

Cuatro reglas: **el instrumento manda sobre el rango** —cinco estrellas son
cinco, no diez medias estrellas, y por eso las ocho preguntas que lo estrenaron
bajaron a 1-5 con su migración (0120) para lo ya contestado—; **la rampa es para
lo que es una cantidad**, que es donde el 0-10 significa algo (entre un dolor de
3 y uno de 5 hay una decisión de entrenamiento) y donde los discos siguen
creciendo de izquierda a derecha para decirla sin leer una cifra; **ninguno lleva
su número al lado**, porque un instrumento que necesita el número escrito al lado
es un instrumento que no ha sabido decirlo; y **una pregunta que se inventa el
entrenador no estrena instrumento**, porque sería decidir por él qué clase de
cosa está preguntando: sale en la rampa.

**Y el instrumento viaja con la pregunta, salga por donde salga.** Hay dos
modelos de pregunta —el del protocolo y el de los elementos del formulario
libre— y una estantería que lleva del primero al segundo: coges «Energía» del
catálogo y entra en tu formulario como un elemento más. El elemento se trae lo
que se PUEDE retocar (enunciado, ayuda, rango, opciones) y no lo que no —el
instrumento, las puntas, el color de la serie—, y eso es correcto: copiarlo sería
dejarlo editable. El precio, hasta el 15 sep 2026, era que por ese camino
«Energía» y «Sensaciones generales» salían las dos como la misma rampa de cinco
discos. Se resuelve yendo al catálogo por `origen` cada vez que se pinta
(`catalogQuestionById`), nunca copiando. Y donde el instrumento manda, **el mando
del rango no se enseña**: se dice por qué, igual que con una medida del
vocabulario.

**Una escala dice qué significan sus dos puntas.** «Nada» / «Clavada» debajo del
primer y del último paso (`anclas`). Es información que vivía en la línea
de ayuda —«de 1 (nada) a 10 (clavada toda la semana)»: una frase para explicar un
dibujo que tenía al lado—, y donde tiene sentido es en el dibujo. Con ella, la
adherencia y el estrés dejan de parecer la misma pregunta dos veces.

**Lo que hoy no viene a cuento no se pregunta.** «¿Dónde te ha molestado?» solo
existe la semana en la que ha dolido algo (`depende`). Una pregunta que se
contesta dejándola en blanco no es una pregunta: es la consecuencia de la
anterior. Y lo ya contestado no se esconde nunca, aunque su condición deje de
cumplirse — un dato que la pantalla no enseña es un dato que nadie puede
corregir.

**Lo que contesta un cliente se pinta en UNA hoja numerada.** Sus tres
formularios —el de alta, el cuestionario del check-in y cualquiera que le
mandes— son el mismo papel: una columna, un renglón por pregunta, el enunciado a
cuerpo y tinta principal, la ayuda colgando debajo de él, el control a su medida
y un carril de números a la izquierda que **se encienden en acento al
contestar**. Numera, separa y dice por dónde vas, las tres a la vez, y es la
única pieza de color de la hoja. Dos formularios del mismo producto no pueden
tener dos gramáticas.

El alta —lo primero que ve un cliente de esta aplicación— tardó tres intentos en
llegar ahí, y los tres errores están escritos porque se repiten solos:

1. **Diecinueve preguntas apiladas**, cada tanda en su caja hundida. Cada caja
   estaba bien y el conjunto no: ordenar cada pieza no ordena la pantalla cuando
   lo que sobra es cuántas hay.
2. **Una rejilla de dos columnas por tanda**, con ayuda debajo de unas preguntas
   y no de otras: renglones descuadrados y un campo suelto en la última fila.
   Formulario de administración, no la primera impresión de un producto.
3. **Una pregunta por pantalla**, con «Atrás» y «Siguiente». Ordenado y con un
   peaje nuevo: **trece toques para contestar trece preguntas**, cada uno sin más
   premio que enseñar la siguiente.

De ahí sale la regla: **un recorrido paginado se gana el toque cuando cada paso
hace algo distinto**. El asistente del check-in pesa, mide y fotografía, y cada
paso es otro aparato; una pila de preguntas cortas no. Y el alta, además, vive
DENTRO de una pantalla que ya se baja —con su lista de tareas encima y el cajón
de las fotos debajo—, así que paginarla por dentro serían dos maneras de avanzar
en la misma pantalla.

Las tandas siguen existiendo y son **capítulos de la hoja**: encabezan su tramo
como un antetítulo y no como una pestaña. La cuenta de los números es una sola
para toda la hoja —lo que dice es cuántas preguntas llevas—, y el botón principal
de la pantalla es **Guardar**, que no compite con nada porque ya no hay
navegación que poner al lado.

**Y una cifra se pide con la caja de su tamaño.** Lo que se cuenta con los dedos
—días que entrenas, comidas al día— lleva «−» y «+» (`ui/Contador`); lo que es
una medida lleva su placa, y la placa mide los caracteres que va a llevar dentro
(`digitos`, en el catálogo del perfil). Una caja de seis caracteres para un «4»
no es un campo: es un hueco.

### 5.10 La mesa de trabajo, y es una sola

Desde el 17 de septiembre de 2026 el diseño llega dibujado en Figma y aquí se
reproduce. Entreno (nodo `32:100`) y Dieta (`64:55` y `62:434`) dibujan **el
mismo mueble**, y eso deja de ser una coincidencia para ser la norma: toda
pantalla de trabajo del taller —la que monta algo para alguien— se compone de
las mismas piezas y en este orden.

```
┌─ las tarjetas de lo que se elige ────────────────────────────────────────┐
│  High  ×6 días                     │  Low  ×3 días                       │
│  P 120g · C 531g · G 55g           │  P 120g · C 410g · G 50g            │
│  3 comidas · 14 alternativas        3100 kcal   ·   ·   ·     2600 kcal   │
└──────────────────────────────────────────────────────────────────────────┘
┌─ la barra ───────────────────────────────────────────────────────────────┐
│  D1 D2 D4 D5 D7 D8 ·············· + cosa  CÓMO ESTÁ PAUTADO  ⧉ ⧉ ⚙ 🗑    │
└──────────────────────────────────────────────────────────────────────────┘
┌─ la mesa (1fr) ─────────────────────────┐ ┌─ el costado (300 px) ───────┐
│  una CAJA por unidad de trabajo         │ │  un panel, secciones con    │
│  (una comida, un ejercicio)             │ │  filete entre ellas         │
└─────────────────────────────────────────┘ └─────────────────────────────┘
```

1. **Primero se elige, después se opera.** Las tarjetas de lo que se elige van
   ARRIBA del todo y la barra debajo, porque la barra habla del que está
   abierto: con la barra encima, sus casillas y sus verbos se referían a un día
   que todavía no se había elegido. Esta es la corrección del 17 de septiembre
   —el primer intento las puso al revés— y es la regla, no el caso de la dieta.
2. **Lo que se elige va en tarjetas**, no en pastillas, en cuanto haya algo que
   distinga una opción de otra además del nombre. Una pastilla obliga a abrir
   para saber qué hay dentro. Con una sola opción no se pintan.
3. **La barra** (`.tira`) lleva, a la izquierda, el segundo nivel de la elección
   —las casillas del ciclo, los microciclos— en pastillas de UN renglón, y a la
   derecha los «+ cosa», cómo está pautado en voz de rótulo y **todos** los
   verbos, con la papelera al final. Un titular solo cuando no hay tarjetas
   encima; si las hay, repetiría el nombre a veinte píxeles. **Su chasis lo
   dice su propio frame**: en Entreno va en caja hundida y en la dieta va libre
   sobre el papel. Lo que es norma es qué lleva y en qué orden, no la caja —y
   el relleno de la caja era además lo que echaba los verbos a un segundo
   renglón en un portátil.
4. **El acento de la barra dice UNA cosa**: qué le toca a lo que está abierto.
   Por eso el rótulo del tipo de plan no lleva chapa de color — dos azules en
   la misma barra significando cosas distintas es un azul que no significa nada.
5. **Cada unidad de trabajo es una caja** con canto: banda de cabecera gris con
   su nombre, su cuenta y sus verbos; el cuerpo sobre papel blanco; la mesa de
   cifras a sangre, con banda de encabezado y banda de suma al pie. **Sin panel
   que las envuelva**: lo que separa dos cajas es su propio canto.
6. **Lo que cuelga de una fila no vive en su rejilla.** Las alternativas de un
   alimento colgaron de las columnas del padre —el nombre bajo el nombre, la
   ración bajo la cantidad— y leía mal de cerca: una equivalencia no tiene P, C,
   G ni kcal que poner ahí, así que media fila quedaba vacía y lo que sí dice
   acababa volcado al otro canto. Van en cajas propias sobre una banda de
   acento, atadas a su fila por un raíl.
7. **Lo que se le escribe a alguien se escribe igual en toda la casa.** La
   nota para el cliente de una comida y la de un ejercicio son la misma pieza:
   un icono (`Quote`) en la fila de verbos y un `.hoja-nota` debajo. Tres
   formas del mismo gesto es lo que hace que la aplicación se lea como tres.
8. **Las cifras no se escriben en cajas hundidas.** La caja sale al acercarse
   (§5.8), nunca en reposo: una mesa de veinte cantidades en reposo es un
   formulario, no una hoja.
9. **El costado es UN panel** con secciones separadas por filete, y contiene
   lecturas —con qué se comprueba lo de la mesa—, nunca trabajo. Cada renglón
   es nombre + «lo que hay / lo pedido» + una barra debajo, y NADA MÁS: los
   g/kg y el descuadre bajan al pie o los dice la barra, que **la pinta el
   semáforo** —llena y verde significa «cuadra», no «vas bien»—. Y una serie
   de medidas se dibuja por PUNTOS unidos, no como una curva: el punto es el
   dato y el tramo entre dos es lo único que se puede afirmar de lo que pasó
   en medio.
Y la mesa y el costado **se pliegan a la vez** en toda la casa: una columna a
partir de 1199,98 px.

Dos cosas que el rediseño NO trae, y que hay que releer antes de proponerlas
otra vez, porque los frames las dibujan:

- **El color por categoría sigue prohibido** (§5.3). Una barra de macros lleva
  la tinta de su serie porque es un gráfico; la palabra «Proteína» no lleva
  ninguna.
- **El semáforo solo se pega a una cifra que se pueda juzgar contra algo
  pautado.** Un peso que baja 1,2 kg no es verde: depende de qué esté haciendo
  esa persona.
- **Una banda entera solo se tiñe en verde, y solo para dar el visto bueno.**
  El pie de «Suman» se pinta cuando cuadran las cuatro cifras; cuando no
  cuadran se queda neutro y hablan las cifras en rojo. No es medio semáforo:
  que algo cuadre se comprueba de una pasada y se deja de mirar, y que no
  cuadre hay que leerlo cifra a cifra.

**Cómo se apunta una pantalla nueva a esta norma:** añadiendo su raíz a las
listas de selectores de `piezas.css` que describen la cinta. No se copian las
reglas — es la misma pieza y tiene que envejecer a la vez.

---

## 6. Pantalla de muestra: «La semana de Javier»

La pantalla que hoy no existe y que sostiene toda la tesis. Es la que hay que
validar primero, porque si esta no convence, §4 se cae y §5 sigue en pie por su
cuenta.

**Ruta:** `/c/:clientId/semana` · **Reemplaza a:** `/c/:id/revision` y al modo
`ReviewSession`.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Semana 4                                          [ Contestar ]     │  PageHead
│  Del 10 al 16 de agosto · entregó el domingo                         │  h1 + sub + 1 acción
├──────────────────────────────────────────────────────────────────────┤
│  ◄  S1   S2   S3  [S4]  S5                                           │  el ÚNICO carril
├──────────────────────────────────────────────────────────────────────┤
│  LO QUE HIZO                                                         │  bloque · troquelada
│  ┌────────────┬────────────┬────────────┬────────────┐               │
│  │ SESIONES   │ TONELAJE   │ PESO       │ PASOS      │               │  fila de 4, orden fijo
│  │ 3 de 4     │ 12.400 kg  │ 80,1 kg    │ 8.900      │               │  etiqueta·cifra·delta·gráfico
│  │ ↓ 1        │ ↑ 3,1 %    │ ↓ 0,4 kg   │ ↑ 12 %     │               │
│  │ ▁▃▅▂       │ ▁▃▅▇       │ ╲╲__╱      │ ▃▅▂▇       │               │
│  └────────────┴────────────┴────────────┴────────────┘               │
│                                                                      │
│  Lunes · Push        4 ej · 12 series · 3.100 kg      «flojo el 3º»  │  lo programado y lo
│  Miércoles · Pull    5 ej · 14 series · 4.200 kg                     │  ejecutado, en una línea
│  Viernes · Legs      —  no entrenado                                 │
├──────────────────────────────────────────────────────────────────────┤
│  LO QUE ENTREGÓ                                                      │
│  Peso     80,1 kg  ·  4 pesajes · media fiable                       │
│  Fotos    [frontal] [lateral] [espalda]        Comparar con S1 →     │
│  Notas    «La semana ha ido bien, el domingo comí fuera»             │
├──────────────────────────────────────────────────────────────────────┤
│  TU RESPUESTA                                                        │
│  [ escribe aquí ]                                                    │
│  [ Grabar vídeo ]                    [ Contestar y pasar al siguiente ]│
└──────────────────────────────────────────────────────────────────────┘
```

Lo que hay que fijarse en validar:

- **Un solo carril de semana** en toda la pantalla, arriba, y manda sobre los
  tres bloques a la vez. Es la diferencia entera con lo de hoy.
- **Tres bloques y se acabó**, en el orden de la conversación: qué hizo → qué
  entregó → qué le digo. La respuesta va abajo porque es lo último que ocurre.
- **«Contestar y pasar al siguiente»** es lo que convierte esto en una tarea con
  final. Hoy revisar cinco clientes es entrar y salir de cinco sitios.
- **En móvil**: los mismos tres bloques apilados, el carril de semanas se
  desplaza en horizontal, la fila de cuatro métricas se parte en 2×2. Ni un
  elemento nuevo.
- **No hay datos nuevos.** Todo lo que sale ya está en `domain/today.js`,
  `domain/training.js`, `domain/anthropometry.js` y `domain/reviews.js`. Esta
  pantalla no necesita ni una consulta más, y eso es a propósito: si necesitara
  una, sería otra cosa disfrazada.

---

## 7. Orden de trabajo

Con la regla de siempre: nada entra sin `npm run check` en verde, y cada fase se
puede parar sin dejar la aplicación a medias entre dos modelos.

| # | Fase | Qué incluye | Estado |
|---|---|---|---|
| 0 | **Correo transaccional** | `monetizacion.md` 4.3. No es de este documento, pero sigue siendo lo más rentable que se puede hacer | **PENDIENTE** |
| 1 | **La gramática, en primitivas** | `Panel` con cabecera, `GroupHead`, `MetricRow`, y `domain/metrics.js` con el color de cada métrica | **HECHA** |
| 2 | **Migrar pantallas** | **Las 24 pantallas de ruta** con `PageHead`, y el color en las nueve que lo elegían a mano | **HECHA** |
| 3 | **Quitar los planos de más** | Las tarjetas-pestaña de Progreso y de Revisión → chips; el saludo deja de ser una tarjeta | **HECHA** |
| 4 | **«Su semana»** | La pantalla de §6, en `/c/:id/semana`, con `domain/week.js` y once pruebas. Convive con las secciones actuales sin sustituir ninguna | **HECHA** |
| 5 | **Reagrupar las secciones** | Seis secciones a cinco, sin una sola redirección. §4.2 (el portal) sigue sin decidir | **HECHA en parte** (26 ago 2026) |
| 6 | **El microciclo como secuencia** | La estructura baja al bloque como secuencia de días (`block.microciclo`) y admite repartos asimétricos («2-1 2-1 3-1»). F1 dominio y pruebas · F2 conteo de hojas repetidas, persistencia y editor · F3 portal, panel y dieta. Ver `estudio-microciclo-secuencia.md` | **F1 HECHA** (22 sep 2026) |

> **§4.3 estaba equivocado en el precio, y era lo que bloqueaba esta fase.** Este
> documento daba por hecho que reagrupar obliga a mover URLs —`/rutina` →
> `/plan`, `/calendario` → `/ficha`— y por tanto a duplicar para siempre la tabla
> de redirecciones. No hay que pagarlo: **agrupar es una decisión de navegación y
> las rutas son otra cosa.** El propio producto ya tenía la pieza —una sección
> con dos niveles, como «Progreso» = `resumen` + `analitica`, se resuelve con una
> ruta de layout sin `path` y un carril de chips—.
>
> **Y §4.1 estaba equivocado en QUÉ agrupar.** Su tabla mete la rutina y la
> nutrición dentro de «Su plan». Se hizo, se probó y se deshizo el mismo día, con
> el argumento correcto: **son las dos cosas que un entrenador AJUSTA de cada
> cliente**, o sea su oficio, y lo que se ajusta no se esconde detrás de un chip.
> El horizonte de tiempo es un buen criterio para lo que se CONSULTA y un mal
> criterio para lo que se TRABAJA.
>
> Lo que sí se agrupó es el calendario de una persona dentro de su ficha: sus
> fechas son de la misma naturaleza que su tarifa y su antigüedad, y era la
> sección con menos uso de las seis. El carril queda en cinco:
>
> ```
> Resumen · Entreno · Dieta · Revisiones · Perfil
>  meses     ── lo que ajustas ──    semana     siempre
> ```
>
> Cada una contesta una pregunta que no contesta ninguna otra, que es la prueba
> que este documento aplica en todas partes. Bajar de cinco solo por bajar
> fundiría «voy a revisar a Javier» con «¿cómo va Javier en tres meses?», que son
> dos frecuencias distintas.

### Lo que la fase 2 cerró

**Ninguna pantalla de ruta entra ya directamente en controles.** Eran once las
que lo hacían —Apariencia, Integraciones, Equipo, Ayuda, Calendario, Análisis, el
estudio de fotos y las cuatro del portal—, es decir más de la mitad, y es la
razón concreta de que cambiar de sección se sintiera como cambiar de aplicación.

Y con ellas cayeron los últimos restos del inventario de §2:

- **Los dos `<h2 style={{ fontSize: 'var(--fs-lg)' }}>`** con el nombre del día,
  escritos idénticos en el editor del entrenador y en la rutina del cliente. Son
  una clase, `.day-name`, declarada una vez.
- **El tercer `h2` de nivel pantalla de la nutrición** («Tus pautas»), que con
  «Plan nutricional» y «Menú estructurado» hacían tres títulos de pantalla en una
  sola página.
- **La pantalla de Ayuda metida entera en un `Panel`**: una tarjeta envolviendo
  una lista que ya tenía superficie propia, o sea una tarjeta dentro de otra.
- **El campo de renombrar el equipo sustituía al titular**, así que al escribir
  la pantalla se quedaba sin nombre — y metía un `<input>` dentro de un
  encabezado, que para un lector de pantalla no es un encabezado.

Y la regla 6 de §5.6, que era lo más visible de todo: la bandeja de «Hoy»
enseñaba «Franco Es…» y «Sin cuenta enlaz…» porque su columna medía 332 px
repartidos entre una inicial, un nombre, un botón y una flecha, con el nombre
siendo el único de los cuatro que cedía. Una bandeja que existe para decir a
quién le debes algo no puede quedarse sin sitio para el nombre.

### Lo que la fase 1 dejó medible

La lista blanca de `verify-styles.mjs` —los archivos a los que se les permite
nombrar un color de la paleta de datos— **baja de trece a tres**, y los tres que
quedan no pintan métricas: son las primitivas de gráfico, los logotipos de
terceros y la marca del cliente activo. Eso no es una opinión sobre si la regla
se cumple: es el script fallando si deja de cumplirse.

De paso salieron tres cosas que estaban rotas y nadie veía:

- `npm run verify` **ya fallaba antes de empezar**: `.day-rail` se usaba en el
  editor de rutina y no existía en el CSS, así que ese elemento salía sin estilo.
- La adherencia tenía **tres colores en el mismo archivo** —verde en la cifra,
  teal en la lista de al lado, lima en la analítica—.
- Tres métricas llevaban un hex literal, o sea fuera de los tokens y por tanto
  con el mismo color en tema claro y en oscuro.

**La fase 5 no se empieza sin haber usado la 4 durante un ciclo real de varias
semanas con clientes de verdad**, y esa condición se puso antes de construir
nada, no después. Es la única fase sin vuelta atrás barata: duplica la tabla de
redirecciones para siempre y mueve de sitio URLs que están pegadas en
conversaciones de WhatsApp.

> **Las dos mitades de ese párrafo se cumplieron, y la segunda resultó falsa.**
> La condición se cumplió sola: dos entrenadores describieron la aplicación, por
> separado, con las mismas palabras del §2 de este documento. Y la vuelta atrás
> sí era barata, porque la reagrupación no necesitaba mover URLs (ver el recuadro
> de §7). Lo que quedó sin hacer es §4.2, el portal del cliente, y ahí la
> prudencia sigue en pie: es lo que ve quien paga y hay dos portales activos en
> producción, así que no hay con qué decidirlo.

Lo que sí se ha hecho es dejar la fase 4 **conviviendo** con lo de antes: «Su
semana» es una sección más del carril y no ha sustituido a ninguna. Rutina,
Nutrición, Revisión, Progreso, Calendario y Ficha siguen exactamente donde
estaban. Lo único que cambia es por dónde se entra a un cliente —`/c/:id` lleva
ahora a su semana en lugar de a su resumen— y eso es una línea.

---

## 8. Lo que este documento no decide

Cinco preguntas que son suyas y que cambian lo que hay que escribir:

1. **¿La nutrición pertenece a la semana o solo al plan?** La dieta se cambia
   cada varias semanas (es plan), pero si cuadró o no es información de la semana
   (es revisión). La propuesta la parte en dos y eso puede ser un error.
2. **¿El portal del cliente baja de verdad a tres entradas?** Contradice el
   razonamiento escrito en `CLIENT_SECTIONS`, que está bien argumentado. Con dos
   clientes de portal en producción, hay poca evidencia para decidirlo por datos.
3. **¿El calendario se va a la ficha, o se retira?** Es la sección con menos uso
   y la única que no participa del bucle. Retirarla es una opción legítima que
   este documento no se atreve a proponer sin datos de uso por pantalla.
4. **¿«Hoy» y «Clientes» siguen siendo dos?** Están defendidas y las respeto,
   pero con quince clientes en total la distinción entre «qué ha pasado» y «qué
   falta» puede no pagar dos entradas todavía.
5. **¿Cuánto vale el coste de compatibilidad?** La fase 5 duplica la tabla de
   redirecciones para siempre. Si la respuesta es «no lo suficiente», el
   documento se queda en las fases 1–4 y sigue mereciendo la pena.
