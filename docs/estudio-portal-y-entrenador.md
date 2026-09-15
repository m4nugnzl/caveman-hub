# El portal y su entrenador — fallos verificados y cuatro versiones

14 de septiembre de 2026. Auditoría del portal del cliente y del canal que lo
une con el entrenador, sobre el árbol de trabajo (con el rediseño de los dos
aparatos sin commitear). Todo lo que sigue está comprobado leyendo el código, no
deducido; cada avería lleva su fichero y su línea.

**Nada de esto está construido.** Este documento diagnostica y propone.

---

## 1. LA AVERÍA GORDA: el canal de avisos está muerto de punta a punta

El entrenador tiene cuatro formas de decirle algo a un cliente sin salir de la
aplicación. Las cuatro escriben bien. **Ninguna de las cuatro llega.**

### 1.1 El lado del entrenador funciona

- `AppContext.jsx:720-729` — al guardar rutina o dieta, si quien escribe es el
  entrenador, se sella `updates.routine` / `updates.diet` (uno cada cinco
  minutos, para no sellar cuarenta veces una tarde de programación).
- `useCheckIns.js:238` — al revisar la semana se sella `updates.checkin`.
- `useClients.js:590` (`publishUpdate`) — al crear el enlace de una revisión
  grabada se sella `updates.review`.
- `MandarAlgo.jsx:237` (`noteStamp`) — el aviso escrito a mano se guarda en
  `updates.note`.

Los cuatro sellos se escriben. Comprobado.

### 1.2 El lado del cliente no tiene dónde leerlos

**`ClientUpdates.jsx` está huérfano.** En `HEAD` lo montaba `ClientStart.jsx:104`;
el rediseño de los dos aparatos lo dejó fuera y no lo importa nadie. Y ese
componente era **el único escritor de `feed.seen`** en toda la aplicación
(`ClientUpdates.jsx:104`).

Eso rompe el dominio por su propia puerta trasera:

```js
// src/domain/updates.js:146-149
export const unseenUpdates = (preferences, now = …) => {
  const sellos = clientUpdates(preferences);
  const desde  = lastSeen(preferences);
  if (!desde) return [];        // ← sin sello no hay novedades
```

Sin `feed.seen`, `unseenUpdates` devuelve **siempre vacío**. Y como el único
sitio que lo escribía ya no se monta, no se escribe nunca. Es exactamente la
avería que el propio comentario de `ClientUpdates` describe como ya corregida
una vez —«el aviso de *tu entrenador te ha cambiado la rutina* no le llegaba
nunca a ningún cliente, en silencio y sin nada que lo delatara»— y ha vuelto por
otra puerta: no quitando la condición, sino quitando el componente.

Los dos estados posibles, y los dos malos:

- Cliente **nuevo** (o que estrenó el portal después del rediseño): no ve jamás
  una novedad.
- Cliente **viejo**, con un `feed.seen` congelado del día que se desmontó: ve
  todas las novedades posteriores a esa fecha, para siempre, sin poder
  descartarlas — la `X` vivía también en `ClientUpdates` (`dismissUpdate`).

### 1.3 Y aunque no estuviera roto, no habría dónde verlas

`ClientBell` —la lista de avisos— la monta `HeaderActions`, dentro de `Header`.
Y `Header.jsx:130`:

```js
if (view === 'client') return null;
```

En el portal **no se monta la franja en ningún ancho**, y está escrito a
propósito en la cabecera del fichero. El teléfono navega con la barra del pulgar
y el monitor con `pc/CintaDelPortal`. La campana se fue con la franja y su lista
no se mudó a ninguna parte.

Resultado: **cero superficies donde se pueda leer la lista de avisos**, en los
dos aparatos.

### 1.4 Quedan los contadores, apuntando a una pantalla que no los enseña

- `movil/BarraDelPulgar.jsx:59` — punto azul sobre «Hoy» cuando
  `useAvisos().todo.length > 0`.
- `pc/CintaDelPortal.jsx:92-93` — chapa «Te esperan N», enlazada a `/mi/inicio`.

Los dos llevan a `ClientStart`, que **ya no pinta ni novedades ni pendientes**:
sus `pedidos` son tres y están escritos a mano (`ClientStart.jsx:517`) —el alta,
la revisión y los entregables del alta—. Un punto que dice «mira aquí» y lleva a
una pantalla donde no está lo que anunciaba.

> **En una frase:** el entrenador cambia la rutina, escribe un aviso, graba una
> revisión — y el cliente no se entera de ninguna de las tres dentro de la
> aplicación.

---

## 2. LO QUE MANDAS NO TIENE BUZÓN

`client_actions` (migración 0105) es la tabla de las cuatro cosas que se mandan:
formulario, documento, vídeo y «te pido algo». Es también donde escriben **los
tres motores de automatización** (0116, 0117 y el latido de la 0118).

Dónde aparece eso para el cliente:

| Sitio | Estado |
|---|---|
| «Hoy» (teléfono) | **No aparece.** `ClientStart.jsx:517` no lee `envioRows` |
| «Hoy» (monitor) | **No aparece.** Lo mismo |
| Campana | No se monta (§1.3) |
| «Tú» → «Lo que te ha mandado» | Un renglón **sin cifra ni marca** (`ClientTu.jsx:159` y `:249`) |
| `/mi/formularios` | La pantalla existe y está bien hecha |

El dominio sí lo sabe: `pendingTasks` construye la fila con
`href: '/mi/formularios'` (`updates.js:322-330`). Pero esa lista solo la consume
`useAvisos`, y `useAvisos` solo lo consumen la campana (no montada) y los dos
contadores (que no listan).

O sea: **todo el sistema de automatizaciones que se construyó la semana pasada
reparte en un buzón que el cliente no puede ver.** La fila de «Tú» no distingue
entre tener cero cosas y tener cinco.

---

## 3. NO HAY CANAL DE VUELTA, Y EL QUE HAY ES UNA VEZ POR SEMANA

- El cliente escribe **una** vez a la semana: `client_notes` en `submit_check_in`.
  El entrenador contesta **una** vez: `coach_notes`. Ese es el hilo entero.
- «Te pido algo» (`tipo: 'pide'`) no tiene entrega: el renglón
  (`FormulariosDelCliente.jsx:238`) abre un `confirm` y marca «ya está». Pides un
  vídeo de su sentadilla y la aplicación le ofrece **decir que ya lo mandó por
  otro sitio**. El archivo nunca entra.
- Subir fotos del gimnasio solo existe dentro del alta:
  `ClientGymUpload` lo monta `ClientOnboarding.jsx:128` y nadie más. Cambia de
  gimnasio en el mes ocho y no tiene dónde.

La conversación real sigue siendo WhatsApp, y eso está decidido y es defendible.
Lo que no lo es: que **la entrega de un archivo concreto que tú has pedido**
tampoco pase por aquí.

---

## 4. NADA SALE DE LA APLICACIÓN

No hay push, ni correo al cliente, ni webhook. `supabase/functions/telegram` es
el bot de diagnóstico de la plataforma —para el dueño, no para entrenadores ni
clientes— y `latido` solo escribe en la base.

Con §1 y §2 encima, la cadena completa es: nada avisa fuera, y dentro la lista
de avisos no tiene pantalla. El único disparador que queda es que el cliente
abra la aplicación por su cuenta y navegue a la sección correcta.

---

## 5. CÓDIGO MUERTO DEL PORTAL: 15 ficheros, ~4.566 líneas

Ni importados ni cargados en diferido. Comprobado contra `from '…/X'` y
`import('…/X')` en todo `src/`:

```
ClientRoutine.jsx      1.561      ClientDiet.jsx           662
ClientWeek.jsx           373      ProgresoDelCliente.jsx   340
TuDieta.jsx              232      ClientUpdates.jsx        226
BarraDeSesion.jsx        217      TuMicrociclo.jsx         205
LoQueTocaHoy.jsx         156      SesionAMedias.jsx        137
TuPeso.jsx               135      IntakePrompt.jsx         100
CostadoDeLaDieta.jsx      95      CarrilDelPortal.jsx       77
DesdeQueEmpezaste.jsx     50
```

No es contabilidad: `ClientWeek` sigue citado como pieza viva en la cabecera de
`ClientRevisionRoute.jsx:57` («*eso lo pinta `ClientWeek`*»), y `ClientUpdates`
en `ClientBell.jsx:32` («*el sello lo lleva `ClientUpdates`*»). Los comentarios
—que en esta casa son la documentación— describen un portal que ya no existe, y
el segundo de esos dos es literalmente la causa de §1.

---

## 6. CUATRO VERSIONES

Las cuatro parten del mismo diagnóstico y llegan a sitios distintos. No son
tandas de un plan: son cuatro respuestas alternativas a la misma pregunta —**¿por
dónde se hablan estas dos personas dentro de la aplicación?**—. Hay que elegir
una.

---

### VERSIÓN A — «La bandeja»
*Un solo sitio donde está todo lo que te espera.*

**La tesis.** El diseño de avisos ya era correcto; lo que se rompió fue la
mudanza. No hay que inventar un canal: hay que darle pantalla al que existe, y
UNA sola.

**Qué se hace.**
1. «Hoy» recupera un bloque **«Te esperan»** alimentado por `useAvisos`, y
   `useAvisos` gana `client_actions` (que hoy no mira). Una lista, con las
   novedades arriba y lo pendiente debajo, tal como estaba escrito.
2. El sello `feed.seen` se muda a quien pinta la lista — a los dos segundos, como
   estaba. Con eso `unseenUpdates` vuelve a devolver algo.
3. El punto del pulgar y la chapa del monitor pasan a apuntar a ese bloque, no a
   la pantalla a secas. Dejan de mentir.
4. La fila «Lo que te ha mandado» de «Tú» lleva cifra, como «Cerrar la semana»
   lleva su estado.
5. Muere `ClientBell` (su marco no se monta desde el 14 de septiembre) y mueren
   los 15 ficheros de §5.

**Lo que cuesta.** Ninguna migración, ninguna tabla, ningún concepto nuevo. Es
el arreglo de una regresión más una costura.

**Lo que NO arregla.** Sigue sin haber vuelta (§3) y sigue sin salir nada de la
aplicación (§4). Si el cliente no abre, no se entera.

**Cuándo es la buena.** Si lo que quieres es que el producto vuelva a cumplir lo
que ya promete, antes de commitear el rediseño. Esta versión es también el suelo
de las otras tres: **A no compite con B, C y D, las precede.**

---

### VERSIÓN B — «El expediente»
*Todo lo que os habéis dicho, en un solo rastro, y sin que sea un chat.*

**La tesis.** El problema de fondo no es que falte una pantalla: es que hay
**cinco medios canales** para lo mismo —`updates.*` (sellos), `updates.note`
(aviso), `client_actions` (lo mandado), `check_ins.client_notes`/`coach_notes`
(el hilo semanal), `review_links` (los vídeos)— cada uno con su almacenamiento,
su regla de caducidad y su pantalla. Nadie, ni el cliente ni el entrenador,
puede contestar «¿qué nos hemos dicho este mes?».

**Qué se hace.** Una **lectura única en orden cronológico** sobre lo que ya
existe —una vista, no una tabla nueva—: cada sello, cada acción mandada, cada
respuesta y cada vídeo es una entrada con fecha, autor y verbo. Se pinta en dos
sitios con la misma pieza:

- En el portal, `/mi` tiene un rastro: *«te cambió la rutina · el martes»*,
  *«te mandó el cuestionario de sueño · lo contestaste el jueves»*.
- En la ficha del cliente, el entrenador ve **el mismo rastro**, que es lo que
  hoy intenta decir `TarjetaHilo` con un recorte de 80 caracteres.

No es un chat: no hay campo de escribir libre que no exista ya, no hay hilos, no
hay respuestas anidadas. Es el expediente compartido, que es lo que un
entrenador de verdad echa de menos de su Excel y de su WhatsApp a la vez.

**Lo que cuesta.** Una vista o un selector de dominio que unifique cinco formas
distintas, con su tabla de vocabulario. Cero migraciones si se hace en lectura.
El riesgo real es de diseño, no técnico: un rastro largo se convierte en un muro
si no se agrupa por semana.

**Lo que NO arregla.** Tampoco sale de la aplicación (§4).

**Cuándo es la buena.** Si te crees la tesis de [[la-app-del-cliente-es-un-producto]]
—*tu historial es el producto*— y quieres que el historial incluya la relación,
no solo los kilos. Es la versión con más identidad: ni Efort ni Coachway lo
tienen, porque ninguno guarda la pauta y la respuesta en el mismo sitio.

---

### VERSIÓN C — «Que suene fuera»
*El aviso no vale nada si hay que entrar a buscarlo.*

**La tesis.** §1 y §2 son graves, pero hay una avería por debajo: **ningún aviso
sale de la aplicación**. Arreglar la lista interna mejora al cliente que ya
entra; no mueve al que no entra, que es el que te da trabajo.

**Qué se hace.**
1. **Web Push sobre el PWA que ya existe** (hay manifiesto y service worker, y el
   modo offline ya está trabajado). Tabla de suscripciones, claves VAPID en los
   secretos de las funciones, y una función edge que dispara desde los mismos
   puntos que hoy sellan: rutina, dieta, revisión, aviso y acción mandada.
2. El **latido de las 07:00 se convierte en el emisor**: hoy escribe en un buzón
   que nadie mira; con esto empuja.
3. Para el entrenador, el remate barato: un **enlace de WhatsApp precargado**
   desde «Mandar algo», con el texto ya escrito y el enlace profundo a la
   pantalla. Sin API, sin coste, y es el gesto que ya hace a mano.

**Lo que cuesta.** Es la versión más cara y la única con infraestructura nueva:
migración de suscripciones, gestión de permisos (y el permiso se pide UNA vez —si
lo deniega, se acabó), la función edge, y el detalle feo de iOS, donde el push
solo llega si el cliente ha **instalado** el PWA en su pantalla de inicio. Eso
convierte «instalar la app» en un paso del alta.

**Lo que NO arregla.** Nada de §3: sigue sin haber canal de vuelta.

**El riesgo de producto, y hay que decirlo.** Notificar es lo más fácil de hacer
mal. Cuatro clases de aviso empujadas sin criterio son el camino directo a que
las desactive, y entonces habrás gastado la infraestructura y el permiso. Si se
elige esta versión, el criterio de qué se empuja y qué se calla vale más que el
código — y ya hay una pieza que lo sabe hacer: `radiografia/aviso.js` decide qué
decir y cuándo callarse, con sus pruebas.

**Cuándo es la buena.** Si el problema que te quita el sueño es la adherencia y
no la coherencia. Es la que más mueve la aguja del negocio y la que más se puede
estropear.

---

### VERSIÓN D — «La semana es el contrato»
*Se retira el concepto de aviso. Lo que hay que hacer es lo de esta semana.*

**La tesis.** La contraria a las otras tres. Un aviso es una entrada que hay que
mirar, descartar, contar y no repetir — y todo el enredo de §1 (sellos, `seen`,
`dismissed`, reaparición, dos contadores) existe para administrar esa lista. Si
el ciclo de trabajo de este producto ya es **la semana**, la lista sobra:
todo lo que el entrenador manda se ancla a un periodo y se lee en la única
pantalla que ya tiene ese reloj.

**Qué se hace.**
1. **Mueren** `feed.seen`, `feed.dismissed`, `UPDATE_KINDS` y las dos chapas.
2. «Hoy» dice lo de hoy —sesión, dieta, pasos— y **«Tu revisión» pasa a ser el
   contrato de la semana**: lo que te pidió, lo que le debes, lo que te contestó.
   Todo lo mandado cuelga de un periodo y se cierra con él.
3. Un cambio de rutina o de dieta **no es un aviso**: es que la hoja de esta
   semana es otra. Se marca en la propia hoja —*«cambiada el martes»*— donde el
   dato significa algo, y no en una bandeja aparte.
4. Lo que se manda a mitad de semana entra en el periodo abierto, con la misma
   regla de gracia que ya existe (`periodoAEntregar`).

**Lo que cuesta.** Poco código y mucha decisión: hay que aceptar que algo mandado
un jueves puede no verse hasta que el cliente abra su revisión. Y hay que
resolver qué pasa con el cliente **sin** entrenador, que es hacia donde apunta
[[la-app-del-cliente-es-un-producto]]: sin contrato semanal, esta versión no
tiene dónde poner nada.

**Lo que NO arregla.** §3 y §4, igual que A y B.

**Cuándo es la buena.** Si al mirar §1 la reacción es «cuánta máquina para tan
poco». Es la más fiel a las leyes de la casa —la ley del reposo, sin reproches,
información y no recetas— y la que deja menos producto en pie.

---

## 7. Recomendación

**A primero, y no como una de las cuatro.** Lo de §1, §2 y §5 es una regresión
del rediseño sin commitear: el portal promete cuatro avisos y no entrega
ninguno, y son dos días de trabajo sin migración. Commitear el rediseño con esto
dentro es dejar el producto por debajo de donde estaba en `HEAD`, que es la
regla que ya ordenó el corte de las tandas de [[carril-de-lo-mandado]].

Después, **B**. Es la que convierte una avería en identidad: el expediente
compartido es lo único de esta lista que la competencia no puede copiar sin
cambiar su modelo de datos, y no pide infraestructura. **C** es la que más
factura y debería ir detrás de B, no delante: empujar hacia una bandeja
incoherente amplifica el problema en vez de arreglarlo. **D** merece leerse
aunque no se elija — su crítica al aparato de avisos es correcta, y si se hace A
conviene hacerla con la mitad de máquina que tenía.
