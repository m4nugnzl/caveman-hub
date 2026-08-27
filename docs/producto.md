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
