# Monetización: cobrar por el hub

> **Decisión tomada: modelo A —suscripción al entrenador—.** Este documento fija
> qué significa eso para la arquitectura y en qué orden hay que construirlo. No es
> un plan comercial: es la lista de lo que cambia en el producto.
>
> Fecha: agosto de 2026.
>
> **Estado: el cobro funciona de punta a punta en el entorno de prueba de Stripe.**
> Construido y probado: bloqueantes legales (§2), planes y límites (§3.1, §3.3),
> pasarela y webhook (§3.2), biblioteca de partida y carga perezosa (§4).
>
> Lo que queda antes de facturar de verdad: rehacer Stripe en la cuenta real
> (§3.6), probar una restauración de copia (§2.3), y el correo transaccional
> (§4.3).

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
vive, vale como acceso a la cuenta—, en *Authentication → Emails* de Supabase.

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

## 3. La columna vertebral de cobro — **PROBADA DE PUNTA A PUNTA**

> Verificado en sandbox el 13 de agosto de 2026: pasarela → pago → evento →
> firma verificada → `team_subscriptions` con plan, estado, suscripción y fecha de
> renovación. Lo único que separa esto de cobrar de verdad es rehacer productos,
> clave y webhook en la cuenta real (ver §3.6).
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

### 3.4 Impago: solo lectura, nunca borrado — **A MEDIAS, y a propósito**

Implementado: `past_due` y `canceled` impiden **dar de alta** clientes. Lo que ya
existe se sigue leyendo, editando y exportando.

Lo que falta es congelar también la escritura, y no lo he hecho por dos razones
que conviene decidir antes de tocarlo:

1. Obliga a que **cada política de escritura de cada tabla** consulte la
   suscripción. Es la clase de cambio que, si se equivoca, deja fuera a gente que
   sí paga.
2. Un fallo de Stripe, un webhook perdido o una tarjeta que caduca un domingo
   dejarían a un entrenador sin poder trabajar con sus clientes. Bloquear el
   crecimiento presiona igual y no rompe el trabajo en curso.

Va en su propia migración, si se decide que hace falta.

`past_due` deja el equipo en modo lectura, con aviso y enlace al portal de
Stripe. Los datos de sus clientes siguen siendo legibles y exportables **siempre**.
Borrar datos de salud por un recibo devuelto es, además de una faena, un problema
legal.

### 3.5 Detalle de infraestructura: Checkout alojado

`public/_headers` declara `script-src 'self'` y un `connect-src` limitado a Supabase.
Stripe.js embebido obligaría a abrir la CSP a `js.stripe.com` y `api.stripe.com`;
**Checkout alojado, con redirección por `window.location`, no toca la CSP en
absoluto** (`form-action 'self'` solo afecta al envío de formularios, no a una
navegación). Es más seguro y es menos trabajo.

### 3.6 Pasar del sandbox a cobrar de verdad

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

| Plan | Precio | Límite duro (en la base de datos) |
|---|---|---|
| Prueba | 14 días, sin tarjeta | 3 clientes |
| Solo | 25 €/mes | 30 clientes activos, 1 asiento |
| Equipo | 69 €/mes | Sin límite, asientos, pantalla Equipo, integraciones, registro de cambios |

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
