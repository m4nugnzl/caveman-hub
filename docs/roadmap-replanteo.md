# El roadmap: la línea, la tabla y el replanteo

*21 de septiembre de 2026. Prompt R1. Modelo mínimo y propuesta de esquema.
Aprobado el mismo día, con el veredicto semanal contra el ritmo del replanteo
(decisión 2a) y lo recomendado en las demás. Migración:
`0123_el_replanteo_y_las_intervenciones.sql`. Enmienda en `producto.md` §5.5.*

---

## Resumen

1. **El replanteo es un dato de la fase**, no una tabla: una lista `jsonb`
   en `client_phases` (`replanteos`), igual que los caminos del cruce (0073).
   Cada uno lleva la semana, el peso base (la media de esa semana, guardada
   como número) y el ritmo en %. §1.
2. **`phaseProjection` no cambia de forma: crece.** Sin replanteos devuelve
   exactamente lo mismo que hoy. Con replanteos, `objetivo` pasa a ser el de
   la expectativa vigente y aparecen `objetivoOriginal` y `desvioOriginal`.
   `TarjetaProgreso` sigue funcionando sin tocarla. §1.
3. **El ritmo se sigue guardando en %.** «Mismo ritmo» en un replanteo
   significa el mismo %, así que los kg/semana se recalculan sobre la nueva
   base, y la pantalla enseña los dos. §2.
4. **Las intervenciones son eventos del calendario**, no una tabla nueva: dos
   tipos más (`refeed`, `diet_break`) y dos columnas (`hasta`, `kcal`). Las
   vacaciones ya son `rest`. La descarga de entreno ya existe como intención
   de bloque, y no la duplico. §3.
5. **El destino y la temporada ya están hechos** (0122, esta misma mañana).
   No propongo nada nuevo. §4.
6. **Fase y bloque van en paralelo: confirmado otra vez**, ahora con fases
   reales en la demo. El bloque «Intensificación» de Iván empieza en su
   volumen y sigue en su definición. §5.
7. **La tabla va por semana natural (el lunes), no por semana de programa.**
   Es la única forma de no heredar el desfase de `weekStartOfProgramWeek`. §6.

Una migración, solo aditiva: una columna en fases, dos en eventos, dos tipos de
evento y las cuatro políticas de eventos reescritas con una condición más.

---

## 0. Qué he leído y qué he comprobado

He leído `roadmap.js` (sobre todo `phaseProjection`), `goals.js`, `fork.js`,
`calendar.js`, `timeline.js`, `reviews.js` (`planSnapshot`), `blocks.js`
(`blocksOf`, `blockTraits`, `tramoDelBloque`), las migraciones 0009, 0028, 0073
y 0122, `useRoadmap.js`, los traductores de `mappers.js`, `TarjetaProgreso.jsx`
y las enmiendas de §5.5 de `producto.md`: las del 28 de agosto y la de hoy.

Los datos son los de la **base local de la demo**. Solo un cliente tiene fases,
Iván Tormo, sembrado esta mañana para 6A:

| Fase | Dirección | Ritmo | Desde | Hasta |
|---|---|---|---|---|
| Volumen | bulk | 0,25 % | 13 jul | 6 sep |
| Definición | cut | 0,6 % | 7 sep | 13 dic |
| Puesta a punto | maintain | 0 | 4 ene | 24 ene |

Tiene como destino el «Nacional AEFN» (31 ene 2027), dos bloques
(Acumulación M1–M5 e Intensificación desde M6, con 8 previstas) y estas medias
semanales:

| Semana | 20 jul | 27 jul | 3 ago | 10 ago | 17 ago | 24 ago | 31 ago | 7 sep | 14 sep |
|---|---|---|---|---|---|---|---|---|---|
| Media (kg) | 75,0 | 75,0 | 75,2 | 75,1 | 75,5 | 75,5 | 75,6 | 75,8 | 75,9 |

No he consultado producción. Todo lo que sigue sirve igual con cero fases, que
es lo más habitual en una cartera.

---

## 1. El replanteo frente a `phaseProjection`

### Qué dice hoy el código, y por qué tiene razón

`phaseProjection` fija la expectativa en el peso de **cuando empezó la fase** y
explica por qué no la vuelve a fijar: *«tomarlo del peso de hoy convertiría
cada semana de retraso en un objetivo nuevo y más fácil»*. Si la base se moviera
sola, el sistema no vería nunca una desviación: la iría tapando.

El replanteo respeta eso por tres vías:

- **Nunca es automático.** Lo hace el entrenador sobre una semana concreta. El
  sistema no lo propone, no lo recuerda y no se lo sugiere (el límite del
  encargo).
- **Queda fechado.** Se sabe desde qué semana cuenta y cuándo se decidió.
- **No borra la expectativa anterior.** La original sigue calculándose y se
  dibuja como fantasma. La desviación se puede leer contra las dos.

### Dónde se guarda: `client_phases.replanteos`

Tu hipótesis, una lista dentro de la fase, es la buena. Las razones son las
mismas por las que el cruce vive en `next_options` (0073):

- **No hace falta ninguna política nueva.** Hereda las de la 0028: el entrenador
  escribe con la suscripción al día y el cliente lee.
- **No hace falta ningún join.** Llega con las fases, que ya carga `useRoadmap`.
- **Va con su fase.** Si se borra la fase, sus replanteos se van con ella, sin
  código aparte.
- **Una tabla no aporta nada que haga falta.** Nadie pregunta por los
  replanteos de toda la cartera, y no se solapan con nada que haya que impedir
  en la base.

> **Ocultos en pantalla, pero legibles por el cliente** (22 sep 2026). Los
> replanteos y los bloques en borrador (`workout_data.draft_blocks`) están en el
> mismo caso: el portal del cliente no los enseña, pero la fila la puede leer él
> mismo (0028 aquí; `workout_client_read` en los borradores). Ocultarlos es
> cosa de la interfaz, no un permiso. Nada que no pueda leer el cliente se
> escribe en ellos. Por eso la nota del borrador lleva un aviso discreto de que
> no es privada.

La forma de cada elemento, que se sanearía en `domain/roadmap.js`:

```json
{
  "semana":   "2026-09-14",
  "pesoBase": 75.9,
  "ratePct":  0.6,
  "nota":     "",
  "creadoEl": "2026-09-21T10:12:00Z"
}
```

- **`semana`** es el **lunes** de la semana cuya media se toma como base. Así la
  fila de la tabla y el replanteo usan la misma clave.
- **`pesoBase` se guarda como número, no como referencia.** Si mañana alguien
  añade un pesaje atrasado de esa semana, la base no se mueve sola. Por defecto
  se propone la media de la semana. El entrenador puede corregirla, porque la
  igualación es suya.
- **`ratePct`** es el ritmo desde ahí. Por defecto, el vigente. Puede cambiarse.
- **`nota`** es opcional, y corta: «tras las vacaciones».
- **`creadoEl`** registra cuándo se decidió, que no tiene por qué coincidir con
  la semana a la que se aplica. Se puede igualar el martes sobre la semana
  pasada.

Reglas del dominio (no caben en un CHECK porque dependen de la fase):

- La semana tiene que estar **dentro de la fase** y **no puede ser futura**:
  sin pesajes no hay media. Si una fase se acorta y un replanteo se queda
  fuera, se ignora al leer (no se borra: vuelve si la fase se alarga).
- **Uno por semana.** Igualar dos veces la misma semana sustituye al anterior.
- **Se puede quitar.** Sirve para corregir una igualación hecha por error, y
  con quitarla la expectativa vuelve a la de antes. El original no se pierde
  nunca, porque no depende de los replanteos.

En la base, lo mismo que se hizo con el cruce: `NULL` si no hay replanteos (y
nunca `[]`), debe ser un array y lleva un tope de 52 elementos para no inflar la
fila de una fase abierta.

### La expectativa: una recta por tramos

```
esperado(d) = base_k + ritmoKg_k × (d − inicio_k) / 7
```

- **Tramo 0:** empieza en el arranque de la fase. `base_0` es el `desde` que
  calcula hoy `phaseProjection` (el pesaje más cercano al arranque) y `ritmo_0`
  es el `rate_pct` de la fase. **Esta es la expectativa original, y no cambia.**
- **Tramo k:** empieza en el **jueves** de la semana del replanteo k, con su
  `pesoBase` y su ritmo.

El jueves no es un capricho. La media de una recta a lo largo de siete días es
su valor en el día del medio. Por eso cada fila de la tabla compara la media
semanal con el esperado en su jueves: media contra media. Y por eso, en la
semana en la que se iguala, la desviación vigente sale 0 exacto.

`ritmoKg_k = signo × ritmo_k/100 × base_k`, que es `targetRateKg(goal, base)`
de `goals.js` aplicado a la base del tramo. No hace falta aritmética nueva.

**Un ejemplo con Iván.** La definición empieza el 7 sep. El último pesaje antes
de esa fecha (6 sep) marca 75,5 kg, y el 0,6 % de 75,5 son −0,45 kg/semana. La
semana del 14 sep, el esperado del jueves (17 sep) es 75,5 − 0,453 × 10/7 ≈
74,9, y la media real es 75,9: **+1,0 kg** sobre lo previsto. Si el entrenador
iguala ahí con el mismo ritmo, la nueva base es 75,9, el ritmo pasa a
−0,46 kg/semana y el esperado al final de la fase (13 dic) queda en 70,2 kg, en
vez de los 69,2 del plan original. El fantasma sigue dibujando los 69,2.

El ejemplo deja ver una irregularidad que ya existía. La base original sale de
**un pesaje suelto** (75,5 kg), y la semana de esos días promedia 75,6 kg. No
lo cambio: si lo cambiara, `TarjetaProgreso` daría números distintos de los de
hoy. Si quieres que la original también salga de una media semanal, es un
cambio de una línea, pero mueve cifras que ya se enseñan.

### Qué se dibuja como fantasma

La línea vigente es la que dice qué se espera en cada momento, así que a partir
de cada replanteo **salta** a la nueva base. Ese salto con su fecha ya cuenta
la historia de cada igualación. Además, **la expectativa original entera** se
dibuja como fantasma hasta el final de la fase.

Las intermedias (la que valía entre el replanteo 1 y el 2) no se prolongan.
Con tres replanteos habría cuatro rectas y no se leería ninguna. Si alguna vez
hace falta, se calculan igual: el dato está.

### Cómo cambia `phaseProjection` sin romper nada

La firma y la forma se quedan. Lo nuevo va **añadido**:

| Campo | Hoy | Con el cambio |
|---|---|---|
| `desde` | base del arranque | igual |
| `hoy`, `proyectado`, `semanas`, `restantes` | — | igual |
| `objetivo` | base + ritmo × semanas | **esperado vigente** al final de la fase |
| `desvio` | proyectado − objetivo | contra el vigente |
| `objetivoOriginal` | — | **nuevo**: el de siempre |
| `desvioOriginal` | — | **nuevo** |
| `base`, `replanteo` | — | **nuevos**: la base vigente y el último replanteo, o `null` |

Sin replanteos, `objetivo === objetivoOriginal` y todos los números son los de
hoy. Así, `TarjetaProgreso` («Acaba 1,2 kg por encima del objetivo») funciona
sin cambios, y con replanteos pasa a medir contra lo vigente, que es lo que
decidió el entrenador. Añadir «(0,6 kg sobre el plan original)» a esa frase es
opcional y se decide al diseñar.

El cálculo nuevo va en una función pura, `expectativaDeFase(fase, history)`,
que devuelve los tramos. `phaseProjection` la usa, y también la usan la tabla y
la línea, así que hay una sola cuenta.

### La decisión que te toca: ¿el veredicto semanal usa el ritmo del replanteo?

`reading.js` juzga cada semana con `rateVerdict(effectiveGoal(...))`: «En
rumbo», «Por debajo del ritmo»… Si un replanteo cambia el ritmo (de 0,6 % a
0,4 %), hay dos opciones:

- **(a) Sí (recomendado).** `phaseGoal(fase, fecha)` devuelve el ritmo del
  último replanteo hasta esa fecha. La forma de `effectiveGoal` no cambia, y
  sin replanteos da lo mismo que hoy. El veredicto juzga contra lo que está
  en vigor, que es lo que el entrenador decidió.
- **(b) No.** El veredicto sigue con el ritmo de la fase. En ese caso la tarjeta
  diría «Por debajo del ritmo» de alguien que va justo al ritmo que acabas de
  poner.

Un replanteo con **el mismo** ritmo no cambia el veredicto en ninguna de las
dos, porque el veredicto mide la pendiente y no la distancia a la recta.

---

## 2. El ritmo: en %, y en pantalla también en kg/semana

No cambia nada del modelo. `rate_pct` y `ratePct` siguen en % del peso, por la
razón que da `goals.js`.

Hay que dejar escrita una consecuencia: **«mismo ritmo» significa el mismo %**.
Un replanteo que baja la base de 84 a 82 kg manteniendo el 0,6 % pasa de
−0,50 a −0,49 kg/semana. Es lo correcto y es poco, pero la pantalla tiene que
decirlo: el ritmo se enseña como «0,6 % · −0,49 kg/sem». Los kg salen siempre de
la base **del tramo**, nunca del peso de hoy. Si salieran del peso de hoy, cada
semana cambiarían solos.

---

## 3. Intervenciones dentro de una fase

### Extender el calendario, no crear una tabla

Tienen fecha, duración, nota y a veces kcal, y se enlazan con la fase **por
fecha**, como todo lo demás. Eso ya es un evento del calendario, y el
calendario ya tiene `rest` («Viaje, vacaciones, semana de descarga»). Una tabla
aparte duplicaría el calendario: dos sitios donde apuntar las vacaciones, cuatro
políticas nuevas, y el cliente sin verlas en su calendario.

Lo que le falta a `client_events` (0009) para esto:

| Falta | Hoy | Propuesta |
|---|---|---|
| Duración | solo `date` | `hasta date` (nula = un día; ambos extremos incluidos, como en las fases) |
| kcal | no hay | `kcal integer`, solo en refeed y diet break |
| Tipo | 6 tipos | + `refeed`, + `diet_break` |
| Nota | `title` (texto libre, obligatorio) | **nada nuevo**: el título es la nota («Refeed: HC a 450 g») |

**Cómo encaja cada intervención del encargo:**

| Intervención | Dónde vive | Por qué |
|---|---|---|
| Refeed | evento `refeed`, con `kcal` opcional | es una pauta de dieta con fecha |
| Diet break | evento `diet_break`, con `hasta` y `kcal` | igual, pero de semanas |
| Vacaciones | evento `rest` (ya existe) + `hasta` | ya era su sitio; le faltaba la duración |
| Descarga | **intención `descarga` del bloque** (ya existe) | es estructura del entreno |

Sobre la descarga: si también fuera un evento, habría dos sitios donde decir
que la semana 9 es de descarga, y tarde o temprano dirían cosas distintas. La
tabla ya la enseña porque lee el bloque vigente de cada semana. Si la descarga
es una semana suelta dentro de un bloque, el entrenador la puede apuntar como
`rest`, igual que hoy. Si prefieres un tipo `deload` propio, es una línea más
en el CHECK. **Lo decides tú (decisión 3).**

### Reglas

- `hasta` solo en `rest`, `refeed` y `diet_break`. En una cita o en una revisión
  no tiene sentido, y así el resto del calendario no tiene que aprender a pintar
  eventos de varios días.
- `kcal` solo en `refeed` y `diet_break`, entre 800 y 8.000: lo humano, igual
  que el peso en `clientGoal`.
- **Solo el entrenador crea, cambia o borra un refeed o un diet break.** Son
  pauta, como el ancla. El cliente los ve, pero no puede apuntarse un refeed de
  3.000 kcal. Las vacaciones (`rest`) siguen siendo de los dos, como hoy.
- **No mueven la expectativa.** Un diet break de dos semanas en mitad de una
  definición no detiene la recta esperada, porque eso sería reajustar solo. La
  tabla marca esas semanas y la línea las sombrea. Si después el entrenador
  quiere igualar, iguala.

### Lo que hay que vigilar

- **Privacidad de cifras.** A quien se le ocultan las kcal
  (`preferences.protocol.hidden`), su calendario no puede enseñar las kcal de
  un refeed. Es una regla de pantalla (`useOculto()`), como todo lo de
  `Oculto.jsx`. La base se las sirve igual, que es lo que ya pasa con su dieta.
- **`eventsByDate`** agrupa por el día de inicio. Con `hasta`, un evento de
  varios días tiene que aparecer en cada uno de sus días. Es un cambio de
  consumidor y está en §8.

---

## 4. El ancla y la temporada: ya existen

Se construyeron esta mañana (6A, migración 0122, enmienda de hoy en §5.5):

- **El ancla** es `client_events.ancla`: un `race` o un `goal` marcado, que solo
  toca el entrenador. La cuenta atrás es `cuentaAtras`, y la medida del plan
  contra la fecha es `llegadaAlAncla` (llega, hueco, exceso o abierta), que se
  dibuja y no se valida.
- **La temporada se deriva**: `temporadas(phases, anchors)` devuelve las fases
  entre un ancla y la siguiente. No hay tabla.
- **Sin ancla todo funciona igual.** Lo que va detrás del último destino es
  `sinDestino`.

Para el roadmap solo añado un uso: **el rango de la línea y de la tabla es la
temporada en curso**, desde el inicio de su primera fase hasta el destino. Sin
destino, desde la primera fase hasta el final de la última, o hasta hoy si la
última está abierta.

En la demo sale algo que conviene saber antes de diseñar. Entre el final de la
definición (13 dic) y la puesta a punto (4 ene) hay **tres semanas sin fase**, y
la puesta a punto acaba **6 días antes** del Nacional. La tabla tiene que
enseñar filas sin fase, tanto dentro de la temporada como al final: son
información (`phaseAt` devuelve `null`) y no un error.

---

## 5. Fase y bloque: carriles paralelos, confirmado con datos

En 6A se confirmó con la demo sin fases. Ahora hay fases y se ve directamente:

| | 12 jul – 15 ago | 16 ago – 6 sep | 7 sep – … |
|---|---|---|---|
| Fase | Volumen | Volumen | **Definición** |
| Bloque | Acumulación (M1–M5) | Intensificación (M6…) | Intensificación (8 previstas) |

**El bloque Intensificación empieza en el volumen y sigue en la definición.**
Si los bloques se anidaran en las fases, este bloque no podría existir: habría
que partirlo en dos, y el entreno cambiaría de estructura solo porque cambió la
dieta, cuando no ha cambiado nada del entreno.

Además, el bloque abierto no tiene final (`toWeek` es nulo), y un tramo sin
final no cabe dentro de uno que lo tiene.

La tabla los lee por separado en cada semana: la fase con `phaseAt(jueves)` y
el bloque con `tramosDeLosBloques` (la fecha de sus microciclos, `micro.date`),
**nunca** con `weekStartOfProgramWeek`.

---

## 6. La tabla: qué es cada fila

No es un dato nuevo: es una **vista derivada**. Hay una fila por **semana
natural** (el lunes) en el rango de §4, pasadas y futuras:

| Columna | De dónde sale | En las semanas futuras |
|---|---|---|
| Semana | el lunes; «S3 de 14» dentro de su fase | igual |
| Fase | `phaseAt(jueves)` | igual |
| Peso medio | `buildWeeklySeries` (ya va por semana natural) | vacío |
| Esperado | `expectativaDeFase`, tramo vigente | la recta vigente |
| Desviación | media − esperado vigente (y contra el original, si hay replanteos) | vacía |
| Dieta pautada | la foto del plan de las revisiones cerradas (`check_ins.week_start` es lunes natural), arrastrada como en `nutritionTrack` | **vacía**: el plan de hoy no se proyecta al futuro |
| Bloque | `tramosDeLosBloques`: nombre, intención y semana del bloque | lo previsto (`previstoHasta`), a trazos |
| Intervenciones | eventos `refeed`, `diet_break` y `rest` que tocan esa semana | igual, si ya están apuntadas |
| Replanteo | el de esa semana, si lo hay | — |
| Revisión | si esa semana se cerró revisión | — |

Dos detalles que evitan errores ya conocidos:

- **No se construye con `reviewTimeline`.** Esa función va por semana de
  programa a través de `weekStartOfProgramWeek`, que en la demo se desvía entre
  3 y 21 semanas. `nutritionTrack` sí se reutiliza, porque solo compara
  `weekStart` y acepta filas de semana natural sin cambios. Lo único que hay
  que añadir es un tope: el plan de hoy no se arrastra más allá de la semana
  actual.
- **El replanteo se hace desde la fila.** Es el único gesto de escritura de la
  tabla: «Igualar aquí» en una semana pasada con media. La tabla no destaca qué
  semana convendría igualar, ni colorea la desviación como alarma. Enseña el
  número.

La **línea** dibuja las mismas filas: la media real, la recta vigente con sus
saltos, el fantasma original, las fases de fondo (las bandas que ya pinta
`TarjetaProgreso`) y las intervenciones sombreadas. La forma y el sitio donde
van se deciden al diseñar. Este documento solo fija de dónde sale cada número.

---

## 7. La migración propuesta (sin escribir)

`0123_el_replanteo_y_las_intervenciones.sql`. Solo aditiva. Se para sola si
faltan la 0028, la 0073 o la 0122.

```sql
-- Fases: los replanteos
ALTER TABLE public.client_phases ADD COLUMN IF NOT EXISTS replanteos jsonb;
ALTER TABLE public.client_phases ADD CONSTRAINT client_phases_replanteos_shape CHECK (
  replanteos IS NULL OR (
    jsonb_typeof(replanteos) = 'array'
    AND jsonb_array_length(replanteos) BETWEEN 1 AND 52
  )
);

-- Eventos: dos tipos, la duración y las kcal
ALTER TABLE public.client_events DROP CONSTRAINT client_events_kind_check;
ALTER TABLE public.client_events ADD CONSTRAINT client_events_kind_check CHECK (
  kind IN ('checkin','note','appointment','goal','rest','race','refeed','diet_break')
);
ALTER TABLE public.client_events ADD COLUMN IF NOT EXISTS hasta date;
ALTER TABLE public.client_events ADD COLUMN IF NOT EXISTS kcal integer;
ALTER TABLE public.client_events ADD CONSTRAINT client_events_hasta_ordenada
  CHECK (hasta IS NULL OR (hasta >= date AND kind IN ('rest','refeed','diet_break')));
ALTER TABLE public.client_events ADD CONSTRAINT client_events_kcal_intervencion
  CHECK (kcal IS NULL OR (kind IN ('refeed','diet_break') AND kcal BETWEEN 800 AND 8000));

-- RLS: las cuatro políticas de la 0122, reescritas con una condición más en la
-- rama del cliente:  AND kind NOT IN ('refeed','diet_break')
```

Las políticas de fases no cambian: la columna nueva entra sola, igual que
`next_options`.

### Qué pasa con los datos existentes

**Nada.** `replanteos` nace nula en todas las fases, `hasta` y `kcal` nacen
nulas en todos los eventos, y ningún evento existente es de un tipo nuevo. El
CHECK de `kind` se sustituye por otro que acepta todo lo anterior. No se
reescribe ninguna fila. Hasta que alguien iguale o apunte un refeed, la
aplicación se comporta exactamente igual.

Si el código llega antes que la migración, `useRoadmap` ya se traga la columna
que falta (`replanteos` llega `undefined` y se traduce a `null`), y el alta de
un refeed fallaría por el CHECK de `kind`. Por eso esa acción no se enseña
hasta que la migración esté aplicada.

---

## 8. Qué consumidores cambian

| Dónde | Cambio |
|---|---|
| `domain/roadmap.js` | `expectativaDeFase` (nueva); `phaseProjection` con los campos añadidos; `phaseGoal(fase, fecha)` si se aprueba la decisión 2a; saneado y validación de replanteos |
| `domain/roadmapTabla.js` (nuevo) | `semanasDelPlan`: las filas de §6 |
| `domain/timeline.js` | `nutritionTrack` con tope opcional en la semana actual (los consumidores actuales no lo pasan y no cambian) |
| `domain/calendar.js` | dos tipos en `EVENT_KINDS`; `eventsByDate` reparte los eventos con `hasta` por cada uno de sus días |
| `lib/mappers.js` | `replanteos` en fases; `hasta` y `kcal` en eventos |
| `context/useRoadmap.js` | `igualar(faseId, replanteo)` y `quitarReplanteo`, que reescriben la lista de la fase; carga de las intervenciones del rango (hoy solo carga las anclas) |
| `TarjetaProgreso.jsx` | nada obligatorio; la frase del objetivo puede nombrar el original |
| `reading.js`, `effectiveGoal` | nada si se elige 2b; con 2a no cambia su código, porque el cambio queda dentro de `phaseGoal` |
| Calendario (`CalendarPanel`, `CoachCalendar`, portal) | pintar los eventos de varios días y ocultar las kcal con `useOculto()` |
| Pruebas | `roadmap.test.js`: sin replanteos, `phaseProjection` da lo mismo que hoy (esta es la prueba que protege a los consumidores); tramos, jueves, uno por semana, el replanteo fuera de la fase se ignora; `ejeTemporal.test.js` no cambia |

---

## 9. Lo que no hace

- **No sugiere igualar.** No destaca ninguna semana ni marca «llevas 3 semanas
  por encima», ni en la tabla ni en la bandeja.
- **No iguala solo**, ni cuando la desviación es grande ni al terminar una
  intervención.
- **No avisa.** No hay notificación, ni aviso en el Inicio, ni punto rojo.
- **Una intervención no toca la recta.** Cambiar la recta sería reajustar.

La desviación se enseña como un número con su signo, contra lo vigente y, si
hay replanteos, contra lo original.

---

## Lo que necesito que decidas

1. **Dónde se guardan los replanteos:** `client_phases.replanteos` (jsonb), con
   la forma de §1. *Recomiendo sí.*
2. **El veredicto semanal con el ritmo del replanteo:** (a) sí, (b) no.
   *Recomiendo (a).*
3. **La descarga:** intención de bloque o `rest` (sin tipo nuevo), o un tipo
   `deload` propio. *Recomiendo sin tipo nuevo.*
4. **Refeed y diet break solo los escribe el entrenador**, y el cliente los ve.
   *Recomiendo sí.*
5. **El cliente ve sus replanteos** (lee sus fases enteras, 0028), así que ve
   también el fantasma si se le enseña la línea. Enseñárselo o no es una
   decisión de pantalla. La base no puede esconder una columna.

Aprobado esto, escribo la 0123 y enmiendo `docs/producto.md` §5.5 con el mismo
formato que las enmiendas existentes.
