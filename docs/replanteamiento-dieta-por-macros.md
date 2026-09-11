# Replanteamiento de la hoja de dieta

> **SUSTITUIDO** por `docs/replanteamiento-dieta.md` (9 sep 2026, misma
> tarde). El diagnóstico de la dieta por macros de aquí sigue siendo válido y se
> conserva entero allí; lo que cambia es el alcance —la dieta cerrada tiene tres
> averías que este documento no vio— y el orden de las tandas.


**La dieta por macros, con la gramática de Entreno y los bloques.**
Estudio del 9 de septiembre de 2026. Nada construido: esto es la propuesta.

---

## 1. El encargo

> «Plantea un rediseño de la hoja dieta, sobre todo de la opción de dieta por
> macros, adaptándola a cómo se ve el entrenamiento y los bloques.»

O sea: la pantalla de referencia ya existe y está dentro de la casa. Entreno —la
tira del programa, la mesa de hojas y el costado de lecturas— es la forma que el
dueño ya validó después de diez vueltas. La dieta no la tiene, y por macros ni
siquiera la insinúa.

---

## 2. Lo que hay hoy, medido

Siete hechos, todos comprobados en el código de hoy.

### 2.1 La dieta no tiene tiempo

`nutrition_plans` es **una fila por cliente** —`UNIQUE (client_id)`,
`supabase/migrations/0000_base_schema.sql:127`— con las cifras como columnas
sueltas: `target_kcals`, `protein_grams`, `carbs_grams`, `fats_grams`. Bajar a
alguien de 2.600 a 2.400 kcal **sobrescribe**. En la pantalla de dieta no queda
ni el rastro de que hubo un 2.600, ni cuánto duró, ni qué pasó mientras.

Entreno es lo contrario, y por eso el dueño planifica ahí: bloque → microciclo →
hoja, todo fechado, y lo de la semana pasada sigue estando la semana siguiente.

### 2.2 La foto del plan ya se guarda… y no se enseña en ninguna parte

Cada pesaje y cada revisión guardan una **foto de los macros del día**:

```
log.nutrition = { kcals, protein, carbs, fats }
```

`src/domain/anthropometry.js:100-105`, escrito desde
`src/components/Coach/AnthropometryModule.jsx:62` y
`src/components/Client/ClientCheckInsRoute.jsx:128`.

Y para leerla hay tres funciones de dominio, con sus pruebas:

| Función | Dónde | Usos en la interfaz |
|---|---|---|
| `kcalSeries(history)` | `anthropometry.js:165` | **0** |
| `macroShareSeries(history)` | `anthropometry.js:171` | **0** |
| `macroShareBands(history)` | `analytics.js:240` | **0** |

`grep` sobre todo `src/` sin los tests: ni una llamada. **La aplicación ya sabe
cruzar los macros con la evolución del peso y no lo enseña en ningún sitio.** El
historial de la dieta existe, está fechado y está huérfano.

### 2.3 Por macros, la pantalla es un formulario de cuatro casillas

`.dieta.is-macros` —`src/styles/revision.css:3469`— es una columna de 980 px con:
una o dos tarjetas de objetivo, pasos, cardio y las pautas. Eso es todo. Sin
lecturas, sin puertas, sin historia, sin la cifra de la semana.

En esa misma superficie, Entreno enseña cuatro hojas con sus dieciocho ejercicios
y tres tarjetas de lectura al costado.

### 2.4 La pantalla tiene dos chasis según el tipo de plan

Cerrada: `grid` de `1fr / 300px` con costado pegajoso (`revision.css:2874`).
Por macros: `flex` en columna, `max-width: 980px`, y el costado **cambiado de
sitio** con `order: -1` (`revision.css:3473`).

Son dos pantallas distintas para el mismo trabajo. Es exactamente lo que la
propuesta «Una sola voz» vino a matar: la app teniendo dos de todo.

### 2.5 Las dos variantes se apilan, pero no se comparan

Con «dos dietas» hay dos `MacroTargetCard`, una al lado de la otra
(`src/components/Coach/NutritionModule.jsx:770`). Falta **la cifra que las
relaciona**: cinco días a 2.600 y dos a 2.200 son 2.486 kcal/día de media, y ese
promedio es lo que de verdad manda en el balance. La pantalla enseña las dos
piezas y no la suma.

Los días de entreno de la semana no hay ni que preguntarlos: están en el plan del
microciclo, `planOfWeek(program, week)` (`src/domain/blocks.js:1130`).

### 2.6 Nada relaciona la dieta con el peso

`weeklyRateOfChange`, `rollingWeightAverage` y `weeklyCheckIn` existen y se
pintan **en Antropometría** (`AnthropometryPanel.jsx:115-117`). Quien está
tecleando 2.400 kcal en Dieta no ve que lleva tres semanas a −0,1 kg/sem. Tiene
que acordarse de ir a otra pestaña, mirar, y volver.

### 2.7 Los macros no se leen por kilo de peso

180 g de proteína es un número. 2,1 g/kg es una decisión. El peso está a mano
—`latestWeight(history)`, `anthropometry.js:154`— y la tarjeta no lo usa.

**El único aviso que da hoy la pantalla** es el descuadre de `MacroTargetCard`:
que los macros no sumen las kcal del objetivo. Es aritmética, no criterio.

---

## 3. La traducción, pieza por pieza

Entreno tiene tres piezas, y las tres tienen gemela en la dieta. Nada de esto
inventa vocabulario: es el de la casa, aplicado un módulo más allá.

| Entreno | Dieta |
|---|---|
| **Bloque** «Acumulación», desde el 6 jul | **Fase** «Definición», desde el 6 jul, con su intención |
| **Microciclos** M1…M9, uno *en curso* | **Tramos** T1…T3: cada objetivo distinto es un tramo fechado |
| **Hojas** Push A · Pull A · Pierna A | **Días**: Entreno · Descanso (o «Diario») |
| Fila: `4 × 6-8 · HIZO 109,5 kg · 8·8·8·7` | Fila: `Proteína · 180 g · 2,1 g/kg` |
| Costado: **Este bloque** (67 series, 232.088 kg, 26/36, 72 %) | Costado: **Este tramo** (2.486 kcal/día, 6 sem, −2,4 kg, −0,41 kg/sem) |
| Costado: **Volumen por microciclo** (barras contra el MRV) | Costado: **El reparto** (P/C/G en g/kg y en %) |
| Costado: **Progresión** (18 ejercicios, +kg) | Costado: **La evolución** (kcal contra peso, tramo a tramo) |
| `+ bloque` · `+ microciclo` · `+ hoja` | `+ fase` · `+ tramo` |

La correspondencia no es una metáfora bonita: es que **el ciclo de trabajo es el
mismo**. Se pauta, pasa una temporada, se mira lo que hizo el cuerpo y se
repauta. Entreno lo dibuja. La dieta lo esconde en cuatro casillas que se
machacan a sí mismas.

---

## 4. La forma nueva

### 4.1 Por macros

```
 Fases │ Definición   ▌Mantenimiento   + fase                    ⧉  ⇄  ···
 T1   T2   ▌T3 · en curso   + tramo                    desde el 6 jul · guardado
 ┌────────────────────────────────────────────┐   ┌ Este tramo ───────────────┐
 │ DÍAS DE ENTRENO                      5 días│   │ desde el 6 jul            │
 │ 2.600 kcal                                 │   │ 2.486        −2,4 kg      │
 │ ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░        │   │ kcal/día     en 6 semanas │
 │ Proteína   180 g    2,1 g/kg    28 %       │   │ −0,41        3.ª semana   │
 │ Carbos     340 g    4,0 g/kg    52 %       │   │ kg/semana    en rumbo     │
 │ Grasas      70 g    0,8 g/kg    24 %       │   └───────────────────────────┘
 └────────────────────────────────────────────┘   ┌ El reparto ───────────────┐
 ┌────────────────────────────────────────────┐   │ Proteína ▓▓▓▓░░  2,1 g/kg │
 │ DÍAS DE DESCANSO                     2 días│   │ Carbos   ▓▓▓▓▓▓  4,0 g/kg │
 │ 2.200 kcal                                 │   │ Grasas   ▓▓░░░░  0,8 g/kg │
 │ ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░             │   └───────────────────────────┘
 │ Proteína   180 g    2,1 g/kg    33 %       │   ┌ La evolución ─────────────┐
 │ …                                          │   │ T1  2.800 →  84,2 kg      │
 └────────────────────────────────────────────┘   │ T2  2.600 →  82,9 kg      │
 ┌ La semana ─────────────────────────────────┐   │ T3  2.400 →  81,8 kg      │
 │ 17.400 kcal · 2.486 de media al día        │   │            ▁▂▃▅▆          │
 └────────────────────────────────────────────┘   └───────────────────────────┘
 ┌ Pasos ──────────┐ ┌ Cardio ─────────────────┐
 └─────────────────┘ └─────────────────────────┘
 Tus pautas
```

Lo que cambia de sitio, y por qué:

- **La tira, arriba.** Igual que en Entreno: dónde estás en el tiempo, y los dos
  únicos verbos que crean tiempo (`+ fase`, `+ tramo`).
- **La variante deja de ser una tarjeta de formulario y pasa a ser una HOJA.**
  Rótulo del día, la cifra grande, y debajo las tres filas de macro con lo
  pautado y lo que significa —g/kg y %—, que es la misma anatomía que la fila de
  ejercicio: la pauta, y al lado la lectura.
- **Vuelven las dos columnas.** El costado de la dieta es el costado del bloque:
  `.lado-tarjeta`, `.lado-cab`, `.section-label`, `.bloque-cifras` y
  `tarjeta-puerta` con su `.task-hit`. Ni una clase nueva.
- **«La semana» es la cifra que faltaba.** Ponderada por los días que entrena de
  verdad, leídos del programa. Con una sola dieta se enseña igual: `7 × kcal`.

### 4.2 Y la cerrada, con el mismo chasis

```
 Fases │ ▌Definición  + fase                                      ⧉  ⇄  ···
 T1  ▌T2 · en curso   + tramo   │  Entreno · Descanso              guardado
 ┌ El día ────────────────────────────────────┐   ┌ Este tramo ───────────────┐
 │ 2.572 de 2.600 · cuadra                    │   ├ El reparto ───────────────┤
 ├ Desayuno ──────────────────────────────────┤   ├ La evolución ─────────────┤
 ├ Comida ────────────────────────────────────┤   └───────────────────────────┘
 │ …                          + comida        │
 └────────────────────────────────────────────┘
```

La hoja de comidas no se toca —le gusta y funciona—: solo hereda la tira y el
costado. Las dos formas de dieta pasan a ser **la misma pantalla con la mesa
distinta**, exactamente como Entreno tiene la vista de hoja y la de bloque
compartiendo cabecera y costado.

---

## 5. Los movimientos

### Tanda 1 — la pantalla se vuelve panel *(sin tocar el esquema)*

Todo esto se puede construir hoy con lo que ya hay guardado.

- **D-01 · Un solo chasis.** Muere `.dieta.is-macros`. Las dos formas usan
  `mesa + costado`. `NutritionModule.jsx`, `revision.css`.
- **D-02 · El costado de la dieta.** `LecturasDeLaDieta.jsx`, gemelo de
  `LecturasDelBloque`: tres tarjetas-puerta con las clases del costado y su
  ventana cada una. Se alimenta de `kcalSeries`, `macroShareSeries`,
  `weightSeries` y `weeklyRateOfChange` —las cuatro ya escritas y probadas—.
- **D-03 · La variante es una hoja.** `MacroTargetCard` se parte: la cifra y las
  tres filas con g/kg y %, y el lápiz donde está. La ventana de edición se queda
  como está (funciona, y ya enseña la barra del borrador).
- **D-04 · «La semana».** El promedio ponderado por días de entreno reales.
  Señal, no receta: dice lo que hay, no lo que debería haber.
- **D-05 · g/kg en todas partes.** Contra el peso ya registrado, con la fecha a
  la vista para que se sepa de cuándo es.

### Tanda 2 — el tiempo *(esquema nuevo)*

- **D-06 · Los tramos.** Guardar el objetivo con fecha en vez de machacarlo.
  Espejo de cómo viven los bloques dentro del programa (`program.blocks`,
  `blocks.js:34`): una columna `phases jsonb` en `nutrition_plans` con los tramos
  y sus cifras, y las columnas de hoy siguen siendo **el tramo en curso** —así
  ninguna pantalla vieja se rompe ni hay migración de datos que pueda perder
  nada—.
- **D-07 · La tira de la dieta.** `TiraDelPrograma` está atada a `program` y
  `semana`, así que no se reutiliza tal cual: se extrae el chasis (`.tira-*`, los
  `+`, la marca de «en curso») y la dieta pone el suyo. Una gramática, dos
  llenados.
- **D-08 · Comparar tramos.** La ventana: tabla de tramos con kcal, macros, días
  y Δpeso. El gemelo de «el historial de todos los bloques».

### Tanda 3 — el cruce

- **D-09 · La fase de dieta y el bloque de entreno, a la vista el uno del otro.**
  Un bloque de acumulación con una dieta en déficit es información, no un error:
  la app lo enseña y calla.
- **D-10 · La revisión escribe el tramo.** Cerrar una revisión con un objetivo
  nuevo abre el tramo siguiente sin teclearlo dos veces.

---

## 6. Lo que este estudio NO propone

- **No propone números.** Ni «te sobran 150 kcal» ni «deberías subir proteína».
  La ley sigue siendo la misma: resaltar lo que pasó —«le bajaste 200 kcal →
  −0,9 kg en tres semanas»— y callarse el resto. Si algún día se enciende lo de
  proponer, va apagado de fábrica, en gris y diciendo de dónde sale.
- **No toca la hoja de comidas.** Funciona y gusta.
- **No mueve la antropometría.** Los pesajes se siguen registrando donde se
  registran; la dieta solo los **lee**.

---

## 7. Lo que hay que decidir antes de construir

1. **¿El tramo se abre solo o a mano?** Automático (cambiar el objetivo cierra el
   tramo anterior y abre uno) es cero fricción, pero llena la tira de tramos de
   un día cuando alguien corrige una errata. A mano (`+ tramo`, como
   `+ microciclo`) es fiel a Entreno y deja al entrenador decidir qué es un
   cambio de verdad. **Recomiendo a mano**, con corrección del tramo en curso.
2. **¿Hacen falta fases, o bastan los tramos?** Los tramos ya dan la historia.
   Las fases —con nombre e intención, como `BLOCK_INTENTS`— dan el relato («esto
   fue la definición de marzo»). Se pueden dejar para después.
3. **El g/kg, ¿contra qué peso?** El último registrado o la media móvil de tres.
4. **¿Tanda 1 sola, y luego decides?** Es la que no toca el esquema y ya cambia
   la pantalla entera.
