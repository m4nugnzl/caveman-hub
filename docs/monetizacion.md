# Monetización: cobrar por el hub

> **Decisión tomada: modelo A —suscripción al entrenador—.** Este documento fija
> qué significa eso para la arquitectura y en qué orden hay que construirlo. No es
> un plan comercial: es la lista de lo que cambia en el producto.
>
> Fecha: agosto de 2026.
>
> **Estado: EL PRODUCTO COBRA.** Probado en producción con una compra real el 13
> de agosto de 2026 (§3). Construido: bloqueantes legales (§2), planes, límites y
> modo solo lectura (§3), biblioteca de partida y carga perezosa (§4).
>
> Lo que queda **no es cobrar, es sostenerlo**:
>
> - **Correo transaccional** (§4.3). Es lo primero que se rompe con usuarios que
>   no seas tú: el SMTP por defecto de Supabase se agota en unos pocos envíos por
>   hora, compartidos entre registro y recuperación de contraseña.
> - **Probar una restauración** de copia (§2.3). «Tengo copias» y «puedo
>   recuperarme» no son lo mismo hasta que se prueba una vez.
> - **Revisión legal** de privacidad y condiciones (§2.2).
> - **Tres a cinco entrenadores** como socios de diseño antes de publicar precios.
>
> **Y una cosa más, añadida el 19 de agosto de 2026: la tarifa de la §5 no da de
> sí.** Dos peldaños hacen que el precio no crezca con el cliente, así que todo el
> crecimiento tiene que venir de cuentas nuevas. La §7 lo desmonta y propone la
> tarifa que lo sustituye.

---

## 0. La confusión que hay que deshacer primero

**El Stripe que ya existe en el proyecto no sirve para cobrar.**

`0012_stripe.sql`, `0013_stripe_webhook.sql` y las funciones `stripe-payments` y
`stripe-webhook` leen el Stripe **del entrenador**, con una clave restringida de
*solo lectura*, para saber si sus clientes le han pagado **a él**. Es
conciliación: un espejo de su contabilidad, y a propósito no puede mover dinero.

Cobrar por el hub necesita una segunda integración que no comparte nada con esa
salvo el proveedor:

| | Stripe del entrenador (existe) | Stripe de la plataforma (falta) |
|---|---|---|
| De quién es la cuenta | De cada entrenador | Nuestra, una sola |
| Dónde vive la clave | `integration_secrets`, por integración | `Deno.env` de la función |
| Permisos | Solo lectura | Cobra de verdad |
| Qué contesta | «¿me ha pagado mi cliente?» | «¿me ha pagado este entrenador?» |

Mezclarlas —reutilizar `integrations` para la suscripción del hub— sería meter la
facturación del negocio dentro de la tabla de conexiones opcionales de cada
usuario. Van separadas.

---

## 1. Por qué el modelo A y no los otros

| Modelo | Qué exige | Decisión |
|---|---|---|
| **A. Suscripción al entrenador** | Planes, límites, prueba, portal de facturación | **Elegido** |
| B. Comisión sobre lo que cobra a sus clientes (Stripe Connect) | KYC, cuentas conectadas, pagos salientes, reembolsos, responsabilidad fiscal | Descartado por ahora: multiplica el trabajo y el riesgo legal |
| C. Instalación a medida para gimnasios | Casi nada de producto nuevo | Sirve para financiar A, pero no escala |

La decisión ya estaba tomada a medias: `modelo-de-equipo.md` dice que *«la
suscripción y la facturación son del equipo, no de una persona»*. Eso es lo que
determina dónde cuelga la suscripción, y sigue siendo correcto.

**La suscripción es de `teams`.** Si colgara de `profiles`, un equipo de cuatro
entrenadores tendría cuatro suscripciones sin relación entre sí, y el dueño que
cambia de cuenta se llevaría el negocio consigo.

---

## 2. Bloqueantes antes del primer cobro

No son mejoras. Son condiciones para poder cobrar.

### 2.1 Recuperación de contraseña — **HECHO**

Con usuarios gratuitos, quien olvida su contraseña se crea otra cuenta. Con
usuarios de pago, escribe pidiendo que le devuelvan su cartera de clientes, y no
había forma de resolverlo sin entrar en el panel de Supabase.

Resuelto: el acceso tiene un tercer modo que pide el enlace, y
`components/Auth/PasswordResetPage.jsx` (`/nueva-contrasena`) lo recibe. Queda una
comprobación de configuración, no de código: **cuánto dura ese enlace** —mientras
vive, vale como acceso a la cuenta—.

Está en *Authentication → **Sign In / Providers** → Email*, desplegando el
proveedor: el campo **«Email OTP Expiration»**, en segundos. **No está en
*Authentication → Emails***, que es donde este documento decía y donde ya no hay
más que las plantillas y el SMTP. El panel lo movió y buscarlo donde no está
cuesta un rato.

Ese mismo número gobierna los dos correos, el de confirmar registro y el de
recuperar contraseña, y **la plantilla de `supabase/templates/` dice «caduca en
una hora»**: si se cambia aquí, hay que cambiarlo allí o el correo miente.

### 2.2 Consentimiento y finalidad — **HECHO**

Era el único punto de RGPD que seguía pendiente en `auditoria.md` (3.5). Son datos
de salud —artículo 9—, así que hace falta consentimiento explícito y hace falta
poder demostrarlo.

Resuelto en `0018_client_consent.sql`: el cliente lo acepta al canjear su
invitación y queda archivado con la versión del texto, en la misma transacción que
el enlace de su cuenta. La función que canjeaba sin registrarlo ya no la puede
llamar nadie desde fuera.

**Política de privacidad y condiciones** — escritas, en `/privacidad` y
`/condiciones`, públicas y sin sesión (que es como las pide Stripe y como las
tiene que poder leer quien todavía no tiene cuenta). Enlazadas desde el registro y
desde el consentimiento del cliente.

Dos cosas antes de darlas por buenas:

- **Faltan los datos del titular** —nombre, NIF, domicilio y email—. Están como
  huecos que la página pinta en rojo y con un aviso encima, a propósito: una
  política publicada con «[TU NOMBRE]» dentro es peor que no tenerla, y si el
  hueco no se ve, se publica.
- **No las ha revisado un abogado.** Están redactadas sobre lo que la aplicación
  hace de verdad, que es la parte difícil de acertar, pero esto trata datos del
  artículo 9 y ahí equivocarse sale caro.

### 2.3 Copias de seguridad propias — **CASI**

`auditoria.md` 3.6. El trabajo de un año de un cliente vive en unas pocas filas
JSONB. Perder eso siendo gratis es un disgusto; siendo de pago es el final.

Hecho: `npm run backup` (ver `copias.md`), con archivos, cuentas y verificación.
Falta **probar una restauración de verdad**, que es lo único que convierte «tengo
copias» en «puedo recuperarme». Hasta entonces esto no está cerrado.

### 2.4 El registro está abierto

Cualquiera crea cuenta de entrenador —el trigger `handle_new_user` le pone rol
`coach`— y usa todo sin límite. Hoy da igual; el día que haya precios, es la vía
de escape.

---

## 3. La columna vertebral de cobro — **EN PRODUCCIÓN**

> Verificado en sandbox y **después con una compra real**, el 13 de agosto de
> 2026: aviso de prueba caducada → pasarela con el precio de producción → cobro →
> evento → firma verificada → plan activo con su fecha de renovación → baja y
> reembolso → vuelta a `prueba`. El circuito entero, con dinero de verdad.
>
> Dos tropiezos por el camino, los dos por lo mismo y anotados porque volverán a
> pasar al pasar a producción: **el sandbox y la cuenta real son mundos separados**.
> Los `price_…` creados en uno no existen en el otro («No such price»), y un
> webhook dado de alta en uno no recibe los eventos del otro —que es peor, porque
> no falla: simplemente no llega nada y el plan se queda como estaba—.


### 3.1 Esquema (`0019_billing.sql`) — **HECHO**

```sql
team_subscriptions (
  team_id uuid PRIMARY KEY REFERENCES teams,
  stripe_customer_id text, stripe_subscription_id text,
  plan text, status text,               -- trialing | active | past_due | canceled
  current_period_end timestamptz, trial_ends_at timestamptz, seats int
)
```

Tal cual, más tres cosas que no estaban previstas aquí y sí hacían falta:

- **`plan_limits` como tabla**, no como un `CASE` dentro de una función. Cambiar
  un límite pasa a ser un `UPDATE` en vez de una migración, y la pantalla lee la
  misma fila que impone el disparador —si el límite estuviera en una constante de
  JavaScript, tarde o temprano diría algo distinto de lo que la base comprueba—.
  Los precios no están ahí: viven en Stripe, que es quien cobra.
- **`ensure_my_team()`**. La `0006` rellenó un equipo para cada entrenador que ya
  existía y nada crea uno para los que llegan después: la aplicación nunca inserta
  en `teams`. Con la suscripción colgando del equipo, todo el que se registrara a
  partir de ahora —justo quien pagaría— no tendría de qué colgarla.
- **Injerto sin límites para los que ya estaban** (plan `fundador`). Aplicar la
  migración no capa a nadie: un producto que empieza a cobrar no se lo cobra
  retroactivamente a quien ya estaba dentro.

Y `my_team_plan()` devuelve también el **recuento de clientes y el límite**, no
solo el plan: la pantalla que dice «llevas 28 de 30» necesita las tres cosas a la
vez, y pedirlas por separado permite enseñar un recuento y un límite de momentos
distintos.

### 3.2 Funciones (`billing-checkout`, `billing-webhook`) — **HECHO**

La clave es de la plataforma y **sí puede mover dinero**, así que vive en los
secretos de la función y nunca en la base de datos. Tres decisiones que sostienen
lo demás:

- **`billing-checkout` no escribe el plan.** Devuelve una URL de Stripe y nada
  más. Si activara el plan al pulsar «Contratar», bastaría con abrir la pasarela y
  cerrar la pestaña para tenerlo gratis. Quien escribe es el webhook, con el cobro
  confirmado.
- **Del navegador solo viaja el NOMBRE del plan**, nunca el `price_id`. El precio
  se lee de `plan_limits` en el servidor: si lo mandara el cliente, cualquiera
  podría pedir el plan de sesenta y nueve euros al precio de uno de un céntimo.
- **El equipo viaja en los metadatos de Stripe** y vuelve en el evento. Emparejar
  por email fallaría en cuanto alguien pagara con una dirección distinta de la de
  su cuenta.

La verificación HMAC de la firma se repite en lugar de compartirse: dos funciones
de Deno no comparten módulos sin empaquetado, y tener el secreto de una al alcance
de la otra sería peor que repetir cuarenta líneas.

Cambiar tarjeta, ver facturas y darse de baja se delegan en el **portal de
Stripe**. Reimplementarlo significaría manejar datos de tarjeta.

#### Cambiar de plan NO es contratar — añadido el 24/08/2026

Lo aprendimos cobrando de más. Un entrenador con la Solo de 39 € pulsó «Pasar a
Pro», pagó los 79 € **enteros** y se quedó con las dos suscripciones activas.
Stripe hizo lo que se le pidió: una sesión de pago en modo suscripción crea
siempre una suscripción NUEVA y cobra el primer periodo completo. El prorrateo
configurado en el panel gobierna los *cambios* de suscripción, y allí no había
ninguno — había una compra.

Desde entonces `billing-checkout` mira si el equipo ya tiene una suscripción viva
en Stripe y, si la tiene, la **modifica** (`POST /v1/subscriptions/{id}`) en vez de
abrir la pasarela. Subida: `always_invoice`, se cobra la diferencia al momento con
lo no consumido descontado. Bajada: `create_prorations`, el saldo se descuenta de
la siguiente factura en lugar de emitir una factura negativa. La dirección la
decide el `sort` de `plan_limits`.

Dos cosas que van con ello y que son fáciles de dejarse:

- **`metadata[plan]` se actualiza en la misma llamada.** El webhook escribe el
  plan leyendo ese metadato, así que cambiar el precio sin cambiarlo deja a
  alguien pagando Pro con el tope de Solo en su siguiente renovación. Es el mismo
  pisotón que la 0061 ya documenta, y por eso el portal de Stripe no vale para
  cambiar de plan: no toca los metadatos.
- **El webhook descarta los eventos de suscripciones que ya no son la del
  equipo.** Todas las suscripciones de un equipo llevan su `team_id`, así que la
  baja de una muerta dejaba en `prueba` —y en solo lectura— a quien estaba pagando
  otra.

Queda un caso sin cubrir a propósito: si el banco pide autenticación para cobrar
la diferencia, la factura se queda pendiente y la cuenta pasa a `past_due`, que
por la 3.4 permite seguir trabajando pero no dar de alta a nadie nuevo. Stripe le
manda al cliente el enlace para autenticarse. Montar aquí una pantalla de
confirmación de pago propia es bastante más trabajo del que ese caso pide hoy.

### 3.3 Los límites los impone Postgres, no React — **HECHO**

Es el error clásico y es de seguridad, no de estilo. Esconder un botón con
`if (plan === 'pro')` no limita nada: la `anon key` está en el navegador y el
`INSERT` se puede hacer a mano. El límite de clientes tiene que ser un **trigger
`BEFORE INSERT` en `clients`** que consulte `team_plan()`.

La interfaz *explica* el límite; quien lo *aplica* es la base de datos. Es el
mismo principio que ya sostiene todo lo demás: RLS como única frontera de
autorización, sin lógica de permisos duplicada en JavaScript.

El disparador **también rellena `team_id`** cuando falta. Sin eso, el límite se
esquiva escribiendo `team_id: null` en el `INSERT`, y un control que se elude
omitiendo un campo no es un control.

**Archivar clientes** (`0020_client_archive.sql`) — **HECHO**, y era condición
para que el límite fuera legítimo: sin ello, la única forma de bajar del tope era
borrar a alguien con su historial. Ahora `clients.status` se usa de verdad, el
archivado no cuenta para el plan, no aparece en la cartera y conserva todo lo suyo.

### 3.4 Impago: solo lectura, nunca borrado — **HECHO (0027)**

La `0019` bloqueaba solo el alta de clientes, y eso dejaba un agujero de negocio:
como la prueba permite tres, con tres clientes se podía usar la aplicación entera
—programar, montar dietas, ampliar la biblioteca— indefinidamente y gratis. Un
periodo de prueba que no termina no es un periodo de prueba.

La `0027` lo cierra por RLS, con tres decisiones deliberadas:

- **Leer, exportar y borrar nunca se bloquean.** Los datos son del entrenador y de
  sus clientes; no se retienen como rehenes. Y el borrado menos aún: es una
  obligación legal suya, no un favor que dependa de tener un recibo al día.
- **Los clientes no se enteran.** Sus escrituras van por las funciones de la
  `0014` y la `0016`, no por estas políticas. Que su entrenador deje de pagar no
  puede impedirle a una persona registrar su propio peso: no es ella quien debe.
- **`past_due` sigue permitiendo trabajar.** Un webhook perdido o una tarjeta que
  caduca un domingo dejarían sin trabajar a alguien que sí paga, y eso es peor que
  cobrar dos días tarde. Bloquear el crecimiento ya presiona. Cambiar de idea es
  quitar una palabra de `team_write_allowed`.

Y una consecuencia en la aplicación que había que resolver aparte: RLS rechaza la
fila sin mensaje, así que un guardado bloqueado llegaba a `upsertClientRow` como
cero filas afectadas —lo mismo que un conflicto de edición— y se anunciaba como
**«alguien ha cambiado estos datos mientras editabas»**. Mentira, y de las que
hacen perder una tarde buscando a ese alguien.

Se distinguen sin preguntar nada: si la versión del servidor es exactamente la que
se leyó, nadie tocó la fila y el `UPDATE` habría casado; si no casó, lo rechazó la
política. Ahora dice lo que pasa.

### 3.5 Detalle de infraestructura: Checkout alojado

`public/_headers` declara `script-src 'self'` y un `connect-src` limitado a Supabase.
Stripe.js embebido obligaría a abrir la CSP a `js.stripe.com` y `api.stripe.com`;
**Checkout alojado, con redirección por `window.location`, no toca la CSP en
absoluto** (`form-action 'self'` solo afecta al envío de formularios, no a una
navegación). Es más seguro y es menos trabajo.

### 3.6 Pasar del sandbox a cobrar de verdad — **HECHO el 13/08/2026**

Nada de lo configurado en el sandbox sirve en la cuenta real. Los objetos de
Stripe no cruzan entre entornos, y el fallo no siempre es ruidoso: un precio de
otro entorno da «No such price», pero un **webhook** del entorno equivocado no da
ningún error — simplemente no llega nada y el plan nunca se activa.

La lista, en orden:

1. Activar la cuenta de Stripe: datos fiscales, cuenta bancaria y las URLs
   públicas de privacidad y condiciones (que exigen tener la app desplegada).
2. Crear los dos productos **en la cuenta real** y ejecutar el `UPDATE` de
   `plan_limits` con sus `price_…` nuevos.
3. `STRIPE_SECRET_KEY` = la `sk_live_…`.
4. Dar de alta el webhook **en la cuenta real**, con los mismos cinco eventos, y
   guardar **su** `whsec_…`.
5. `APP_URL` = el dominio de verdad, sin barra final.
6. Registro fiscal de España en Stripe Tax, si se usa (sin registro calcula IVA
   cero y no avisa).

Comprobación: una compra real con tarjeta propia y su reembolso. En directo no
funcionan las tarjetas de prueba.

### 3.7 El corte del injerto, y cómo sacar a alguien de él

El injerto de la 0019 —«todos los equipos existentes entran en `fundador`, activo
y sin límites»— es correcto como decisión y tiene un efecto que no se ve al
escribirlo: **quién entra en él lo decide el reloj**, no una conversación.

Pasó de verdad. La facturación se activó el 13/08/2026 y el injerto corrió esa
tarde:

```
13 ago 08:48  fundador · active   ← la cuenta del propio producto
13 ago 12:05  fundador · active   ← un cliente, por veinte horas
────────────  aquí corrió la 0019  ────────────
14 ago 08:43  prueba · trialing   ← catorce días
14 ago 10:42  prueba · trialing   ← catorce días
```

Veinte horas separaron «gratis, ilimitado y sin caducidad para siempre» de «te
cobro en dos semanas». Y como `fundador` no tiene `trial_ends_at` ni
`stripe_customer_id`, esa cuenta **no caduca ni factura nunca** mientras nadie lo
cambie a mano.

`npm run radiografia` lo detecta desde entonces, y lo hace por los datos y no por
el nombre del plan: `status = 'active'` sin cliente de Stripe y sin periodo de
cobro es, exactamente, barra libre indefinida. La cuenta propia se excluye por
`platform_admins`.

#### Sacar a alguien del injerto

Es lo que la propia 0019 dice que hay que hacer —«un `UPDATE` hablado con cada
uno»— y el orden importa, porque **no hay correo transaccional** (§4.3): nadie va
a avisar a esa persona. Primero se habla, después se ejecuta.

**Desde la migración 0056 esto duele mucho menos**: el destino ya no es una
prueba de catorce días sino el plan gratuito permanente, que es el mismo que
tiene cualquiera que se registre hoy. No se le quita el acceso, se le quita el
«sin límite»: pasa a tres clientes, gratis y sin fecha. Lo único que hay que
comprobar antes es que **no tenga ya más de tres**, porque entonces el tope le
dejaría fuera de su propio trabajo y lo que toca es negociar un plan de pago.

```sql
-- 1. ANTES: cuántos clientes tiene y en qué plan está.
--    Si tiene más de 3 activos, `prueba` le dejaría fuera de su propio trabajo:
--    hay que negociar un plan de pago en lugar de esto.
SELECT p.email, ts.plan, ts.status, ts.trial_ends_at, ts.stripe_customer_id,
       (SELECT count(*) FROM public.clients c
         WHERE c.team_id = t.id AND c.status <> 'archived') AS clientes_activos
FROM public.teams t
JOIN public.profiles p          ON p.id = t.owner_id
JOIN public.team_subscriptions ts ON ts.team_id = t.id
WHERE p.email = 'CORREO@EJEMPLO.COM';

-- 2. EL CAMBIO: al plan gratuito permanente, el mismo que tiene quien se
--    registra hoy. `status = 'active'` y SIN `trial_ends_at`, que es lo que hace
--    que no caduque (0056). La guarda de `stripe_customer_id IS NULL` impide
--    tocarle el plan a alguien que YA está pagando: sin ella, un correo mal
--    copiado le cancela la suscripción a un cliente de verdad.
UPDATE public.team_subscriptions ts
SET plan          = 'prueba',   -- clave interna del plan «Gratis», ver 0056
    status        = 'active',
    trial_ends_at = NULL
FROM public.teams t
JOIN public.profiles p ON p.id = t.owner_id
WHERE ts.team_id = t.id
  AND p.email = 'CORREO@EJEMPLO.COM'
  AND ts.stripe_customer_id IS NULL;

-- 3. DESHACER, si hiciera falta. Devuelve el injerto tal y como estaba.
UPDATE public.team_subscriptions ts
SET plan = 'fundador', status = 'active', trial_ends_at = NULL
FROM public.teams t
JOIN public.profiles p ON p.id = t.owner_id
WHERE ts.team_id = t.id AND p.email = 'CORREO@EJEMPLO.COM';
```

**Catorce días desde hoy y no la fecha que le habría tocado por paridad.** Quien
lleva días creyendo que tenía barra libre no ha estado probando nada con la
cabeza de quien está probando: darle la prueba entera desde el momento en que se
le avisa es lo único que la convierte en una prueba de verdad.

#### El nombre del plan, que confunde

`fundador` se lee como «el fundador del producto» y significa «ya estaba dentro
antes de que empezaras a cobrar». Confundió a quien lo escribió. Si se renombra
—`heredado` dice lo que es—, hay que tocar `plan_limits.plan`, que es clave
primaria referenciada por `team_subscriptions.plan`: se hace con un `INSERT` del
nuevo, un `UPDATE` de las filas que lo usan y un `DELETE` del viejo, en una
transacción. La etiqueta visible (`plan_limits.label`) se puede cambiar sola y
sin tocar nada más, y arregla el 90 % de la confusión.

---

## 4. Lo que hace que valga la pena pagarlo

Tener cobro no es tener producto vendible.

### 4.1 El primer minuto — **HECHO**

Quien entraba por primera vez se encontraba una aplicación vacía sin ninguna
pista del orden de trabajo. Resuelto con `components/WelcomeTour.jsx`: cuatro
pasos para el entrenador —dar de alta, programar, **invitar**, y de ahí a «Hoy»—
y cuatro para el cliente, con la privacidad de sus fotos dicha explícitamente.

Y **la biblioteca de partida** (`0022_starter_library.sql`) — **HECHO**. Un
entrenador nuevo entraba a una aplicación sin un solo ejercicio ni un solo
alimento: para escribir «Press banca» tenía que darlo de alta él, y luego los
cuarenta siguientes. Ahora el equipo nace con 46 ejercicios repartidos por grupo
muscular y 46 alimentos con sus macros, y la primera sesión se puede programar el
mismo día.

Solo entra en bibliotecas vacías, y lo comprueba por separado para ejercicios y
alimentos: completar la lista de quien ya escribió la suya sería reordenarle el
trabajo sin permiso.

### 4.2 La carga ansiosa es un bloqueante comercial — **EN CURSO**

**Decidido**: un resumen por cliente calculado en Postgres. El arranque baja las
fichas y ese resumen; el detalle de un cliente se carga al abrirlo. `domain/`
sigue siendo puro —cambia de qué se alimenta, no lo que calcula—.

**Primer paso, hecho: normalizar los registros heredados.** Al diseñar la vista
apareció que «cuándo entrenó este cliente» no se puede responder hoy en SQL sin
reimplementar la compatibilidad de `legacySession` —qué cuenta como día entrenado,
cuándo se descarta la versión heredada—, o sea, duplicar en otro lenguaje la regla
que ya causó el fallo grave de `auditoria.md` 1.1. Con los datos normalizados es
leer fechas, mecánico y sin ninguna regla que copiar.

El normalizador está en *Ajustes → Copia de seguridad*.

**Segundo paso, hecho: `training_summaries()` (migración 0024).** El arranque baja
las fichas y un resumen por cliente; el programa completo, solo del que se abre.

- La función de Postgres **selecciona**, no calcula: devuelve las sesiones tal cual
  y el tonelaje lo sigue sacando el mismo JavaScript. Ninguna regla duplicada.
- Si a algún cliente le quedan registros heredados, la función lo dice y la
  aplicación carga como antes. Todo o nada por entrenador: media cartera resumida
  y media completa sería la peor versión de las dos.
- `ensureProgram` trae el programa del cliente que se abre —y del que se copia—.
  Sin eso, escribir sobre un cliente sin cargar habría sustituido su programa por
  uno vacío.


`auditoria.md` 1.5: se descargan todos los datos de todos los clientes al
arrancar. Duele a partir de treinta clientes, que es exactamente el tamaño del
entrenador dispuesto a pagar. **El mejor cliente es el que peor experiencia
tiene**, y eso es un problema de ingresos antes que de rendimiento.

### 4.3 No hay correo transaccional

La invitación se copia a mano y se pega en WhatsApp. Funciona con cinco clientes
y no con cuarenta.

---

## 5. Empaquetado

> **Esta es la tarifa que está cobrando hoy, y la §7 explica por qué se queda
> corta y con qué se sustituye.** Se deja escrita tal cual: es lo que hay en
> producción mientras la §7 no se ejecute, y el porqué de la fila «Gratis» —el
> recuadro de abajo— sigue siendo válido y la §7 no lo toca.

| Plan | Precio | Límite duro (en la base de datos) |
|---|---|---|
| Gratis | 0 €, **sin plazo**, sin tarjeta | 3 clientes, 1 asiento |
| Solo | 25 €/mes | 30 clientes activos, 1 asiento |
| Equipo | 69 €/mes | Sin límite, asientos, pantalla Equipo, integraciones, registro de cambios |

> **Era una prueba de 14 días y dejó de serlo** (migración 0056). Una prueba de
> dos semanas le pide a alguien que decida sobre una herramienta de seguimiento
> **antes de haber visto un solo ciclo de seguimiento**: el check-in es semanal y
> el progreso de un cliente se mide en meses. Catorce días no enseñan lo que esto
> hace.
>
> Con tres clientes y sin plazo, el entrenador se trae a los que lleva, trabaja
> con ellos de verdad, y el día que quiere meter al cuarto ya tiene aquí dentro
> meses de trabajo que no piensa rehacer en otro sitio. El límite deja de ser un
> cronómetro y pasa a ser **el crecimiento de su negocio**, que es cuando pagar
> tiene sentido para él y no solo para nosotros.
>
> La **clave interna del plan sigue siendo `prueba`** —está escrita en el webhook
> de Stripe, que se despliega aparte— y solo cambió la etiqueta visible, que es
> «Gratis». El porqué, en la cabecera de la 0056.

Se factura por **cliente activo** —con actividad en los últimos 30 días—, no por
ficha creada: se alinea con lo que el entrenador cobra y no penaliza conservar el
historial de quien lo dejó. Requiere definir esa cuenta como vista.

Las integraciones que ya existen (`0010`–`0013`) son la palanca natural del plan
Equipo: son lo que quiere un entrenador con un negocio detrás y le da igual a uno
que empieza.

---

## 6. Orden

1. ~~Recuperación de contraseña~~, ~~consentimiento~~ y ~~copias~~ (hechos). Queda
   **probar una restauración**, la privacidad de los ya enlazados y los textos
   legales
2. `0018_billing.sql` + funciones + límites por trigger (§3)
3. Catálogo por defecto al crear equipo (§4.1)
4. Carga perezosa por cliente (§4.2)
5. Tres a cinco entrenadores como socios de diseño, con onboarding manual, antes
   de publicar precios

---

## 7. La tarifa se queda corta: por qué y con qué se sustituye

> Fecha: 19 de agosto de 2026. **EJECUTADA en lo esencial** (21/08/2026): la
> escalera y la periodicidad son las migraciones 0058–0062, y los tres límites
> por funciones son la 0064 (asientos), la 0065 (integraciones), la 0066
> (registro de cambios) y la 0067 (almacenamiento). La tabla de la §7.3
> sustituye a la de la §5, que se conserva como historia. No toca nada de la §3
> —la columna vertebral de cobro vale igual— ni el porqué del plan gratuito.
>
> **Lo que queda abierto está en la §7.10**: la cuenta por cliente *activo* (el
> código sigue contando fichas no archivadas) y el plan `fundador` con barra
> libre indefinida.
>
> Sale de una observación del autor: *«25 € como primer pago es poco porque solo
> existen dos pagos, y la mayoría va a coger el primero»*. Es correcta, y las
> causas son cuatro y ninguna es «el precio está bajo».

### 7.1 Las cuatro fugas

**1. El techo está al revés.** `Equipo` es ilimitado en clientes **y en
asientos**. Un gimnasio con seis entrenadores y trescientos clientes paga 69 €.
Es el cliente que más almacenamiento, más soporte y más carga de arranque
consume (§4.2), y el que menos margen deja. Y el mecanismo ni siquiera existe:
`billing-checkout` manda `line_items[0][quantity] = '1'` fijo, así que
`max_seats` limita pero no factura.

**2. El acantilado del cliente 31.** De 30 a 31 clientes son +176 % (25 → 69 €).
Un solo cliente más, y casi el triple de factura. Da igual lo que valga el plan
de arriba: nadie lee eso como un precio, lo lee como una multa.

> Aquí hay una trampa de razonamiento que conviene dejar escrita, porque la
> primera versión de esta sección cayó en ella. Parecía que, como archivar no
> cuenta para el límite (0020, §3.3), la jugada racional de quien llega a 31
> fuese archivar a uno en vez de pagar. **No lo es:** si los 31 le están pagando,
> archivar a uno significa perder al cliente, no la cuota. El archivo solo sirve
> para los que ya se fueron, que es exactamente para lo que se construyó.
>
> Importa porque cambia una decisión: el tamaño del peldaño **no está limitado
> por el fraude**, está limitado por lo que parece justo. Y lo que decide si
> parece justo no es cuánto sube, es **cuántos clientes más te llevas por esa
> subida**. Doblar el precio por triplicar el cupo se lee como un descuento;
> triplicarlo por un cliente más se lee como una multa.

**3. Se captura el 1 % del valor.** Un entrenador con treinta clientes a 60–100 €
factura entre 1.800 y 3.000 € al mes y paga 25 €. Entre el 0,8 % y el 1,4 %. La
referencia del software vertical es el 2–5 % de lo que sostiene.

**4. No hay expansión, que es la fuga que de verdad decide el negocio.** Solo hay
un escalón. Un entrenador que triplica su cartera paga lo mismo el tercer año que
el primero, así que **todo el crecimiento tiene que venir de cuentas nuevas**:
justo el motor más lento y más caro, y el que peor le sienta a un producto sin
canal de adquisición. La escalera no está para exprimir a nadie; está para que
crecer con el cliente no exija encontrar otro.

**Y una fuga de caja que se arregla sin código:** `automatic_tax` está activado en
`billing-checkout`, pero quien decide si los 25 € llevan el IVA dentro o fuera es
el `tax_behavior` del *Price* en Stripe. Si está en `inclusive`, de cada 25 € se
ingresan 20,66 €. Los clientes son autónomos y **se lo deducen**: el precio se
anuncia «+ IVA» y el `Price` va en `exclusive`. Es un 21 % neto por comprobar una
casilla, y hay que comprobarla antes que ninguna otra cosa de esta sección.

### 7.2 Lo que hace el mercado, que resulta ser lo mismo

Consultado en agosto de 2026:

| Producto | Entrada | Escalones | Techo |
|---|---|---|---|
| TrueCoach | 20 $ (5 clientes) | 5 → 20 → 50 | 107 $ |
| Everfit | Gratis 5, desde 19 $ | 10 → 20 | + módulos |
| Trainerize | Gratis 1, desde 22 $ | 15 → 30 | + módulos |
| Hexfit | 29 € | por clientes | — |
| Trainingym | — | por gimnasio | 99,99 € |

Dos cosas, y la segunda importa más que la primera:

- **Todo el sector cobra por clientes activos, en cuatro o cinco peldaños.**
  Nadie tiene dos. La escalera no es una ocurrencia: es la norma de la categoría,
  y el entrenador que viene de otra herramienta ya la entiende sin que se la
  expliquen.
- **La mitad de su ingreso sale de módulos aparte.** Trainerize vende la
  nutrición por 33–45 $ al mes; Everfit vende el plan de comidas (33–39 $), la
  automatización (24–29 $) y los cobros (8–9 $). Aquí la nutrición está dentro,
  entera, por 25 €. **Eso no hay que cambiarlo** —integrada es la tesis del
  producto, §1 de `producto.md`: el bucle es programar, comer, registrar y
  revisar, y partirlo en módulos sería vender medio bucle—, pero **el nivel de
  precio tiene que reflejar que está dentro**. Se cobra por tamaño, no por
  trozos.

Conviene mirar esa tabla dos veces, porque la primera lectura engaña. Las
entradas visibles están entre 14 y 29 €, y la §7.3 pone la suya en 39: parece que
se sale por arriba. **No se sale, porque no se está comparando lo mismo.** Los
19 $ de Everfit no incluyen el plan de comidas ni la automatización ni los
cobros; los 22 $ de Trainerize no incluyen la nutrición. Sumando lo que aquí va
dentro, la comparación honesta de esa columna no es 19 $, es 19 + 33 + 24. **El
precio de entrada de este producto no es alto: es sincero**, que es una posición
peor para el escaparate y mejor para todo lo demás.

### 7.3 La tarifa

| Plan | Precio (+ IVA) | Clientes activos | Asientos | Integraciones | Almacenamiento |
|---|---|---|---|---|---|
| **Gratis** | 0 €, sin plazo | 3 | 1 | No | 512 MB |
| **Solo** | 39 €/mes | 10 | 1 | No | 10 GB |
| **Pro** | 79 €/mes | 30 | 1 | Sí | 50 GB |
| **Equipo** | 149 €/mes | Sin límite | 3 · +19 €/asiento | Sí | 250 GB |

> **El almacenamiento se dimensionó midiendo, no redondeando** (agosto de 2026,
> con la 0067): una foto reducida son ~0,3 MB y el grabador escribe a
> ~7,5 MB/min. La regla tiene dos mitades. En los **de pago**, el uso previsto
> cabe alrededor de un año o más sin borrar nada —fotos semanales de toda la
> cartera más correcciones cortas en vídeo: Solo ~11 meses con vídeo semanal y
> ~21 con quincenal, Pro ~17, Equipo ~29— y el tope solo muerde a quien aloja
> dentro la revisión larga semanal, que la 0040 ya manda a YouTube/Loom. En
> **Gratis** el tope es corto a propósito: con fotos y algún vídeo suelto dura
> ~6 meses (solo fotos, años), pero un año de vídeo regular gratis no —grabar
> en serio es comportamiento de quien vive de esto, y ese convierte—. El coste
> no es el motivo: el gigabyte cuesta ~0,021 $/mes y el tope lleno de Equipo
> son ~5 $ contra 149 €; la cuota existe contra el disco-duro-gratis y contra
> el egress del vídeo alojado.

Y **anual con dos meses de regalo** (paga diez, usa doce) en todos los de pago.

La lógica, que sobrevive aunque las cifras cambien:

- **El plan gratuito permanente es lo que permite que el primer plan de pago no
  sea barato.** Es la consecuencia de la 0056 que no estaba escrita en ningún
  sitio, y es la que decide toda la columna de precios. Con una prueba de catorce
  días, quien no paga se va, y entonces el primer precio tiene que ser lo más
  bajo que se pueda tragar. **Con un gratuito sin plazo, quien no paga no se va:
  se queda en tres clientes, sigue metiendo a tres personas dentro de la
  aplicación y paga el día que crece.** El 0 € ya hace el trabajo de la entrada
  barata; el primer plan de pago hace otro, que es **ser el precio al que paga
  alguien que vive de esto**. Poner 29 € era desaprovechar la 0056.
- **El precio por cliente baja según se sube**: 3,90 € en Solo y 2,63 € en Pro.
  Es lo que espera quien crece, y es lo que hace que el peldaño siguiente se lea
  como un descuento y no como un castigo.
- **Se factura entre el 3 % y el 6 % de lo que él factura** (a 70 € por cliente).
  Es la banda sana del software vertical, un poco arriba en el escalón de entrada
  —que es lo normal— y estable de ahí hacia arriba. Compárese con el 1 % de la
  fuga 3.
- **Los saltos son de +40 € y +70 €, y multiplican el cupo por tres o lo quitan.**
  Eso es lo que los hace legibles: de Solo a Pro se paga el doble por tres veces
  los clientes. Nada que ver con el +176 % por un cliente más de la tarifa
  actual.
- **Diez en Solo, no treinta.** Es el cambio que más ingreso mueve y también el
  más agresivo: el entrenador profesional medio lleva entre veinte y cuarenta
  clientes, así que el plan de entrada actual **se come el mercado entero**. Con
  diez, el que vive de esto empieza en Pro, que es donde debe estar.
- **Tres nombres y no cinco.** Gratis · Solo · Pro · Equipo se lee de un vistazo,
  que es todo lo que se le pide a una tabla de precios: se mira una vez y se
  decide en esa. La escalera de cinco peldaños que llegó a estar escrita aquí
  —con un Estudio de 50 clientes y un Gimnasio de 229— sacaba un 15 % más de ARPU
  y costaba una tabla que hay que estudiar. **Se eligió la que se entiende**, y
  hay que saber lo que se dejó encima de la mesa: está en la §7.5.
- **En Equipo el eje deja de ser el cliente y pasa a ser el asiento.** Es la
  consecuencia de tener un solo peldaño arriba, y hay que mirarla de frente:
  «sin tope de clientes por 149 €» es, otra vez, la fuga 1 en pequeño. **Lo que
  la contiene son los tres asientos**, porque un negocio con entrenadores dentro
  crece en gente antes que en fichas. Mientras el cuarto asiento sea un acuerdo y
  no un botón, ese tope hay que vigilarlo: un centro con seis entrenadores y
  cuatrocientos clientes pagando 149 € es exactamente lo que esta sección vino a
  arreglar.

> **El riesgo real de esta tabla no es que sea cara: es el salto de 0 a 39 €**, y
> ocurre en el peor momento posible —el cliente número cuatro, cuando el
> entrenador factura 280 € y se le piden 39—. No tiene arreglo de precio, y no
> hace falta que lo tenga: quien no da ese paso **se queda en el plan gratuito**,
> que cuesta casi nada de sostener, sigue trayendo clientes a la aplicación y
> convierte cuando llega al octavo. Es una conversión aplazada y no una pérdida.
> Otra vez la 0056 pagando.
>
> **Y si hay que equivocarse, que sea por arriba.** Bajar un precio se anuncia
> como una promoción y se hace en una tarde; subirlo obliga a respetárselo a todo
> el que ya estaba (§3.1) y se arrastra durante años. Con cinco cuentas no hay
> señal de mercado que diga cuál es el techo: el número correcto es el que se
> pueda defender en voz alta, y luego se corrige con datos.

### 7.4 Lo que se limita por funciones, y por qué son tres y no diez

La pregunta era si Gratis y Solo deberían tener menos funciones, además de menos
clientes. Sí, pero **con muy pocas**, y por un motivo de arquitectura, no de
marketing: aquí los límites los impone Postgres y no React (§3.3). Cada función
capada es una política de RLS o un disparador más, o sea código de seguridad
permanente y una superficie más donde equivocarse. Una tabla con ocho cruces por
columna se paga en migraciones y en fallos, no en el diseño de la tabla.

El criterio para elegir cuáles: **se capa lo que se impone en un solo punto de la
base y le importa al profesional y no al que empieza.** Con eso salen tres.

**1. Asientos — HECHO en la `0064`, y aquí ponía que ya estaba.** Decía «ya
existe (`plan_limits.max_seats`, 0019), coste cero», y era falso: la columna
existía, la pantalla la enseñaba y **la portada la anunciaba** —«1 entrenador» en
Gratis y en Solo—, pero `invite_team_member` no la miraba. Cualquier cuenta
gratuita podía invitar a diez personas.

Importa más de lo que parece para la tarifa: **los asientos son la única
diferencia real entre Pro y Equipo** —los dos llevan integraciones, los dos
llevan todo—, así que mientras no se aplicaran, los 70 € que separan uno de otro
no compraban nada que no se pudiera tener gratis. Se cerró con un disparador
`BEFORE INSERT` y no con un `IF` en la función; el porqué, en la cabecera de la
migración.

La lección, que es la de la §3.3 otra vez: **un límite que solo está en una
columna no es un límite, es una nota.** Antes de dar por bueno cualquiera de los
tres de esta lista, hay que poder señalar la línea que lo aplica.

**2. Integraciones — HECHO en la `0065`.** Es exactamente lo que la §5 ya decía
—«son lo que quiere un entrenador con un negocio detrás y le da igual a uno que
empieza»— y sigue siendo verdad. De **Pro** para arriba, las tarifas retiradas
incluidas (contrataron cuando no había nada capado). Salió disparador y no
política, y a propósito: RLS rechaza sin decir por qué, y un capado comercial
tiene que explicarse solo — quien se topa con él es exactamente quien podría
pagar por quitarlo. Y a quien ya tenía una integración no se le quita: solo se
bloquea crear otra.

**3. Almacenamiento de fotos y vídeo — HECHO en la `0067`.** La única de las
tres que **protege margen de verdad**: es coste real por gigabyte y crece solo,
sin que nadie pulse nada. Un disparador sobre `storage.objects` que suma lo que
cuelga de los clientes del equipo (los adjuntos de soporte quedan fuera: pedir
ayuda no es una función del plan). Dos decisiones que hay que conocer para no
sorprenderse:

- **El tope se comprueba antes de contar el archivo que entra** —en un `BEFORE
  INSERT` de Storage el tamaño aún no es fiable—, así que el desborde posible es
  un archivo: como mucho 120 MB.
- **El cliente también choca con el tope**, porque las fotos las sube él y una
  cuota que solo frene al entrenador no es una cuota. La regla de «nada del lado
  del cliente» se protege en el mensaje: a él no se le nombra ni el plan ni la
  tarifa, solo «no queda espacio, díselo a tu entrenador». Y el entrenador tiene
  la cifra antes del choque: `my_team_plan()` devuelve el uso y Ajustes → Plan
  lo enseña, con aviso desde el 85 %.

Y el **registro de cambios** (`audit_log`, 0017) en Equipo — **HECHO en la
`0066`**, la más barata: una columna y una condición en la política de lectura.
Se capa la **lectura**, nunca la escritura: la traza se sigue anotando en todos
los planes, así que subir a Equipo enseña el historial entero, no uno que
empieza hoy. Las tarifas retiradas y `fundador` lo conservan, como siempre.

**Y lo que NO se capa nunca**, que importa más que la lista de arriba:

- **La nutrición, el bucle semanal, el roadmap, las plantillas.** Son el producto.
  Un plan barato al que le falta el bucle no es un plan barato: es una demo, y las
  demos las cuenta el usuario a los demás tal y como son.
- **Leer, exportar y borrar.** Ya está decidido en la §3.4 y por los motivos de
  siempre: los datos son del entrenador y de sus clientes, y el borrado es una
  obligación legal suya. Que eso no dependa nunca del plan.
- **Nada del lado del cliente.** El cliente no ha contratado nada y no puede
  notar en qué plan está su entrenador. Además es el canal de distribución: cada
  cuenta gratuita mete a tres personas dentro de la aplicación, y capar lo que
  ellas ven es estropear lo único que trae usuarios sin pagar por ellos.

### 7.5 Qué cambia en el ingreso

Con **cuarenta entrenadores de pago**, que es el orden de magnitud del primer
objetivo real:

| | Mezcla (Solo/Pro/Equipo) | ARPU | MRR | ARR |
|---|---|---|---|---|
| Tarifa actual | 70 % Solo / 30 % Equipo | 38 € | 1.528 € | 18.300 € |
| Propuesta, mezcla prudente | 40/40/20 | 77 € | 3.080 € | 37.000 € |
| Propuesta, mezcla esperada | 30/50/20 | 81 € | 3.240 € | 38.900 € |

**El doble, con la misma cartera y sin vender a nadie nuevo.** La diferencia
entre las dos mezclas propuestas es exactamente el efecto de bajar Solo a diez
clientes: empuja gente a Pro, que es para lo que está.

Dicho en el sentido que de verdad se decide: **3.000 € al mes son 79 entrenadores
con la tarifa actual y 37 con la nueva.** Esos 42 entrenadores que no hay que
encontrar, convencer ni sostener son el argumento entero de esta sección — y son
también, por si hace falta decirlo, 42 conversaciones de soporte que no ocurren.

(Y si el `tax_behavior` estaba en `inclusive`, el ARPU actual real no es 38 € sino
31,6 €, y el múltiplo no es 2,1× sino 2,6×.)

**Lo que costó tener tres nombres en vez de cinco.** La escalera de cinco
peldaños —con Estudio a 119 € por 50 clientes y Gimnasio desde 229 €— daba 96 €
de ARPU y 3.840 € con los mismos cuarenta entrenadores: **un 15 % más**, unos
7.000 € al año. Se cambiaron por una tabla de precios que se lee de un vistazo.
Es una decisión defendible y no es gratis, y queda anotada aquí para poder
revisarla con datos: **el sitio natural de recuperar ese 15 % no es subir Solo ni
Pro, es partir Equipo** el día que haya un centro de verdad dentro y se sepa cómo
es.

### 7.6 Las otras vías, y por qué no

**Cobros — la palanca grande, y está medio construida.** La 0058 guarda
`fee_amount` y `billing_period`; ya estaban `next_payment_date` y
`payment_status`; la 0012 y la 0013 concilian el Stripe del entrenador; hay
`notion-payments`. **La aplicación ya sabe cuánto le debe cada cliente y cuándo.**
Faltan dos piezas para que eso sea algo por lo que se paga: el recordatorio
automático de cobro —que necesita el correo transaccional de la §4.3, que ya
estaba en la lista por otro motivo— y un enlace de pago del Stripe **del propio
entrenador**. Eso da el ochenta por ciento del valor del modelo B **sin Connect,
sin KYC y sin mover dinero propio**. Es la vía que la §1 no consideró: descartó el
modelo B entero y con él este camino intermedio, que no tiene su riesgo.

**Comisión sobre lo que cobra (modelo B, Connect).** Descartarlo sigue siendo
correcto, pero **por volumen y no por principio**: el KYC y la responsabilidad
fiscal son coste fijo, y un 2 % de casi nada es nada. Se vuelve a mirar a partir
de unos cincuenta entrenadores de pago, cuando ese mismo trabajo se reparte entre
una base que ya factura.

**Instalación para gimnasios (modelo C).** Sí, y ahora. Con cinco cuentas, mil o
dos mil euros de una migración valen más que cuarenta suscripciones que todavía
no existen, y financian el desarrollo, que es literalmente lo que la §1 dijo que
servía para hacer. Con fecha de caducidad: es un puente, no un negocio.

**Cobrarle al cliente final.** No. Rompe la propuesta —«tu entrenador te da la
app»— y el cliente final no elige la herramienta. El único hueco real, alguien
sin entrenador, es otro producto y no un plan de este.

### 7.7 Orden, por euros entre esfuerzo

1. **Comprobar el `tax_behavior` del `Price` en Stripe.** Cinco minutos. Es la
   única línea de esta sección que puede subir el ingreso un 21 % hoy.
2. ~~**Los peldaños nuevos.**~~ **HECHO: `0061_escalera_de_planes.sql`**, sin
   aplicar. Salió tal y como se preveía —datos y no código: el disparador
   `enforce_client_limit` ya lee `max_clients` y las dos pantallas ya leen
   `plan_limits` (0049)—, pero con **una trampa que no estaba prevista y que se
   lleva la decisión más importante de la migración**: ver 7.9.
3. **Injerto para los que ya pagan — y son DOS sitios, no uno.** La migración
   mueve su fila a `solo_2026` / `equipo_2026`, copia exacta de lo que
   contrataron. Pero eso solo dura hasta su siguiente renovación si no se hace
   además el segundo paso, que está **en Stripe y a mano**: editar
   `metadata.plan` de su suscripción. El porqué, en la 7.9. Los dos pasos van
   seguidos: entre uno y otro hay una ventana, corta pero real.
4. ~~**Anual.**~~ **HECHO: `0062_pago_anual.sql`** más `billing-checkout`,
   `lib/num.js`, Ajustes → Plan y la portada. Falta crear los tres precios
   anuales en Stripe y encenderlos. **Dos precios en la misma fila y no una fila
   por periodo**, que es lo que mantiene el límite en un solo sitio y deja el
   webhook sin tocar: quien paga por años sigue estando en `solo`. El interruptor
   es por plan y no hace falta bandera: si no hay `price_cents_year`, no se
   ofrece.
5. ~~**Asientos de verdad.**~~ **No es de lanzamiento, y la lista se equivocaba
   al ponerlo aquí.** Se creía la única pieza de código pendiente; mirándolo de
   cerca no bloquea nada: Equipo se vende con sus tres asientos exactos y el
   cuarto es un acuerdo, así que `max_seats` dice la verdad. Y el sitio de
   comprar un asiento **no es la pasarela**: nadie sabe cuántos va a necesitar el
   día que se da de alta. Es una función del portal, y es una función, no un
   `quantity`. Ojo con dejarlo dormido demasiado tiempo, eso sí: es el único eje
   por el que Equipo crece (§7.3).
6. ~~**Integraciones por plan.**~~ **HECHO: `0065_integraciones_por_plan.sql`**,
   disparador y no política, por el mensaje. (El **tope de asientos** que iba
   aquí implícito está hecho: `0064_tope_de_asientos.sql`, ver §7.4.)
7. **Correo transaccional → módulo de cobros** (§7.6). Ya era el siguiente
   bloqueante de la §4.3; ahora además es la siguiente vía de ingreso.
8. ~~**Cuota de almacenamiento.**~~ **HECHO: `0066` (registro de cambios) y
   `0067` (almacenamiento)**, con lo que los capados por función de la §7.4
   están completos: la tabla entera de la §7.3 la impone Postgres.

**La portada hay que rehacerla, y son cuatro tarjetas y no tres.** La sección de
precios de `LandingPage.jsx` está construida sobre tres y sobre la escalera
«0 → 25 → 69», que está escrita en sus comentarios como argumento de diseño —tres
precios en el mismo formato que se leen de un vistazo—. Con la tarifa nueva lo
que ve alguien sin cuenta es **Gratis · Solo · Pro · Equipo**: las filas
retiradas no salen, porque la política de la 0049 solo enseña lo que se vende
(`purchasable`) y el plan de partida. La rejilla (`lp-plan-grid`, `auto-fit` con
mínimo de 250 px sobre 1080 px
de ancho) mete las cuatro en una fila por 14 píxeles, así que técnicamente no se
rompe; que 253 px de tarjeta sigan siendo legibles hay que **mirarlo**, no
deducirlo. Los precios ya salen de la base, así que lo que se rehace es la
composición y no el dato.

### 7.9 La trampa de la 0061: el plan de un cliente vive en dos sitios

Se deja escrita aquí y no solo en la cabecera de la migración, porque es de las
que vuelven, y porque **no falla el día que se ejecuta: falla semanas después**.

`solo` y `equipo` mantienen su nombre y cambian lo que significan —Solo pasa de
30 clientes por 25 € a 10 por 39—. Lo evidente es entonces mover a quien ya paga
a una fila retirada, `solo_2026`, copia exacta de lo que contrató. La migración lo
hace y parece completo.

**No lo está.** `billing-webhook` escribe `patch.plan = object.metadata.plan` en
cada `customer.subscription.updated`, y la suscripción de quien ya paga lleva
`metadata.plan = 'solo'` grabado **en Stripe** desde el día que la contrató. En su
siguiente renovación el webhook le devuelve a `solo`, que para entonces significa
diez clientes, y un entrenador con veinte se encuentra sin poder dar de alta al
siguiente. Sin aviso, sin error, y con el `UPDATE` del injerto pareciendo
correcto en la base — porque lo era: **el otro sitio no es la base**.

La regla, que es más general que esta migración:

> El plan de un equipo está escrito en dos sitios —`team_subscriptions.plan` y el
> `metadata.plan` de su suscripción en Stripe—, y **el segundo gana en cada
> renovación**. Cualquier cambio de plan hecho a mano dura hasta la siguiente
> factura si no se toca también Stripe.

Es la misma advertencia de la 0056 —«la clave sigue siendo `prueba` porque está
escrita en el webhook»— vista desde el otro lado. Allí se resolvió congelando el
nombre; aquí se resuelve moviéndolo en los dos sitios, que cuesta un gesto manual
por cliente de pago y a cambio deja la escalera con los nombres que se venden.
Con la base de clientes de hoy —una compra real— es un minuto; el día que sean
cincuenta, la respuesta correcta ya no es esta, sino no volver a redefinir un
nombre en uso.

La consulta que dice a quién afecta, y el gesto exacto en Stripe, están en el
bloque «DESPUÉS DE STRIPE» de `0061_escalera_de_planes.sql`. **Los dos pasos van
seguidos**: entre uno y otro hay una ventana en la que una renovación se lleva esa
cuenta al plan nuevo. Si pasa, se arregla repitiendo el `UPDATE`; pero es mejor no
tener que enterarse.

### 7.10 Dos discrepancias entre este documento y el código

- **La §5 dice que se factura por cliente activo —con actividad en los últimos 30
  días— y el código no hace eso.** `enforce_client_limit` cuenta las fichas no
  archivadas, sin mirar actividad. Con dos peldaños importaba poco; con cinco es
  la definición sobre la que se apoya toda la tabla, y hay que decidirla a
  propósito: contar por actividad es más justo y más difícil de esquivar, pero es
  una vista nueva y un disparador que la consulta.
- **El plan `fundador` sigue siendo barra libre indefinida** (§3.7). `npm run
  radiografia` ya lo detecta. Publicar tarifa nueva es el momento natural de
  tener esas conversaciones, y la §3.7 ya deja escrito el `UPDATE`.
