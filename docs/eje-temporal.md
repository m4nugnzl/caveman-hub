# El eje temporal: fases, anclas y temporada

*21 de septiembre de 2026. Prompt 6A. Diagnóstico y propuesta de esquema para
conectar lo que ya existe.*

> **Aprobado y construido el mismo día**, con las cuatro recomendaciones:
> las fases no se mueven al mover el destino y hay una casilla para mover las
> que aún no han empezado; el cliente no toca un destino; `pesoLimiteKg` entra
> ya; y el desfase de `weekStartOfProgramWeek` queda para un encargo aparte.
> Migración `0122_el_plan_apunta_a_una_fecha.sql`; enmienda en
> `docs/producto.md` §5.5.
>
> Dos cosas se hicieron distinto de lo escrito abajo: el destino se fija en
> **Sus fases** y no con una casilla en el calendario (es una decisión sobre
> el plan, y así hay un solo sitio donde moverlo; el calendario solo lo
> señala), y la base además impide que un destino sea privado
> (`client_events_ancla_compartida`), porque el cliente lee su plan entero.

---

## Resumen en diez líneas

1. **Fase y bloque no se anidan: confirmado.** Son dos carriles sobre un mismo
   eje de fechas.
2. **Pero el puente que proponía el encargo está mal.** `weekStartOfProgramWeek`
   no da la fecha de un microciclo. En la demo se equivoca en los seis clientes,
   y en cuatro de ellos por entre 3 y 21 semanas. El puente bueno es la fecha
   que ya lleva cada microciclo (`microcycle.date`). §1.
3. **El ancla es una marca en el evento, no una tabla nueva:** `client_events.ancla`.
   El plan se mide contra ella **por fechas**, sin enlazar cada fase. §2.
4. **Mover el ancla:** recomiendo no tocar las fases por defecto y ofrecer, con
   un gesto explícito, desplazar las que aún no han empezado. Estirarlas queda
   descartado. **Esto lo decides tú.** §3.
5. **Peso objetivo por fase: no.** Sería una segunda versión del mismo dato que
   ya da `ritmo × semanas`. Sí he encontrado un **fallo real**: con una fase en
   curso, el portal del cliente pierde el peso objetivo. §4.
6. **La temporada se deriva sola:** son las fases que hay entre un ancla y la
   siguiente. No hace falta tabla. §5.
7. **Competición:** un `jsonb` en el evento (federación, categoría, sede y,
   si se quiere, peso límite). Sin importación. §6.

Hay que migrar una vez, y solo se añaden cosas: dos columnas, un CHECK, un
índice y cuatro políticas reescritas. Hace falta una función más **solo si**
en §3 eliges desplazar las fases.

---

## 0. Lo que he leído, y lo que no he podido comprobar

Leí `0028`, `0073`, `roadmap.js`, `fork.js`, `goals.js`, `calendar.js`, la
parte de `blocks.js` que pedías (`blocksOf`, `blockTraits`, `BLOCK_INTENTS`,
`horizonteDeBloque`, bitácora), `RoadmapPanel.jsx`, `FasesPopup.jsx`,
`useRoadmap.js` y las enmiendas del 28 de agosto en `producto.md`. Los datos
son los de la **base local de la demo** (6 clientes, 0 fases, 0 eventos).

**No he consultado producción.** La cifra de §1 sale de la demo. La consulta
para medirla en producción, solo de lectura, está al final de §1.

---

## 1. Fase y bloque

### La hipótesis: dos carriles y no anidados. **Se confirma.**

Las razones están en el código, no son una preferencia:

| | Fase (`client_phases`) | Bloque (`workout_data.blocks`) |
|---|---|---|
| Qué mide | la dirección del cuerpo | la estructura del entreno |
| Unidad | días (`starts_on`/`ends_on`) | microciclos (`fromWeek`/`toWeek`) |
| Final | puede estar abierto (`ends_on` NULL) | el último SIEMPRE está abierto; `plannedWeeks` es opcional |
| Qué la cambia | una decisión sobre el cuerpo | un cambio de split (`openNextBlock`) |
| Invariante | no se solapan (`EXCLUDE`, 0028) | contiguos por número de semana |

Una definición de 12 semanas atraviesa sin problema acumulación →
intensificación → descarga, y un bloque de hipertrofia puede seguir igual
aunque se pase de definición a mantenimiento. Si se anidaran:

- **Se rompe el bloque abierto.** Un bloque sin final no puede quedar dentro de
  un tramo con final. Habría que obligar a poner `plannedWeeks`, y eso choca con
  lo que dice `blocks.js`: *«una rutina dura hasta que hay motivo para
  cambiarla»*.
- **Se rompe la independencia de los dos gestos.** Mover el final de una fase
  arrastraría el programa, y cerrar un bloque tendría que respetar los límites
  de la fase. Dos editores (Entreno y Sus fases) acabarían escribiendo en el
  mismo sitio.
- **Hace falta migrar el `jsonb` del programa:** un `phaseId` en cada bloque de
  cada cliente, y decidir a qué fase pertenecen los bloques que ya existen, que
  hoy no pertenecen a ninguna.

Tenerlos en paralelo no rompe nada. Lo único que se pierde es un enlace
explícito del tipo «este bloque sirve a esta fase», y el entrenador lo ve igual
al tenerlos uno encima del otro.

### El puente entre los dos: **esta parte se refuta**

`weekStartOfProgramWeek(alta, N)` calcula *lunes del alta + (N − 1) × 7*. Eso
supone tres cosas que no se cumplen:

1. que el microciclo 1 empieza la semana del alta;
2. que no hay pausas entre microciclos;
3. que un microciclo dura 7 días, cuando en un ciclo rotativo dura
   `cycleSpanDays` (5, 9…; ver `nextCycleDate`, `training.js:1015`).

Cada microciclo ya guarda su propia fecha (`microcycle.date`, la pone
`nextCycleDate` al montarlo), y `anclaDelCiclo` ya la usa como la verdad.
Comparación en la demo:

| Cliente | Alta | M1 según `weekStartOfProgramWeek` | M1 de verdad | Desfase |
|---|---|---|---|---|
| Iván Tormo | 22 feb | 16 feb | 12 jul | **21 semanas** |
| Álvaro Pino | 5 abr | 30 mar | 12 jul | **15 semanas** |
| Javier Ortega | 24 may | 18 may | 12 jul | **8 semanas** |
| Marta Ruiz | 28 jun | 22 jun | 12 jul | **3 semanas** |
| Claudia Rey | 23 ago | 17 ago | 23 ago | 6 días |
| Nerea Sanz | 26 jul | 20 jul | 26 jul | 6 días |

Hasta en los dos que casan hay 6 días de desfase: el alta cae en domingo,
`weekStart` lleva al lunes anterior y el microciclo está fechado el domingo.

**Qué pasaría si se construyera con el puente del encargo:** el carril de
bloques de Iván aparecería entre febrero y abril, cuando entrenó entre julio y
septiembre. Sus bloques y sus fases quedarían desalineados meses sin que nada
lo avisara.

**El puente que propongo** es una función pura nueva en `blocks.js`, sin tocar
el esquema:

    tramoDelBloque(program, block, client) →
      { desde, hasta, previstoHasta, estimado }

- `desde` es la fecha del primer microciclo del bloque.
- `hasta` es la fecha del último microciclo + lo que dura ese ciclo − 1.
- `previstoHasta` solo existe en el bloque abierto con `plannedWeeks` mayor que
  lo ya escrito: `hasta` + lo que falta × lo que dura el ciclo. Se dibuja
  **a trazos**, porque es su plan y no algo hecho.
- `estimado` se activa cuando un microciclo no tiene `date` (programas viejos).
  Solo entonces se cae a `weekStartOfProgramWeek`, y se marca como estimado.

### Lo que este hallazgo toca fuera de 6A (lo señalo, no lo arreglo)

`weekStartOfProgramWeek` hace de puente entre microciclo y fecha en otros
sitios. En todos se equivoca igual cuando las dos cuentas se separan:

- `portfolio.js:1533` (`previsionEscrita`) coloca en la previsión de la cartera
  cuándo «se le acaba lo escrito» a cada cliente.
- `week.js:463` (`latestActiveWeek`) busca los pesajes de un microciclo en una
  semana que no es la suya.
- `week.js:89`, `:541` y `timeline.js:94` hacen lo mismo en la revisión y en la
  línea de tiempo.

Las fotos y los check-ins son otra historia: esos sí cuentan desde el alta a
propósito (`photos.js:204`). El fallo está en usar esa cuenta para la **rutina**.
Merece un encargo propio.

**Para medirlo en producción** (solo lectura):

```sql
select count(distinct c.id) filter (where abs((m->>'date')::date
         - (date_trunc('week', c.start_date)::date + ((m->>'weekNumber')::int - 1) * 7)) > 6) as desfasados,
       count(distinct c.id) as con_rutina
from clients c join workout_data w on w.client_id = c.id,
     jsonb_array_elements(w.microcycles) m
where m ? 'date' and c.start_date is not null;
```

---

## 2. El ancla

### Dónde vive: una marca en el evento

| Opción | Por qué no / por qué sí |
|---|---|
| `clients.preferences.roadmap.anchorEventId` | **No.** `set_client_preferences` (0008) deja al propio cliente reescribir el objeto entero. Podría mover la fecha a la que apunta su plan. |
| `client_phases.anchor_event_id` (enlace por fase) | **No.** Obliga a etiquetar cada fase y abre un estado contradictorio: una fase que apunta a un ancla y termina después de ella. |
| Tabla `seasons` / `plans` | **No.** Ver §5: se deriva. |
| **`client_events.ancla boolean`** | **Sí.** Un evento `race` o `goal` se marca como destino del plan. Es el mismo patrón que `privada` (0106). |

Las fases **no se enlazan** al ancla. Se miden contra ella por fecha:

- **El tramo hacia un ancla** son las fases con
  `ancla anterior ≤ starts_on < ancla`. Una fase que empieza el mismo día de la
  competición ya pertenece al tramo siguiente, que es el de después.
- **Llega** si la última fase del tramo acaba la víspera o el mismo día.
- **Hueco:** acaba antes. Se dibuja el hueco con sus días.
- **Exceso:** acaba después. Se dibuja lo que sobra.
- **Abierta:** la última no tiene final. No se dice si llega. Se pinta sin
  final, como ya se hace hoy.

Ninguno de esos casos es un error de validación. Son el dibujo.

Si la última fase del tramo tiene un cruce (0073), cada camino lleva sus
`weeks`, así que también se puede **enseñar** cuál llega y cuál no. Es dibujar
un dato, no una sugerencia, y no hay que guardar nada.

### La cuenta atrás

`anclaSiguiente(events, hoy)` devuelve el primer evento con `ancla` y fecha a
partir de hoy. Se muestra como «faltan 14 semanas», con semanas redondeadas
hacia arriba, igual que `phaseProgress.weeksLeft`. Por debajo de 14 días se
cuenta en días. Aparece en tres sitios:

- `RoadmapPanel`: una raya vertical en el eje con el nombre del evento.
- La tarjeta de objetivos del Resumen (Dashboard), junto a la fase de hoy.
- `ClientStart`, junto a la fase (`ClientStart.jsx:601`).

Si hay un ancla y ninguna fase, sale la cuenta atrás y el tramo entero sale
como hueco. Eso es información, no una alarma.

### Quién puede tocarla

Hoy el cliente puede **crear, editar y borrar** sus eventos no privados (0009 y
0106). Si el ancla fuera editable desde su lado, podría mover la fecha contra
la que se mide un plan que no puede tocar (`client_phases` es solo de lectura
para él). Así que:

- El cliente **no puede** crear eventos con `ancla`.
- El cliente **no puede** editar ni borrar un evento que ya tiene `ancla`, ni
  quitársela.
- El entrenador puede marcar como ancla una carrera que apuntó el cliente. A
  partir de ahí, esa carrera es suya.

La consecuencia visible: un cliente con la competición marcada como ancla ya no
puede marcarla como «hecha» desde su lado. Me parece aceptable. Si no lo es, la
política puede permitir que cambie solo `done`.

---

## 3. Mover la fecha del ancla — **decides tú**

Hay tres respuestas posibles. Sus consecuencias:

**A. Desplazar las fases.** Solo se pueden desplazar las **futuras**. Mover
una pasada reescribe la historia: `WeekReview.jsx:728` juzga cada semana
pasada con `phaseAt(fases, esa semana)`, y el veredicto de hace dos meses
cambiaría. Tampoco se puede mover el inicio de la fase en curso. Así que
«desplazar todo» no existe: se desplazan las que aún no han empezado, y la
fase en curso conserva su final.

**B. Estirarlas.** **Descartado.** Repartir los días de más entre las fases
exige decidir cuánto le toca a cada una, que es exactamente recetar (ver *La
app no receta*). Además deja semanas no enteras (`phaseWeeks` devolvería
`null`) y cambia lo que significa un ritmo que se fijó sobre otra duración.

**C. No tocar nada.** El ancla se mueve y aparece el hueco o el exceso. Es lo
coherente con el límite del encargo: el sistema enseña, no reajusta.

**Mi propuesta: C por defecto, con A como gesto explícito.** Al mover la fecha
de un evento que es ancla, el diálogo dice qué pasa («las fases no se mueven;
quedará un hueco de 3 semanas») y ofrece una sola casilla, desmarcada: *«Mover
también las 2 fases que aún no han empezado»*. No pregunta después ni vuelve a
sacarlo. Si no la marcas, no pasa nada más.

Si eliges A, hace falta una cosa en la base. Desplazar varias fases con una
llamada por fila choca con el `EXCLUDE` de la 0028 a mitad de camino: al mover
todo 7 días hacia delante, la primera fila pisa a la segunda antes de que la
segunda se mueva. Tiene que ser una función que las mueva en el orden correcto
(hacia delante, de la última a la primera; hacia atrás, al revés), dentro de
una sola transacción y con `SECURITY INVOKER` para que decida RLS. Si al mover
hacia atrás la primera futura pisara la fase en curso, **no se mueve nada** y
se explica por qué. El constraint no se toca.

---

## 4. El peso objetivo

### Por fase: **no aporta**

Una fase ya tiene su destino implícito: el peso con el que empezó + ritmo ×
semanas. `phaseProjection` ya lo calcula (`objetivo`, `roadmap.js:376`). Un
`target_weight_kg` por fase sería una segunda versión del mismo dato. En cuanto
alguien tecleara 74 donde la cuenta da 75,2, la pantalla tendría que elegir a
cuál creer, y la cuenta de ritmo que decide los veredictos dejaría de ser la
única.

### Basta con dos pesos, y el segundo no es un objetivo

- **El del cliente** (`preferences.goal.targetWeightKg`): el final del proceso.
  Se queda como está.
- **El del ancla, solo si la competición tiene categoría de peso:** es un
  **límite**, no un objetivo. Va en el `jsonb` de la competición
  (`pesoLimiteKg`, §6) y se puede pintar como una raya en la gráfica del peso.

### El fallo que he encontrado

`effectiveGoal` devuelve `phaseGoal` cuando hay una fase en curso, y
`phaseGoal` **no incluye `targetWeightKg`**. Estos sitios leen
`effectiveGoal(...).targetWeightKg`:

- `ClientPesoRoute.jsx:87`
- `ClientProgresoRoute.jsx:111`
- `ClientStart.jsx:221`

Resultado: **en cuanto un cliente tiene una fase que cubre hoy, su portal deja
de enseñar el peso objetivo**, aunque esté puesto. El entrenador sí lo sigue
viendo, porque `WeekReview.jsx:461` y `RoadmapPanel.jsx:84` leen `clientGoal`
directamente. Lo arreglo dentro de 6A: `effectiveGoal` conservará el
`targetWeightKg` del cliente también cuando manda una fase. Es un cambio de una
línea y no cambia ningún veredicto.

---

## 5. La temporada

### Se deriva. No hace falta tabla.

    temporada k = las fases con  ancla(k−1) ≤ starts_on < ancla(k)
    nombre      = el título del ancla («Nacional 2027»)
    arranque    = el starts_on de su primera fase
    final       = la fecha del ancla

Con eso se contestan las cuatro preguntas del encargo:

- **Dónde está:** la fase de hoy y la temporada a la que pertenece.
- **Hacia dónde va:** su ancla y la cuenta atrás.
- **Qué viene después:** el tramo siguiente, si existe.
- **Qué veníamos haciendo:** las temporadas pasadas, que son los tramos hasta
  anclas ya pasadas.

Una temporada de dos años son unas cuantas fases (el tope por fase es 24
semanas) y un ancla al final. Lo que haya detrás de la última ancla es «sin
destino» y se lee como hoy.

### Lo que no se puede derivar, y por qué no pido nada todavía

- **Una temporada sin evento final** («año de volumen»). Se resuelve con un
  evento `goal` —«una fecha a la que llegar»— marcado como ancla. Ya existe.
- **Una temporada con dos competiciones principales** (primavera y otoño). Con
  una marca de sí o no, cada ancla corta un tramo, y eso es lo que sirve para
  medir. Si algún día hace falta distinguir la competición principal de una
  secundaria dentro de la misma temporada, `ancla` pasa a ser un texto con un
  CHECK de dos valores. Es una migración pequeña que hoy no hace falta.
- **Si se borra el evento ancla, su temporada desaparece** y las fases se
  quedan. Me parece correcto: la temporada era esa fecha.

---

## 6. Competiciones externas

### El sitio, hecho

```
client_events.competicion jsonb  -- solo en kind = 'race'
{
  "federacion":  "texto libre",
  "categoria":   "texto libre (−83 kg, Men's Physique…)",
  "sede":        "texto libre",
  "pesoLimiteKg": 83          -- opcional, solo deportes con categoría de peso
}
```

Uso un `jsonb` y no tres columnas porque la forma de estos campos no se sabrá
hasta que haya una fuente real: cada federación nombra categorías y sedes a su
manera. Es el mismo razonamiento que `next_options` (0073): la forma se valida
en el dominio, y la base solo exige que sea un objeto y que el evento sea una
`race`. El cliente puede rellenarlo en sus carreras, salvo en las que sean
ancla (§2).

### De dónde saldría el calendario de las federaciones naturales (problema abierto)

No lo resuelvo. Esto es lo que habría que decidir:

1. **Qué federaciones.** Hace falta la lista de las que usan de verdad los
   entrenadores de la cartera. Hay que preguntarles; no la voy a inventar.
2. **Qué publican y en qué formato.** Lo habitual es una web, un PDF o redes
   sociales, sin un formato que se pueda leer automáticamente. Hay que
   comprobarlo federación por federación.
3. **Quién lo mantiene.** Hay tres opciones:
   - **Nosotros**, a mano, en un catálogo común de la plataforma. Es fiable y
     cuesta trabajo cada temporada.
   - **Un acuerdo con cada federación** para recibir un feed (ICS o CSV). Es lo
     mejor si alguna acepta.
   - **Los entrenadores**, en un catálogo compartido. Hace falta moderarlo y
     quitar duplicados.

   El scraping lo dejo fuera por fragilidad y por las condiciones de uso de
   cada web.
4. **Qué pasa cuando la federación cambia una fecha.** Si el evento del
   cliente *apuntara* al catálogo, el cambio movería su ancla desde fuera, y eso
   es reajustar solo. Así que el evento **copia** la fecha y, como mucho, guarda
   de dónde vino (`fuente`, `ref`, que añadiría la importación y no esta
   migración). Si el catálogo cambia, se enseña la diferencia sin avisar ni
   mover nada.
5. **La forma del catálogo.** Sería una tabla de plataforma, no por cliente,
   con escritura restringida. Eso ya es la importación, y no se construye ahora.

---

## 7. La migración propuesta

`0122_el_plan_apunta_a_una_fecha.sql`. Solo añade cosas y es idempotente, como
las demás. Se para sola si faltan la 0009, la 0028 o la 0106.

```sql
ALTER TABLE public.client_events
  ADD COLUMN IF NOT EXISTS ancla boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS competicion jsonb;

ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_ancla_kind
    CHECK (NOT ancla OR kind IN ('race', 'goal')),
  ADD CONSTRAINT client_events_competicion_shape
    CHECK (competicion IS NULL OR (kind = 'race' AND jsonb_typeof(competicion) = 'object'));

CREATE INDEX IF NOT EXISTS client_events_ancla_idx
  ON public.client_events (client_id, date) WHERE ancla;

-- Las cuatro de 0106, con la rama del cliente cerrada sobre las anclas:
--   insert:  … OR (app_is_client(client_id) AND NOT privada AND NOT ancla)
--   update:  USING y WITH CHECK con  … AND NOT privada AND NOT ancla
--   delete:  app_can_write_client(client_id) OR (created_by = auth.uid() AND NOT ancla)
--   select:  sin cambios
```

Y **solo si en §3 eliges A**: `shift_future_phases(p_client uuid, p_from date,
p_days integer)`, una función `plpgsql` con `SECURITY INVOKER` que mueve las
filas en el orden que evita el solape. No toca el `EXCLUDE` de la 0028.

**Qué pasa con los datos que ya hay:** nada. Todos los eventos nacen con
`ancla = false` y `competicion = NULL`. No se reescribe ninguna fase ni se toca
el `jsonb` de ningún programa. Hasta que alguien marque un ancla, la app se ve
exactamente igual que hoy.

**Rendimiento:** el ancla se pide junto a los eventos que el calendario ya
carga (`useCalendar.loadEvents`). Si el panel de fases la necesita sin tener el
calendario abierto, es una consulta más, pequeña, sobre el índice parcial.

---

## 8. Qué consumidores cambian

| Qué | Cambio |
|---|---|
| `roadmap.js` · `effectiveGoal` | conserva el `targetWeightKg` del cliente cuando manda una fase (§4). **No se entera del ancla:** el orden fase → objetivo suelto → `null` no cambia. |
| `roadmap.js` · funciones nuevas y puras | `anclaSiguiente`, `tramosHaciaAnclas` (hueco, exceso, abierta, y el cruce contado por caminos) y `temporadas`. Reciben `phases` y `events`; no leen nada más. |
| `blocks.js` · nueva | `tramoDelBloque` (§1). |
| `RoadmapPanel.jsx` | segundo carril con los bloques; la raya del ancla con su cuenta atrás; hueco y exceso dibujados. `FasesPopup` no cambia. |
| `Dashboard.jsx`, tarjeta de objetivos | una línea con la cuenta atrás. Sin ancla no aparece. |
| `ClientStart.jsx` | la cuenta atrás junto a la fase, y el peso objetivo que vuelve a salir. |
| `ClientPesoRoute`, `ClientProgresoRoute` | ninguno en el código; vuelven a ver el peso objetivo por el arreglo de §4. |
| Calendario (formulario del evento) | casilla «El plan apunta aquí» en `race` y `goal`, solo para el entrenador; campos de competición en `race`; el diálogo de §3 al mover un ancla. |
| `mappers.js` · evento | `ancla` y `competicion`. |
| `reading.js`, `WeekReview.jsx`, `TarjetaProgreso.jsx`, `fork.js`, `phases_ending_soon` | **ninguno**. |

---

## 9. Lo que no hace, por el límite del encargo

El sistema no sugiere fases para rellenar un hueco, no reparte el exceso, no
avisa de que el plan no llega y no mueve nada cuando cambia la fecha de una
federación. Las tres cosas que alguien pedirá —«rellena el hueco con
mantenimiento», «avísame si el plan no llega», «sincroniza con la
federación»— quedan **propuestas, no construidas**. Solo harían falta después
de ver cómo se usa la versión que solo enseña.

---

## 10. Otras cosas que he visto (no las toco)

- **El cliente puede reescribir su propio objetivo.** `set_client_preferences`
  (0008) acepta el objeto entero desde el cliente, `goal` incluido: dirección,
  ritmo y peso objetivo. En la app no hay ningún botón que lo haga, pero la
  función lo permite. Es el mismo motivo por el que el ancla no va ahí.
- **`weekStartOfProgramWeek` como puente para la rutina**, §1.
- **La cartera lee sin fases** (`useRoadmap.js`, nota de su cabecera): sigue
  siendo verdad y 6A no lo cambia.

---

## Lo que necesito que decidas

1. **§3:** C sola, C con A como casilla (mi propuesta), o A siempre.
2. **§2:** ¿vale que el cliente no pueda marcar como hecha una competición que
   es ancla, o dejamos que cambie solo `done`?
3. **§6:** ¿`pesoLimiteKg` entra ya o se queda fuera hasta que haya un cliente
   con categoría de peso?
4. **§1:** ¿abro un encargo aparte para el desfase de `weekStartOfProgramWeek`
   en la cartera y en la revisión?

Con eso escribo la migración y enmiendo `docs/producto.md`.
