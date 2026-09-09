# Replanteamiento de Alimentos y Ejercicios

> **Estado**: las **tandas 1 y 2 están CONSTRUIDAS** (8 sep, migraciones 0100 y
> 0102). Sin commitear. La tanda 3 espera veredicto.
>
> **De la tanda 4 se ha hecho la mitad** (9 sep, migración `0104`): las cuatro
> del envase —fibra, azúcares, saturadas y sal— están **sembradas en los 264
> alimentos del catálogo**, con la misma fuente y fidelidad que los macros que ya
> escribieron la 0033 y la 0096 (valores típicos por 100 g, redondeados). Se hizo
> porque el dueño vio lo que §6 no previó: la ficha enseña la etiqueta entera y
> **todos los alimentos la enseñaban con cuatro guiones**.
>
> Lo que la pregunta de licencia de §6.6 aplazaba —y **sigue aplazando**— es el
> **nivel 2**: hierro, calcio, B12, vitamina D. Eso sí exige volcar una tabla de
> composición entera y no se toca sin resolverla.
>
> **Y el 9 sep se corrigió la Librería en cinco puntos más**, todos por queja del
> dueño: el menú de «Categoría» no se podía pulsar (el `overflow` del `.rail`
> recortaba el popover), **lo tuyo no se podía editar** —ni el nombre, ni el
> músculo, ni la categoría, que ni existía en `foods`: migración `0103`—, y
> salieron de la pantalla el **material**, **«con qué se cambia»** y la **curva
> de carga**. Las alternativas del PLAN, en la hoja del cliente, no se tocan.
>
> Las decisiones 2, 3, 6 y 7 se han tomado **con la opción recomendada**, igual
> que se hizo con la 1 y la 5 en la tanda anterior: los platos en preferencias
> (2a), como tramo de `/plantillas` (3), solo el nivel 1 de micros (6) y
> congelados en la entrada de la dieta (7). Están construidas así y se pueden
> revisar; lo que cuesta cambiarlas se dice en cada apartado.
>
> **Lo único de la tanda 2 que NO se ha construido** es la segunda mitad de
> `E-04` —cruzar las alternativas con el álbum del gimnasio del cliente— y el
> motivo está en §4.5.
>
> **Probado con datos reales** el 8 sep (Supabase local + demo + Playwright con
> sesión, cliente Javier Ortega). Salieron **tres fallos, los tres arreglados**:
> el alta de un alimento guardaba los macros en cero —dos escrituras y la
> segunda pisaba a la primera—; un plato solo aparecía en el buscador si ya
> sabías su nombre; y `upsertLibraryFood` habría borrado etiquetas y nota al
> corregir los gramos desde el lápiz de una dieta. Ver §10.
>
> **Y las dos pantallas se han fundido en una**, por decisión del dueño: ya no
> hay `/ejercicios` y `/alimentos` como puertas separadas, sino **Librería** con
> dos tramos. Ver §11.
>
> **El encargo**, en palabras del dueño (8 sep): *«Alimentos no es más que una
> lista, ni siquiera se puede editar, no se pueden crear combinaciones de
> alimentos, no se pueden crear recetas, no se puede modificar nada, no le veo
> utilidad tal y como está. Similar el caso de entrenamiento: la idea principal
> era poder tener anotaciones y vídeo del entrenador para los ejercicios, de
> forma que el cliente pudiese verlos y tuviese información al respecto, pero
> siento que se pueden pulir las cosas.»*

---

## 1. El resumen, por si no se lee lo demás

Las dos pantallas fallan por motivos **distintos**, y esto es lo que cambia el
plan:

- **Alimentos** falla por dentro: es un inventario de solo lectura de una cosa
  que además **no es la unidad con la que se prescribe**. Nadie pauta «avena»:
  pauta *80 g de avena con 200 ml de leche y un plátano*. Falta el objeto.
- **Ejercicios** no falla por dentro —es el mejor panel del Taller, con ficha en
  dos capas y edición real—. Falla porque **lo que guardas ahí no sale de ahí**:
  el vídeo y la clave que el encargo pedía «para que el cliente pudiese verlos»
  **no llegan al cliente**. Ni al programar. Están escritos y no se leen en
  ningún sitio del producto.

Y hay una **asimetría del modelo** que dicta las dos soluciones y que conviene
tener delante antes de decidir nada:

| | Cómo llega al cliente |
|---|---|
| **Entreno** | El plan guarda un **nombre** (`{name, muscle, sets}`) y la ficha se busca por ese nombre. **Referencia.** |
| **Dieta** | La entrada guarda una **copia congelada** (nombre, gramos y los tres macros). **Valor.** |

Por eso el vídeo del ejercicio **no se puede congelar en el plan** (sería mil
copias del mismo hecho, el error que evitaron la 0033 y la 0094) y la nota de
compra de un alimento **sí se congela** (el resto de la fila ya está congelada;
un campo vivo en una fila muerta es la incoherencia).

---

## 2. Qué hay hoy, comprobado

### 2.1 Alimentos (`AlimentosPanel.jsx`, 202 líneas)

Una tabla de solo lectura: nombre, kcal/100 g, los tres macros, unidad natural,
etiquetas y una chapa «Tuyo». Buscador, tres tramos (Todos · Tuyos · Del
catálogo) y filtro por categoría. **No hay acción primaria, no hay ficha, no hay
lápiz, no hay alta.** Es la única pantalla del Taller sin un solo verbo.

**Y sí se puede editar un alimento — en el único sitio que no es este.** El
lápiz vive en la fila de la dieta de un cliente (`MealCard` → `FoodDialog`,
línea 284), con la regla de `canEditLibraryItem`. Es decir: la pantalla de la
biblioteca es el único lugar del producto donde la biblioteca no se corrige.
Está del revés.

**Lo que la doctrina congela.** `canEditLibraryItem` devuelve `false` para todo
nombre que esté en el catálogo, y el catálogo son 179 alimentos más la despensa
española de la 0096. Para tener los macros de tu marca hay que dar de alta *otro
alimento* con otro nombre («Pan integral Bimbo»). La regla es defendible y está
bien argumentada en `catalog.js`; el problema es que **la pantalla no la dice**:
una fila congelada es idéntica a una editable y no hay ningún gesto que salga de
ahí.

**Consecuencia que ya está pasando**: el camino de crecimiento de la biblioteca
*es* la duplicación, y no hay ninguna herramienta para limpiarla.
`foodMatch.js` —que ata nombres con tres respuestas honestas— existe, está
probado, y solo se usa importando dietas.

**Tres huecos más, comprobados:**

- **`foods` no tiene columna `tags`** (`mapLibraryFoodFromDb` lo dice: «la
  biblioteca no tiene la columna y aquí llega la lista vacía»). Las etiquetas
  son del catálogo y se buscan por nombre. Traducción: **un alimento que das de
  alta tú nunca puede declarar que lleva gluten**, y por tanto `foodConflicts`
  —el aviso pasivo contra los condicionantes del cliente— **nunca se dispara en
  tus alimentos**. Y tus alimentos son precisamente las marcas y los
  suplementos, que es donde el alérgeno importa.
- **«Se parece a»** y **«en cuántas dietas se usa»** están prometidos en
  `replanteamiento-del-taller.md` §7 y no se construyeron.
- **Las equivalencias** (`foodEquiv.js`, la mejor pieza de nutrición que hay)
  solo existen dentro de una dieta abierta. Como material propio, no se ven.

### 2.2 Ejercicios (`EjerciciosPanel.jsx` 350 + `FichaEjercicio.jsx` 243)

Esta pantalla está bien: banco de dos planos con el corte medido en 1560 px,
lista mezclada con `mergeCatalog`, ficha en dos capas («Del catálogo», que no se
toca, y «Lo tuyo»: vídeo, clave y alternativas), alta nueva, y la regla de
equipo respetada con un aviso cuando la fila es de un compañero. Se guarda de
verdad (`saveExerciseSheet`, migración 0098).

**Y no sirve para nada todavía, porque nadie lee lo que guarda.**

`videoUrl` y `cue` aparecen en exactamente cuatro sitios del repositorio:
`FichaEjercicio.jsx`, `EjerciciosPanel.jsx`, `useLibraries.js` (los escribe) y
`mappers.js` (los traduce). **Cero consumidores.** El portal del cliente no los
pinta, la hoja del entrenador no los pinta, el compositor no los pinta.

El único vídeo que ve un cliente es `client.youtubeExplanationUrl`
(`ClientRoutine.jsx:1029`): **uno solo para la rutina entera**, de antes de todo
esto.

**Y hay un bloqueo estructural, no solo de interfaz.** Las políticas de
`exercises` son de equipo (`exercises_team_read`, 0027): **una sesión de cliente
no puede leer la biblioteca**. Aunque mañana se pintara la marca en el renglón,
no habría dato al otro lado.

**Cuatro roces más, comprobados:**

- **La cabecera de `FichaEjercicio` promete un módulo que no existe.** Dice que
  el vídeo se ve «solo si tiene encendido el módulo `videos` de su protocolo».
  `MODULES` en `protocol.js` son seis y ninguno es `videos`: `warmup`,
  `coachNote`, `clientNote`, `sessionFeedback`, `rir`, `dietSwaps`. Es una
  discrepancia entre documentación y código y hay que resolverla en un sentido
  o en otro (§4.4).
- **Dos «alternativas» con el mismo nombre y sin puente.** Las de la biblioteca
  (`exercises.alternatives`, tu criterio por defecto) y las del plan
  (`exercise.alternatives`, tope 3, viajan con la plantilla y la herencia del
  bloque). Programar no rellena nada desde la biblioteca: **se escriben dos
  veces**.
- **No hay puerta a la ficha desde la hoja.** `AddExerciseForm` (167 líneas) no
  menciona vídeo ni clave. El momento en que te das cuenta de que este ejercicio
  necesita tu explicación es mientras lo programas, y ahí no hay puerta.
- **`equipment.js`** (las fotos de la maquinaria del gimnasio del cliente,
  ordenadas por grupo muscular) y el `equipment` de la ficha no se cruzan nunca,
  aunque el documento del Taller decía que sí.

### 2.3 Lo que se puede contar y lo que no

Las dos pantallas quieren decir «cuánto uso esto», y la respuesta es distinta:

- **Alimentos: sí, gratis.** `AppContext.jsx:982` carga `nutrition_plans` de
  **todos** los clientes al arrancar. Contar en cuántas dietas aparece un
  alimento es un `useMemo` sobre datos que ya están en memoria.
- **Ejercicios: no.** Cuando la 0024 está aplicada y nadie tiene registros
  heredados, los programas **no se descargan**: se pide `training_summaries`,
  que devuelve `{last_training, session_count, microcycle_count, has_legacy,
  recent_sessions}` y **ningún nombre de ejercicio**. El «lo llevan 18 clientes»
  del boceto original exige una RPC nueva. Va a la tanda 3, con su precio dicho.

---

## 3. El concepto

Tres leyes. La primera es la que arregla ejercicios, la tercera la que arregla
alimentos, y la segunda es la que explica por qué las dos pantallas existen.

### Ley 1 · Lo que guardas se ve donde se usa

Un vídeo que solo existe en el Taller no existe. Una clave que no llega al
gimnasio no es una clave. Todo lo que se cura en estas pantallas tiene **dos
destinos obligatorios**: el momento de programar y el móvil del cliente. Si no
llega a ninguno de los dos, no se construye.

### Ley 2 · El Taller no es un almacén: es donde se cura

`EjerciciosPanel` ya lo tiene escrito en su cabecera («lo que esta pantalla da
es lo otro, que un buscador no puede dar: **curar**») y `AlimentosPanel` lo
incumple entero. Curar quiere decir: **la pantalla de la biblioteca es el mejor
sitio para corregirla**, y además sabe decir **qué te falta por curar**. Un
inventario contesta «qué tengo»; un taller contesta «qué me queda por hacer».

### Ley 3 · La unidad de la dieta es la ración, no el alimento

Nadie pauta «avena». Se pauta *80 g de avena con 200 ml de leche y un plátano*,
y eso tiene nombre propio: «mi desayuno de definición». El producto ya sabe esto
del lado del entreno —una **pieza** es un día guardado, y tiene su vitrina en
`/plantillas`— y no lo sabe del lado de la dieta. Lo que falta en nutrición es
el gemelo de la pieza.

Un alimento es a una dieta lo que un ejercicio es a una rutina. **Un plato es a
una dieta lo que una plantilla es a un bloque.** Ese es el objeto que falta, y
es la respuesta a «combinaciones» y «recetas» sin construir un recetario.

### Y lo que NO se hace, para que el concepto tenga borde

- **No hay recetario.** Los 1.100 platos de Coachway son **dato, no código**, y
  su generador decide por ti. Aquí el plato es **tuyo**: lo guardas de una dieta
  que ya montaste. La app resalta y calcula; no propone menús.
- **No hay generador de días de dieta.** Ver la ley de la casa: la app no
  receta.
- **No se sube vídeo.** Enlace, como está decidido (0098): subir es
  almacenamiento, moderación y copias a cambio de nada que un enlace no dé.
- **No hay foto del plato ni escáner de códigos de barras.** Eso es un producto
  de registro del cliente, y es otra fase.
- **No se fusionan filas de biblioteca.** Ver §5.3: la fusión es la operación
  destructiva sin inverso, y hay una versión honesta que no la necesita.
- **No hay objetivo de micronutriente.** Ni CDR, ni porcentaje, ni semáforo:
  sería diagnosticar. Ver §6.3, que es la parte del bloque de micros que no
  se negocia.

---

## 4. Ejercicios: cerrar el bucle

La pantalla no se rediseña. Se **conecta**. Cinco movimientos, y el primero es
literalmente el encargo original.

### 4.1 · E-01 · La cadenita junto al nombre, y una sola puerta detrás

> Corregido en la 2ª vuelta, por orden del dueño: *«me gustaba que el ejercicio
> al lado del nombre tuviese una cadenita o algo así de link y te llevase, y que
> tuviese unas pautas que el cliente si quiere y existen puede verlas.»*

La primera versión de este movimiento ponía **tres cosas en la misma línea** —el
▶, la clave impresa y las alternativas—. Tres elementos compitiendo en 390 px,
que es el ancho real donde esto se usa. Una marca junto al nombre y todo detrás
es **un gesto en vez de tres**.

```
  ③  Press banca  🔗                                         [ 62,5 ] [ 8 ]
     Pecho · descanso 90 s · si está ocupada: Press mancuernas

  ④  Aperturas en polea  ❝                                   [  15  ] [ 12 ]
     Pecho · descanso 60 s

  ⑤  Fondos en paralelas                                     [ +10  ] [ 10 ]
     Pecho · descanso 90 s          ← el renglón de hoy, intacto
```

**La marca dice qué hay detrás**, con el vocabulario que la app ya tiene en la
columna «Lo tuyo» del Taller (`ej-marcas`):

- hay vídeo → **cadena** (`Link2`). Es el glifo correcto: promete algo que está
  fuera.
- solo pautas → **comillas** (`Quote`), el mismo con el que la app ya rotula
  «Nota de X».
- ni una cosa ni otra → **no se pinta marca**.
- **Nunca las dos a la vez**: dos glifos por fila es el ruido que se evita.

**Las dos mitades del encargo, resueltas por separado:**

- *«si existen»* — sin vídeo y sin pautas no hay marca. Cero promesa vacía.
- *«si quiere»* — nada se abre solo y **el renglón no crece**. Quien no la toca
  ve la pantalla de hoy.

**Detrás: la ficha del ejercicio como la ve el cliente.** Un `Modal` con el
nombre por título y, en este orden: el vídeo (`VideoEmbed`, que **no monta el
iframe hasta que se pulsa** — medio mega y las cookies de YouTube solo los paga
quien mira), **tus pautas**, y qué es (la `description` del catálogo, si la hay).

**Lo que NO entra en la ficha: las alternativas.** Ya se imprimen en el renglón,
y ahí es donde hacen falta —delante de la máquina ocupada, sin abrir nada—. Un
hecho, un sitio.

En la hoja del entrenador **no se pinta nada**. Esa orden sigue en pie: ni
miniaturas ni fotos en las hojas.

#### El precio, medido

`.exercise-name` son **208 px fijos que no encogen** (`flex-shrink: 0`), así que
un glifo de 15 px con su calle de 6 se come 21 px del nombre — y ahí ya trunca
«Extensión de cuádriceps en máquina». Lo pagan **solo las filas que tienen
ficha**, y el nombre completo sigue en el `title`. La alternativa —el glifo en la
línea del músculo— no se toma porque el encargo dice «al lado del nombre», y
tiene razón: es donde se busca.

#### Y un detalle que no es cosmético

`.exercise-name > .name` trunca con `text-overflow: ellipsis`, así que una marca
metida **dentro de ese mismo elemento se recorta con el texto**. Tiene que ser
hermana: `.name` pasa a ser fila —el texto trunca, la marca no encoge—.

### 4.2 · E-01b · «Clave» o «pautas»: una cosa, un nombre

El campo se llama **«Tu clave»** en la ficha del entrenador. Si al cliente le
llega como **«las pautas de tu entrenador»**, la misma cosa tiene dos nombres en
el mismo producto, y la ley de la casa dice que una cosa conserva el suyo en todo
el flujo («el botón *Publicar* produce un aviso *Publicado*»).

**Recomendación: «pautas» en los dos lados.** Es la palabra que usa el dueño y la
que un cliente entiende sin pensar; «clave» es jerga de gimnasio que además ya
significa otra cosa en una aplicación. Cambio de etiqueta y nada más: la columna
se sigue llamando `cue`, sin migración.

### 4.3 · E-02 · Cómo llega la ficha al portal (la decisión de verdad)

Hay tres caminos y solo uno respeta el modelo:

**(a) Congelar el vídeo y la clave en el plan al programar.**
Cero migración, cero RLS. Y **se descarta**: reparte mil copias del mismo hecho
—el error exacto que evitaron la 0033 y la 0094— y, sobre todo, corregir un
enlace roto no lo corrige en los clientes que ya lo tienen puesto. Un plan con
un enlace muerto que no se puede arreglar desde ningún sitio.

**(b) Ensanchar las políticas de `exercises` para que el cliente lea la
biblioteca de su equipo.**
Una política y ya está. Pero le entrega a **cada cliente la biblioteca entera**:
trescientos nombres y todas tus claves técnicas, incluidas las de ejercicios que
no entrena. Barato y un poco mal.

**(c) Una RPC dirigida. ← recomendada.**
`exercise_sheets()`: para el cliente que llama, devuelve
`{name, video_url, cue, alternatives}` **solo de los ejercicios que aparecen en
su propio plan**. `SECURITY DEFINER`, con la regla de la 0069 (las funciones
nacen cerradas: `REVOKE ALL` y `GRANT EXECUTE TO authenticated`).

- Una sola fuente de verdad: corriges el enlace y queda corregido para todos.
- Exposición mínima: entre veinte y cuarenta filas, las suyas.
- Precio: **una petición más al abrir el portal**, y una función que hay que
  probar con `npm run test:db`.

Es la misma forma de resolver que ya usa `training_summaries`: cuando lo que
hace falta es un recorte del dato y no el dato, se pide al servidor.

### 4.4 · E-03 · El módulo `videos`: no se añade, se corrige el comentario

La cabecera de `FichaEjercicio` promete un interruptor que no existe. Las dos
salidas son escribir el módulo o borrar la frase, y **la recomendación es
borrar la frase**:

- El interruptor **ya existe y es el enlace**: un ejercicio sin vídeo no enseña
  nada. Un módulo que significa «enseñar lo que ya has decidido escribir» es un
  interruptor para nada.
- Y sería peor que nada: en `protocol.js` **todo nace apagado** («una aplicación
  que llega con todo encendido obliga a apagar»). O sea que el entrenador que
  acaba de pegar su vídeo seguiría sin verlo en el móvil del cliente y no
  sabría por qué. Es el peor resultado posible de los tres.

`MODULES` es una lista que el entrenador tiene que entender entera. Cada entrada
nueva la encarece.

### 4.5 · E-04 · Las alternativas, escritas una sola vez

Al añadir un ejercicio a una hoja, `exercise.alternatives` **se rellena con las
de tu biblioteca** —tu criterio por defecto— y se puede tocar para este cliente.
Siguen viviendo en el plan (son plan: viajan con la plantilla, con la herencia y
con la copia entre clientes); lo que cambia es de dónde salen la primera vez.

> **Construida la herencia; el cruce con el gimnasio, NO.** Al añadir un
> ejercicio a una hoja, `exercise.alternatives` se rellena con las de tu
> biblioteca y el buscador lo dice antes de elegir («2 alternativas tuyas»).

La otra mitad decía: se cruzan con `equipment.js`, y una alternativa que **su
gimnasio no tiene** se señala. **No se ha construido, y hace falta decidirlo
antes de construirla**, porque tal como está escrita afirma algo que el dato no
puede sostener:

- El álbum son FOTOS, y su `name` es **opcional** (`cleanEquipment`). Un
  gimnasio con cuarenta fotos sin nombre no tiene ninguna máquina «reconocible»,
  así que **todas** las alternativas saldrían señaladas.
- Y aunque estuvieran todas nombradas: que una máquina no esté en el álbum no
  significa que no esté en el gimnasio. Significa que no le hicieron la foto.
  Convertir esa ausencia en «no lo tiene» es inventar un hecho con toda la pinta
  de ser correcto, que es exactamente lo que la 0094 decidió no hacer.

La versión honesta es la afirmativa —ofrecer al escribir una alternativa **las
máquinas que su álbum sí tiene** para ese músculo, que es un hecho comprobado— y
es un movimiento distinto, con su propia puerta en `EscribirHoja`. Queda
propuesto para la tanda 3.

### 4.6 · E-05 · La puerta desde la hoja

En la fila del ejercicio, mientras programas, un gesto discreto que abre su
ficha («ponerle tu vídeo»). El momento de necesidad es este, no media hora antes
administrando una lista — que es exactamente el argumento con el que `catalog.js`
explica por qué no hay pantalla de catálogo, aplicado al revés.

### 4.7 · E-06 · El tramo que convierte el inventario en cola

Un cuarto tramo en la banda: **Todos · Tuyos · Del catálogo · Sin tu clave**.

Doce ejercicios que programas cada semana y que nunca has explicado. Eso es
«curar» hecho accionable, cuesta cero dato nuevo, y es la lectura que un
inventario no da: no *qué tengo*, sino *qué me queda*.

---

## 5. Alimentos: de lista a despensa

### 5.1 · A-01 · La ficha del alimento, con la gramática de la del ejercicio

`/alimentos` se convierte en el mismo banco de dos planos que `/ejercicios`:
lista a la izquierda, ficha a la derecha, con el mismo corte de anchura, la
misma `.plano-ficha` y la misma capa `.ficha-capa` / `.ficha-capa.is-tuya`. Cero
CSS nuevo y cero patrón nuevo — es el mueble que ya existe, montado dos veces.

```
Alimentos              Todos · Tuyos · Del catálogo      [+ Nuevo alimento]
──────────────────────────────────────────┬────────────────────────────────
 Avena              389   13  66   7   ▸  │  Avena                Cereales
 Arroz blanco       354    7  79   1      │  ────────────────────────────
 Atún al natural    116   26   0   1      │  DEL CATÁLOGO
 Pan integral       247    9  41   3   ⚑  │   13 P · 66 HC · 7 G / 100 g
 Plátano             89    1  21   0      │   Lleva: gluten
                                          │   De referencia. No se toca.
                                          │  ────────────────────────────
                                          │  LO TUYO
                                          │   Cómo lo pides   1 cacito = 30 g
                                          │   Tu nota         «los copos finos,
                                          │                    no la harina»
                                          │   Se usa en       14 dietas
                                          │   Se parece a     Copos de avena ⚑
                                          │  ────────────────────────────
                                          │  [ Crear el mío a partir de este ]
```

**El lápiz vuelve a su sitio**: corregir tu alimento se hace aquí, con la misma
regla de `canEditLibraryItem` que ya aplica `FoodDialog`. La regla vive en el
dominio; las dos pantallas no pueden discrepar.

**Y la fila congelada deja de ser un callejón.** La doctrina no se toca —un
alimento del catálogo es referencia, y otros macros son otro alimento— pero
ahora **se dice y se ofrece la salida**: «Crear el mío a partir de este»
prerrellena un alta con los macros del catálogo y el nombre listo para
distinguir («Pan integral Bimbo»). Es un gesto donde hoy hay un muro.

> Se estudió la alternativa —permitir sobreescribir los macros del catálogo en
> tu copia— y **se descarta**: obligaría a distinguir «mi copia» de «el
> catálogo» con una columna nueva en `foods` y cambiaría el «lo tuyo tapa al
> catálogo» de `foodEquiv`, que hoy es una regla limpia. Más riesgo por ningún
> valor que no dé el gesto de arriba.

**Lo que gana la capa «Lo tuyo»**, que el catálogo no puede tener porque no son
hechos del alimento sino tuyos:

- **Cómo lo pides**: la unidad natural («1 cacito», «1 vaso», «1 puño»). Existe
  ya (`unit_label` / `unit_grams`, 0030) y hoy solo se puede tocar dentro de una
  dieta.
- **Tu nota**: «el de lata al natural, no en aceite». Es **la clave del
  ejercicio, en nutrición** — exactamente lo que el encargo pide del lado del
  entreno, y del lado de la comida no existe. Necesita `foods.note text`, una
  columna aditiva.

### 5.2 · A-02 · Los platos: la respuesta a «combinaciones» y «recetas»

**Qué es un plato**: una **ración guardada con nombre**. Un grupo de alimentos
con sus gramos: «Desayuno de definición · 80 g de avena + 200 ml de leche +
1 plátano · 512 kcal». Nada más. No lleva foto, ni pasos de cocina, ni etiquetas
de dieta: eso es un recetario, y un recetario es el producto de otro.

**Dónde vive.** Dos candidatos:

| | (a) `preferences.platos.items` | (b) tabla `food_recipes` |
|---|---|---|
| Migración | ninguna | una, con RLS |
| Precedente | **`pieces.js`, exacto** | `foods` |
| Alcance | del entrenador | del equipo |
| Techo | hay que ponerlo (~40) | ninguno |

**Recomendada: (a), para la tanda 2.** Es el patrón ya aceptado para
exactamente esta forma de objeto —criterio propio guardado con nombre—,
`updateCoachPreferences` ya fusiona por secciones sin pisar lo demás, y no
cuesta migración. **El precio, dicho**: un plato **no se comparte con el
equipo**, y un entrenador con doscientos engorda la fila de su perfil (de ahí el
techo, como `MAX_PIECES = 30`). Si la queja de equipo aparece, (b) es una
migración posterior que lee **el mismo módulo de dominio**: las funciones no
cambian de firma.

**Cómo se usa** — y aquí está la lección de `/plantillas`, que se respeta
entera: **la vitrina exhibe, la dieta compone.**

1. **Se guarda desde la dieta.** Una opción de comida que te quedó como querías
   ofrece «Guardar como plato». Es el gesto de guardar un día desde el cajón del
   bloque, calcado.
2. **Se pone desde la dieta.** En el autocompletado de `AddFoodControl` los
   platos salen junto a los alimentos, marcados. Elegir uno **lo despliega en
   sus alimentos** como entradas congeladas (`buildFoodEntry` por ítem), no como
   un enlace.
   **Consecuencia, dicha**: editar el plato después **no cambia** las dietas que
   ya lo usaron. Es correcto y es el modelo desde `buildFoodEntry` —una dieta es
   una foto— y es cómo se comporta una pieza.
3. **Se escala, y esto es lo bueno.** Un plato de 700 kcal que cae en una comida
   cuyo objetivo son 500 ofrece cuadrarlo. **Y no hay que escribir el algoritmo**:
   `rescaleMeals({ fromKcals, toKcals })`, `mealTarget(meal)` y `optionGaps(meal)`
   ya existen y están probados.
   Es la mitad útil del generador de Coachway sin recetario y sin que la app
   decida el menú: tu plato, escalado a este objetivo, con la diferencia a la
   vista. Información, no receta.
4. **Se ve en `/plantillas`.** Ver §5.5.

Respeta `Oculto.jsx`: al cliente con las cifras ocultas se le enseña el nombre
del plato y su ración, nunca sus kcal.

### 5.3 · A-03 · «Se parece a»: un lint, no una fusión

`foodMatch` puesto a la vista en la ficha: «esto se parece a *Copos de avena*».
Es la herramienta que le falta a una biblioteca cuyo camino de crecimiento *es*
la duplicación.

**Y no fusiona nada.** Fusionar exigiría decidir qué pasa con las dietas que
apuntan al nombre viejo, y es la única operación de esta lista sin inverso. Lo
que ofrece es **renombrar el tuyo**, que es seguro y comprobado: las entradas de
las dietas son copias congeladas y **no se tocan**.

Un lint que señala y un gesto que no rompe. La fusión, si algún día hace falta,
es otra conversación y otra tanda.

### 5.4 · A-04 · «Se usa en N dietas», y A-06 · las etiquetas de lo tuyo

**A-04** es la cifra que convierte una biblioteca en algo que se puede podar:
el duplicado que usas catorce veces es el que se queda. Y es **gratis**: los
`nutrition_plans` de todos los clientes ya están en memoria (§2.3).

**A-06** cierra el agujero del alérgeno: `foods.tags text[]`, espejo de lo que
la 0094 hizo en `catalog_foods`, para que **tus** alimentos puedan declarar lo
que llevan y `foodConflicts` se dispare también con ellos. Hoy el aviso pasivo
funciona con la pechuga de pollo del catálogo y calla con tu batido de suero.
Aditiva y sin riesgo.

### 5.5 · Dónde se enseñan los platos (y por qué no hay sexta puerta)

`/plantillas` hoy es una pantalla de un solo propósito: los días de entreno
guardados. Pasa a ser **la vitrina de todo lo que has guardado con nombre**, con
los dos tramos que `BandaTaller` existe para pintar:

```
Plantillas                                          Días · Platos
```

- Mantiene **cinco puertas** en la barra del Taller, que es la cuenta con la que
  se diseñó.
- Es honesto: una plantilla es tu criterio guardado con nombre, y da igual de
  qué área sea.
- La pantalla ya exhibe y no compone —renombra, tira y deja leer lo que lleva
  dentro—, que es **exactamente** la regla que un plato necesita.

> La alternativa es una sexta puerta `/platos`, simétrica de `/alimentos`. Es
> defendible y cuesta una entrada más en la barra. Decisión del dueño; la
> recomendación es el tramo.

---

## 6. Micronutrientes: «lo que hay que vigilar», no «información nutricional»

> Encargo del dueño, misma conversación: *«creo que podría estar bien añadir
> información nutricional de vitaminas, fibra etc. para poder hacer
> combinaciones de alimentos y sumarle coherencia de alguna forma, ser
> consciente quizás de lo que buscamos ahí y poder tenerlo en cuenta.»*

Una tabla de vitaminas es **un inventario** — el mismo error que `/alimentos`
ya comete, con veintisiete columnas en vez de cuatro. Lo que hay que reencuadrar
es *qué* se vigila, *contra qué* se compara y *quién* dice si está bien.

**La regla que ordena todo lo demás:** un micronutriente solo es información
cuando tiene contra qué compararse. Los macros tienen objetivo (`targetKcals`,
`proteinGrams`…); los micros no, y ponerles una CDR es la app recetando. Así que
se apoyan en las dos cosas que sí existen: **los condicionantes del cliente** y
**tu propia intención escrita**.

### 6.1 · M-01 · La lista corta la define la etiqueta, no la ciencia

El criterio de selección no es «los más importantes» —discusión sin final— sino
**los que el entrenador ya lee en el envase**. La declaración nutricional
obligatoria en la UE es exactamente: energía, grasas, de las cuales saturadas,
hidratos, de los cuales azúcares, proteínas y sal. La fibra es voluntaria y la
declara casi todo el mundo.

Tres ventajas de ese criterio: **nada que aprender** (es el vocabulario del
supermercado), **verificable** (cada número se comprueba contra el producto
físico) y —decisivo— **rellenable a mano**, porque `foods` (tu biblioteca) nunca
va a tener siembra y sus alimentos son justo los de marca.

| Nivel | Qué entra | Por qué esos | Coste |
|---|---|---|---|
| **1 · la etiqueta** | **fibra · azúcares · saturadas · sal** | Los cuatro del envase. Azúcares y saturadas son además subdivisiones de macros que ya se guardan. | 4 columnas × 2 tablas, nulables |
| **2 · vigilancia** | hierro · calcio · potasio · B12 · vitamina D | No los más importantes: los cinco que **cruzan con condicionantes que ya existen** — vegano → B12 y hierro; mujer → hierro y calcio; calambres → potasio; sin sol → D. | 5 columnas + **una siembra** |

### 6.2 · M-02 · La fibra es la única que ya cierra un bucle del producto

De las nueve, la fibra es la que un entrenador pauta de verdad, la que el
cliente nota, y —esto la hace distinta— **la única cuya contraparte ya está
construida**: `digestion` es una pregunta de check-in que existe hoy en
`protocol.js`.

Composición de la dieta a un lado, lo que el cliente reporta al otro. Eso es
coherencia con evidencia, no un número por tenerlo. **Si solo se construye una
cifra de este bloque entero, es esta.**

### 6.3 · M-03 · Cero y «no dice» no son lo mismo, y aquí muerde de verdad

Con las etiquetas de alérgeno la 0094 ya decidió que «inventar un dato con toda
la pinta de ser correcto es peor que callar». Con los micros la misma regla pasa
de prudente a **obligatoria**: si 12 de 18 alimentos de un día declaran fibra,
el total del día **es un suelo, no un total**. Un suelo presentado como total es
peor que no dar cifra.

Así que la cifra **viaja siempre con su cobertura**:

```
  22 g de fibra   · 12 de 18 alimentos lo declaran
  Hierro          · no dice — 3 de 18
```

**Nunca un objetivo, nunca un % de la CDR, nunca un semáforo.** Tres motivos, y
el tercero zanja: la app no receta; una CDR depende de sexo, edad, embarazo y
medicación —datos que la app no tiene o sobre los que no debe razonar—; y una
chapa roja en el hierro **es un diagnóstico**.

### 6.4 · M-04 · Tres sitios, y ninguno es una columna más en la tabla

Una columna más por micro es cómo se llega a una hoja de cálculo de doce
columnas que nadie lee. Cada sitio tiene su motivo:

- **En la ficha del alimento**, capa «Del catálogo»: lo que lleva por 100 g, con
  su cobertura. Es referencia, y ahí es donde se consulta.
- **En el plato** — y aquí la intuición del encargo acierta del todo: *componer
  es el momento en que decides qué va con qué*. La tira del plato lleva **un
  número más, no doce**: la fibra al lado de las kcal y los macros.
- **En el día de la dieta**, plegado. Un renglón que se abre, nunca abierto por
  defecto: el 95 % de las veces estás cuadrando macros, no auditando micros.

### 6.5 · M-05 · La intención la escribes tú, la cifra la pone la app

«Sumarle coherencia» tiene una versión que convierte la app en nutricionista
—comprobar si el plato cumple su propósito— y una que no. La que no es la que el
producto **ya usa en otro sitio**: `blocks.js` deja escrito que «la intención NO
receta nada: rotula el bloque, ordena la lectura».

El plato lleva **un propósito escrito por ti** —«desayuno alto en fibra»,
«pre-entreno bajo en grasa»— y la app pone la composición al lado. **No
comprueba si se cumple.** Tú ves «alto en fibra» junto a «4 g» y sacas tu
conclusión en medio segundo; la app no ha opinado y sigue sin recetar.

La segunda mitad de la coherencia es el aviso pasivo que ya funciona con los
alérgenos: «Marta es vegana · ningún alimento de este día declara B12» es un
hecho cruzado con sus condicionantes, no una recomendación.

### 6.6 · M-06 · Es un proyecto de dato, no de código — y hay una pregunta legal

El código son unas columnas nulables y una función `sumMicros` con cobertura.
**El trabajo es la siembra**, y de ahí sale la única pregunta de este documento
que no es técnica:

| Fuente | Qué da | El pero |
|---|---|---|
| **BEDCA** | Composición española, en español. Ya es el camino de crecimiento que apuntaba el documento del Taller. | **Hay que comprobar la licencia antes de sembrar nada.** No la he verificado y no la doy por buena. |
| **USDA FoodData Central** | Dominio público, micronutrientes completos. | Alimentos y nombres americanos: traducir y emparejar, y emparejar por nombre es lo que `foodMatch` hace con tres respuestas honestas, no con una. |
| **Open Food Facts** | Marcas españolas con código de barras. | ODbL: atribución y compartir-igual. Y calidad colaborativa, o sea desigual. |

Mientras no haya siembra, **el nivel 1 ya sirve**: cuatro números que el
entrenador rellena del envase para los alimentos que le importan, y la cobertura
dice honestamente cuántos van.

### 6.7 · Y la copia congelada muerde otra vez

`buildFoodEntry` congela nombre, gramos y tres macros. Si se añade fibra, **toda
dieta montada antes de esto no tiene fibra y no la va a tener nunca** — leerá
«no dice», que es correcto si se dice así y catastrófico si se pinta como 0. La
alternativa —buscar los micros vivos por nombre— rompe el modelo de «una dieta
es una foto».

**Se recomienda congelarlos como los macros**: la coherencia gana, y un gesto de
«refrescar la composición de esta comida» se puede añadir después si hace falta.

---

## 7. Consecuencias

### 6.1 Base de datos

En el camino recomendado, **todo aditivo y nada destructivo**:

| Cambio | Qué es | Riesgo |
|---|---|---|
| `exercise_sheets()` | RPC `SECURITY DEFINER`, la ficha de los ejercicios del plan del cliente que llama | Es la pieza con riesgo real: hay que cerrarla con la regla de la 0069 y probarla con `test:db` |
| `foods.note text` | tu nota de compra | ninguno; NULL es «no dice» |
| `foods.tags text[] NOT NULL DEFAULT '{}'` | las etiquetas de tus alimentos | ninguno |
| 4 columnas `numeric` nulables × 2 tablas | el nivel 1 de micros (fibra, azúcares, saturadas, sal) | ninguno en la base; el riesgo está en la pantalla, y es confundir `NULL` con 0 (§6.3) |

Los platos, en el camino (a), **no tocan la base**.

Nada recalcula nada: las dietas montadas siguen con su foto de macros y los
bloques con sus nombres. Etiquetar hoy un alimento no cambia una dieta de ayer,
igual que decidió la 0094.

### 6.2 Privacidad y seguridad

- La RPC entrega **solo** la ficha de los ejercicios del plan de quien llama.
  Sin ella, o se congela el dato (mal modelo) o se le abre al cliente la
  biblioteca entera (mala exposición).
- `parseVideoUrl` sigue siendo la única puerta de entrada de enlaces (YouTube y
  Loom, y por un motivo escrito: lo que se acepta acaba en el `src` de un
  `iframe` dentro de la página del cliente). **No se amplía la lista de
  proveedores.** Si algún día se pide Vimeo o Drive, es la misma comprobación en
  dos sitios (aquí y `create_review_url`, 0040), no una excepción.
- `Oculto.jsx` manda en los platos: nombre y ración sí, kcal no, para quien
  tenga las cifras ocultas.

### 6.3 Rendimiento

- **+1 petición** al abrir el portal del cliente (la RPC), cacheable en la
  sesión. Devuelve decenas de filas.
- **«Se usa en N dietas»** es un `useMemo` sobre datos ya cargados: con 60
  clientes × 6 comidas × 6 alimentos son ~2.000 iteraciones. Irrelevante, y hay
  que memorizarlo por si la cartera crece.
- **«Se parece a»** es `foodMatch` contra la lista mezclada: se calcula **para
  el alimento de la ficha**, nunca para las 300 filas de la tabla.
- El ▶ no monta iframe hasta que se pulsa. Quien no mira no paga.
- **El catálogo se carga al arrancar.** 179 alimentos × 9 números es nada;
  **2.000 × 30 sí es un coste de arranque**. Si llega el nivel 2 de micros, los
  micros salen del arranque y se piden en la ficha del alimento.

### 6.4 Equipo

Los platos en preferencias son del entrenador, no del equipo. Es el mismo
comportamiento que las piezas y nadie se ha quejado; pero conviene decirlo antes
y no después, porque las bibliotecas de alimentos y ejercicios **sí** son
compartidas desde la 0006 y la expectativa razonable es que esto también.

### 6.5 Deuda que este plan cierra y deuda que deja abierta

**Cierra**: la ficha del ejercicio deja de ser dato muerto; el comentario falso
del módulo `videos`; el aviso de alérgenos ciego con tus propios alimentos; la
pantalla de biblioteca que no permite editar la biblioteca; las alternativas
escritas dos veces.

**Deja abierta**: «lo llevan N clientes» (necesita RPC, tanda 3); las
equivalencias como material editable del entrenador (`foodEquiv` sigue siendo
solo de dieta); la fusión de duplicados; el cruce de `equipment` de la ficha con
el álbum del gimnasio más allá de las alternativas.

### 6.6 Validación

`npm run check` (lint · types · verify · test · build) y `npm run test:db` para
la RPC. Las capturas con sesión real, por el camino de
`entorno-local-capturas`: Supabase local + demo + Playwright, y el portal móvil
por «Ver como».

---

## 8. Las tandas

**Tanda 1 · Que el encargo original funcione** — **CONSTRUIDA el 8 sep**, con
las opciones recomendadas: la RPC dirigida (decisión 1) y «pautas» en los dos
lados (decisión 5).
`E-02(c)` la RPC · `E-01` la cadenita y la ficha del cliente · `E-01b` un solo nombre («pautas») ·
`E-03` corregir el comentario · `E-05` la puerta desde la hoja ·
`A-01` la ficha del alimento con «Crear el mío» · `A-04` «se usa en N dietas».

**Tanda 2 · El objeto que falta** — **CONSTRUIDA el 8 sep** (migración 0102),
con las opciones recomendadas de las decisiones 2, 3, 6 y 7.
`A-02` los platos: guardar desde la dieta, poner desde el autocompletado,
escalar con `rescaleMeals`, vitrina en `/plantillas` · `E-04` las alternativas
heredadas de la biblioteca (**el cruce con su gimnasio, no: ver §4.5**) ·
`A-06` `foods.tags` · `M-01` nivel 1 (las cuatro de la etiqueta) · `M-02` la
fibra en la tira del plato.

> Qué quedó donde: `domain/platos.js` y `domain/micros.js` (con sus pruebas),
> `addFoodsToOption` en `useNutrition`, los dos gestos en `NutritionModule`
> (`guardarPlato` y `ponerPlato`, con el «Cuadrarlo» del aviso), los platos en
> `AddFoodControl`, el marcador en la fila de opciones de `MealCard`, los dos
> tramos de `PlantillasPanel`, y las etiquetas y las cuatro cifras en
> `FichaAlimento`. Los micros se congelan en `buildFoodEntry`, así que **cada
> alimento que se añada a partir de ahora** los lleva; los de las dietas ya
> montadas dicen «no dice», que es la verdad.

> El nivel 1 de micros viaja en esta tanda porque **ya abre `foods` para
> `tags`**: es la misma migración y es el momento barato. Fuera de aquí, cuesta
> una migración propia por cuatro números.

**Tanda 3 · El acabado**
`A-03` «se parece a» como lint · `A-05` la nota de compra en la dieta del
cliente (`foods.note`) · `E-06` el tramo «Sin tu clave» ·
`E-07` la RPC de uso por ejercicio · `M-04` el renglón plegado del día ·
`M-05` la intención escrita del plato.

**Tanda 4 · La siembra** — dato, no código, y en paralelo
`M-06` licencia y fuente resueltas **antes de empezar** · `M-01` nivel 2 (los
cinco de vigilancia) · el cruce con condicionantes (B12 · hierro · D).

---

## 9. Lo que se decidió, y lo que queda por decidir

Las siete estaban abiertas al escribir el documento. **Todas se han resuelto con
la opción recomendada** y están construidas así; revertir cualquiera es barato
menos donde se dice.

1. **El camino de la ficha al portal** → **(c) la RPC dirigida** (0100). Una
   sola fuente de verdad y la exposición mínima.
2. **Dónde viven los platos** → **(a) preferencias**, como las piezas. Sin
   migración. **El precio, que sigue en pie**: no se comparten con el equipo, al
   revés que las bibliotecas de alimentos y ejercicios. La tabla propia es una
   migración posterior que lee el mismo `domain/platos.js` sin cambiar firmas.
3. **Dónde se enseñan** → **tramo «Platos» en `/plantillas`**. La barra del
   Taller mantiene sus cinco puertas y la pantalla ya exhibía sin componer, que
   es justo lo que un plato necesita. Cambiarlo a una sexta puerta es mover un
   componente, no rehacer nada.
4. **El módulo `videos`** → se borró la frase que lo prometía (0100).
5. **Cómo se llama** → **«pautas» en los dos lados** (0100).
6. **Hasta dónde llegan los micronutrientes** → **solo el nivel 1**: fibra,
   azúcares, saturadas y sal, rellenables a mano y sin pregunta legal. El nivel
   2 sigue esperando a la tanda 4, y **sigue empezando por resolver la licencia
   de la fuente**, que no está verificada.
7. **Si los micros se congelan** → **congelar**, en `buildFoodEntry`, y solo lo
   que el alimento declara: lo que falta significa «no dice», así que una dieta
   de antes de la 0102 se comporta igual que una de hoy con un alimento que no
   lo dice. **Esta es la menos reversible**: lo ya congelado en dietas montadas
   se queda escrito.

**Y una decisión nueva que abre la tanda 2**, en §4.5: si el cruce de las
alternativas con el gimnasio del cliente se construye en su versión afirmativa
—ofrecer las máquinas que su álbum SÍ tiene— o no se construye. La negativa
—señalar lo que «no tiene»— está descartada con su motivo.

---

## 10. Lo que salió al probarlo con datos reales

La tanda 2 se dio por construida con lint, tipos, 2.002 pruebas y build en
verde. Eso no es lo mismo que probarla: se levantó el entorno local
(Supabase + demo + Playwright con sesión), se aplicaron las migraciones que
faltaban —**el proyecto local estaba en la 0098**, así que ni la nota ni las
etiquetas se podían guardar— y se recorrió el bucle entero con Javier Ortega.

Funcionó: guardar una comida como plato, ponerlo en otra, el aviso con la
diferencia y el «Cuadrarlo» —que se rinde en voz alta cuando el plato es todo
proteína y unidades, que es lo correcto—. Cero errores de consola y cero 4xx.

Y salieron **tres fallos que ninguna prueba unitaria iba a ver**, porque los
tres viven en la costura entre pantalla, contexto y base:

### 10.1 · El alta de un alimento guardaba los macros en CERO

Comprobado leyendo la base: `Pan integral Bimbo | 0 | 0 | 0`, con sus etiquetas
y su nota bien puestas. Silencioso, y con el aviso de guardado en verde.

`FichaAlimento.guardar` hacía **dos escrituras**: los macros por
`upsertLibraryFood` y la nota por `saveFoodSheet`. Y la segunda siembra macros
cuando el alimento «todavía no está en tu biblioteca» —lo comprueba contra la
`foodLibrary` del render, que en un ALTA es la de antes de crearlo—. O sea que
la segunda escritura pisaba a la primera con los ceros.

Arreglo: **una sola escritura, y la puerta la decide de quién es el alimento**.
El tuyo va entero por `upsertLibraryFood` —macros, unidad, etiquetas, envase y
nota—; el del catálogo sigue yendo por `saveFoodSheet`, que es la puerta de tu
voz y a propósito no respeta la protección del catálogo.

### 10.2 · Un plato solo aparecía si ya sabías cómo lo habías llamado

Con el buscador vacío, `Autocomplete` no ofrece nada —y está bien con
trescientos alimentos—. Pero los platos son pocos y son tuyos: una vitrina que
hay que recordar de memoria se comporta igual que una vacía.

Arreglo: una propiedad `vacio` en `Autocomplete`. Sin escribir se **ojea lo
tuyo** (los platos, marcados); escribiendo se busca en todo. Es la distinción
que su propia cabecera ya explicaba entre buscar y ojear, aplicada a media
lista en vez de a la lista entera.

### 10.3 · Corregir unos gramos desde una dieta habría borrado el alérgeno

`upsertLibraryFood` escribía etiquetas, envase y nota **siempre**, con lo que
trajera quien llamara. Y por ahí pasan tres llamadas muy distintas: la ficha
(que opina de todo), añadir un alimento (que manda la fila entera) y **el lápiz
de la fila de una dieta (`editFood`), que solo manda macros y unidad**. Con ese
último, corregir los gramos de un pan le habría borrado el gluten y tu nota.

Arreglo: los hechos se escriben **solo si quien llama trae la clave**. Con la
clave ausente la columna ni se menciona; con la clave presente y en blanco se
borra, que es como se corrige una cifra mal copiada de un envase.

### 10.4 · Y un aviso que no es un bloqueo

Un alimento con los tres macros en blanco suma 0 kcal en todas las dietas donde
entre, y nadie lo decía. No es un error —el agua, el café solo y la sal son
0 · 0 · 0 de verdad—, así que la ficha lo dice y deja guardar. La app resalta;
el criterio es del entrenador.

### 10.5 · Fuera de esta tanda, pero visto

`npm run test:db` falla en `copia.test.js`: hay cuatro tablas que la copia de
seguridad no exporta y que nadie ha excluido a propósito —`client_forms`
(0099), `client_folders`, `client_calendar_feeds` e `integration_oauth_states`—.
No es de esta tanda y no se ha tocado, pero **son datos de clientes que hoy no
entran en una copia**.

---

## 11. Una puerta: la Librería

> Encargo del dueño, mirando las dos pantallas: *«creo que hay mucho que pulir
> aquí a nivel visual, de diseño… y creo que deberían ir ambas en librería, en
> vez de ponerlas separadas.»*

Tenía razón, y el motivo es más fuerte que la intuición: **eran la misma
pantalla**. No parecida — la misma. El banco de dos planos, la lista a la
izquierda, la ficha en dos capas a la derecha, el mismo corte de 1560 px y la
misma CSS. Dos filas de la barra para un mueble montado dos veces.

Y al juntarlas aparece la simetría que este mismo documento ya había escrito en
§3 y que las dos puertas escondían:

| | | |
|---|---|---|
| **Librería** | el material suelto | un ejercicio · un alimento |
| **Plantillas** | lo compuesto con él | un día · un plato |

El Taller baja de cinco puertas a cuatro y cada par significa algo.

**El tramo es la ruta.** `/ejercicios` y `/alimentos` no se tocan: las dos
montan `LibreriaPanel` y cambiar de tramo navega. Así el sitio donde estás se
puede enlazar y compartir, el botón de atrás hace lo que tiene que hacer y la
medición sigue diciendo en cuál de los dos se trabaja.

**Y «Todos · Tuyos · Del catálogo» baja al filtro**, que es lo que siempre fue:
no parte la lista en dos pantallas, la acota — y abajo se combina con el músculo
o la categoría y con el buscador, cosa que arriba no podía. Dos chapas y no
tres: «Todos» es no pulsar ninguna, como en el resto de la aplicación.

### 11.1 · Lo feo, mirado con la captura delante

Tres cosas, y ninguna era de color:

1. **La columna «Lo tuyo» de ejercicios se llevaba el 34 % del ancho y estaba
   vacía en 238 de 239 filas.** Un tercio de la tabla reservado para la
   excepción. Ahora son marcas junto al nombre —vídeo, pautas, alternativas—,
   que es la ley que ya rigen el renglón del entreno y la nota del alimento.
   Con eso, además, las dos mitades tienen por fin **la misma fila**.
2. **El material estaba escondido por una regla que ya no era cierta.** Existía
   un `@media` que ocultaba la columna «Material» por debajo de 1700 px porque
   la tabla no cabía. Lo que no cabía era la columna de arriba; retirada esa,
   esconder el material solo dejaba un hueco de 300 px. Se retira la regla.
3. **La ficha flotaba.** `.plano-ficha` tenía tope de altura pero no altura, así
   que su filete terminaba donde terminaba el contenido y dejaba 600 px de nada
   debajo: el banco no se leía como dos planos sino como una lista con un
   formulario suelto al lado. Con altura fija, los dos planos son dos columnas
   de un mismo mueble. **No hace falta una tarjeta**: la decisión de «filete y
   no caja» sigue siendo la buena.

Y una de texto: los tres campos de «Lo tuyo» llevaban dos líneas de ayuda cada
uno, siempre, sumando más alto que los propios campos. La del vídeo decía lo
que ya dice el hueco del campo, así que ahora solo sale cuando el enlace no
vale; las otras dos se acortaron a una línea.

### 11.2 · Lo que queda por pulir, dicho

- **La densidad.** Una fila mide ~49 px y estas listas tienen 239 y 265. Bajarla
  es tocar `.plantilla`, que es la tabla de media aplicación: se hace de una vez
  y para todas, o no se hace.
- **La ficha sigue siendo un formulario** —etiqueta, campo, ayuda— aunque ahora
  respire. Que se lea como una ficha es otro movimiento.
