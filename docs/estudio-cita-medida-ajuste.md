# Estudio «La cita, la medida y el ajuste»

*13 de septiembre de 2026. Tres ideas del dueño, planteadas contra el código que
ya existe. No se ha construido nada: esto es el esbozo.*

---

## Por qué son una sola cosa

Las tres ideas son tres eslabones del mismo bucle, y por eso se estudian juntas:

    LA CITA          →  LA MEDIDA        →  EL AJUSTE
    cuándo se revisa    qué se apunta       qué se cambia

Hoy el bucle está roto por los tres sitios y de tres maneras distintas: la cita
la fija quien no debería y en un sitio que nadie encuentra, la medida solo
admite los cuatro números con los que nació la aplicación, y el ajuste sabe
cuánto bajar pero no de dónde.

---

## 0. Lo que YA existe, y no hay que volver a construir

Antes de nada, tres verificaciones contra el repositorio. Dos de ellas
contradicen la premisa de la que salen las ideas, y es mejor saberlo ahora.

**El entrenador SÍ puede fijar la revisión.** `CalendarPanel` es el mismo panel
para los dos (`audience`), y desde el expediente —`/clientes/:id/ficha` →
Calendario, `App.jsx:652`— el entrenador elige el día de la semana, la cadencia
(1, 2 o 4 semanas) y puede **mover una fecha suelta** tocando ese día del mes
(`moveCheckIn`, `calendar.js:492`). La premisa «solo puede hacerlo el cliente»
es falsa en el código y **cierta en la práctica**, que es lo que importa: está
detrás de la sección con menos uso de las seis, y el sitio donde el entrenador sí
busca esa decisión —el protocolo— enseña una que no hace nada. Ver §1.

**El ajuste por hidratos ya existe.** `rescaleMeals` (`nutrition.js:1743`)
reescala por DOS medidas: por kcal —mueve hidratos y grasas, la proteína
quieta— y por HIDRATOS —mueve solo la fuente de hidratos, grasas incluidas en lo
que no se toca—. Lo que no existe es decir **de dónde** salen las 200 kcal sin
hacer la división a mano, y **qué alimentos** las absorben. Ver §3.

**El sitio de las medidas nuevas ya está inventado a medias.** Las preguntas de
escala del protocolo (`SESSION_QUESTIONS`, `CHECKIN_QUESTIONS`, más las propias
del entrenador) son exactamente el mecanismo de «apuntar un número y verlo como
serie». Pero el saneado las capa a enteros de 0–10 sin unidad
(`protocol.js:903`), así que una glucosa de 95 mg/dL o una basal de 36,4 °C no
caben. Ver §2.

---

# 1. LA CITA

## 1.1 Lo que hay, medido

Hay **dos verdades sobre cuándo toca la revisión**, con dos formas distintas,
guardadas en dos claves distintas, y solo una de ellas manda:

| | `preferences.checkin` | `preferences.protocol.schedule` |
|---|---|---|
| Quién lo lee | `domain/calendar.js` | `domain/acciones.js` |
| Forma | `{ weekday: 0–6, everyWeeks: 1/2/4, dates: [] }` | `{ day: 1–7, every: 1–8, remindAfter: 0–6 }` |
| Dónde se edita | Calendario del cliente / del expediente | Taller → Protocolos |
| Qué decide | **Todo**: la cola de revisiones, el calendario, `reviewState`, lo que se le reclama | **`remindAfter` y nada más** |

`protocolos.js:275` empuja `schedule` a la ficha del cliente, así que el dato
viaja; simplemente **no lo lee el motor de la revisión**. El resultado es la
peor clase de avería: el entrenador entra en el protocolo, lee «le pides el
check-in los jueves, cada 2 semanas», lo cambia, y la aplicación sigue
reclamando el lunes de todas las semanas —o no reclama nada—. La pantalla que
más se parece a la decisión es la única que no la toma.

Y una segunda, más callada: **un cliente nuevo nace con `weekday: null`**, o sea
sin revisión. Sin día no se reclama nada y no aparece en ninguna cola
(`currentCheckInPeriod` devuelve `null` a propósito). El bucle del producto está
apagado por defecto para todo el mundo hasta que alguien —normalmente el
cliente, desde su portal— elige un día.

## 1.2 Lo que falta de verdad

1. **Una sola verdad.** Dos claves para la misma pregunta es un error que se
   paga cada vez que alguien toca la que no manda.
2. **Que baje del protocolo.** La cita es «cómo trabajo yo», no «lo que decidí
   para Javier un martes». Fijarla de uno en uno, en la pestaña Ficha, para
   treinta clientes, es el peaje que la idea pide quitar.
3. **La estacionalidad.** La cadencia es fija y son tres valores (1, 2, 4). No
   hay «cada 3 semanas», no hay «cada mes», y sobre todo no hay **cambio de
   ritmo**: semanal durante la definición y mensual en mantenimiento es la forma
   normal de llevar a alguien un año, y hoy exige acordarse de cambiarlo a mano
   el día que toque.

## 1.3 La propuesta

### 1.3.a — El protocolo propone, la ficha decide

Se unifican las dos claves en una: la del calendario, que es la que tiene datos
y la que ya sostiene las tres preguntas (`checkInDates`, `currentCheckInPeriod`,
`periodoAEntregar`). `protocol.schedule` deja de ser una segunda forma y pasa a
ser **el valor por defecto** de esa clave: al aplicar un protocolo a un cliente
que no tiene día, se le siembra el del protocolo.

Nunca pisa un día ya elegido en silencio. Cuando el protocolo cambia y hay
clientes con día propio, se dice y se ofrece —«8 de tus 14 clientes tienen otro
día; ¿se lo cambio?»— con la misma gramática de consecuencias que ya usa el
reparto (`domain/reparto.js`): no se escribe en la semana de nadie sin enseñar
antes qué le pasa a cada uno.

Consecuencias del cambio:

- `sanitizeSchedule` pasa a numerar como el calendario (0–6) o el calendario
  como el protocolo (1–7). Da igual cuál, pero **una sola numeración**: hoy hay
  dos y es un desfase de uno esperando a que alguien las cruce.
- `EVERY_MAX` del protocolo es 8 y `CHECKIN_CADENCES` ofrece 3 valores. Se
  quedan los del calendario más el que falta y todo el mundo pide: **cada 3
  semanas**.
- `remindAfter` sigue donde está: es del protocolo y no de la cita.

### 1.3.b — La fecha suelta, desde donde se ve

Ya funciona (tocar un día del mes) y solo le faltan dos cosas:

- **Aplazar desde la cola.** El gesto real no es «abro el calendario de Javier y
  busco el martes»: es «hoy, en la cola de revisiones, Javier me dice que está
  de viaje». Un «Aplazar» en la fila de la cola que escriba la fecha movida es
  el mismo `moveCheckIn` con otro punto de entrada. Es la ley de la casa: el
  gesto ocurre donde se ve el dato.
- **El porqué, opcional.** Una fecha movida sin motivo, tres semanas después, es
  un día raro en el calendario. `dates` pasaría de `['2026-10-14']` a
  `[{ date, nota? }]`, con saneado que acepte las dos formas —hay datos
  guardados—.

### 1.3.c — La estacionalidad

> **DECISIÓN DEL DUEÑO (13 sep).** El camino corto de este apartado —que el
> bloque pudiera cambiar la cadencia— **queda descartado y no se ha construido**.
> El motivo, con sus palabras: *«no me gusta que el calendario o los check-in
> puedan cambiar con cada bloque; los bloques son bloques de entrenamiento»*.
>
> Y es la lectura correcta del modelo. Un bloque es una unidad de
> ENTRENAMIENTO —sus semanas, sus sesiones, su progresión— y colgarle la cita de
> la revisión le daría una segunda naturaleza: abrir un bloque pasaría a ser una
> operación que además toca el calendario de esa persona, que es justo la clase
> de efecto colateral invisible que este estudio vino a cerrar en §1.1.
>
> **Dónde se define entonces.** En los dos sitios que la tanda 1 ya deja
> unificados, y en ninguno más:
>
>   - **El protocolo** pone la cadencia por defecto —tu forma de trabajar— y la
>     siembra al dar de alta o al aplicarlo (`checkinDesdeHorario`).
>   - **El calendario de la persona** la cambia cuando esa persona concreta
>     necesita otra, y ahí ya se ofrecen 1, 2, 3 y 4 semanas.
>
> Cambiar de cadencia a mitad de temporada es, con esto, dos clics en la pantalla
> que YA habla de la revisión. Lo que no hay es una tercera pantalla que la
> decida por su cuenta.
>
> El camino largo —los tramos— sigue pendiente y sin construir, como estaba.

**Camino largo (sin construir).** La pauta pasa a ser una línea de tramos:

    checkin.tramos = [
      { desde: '2026-09-01', weekday: 1, everyWeeks: 1 },
      { desde: '2026-12-01', weekday: 1, everyWeeks: 4 },
    ]

Es lo que la palabra «estacionalidad» pide de verdad, y es honesto decir lo que
cuesta: `periodStartOf` deja de anclar en la fecha de alta y ancla en el inicio
del tramo, `dueOnOf` tiene que elegir tramo antes de nada, y las fechas movidas
tienen que saber a qué tramo pertenecen. Son tres funciones, todas en el mismo
archivo y con tests, así que es abordable — pero es una ronda entera y no es lo
que la idea pedía («sencillo, que no lleve tiempo»).

El modelo de la tanda 1 queda escrito de forma que el largo quepa después: un
tramo es una pauta con fecha, y una pauta sin fecha es el tramo único.

## 1.4 Lo que NO se hace

- **No se le quita el día al cliente.** Que él pueda elegir cuándo se pesa en
  ayunas y se hace las fotos es correcto y está razonado en el panel. Lo que se
  arregla es que el entrenador pueda ponérselo de entrada y cambiarlo, no que el
  cliente deje de poder.
- **No se materializan las revisiones como filas.** Ya está decidido y escrito
  en `calendar.js`: se derivan de la pauta. Guardarlas obligaría a regenerarlas
  cada vez que se cambia el día.

---

# 2. LA MEDIDA

## 2.1 Lo que hay, y por qué no cabe una glucosa

El registro de antropometría (`anthropometry.js`) tiene la forma:

    { id, date, weight, skinFolds?, perimeters?, nutrition? }

con **seis pliegues y nueve perímetros escritos a mano** (`FOLDS_LABELS`,
`PERIMETER_LABELS`). Fuera de esa lista no hay nada que medir.

El otro sitio donde se apuntan números es el cuestionario: una pregunta de tipo
`scale` produce una serie que la analítica ya sabe dibujar, con su color, su
`lowerIsBetter` y su histórico. Es el mecanismo correcto y está a un paso de
servir. Lo que lo impide es el saneado (`protocol.js:902-905`):

    min: item.min === 0 ? 0 : 1,
    max: Number.isFinite(max) && max >= 2 && max <= 10 ? ... : 10,

O sea: **enteros, entre 0 y 10, sin unidad**. Una temperatura basal (36,4 °C) no
tiene decimales dónde caer; una glucosa en ayunas (95 mg/dL) se sale del rango;
una tensión sistólica no tiene dónde decir que es mmHg. Y ninguna de las tres es
una escala subjetiva del 1 al 10: son **medidas**, con unidad y con instrumento.

Esa es la distinción que el producto todavía no ha hecho y que esta idea obliga
a hacer:

> Una **pregunta** es una opinión con forma de número. Una **medida** es un
> número con unidad que alguien ha tomado con un aparato.

## 2.2 La propuesta: las medidas son un vocabulario del entrenador

El mismo movimiento que el producto ya ha hecho dos veces —las preguntas
propias, los grupos de equivalencia—: una lista corta, con nombre, que el
entrenador escribe una vez y usa en todos sus clientes.

**La forma de una medida:**

    {
      id, name,       // «Glucosa en ayunas»
      unit,           // «mg/dL»
      decimals,       // 0 | 1 | 2
      min, max,       // rango de cordura, para no guardar un 950 de dedazo
      cuando,         // 'revision' | 'diaria' | 'libre'
      sentido,        // 'neutral' | 'lowerIsBetter' | 'higherIsBetter'
      color           // de la paleta de datos, como las preguntas
    }

**Dónde vive.** En `profiles.preferences.medidas.items`, con tope (12 basta: un
entrenador no lleva cuarenta instrumentos). Es exactamente el sitio y el patrón
de `gruposEquiv` —criterio del entrenador, columna abierta, **sin migración**— y
por el mismo motivo: no es una pieza que viaje en la mano, así que no es del
cajón. El coste está medido: una definición son unos 80 bytes.

**De fábrica vienen las que ya existen.** `perimeters` y `folds` dejan de ser dos
constantes y pasan a ser las dos primeras entradas de esta lista, con sus
subcampos. Esto es lo que hace que la idea sea barata en vez de ser un módulo
nuevo: `CHECKIN_BLOCKS` ya tiene la gramática correcta —cada bloque con su
`required | optional | off`— y solo hay que dejar de que la lista sea fija.

**Dónde se apunta.** Dos sitios, y son los dos que ya existen:

- Las de `cuando: 'revision'` son **un paso más del asistente** (`ReviewWizard`),
  con la misma regla que ya rige: lo que el protocolo apaga no existe, no
  aparece vacío ni deshabilitado.
- Las de `cuando: 'diaria'` son **una fila más de la rejilla semanal**
  (`WeeklyCheckIn`). Esa rejilla ya es siete casillas por siete días para el
  peso; que la glucosa matinal sea otra fila es el cambio de un componente, no
  de un modelo.

**Dónde se guarda.** En la misma entrada del histórico, con la forma que ya usan
los pliegues:

    { id, date, weight?, skinFolds?, perimeters?, medidas?: { [id]: valor } }

`compact()` ya deja fuera lo que no se rellenó, y `null` sigue significando «no
medido» y no cero — que en una glucosa no es un matiz, es la diferencia entre un
hueco y una hipoglucemia. **Sin migración**: `history` es jsonb.

**Dónde se ve.** Tres sitios, todos existentes:

- Su gráfica en el panel de evolución, como el peso. `weightSeries` y
  `rollingWeightAverage` se generalizan a `serieDe(history, id)`; hoy están
  escritas contra la clave `weight` y son ocho líneas.
- Su color en `metrics.js`, que es el único sitio donde se decide el color de un
  dato. Una medida nueva coge color del reparto de las propias, como las
  preguntas.
- Su variación desde la revisión anterior en la pantalla de revisión, junto al
  peso. Eso es lo que convierte una tabla de números en información.

## 2.3 Tres avisos

**La privacidad ya tiene sitio, y hay que usarlo.** El protocolo sabe ocultarle
cifras a una persona concreta (`hidden`, con el peso y las kcal). Una medida
nueva tiene que poder entrar en esa lista el primer día: hay gente a la que un
número de glucosa en su portal le hace exactamente el mismo daño que la báscula.

**La aplicación no interpreta.** La ley de la casa es que la aplicación resalta
información y nunca propone. Una medida es un número con unidad y su serie; no
lleva rango «normal», no se pinta en rojo por salirse de nada, y no dice ni una
palabra sobre lo que significa. El rango `min/max` es un filtro de dedazos al
teclear, no un diagnóstico.

**Es dato de salud, y conviene decirlo en voz alta.** El peso y los pliegues ya
lo son, pero una glucemia o una tensión están más cerca de lo clínico y un
entrenador no es un sanitario. Esto no bloquea nada —el entrenador ya apunta esos
datos hoy en una hoja de cálculo— pero sí pide que la aplicación no dé la
impresión de estar valorándolos, que es justo lo que el punto anterior evita. La
parte legal (consentimiento, tratamiento) queda fuera de este estudio y hay que
mirarla antes de sacarlo.

---

# 3. EL AJUSTE

## 3.1 Lo que hay, medido

Al cambiar el objetivo de una variante, `NutritionModule.guardarObjetivo` ofrece
el reescalado (`ReescalarMenu` → `rescaleMeals`), que ya tiene reglas buenas y
escritas: la proteína no se toca, lo que se cuenta por unidades no se toca, todas
las opciones de una comida bajan en la misma proporción para seguir siendo
intercambiables, y los gramos se redondean a medida de cocina.

Y ya tiene dos medidas, no una:

- **por kcal** — mueve todo lo que no sea fuente de proteína (>50 % de su
  energía) ni unidad. Bajan hidratos **y grasas**.
- **por hidratos** — mueve solo lo que sea fuente de hidratos (>50 % de su
  energía). La grasa se queda quieta.

## 3.2 Las dos averías

### Avería 1: la bajada no tiene procedencia, y la medida se adivina

Bajar 200 kcal de hidratos ya es posible, pero el entrenador tiene que hacer la
división él: 200 ÷ 4 = 50 g, y teclear los hidratos en vez de las kcal. La
aplicación **deduce de qué campo has tecleado qué querías hacer**
(`NutritionModule.jsx:766-771`): si cambian los hidratos, manda hidratos; si no,
manda kcal. Con lo cual, tocar los dos campos en el mismo guardado aplica el de
hidratos **en silencio**, y el de kcal que acabas de escribir no hace nada.

Eso es una heurística resolviendo una pregunta que el entrenador puede contestar
en un segundo, y contestándola mal la vez que importa.

### Avería 2: la cesta la elige la aritmética, no el criterio

La regla «es fuente de hidratos si más de la mitad de su energía son hidratos»
mete en el mismo saco la manzana (≈95 % hidratos) y la pasta (≈85 %). En una
bajada, las dos pierden **exactamente la misma proporción**. Y eso no es lo que
hace nadie: la fruta y la verdura se sostienen, y el recorte sale del arroz, la
patata, la pasta y el pan.

Es la avería que la idea nombra, y es la que de verdad hace que hoy el
reescalado se use poco: da un resultado defendible en la hoja de cálculo y raro
en la consulta.

## 3.3 La propuesta, en tres niveles

Se pueden construir por separado y en este orden. El primero es media tarde y ya
resuelve el caso normal.

### Nivel A — El mando: «¿de dónde salen las 200?»

En la misma ventana del reescalado, una fila arriba —antes de la lista de
gramos, que es la respuesta—: **de qué macro sale el ajuste.**

    De dónde sale la bajada de 200 kcal

    ( • )  Todo de hidratos       −50 g HC
    (   )  Hidratos y grasas      −33 g HC · −7 g GR        ← lo de hoy
    (   )  A mano     P [  0 ] g   HC [ 40 ] g   GR [ 4 ] g   · faltan 24 kcal

La aritmética la hace la aplicación en las dos direcciones —kcal a gramos y
gramos a kcal— y el resto se enseña mientras se teclea, con el mismo lenguaje que
ya usa el reparto por comidas («quedan 24 kcal por repartir»).

Esto **mata la heurística** de la avería 1: la medida deja de adivinarse porque
está contestada en la pantalla.

Y el reparto por defecto **es del entrenador, no del ajuste**: «en su mayor parte
siempre voy a querer bajar hidratos» es una forma de trabajar, así que vive en el
protocolo y la ventana llega ya contestada. Un clic en el caso normal; tres
campos en la excepción.

### Nivel B — La cesta: qué alimentos lo absorben

Dos mecanismos, y hacen falta los dos.

**B.1 · Por categoría, y sale gratis.** El catálogo ya tiene categorías
(`FOOD_CATEGORIES`) y una entrada de dieta se resuelve a la suya por nombre con
`matchFood`, que es exactamente lo que hacen las equivalencias hoy. Con eso, sin
ningún dato nuevo, la fuente de hidratos deja de ser un porcentaje y pasa a ser
una lista con orden:

    Recorte de hidratos     Cereales · Tubérculos · Legumbres · Dulces
    Solo si no queda otra   Fruta · Verdura
    Recorte de grasas       Grasas · Frutos secos

El porcentaje sigue siendo el suelo para lo que no cae en ninguna categoría —una
entrada escrita a mano que el catálogo no reconoce— y eso es correcto: mejor la
aritmética de hoy que no mover nada.

**B.2 · La marca por alimento: «esto no se toca».** Lo que la categoría no
acierte lo tiene que poder decir el entrenador en la fila del alimento: el
plátano de después de entrenar, el aceite de la ensalada, los 30 g de avena que
son el desayuno entero de esa persona. Un campo `fijo: true` en la entrada,
hermano de `showAs`, puesto desde el mismo menú de la fila donde ya se cambia
gramos/unidades. Sin migración, y con precedente probado: lo que se cuenta por
unidades ya es un alimento fijo, solo que hoy lo decide la aplicación.

Con A y B, `rescaleMeals` cambia poco: donde hoy pregunta `medida.quieta(...)`
pregunta `elegible(alimento, cesta)`. Todos los invariantes actuales sobreviven
—misma proporción dentro de la comida, opciones intercambiables entre sí,
redondeo de cocina, se rinde y lo dice—.

### Nivel C — El orden: vaciar en cascada (y por qué va aparte)

Lo que un entrenador hace a mano no es bajar todo lo elegible en proporción: es
**vaciar por orden**. Le quita al arroz hasta donde tenga sentido, y si no llega,
entonces toca la patata. Se modela con una prioridad y un suelo por alimento («el
arroz no baja de 60 g»), y el déficit se drena en ese orden.

Va en un nivel aparte porque **rompe un invariante vivo**: hoy todas las opciones
de una comida bajan en la misma proporción, y ésa es la razón por la que después
del ajuste siguen siendo alternativas equivalentes. Una cascada las mueve de
forma distinta a cada una. Tiene arreglo —el déficit se reparte por comida en
valor absoluto y cada opción drena el suyo— pero es un cambio de fondo, con sus
tests, y no hace falta para que el nivel A+B sea útil.

**Recomendación: A y B ahora, C cuando A y B lleven un mes puestos.**

## 3.4 La ley que este apartado no puede romper

La aplicación **no receta**. La cifra la pone el entrenador —eso ya está escrito
en la cabecera de `ReescalarMenu`: «no es una propuesta»— y lo que este estudio
añade es más aritmética a sus órdenes, no un criterio propio. En concreto, y para
que no haya duda al construirlo:

- La aplicación **no propone** bajar 200 kcal porque el peso lleve dos semanas
  plano. Enseña que lleva dos semanas plano.
- La aplicación **no elige** el macro. Trae puesto el que el entrenador dejó
  configurado, y se puede cambiar en el sitio.
- La aplicación **sí** enseña cada gramo que va a cambiar antes de escribir nada,
  y sigue teniendo su «Deshacer». Eso no se toca.

---

# 4. Qué se toca, por archivo

**La cita**

- `src/domain/calendar.js` — `checkInSchedule`, `dueOnOf`, `CHECKIN_CADENCES`, `moveCheckIn`
- `src/domain/protocol.js` / `protocolos.js` — `sanitizeSchedule` deja de ser una segunda forma
- `src/domain/acciones.js` — `diaDelCheckin` pasa a leer la clave buena
- `src/components/calendar/CalendarPanel.jsx` — la pauta ya está aquí; solo cambia de dónde sale
- `src/components/Coach/Taller/ProtocolosPanel.jsx` — el horario pasa a ser el defecto, y lo dice
- `src/domain/portfolio.js` — el «Aplazar» de la cola

**La medida**

- `src/domain/medidas.js` *(nuevo)* — el catálogo, con `perimeters` y `folds` dentro
- `src/domain/anthropometry.js` — `buildAnthropometryLog` acepta `medidas`; `weightSeries` se generaliza
- `src/domain/protocol.js` — `CHECKIN_BLOCKS` deja de ser fijo; `hidden` acepta medidas
- `src/domain/metrics.js` — color de cada medida
- `src/components/anthropometry/ReviewWizard.jsx` · `WeeklyCheckIn.jsx` · `AnthropometryPanel.jsx`
- Sin migración.

**El ajuste**

- `src/domain/nutrition.js` — `rescaleMeals` cambia `quieta` por `elegible`; `fijo` en la entrada
- `src/domain/foodEquiv.js` / `catalog.js` — de ahí sale la categoría, ya resuelta por nombre
- `src/components/nutrition/ReescalarMenu.jsx` — la fila del reparto
- `src/components/Coach/NutritionModule.jsx` — muere la heurística de `guardarObjetivo`
- Sin migración.

---

# 5. Orden de trabajo — **LAS TRES TANDAS, CONSTRUIDAS (13 sep)**

**Tanda 1 — Una sola cita. HECHA.** Las dos claves son una: `protocol.schedule`
pasa a `weekday` (0–6, la numeración del calendario) y `everyWeeks`, lee la forma
vieja al vuelo —sin migración— y deja de ser una segunda verdad: ahora SIEMBRA la
cita del cliente que no tiene día (`checkinDesdeHorario`, en el alta y en «poner
al día») y nunca pisa la de quien ya eligió la suya. Cambiársela a los que
difieren es una operación con nombre y con los nombres a la vista
(`citasDelProtocolo`). Cadencia de 3 semanas puesta. «Aplazar» vive en la cola de
revisiones, con su fecha, su porqué opcional y su «Deshacer».

**Tanda 2 — El ajuste, niveles A y B. HECHA.** Muere la heurística: la ventana
del reajuste PREGUNTA de dónde salen las calorías y llega contestada con lo del
protocolo (`AJUSTES`), con «a mano» para la excepción y el botón esperando a que
cuadre. `rescaleMeals` pasa a dar varias pasadas —una por macro— y cambia
`quieta` por la CESTA: el recorte de hidratos sale de cereales, tubérculos,
legumbres y dulces, la fruta y la verdura solo si no queda otra, y la manzana
deja de bajar con el arroz. Y la marca `fijo` por alimento, en el mismo diálogo
donde se elige gramos o unidades.

**Tanda 3 — Las medidas. HECHA.** `domain/medidas.js` con el catálogo —las de
fábrica (ver §6) y las del entrenador, en `preferences.medidas`—; la lista de
bloques del check-in deja de ser fija; una medida viaja por el lienzo del
check-in como un elemento más (`tipo: 'medida'`, con su id de origen como serie);
se apunta en el asistente de la revisión o en una fila de la rejilla semanal
según su cadencia; y se lee con su serie, su color y su variación, sin
interpretar nada. Se puede ocultar a una persona el primer día.

**Después.** La estacionalidad por tramos (§1.3.c largo) y la cascada (§3.3 C),
si al usarlo se siguen echando de menos.

---

# 6. Lo que este documento NO decide

- Si las medidas son del entrenador o **del equipo**. Se propone `preferences`
  por barato y por coherencia con los grupos de equivalencia; si tienen que
  compartirse entre los entrenadores de un equipo, el sitio es `coach_templates`
  y el coste es una migración.
- ~~Qué medidas vienen **de fábrica** más allá de pliegues y perímetros.~~
  **DECIDIDO por el dueño (13 sep) y construido:** *«temperatura y glucosa creo
  que deberían estar ya diseñados de base, igual que perímetros o pliegues»*.
  Vienen las cuatro candidatas —glucosa en ayunas, temperatura basal, frecuencia
  cardíaca en reposo y la tensión (sistólica y diastólica, dos series bajo un
  rótulo)— con su unidad, sus decimales y su rango de cordura escritos en el
  producto. El razonamiento que lo cierra: si cada entrenador las define, cada
  uno las define distinto, y dos clientes acaban con «Glucosa» y «glucemia» en
  dos series que no se pueden comparar.

  **Todas nacen APAGADAS**, salvo los pliegues y los perímetros, que conservan su
  «opcional» de siempre. La regla de la casa: quien no toque nada no puede notar
  el cambio, y una glucosa encendida de golpe en el check-in de toda la cartera
  sería la aplicación pidiéndole a la gente algo que su entrenador no ha pedido.
  Ver `MEDIDAS_DE_FABRICA` en `domain/medidas.js`.
- Si el cliente puede **crear** una medida suya. Se propone que no: el
  vocabulario es del entrenador, como todo lo demás del protocolo.
- El tratamiento legal del dato de salud (§2.3).
