# Replanteamiento de la dieta

**Tercera vuelta.** 10 de septiembre de 2026. Nada construido: esto es la
propuesta.

Las láminas están en `docs/dieta-antes-y-despues-detallado.html` — ábrelo en el
navegador; nueve pantallas dibujadas dos veces, con las anotaciones numeradas y
su tabla de cambios. Los «antes» son capturas de la aplicación corriendo.

Sustituye a la segunda vuelta de este mismo documento y a
`docs/replanteamiento-dieta-por-macros.md`.

---

## 1. Qué cae de la vuelta anterior, y por qué

### 1.1 Los tramos caen enteros

Los propuse por analogía con Entreno: bloque → fase, microciclo → **tramo**, hoja
→ día. La analogía es falsa, y el motivo es del oficio, no del código: **un
microciclo se planifica antes; un cambio de kcal se decide después**, mirando el
peso. Un tramo declarado a mano es una columna vertebral que hay que mantener
para algo que la mayor parte del tiempo es un retoque de cincuenta calorías.

Pero lo que yo quería del tramo no era el tramo: era **la lectura** —«le bajaste
250 kcal el 6 de julio; desde entonces, −2,4 kg»—. Y esa lectura **ya está
guardada y no la enseña nadie**: `buildAnthropometryLog` escribe
`log.nutrition = { kcals, protein, carbs, fats }` en cada pesaje y en cada
revisión (`anthropometry.js:100`), y `kcalSeries` (`anthropometry.js:165`) tiene
pruebas y **cero llamadas** en toda la interfaz.

El eje del tiempo no hay que inventarlo ni mantenerlo: **se dibuja**. Kcal
pautadas contra peso registrado, muestreado en cada pesaje. Cero esquema nuevo,
cero gestos nuevos, cero tira que cuidar.

**D-10, D-11 y `phases jsonb` mueren. Sus números no se reutilizan.** Sobrevive
«La evolución» del costado, que era lo único que valía.

### 1.2 Dos correcciones a mi propio diagnóstico

Al ir a escribir esto comprobé dos cosas que había afirmado de memoria, y las dos
estaban mal. Importan porque cambian el trabajo.

**«La dieta no ha pasado por las leyes» es falso.** La dieta comparte el ancho de
trabajo con Entreno, y está escrito el porqué en el propio CSS
(`revision.css:2100`: «Ancho de trabajo, sí; distinto de la pantalla de al lado,
no»). `.dieta-hoja` ya es una caja con papel, canto y radio (`revision.css:2916`),
la cabecera de cada comida se construyó a propósito como el rótulo de una hoja de
Entreno, `MealCard` usa `hoja-asa` y `PlanDia` usa `hoja-celda`. Lo que de verdad
le falta es más estrecho, y está en el §3.5.

**«La comida lleva iconos en fila, que es lo que se quitó en Entreno» también es
falso.** En Entreno no se quitaron los iconos: se partió un «···» de siete ítems
en un menú por nivel, precisamente porque esconderlo todo en un «···» no gustó.
La fila de iconos de la comida **se queda**. Lo que sí se rompe con lo que viene
es otra cosa: «Copiar a la otra» sólo tiene sentido mientras haya exactamente
dos.

---

## 2. El eje verdadero es el día, no la fecha

Y aquí está el fallo de fondo de las dos vueltas anteriores: propuse un eje del
tiempo cuando la aplicación **ni siquiera tiene bien el eje que sí es
estructura**.

### 2.1 Lo que hay hoy

Los días de dieta son **exactamente dos y con el nombre puesto en el esquema**:

```
nutrition_plans
  has_day_variants        boolean
  closed_meals            jsonb   ← la dieta única
  closed_meals_training   jsonb   ← el día de entreno
  closed_meals_rest       jsonb   ← el día de descanso
  target_kcals, protein_grams, carbs_grams, fats_grams   ← el objetivo de entreno
  rest_targets            jsonb   ← el objetivo de descanso (migración 0004)
```

No hay un tercero posible. Y la pareja está escrita a mano en cinco sitios:
`VARIANT_KEY` (`nutrition.js:22`), `VARIANT_OPTIONS` en `NutritionModule.jsx` y
otra igual en `ClientDiet.jsx:13`, `UnaSolaDieta.jsx` —un diálogo que sólo puede
existir si hay dos— y `activeVariants` (`nutrition.js:123`), que devuelve esa
lista y **no la llama nadie**: otro huérfano.

Esto es justo lo que describes: **la estructura se mantiene, lo que varía son las
cifras dentro de ella**. Un alto/medio/bajo no cabe. Un ciclado de siete días,
tampoco.

### 2.2 La forma nueva

```
 Los días │ Alto   Medio   ▌Bajo   Descanso   + día        L M X J V S D
 ┌ la mesa ───────────────────────────────┐  ┌ el costado ──────────────┐
 │  las comidas del día «Bajo»            │  │ El día · El reparto      │
 │  (o el reparto por comida, si macros)  │  │ La semana · La evolución │
 │  pasos · cardio · tus pautas           │  │                          │
 └────────────────────────────────────────┘  └──────────────────────────┘
```

**`days jsonb`** en `nutrition_plans`:

```
days: [ { id, name, targets: { targetKcals, proteinGrams, carbsGrams, fatsGrams }, meals: [...] } ]
week: { Lunes: dayId|null, …, Domingo: dayId|null }
```

La migración convierte lo que hay —única → un día; entreno/descanso → dos días
con esos nombres— y **deja las columnas viejas intactas**, exactamente como hizo
la 0004 con `meals`. Nada viejo se rompe, no hay dato que se pueda perder y el
trabajo se puede parar a mitad. Sería la **0110**.

El dominio ya está preparado a medias: `targetsFor`, `mealsForVariant`,
`activeVariants` y `VARIANT_KEY` **ya son una indirección** —hoy con dos entradas
fijas—. Pasarlo a lista es abrir esa puerta, no abrir otra.

### 2.3 El reparto semanal, y sus dos maneras

Es lo que preguntaste, y confirmo que es lo que entendiste: **asignar un día de
dieta a días de la semana**, igual que el entreno asigna sesiones. Y las dos
maneras que dices son las dos que hacen falta:

**(a) Por el entreno.** «Alto los días que entrena, Bajo los que descansa.»
Y esto **no hay que preguntárselo a nadie: ya está escrito**. El bloque lleva su
`weeklySplit` (`blocks.js:72`, `structureOfBlock`), con `isRestDay`
(`training.js:343`), `trainingDayCount` (`:349`) y `weekdayForDay` (`:987`) ya
resueltos y probados. Hoy la aplicación sabe qué días entrena esta persona **y
aun así le pide al cliente que elija la variante a mano** con un conmutador
(`ClientDiet.jsx:41`). Eso es la avería.

**(b) A mano, día por día.** Un ciclado de hidratos no tiene por qué seguir al
entreno: L alto, M bajo, X bajo, J alto… Se pulsa el día de la semana y se elige
qué dieta le toca.

**Cómo se resuelve sin dos mecanismos.** Hay **un solo dato**, el mapa `week`, y
(a) es un botón que lo rellena: **«Repartir por el entreno»** lee el
`weeklySplit` del bloque en curso y escribe el mapa. Después el mapa es la
verdad. No es un enlace vivo, y es a propósito:

- El `weeklySplit` es **por bloque**, y los bloques cambian. Una dieta que se
  recoloca sola el día que se cambia el split es la aplicación decidiendo por el
  entrenador — y eso es justo lo que esta aplicación no hace.
- Con ciclo rotativo (`cycleType` distinto de `weekly`) **no hay días de la
  semana** a los que atarse. El botón no puede existir ahí; el mapa a mano, sí.
- Un ciclado de hidratos no se corresponde con el entreno ni queriendo.

**Y cuando dejen de coincidir, se dice.** «El reparto de la dieta ya no coincide
con el del bloque: entrena L-X-V y la dieta pone Alto L-M-J.» Información, con el
botón de volver a repartir al lado. Nunca se mueve solo.

**El mapa puede estar vacío**, y entonces todo funciona como hoy: los días se
eligen a mano en la cinta y el cliente los ve todos. La migración no inventa
ningún reparto.

### 2.4 Lo que el reparto hace posible, y hoy no

- **La media semanal ponderada es exacta.** Con dos dietas hoy no se puede
  calcular sin adivinar cuántos días entrena. Con el mapa es aritmética. Y es la
  única cifra que dice algo en un ciclado: en un alto/bajo, ni el alto ni el bajo
  son «sus calorías».
- **El portal abre por el día de hoy.** Hoy abre por «Días de entreno» siempre,
  aunque sea domingo.
- **`log.nutrition` deja de mentir con N días.** Hoy guarda una sola foto, la de
  las columnas principales. Con días, la foto que se puede cruzar con el peso es
  **la media semanal ponderada**; sin reparto, se queda como está.

Y dos cosas para que N días no sea un castigo para quien lo monta:

- **Duplicar un día.** Copiar el menú entre variantes ya existe
  (`copyVariantMeals`, `useNutrition.js:163`). Con N días es el gesto que sostiene
  todo lo demás.
- **Reescalar por hidratos.** `rescaleMeals` (`nutrition.js:854`) hoy sólo sabe
  `fromKcals → toKcals` con la proteína quieta. Para un ciclado lo que quieres es
  duplicar «Alto» → «Bajo» y mover **los hidratos**. Es una extensión acotada de
  una función ya probada, con su vista previa ya hecha (`ReescalarMenu.jsx`).

### 2.5 Lo que NO se mezcla

**El día no es la opción de la comida.** El día es *qué dieta te toca hoy*; la
opción es *qué versión de este desayuno te comes*. Efort las confunde —sus
opciones se llaman «Rest Day» y «Training Day»— y por eso necesita planes
duplicados por atleta. Nombrar las opciones sigue en pie, aparte (§4.4).

---

## 3. Lo medido

Todo esto está medido sobre la aplicación corriendo, no leído del código. El
banco es el de `entorno-local-capturas`: Supabase local, `npm run demo`, Vite
apuntando a local y Playwright con sesión. El cliente de la dieta cerrada
(«Javier Ortega») se sembró con cinco comidas y ocho alternativas escribiendo
`closed_meals` directamente; el de macros es el de la demo tal cual.

| Lo que se midió | Cifra | Dónde |
|---|---|---|
| Columna derecha vacía, con cinco comidas | **2.250 px · 83 %** | `.dieta-menu` 2.706 px, `.dieta-lado` 456 px |
| Cifras de kcal simultáneas en la cerrada | **4** | 3.050 · 2.887 · 2.732 · 2.489–2.888 |
| Celdas de suma en ámbar o rojo | **17 de 20** | 13 por debajo, 4 por encima |
| Margen del semáforo en 16 g de grasa | **±0,8 g** | `estadoDe`, 5 % relativo |
| Copias del semáforo en el código | **2, idénticas** | `MealCard.jsx:733` y `PlanDia.jsx:32` |
| Ancho que usa la dieta por macros | **980 de 1.560** | `.dieta.is-macros`, `revision.css:3486` |
| Alto de la dieta por macros | **520 px** en una ventana de 1.000 | mesa 175 px, costado 323 |
| Llamadas a `kcalSeries` en la interfaz | **0** | ídem `macroShareSeries`, `macroShareBands`, `activeVariants` |
| Micros y fibra enseñados en la dieta | **ninguno** | se congelan en cada alimento desde la 0102 |
| Macros en g/kg | **ninguno** | `latestWeight` está a mano |
| Primera pantalla del portal con comida | **0 px de 844** | el primer alimento, a 900 px de scroll |
| Días de dieta posibles | **2** | y escritos a mano en cinco sitios |

### 3.1 Las tres averías de la cerrada

**Cuatro cifras de kcal, todas ciertas, ninguna presentada.** En la misma
pantalla: 3.050 (el objetivo), 2.887 (lo que suman las opciones abiertas), 2.732
(lo que suman los tres macros del objetivo, o sea un descuadre del plan) y «entre
2.489 y 2.888» (el rango según la alternativa). Cada una responde a una pregunta
distinta y ninguna dice a cuál.

**«Cuadra» significa dos cosas a cuarenta píxeles.** La línea de mando dice «el
reparto cuadra» —`mealTargetsTotal` (`nutrition.js:732`), que compara la suma de
los objetivos POR COMIDA contra el objetivo del día— y el resumen de debajo dice
«faltan 163» —`DiaResumen`, que compara lo que suman los ALIMENTOS—. Las dos son
ciertas. Y en la ventana del día, «Repartidas … **cuadra**» se calcula sólo sobre
las kcal: en esa misma fila la proteína repartida es 204 g contra un objetivo de
156.

**El semáforo está mal calibrado, no de más.** `estadoDe` usa un margen del 5 %
*relativo*, así que 620 kcal se juzgan con ±31 y 4 g de grasa con ±0,2. Una
comida con 4 g de grasa pautados no puede estar en verde nunca. Resultado
medible: 17 de 20 celdas marcadas en un plan que el propio entrenador acaba de
cuadrar. Eso no es señalar, es reñir. Y está escrito dos veces, palabra por
palabra, en dos ficheros.

La ley del color no lo impide —«el semáforo juzga, y sólo aparece pegado a la
cifra que valora»— pero sí lo impide la otra: **sin reproches**. Y es exactamente
lo que el estudio de Efort le criticaba a Efort («sus anillos pintan el 95 % de
grasas en rojo»), haciéndolo nosotros en casa.

### 3.2 Las dos de la de macros

**Es el chasis de fábrica y es el peor.** `emptyNutrition()` nace con
`type: 'macros'`, así que es lo que ve todo cliente nuevo. `.dieta.is-macros`
convierte la rejilla `1fr / 300px` en una columna de 980 px y manda el costado
arriba con `order: -1`. La columna del trabajo mide 175 px y la del costado 323:
está del revés.

**Y sí hay trabajo que poner en la mesa.** Repartir el objetivo entre las comidas
del día. Esa tabla ya existe, ya se edita y ya está probada: es `PlanDia`, dentro
de `DiaPopup`. Está escondida detrás de un enlace («Ver el día ↗») en la única
pantalla que no tiene nada más.

### 3.3 Lo que ya está guardado y no se enseña

- **La foto de los macros de cada día.** `log.nutrition`, escrito en cada pesaje y
  en cada revisión (`anthropometry.js:100`). Para leerla hay `kcalSeries` (`:165`),
  `macroShareSeries` (`:171`) y `macroShareBands` (`analytics.js:240`), las tres
  con pruebas y **cero llamadas** en `src/`.
- **La fibra y los micros de cada alimento.** `freezeMicros(food)` los copia a la
  entrada de la dieta (`nutrition.js:155`). `sumMicros` (`micros.js:98`) sólo lo
  llama `PlantillasPanel`. En la dieta no se enseña ni uno.
- **Los días de entreno de la semana.** `weeklySplit` por bloque, con
  `trainingDayCount` y `weekdayForDay` resueltos. Es el §2.3 entero.
- **El peso.** `latestWeight` (`:154`) y `rollingWeightAverage` (`:199`), para el
  g/kg.

### 3.4 Y dos del cliente

**Su primera pantalla no tiene comida.** A 390 × 844: título, objetivo diario,
pasos y el arranque del resumen de macros. El primer alimento aparece a 900 px de
scroll. Su única pregunta es qué come.

**Le llega el descuadre del entrenador, en rojo.** `MacroTargetCard` esconde a
propósito el aviso de descuadre cuando `editable` es falso, y está escrito por
qué: «le señalaba un fallo del trabajo de su entrenador que él no puede tocar».
Después `DiaResumen` le pinta exactamente la misma diferencia: «faltan 163» en
ámbar y «+33 g» en rojo. Una pieza le protege y la otra no.

### 3.5 El mueble: qué le falta de verdad

Corregido el §1.2, esto es lo que queda —y es poco, pero es estructura:

1. **No tiene cinta.** Cero `.tira-*` en toda la dieta. Lo que hace de navegación
   entre los dos días es un `MandoTab` en la fila de mando
   (`NutritionModule.jsx:673`) y un `SegmentedControl` en el portal. Con N días,
   eso no aguanta — y la cinta es además donde vive el reparto semanal.
2. **La caja no llena el alto de la hoja.** Es la ley que se aplicó a `.plantilla`
   el 8 de septiembre y la razón por la que una lista de dos filas no se ve vacía
   en Coachway. `.dieta-hoja` termina donde termina la última comida.
3. **`.dieta.is-macros` es una excepción por pantalla**, que es exactamente la
   figura que la ley de la hoja prohibió («no admite excepción por pantalla»).
   Un plan por macros no es otra pantalla: es la misma con menos que poner.
4. **El semáforo está escrito dos veces.** Cualquier arreglo del margen que toque
   sólo una de las dos deja la mitad de la pantalla riñendo.

### 3.6 Menudencias con nombre y apellidos

- **«3 unidads».** `unitsLabel` pluraliza añadiendo una «s», y el catálogo tiene
  16 alimentos cuya unidad es literalmente `unidad`.
- **Un pie que manda a un sitio que no existe.** `FoodEquivalences:155` dice
  «enciende “Equivalencias en la dieta”, encima del menú». El ajuste se llama «El
  cliente ve las equivalencias» y vive dentro de `AjustesPlan`, arriba a la
  derecha.
- **Las equivalencias de «Huevo entero» son cinco huevos**: Huevo L, Huevina,
  Huevo entero L, Huevos enteros frescos y Tortilla francesa. El cálculo es
  correcto; el catálogo tiene casi-duplicados y nadie puede decirle cuál prefiere.
- **«1/5 comidas que cuadran (±5 %)»** en la ventana del día. Con el margen mal
  calibrado esa cifra dice casi siempre 1 de 5.

---

## 4. La forma nueva

### 4.1 Un solo chasis, con la mesa distinta

Es la misma anatomía que Entreno —donde la vista de hoja y la de bloque comparten
cabecera y costado y sólo cambia la mesa— y la misma que la cerrada ya tiene hoy.
Lo único que desaparece es la excepción.

- **Cerrada** → la mesa son las comidas.
- **Por macros** → la mesa es el reparto por comida (`PlanDia`), plegado hasta
  que se toca: quien pone «por macros» a veces lo hace precisamente para no
  repartir nada.

### 4.2 El costado, y por qué esas cuatro

Son las cuatro preguntas que un entrenador se hace tecleando 2.400:

- **El día** — lo que suma el menú contra el objetivo, con las opciones abiertas.
  Es lo que hoy es `DiaResumen`, movido de la mesa al costado: es una lectura, no
  es el trabajo.
- **El reparto** — P/C/G en **g/kg** contra el peso registrado (con su fecha a la
  vista), la **fibra** del menú y los **micronutrientes** plegados, con la
  cobertura honesta que ya calcula `coverageSaid` («lo declaran 11 de 17»).
- **La semana** — el reparto `L M X J V S D`, la **media ponderada** de kcal y
  macros, y el aviso si ya no coincide con el bloque. Con un solo día, dice el
  día y ya.
- **La evolución** — kcal pautadas contra peso registrado, muestreado en cada
  pesaje. Es la llamada que les faltaba a `kcalSeries` y `weightSeries`.
  Tarjeta-puerta: abre la tabla entera, gemela de «el historial de todos los
  bloques».

Ni una clase nueva: `.lado-tarjeta`, `.lado-cab`, `.bloque-cifras`,
`tarjeta-puerta` y su `.task-hit` son las del bloque.

**Y sigue sin recetar.** «Le bajaste 250 kcal el 6 jul; desde entonces, −2,4 kg»
es información. «Súbele 150» no aparece.

### 4.3 La cifra que dice en vez de juzgar

- **Un total por pregunta.** El de la fila de mando lleva su verbo —«el menú suma
  2.887 de 3.050 · faltan 163»— y es el único que habla de alimentos. El rango
  baja al costado. El descuadre del plan (los 2.732) se queda donde ya está: en
  el editor del objetivo, que es donde se arregla.
- **El semáforo, con suelo:** `máx(5 %, 3 g)` en gramos y `máx(5 %, 25 kcal)` en
  kilocalorías. En la pantalla medida, de 17 celdas marcadas a 6 — y las 6 son
  desvíos de verdad (23 g de grasa donde se pidieron 9). **En un solo sitio**,
  no en dos.
- **«Cuadra» dice de qué.** El veredicto del reparto mira los cuatro números, no
  sólo las kcal, o no se llama «cuadra».
- **Fuera el marcador de «1/5 comidas que cuadran».** Queda el desvío medio.

### 4.4 La comida

```
 1  Desayuno                          629 de 620 kcal   ✎ ⧉ ⇄ ↑ ↓ 🗑   ⌃
    [Con huevo 629] [Sin lactosa 420] [+ alternativa]
    3 ud  ▾ Huevo entero                     P 21 · C 2 · G 16 · 231
          │ ≈ 19 ud   Clara de huevo · 579 g   P 61 · C 2 · G 1
          │ ≈ 188 g   Yogur griego             P 12 · C 10 · G 19
   80 g  ▸ Avena                              P 11 · C 46 · G 6 · 279
    ENERGÍA   PROTEÍNA   CARBOS   GRASAS   FIBRA
    629 kcal    33 g      76 g     22 g    8,1 g
```

- **Los iconos se quedan en su fila** (§1.2). Lo único que cambia es «⇄ Copiar a
  la otra», que con N días pasa a ser «Copiar a…» con la lista de días.
- **Las opciones se nombran.** Un campo `name` en la opción; «Opción N» queda
  como reserva para las que ya existen.
- **Las equivalencias, dentro y ya escaladas**, plegadas por alimento, como filas
  hijas de la misma rejilla —la tabla de columnas de la comida no se toca—. La
  ventana se queda para elegir y para el interruptor del cliente, que es lo que
  sí es una decisión.
- **Los grupos con nombre.** Guardar «Mi proteína magra» desde la comida, igual
  que se guarda un plato. El grupo guardado manda; el cálculo sigue siendo el
  suelo, así que quien no guarde ninguno no pierde nada.
- **El pie con fibra**, y la comida se pliega.

### 4.5 La del cliente

Abre **por el día de hoy** y **por la comida**. Objetivo y pasos bajan al pie —se
consultan una vez y no son lo que se hace—, las comidas se pliegan menos la
primera, y su día suma sin marcar nada en rojo: el descuadre es del trabajo de su
entrenador.

Con reparto semanal, el conmutador de días deja de ser una pregunta y pasa a ser
un rótulo —«Hoy, jueves: Bajo»— con los otros días detrás.

### 4.6 Una dieta, muchos clientes

Por el carril que ya existe: `envios.js` sabe decir a quién (marcados · etiqueta ·
protocolo · todos) y lo usan formularios y encargos. Lo que no viaja por él es la
dieta. Y antes de guardar, **qué le pasa a cada uno**: qué entra y qué se le
quita.

«Alto en hidratos» no es una tabla nueva: es una **plantilla de dieta**, en la
vitrina donde ya viven los platos y las piezas.

---

## 5. Los bloques de dieta: escritos, no construidos

Un bloque de dieta sí es un capítulo de verdad —definición, volumen, peak week—:
cambia el **planteamiento**, no el número. Eso pasa poco y por eso merece nombre,
a diferencia del tramo, que se disparaba cada vez que tocabas 50 kcal.

Pero sólo se gana el sitio cuando pidas dos cosas concretas: **guardar la dieta
de antes y volver a ella**, y **que la evolución diga «Definición · desde el 6
jul» en vez de una fecha suelta**. Con los días y la evolución construidos, el
bloque es una capa encima que no obliga a migrar nada.

**Mi voto: dejarlo escrito y no construirlo todavía** — y el día que se haga,
apagado de fábrica, como las variantes hoy.

---

## 6. Los movimientos

El orden lo cambia tu decisión: **el mueble va delante, y la aritmética va con
él**. Son la misma pantalla, y tocarla dos veces es hacer el trabajo dos veces.

### Tanda 1 — el mueble y las cuentas, a la vez *(sin tocar el esquema)*

- **D-01** · Muere `.dieta.is-macros`. Las dos formas de plan usan mesa +
  costado. `NutritionModule.jsx`, `ClientDiet.jsx`, `revision.css`.
- **D-02** · `PlanDia` sale de `DiaPopup` y es la mesa de la dieta por macros,
  plegada hasta que se toca.
- **D-16** · **La cinta de la dieta.** `TiraDelPrograma` está atada a `program` y
  `semana`, así que no se reutiliza tal cual: se extrae el chasis (`.tira-*`, los
  `+`, la marca de «en curso») y la dieta pone el suyo. **Nace con los dos días
  de hoy** —sustituye al `MandoTab` y al `SegmentedControl`—, así que esta tanda
  no depende de la 2.
- **D-17** · La caja de la dieta llena el alto de la hoja, como `.plantilla`.
- **D-03** · `LecturasDeLaDieta.jsx`, gemelo de `LecturasDelBloque`: «El día»,
  «El reparto», «La semana» y «La evolución», con las clases del costado y su
  ventana cada una. Aquí entra el dibujo de `kcalSeries` contra `weightSeries`.
- **D-04** · Una cifra por pregunta: el total con su verbo en la fila de mando,
  el rango al costado, el descuadre del plan sólo en el editor del objetivo.
- **D-05** · El semáforo con suelo (`máx(5 %, 3 g)`, `máx(5 %, 25 kcal)`), **en un
  solo sitio**, y el veredicto del reparto mirando los cuatro números.
- **D-09** · Los macros en g/kg, con la fecha del pesaje del que salen; y la
  fibra del menú, que ya está congelada en cada alimento.
- **D-13** · A `DiaResumen` se le pasa la misma condición que ya tiene
  `MacroTargetCard`: al cliente no le llega el descuadre.

### Tanda 2 — los días *(una columna nueva, migración que no borra nada)*

- **D-18** · `days jsonb` y `week jsonb` en `nutrition_plans` (migración **0110**).
  Las columnas de hoy se quedan. `VARIANT_KEY`, `targetsFor`, `mealsForVariant` y
  `activeVariants` pasan de dos entradas fijas a lista.
- **D-19** · El reparto semanal en la cinta, con «Repartir por el entreno» leyendo
  el `weeklySplit` del bloque, y el aviso cuando dejan de coincidir.
- **D-20** · Duplicar un día, sobre `copyVariantMeals`. Y «Copiar a…» en la comida
  deja de ser «a la otra».
- **D-21** · `rescaleMeals` aprende a mover **los hidratos**, no sólo las kcal.
- **D-22** · La media semanal ponderada: al costado, y como la foto que guarda
  `log.nutrition`.
- **D-12** · El portal abre por el día de hoy y por la comida.
- **D-23** · `UnaSolaDieta` deja de ser un diálogo de dos y pasa a ser «quitar
  este día», con lo que hay dentro delante.

### Tanda 3 — la comida y el reparto a varios *(ni esquema ni migración)*

- **D-06** · Las opciones se nombran.
- **D-07** · Las equivalencias, dentro de la comida y ya escaladas. Y los grupos
  con nombre, guardados desde la comida.
- **D-08** · El pie con fibra, y la comida se pliega.
- **D-15** · Las menudencias del §3.6.
- **D-14** · Una dieta, muchos clientes, por el carril de `envios.js` y con las
  consecuencias delante. La plantilla de dieta, en la vitrina.

**Muertos:** D-10 y D-11 (los tramos y `phases jsonb`).

---

## 7. Lo que este estudio NO propone

- **No propone números.** Ni «te sobran 150 kcal» ni «deberías subir proteína».
  La ley sigue siendo resaltar lo que pasó y callarse el resto.
- **No mueve la dieta sola.** El reparto semanal se rellena de un botón y se
  queda escrito; ningún cambio de bloque le toca las comidas a nadie.
- **No mueve la antropometría.** Los pesajes se siguen registrando donde se
  registran; la dieta sólo los lee.
- **No toca el importador.** `dietSheet.js` funciona y no participa de ninguna de
  las averías.
- **No convierte la dieta en una biblioteca de planes.** Ese es el modelo de
  Efort y trae su problema: el plan duplicado por atleta.

---

## 8. Las decisiones que quedan

Las cinco de la vuelta anterior se quedan en tres —dos las resolvió tu respuesta—
y aparecen dos nuevas que sólo existen porque ahora hay días.

1. **El g/kg, ¿contra qué peso?** Mi voto: **la media móvil de tres**
   (`rollingWeightAverage`), con la fecha del último pesaje escrita al lado.
2. **El descuadre del plan, ¿se le esconde al cliente entero?** Mi voto:
   **entero**. Hoy se le esconde la mitad, que es lo peor de los dos mundos.
3. **Por macros, ¿la mesa nace plegada?** Mi voto: **sí**, una línea («Reparte las
   kcal entre sus comidas») que se despliega al primer clic.
4. **¿Cuántos días se permiten?** Mi voto: **sin tope duro**, pero la cinta se
   diseña para cuatro o cinco; siete es un ciclado y cabe, veinte es otra cosa.
5. **Sin reparto semanal, ¿qué día abre el portal?** Mi voto: **el primero de la
   lista**, y con el rótulo diciendo que es una elección suya, no la de hoy.
