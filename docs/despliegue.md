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
- **Redirect URLs**: añade `https://tu-dominio.com/**`

Si no lo haces, el enlace de invitación que le mandas a un cliente por WhatsApp le
devuelve a `localhost` o directamente falla. La aplicación construye esos enlaces
con `window.location.origin`, así que el dominio correcto sale solo — lo que hay
que autorizar es que Supabase acepte volver a él.

De ahí cuelga también **la recuperación de contraseña**: el correo devuelve a
`/nueva-contrasena`, que el comodín `/**` ya cubre. Comprueba de paso, en
*Authentication → Emails*, cuánto dura ese enlace: mientras esté vivo **vale como
acceso a la cuenta**, así que una hora es razonable y un día no lo es.

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

## 4. El hosting

El proyecto es una SPA estática: cualquier hosting de archivos sirve.

| Hosting | Config | Ya está en el repositorio |
|---|---|---|
| Vercel | `vercel.json` | ✅ rewrites + cabeceras + caché |
| Netlify / Cloudflare Pages | `public/_headers` y `public/_redirects` | ✅ |
| Nginx / Apache | a mano | ❌ ver abajo |

Build command `npm run build`, output `dist`.

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
   lo bloqueó. Las cabeceras están en `vercel.json` y `public/_headers`.
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
