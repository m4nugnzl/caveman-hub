# Replanteamiento del móvil · «El aparato que se saca del bolsillo»

Estudio del 11 de septiembre de 2026, a partir de **las 68 capturas de Coachway**
de `capturas/referencias/coachway/` —44 de la app móvil (`features app y movil/`,
que son sus stories de producto: la app del cliente por dentro), 7 de
automatizaciones, 3 del check-in, 1 de formularios, 1 de migraciones y 12 del
panel de escritorio— contrastadas **archivo a archivo contra nuestro código**, no
de memoria.

El dossier `06-capturas.md` ya juzgó su ESCRITORIO. Esto es lo otro: **qué hace
Coachway en un teléfono y qué tendría que hacer el nuestro**, de cara a que esta
aplicación se instale y se use como una app.

> **Se ve tocándolo:** [`movil-vision.html`](movil-vision.html) — las pantallas
> de esta propuesta en un teléfono clicable, con la razón de cada una al lado.

> ### ⚠ Leer antes que nada — este estudio va por la tercera vuelta
> El mismo 11 de septiembre, **por la tarde, el dueño tomó dos decisiones**:
>
> 1. **De momento es móvil en internet, no una app instalada.**
> 2. **El entrenador también edita desde el teléfono.**
>
> Y **por la noche, con el prototipo delante, corrigió cuatro cosas más**: fuera
> el cronómetro de la barra de sesión, fuera el botón de vídeo tamaño YouTube,
> fuera el `−/+` de la pastilla —«en todo caso los mismos»— y **falta la
> pantalla donde el cliente se pesa y sube sus fotos**, que es la que más va a
> abrir. Con ellas entra una tanda 0 de acabado.
>
> Lo que sigue —el diagnóstico, las averías A-1…A-6 y los movimientos
> M-01…M-11— **sigue siendo válido**, pero el orden de las tandas, dos de las
> decisiones abiertas, `M-04`, `M-07` y una afirmación sobre la barra del
> pulgar ya no lo están. Está en el
> **[§7 · Segunda vuelta](#7-segunda-vuelta-móvil-en-internet-y-el-entrenador-que-edita)**
> y en el **[§8 · Tercera vuelta](#8-tercera-vuelta-cuatro-correcciones-con-el-prototipo-delante)**;
> tocable, en `movil-vision.html`.

---

## 0. El veredicto, en tres frases

1. **Su app no es su web estrechada: es otro aparato.** Cinco pestañas, la
   sesión como estado, una hoja que sube para todo lo que se consulta, y el chat
   como columna vertebral.
2. **La nuestra sí es la web estrechada.** Tenemos las dos piezas difíciles —la
   rutina en hojas deslizables y el camino sin conexión entero— y nos falta el
   suelo: la sesión no es un estado, la hoja no es una superficie, el aviso no
   existe y la geometría son 33 opiniones distintas.
3. **Y su columna vertebral no podemos copiarla, ni queremos.** Aquí la
   conversación es de WhatsApp por decisión escrita (`domain/updates.js`). Eso
   obliga a resolver por otro sitio lo único que el chat resolvía de verdad:
   **que lo que manda el entrenador llegue**.

---

## 1. Lo que se ve en las 44 capturas de su app

### 1.1 El mapa: cinco pestañas y un chat en el centro

`Today · Chat · Food · Workouts · Profile`, con contador en Chat. Todo lo que
pasa entre las dos personas pasa por la segunda pestaña: el check-in llega al
hilo como tarjeta, el entrenador contesta ahí, el vídeo grabado aterriza ahí, y
el «broadcast» a la cartera entera se reparte como N conversaciones 1:1.

**Today** (`image13`, `image17`, `image23`): saludo, **una** tarjeta verde con la
acción del día («Time for a check-in → Start check-in»), carrusel de progreso
—aguja de peso `Start 75 · Current 70,5 · Goal 70`, circunferencias—, pasos con
anillo por día de la semana y «Last synced just now», azulejos del archivo
(Documentos 2 · Imágenes 3 · Vídeos 1) y «últimos entrenos».

**Profile** (`image21`): cabecera con tres cifras que son el currículum de esa
persona —`Joined 29/10/25 · Check-ins 15 · Workouts 124`—, el último check-in, y
la lista de verbos: nuevo check-in, añadir medida, editar pasos, lecciones.

### 1.2 La pieza buena: la sesión es un ESTADO, no una pantalla

Es lo más importante de todo el material y aparece en ocho capturas
(`image7`, `image37`, `image43`, `image32`…):

- Cabecera oscura fija: **tiempo corriendo** (`00:38`, `22:03`), botón de pausa,
  **«Finish»**, y una **barra de segmentos** —un tramo por ejercicio— que se va
  tiñendo. El mapa de la sesión sin ocupar una línea de texto.
- Cada ejercicio: miniatura de vídeo, nombre, galón (`3 sets · 10 Reps · 120 s`)
  y un chevron que abre su hoja.
- Cada serie: `Reps` y `Weight` **con lo pautado ya escrito dentro** y un ✓ a la
  derecha que la cierra. Entre serie y serie, el descanso pautado como separador
  tocable («1min 30s», «2min»).
- **Y sobre todo: la sesión sobrevive a cerrar la app.** En `image17`, en la
  portada: «Uafsluttet træning · Main Circuit · empezada hace 2 días · 5 % · 1 de
  13 series, 0 de 4 ejercicios» con **«Reanudar»** y una papelera. Ni se pierde
  ni se cuela como sesión buena.

### 1.3 La otra pieza buena: la hoja del ejercicio, entre serie y serie

Enero de 2026, anunciada como «lo que más nos pidieron» (`image37`–`image42`):
tocando el ejercicio **durante la sesión** sube una hoja con cuatro tramos,
**sin perder lo que estabas escribiendo debajo**:

| Tramo | Qué enseña |
|---|---|
| **Details** | Recursos: el vídeo del ejercicio |
| **Notes** | «Add a note for this session — *How did this exercise feel?*», con aviso de que se guarda al terminar, y debajo **las notas anteriores fechadas** |
| **History** | Cada sesión anterior con sus series, fechada, de la más reciente hacia atrás |
| **Charts** | Peso máximo, reps máximas y tonelaje en el tiempo |

Y dos detalles que valen más que la hoja entera:

- La nota **sobrevive al ejercicio, no al programa**: «*all history for that
  exercise that they have ever done, even if you updated the training program*».
- La nota aparece **donde la lee el entrenador** (`image31`): «*User note:
  Compared to the 30th of December – I didn't have the same energy today so I had
  to drop the weight a bit*», encima de las series, con la tabla de deltas por
  serie (`−14,3 %` en rojo, `+12,9 %` en verde). El porqué del número, pegado al
  número.

Al terminar (`image32`): **Quality** (5 estrellas, «Perfect») + **Intensity**
(barras, «Very high») + notas libres. Tres campos, una sola vez, al final.

### 1.4 Lo demás de su app, en una línea cada uno

- **Food** (`image1`): tira de días, anillo de kcal con barras de macros,
  carrusel de planes, comidas del día por momento, y un botón flotante de
  registrar con **rayo** (rápido) y **código de barras**.
- **Receta** (`image18`): pestañas Overview/Ingredients/Instructions y un
  **contador de raciones** que reescala todos los ingredientes.
- **Workouts** (`image11`): carrusel de planes con la nota del entrenador
  encima, y dentro las sesiones con sus grupos musculares.
- **Check-in del cliente** (`image19`, `image20`, `forms/emojis e iconos`):
  formulario por pasos con puntos de avance, peso con `−/+`, escalas de caritas
  y de estrellas con las mismas cinco etiquetas (Bad/OK/Good/Great/Perfect); y
  después, el histórico legible por él con medidas y su delta.
- **La hoja que sube** (`image24`): editar pasos —navegador de día, valor actual,
  valor nuevo, Cancelar/Guardar— es una hoja. **Todo lo que se edita es una
  hoja.**
- **Permisos por cliente** (`client settings`): ocultar nutrición, ocultar peso,
  ocultar chat, permitir vídeo/audio con duración máxima, y alerta de «no
  contacto» a los N días.
- **Acceso** (`image15`): el acceso a la app se concede, se programa y se revoca
  —atado al pago—, con chips de `+1 semana / +2 semanas / +1 mes`.
- **Marca blanca** (`image14`): la app lleva **el logotipo del entrenador**
  arriba. Es su app, no la de Coachway.
- **Grabadora flotante** (`image8`): graba vídeo mientras sigues navegando, y
  aterriza en el chat.
- **Automatizaciones** (`automations/*`, `image26`–`image30`): disparadores
  (activación, inicio, pago, alta completada, manual), tres formas de envío
  —`Auto send` / `Smart send` / `Review first`— y tres destinos —`Chat` /
  `Vault` / `Both`—; línea de tiempo por cliente o por calendario.

Y el titular de su propia landing (`features 2`): «**Run your whole client list
from your desk or your phone**».

---

## 2. Lo nuestro hoy, verificado

### 2.1 Lo que ya está, y está bien

| Pieza | Dónde | Estado |
|---|---|---|
| Barra del pulgar | `ui/BottomNav.jsx` | 4 + «Más», con `env(safe-area-inset-bottom)`; y es **contextual** en el entrenador (`CoachLayout.jsx:1245`) |
| La rutina como hojas deslizables | `Client/CintaDeHojas.jsx`, `ClientRoutine.jsx` | Una hoja por sesión, se abre en la de hoy, se cambia deslizando |
| La vez anterior dentro del campo + ✓ que la repite | `ClientRoutine.jsx` | Construido |
| Descanso solo si está pautado | `ClientRoutine.jsx` | Construido |
| PR por ejercicio | `domain/sessions.js` (`bestSetsBefore`) | Construido |
| Resumen al terminar, con las escalas y el cuaderno | `ClientRoutine.jsx` + `updateSessionMeta` | Construido |
| Abrir sin cobertura | `scripts/sw.mjs`, `lib/sesionOffline.js`, `lib/saveQueue` | **Entero**, y probado apagando el servidor |
| Instalable | `public/manifest.webmanifest` | `standalone`, `portrait`, dos accesos directos |
| Ocultar cifras a un cliente | `Client/Oculto.jsx` | Construido |

Eso es más de lo que parece: **el camino sin conexión y la cinta de hojas son
justo las dos cosas que cuestan meses**, y las tenemos.

### 2.2 Las seis averías del móvil

**A-1 · La sesión no es un estado.** No hay `startedAt`, no hay tiempo, no hay
progreso, y no hay «la dejaste a medias». Peor: el descanso es
`useState` **dentro de `ClientDay`** (`ClientRoutine.jsx`), así que **salir de la
hoja mata la cuenta atrás**. En un gimnasio eso pasa cada serie: se sale a mirar
el vídeo del siguiente ejercicio y se vuelve sin descanso.

**A-2 · El histórico está calculado y no tiene puerta.**
`previousSetsBefore()` y `bestSetsBefore()` (`domain/sessions.js:570`) recorren
**todos los microciclos del programa indexando por nombre de ejercicio**: el
histórico completo por ejercicio ya existe en memoria, en la pantalla, mientras
se entrena. Solo se enseña como el número gris dentro del campo. Lo que
Coachway anunció en enero como su feature más pedida, aquí está a una puerta.

**A-3 · La ficha del ejercicio del cliente no tiene ni nota ni marca.**
`FichaEjercicioCliente.jsx` da vídeo + pautas del entrenador + catálogo. No hay
nota del cliente por ejercicio en ninguna parte del dominio (`setExerciseNote`
es del entrenador, en el plan). Y sin esa nota, el «hoy he bajado el peso
porque no había dormido» no tiene dónde ir: acaba en el cuaderno del final o en
WhatsApp, y en los dos sitios se despega del número que explica.

**A-4 · No hay aviso. Ninguno.** Cero referencias a `Notification`,
`pushManager` o VAPID en todo el repositorio. La app se abre porque la persona
se acuerda. Y como no hay chat —por doctrina—, hoy **todo** el camino de vuelta
del entrenador al cliente es WhatsApp, incluido «te he cambiado la rutina», que
es un cambio de estado y no una conversación.

**A-5 · La hoja no es una superficie.** `.sheet` existe y vive **dentro de
`BottomNav.jsx`**, para el desbordamiento de la barra y nada más. Todo lo demás
que se abre en un teléfono es `Modal`, que en móvil roba la pantalla entera y
pierde lo que había debajo.

**A-6 · La geometría son 33 opiniones.** Contados sobre `src/styles/*.css`: 33
anchos distintos entre `420px` y `1600px`, con parejas casi duplicadas
(`639.98/640/641`, `719.98/720`, `899.98/900`, `1023.98/1024`). No hay «el
móvil»: hay 33 móviles, y cada pantalla se cae en un sitio distinto.

### 2.3 El entrenador en el teléfono

La barra del pulgar ya navega `Inicio · Clientes · Cobros · Agenda`, y dentro de
un cliente cambia a sus secciones. Pero **el Taller no tiene entrada en el
pulgar** y la mesa de Entreno es de escritorio por decisión tomada («el móvil
ejecuta, el PC planifica»). Lo que no está resuelto es lo que un entrenador
**sí** hace de pie: **leer lo que le ha llegado y dar el veredicto**. Hoy eso
pide sentarse.

> **Corregido en §7.2:** esa ley se quedaba corta y el dueño la ha ampliado. El
> teléfono también **retoca** —números, orden, ejercicio, nota—; lo que no hace
> es **montar estructura**. Y el editor del entrenador ya cambia de forma en el
> móvil (`WorkoutLogEditor.jsx:871`), así que es terminar, no inventar.

---

## 3. La reformulación

### Las tres leyes del móvil

**L-1 · Una sesión es un estado del aparato, no una pantalla.**
Mientras hay sesión abierta, la aplicación entera lo sabe: el tiempo corre,
salir no la cierra, volver la recupera donde estaba y la portada lo dice.

**L-2 · Lo que se consulta entre serie y serie SUBE; no sustituye.**
La hoja se arrastra desde abajo, se cierra con el pulgar y debajo sigue estando
la serie a medio escribir. Nada de lo que se consulta mientras se entrena puede
costar perder el sitio.

**L-3 · Un cambio de estado se avisa; una conversación, no.**
El push dice «tu rutina de la semana 4 ya está», «te toca el check-in», «tu
entrenador ha leído tu semana». Nunca texto redactado por una persona: eso es de
WhatsApp y esa ley no se toca. El aviso es el eco de un hecho, no un mensaje.

### Tanda 1 — el suelo (sin esto, lo demás no se sostiene)

**M-01 · Tres anchos y ya.** Los 33 puntos de corte se reducen a tres tokens
—`móvil ≤ 639.98`, `tableta ≤ 1023.98`, escritorio— y se declaran en un solo
sitio. Añadir la regla a `scripts/verify-styles.mjs`, que ya es el guardián de
los estilos, para que el cuarto ancho no entre nunca más.
*Archivos:* `src/styles/*.css`, `scripts/verify-styles.mjs`.

**M-02 · La hoja es una superficie del producto.** Sacar `.sheet` de `BottomNav`
a `ui/Hoja.jsx`: agarradera, arrastre para cerrar, foco atrapado, cierre
animado y `prefers-reduced-motion`. Y que en móvil **`Modal` con `size="side"` y
`size="lg"` baje a hoja** en vez de ser un modal centrado. Es un cambio de
presentación, no de API: ninguna pantalla se entera.
*Archivos:* `ui/BottomNav.jsx`, `ui/Modal.jsx`, `ui/Hoja.jsx` (nuevo).

**M-03 · La ficha del ejercicio, como se usa entre serie y serie.**
`FichaEjercicioCliente` pasa a hoja con cuatro tramos, en el orden en que hacen
falta delante de la máquina:

1. **Cómo** — el vídeo de su entrenador y sus pautas *(ya está)*.
2. **Lo que hiciste** — el histórico por fecha con sus series. **El dato ya está
   calculado en la pantalla** (A-2): esto es una puerta, no un cálculo.
3. **Tu nota** — la de este ejercicio, con las anteriores fechadas debajo.
   Campo nuevo en la entrada de la sesión; nunca en el plan, que es del
   entrenador.
4. **Tu marca** — peso máximo, repeticiones máximas y tonelaje.

Sin recetar: enseña lo que hizo y no propone lo que hacer. La ley de la casa
sigue en pie.
*Archivos:* `Client/FichaEjercicioCliente.jsx`, `domain/sessions.js`.

### Tanda 2 — la sesión

**M-04 · La sesión tiene principio, tiempo y fin.** `startedAt` en la sesión y
una **barra de sesión** que sustituye a la del pulgar mientras dura: tiempo,
progreso por ejercicio y «Terminar» —que sigue abriendo el resumen que ya
existe—. La barra de segmentos de Coachway es la mejor idea de sus 44 capturas:
dice cuánto queda sin gastar una línea.

**M-05 · La que dejaste a medias.** Una sesión con series escritas y sin
terminar aparece en la portada con lo que llevas y **dos verbos: seguir y
descartar**. Hoy esa sesión existe en los datos y no existe para la persona: se
encuentra sola al volver a esa hoja, o no se encuentra.

**M-06 · El descanso sube a la barra.** Deja de morir al salir de la hoja
(A-1). Sigue siendo solo el pautado, sigue sin sonar.

**M-07 · El pulgar manda.** Teclado numérico en los campos de serie
(`inputMode="decimal"`), ✓ con 44 px reales de objetivo táctil, y el campo
siguiente al alcance sin recolocar la mano. Barrido con `@media (hover: none)`,
que ya tenemos en 27 sitios.

### Tanda 3 — el aviso, y el entrenador de pie

**M-08 · Push de estado.** Web Push (VAPID) sobre el service worker que **ya
existe**, más una tabla de suscripciones con su RLS y su GRANT —el fallo del
403 invisible ya nos costó dos veces—. Tres avisos y ni uno más: rutina nueva,
te toca el check-in, tu semana está revisada. El permiso se pide **después del
primer check-in entregado**, nunca al entrar.

**M-09 · «Instálala», en su momento.** El manifiesto ya la hace instalable;
falta ofrecerlo cuando significa algo —al cerrar el primer check-in— y no en la
puerta. *En iOS el push web solo funciona si la app está añadida a la pantalla
de inicio, así que M-09 no es un adorno de M-08: es su requisito.*

**M-10 · La bandeja del entrenador, en el teléfono.** La cola de revisión con lo
justo para decidir —quién, qué espera, desde cuándo— y el veredicto de un toque.
No es Entreno en el móvil: es lo que se hace de pie, que es leer y contestar.

**M-11 · «Visto».** Que el cliente sepa que su semana se leyó. Hoy ese hecho
existe en los datos del entrenador y no llega a quien lo espera; en las capturas
de Coachway es un botón («Mark as reviewed», «Mark as read») y en las nuestras
no es nada.

---

## 4. Lo que NO se copia, y por qué

| Suyo | Por qué no |
|---|---|
| **El chat como pestaña central** | La conversación es de WhatsApp por decisión escrita (`domain/updates.js`). Un chat a medias es peor que ninguno: divide dónde se habla. |
| **Registrar comida, código de barras, anillos** | **Decidido el 11 sep 2026: la dieta pauta y no contabiliza.** Un contador convierte al cliente en su propio nutricionista —pasa el día decidiendo si le cabe algo, y el que decide deja de ser el entrenador— y un anillo a medio llenar a las 23:00 es un suspenso diario. Si algún día se registra, será **otra pantalla con otro nombre**, nunca la hoja de lo que toca. |
| **Marca blanca** | Es un modelo de negocio, no una pantalla. Fuera del alcance actual. |
| **1.772 vídeos y 1.819 ingredientes de catálogo** | Ventaja real suya, pero es contenido, no producto. Se compra o se produce; no se diseña. |
| **La grabadora flotante que aterriza en el chat** | Sin chat no tiene destino. Y el vídeo va por WhatsApp por decisión del dueño (estudio del diseño de Efort). |
| **«Smart send»** (pedir confirmación antes de mandar) | Ya tenemos las tres formas en «Mandar algo» y el carril de lo mandado. No hace falta un cuarto nombre. |

---

## 5. Lo que necesita decisión del dueño

1. ~~**¿PWA instalable o app nativa?**~~ **CERRADA el 11 sep 2026 (tarde):
   móvil en internet, ninguna de las dos.** Ver §7. Se diseña para el navegador
   y se premia al que instale, no al revés.
2. ~~**¿El cliente registra lo que come?**~~ **CERRADA el 11 sep 2026: no.** La
   dieta pauta y no contabiliza. Fuera el contador, el anillo y el código de
   barras; la pantalla se queda en cinta del ciclo, objetivo en una línea,
   comidas plegadas y «cambiar» para las equivalencias. Es la diferencia más
   grande entre su app y la nuestra, y es deliberada.
3. **¿La nota por ejercicio es del cliente?** M-03 la propone suya. Si se
   prefiere que solo escriba en el cuaderno del final, el tramo «Tu nota»
   desaparece y la hoja se queda en tres.
4. ~~**¿Cuánto entrenador cabe en el teléfono?**~~ **CERRADA el 11 sep 2026
   (tarde): también edita.** La ley se reescribe —*el móvil retoca, el
   ordenador monta*— y M-10 deja de ser el techo. Ver §7.

---

## 6. Orden sugerido

*(Sustituido por el de §7. Se conserva para saber de dónde viene.)*

`M-01 · M-02 · M-03` primero: son el suelo y las tres se ven en la primera
pantalla que se abra. Después `M-04 · M-05 · M-06 · M-07`, que es la sesión
entera y la mitad del valor de la app. `M-08` a `M-11` al final, porque el aviso
sin nada que avisar no sirve de nada.

---

## 7. Segunda vuelta: móvil en internet, y el entrenador que edita

El mismo día, por la tarde, el dueño decide dos cosas. Ninguna de las dos
invalida el diagnóstico; las dos cambian el plan.

### 7.1 · Decisión: **móvil en internet, no app**

No es «una versión reducida»: es **otro marco**, con dos cosas menos y una más.
Lo que se ha comprobado en el repositorio para saber qué cuesta:

**N-1 · `100vh` miente en una pestaña.** 15 usos de `100vh` en
`src/styles/*.css` y solo dos con la pareja `svh` (`.login` y un bloque de
`ajustes.css`). En un navegador móvil esa medida vale **más que la pantalla
visible**, así que todo lo anclado abajo —la barra del pulgar la primera— cae
debajo de la barra de Safari. Y el porqué **ya está escrito** en
`portada.css:2856`: se supo, se arregló en un sitio y no se generalizó.

**N-2 · El pesaje semanal amplía Safari al tocarlo.** El producto ya se defiende
del zoom al enfocar en `jornada.css:577` (`@media (hover:none)`), con un
comentario que avisa de que los selectores compuestos «se repiten a mano». Se
escapó uno: `.checkin-week .input` (`piezas.css:263`, dentro de
`@media (max-width:639.98px)`) vale **14 px** y **gana por especificidad**
—`0-2-0` contra `0-1-0`—. Es la pantalla que más se toca desde el teléfono.

**N-3 · La pantalla se apaga entrenando.** Cero referencias a `wakeLock` en
todo el repositorio. `navigator.wakeLock.request('screen')` funciona en el
navegador y ahora se puede pedir «solo mientras hay sesión», porque la sesión
pasa a ser un estado (M-04).

**Lo que el navegador se lleva:** unos 90 px de alto —medidos contra el propio
prototipo: 664 px en pestaña, 754 instalada— y un alto que **cambia mientras se
lee**; el **push en iPhone**, que Safari solo da a la app añadida a la pantalla
de inicio; y, a verificar, **la permanencia**: Safari limita el almacenamiento
de un sitio no instalado pasados días sin visita, y ahí vive la cola sin
conexión (`lib/saveQueue`). Eso último **hay que medirlo en un iPhone real**
antes de fiarle una serie apuntada.

**Lo que regala, y vale más de lo que parece:** **la URL es el destino**. El
camino de vuelta ya es WhatsApp por decisión escrita; lo único que falta es que
lo que se manda **lleve un enlace que aterrice en el sitio exacto**. Y un
segundo regalo: `<meta name="theme-color">` cambiado en caliente hace que
**Safari pinte sus propias barras con la tinta de la sesión** — lo único que una
app instalada no puede hacer mejor que una pestaña.

**Movimientos nuevos:** `W-01` el alto del navegador · `W-02` ningún campo por
debajo de 16 px · `W-03` la pantalla no se apaga · `W-04` cada pantalla una
dirección · `W-05` medir la permanencia en iOS · `W-06` el cromo obedece al modo.

### 7.2 · Decisión: **el entrenador también edita en el móvil**

La ley vieja —«el móvil ejecuta, el PC planifica»— se queda corta: corregir el
jueves de una persona desde el sofá es trabajo del oficio, no planificación.

**L-4 (nueva) · El móvil retoca; el ordenador monta.** La regla para decidir no
es el aparato sino el sujeto: si es **una casilla** —un número, un orden, un
ejercicio, una nota, un veredicto— cabe en el teléfono; si es **la estructura**
—cuántas semanas, qué días, qué bloque, comparar dos— es del ordenador. Y la
pantalla del teléfono **dice lo que no hace**, en vez de ofrecer una versión
estrecha inservible.

Y la buena noticia, verificada: **ya está medio construido**.
`WorkoutLogEditor.jsx:871` hace `const Lista = esTelefono ? ExerciseList :
HojaDeSeries;` y `ExerciseList.jsx:218` monta para el teléfono un árbol distinto
—índice de ejercicios + ficha—. No hay que inventar la pantalla: hay que
terminarla.

**N-4 · La mano está apagada a propósito en el teléfono.**
`WorkoutLogEditor.jsx:2579-2584`: `onCopiar`, `pautaEnMano` y `onPegarPauta`
valen `null` cuando `esTelefono`. Copiar y pegar una pauta es el gesto más
repetido del oficio, y `useArrastreOrden` demuestra que el dedo no es el
problema: ya arrastra con puntero, con espera de 240 ms y vibración de 8 ms.

**N-5 · Reordenar va por flechas** en el pie del modal, teniendo el arrastre
táctil resuelto y usado en tres sitios. Las flechas se quedan como alternativa
accesible —esa lección está escrita en la cabecera del propio gancho—.

**Movimientos nuevos:** `E-01` la mano con el dedo · `E-02` arrastrar para
ordenar · `E-03` la pastilla del pulgar también al pautar · `E-04` del veredicto
al jueves, de un toque.

### 7.3 · El orden nuevo

| Tanda | Qué | Movimientos |
|---|---|---|
| **1** | El suelo del navegador | `M-01` `W-01` `W-02` `M-02` |
| **2** | La sesión | `M-04` `M-05` `M-06` `M-07` `M-03` `W-03` `W-06` |
| **3** | El entrenador de pie | `M-10` `M-11` `E-01` `E-02` `E-03` `E-04` |
| **4** | El camino de vuelta | `W-04` `W-05` `M-08` `M-09` |

El cambio de orden más importante: **el push baja al final**. Antes M-09
(«instálala») era el requisito técnico de M-08; ahora es al revés —se ofrece
instalar **porque trae avisos**— y el camino de vuelta lo resuelve `W-04`, el
enlace, que no necesita permisos ni VAPID ni tabla nueva.

### 7.4 · Lo que sigue esperando veredicto

1. **¿La nota por ejercicio es del cliente?** (sin cambios; recomiendo que sí).
2. **¿La quinta pestaña del cliente es «Tú»?** Hoy es «Calendario».
   ⚠ *Corregido en la §8.4: el check-in, las medidas y las fotos SÍ tienen
   puerta propia —es `evolucion`, la cuarta pestaña—. La pregunta sigue en pie,
   pero por lo que queda suelto: la cuenta, los documentos y lo entregado.*
3. **¿Se hace la tanda 4 entera o solo `W-04`?** Si hay que elegir, el enlace
   primero y el push cuando la use gente de verdad.

**Nada de esto está construido.** Este documento es el estudio; la primera tanda
espera veredicto.

---

## 8. Tercera vuelta: cuatro correcciones con el prototipo delante

El mismo 11 de septiembre, por la noche, el dueño tocó las nueve escenas de
`movil-vision.html` y dijo cuatro cosas. Tres retiran algo que estaba puesto
y la cuarta señala un agujero. Está todo construido en el prototipo.

### 8.1 · El cronómetro sale de la barra

> «No me gusta del todo el temporizador de sesión, es un poco estresante.
> Quizás al acabar estaría bien que lo dijese.»

Estaba copiado de Coachway (`image7`: `22:03` junto a `Færdig`). Visto en la
pantalla **no informa: presiona**. Un número que sube solo, delante de alguien
que está descansando entre series, convierte el descanso en tiempo que se
pierde. Y encima compite con la regla: en una barra de 64 px, el único elemento
que se mueve por su cuenta se lleva la mirada.

La cuenta **sigue existiendo**. `startedAt` hace falta igual —sin él no hay «la
dejaste a medias», que es `M-05`— y la duración es un dato de la semana que el
entrenador querrá ver. Lo que cambia es **dónde se lee**: una vez, al terminar,
en el resumen que ya existe (`ClientRoutine.jsx`, el `Modal` con `sesion-kpi`).
Ahí «te ha costado 52 min» es información; en la barra era un juez.

**Y el descanso no se va con él**, que es la distinción entera: tiene final, lo
puso una persona y se usa entre serie y serie. Un reloj que va a ninguna parte
y una cuenta atrás que alguien te pautó no son lo mismo. `M-04` reescrito.

### 8.2 · El vídeo se anuncia, no se grita

> «El icono de YouTube lo veo exagerado.»

En la fila del ejercicio había un triángulo blanco relleno de 19 px sobre un
cuadrado gris, y en la hoja el mismo triángulo dentro de un disco de 50. A ese
tamaño gritan más que el nombre del ejercicio — y en una lista de cinco
ejercicios, lo que hay que reconocer de un vistazo es **cuál es cada uno**, no
que haya un vídeo detrás.

Ahora la miniatura es **el fotograma**, con la duración en una chapa de 9 px en
la esquina; y en la hoja, el mando está abajo a la izquierda, al alcance del
pulgar, y dice lo que cuesta: «Ver el vídeo · 0:42». Un triángulo de 19 px es un
anuncio; `0:42` es un dato.

Y es lo que hace Coachway, que en esto acierta: en sus ocho capturas de sesión
la miniatura del ejercicio es una foto de la máquina, sin nada encima.

### 8.3 · La pastilla no propone ningún kilo

> «Tampoco me gusta que proponga 1 kg más o menos, en todo caso los mismos.»

La pastilla del pulgar llevaba `−2,5 / +2,5` (el paso real de la máquina, en
`data-paso`). Sobre el papel es un mando manual. En la pantalla, **un signo
delante de una carga se lee como una recomendación** —«hoy te toca subir»— por
mucho que quien lo puso lo pensara de otra forma. Y esta aplicación no receta:
resalta información y el criterio es del entrenador.

Lo que sí puede ofrecer es **lo mismo**, que además es el caso normal:

| Botón | Qué escribe | De dónde sale |
|---|---|---|
| **Como el plan · 80** | lo pautado para esa serie | la propia serie |
| **La vez pasada · 80 × 8** | lo que hiciste en ese ejercicio | `previousSetsBefore()`, `domain/sessions.js:570` |

Ninguna de las dos cifras es nueva: las dos se estaban enseñando ya en gris
dentro del campo y en el renglón de debajo. La pastilla solo las saca a un
botón. Y **si una no existe para ese campo, su botón no está** — un mando vacío
es mobiliario.

Quien quiera 82,5 lo escribe; el teclado numérico está justo debajo. Eso es
exactamente lo que tiene que costar un cambio de carga. `M-07` reescrito, y
`E-03` con él: del lado del entrenador el mismo botón se leería como plantilla,
que es el otro modo de opinar sobre una carga.

### 8.4 · Faltaba la pantalla que el cliente más va a abrir

> «El cliente ha de hacer la subida de fotos y revisiones por ahí, no puedes
> dejarte eso.»

Tiene razón y además había un error de bulto: **la pestaña «Revisión» de la
barra del pulgar del cliente llevaba a la bandeja del entrenador**. Nueve
escenas y ninguna era la suya.

Y hay que corregir lo que decía la segunda vuelta. Aquí se escribió que el
check-in, las medidas y las fotos «no tienen puerta propia en el teléfono», y
**es falso**: la tienen desde que `evolucion` («Mi revisión») unió «Mis
check-ins» y «Mis fotos» en `CLIENT_SECTIONS`. Lo que no tenían era pantalla en
este documento.

Existe repartido en tres piezas —`ClientWeek`, `ClientPhotos`, `ReviewWizard`—
con dos decisiones ya tomadas y escritas que la escena nueva respeta:

- **Pesarse y hacerse las fotos son el mismo gesto de la semana.** Separados,
  son dos tareas que se recuerdan por separado y la segunda se olvida.
- **Se sube en UN sitio.** Llegó a haber cuatro puertas para el mismo diálogo.

Lo que añade `M-12`:

1. **El peso a 34 px.** Es el dato de la pantalla, se escribe con una mano
   mojada y se comprueba antes de mandarlo. De paso mata `W-02` donde más duele:
   `.checkin-week .input` vale 14 px y **gana por especificidad** a la regla
   anti-zoom, así que hoy la pantalla que más se toca desde el teléfono amplía
   Safari al entrar en la casilla del peso.
2. **Los tres ángulos de `domain/photos`**, y debajo del que falta, **la foto de
   la semana pasada en miniatura** con su `hint`. Una serie de fotos solo sirve
   si están hechas igual, y eso hoy se pide por WhatsApp una vez y se olvida a
   la tercera semana. Es información, no una corrección.
3. **Las preguntas del protocolo**, que las pone el entrenador (`client_forms`),
   no nosotros. La pantalla solo sabe dibujar una escala de cinco y un campo
   libre.
4. Y **lo que se oculta, se oculta**: con el peso escondido (`Oculto.jsx`) la
   primera tarjeta no está, ni aquí ni en el pie de las fotos.

**Riesgo abierto, y no es menor:** tres imágenes de móvil son varios megas por
una red de gimnasio, y `lib/saveQueue` —la cola sin conexión— guarda series pero
**no sabe guardar ficheros**. Hasta que lo sepa, «Mandar» con mala cobertura es
la forma de perder la revisión entera después de haberse hecho las fotos. Va con
`W-05`, que ya medía la permanencia del almacenamiento en un iPhone real.

### 8.5 · Y una tanda 0 de piel

> «Creo que se puede mejorar mucho el diseño y hacerlo menos robótico, más
> estético y moderno, siguiendo el estilo de Coachway que es más amistoso.»

Lo que hace amistoso a Coachway **no es su verde**. Es la temperatura del papel,
la geometría, la carne del contenido y la voz. Copiarles el color —o su serif
itálica, que es su firma— sería quedarse otra vez en la superficie, que es justo
lo que se rechazó en septiembre. Así que la señal no se mueve: **el azul sigue
siendo `#3b49df`**, que sobre papel cálido además destaca más.

| Mov. | Qué | Por qué |
|---|---|---|
| `D-01` | **El papel se calienta** | El gris del producto tira a azul (`#f6f7f9`, `#e6e9ef`, `#5b6270`): es el gris de una hoja de cálculo, y nueve pantallas seguidas se leen como un formulario. Se gira el matiz con la misma claridad —`#f7f6f2`, `#e7e3d9`, `#514d45`— y las sombras se tiñen con esa tinta en vez de negro puro. El contraste **sube**: 7,8:1. Trabajo de `tokens.css`, sin tocar una pantalla. |
| `D-02` | **La tarjeta flota** | Radio 11 → 20 px y fuera el borde de 1 px. Un radio de campo de formulario alrededor de todo es lo que hace que cada pantalla parezca una tabla dentro de otra tabla. La separación la hacen el aire y la sombra. |
| `D-03` | **Voz y movimiento** | El titular pasa a la ancha del producto (Archivo Expanded, 24 px): display con cuentagotas, uno por pantalla, y sin traerse una serif prestada. Y un solo *easing* lineal para todo es la otra mitad de lo robótico: entra `--muelle` para lo que **asienta** —el ✓, la chapa, la hoja— y las tarjetas aparecen escalonadas al abrir una pantalla. Cuatro retardos y se acabó. `prefers-reduced-motion` sigue respetado. |

Lo que **no** se ha tocado, y merece decirse: la carne. Coachway enseña la foto
de la máquina, el plato y las tres fotos del check-in; aquí no hay ni una imagen
real en todo el móvil salvo las que suba el cliente. El póster del ejercicio y
el plato del día siguen siendo huecos de color. Eso no es un token: es contenido,
y no se arregla en una tanda de piel.

### 8.6 · El orden, con lo nuevo

| Tanda | Qué | Movimientos |
|---|---|---|
| **0** | La piel | `D-01` `D-02` `D-03` |
| **1** | El suelo del navegador | `M-01` `W-01` `W-02` `M-02` |
| **2** | Lo que hace el cliente | `M-04` `M-05` `M-06` `M-07` `M-03` `W-03` `W-06` **`M-12`** |
| **3** | El entrenador de pie | `M-10` `M-11` `E-01` `E-02` `E-03` `E-04` |
| **4** | El camino de vuelta | `W-04` `W-05` `M-08` `M-09` |

La tanda 2 deja de llamarse «la sesión»: son **las dos cosas que un cliente solo
puede hacer con el teléfono en la mano**, entrenar y entregar la semana.

### 8.7 · Lo que sigue esperando veredicto

1. **¿La nota por ejercicio es del cliente?** (sin cambios; recomiendo que sí).
2. **¿La quinta pestaña del cliente es «Tú»?** Ya no por el check-in —eso está
   resuelto en la cuarta—, sino por lo que queda suelto: la cuenta, los
   documentos y el historial de lo entregado.
3. **¿Se hace la tanda 4 entera o solo `W-04`?**
4. **¿La tanda 0 se aplica solo al móvil o a `tokens.css` entero?** Recomiendo
   entero: media aplicación con el papel frío y media con el cálido es peor que
   cualquiera de las dos.

**Nada de esto está construido en la aplicación.** Lo construido es el
prototipo.


---

## 9. Tanda 2, construida: «lo que hace el cliente»

Ejecutada el 11 de septiembre de 2026, entera y en la aplicación de verdad
(`src/`, no el prototipo). Lo que sigue es lo que hay puesto, las decisiones que
hubo que tomar por el camino y las trampas que solo aparecen al construirlo.

### 9.1 · La migración `0119`, que es el suelo de todo

`supabase/migrations/0119_la_sesion_tiene_principio_y_fin.sql`. **Aplicada en
local y probada** (`supabase/tests/sesion-principio-y-fin.test.js`, 8 pruebas
contra la base de datos, incluidos los GRANT y el intento del entrenador ajeno).
**Sin desplegar en producción.**

No toca ninguna tabla, ninguna política y ningún dato:

| Función | Qué hace |
|---|---|
| `log_session_set` | reemplazada con **la misma firma**: estampa `startedAt` al CREAR la sesión, con `now()` del servidor |
| `log_session_close` | estampa `endedAt`. Es «Terminar» |
| `log_session_discard` | **borra** una sesión sin cerrar. Es «Descartar» |
| `log_exercise_note` | la nota del cliente en un ejercicio de la sesión |

El sello del principio lo pone el SERVIDOR y no el navegador: un reloj de
teléfono adelantado a mano daría duraciones imposibles, y la duración se le dice
a una persona. La fecha del entreno sigue siendo la del cliente — eso es el día
que dice haber entrenado, y ahí manda él.

**Tres decisiones que la 0119 deja escritas:**

1. **«Descartar» borra de verdad**, y no marca. El motivo por el que esa sesión
   se anuncia es que contamina el histórico; dejarla dentro con una marca sería
   conservar justo lo que se vino a quitar, y obligaría a que cada cuenta del
   producto —adherencia, tonelaje, «la vez anterior»— se acordase de la marca.
2. **Con el cerrojo de que esté SIN CERRAR.** Con `endedAt` puesto alguien dijo
   «esto ha pasado»: eso ya es histórico y de ahí no se borra. Acota el daño
   posible de la función a lo que está abierto ahora mismo.
3. **El fin se puede sobrescribir.** Terminar, caer en la cuenta de que faltaba
   la última serie, anotar y volver a terminar es lo que pasa de verdad.

### 9.2 · La sesión es un estado del aparato (`M-04`, `M-06`, `W-03`, `W-06`)

**`src/context/SesionEnCurso.jsx`**, montado en el marco del portal
(`ClientLayout`) y no en la ruta de la rutina. Ahí vive lo que dura más que la
pantalla: qué sesión se entrena, el descanso, y con eso las dos cosas que solo
se pueden hacer sabiéndolo —`usePantallaDespierta` (`W-03`) y `useCromoTenido`
(`W-06`)—.

**El fallo que corrige, y no se ve leyendo el código:** el descanso era un
`useState` dentro de `ClientDay`, y en el teléfono la rutina es una CINTA DE
HOJAS. Deslizar a la sesión de al lado, abrir el vídeo del siguiente ejercicio o
mirar la dieta desmonta ese componente — o sea, cada serie. Con él se iba la
cuenta atrás.

**No sobrevive a una recarga, y es deliberado.** Podría, con tres líneas, y
sería peor: al volver, la aplicación daría por hecho que sigues entrenando lo de
ayer y seguiría anotando en una sesión con fecha vieja. Eso se resuelve por el
otro lado —`M-05`— y mejor.

`src/components/Client/BarraDeSesion.jsx` es la barra: nombre, cuenta, la REGLA
(un tramo por ejercicio, una muesca por serie, y se toca para ir), el descanso
con su anillo y «Terminar». Va **arriba y en tinta** (`--sesion-tinta`), y
mientras dura **la barra del pulgar no está**: salir tiene que ser un gesto
explícito —la flecha— y no un resbalón del dedo en el borde. Desde cualquier
otra sección la barra entera es el camino de vuelta.

**Y el tiempo se dice UNA vez, en el remate** («te ha costado 52 min»), con
`minutosDeSesion`, que se niega a contestar si falta un sello, si el fin es
anterior al principio o si pasan de seis horas — eso último no es un entreno
largo, es una sesión que se quedó abierta el martes y se cerró el jueves.

### 9.3 · La que dejaste a medias (`M-05`)

`domain/sessions.sesionAMedias` + `src/components/Client/SesionAMedias.jsx`, lo
primero de su portada. Con la regla dibujada, dos verbos y **una línea que dice
cuánto se va a borrar**: «descartarla borra las 4 series que apuntaste».

Es «descartar» según §5.8 del producto —lo que se va no llegó a ser un entreno—
pero destruye algo que la persona anotó, así que decirlo es obligatorio. Decidir
con cuatro series sin saber que son cuatro no es decidir.

### 9.4 · La pastilla del pulgar (`M-07`)

`src/components/Client/PastillaDelPulgar.jsx` + `src/lib/useTecladoALaVista.js`.
Se ancla sobre el teclado con `window.visualViewport`, porque el teclado **no
cambia el tamaño de la página**: lo que cambia es el viewport visual, y un
`bottom: 0` se queda debajo de las teclas.

Ofrece **«Como el plan · 80»** y **«La vez pasada · 80 × 8»**, y si una de las
dos no existe para ese campo **su botón no está**. Ningún signo delante de una
carga: un «+2,5» se lee como una recomendación aunque se pensara como un mando.

**Dos cosas que solo se ven construyéndolo:**

- El rango de repeticiones **no se puede ofrecer**: «8-10» no es un número, y
  `log_session_set` rechaza cualquier cosa que no lo sea. Un botón que lo
  ofreciera prometería algo que falla (`planDelCampo`, en `SetCell`).
- Tocar la pastilla tiene que hacer `preventDefault` en `mousedown`/`touchstart`
  o el campo pierde el foco: el teclado se cierra, la pastilla se va con él y el
  toque no llega a ninguna parte. El botón parecería roto.

### 9.5 · La ficha del ejercicio, con sus cuatro tramos (`M-03`)

`FichaEjercicioCliente` pasa a `SegmentedControl` con **Cómo · Lo que hiciste ·
Tu nota · Tu marca**, y los dos de en medio salen de `historialDeEjercicio` y
`marcasDeEjercicio` (nuevas en `domain/sessions`), que **cruzan bloques** porque
buscan por nombre: al clonar una semana cada ejercicio estrena id.

La marca es tres hechos —máximo, reps y tonelaje— y **no un 1RM estimado**: un
número calculado invita a perseguirlo, y esta aplicación no propone objetivos.

**La nota del cliente** (lo único nuevo de verdad) cuelga de la entrada de la
sesión y llega al entrenador **encima de sus series**, en `HojaDeSeries` y en
`ExerciseList` («Lo que dijo»). Eso obligó a dos cambios pequeños:

- La ficha se abre con el ID del ejercicio y no con su nombre: el nombre sirve
  para buscar lo del entrenador (0100), el id para escribir.
- **La marca del renglón tiene un tercer glifo** —el ángulo— para cuando el
  entrenador no ha puesto nada: detrás de esa puerta ya hay algo igual (lo que
  hiciste, tu marca, tu nota), y prometer un vídeo que no existe sería peor.

### 9.6 · Los tres ángulos de las fotos (`M-12`, primera mitad)

`src/components/anthropometry/TresAngulos.jsx`, dentro del paso de fotos del
asistente. Sustituye a dos recuadros de aviso y a la frase de «hazlas siempre
igual» —que era el consejo más importante del paso y el único que iba en gris—
por tres casillas con la **foto de la última vez debajo del ángulo que falta**.

Es esa instrucción hecha dato: mismo sitio, misma luz, misma pose, sin leer
nada. Y cuenta como cubierto lo que está esperando en el selector, no solo lo
subido: quien acaba de marcar «esta es la lateral» no tiene que ver que le sigue
faltando.

**Y el peso sube a 30 px, no a 34.** Manda la escala tipográfica de la casa
(`--fs-xl`); un tamaño suelto fuera de la escala es exactamente lo que hace que
el producto se vea «a cachos».

### 9.7 · Lo que queda de `M-12`

Las preguntas del protocolo **ya estaban** (el paso «cuestionario» del
asistente, con `activeQuestions`), y lo que se oculta ya se ocultaba (el paso
del peso no existe con `Oculto.weight`). Lo que sigue abierto es el **riesgo de
los ficheros sin cobertura**: `lib/saveQueue` guarda series y no sabe guardar
imágenes, así que «Mandar» con mala red sigue siendo la forma de perder la
revisión entera después de haberse hecho las fotos. Va con `W-05`, en la tanda 4.

### 9.8 · Estado de la validación

`lint`, `types`, `verify` y `build` en verde. **2.469 pruebas pasan**; fallan las
2 de `foodEquivCatalogo`, **preexistentes** (el catálogo generado aún trae los
dieciséis duplicados que quita la `0115`; falta `npm run catalogo`). Las 8
pruebas de base de datos de la `0119` pasan contra el Supabase local.

**Nada commiteado.** Y cuidado: durante esta sesión otro proceso estaba barriendo
las hojas de estilo en paralelo (los pesos tipográficos a la escala de cinco), así
que `src/styles/` tiene dos trabajos mezclados sin commitear.

---

## 10. Cuarta vuelta: «no se parece al documento», con la app delante

> «Sigue con los cambios del móvil, yo no lo veo ni de lejos como está en el
> documento.»

Tiene razón, y hacía falta verlo para saber **dónde**. Con la app de verdad en
un iPhone de 390 px (Supabase local, cuenta de cliente, tema claro y oscuro) las
nueve escenas se comparan una a una, y el resultado es que **la tanda 2
construyó la mecánica y no la forma**. La barra de la sesión, la regla, la
pastilla del pulgar, el peso a 30 px y los tres ángulos están y funcionan; lo
que no se parecía al prototipo es todo lo demás de la pantalla.

Tres distancias medidas, en orden de tamaño:

### 10.1 · La sesión (escena 03) — CORREGIDA

Con la barra puesta, debajo seguía intacta la página de siempre. Verificado en
captura: **título «Mi rutina» con su frase, la tarjeta azul del alta, la línea
del bloque, la cinta de sesiones y la cabecera del día con su fecha y sus
chapas** — unos 300 px de contexto antes del primer ejercicio, contestando a
preguntas que la barra ya contesta en 64. Y la cuenta se decía **dos veces a la
vez**: «1 de 21 series» arriba en la barra y otra vez abajo en la de guardado.

Y la tabla de series era la del escritorio: cinco columnas en 390 px dejan los
campos en 60, la cabecera en cinco rótulos de 9 px y el visto —el gesto más
repetido de la pantalla— en un disco de 26 px pegado al borde izquierdo, que es
donde el pulgar no llega.

| Mov. | Qué | Dónde |
|---|---|---|
| `S-01` | **Entrenando, la página es la sesión.** Con la barra puesta y solo en `/mi/rutina`, se callan el título, la tarjeta del alta, la cinta y la cabecera del día. `body:has(.barra-sesion)`, el mismo mecanismo con el que la cabecera de la aplicación ya cedía el sitio. | `responsive.css`, `ClientRoutineRoute` (`ruta-rutina`) |
| `S-02` | **La cuenta se dice una vez.** Entrenando, la barra de abajo es el parte del guardado y nada más. | `ClientRoutine` |
| `S-03` | **La serie, en el teléfono: dos cajas con nombre y un visto que se toca.** El número a la izquierda, las casillas anchas con su rótulo DENTRO, y el visto a la derecha con 44 px reales. | `SetCell`, `responsive.css` |
| `S-04` | **El objetivo y la referencia bajan a un pie de una línea** —«6-8 · la vez anterior 100 × 8 · semana 9»—, que es lo que paga el ancho de las casillas. Y el renglón del ejercicio cambia «la vez anterior · semana 9» por **cuántas series tiene**, que en 390 px ya no se ve de un vistazo. | `SetCell`, `ExerciseList` |

Nada de esto toca el escritorio: el corte es el del teléfono (639,98) y la
envoltura de la casilla es un `display: contents` que allí no existe. La tabla
de cinco columnas del entrenador está igual, comprobada en captura.

**No se copia del prototipo la miniatura del ejercicio** con su chapa de
duración: aquí no hay fotogramas. Es contenido, no maquetación, y la §8.5 ya lo
decía.

### 10.2 · La revisión (escena 06) — PENDIENTE

`M-12` puso sus piezas **dentro del asistente de tres pasos**, y la escena 06 es
una sola página. Lo que se abre hoy en «Mi revisión» es: dos pestañas, el título
«Mi check-in», una tarjeta con un botón azul enorme, cuatro tarjetas de cifras,
la tira de la semana, la gráfica de tendencia y **una tabla de 31 registros con
su papelera**. El peso a 30 px y los tres ángulos están detrás del botón.

La escena dice otra cosa: «Tu revisión · Semana 3 · te toca hoy», el peso, las
tres fotos con su pista y las preguntas. Una pantalla, un verbo. El historial no
desaparece: deja de ser lo primero.

### 10.3 · La portada (escena 02) — EN CONFLICTO, decide el dueño

La escena 02 es un saludo y tres cajas: lo que dejaste a medias, lo que ha
cambiado y tu peso. Lo que hay es **«Mi progreso»: el panel entero**, con el
tonelaje por microciclo, el volumen por grupo contra el MRV y «Tu plan».

Y no es un descuido: `CLIENT_SECTIONS` y `ClientStart` llevan escrito por qué el
inicio es el progreso —«es la razón por la que paga»— y por qué «Hoy» dejó de
ser una sección. **El prototipo y el código dicen cosas distintas y las dos
están argumentadas.** No se toca hasta que el dueño elija; lo que sí sobrevive a
las dos versiones es que «la dejaste a medias» y «lo que ha cambiado» ya están
arriba, que es el orden de la escena.

---

## 11. Quinta vuelta: el veredicto del dueño (12 sep)

> «Me gustaría una similar a la 03 pero que en vez de tener ese icono del vídeo
> tuviese una cadenita o algo así como link y pulsases, en pequeño, y que el
> cliente pudiese saber cuál es el rango de cada serie también. La portada y el
> resto me gusta como el prototipo, pero mejorado.»

Con eso se cierran las tres distancias del §10 y **las tres están construidas**.

### 11.1 · La sesión: la cadena, el galón y el rango de cada serie

`S-05` · **Muere la miniatura del prototipo.** Era la corrección de la 3.ª
vuelta (§8.2) y tenía un problema de fondo que solo se ve con la app delante:
**no hay fotogramas**. El vídeo es un enlace que pega el entrenador, así que ese
rectángulo de 52 px sería un hueco de color en cada renglón y empujaría la
primera serie media pantalla hacia abajo. En su sitio, la **cadena de 15 px**
pegada al nombre y en azul —`MarcaFicha`, que ya estaba construida desde `M-03`
y a la que este documento le iba por detrás—. Su zona tocable son 44 px reales y
sale del flujo, así que no mueve el nombre ni un píxel.

`S-06` · **El galón baja al renglón del ejercicio.** El teléfono decía «pecho ·
4 series» y ahora dice **«4 series · 6-8 reps · RIR 2 · 90 s»**, que es el galón
de la escena 03. Los objetivos distintos se enumeran («6-8 / 8-10»): una
pirámide no se puede decir con un rango único. Se paga quitando el MÚSCULO de
esa línea —quien está levantando ya sabe qué trabaja el press banca, y lo dice
igual la ficha detrás de la cadena— y metiendo el descanso dentro del galón, que
si no quedaban dos frases pegadas sin nada entre medias. La tabla ancha no se
entera: ahí el galón no se pinta.

`S-07` · **El rango, en cada serie.** Ya estaba (`S-04`) y ahora lleva su unidad:
el pie dice «**6-8 reps** · la vez anterior 100 × 8 · semana 9». Que se diga dos
veces —en el galón y en el pie— es a propósito y es lo que pidió el dueño: para
cuando vas por la cuarta serie, el renglón del ejercicio hace rato que se fue por
arriba, y en una pirámide cada serie tiene un objetivo distinto.

El prototipo queda corregido: fuera los seis pósters, dentro la cadena, y las
cuatro referencias de la escena 03 llevan delante su rango.

### 11.2 · La revisión (escena 06), reordenada

Es lo que decía el §10.2 —una ruta que ya existía, puesta en otro orden— más una
pieza que sale de donde estaba escondida.

| Mov. | Qué | Dónde |
|---|---|---|
| `R-01` | **El subtítulo es el estado**: «Semana 12 · te toca hoy» / «entregada» / «revisada», en vez de dos renglones explicando de qué va una pantalla que se abre una vez a la semana y siempre por lo mismo. | `ClientCheckInsRoute` |
| `R-02` | **Los tres ángulos salen del asistente.** Vivían en el paso 3: para saber que te faltaba la de espalda había que empezar a entregar la semana. Ahora son una tarjeta de la página, con «2 de 3» y la foto de la semana pasada debajo del que falta. **Sin botón**: el verbo de la pantalla sigue siendo «Entregar mi semana», y un segundo mando aquí serían otra vez dos nombres para un gesto. | `ClientCheckInsRoute`, `TresAngulos` |
| `R-03` | **El historial deja de colgar de «Tu semana».** Las revisiones en vídeo y la historia entera con su entrenador se pintaban DENTRO de esa tarjeta, así que se leían antes que sus propias fotos y que sus pesajes. Las coloca ahora la ruta, al final. La carga sigue siendo una: `useReviewRows` sube al dueño de la pantalla, que es lo que el propio gancho dice que hay que hacer. | `ClientWeek`, `ClientCheckInsRoute` |
| `R-04` | **Las cuatro cifras del peso, detrás de la casilla donde se escribe.** Del entrenador siguen arriba —él abre esto para leer—; del cliente bajan detrás de su semana, porque él lo abre para anotar y esas cuatro lecturas ya se las dice su portada al entrar. | `AnthropometryPanel` |

El orden queda: **título con estado → entregar → tus fotos → los pesajes de la
semana y su tendencia → las cuatro cifras → el historial de registros → tu
historia con tu entrenador.**

### 11.3 · La portada (escena 02): gana el prototipo, mejorado

El conflicto del §10.3 lo cierra el dueño: **la portada es la del prototipo**. Y
«mejorado» es lo que la separa de la escena:

| Mov. | Qué |
|---|---|
| `P-01` | **El inicio es la portada y va LA PRIMERA.** `CLIENT_SECTIONS` la abre con «Inicio» (icono de casa), y con eso `clientHomeFor` deja de depender de qué le lleves: es la única sección sin `service`. La rutina baja al segundo puesto sin perder nada — ver `P-02`. |
| `P-02` | **«Hoy te toca Empuje A · Empezar».** El prototipo dejaba esto en la escena 01 y sin construir. Sale de `buildStrip`, que ya marca `isToday`, y convive con «la dejaste a medias» por turnos: **nunca las dos**, que serían dos verbos delante de alguien que va a hacer una cosa. En un día sin sesión dice «Hoy descansas» y no lleva verbo: es un hecho, no una oferta. En ciclo rotativo no existe, porque ahí «hoy» no significa nada. |
| `P-03` | **«Tu peso» es una regla, no un anillo.** Empezaste en 80,0 · hoy 72,4 · objetivo 70,0, con marcas de graduación. Sin objetivo puesto no se dibuja: una regla que no acaba en ningún sitio es un adorno con forma de instrumento. **Y la variación no va en verde** —el prototipo la pintaba así—: un «−7,6 kg» verde es un aprobado, y quien está en una fase de ganancia leería su propio plan como un fallo. |
| `P-04` | **El progreso no se va a ninguna parte.** El panel entero sigue en esta pantalla, debajo y con su nombre («Tu progreso»), a un dedo de scroll y sin una puerta más que abrir. Lo que cambia no es si está: es qué se ve al entrar. Así las dos versiones del §10.3 tienen razón a la vez. |
| `P-05` | **El saludo vuelve a ser el titular**, con el bloque y la semana debajo: «Buenas, *Marta* · Bloque 1 · semana 10 de 10». Se cambió a «Mi progreso» con un argumento correcto —era la única pantalla cuyo titular no la nombraba— que deja de valer en cuanto la pantalla ya no es el progreso. |

**Lo que esto cuesta y hay que mirar con la app delante:** el aterrizaje del
portal cambia. Quien abría en «Mi rutina» ahora abre en su portada — con la
sesión de hoy y su verbo en lo primero que ve, o sea un toque MENOS para
empezar a entrenar, pero es una decisión de producto y se revierte con una línea
(el orden de `CLIENT_SECTIONS`).

### 11.4 · Estado

`lint`, `types`, `verify` y `build` en verde. Capturado con la app real
(Supabase local, cuenta de cliente, iPhone de 390 px) en `mi/inicio`,
`mi/rutina` y `mi/evolucion`. Tests: pasan todos salvo los **2 preexistentes** de
`foodEquivCatalogo` (falta `npm run catalogo` con la 0115 aplicada); `routes.test`
se ha actualizado, porque fijaba que el inicio del portal era la rutina.
