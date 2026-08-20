# Poner Caveman Hub en producción

> Los pasos en el orden en que hay que hacerlos, y **qué se rompe si te saltas
> cada uno**. La mitad de los problemas de un primer despliegue no están en el
> código: están en la configuración de Supabase, que no se entera de que has
> cambiado de dominio.

---

## 0. Antes de subir nada

```bash
npm run check
```

Tiene que pasar entero: lint, tipos, estilos, tests y build. Si falla el build,
lo que subas no arranca.

```bash
npm audit --omit=dev
```

Debe decir **0 vulnerabilidades**. Las de desarrollo (`esbuild`) no viajan al
servidor.

**Comprueba que no vas a subir tus claves:**

```bash
git status --porcelain | grep -E "^\?\?.*\.env"
```

Si aparece algo que no sea `.env.example`, párate. `.gitignore` ya cubre `.env`,
`.env.local` y `.env.*.local`.

---

## 1. La base de datos

Aplica las migraciones que te falten, **en orden**, desde el editor SQL de
Supabase. El detalle de cada una está en [`supabase/README.md`](../supabase/README.md).

Imprescindibles para que la aplicación funcione:

```
0005 → 0008 → 0002 → 0007 → 0003
```

Y las que dan las funciones que el código ya llama:

```
0014  (el cliente anota sus series sin poder reescribir su programa)
0015  (invitaciones de cliente)
0016  (feedback y cuaderno del cliente)
0017  (traza de cambios)
```

> **La 0007 es la que más despistes causa**: crea el bucket `client-media`. Sin
> ella **toda subida de fotos falla**, y el error no dice que falte un bucket.

Comprueba desde el editor SQL que están:

```sql
select proname from pg_proc
where proname in ('log_session_set','log_session_feedback','set_client_preferences',
                  'create_client_invite','continue_program','save_workout_data');
```

---

## 2. Las variables de entorno

En el panel del hosting, no en un archivo:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ…
```

**La `anon key` es pública y no pasa nada porque se vea** en el navegador: toda la
autorización real la aplican las políticas RLS. Lo que **nunca** va aquí es la
`service_role key` — esa se salta RLS entera.

> `VITE_` no es decorativo: Vite solo expone al navegador las variables con ese
> prefijo. Una variable sin él no llega al código y el valor sale `undefined`.

Las variables se leen **en el build**, no al arrancar. Si las cambias, hay que
volver a desplegar.

---

## 3. Supabase tiene que conocer tu dominio

**Este es el paso que se olvida y el que rompe las invitaciones.**

En *Authentication → URL Configuration*:

- **Site URL**: `https://tu-dominio.com`
- **Redirect URLs**: añade `https://tu-dominio.com/**` **y también
  `http://localhost:3000/**`**

> **Lo de `localhost` no es un extra de comodidad: sin ello no se puede probar
> nada que salga de la aplicación y vuelva.** Cuando el destino no está en esa
> lista, Supabase **no da ningún error**: devuelve al «Site URL», o sea al
> dominio desplegado. Desde local eso se ve como que entrar con Google te saca de
> la aplicación que estabas probando y te deja en la versión publicada, con otra
> sesión, otro `localStorage` y —si el despliegue va por detrás— otro código.
>
> Costó una tarde entenderlo persiguiendo un fallo de rutas que no existía.

Si no lo haces, el enlace de invitación que le mandas a un cliente por WhatsApp le
devuelve a `localhost` o directamente falla. La aplicación construye esos enlaces
con `window.location.origin`, así que el dominio correcto sale solo — lo que hay
que autorizar es que Supabase acepte volver a él.

De ahí cuelga también **la recuperación de contraseña**: el correo devuelve a
`/nueva-contrasena`, que el comodín `/**` ya cubre. Comprueba de paso, en
*Authentication → Emails*, cuánto dura ese enlace: mientras esté vivo **vale como
acceso a la cuenta**, así que una hora es razonable y un día no lo es.

### Y el botón «Continuar con Google»

El código ya está puesto —`Login.jsx` llama a `signInWithOAuth({ provider:
'google' })` y el logotipo oficial está en `public/brands/google.svg`—, así que
esto es **solo configuración**. Mientras no se haga, el botón sale en pantalla y
al pulsarlo devuelve `Unsupported provider: provider is not enabled`.

Son dos paneles y hay que ir en este orden, porque el segundo necesita lo que
genera el primero.

**1. En Google Cloud Console** (`console.cloud.google.com`), con tu proyecto
seleccionado o uno nuevo:

1. *Google Auth Platform → Branding*: nombre de la aplicación, correo de soporte
   y el logotipo. Es lo que la persona ve en la pantalla de «Elige una cuenta»,
   así que el nombre tiene que ser el del producto y no el del proyecto interno.
2. *Audience*: **External**, y mientras esté en «Testing» solo entran las cuentas
   que añadas a mano en *Test users*. Para abrirlo a cualquiera hay que darle a
   **Publish app**.
3. *Data access*: con los tres ámbitos básicos basta (`openid`, `email`,
   `profile`). Ninguno de ellos es sensible, así que **no hay verificación de
   Google que esperar**.
4. *Clients → Create client → Web application*:
   - **Authorized JavaScript origins**: `https://tu-dominio.com` y, para
     desarrollo, `http://localhost:3000` (el puerto que fija `vite.config.js`).
   - **Authorized redirect URIs**: una sola, y es la de **Supabase**, no la tuya:

     ```
     https://pscpermmojmircadirzk.supabase.co/auth/v1/callback
     ```

     Este es el paso que se hace mal. Google no vuelve a tu aplicación: vuelve a
     Supabase, que valida el código, crea la sesión y **después** manda el
     navegador a donde diga `redirectTo`. Poner aquí tu dominio da
     `redirect_uri_mismatch`.

Guarda el **Client ID** y el **Client Secret** que salen al crearlo.

**2. En el panel de Supabase**, *Authentication → Sign In / Providers → Google*:

1. Activa el proveedor.
2. Pega el *Client ID* y el *Client Secret*.
3. Guarda. El propio panel enseña ahí la *Callback URL* — compruébala contra la
   que pusiste en Google, carácter a carácter.

Y las URL de arriba tienen que estar bien, porque el `redirectTo` de la
aplicación es `window.location.origin` (o la página de invitación, si se llega
desde un enlace de un entrenador): si tu dominio no está en *Redirect URLs*,
Supabase completa el acceso y luego se niega a volver.

> **Lo que hay que mirar en la primera prueba de verdad.** El disparador
> `handle_new_user` —que es quien pone el rol y el nombre al darse de alta— no
> está en este repositorio: vive escrito a mano en el proyecto de Supabase. Por
> correo, el nombre le llega en `raw_user_meta_data->>'name'`, que es lo que
> manda `Login.jsx`; por Google llegan `name`, `full_name`, `avatar_url` y
> `picture`. Si tras entrar con Google el perfil sale sin nombre, es que ese
> disparador lee una clave que Google no manda, y se arregla ahí y no en el
> cliente.

El CSP no hay que tocarlo: `signInWithOAuth` sale con `location.assign`, que es
una navegación y no un envío de formulario, así que `form-action 'self'` no la
bloquea. Y el avatar de Google ya entra por `img-src https:`.

Si usas las Edge Functions (Notion, Stripe, enlaces de revisión), despliégalas:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase functions deploy notion-payments
npx supabase functions deploy review-link
npx supabase functions deploy stripe-payments
npx supabase functions deploy stripe-webhook
```

Y si cobras por la aplicación (ver `0021_billing_prices.sql`, que lleva los pasos
de Stripe en orden):

```bash
npx supabase functions deploy billing-checkout
npx supabase functions deploy billing-webhook
```

Sin banderas: `supabase/config.toml` declara las dos con `verify_jwt = false` y
explica por qué **las dos**. El webhook lo llama Stripe, que no tiene sesión de
Supabase. Y a `billing-checkout` la llama el navegador, que manda antes un
preflight `OPTIONS` sin cabeceras propias: con la comprobación en la pasarela, ese
preflight se rechaza con un 401 y el navegador lo enseña como un error de CORS que
no tiene nada que ver con CORS. Es el mismo caso que ya documenta
`notion-payments`.

Ninguna de las dos queda abierta: cada una comprueba su propia autorización, y la
de `billing-checkout` es más estricta que la de la pasarela —exige sesión válida
**y** ser el dueño del equipo—.

> ⚠️ Las funciones `billing-*` usan la clave **completa** de Stripe, la que puede
> cobrar. No confundirla con la de la integración de Ajustes, que es la del
> entrenador y es de solo lectura. Va en los secretos de la función
> (`STRIPE_SECRET_KEY`), nunca en la base de datos ni en el navegador.

---

## 4. El hosting: Cloudflare Pages

El proyecto es una SPA estática —el build produce archivos y nada más, sin
renderizado en servidor ni funciones—, así que cualquier hosting de archivos
sirve. **Se usa Cloudflare Pages**, por dos motivos:

- Sirve archivos estáticos con peticiones gratuitas e ilimitadas, y la carga real
  de esta aplicación es eso: archivos.
- Su plan gratuito **no prohíbe el uso comercial**. El plan Hobby de Vercel sí:
  define como comercial «cualquier método de solicitar o procesar pagos de los
  visitantes del sitio», que es exactamente lo que hace la pantalla de Plan. Con
  Vercel, cobrar obliga al plan Pro de 20 $/mes.

La configuración ya está en el repositorio: `public/_headers` (seguridad y caché)
y `wrangler.jsonc` (el fallback de la SPA).

> **No hay `public/_redirects`, y no es un olvido.** Workers **valida** ese
> archivo al desplegar y rechaza la regla habitual de las SPA —`/* /index.html
> 200`— con *«Infinite loop detected in this rule»*: reescribir cualquier ruta a
> `/index.html` incluye a `/index.html`, así que la regla se dispara a sí misma.
> En Pages y Netlify eso se resuelve por convención; aquí es un error que **corta
> el despliegue**. Con `not_found_handling` no hace falta.

### Darlo de alta

Cloudflare → **Workers & Pages** → *Create* → conectar el repositorio de Git.

Hay **dos caminos y no dan el mismo error si te equivocas**, así que conviene
saber en cuál estás:

| | Pages | Workers con archivos estáticos |
|---|---|---|
| Cómo despliega | Sube `dist` directamente | Ejecuta `npx wrangler deploy` |
| Fallback de la SPA | `public/_redirects` (hay que recrearlo) | `not_found_handling` en `wrangler.jsonc` |
| `_headers` | ✅ | ✅ |
| Config en el repositorio | Ya está | `wrangler.jsonc`, ya está |

**Este proyecto está en el segundo.** Si el paso de despliegue ejecuta
`npx wrangler deploy` y falla con *«Error parsing file: vite.config.js»*, es que
wrangler no encuentra su configuración: falta `wrangler.jsonc` o no llegó al
repositorio.

Ajustes del build, valgan cual valga el camino:

- **Framework preset**: None
- **Build command**: `npm run build`
- **Build output directory**: `dist`
3. **Variables de entorno DEL BUILD** (las mismas que en `.env`, y solo estas dos):
   ```
   VITE_SUPABASE_URL
   VITE_SUPABASE_ANON_KEY
   ```

   > ⚠️ **«Del build» no es un matiz, y son dos pantallas distintas.**
   >
   > | Dónde | Qué es | ¿Sirve aquí? |
   > |---|---|---|
   > | *Settings → Build → **Build Variables and Secrets*** | Las ve el comando de compilación | **Sí** |
   > | *Settings → **Variables and Secrets*** | Las ve el Worker al ejecutarse | No |
   >
   > Vite **incrusta** estos valores en los archivos al compilar y después ya no
   > lee nada del entorno, así que puestas en la segunda no llegan al build. El
   > resultado es una aplicación desplegada que falla en la consola con:
   >
   > ```
   > Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en tu .env
   > Uncaught Error: supabaseUrl is required.
   > ```
   >
   > Por lo mismo, **cambiarlas obliga a volver a desplegar**: el build viejo
   > conserva los valores viejos dentro.

   La `anon key` es segura aquí: toda la autorización vive en RLS. La
   `service_role` **nunca**, ni aquí ni en ninguna variable `VITE_`, justamente
   porque Vite las incrusta y acabaría en el navegador de cualquiera.

   Para comprobar que un build las cogió, búscalas en el propio archivo servido:

   ```bash
   curl -s https://tu-dominio/assets/index-*.js | grep -o "supabase\.co" | head -1
   ```
4. Dominio propio en la pestaña **Custom domains**.

### Al cambiar de dominio, tres cosas o algo deja de funcionar

Esto vale tanto para el alta como para cualquier mudanza posterior:

| Qué | Dónde | Si no |
|---|---|---|
| **Redirect URLs** | Supabase → Authentication → URL Configuration | Las invitaciones y el correo de contraseña devuelven al dominio viejo |
| **`APP_URL`** | Secretos de las Edge Functions | Tras pagar, Stripe devuelve al dominio viejo |
| **Site URL** | Supabase, misma pantalla | Igual que las Redirect URLs |

Lo que **no** cambia es la URL del webhook de Stripe: apunta a la función de
Supabase, no a tu dominio.

### Otros hosting

| Hosting | Config | ¿Está en el repositorio? |
|---|---|---|
| Cloudflare Pages / Netlify | `public/_headers` ✅, `public/_redirects` ❌ (ver abajo) |
| Nginx / Apache | a mano | ❌ ver abajo |

### Las dos reglas que no son opcionales

**1. Fallback de SPA.** El servidor tiene que devolver `index.html` para
*cualquier* ruta. Sin esto, entrar directo en `/c/abc/rutina` —desde un marcador,
un enlace compartido o al recargar— da 404 y la aplicación no llega a arrancar.

Para Nginx:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

**2. El `index.html` no se cachea.** Es el que apunta a los bundles con hash. Si
un usuario se queda con uno viejo después de desplegar, pide archivos que ya no
existen y ve una pantalla en blanco. Los `/assets/*` sí se cachean para siempre,
porque su nombre cambia con su contenido.

---

## 5. Comprobaciones después del primer despliegue

Por orden, y ninguna tarda más de un minuto:

1. **Entra en una ruta profunda directamente**: `https://tu-dominio.com/cartera`.
   Si da 404, falta el fallback de SPA (paso 4).
2. **Abre la consola del navegador.** Si algo no carga, el CSP dice qué directiva
   lo bloqueó. Las cabeceras están en `public/_headers`.
3. **Inicia sesión.** Si el correo de acceso te devuelve a `localhost`, falta el
   paso 3.
4. **Sube una foto.** Si falla, falta la migración 0007 (el bucket).
5. **Invita a un cliente de prueba** y abre el enlace en una ventana privada. Es
   el circuito que más piezas toca: función `create_client_invite`, dominio
   autorizado y RLS.
6. **Descarga una copia de seguridad** (Ajustes → Copia de seguridad) y guárdala.
   Antes de que haya datos que perder.

---

## 6. Qué pasa con las pestañas abiertas al desplegar

Los fragmentos de código llevan el hash del contenido en el nombre, y al
desplegar **los del despliegue anterior desaparecen**. Una pestaña que llevaba
abierta desde antes conserva el `index.html` viejo, y al navegar a una pantalla
que todavía no había cargado pide un archivo que ya no existe:

```
Failed to fetch dynamically imported module: /assets/CalendarPanel-EM8W….js
```

No es un fallo de tu instalación ni se arregla con cabeceras de caché: el HTML ya
está en memoria de esa pestaña. Es inherente a dividir el código.

`src/lib/lazyRoute.js` lo maneja: al fallar una importación **recarga la página
una sola vez**, con lo que llega el `index.html` nuevo y la aplicación sigue donde
estaba —la ruta va en la URL—. Si tras recargar vuelve a fallar, el error sube a
`ErrorBoundary` en vez de entrar en un bucle de recargas.

Lo que verá alguien con la app abierta cuando despliegues: un parpadeo al cambiar
de pantalla. Nada más.

## 7. Lo que sigue faltando, dicho claro

Nada de esto impide lanzar, pero conviene saberlo antes de tener clientes
pagando:

- **La copia de seguridad es manual.** Nadie la hace por ti. Ponte un
  recordatorio: una copia de hace seis meses recupera muy poco.
- **La carga inicial trae los datos de todos los clientes.** Con veinte va
  sobrado; con doscientos hará falta un resumen calculado en el servidor.
- **Los datos heredados no están normalizados** (auditoría 1.1): los kilos que
  quedaron dentro del plan siguen leyéndose, pero conservan el riesgo de que la
  analítica los descarte si abres una sesión del mismo día.
- **No hay entorno de pruebas.** Si quieres probar migraciones sin miedo, crea un
  segundo proyecto de Supabase y apunta ahí un despliegue de vista previa.
