# Acciones concretas a personas concretas

> Encargo (9 sep 2026): «La página de protocolos solo contempla protocolos de
> usuarios, que son conjuntos de acciones pero todos en formato formulario al
> fin y al cabo. Estaría bien poder estipular acciones concretas a usuarios
> concretos.»

Continúa [replanteamiento-formularios-y-envios.md](./replanteamiento-formularios-y-envios.md),
que construyó el envío de formularios (migración 0099), y cierra los P-02, P-03
y P-04 que quedaron declarados allí.

---

## 1. El diagnóstico, corregido

La impresión del dueño es correcta, pero la causa está un paso más allá: **no es
que todo sea formulario, es que el formulario es la única acción de primera
clase**. Todo lo demás —un vídeo, un documento, «mándame el vídeo de tu
sentadilla», una casilla tuya— se escribe como un **paso del alta**, que es un
sitio prestado.

| | Formulario | Documento · vídeo · casilla |
|---|---|---|
| Dónde vive | `client_forms` (0099) | `clients.preferences.intake.custom` |
| Tope | 60 por envío | **6 por cliente** (`MAX_CUSTOM_STEPS`), dentro de los 8 KB de la columna (0008) |
| Cuándo | columna `due` + `vigente()` | no existe |
| Mensaje | `schema.nota` | no existe |
| Agrupación | `envio_id` → «UNA VEZ», con su 3/5 | ninguna |
| Se da por hecha | el cliente entrega (`submitted_at`) | una casilla que **solo marca el entrenador** |
| El cliente la ve | `/mi/formularios` + tarea en su inicio | dentro de «Tu alta», o en «lo que te dejó preparado» |
| Historia | fila por envío, esquema congelado | se pisa al editar; y declara excepción |

### Las cinco averías verificadas

1. **El «cuándo» se tira para todo lo que no es formulario.**
   `MandarAlgo.jsx:193-198` escribe el paso con `{label, link}` y nada más. La
   pantalla se defendía a medias —las opciones de fecha estaban apagadas si el
   «qué» no era un formulario—, y la mitad que quedaba viva es la mala: elegido
   el día con un formulario y cambiado después el «qué» a un vídeo, la fecha se
   queda puesta, el botón dice «Dejarlo programado para 12» y se manda en el
   acto.

2. **Una acción suelta resucita el alta.** Cae en `intake.custom`, y el portal la
   pinta en «Tu alta — se hace una vez», con su barra de progreso y su «tu
   entrenador necesita esto para montarte el plan». Un vídeo mandado en el mes
   seis reabre el onboarding.

3. **«Mándame el vídeo de tu sentadilla» no se lo pide a nadie.**
   `addCustomStep` no pone dueño (`intake.js:489`) y `stepOwner` cae a `'coach'`
   (`intake.js:387-390`); `IntakeTasks` solo pinta los pasos del cliente
   (`clientSteps`). Como además no lleva enlace, tampoco sale en
   `IntakeDeliverables`. **El cliente no ve nada.** Y ese es literalmente el
   texto que hoy sugiere el campo de la ficha (`ClientSettings.jsx:316`).

4. **Nada suelto entra en la lista de tareas del cliente.** `pendingTasks`
   (`updates.js:298`) solo conoce formularios y la semana.

5. **Mandar algo declara excepción de protocolo.** El camino no-formulario
   guarda por `saveClientException`, que escribe `protocolException.on = true`
   (`useClients.js:502`). O sea que mandarle un vídeo a cuarenta personas deja
   cuarenta clientes marcados como desviados, y `/protocolos` los va a excluir
   para siempre de «poner al día»: «Las 40 excepciones se quedan como estaban»
   (`ProtocolosPanel.jsx:276-280`). Un efecto que nadie relacionaría jamás con
   haber mandado un vídeo.

La 5 es la que decide la forma de la solución: un envío **no tiene nada que ver
con el protocolo de esa persona**, y mientras se escriba en sus preferencias lo
va a parecer.

---

## 2. La tesis

`domain/envios.js` ya lo dejó escrito: *una acción son tres respuestas —qué, a
quién y cuándo*. Falta la cuarta, y es la que reparte el trabajo:

> **Una acción son cuatro respuestas: qué · a quién · cuándo · de quién es.**

Y de la cuarta salen dos carriles, los dos ya construidos a medias:

- **Del cliente** — le pides o le das algo. Tiene entrega, y por eso necesita
  tabla. Es `client_forms`, que hoy solo admite formularios.
- **Tuya** — te acuerdas de hacer algo con esa persona un día. Tiene fecha, y ya
  tiene carril: `client_events` (0009), con su agenda, sus vencidos y su bandeja
  ya montadas en `domain/today.js`.

Un protocolo es la acción cuya audiencia es «los que lo llevan» y cuyo momento es
un tramo de su vida. Un envío es la misma cosa con la audiencia dicha a mano.
Nada de esto es un concepto nuevo; lo nuevo es que **el tipo de acción deje de
decidir la calidad de la acción**.

---

## 3. Las tres decisiones, cerradas

### D1 · La casilla privada tuya → `client_events`, con marca de privada

El dueño no lo tenía claro. La razón para no dejarla donde está:

Tu trabajo pendiente **ya tiene un sitio y un reloj**: la agenda reclama lo de
hoy y lo vencido (`today.js:404`), y la bandeja ordena lo que te espera
(`buildInbox`). Una segunda lista de tareas tuyas en la tabla de lo mandado
sería un segundo sitio donde mirar para contestar una sola pregunta —«¿qué me
toca hoy?»—, que es exactamente el §5 de CLAUDE.md y la ley del reloj único.

Y de propina arregla la avería 1 para este tipo: el «cuándo» del asistente pasa
a ser la fecha del evento, que es lo que la agenda necesita para reclamarlo.

**El coste, y es real:** `client_events` hoy la lee también el cliente
(`events_read`: `app_can_read_client(...) OR app_is_client(...)`). Hace falta
una columna `privada boolean NOT NULL DEFAULT false` y añadir
`AND (NOT privada OR public.app_can_read_client(client_id))` a la lectura. Es un
cambio de política sobre una tabla que el cliente ya lee: va con prueba y con el
defecto en `false`, para que nada de lo que hay hoy cambie de visibilidad.

*Descartado:* meterla en la tabla de lo mandado con un `owner`. Sería la misma
columna de privacidad, más una segunda lista de deberes tuyos sin agenda.

### D2 · Repetir una acción → fuera

Decisión del dueño, y coincide con el estado del sistema: **no hay servidor**
—ni `pg_cron` ni funciones programadas—, así que «cada mes» significaría «cada
vez que tú abras la pantalla, si toca», y eso es un motor de programación
disfrazado. Lo que se repite ya tiene sitio: el protocolo.

### D3 · Lo que ya está puesto → se queda donde está

Se aplica el mismo criterio que tomó la 0099 con el check-in y el parte: no se
migran datos a cambio de elegancia. Los pasos que hoy están en `intake.custom`
de clientes vivos siguen ahí y se siguen leyendo; lo nuevo va por el carril
nuevo. La ficha los enseña en una sola lista mediante un puente de lectura, así
que el entrenador no ve la costura.

**Lo que NO se deshace:** las marcas de excepción que ya se hayan escrito por
haber mandado algo. Quitarlas en una migración sería adivinar cuáles vinieron de
un envío y cuáles de un cambio de verdad, y equivocarse significa que el
siguiente «aplicar a todos» le pisa a alguien un protocolo hecho a mano. Se
corrigen una a una desde la ficha, que ya sabe hacerlo.

---

## 4. El modelo

### 4.1 La tabla de lo mandado

`client_forms` pasa a llamarse **`client_actions`**: el nombre es la mitad del
modelo, y una tabla llamada «formularios» que guarda vídeos vuelve a poner el
formulario en el centro. Solo la nombra `useEnvios.js`; las políticas sobreviven
al `RENAME` y la RPC se rehace.

```sql
ALTER TABLE public.client_forms RENAME TO client_actions;

ALTER TABLE public.client_actions
  ADD COLUMN tipo text NOT NULL DEFAULT 'form'
    CHECK (tipo IN ('form', 'documento', 'video', 'pide')),
  ADD COLUMN link text,   -- lo que se abre (documento/vídeo)
  ADD COLUMN body text;   -- la instrucción o el recado, ≤ 280
```

Las columnas que ya existen y que ahora sirven para las cuatro:

- `envio_id` — agrupa «esto, a estos cinco, hoy». Sin cabecera, como está.
- `title` — cómo se llamaba el día que se mandó.
- `schema` — **solo `form`**. El esquema congelado. Deja de llevar `nota`
  (se hace columna `body`, con backfill).
- `answers` — **solo `form`**.
- `due` — para cuándo. Idéntica semántica para los cuatro tipos.
- `submitted_at` → pasa a significar **cuándo quedó hecha**, y el docblock dice
  qué es «hecha» para cada tipo:
  - `form` — la entregó.
  - `documento` / `video` — la abrió.
  - `pide` — la marcó él.

Una sola columna de estado y no dos (`submitted_at` + `done_at`) a propósito: dos
columnas para el mismo hecho es la clase de cosa que acaba discrepando.

**Los cuatro tipos, y por qué no hay un quinto:** `tarea` desaparece de aquí
—se va a `client_events` por D1— y `pide` es el que hoy no existe y es el que el
encargo pide: pedirle algo que no es un formulario.

### 4.2 La RPC

`submit_client_form(p_id, p_answers)` se generaliza a
`marcar_accion(p_id uuid, p_answers jsonb DEFAULT NULL)`: misma factura
`SECURITY DEFINER` calcada de `submit_check_in`, mismo tope de 8 KB, y con
`p_answers` nulo para los tipos que no contestan nada. Es lo que permite que el
cliente marque lo suyo sin abrirle la escritura de la tabla (hoy escribir es solo
del entrenador, y eso no cambia). **GRANT EXECUTE explícito** — es la trampa que
ya nos costó un 403 invisible dos veces.

### 4.3 Lo que ya no hace falta

`domain/envios.js` deja de tener el campo `tabla` en `QUE_MANDAR`: había dos
caminos porque había dos almacenamientos. Con uno solo, el catálogo vuelve a ser
lo que dice ser —una lista de cosas que mandar— y `MandarAlgo` deja de tener dos
funciones de envío.

---

## 5. Qué se ve

**`/protocolos`** conserva sus dos rótulos. **SIEMPRE** no se toca. **UNA VEZ**
pasa a ser la línea de verdad de todo lo mandado: mismo mueble, con el disco de
familia por tipo (azul preguntar, verde entregar, ámbar tuyo) y la columna
«Han contestado» generalizada a **«Cómo va»** —3 de 5 contestados, 4 de 5
abiertos, 2 de 5 hechos—. Un envío de vídeo se abre igual que uno de formulario;
lo que cambia es que su tabla tiene una columna en vez de doce.

**La ficha** estrena «Lo que le has mandado» (P-04) y con ella muere
`MandarleAlgo` (P-02): el mismo diálogo de tres pasos, con esa persona ya
elegida —la inversión de `preseleccion` que ya existe—. La lista mezcla, por
puente de lectura, lo nuevo y los pasos que ya tenía en `intake.custom`.

**El asistente** deja de mentir: el paso «Cuándo» vale para los cuatro tipos, y
la casilla tuya enseña el resumen en el lenguaje de la agenda («el jueves, en tu
agenda, solo la ves tú»).

**El portal.** Lo mandado sale de «Tu alta» y entra donde ya está lo que su
entrenador le pide: tarea en su inicio (`pendingTasks` gana `de: 'accion'`) y su
sección, que pasa de «Formularios» a **«Lo que te pide»**. Un vídeo se abre y se
marca solo; un `pide` lleva su botón de hecho. «Tu alta» vuelve a ser el alta.

---

## 6. Las tandas

**Tanda 1 — el carril.** Migración 0105 (rename, columnas, backfill de
`schema.nota` a `body`, RPC generalizada con su GRANT). `domain/envios.js` y
`domain/acciones.js` adaptados, con el puente de lectura de `intake.custom`.
Pruebas antes que pantalla, y en particular la de que un envío ya no toca
`protocolException`.

**Tanda 2 — los disparadores.** `MandarAlgo` escribe por el carril único para
los cuatro tipos; la casilla tuya va a `client_events` con `privada` (columna +
política + prueba); la ficha usa el mismo diálogo y muere `MandarleAlgo`; el
paso «Cuándo» pasa a ser verdad.

**Tanda 3 — la vuelta.** «UNA VEZ» enseña todo lo mandado; la ficha enseña lo
suyo; el portal lo recoge (`pendingTasks`, «Lo que te pide»); y el aviso entra
como un tipo más (P-03), que es lo que hoy es una tercera forma de darle algo a
alguien.

## 6-bis. Estado (9 sep 2026)

**Tandas 1 y 2 construidas.** Migraciones `0105` (la tabla de lo mandado) y
`0106` (la casilla privada), las dos aplicadas y probadas contra la base local.
Los cinco tipos salen ya por su carril: los cuatro suyos a `client_actions` y la
casilla tuya a tu agenda. Muertos `mandarleAlgo` y el `MandarleAlgo` de la ficha.

Cambios de la tanda 2 respecto a lo escrito arriba, y por qué:

- **El portal entró en la tanda 2, no en la 3.** Mudar el disparador sin que su
  pantalla supiera pintar un vídeo lo habría dejado invisible para el cliente
  hasta la tanda siguiente, o sea peor que antes. Una tanda no puede dejar el
  producto por debajo de donde estaba.
- **La cabecera «Cómo va» también se adelantó**, por lo mismo: en cuanto se puede
  mandar un vídeo, «Han contestado» encima de «9 de 12 lo han abierto» es falso.
- **El recado vale ya para los cuatro tipos.** La columna existía desde la 0105 y
  dejarla solo para el formulario habría sido conservar la jerarquía que este
  trabajo viene a quitar.

**Tanda 3 construida el mismo día.** Sin migración: no hacía falta ninguna.

- **Lo mandado vuelve a la cartera.** `pendientesPorCliente` cuenta lo pendiente
  de cada uno y entra en `buildPortfolio` como cifra —igual que
  `equipmentCounts`, y por el mismo motivo: `domain/envios.js` ya importa de
  `domain/portfolio.js` y contarlo allí cerraría un ciclo—. De ahí sale la alerta
  `mandado_pending` y su cola en la bandeja, «Les falta lo que les mandaste».
  Va FUERA del corte de «todavía no ha empezado»: al recién dado de alta es justo
  a quien le acabas de mandar el cuestionario.
- **El aviso entra en el mismo diálogo** y muere `AvisoSheet` (~55 líneas), la
  tercera forma distinta de hacerle llegar algo a alguien. Lo que NO se unifica
  es dónde cae: `carril: 'aviso'` sigue escribiendo en `updates.note`, porque un
  aviso se lee y se descarta — meterlo en la tabla de lo mandado le habría puesto
  al cliente deberes que no existen.
- **Y el estado imposible deja de existir:** elegir un día y cambiar después a un
  tipo que no se puede programar devuelve el «cuándo» a hoy. La clase de fallo
  que arreglé en la tanda 2 no puede volver por otra puerta.

## 6-ter. Tanda 4: lo contestado llega a la bandeja (9 sep 2026)

Era lo que quedaba fuera, y ya está: migración **0108**, `seen_at` en
`client_actions`. Aplicada y probada contra la base local por los cinco lados
(contestar deja sin leer · el cliente no puede marcarla leído · el entrenador sí
· corregir la respuesta la devuelve a la bandeja · marcar un vídeo no borra la
marca).

- **Lo ya contestado nace VISTO.** Con la columna a NULL, la cola habría
  estrenado con todo lo respondido desde que existe la 0099. Una cola que nace
  con cien filas no es una cola, es un cartel.
- **Solo el formulario.** Es el único tipo que devuelve algo que leer; pedir un
  «visto» sobre un vídeo abierto sería un clic para quitar de en medio una fila
  sin contenido. Lo que hacen los otros al marcarse es dejar de contar en
  `pendientesPorCliente`.
- **Abrirlo ES leerlo**, en los dos sitios donde se lee: el envío del Taller y la
  ficha de esa persona. No hay botón de «marcar como leído».
- **Corregir vuelve a pedir lectura.** `marcar_accion` borra `seen_at` cuando
  llegan respuestas: si alguien cambia lo que puso después de que lo leyeras, lo
  que leíste ya no es lo que hay.

**Y tres averías que salieron al repasarlo, las tres verificadas:**

1. **La cola de la bandeja no salía en ninguna pantalla.** «Hoy» pinta las colas
   de `COLAS_INICIO` y los `TRAMITES_INICIO`, y `mandado` no estaba en ninguna de
   las dos listas: se calculaba en cada render para nadie. Ahora es trámite —hace
   pareja con «Recordar el check-in»— y lo contestado es la quinta cola, «Sin
   leer», porque leer lo que te han dicho es oficio y no trámite. Hay una prueba
   nueva que falla si una tarea futura vuelve a quedarse huérfana.
2. **La ficha no decía una palabra de lo mandado.** Las dos colas llevan a
   `seccion: 'ficha'` y «Lo que le has mandado» solo estaba en la hoja de ajustes
   de la cartera: la bandeja mandaba a un sitio donde el trabajo no se podía
   resolver. Es la misma pieza con el marco de la ficha, como `PauseRow`.
3. **`client_actions` no entraba en la copia de seguridad.** La tabla se creó con
   la 0105 y `scripts/backup.mjs` no se tocó, así que una restauración habría
   devuelto a los clientes sin un solo cuestionario suelto y sin ningún error por
   el camino. Lo caza `supabase/tests/copia.test.js`, que no corre en
   `npm run check` (va con `test:db`).

**Lo que sigue fuera:** que la cola de lo contestado se pueda resolver sin entrar
en cada ficha —hoy hay que abrirlas de una en una— y las respuestas del portal
del cliente, que se acumulan en «Ya está» sin más orden que la fecha.

## 7. Riesgos declarados

- **La política de `client_events`.** Es el único cambio de visibilidad de todo
  el trabajo. Defecto en `false`, prueba en los dos sentidos, y el `GRANT` de la
  tabla no se toca (la columna no lo necesita).
- **El `RENAME`.** Las políticas y los índices siguen a la tabla; la RPC no —hay
  que rehacerla en la misma migración— y `useEnvios.js` es el único fichero que
  la nombra.
- **Si la 0099 no está desplegada**, el rename no tiene nada que renombrar: la
  migración lo comprueba con `to_regclass` y crea la tabla ya con su forma
  final, que es lo que este repositorio hace en todas sus guardas.
- **`COMPARED_KEYS`.** Nada de esto entra en el protocolo, así que no debería
  tocarla; si algo lo hiciera, hay una prueba que lo vigila.
