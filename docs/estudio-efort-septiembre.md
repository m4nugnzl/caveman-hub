# Estudio «Lo que Efort enseñó en septiembre»

**21 capturas de Instagram de Efort Coach, leídas una a una y contrastadas con
nuestro código.** 9 de septiembre de 2026. Nada construido: esto es el
diagnóstico y el plan.

Es el quinto estudio sobre Efort. El anterior —«Ganarle a Efort», 1 sep— se
cerró entero (P-01…P-12) y su intel de mercado ha quedado **obsoleta en tres
puntos**: lo que allí figuraba como «anunciado» o «les falta» ya está en
pantalla. Este estudio lo actualiza.

---

## 1. Qué he mirado

`capturas/referencias/efortcoach/` — 21 imágenes:

| Carpeta | Qué enseña |
|---|---|
| raíz | Dashboard del entrenador, Planificación en español, historial de ejercicio |
| `entrenamiento/` | La vista nueva de bloques: semanas en paralelo, series, copiar, opciones |
| `dieta/` | Nutrición entera: estructura, equivalencias, recetas, reparto |
| `graficas/` | Estadísticas: métricas y ejercicios fijados |
| `IMG_2398/2399` | Dos teasers: el rediseño de formularios y las medidas corporales |

Contrastadas contra el repositorio de hoy: `domain/blocks.js`,
`domain/training.js`, `domain/nutrition.js`, `domain/foodEquiv.js`,
`domain/formulario.js`, `domain/portfolio.js`, `domain/today.js`,
`domain/analytics.js`, `domain/sessions.js`, `components/Coach/Workout/*`,
`components/Client/*`, `components/nutrition/*`, `styles/tokens.css`.

---

## 2. Qué ha construido Efort desde el 1 de septiembre

Ocho cosas. Las tres primeras eran «pendientes» o «les falta» en el estudio
anterior.

### 2.1 El Coach Dashboard existe y está en producción

Estaba **anunciado** el 7 de agosto. Ya está. Y no es una copia de nuestro
Inicio: la mitad de su valor está en una pieza que nosotros no tenemos.

- **Pending athletes** — rosco: 23 pendientes de 44.
- **Planning needs**, acotado a «This week · 3–Aug 9»: `New block needed 10`
  y `Block update needed 13`, con barra de proporción.
- **NEW BLOCK FORECAST** — barras de cuatro semanas: *esta* 10, *10–16 ago* 5,
  *17–23 ago* 3, *24–30 ago* 3. **Cuánto trabajo de programación viene
  encima.** Es lo mejor de la pantalla y es lo único de todo el estudio que no
  se le ocurre a nadie mirando su propia app: convierte una bandeja reactiva en
  planificación.
- **Upcoming competitions** con canalón de fecha; la inminente en rojo.
- Fila baja: `6 unanswered chats` · `11 videos to review` · Invitar · Tutoriales.
- Dock de chat abajo a la derecha.

### 2.2 La barra lateral ES la cola

Lo que más me ha impresionado, y no lleva ni un gráfico. Bajo la navegación va
**la lista entera de atletas**, siempre, con dos datos por fila:

```
☑ Abigail Cook        ☐ Amanda Allen
  Week: 4 / 4           Week: 3 / 2
```

- **Casilla** = atendido / pendiente. Los 23 del rosco son las vacías.
- **`Week: 4 / 4`** = por qué microciclo va, de cuántos. `4/4` es «se le acaba
  hoy». `3/2` es «se pasó de lo previsto».

La navegación, la cola y el horizonte son **el mismo objeto**. No hay que ir a
ningún panel para saber a quién le toca.

### 2.3 Nutrición completa, no un adelanto

Pestañas `Foods · Equivalents · Recipes · Nutrition Plans`.

- **Opciones por comida**: «Breakfast» lleva pastillas `Rest Day` / `Training
  Day` / `+ Add option`, renombrables.
- **Equivalencias anidadas dentro de la propia comida**, con la cantidad ya
  escalada: bajo «Whole egg 3 · 180 g» cuelgan «Egg white 19 · 579 g», «Greek
  yogurt 1,5 · 188 g», «Cottage cheese 13 cdas · 266 g». El cliente elige el
  renglón.
- **Grupos de equivalencia como objetos de biblioteca**, con nombre y macros de
  referencia: «Lean Poultry Protein» (pollo, pavo, pollo picado, 114 kcal · P 21
  · C 0 · F 2,5), reutilizable en cualquier plan.
- **Pie de macros por comida** (495 kcal · P 33 · C 30 · F 31 · Fibra 6,7).
- **Panel de objetivos**: barra de energía «2.647 / 2.700 kcal · 53 kcal
  remaining» + tres roscos (Proteína 107 % `+7 %`, Hidratos 94 %, Grasas 95 %)
  con g/g debajo, fibra y micronutrientes plegados.
- **Repartir un plan a varios**: lista con casillas a la izquierda, elegidos
  como chapas arriba a la derecha y, debajo, **las consecuencias por persona**
  —los planes activos de James Anderson, con una chapa roja sobre el que se le
  va a quitar— antes de guardar.

### 2.4 La vista de entrenamiento nueva: las semanas, una al lado de otra

El bloque entero en un lienzo, **las semanas como columnas paralelas** con
desplazamiento horizontal:

```
‹ Blocks
Build Block 1 ···                          [Add to calendar] Workouts│Dashboard
👁 Week 1 · Oct 13–18   ✎ ⧉ 🗑   👁 Week 2 · Oct 20–25    👁 Week 3 · Oct 27–Nov 1
┌ Day 1 · Oct 13 ✎ ⧉ ···┐ ┌ Day 1 · Oct 20 ────────┐ ┌ Day 1 · Oct 27 ────────┐
│ ⠿ 2ct Pause Bench Press│ │ 2ct Pause Bench Press  │ │ 2ct Pause Bench Press  │
│   Secondary Bench Press│ │   Secondary Bench Press│ │                        │
│ │ Ramp 3x4 @6 + 2x4 @5 │ │ │ Ramp 2x4 @6.5 + 3x4x135                         │
│ ⌾  P  WEIGHT REPS RPE  ACTUAL                                                │
│ ▢     ▢      4     4   120 x 4 @4                                            │
│ ▢  ●  ▢      4     5   130 x 4 @5                                            │
│ ●  ●  ▢      4     6   140 x 4 @6                                            │
```

Piezas:

- **Cabecera de semana con ojo** (ocultarla) y, al pasar por encima, lápiz,
  copiar y papelera en rojo.
- **Renglón de notación**: `Ramp 3x4 @6 + 2x4 @5`. Se teclea y describe la
  prescripción entera en una línea.
- **Columna `⌾`** — pedirle el vídeo *de esa serie*.
- **Columna `P`** — prioridad de la serie: disco ámbar o rojo. Le dice al
  atleta cuál es la serie que importa.
- **Columna `ACTUAL`** anclada a la derecha: la verdad.
- **Copiar series** entre ejercicios y **copiar ejercicio** entero.
- **Barra flotante** abajo a la izquierda del lienzo: copiar · plegar · `All ∨`.
- Subtítulo por ejercicio con su **papel** («Secondary Bench Press»).

### 2.5 Bloques dentro de macrociclos

`Meet Macro (3)` · `Build Macro 2 (2)` · `Build Macro (2)` · `Develop Macro (2)`.
Cada bloque, una tarjeta con nombre, fecha y **una barra segmentada = sus
semanas**, rellenas las hechas. Un punto marca el que está puesto.

### 2.6 Estadísticas con ejercicios fijados

Métricas: **1RM estimado · Stress Index · Porcentaje de intensidad**. Y un
buscador para **fijar ejercicios favoritos en la barra superior**: qué levanta
uno le sigue a esta persona.

Y **ejercicios enlazados** (chapas con icono de cadena, arrastrables):
Competition Squat, Platz Squat, Zercher Squat, Leg Press…

### 2.7 El historial del ejercicio, en el móvil de quien entrena

Línea de tiempo con canalón de fecha:

```
MAY   Week 3 · Meet Block 2 · Day 4
 23   227.5 x 2 @7 · 242.5 x 2 @7 · 195 x 4 @3 · 195 x 4 @3
MAY   Week 2 · Meet Block 2 · Day 4
 16   217.5 x 2 @6 · 230 x 2 @6 · 190 x 4 @3 …
```

Su pie: *«Athletes can check previous performance while training.»*

### 2.8 Y lo que viene: formularios con medidas y fotos

Dos teasers de esta semana. El selector de tipo de pregunta:

- **Questions** — Text answer · Single choice · Multiple choice · Linear scale ·
  File upload
- **Progress tracking** — **Bodyweight · Body measurements · Progress photos**
- **Layout** — Section

Y una **guía de medición** con figura numerada (cuello, hombros, pecho, cintura,
cadera, muslo, gemelo), condiciones escritas por punto y lados L/R.

> Esto cierra tres de los cinco «les falta» del estudio anterior: fotos de
> progreso, medidas y formularios de verdad. **La ventana estructural se está
> estrechando y hay que dejar de contarla como ventaja.**

---

## 3. Lo que las capturas revelan de su modelo (y del nuestro)

Aquí está la conclusión más importante del estudio, y no es un hueco: es una
ventaja nuestra que **no se ve en ninguna pantalla**.

### Su modelo duplica la semana

Mira otra vez la 2.4. Semana 1 dice `Ramp 3x4 @6 + 2x4 @5`; semana 2 dice
`Ramp 2x4 @6.5 + 3x4x135`. Son **dos textos independientes**. Cambiar el press
de banca en las cuatro semanas es tocarlo cuatro veces.

Por eso su producto está lleno de herramientas de copiar: copiar series, copiar
ejercicio, copiar día, copiar semana, la barra flotante de copiar. **Todo ese
utillaje existe porque el modelo obliga a repetirse.**

### El nuestro no

`domain/blocks.js` ya tiene otra cosa:

```
block.sessions       la hoja se escribe UNA vez, en el bloque
buildOverride()      y se varía por tramo de semanas
overrideSpan()       «M2 a M4»
applyOverrides()     resuelve la semana que se pide
promoteOverrideIn()  un cambio puntual asciende a norma
```

`planOfDay(program, semana, dia)` devuelve la hoja resuelta de cualquier semana.
El plan sube al bloque y las semanas son variaciones fechadas.

**Ese es el modelo bueno, y no lo enseña ninguna pantalla.** `ConjuntoDelBloque`
enseña todas las *hojas* del bloque; `TiraDelPrograma` enseña los microciclos
como pastillas. Nada pone la semana 1, la 2 y la 3 de la *misma* hoja una al
lado de otra —que es como se lee una progresión y es lo que Efort acaba de
sacar—.

> **La captura que Efort no puede hacer**: cuatro columnas de semanas donde
> tocar la 3ª pregunta «¿solo esta, o de aquí en adelante?» y las columnas que
> comparten pauta se ven compartiéndola. Ellos necesitan cuatro ediciones; a
> nosotros nos cuesta un gesto. Enseñarlo es, a la vez, el mejor movimiento de
> producto y el mejor material de marketing que hay en este estudio.

---

## 4. Los huecos verificados — funcionalidad

Doce, todos comprobados en el código, no supuestos.

| # | Hueco | Estado hoy |
|---|---|---|
| **G-01** | **La barra no es la cola.** | `CoachLayout.jsx` lleva recientes + `ClientSwitcher`. No hay lista completa con estado ni «M3 de 6» por fila. |
| **G-02** | **No hay cola «se le acaba el bloque».** | `COLAS_INICIO` tiene *Por revisar, Sin leer, Sin programar, Sin señales, Cobros*. «Sin programar» solo caza *sin rutina o sin empezar*. `horizonteDeBloque()` existe y da `restantes`, pero la cartera se alimenta de `trainingSummary` —`{microcycleCount, sessionCount, lastTraining, recentSessions}`— que **no lo lleva**. Sin eso no hay agregado posible. |
| **G-03** | **No hay previsión de trabajo.** | Nada equivalente al *New block forecast*. Depende de G-02. |
| **G-04** | **Las semanas no se ven juntas.** | Ver §3. |
| **G-05** | **No se le puede pedir el vídeo a una serie.** | `emptySet()` = `{kg, reps, rir, targetKg, targetReps, targetRir}`. Ni cámara ni prioridad. Y el vídeo del producto es un **enlace** de YouTube/Loom (`domain/video.js`, por seguridad del iframe): no hay subida desde el cliente. |
| **G-06** | **El atleta no ve su historial del ejercicio.** | `FichaEjercicioCliente.jsx` = vídeo + pautas + catálogo. `HistorialPopup` es historial **de bloques**. El entrenador sí tiene el fantasma «la vez pasada» (`resumenDeEntrada`, P-09); quien entrena, no. |
| **G-07** | **No hay notación escrita de la pauta.** | Existe importación (`routineSheet`, `parseDietSheet`), no escritura taquigráfica sobre el ejercicio. |
| **G-08** | **No se copian series de un ejercicio a otro.** | Hay `cloneExerciseAsTemplate`, `cloneDays`, `ImportDayDialog` y `CopyToClientPanel` (cliente→cliente). Falta el gesto pequeño y en sitio. |
| **G-09** | **Un plan no se reparte a varios.** | `envios.js` **ya tiene** el carril de audiencias (marcados · etiqueta · protocolo · tramo · todos, hasta 60) y se usa para formularios y encargos. La dieta y el bloque no viajan por él. Y no hay vista previa de consecuencias por persona. |
| **G-10** | **Las equivalencias no se guardan como grupo.** | `equivalencesFor()` las **calcula** (mejor que las suyas, ver §5). No hay grupo con nombre reutilizable —aunque `platos.js` ya demuestra la forma—. Y las opciones de comida están **numeradas, no nombradas**. |
| **G-11** | **No hay canal de conversación.** | Ninguno. Hoy esa conversación pasa en WhatsApp, o sea fuera del producto. |
| **G-12** | **No hay 1RM estimado ni intensidad.** | `METRICS` = peso, % graso, kcal, tonelaje, series efectivas, adherencia, cintura, % kcal en proteína. Ni e1RM ni % de intensidad ni ejercicios fijados. |

---

## 5. Dónde estamos por delante (y no hay que soltarlo)

Contrastado, no de memoria:

1. **El modelo de bloque con overrides.** §3. Estructuralmente superior.
2. **Las equivalencias calculadas.** `foodEquiv.js` no iguala el macro clavado:
   busca la ración que menos desvía macro *y* kcal a la vez, con el macro
   pesando el doble, y descarta lo que dispara las calorías. Las de Efort son
   listas escritas a mano. La nuestra acierta sin configurar nada; la suya deja
   elegir. **No son excluyentes** (ver M-11).
3. **Los formularios del oficio.** `TIPOS` con `fam:'oficio'` ya tiene peso,
   **perímetros, pliegues** y fotos, con guía, y con la promesa que Efort aún no
   hace: *la respuesta aterriza donde vive ese dato* (antropometría, archivo de
   fotos), no se queda en el formulario. Los pliegues no los tienen.
4. **La escala se vuelve serie.** Su *Linear scale* es una respuesta; la nuestra
   es una serie que se sigue en el tiempo.
5. **La otra mitad de la asesoría**: antropometría, archivo de fotos, agenda,
   cobros, portal sin instalar, «Ver como», el ritual de revisión con veredicto,
   protocolos y envíos, modo offline, copia y restauración.
6. **El sistema visual.** Una ley del color escrita, un acento elegido por
   contraste (6,2:1), tokens sin literales, tema noche, cifras tabulares,
   `prefers-reduced-motion`. El suyo es correcto pero no está gobernado.

---

## 6. Los huecos verificados — diseño

Ocho préstamos baratos. Ninguno toca el esquema.

- **D-01 · La cabecera de tarjeta.** Chip de icono redondeado + rótulo
  troquelado en tinta apagada + **alcance alineado a la derecha** («This week ·
  3–Aug 9»). Nuestro `.section-label` tiene la mitad. El alcance a la derecha es
  lo que hace que una tarjeta diga *sobre qué periodo* habla sin gastar una
  línea.
- **D-02 · El renglón de serie como pastilla.** Fondo gris muy claro,
  redondeado, sin filetes, con aire vertical. A su densidad se lee mejor que una
  tabla con reglas. Contrastar contra nuestra `.plan-rejilla`.
- **D-03 · La columna de la verdad, anclada a la derecha.** `ACTUAL` cierra el
  renglón. El ojo baja por objetivos y encuentra siempre lo que pasó en el mismo
  sitio.
- **D-04 · Mandos que aparecen al pasar por encima** en cabeceras de semana y de
  día, con la papelera en rojo *solo ahí*. Ya lo hacemos en la cartera (P-06):
  falta subirlo a doctrina.
- **D-05 · La barra flotante del lienzo** (copiar · plegar · filtrar), pegada
  abajo a la izquierda y siempre alcanzable. Nuestros mandos de vista viven en
  la cabecera y se pierden al bajar.
- **D-06 · La tarjeta de bloque con sus semanas como barra segmentada.** Nombre,
  fecha, y las semanas dibujadas con las hechas rellenas. Compacto y honesto.
- **D-07 · Cabeceras de columna de dos letras** (`CM`, `P`) para micromandos.
  Cuesta 24 px y da dos afordancias por serie.
- **D-08 · Cada complejidad nueva viene con su interruptor.** Su pantalla de
  ajustes es una lista de *show / hide*: prioridad de serie, panel del bloque,
  vista por defecto, kcal y macros, vista vieja/nueva. Tenemos densidad
  (P-07); no lo tenemos como doctrina.

---

## 7. Lo que NO hay que copiar

Cinco. Importa tanto como lo anterior.

1. **El utillaje de copiar.** Es el síntoma de su modelo, no una virtud. Añadir
   «copiar semana» a nuestro producto sería importar su problema. (La excepción
   es G-08, que es otra cosa: copiar la *pauta* entre dos ejercicios distintos.)
2. **El macrociclo como carpeta.** Agrupar bloques en carpetas rompe la línea
   del tiempo, y esa decisión ya está tomada y escrita en `ListaDeBloques.jsx`:
   la intención va como chapa en la fila y el agrupado es un conmutador
   opcional. Se queda.
3. **Las métricas de powerlifting a pelo.** 1RM estimado, Stress Index y % de
   intensidad son de su nicho declarado. Un entrenador de asesoría general
   entrena a gente que no tiene 1RM. Si entra el e1RM, entra **por ejercicio y
   solo donde hay datos para calcularlo**, nunca como columna fija.
4. **«Pending athletes: 23».** Una cifra grande de pendientes sin verbo es un
   reproche. Nuestra ley es cola-con-verbo y *sin reproches*
   (`estudio-casa-encendida`). El dato es bueno; la forma, no.
5. **El cromo de alta permanente.** «Invite athletes» y «Open tutorials» ocupan
   un tercio de su panel para siempre. Eso es `GettingStarted`, y el nuestro ya
   sabe apagarse.

---

## 8. El plan

Catorce movimientos, tres tandas, un cambio visible cada vez.

### Tanda 1 — enseñar lo que ya tenemos *(sin esquema nuevo)*

- **M-01 · La barra es la cola.** La lista completa de clientes en la barra, con
  disco de estado y `M3 de 6` bajo el nombre. `CoachLayout` ya llama a
  `buildPortfolio` y `colasDeInicio`: los datos están cargados. Plegar y
  recientes siguen funcionando.
- **M-02 · «Se le acaba».** `trainingSummary()` pasa a llevar
  `{semanasRestantes, bloqueAbierto, previstas}` —se calcula en `AppContext`
  con el programa entero delante, que es donde ya se llama—. Con eso: cola
  nueva en `COLAS_INICIO` con su verbo («Montar el siguiente») y la columna de
  la cartera.
- **M-03 · La previsión de cuatro semanas.** Cuántos se quedan sin programa
  esta semana, la que viene y las dos siguientes. Es lo mejor de su panel y sale
  entero de M-02.
- **M-04 · Su historial del ejercicio, en el móvil.** `FichaEjercicioCliente`
  gana «Lo que has hecho»: la lista cronológica de ese ejercicio con su bloque,
  su microciclo y su día. Sale de `executedSessions` + `resumenDeEntrada`, ya
  escritas y probadas. Respeta *el móvil ejecuta*: es lectura, no planificación.
- **M-05 · La cabecera de tarjeta con alcance.** D-01, en el primitivo. Barre
  toda la casa de una vez.

### Tanda 2 — las semanas y la serie

- **M-06 · Las semanas, una al lado de otra.** *El movimiento del estudio.*
  Una disposición nueva en `ConjuntoDelBloque`: en vez de «todas las hojas del
  bloque», **una hoja a lo largo de sus microciclos**, columnas = semanas,
  resueltas con `planOfDay`/`applyOverrides`, con lo ejecutado debajo de cada
  pauta. Editar una columna pregunta *«solo este microciclo, o de aquí en
  adelante»* y crea el `override` con su `span`; las columnas que comparten
  pauta se ven compartiéndola. **Es la pantalla que ellos no pueden hacer.**
- **M-07 · Pedirle el vídeo a una serie.** `emptySet` gana `pideVideo`; columna
  de cámara en la rejilla; marca en la hoja del cliente; la entrega cae en la
  bandeja de revisión, que ya existe. **La subida no es capacidad nueva**: ya
  subimos imágenes desde el cliente a Supabase Storage con URL firmada y RLS de
  solo-inserción (`ClientGymUpload`, `useProgressPhotos`, política 0079). Un
  vídeo es la misma forma con otro peso: hay que decidir tope de tamaño y
  caducidad, no arquitectura.
- **M-08 · Copiar la pauta de un ejercicio a otro.** El gesto pequeño de G-08,
  dentro de la hoja.
- **M-09 · La tarjeta de bloque con sus semanas.** D-06, en `ListaDeBloques`.

### Tanda 3 — la dieta y el reparto

- **M-10 · La tanda 1 del estudio de dieta** (`replanteamiento-dieta-por-macros.md`,
  D-01…D-05). Las capturas de Efort **confirman ese diagnóstico** y añaden el
  contenido exacto del costado: barra de energía con lo que queda, tres roscos
  con % y g/g, fibra, micros plegados. Ya tenemos `kcalSeries`,
  `macroShareSeries` y `macroShareBands` escritas, probadas y **con cero usos en
  la interfaz**.
- **M-11 · Grupos de equivalencia con nombre.** La forma ya está en `platos.js`.
  El cálculo se queda como está y manda por defecto; el grupo guardado es la
  opinión del entrenador cuando la tiene. Y **las opciones de comida se
  nombran** («Días de entreno», «Sin lactosa») en vez de numerarse.
- **M-12 · Un plan, muchos clientes.** La dieta y el bloque suben al carril de
  `envios.js`, que ya sabe decir a quién. Con **vista previa de consecuencias
  por persona** antes de guardar —lo mejor de su pantalla de reparto—.
- **M-13 · El interruptor de cada complejidad.** D-08 como doctrina escrita
  junto a LA REGLA en `tokens.css`, y `useCoachPrefs` como su casa.
- **M-14 · La pieza de marketing.** M-06 grabado: cuatro columnas de semanas,
  un cambio, «de aquí en adelante», y las cuatro se actualizan. Frente a la
  alternativa: hacerlo cuatro veces. *Un cambio, cuatro semanas.*

---

## 9. Lo que hay que decidir antes de construir

1. **¿La barra pasa a lista completa (M-01)?** Con 40 clientes son 40 filas
   siempre presentes. Efort lo resuelve con buscador y filtro dentro de la
   barra. Alternativa: los que *tienen algo* arriba y el resto plegado.
   **Recomiendo la lista completa con buscador**: su valor es precisamente que
   no hay que ir a mirar.
2. **¿Entra la prioridad de serie?** Es un lenguaje visual nuevo (discos por
   serie) para algo que en parte ya decimos con `tecnica`/`rematesDe`. **No lo
   he metido en el plan** a propósito. Si entra, entra apagado de fábrica.
3. **El vídeo por serie (M-07): ¿enlace o subida?** El enlace funciona hoy y no
   añade coste ni riesgo; la subida es el flujo real de un gimnasio. Ya tenemos
   el camino para imágenes. **Recomiendo subida**, con tope de tamaño y
   caducidad decididos de antemano.
4. **¿Entra un canal de conversación (G-11)?** Es la decisión más grande del
   estudio y no es de diseño. Hoy esa conversación vive en WhatsApp, o sea que
   la asesoría *no* está entera dentro del producto, que es justo lo que dice el
   posicionamiento. No lo he puesto en el plan porque no es un movimiento: es
   una fase.
5. **¿e1RM, sí o no?** Solo por ejercicio, solo donde hay series con carga y
   repeticiones suficientes para calcularlo, y nunca como columna fija. Si no se
   puede prometer eso, no entra.
6. **¿Tanda 1 sola, y luego decides?** Es la que no toca el esquema, sale casi
   entera de dominio ya escrito y ya cambia la mañana del lunes.
