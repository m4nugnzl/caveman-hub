# Google Calendar

> ## ⚠️ APARCADO — léase esto antes que nada
>
> Este documento describe la versión **del entrenador**: tu semana en tu
> calendario, vía OAuth. **No es lo que se construyó.**
>
> Al decidir de quién era el calendario que importaba, la respuesta fue **el del
> cliente**. Y para eso OAuth es el camino equivocado: pedirle permiso de
> calendario a cada cliente de cada entrenador obliga a pasar la verificación de
> Google, pone una pantalla de «aplicación no verificada» delante de cada uno, y
> deja fuera a quien use Apple u Outlook.
>
> Lo que hay en producción es un **feed iCalendar suscribible** en el portal del
> cliente: migración `0071_calendario_del_cliente.sql`, función de borde
> `client-calendar`, pantalla `ClientCalendarFeed.jsx`. No necesita nada de lo
> que hay aquí abajo.
>
> **Esto se conserva porque los pasos de la consola están hechos** y las
> credenciales guardadas: si algún día se quiere la versión del entrenador, se
> retoma desde §4 sin volver a pelearse con Google Cloud.

Cómo conseguir las credenciales para la integración de agenda. Es trabajo de
**configuración** —consola de Google y secretos de Supabase—, no de código: la
parte de código viene después y está al final.

Léelo entero antes de empezar. Hay una decisión al principio (§0) que cambia si
merece la pena hacerlo ahora o esperar.

---

## 0. Lo que hay que decidir ANTES de tocar nada

Escribir en el calendario de alguien necesita el ámbito
`https://www.googleapis.com/auth/calendar.events`, y Google lo clasifica como
**sensible**. Eso tiene una consecuencia que decide el calendario del proyecto:

| Estado de la app | Quién puede conectar | Verificación | Duración del permiso |
| --- | --- | --- | --- |
| **Testing** | Solo las cuentas que añadas a mano (hasta 100) | No hace falta | **El refresco caduca a los 7 días** |
| **In production** | Cualquiera | **Sí**, revisión de Google | No caduca |

La fila que importa es la de la derecha. **En modo Testing, Google invalida el
token de refresco cada 7 días**, así que una integración que escribe sesiones en
segundo plano se rompería sola todas las semanas y habría que volver a
conectarla. Sirve para probar que el código funciona; no sirve para usarlo.

Para producción, la verificación de Google pide:

- Un dominio verificado como tuyo (Search Console).
- Una política de privacidad en ese dominio → **ya la tienes**, `/privacidad` se
  genera en cada build (`scripts/prerender.mjs`).
- Un vídeo demostrando el flujo de permiso y qué haces con los datos.
- Y semanas de espera. No días.

> **La recomendación honesta:** monta el flujo en Testing con tu propia cuenta
> como usuario de prueba, comprueba que las sesiones aparecen en el calendario, y
> **manda la verificación solo cuando decidas que la integración se queda**. Es
> un trámite que no se puede acelerar y que no tiene sentido empezar sobre algo
> que aún puede cambiar de forma.

---

## 1. Dónde está el Client ID que ya tienes

`console.cloud.google.com` → selecciona el proyecto donde configuraste
«Continuar con Google» → **Google Auth Platform → Clients**.

Ahí está el cliente de tipo *Web application* que creaste siguiendo
`docs/despliegue.md`. El **Client ID** se ve en la lista y en su ficha; el
**Client Secret** solo se enseña entero al crearlo — si no lo guardaste, se
genera otro desde esa misma ficha.

(Si la consola no te enseña *Google Auth Platform*, es la superficie antigua:
mismo sitio bajo **APIs & Services → Credentials**.)

## 2. Pero ese cliente NO es el de esta integración

Tienta reutilizarlo y **no hay que hacerlo**. No es una manía de orden: son dos
flujos que no se parecen.

|  | «Continuar con Google» | Esta integración |
| --- | --- | --- |
| Para qué | Saber quién eres al entrar | Escribir en tu calendario cuando no estás delante |
| Quién recibe la vuelta de Google | Supabase Auth | Una función de borde nuestra |
| Qué se guarda | Nada nuestro: la sesión la lleva Supabase | El token de refresco, en `integration_secrets` |
| Ámbitos | `openid`, `email`, `profile` — ninguno sensible | `calendar.events` — **sensible** |

Y hay una razón que zanja la discusión: Supabase Auth **te devuelve el
`provider_refresh_token` una sola vez, en la sesión, y no lo guarda en la base**.
Una integración que escribe en segundo plano necesita ese token guardado en el
servidor. Colgándola del acceso, dejaría de funcionar en cuanto el entrenador
cerrara sesión — y además obligaría a entrar con Google a quien se registró con
correo.

Así que: **mismo proyecto de Google, cliente nuevo.** Añadir el ámbito sensible
al cliente del acceso tendría otro coste feo: metería a *todos* los que entran
con Google en la pantalla de verificación, incluidos los que no van a usar el
calendario.

## 3. Los pasos

### 3.1 Encender la API

**APIs & Services → Library** → busca *Google Calendar API* → **Enable**.

Para el acceso no hacía falta ninguna API encendida, así que este paso es nuevo.
Si se olvida, el flujo de permiso funciona y la primera llamada de escritura
contesta `accessNotConfigured`.

### 3.2 Declarar el ámbito

**Google Auth Platform → Data access → Add or remove scopes** → añade:

```
https://www.googleapis.com/auth/calendar.events
```

Ese y **no** `.../auth/calendar`. El primero deja crear y modificar eventos; el
segundo da además control sobre los calendarios enteros —crearlos, borrarlos,
cambiar quién los ve— que no necesitamos. Pedir de más es más difícil de
verificar y peor de explicar en la pantalla de permiso.

Google lo marcará como *Sensitive*. Es lo esperado; ver §0.

### 3.3 Crear el cliente

**Google Auth Platform → Clients → Create client → Web application**.

Nómbralo distinto del otro («Caveman Hub — Calendar»), que dentro de un año la
lista se lee sola.

- **Authorized JavaScript origins**: ninguno. Este flujo no lo empieza JavaScript
  con la biblioteca de Google; es una redirección normal del navegador.
- **Authorized redirect URIs** — una, y es la de la función de borde:

  ```
  https://pscpermmojmircadirzk.supabase.co/functions/v1/google-calendar-oauth
  ```

  Igual que con el acceso, **Google no vuelve a tu dominio**: vuelve al servidor,
  que es el único sitio donde puede vivir el secreto. La función canjea el código,
  guarda el token y **después** manda el navegador a `/ajustes/integraciones`.
  Poner aquí `caveman-hub.com` da `redirect_uri_mismatch`.

Copia el **Client ID** y el **Client Secret** de la ventana que sale. El secreto
solo se enseña una vez.

### 3.4 Guardarlos donde no se filtran

```bash
npx supabase secrets set GOOGLE_CALENDAR_CLIENT_ID=...apps.googleusercontent.com
npx supabase secrets set GOOGLE_CALENDAR_CLIENT_SECRET=GOCSPX-...
```

**El secreto no entra en el repositorio, ni en `.env`, ni en ninguna variable
`VITE_`.** Todo lo que empieza por `VITE_` acaba dentro del paquete que se
descarga el navegador: publicarlo ahí es publicarlo en internet. Vive en los
secretos de Supabase, como `STRIPE_SECRET_KEY`, y solo lo lee la función de borde
con `Deno.env.get`.

El Client ID sí es público —viaja en la URL de permiso, a la vista— pero se
guarda igual junto al secreto para que la función tenga los dos y el cliente no
tenga ninguno.

### 3.5 Añadirte como usuario de prueba

**Google Auth Platform → Audience → Test users → Add users**: tu propia cuenta de
Google. Mientras la app esté en Testing, cualquier otra recibe
`access_denied` sin más explicación.

---

## 4. Lo que falta programar

Con las credenciales puestas, esto es lo que hay que escribir. No está hecho.

1. **Migración** — mucho más corta de lo previsto. La pregunta que quedaba
   abierta aquí («¿admite `integration_secrets` un token que se renueva solo?»)
   **tiene respuesta: sí, tal cual está.**

   El truco es no guardar el token de acceso. Se guarda **solo el de refresco**
   en `integration_secrets.token` —que es exactamente la forma que ya tiene, un
   `text` opaco— y el de acceso se pide en cada sincronización, que dura una hora
   y no vale la pena cachear. Un viaje HTTP de más a cambio de cero esquema
   nuevo y de un secreto menos guardado.

   Así que la migración es una línea de verdad y el resto comentario: ampliar
   `integrations_provider_check` para que acepte `google_calendar`, igual que
   hizo la 0012 con `stripe`. El calendario elegido y las preferencias van en
   `integrations.config`, que ya es `jsonb` abierto.
2. **`google-calendar-oauth`** — la función de borde de la vuelta: recibe el
   código, lo canjea por tokens contra `oauth2.googleapis.com/token`, guarda el
   de refresco y redirige a Ajustes → Integraciones.
   - Con `access_type=offline` y `prompt=consent` en la ida, o **Google no manda
     token de refresco** y la integración funciona una hora y muere.
   - Y con `state` firmado, o cualquiera puede provocar la vuelta y colgarle su
     calendario a otro (CSRF).
3. **`google-calendar-sync`** — la que escribe: refresca el acceso si hace falta y
   crea o actualiza los eventos de las sesiones programadas.
4. **La pantalla** — `GoogleCalendarSettings.jsx`, hermana de `NotionSettings` y
   `StripeSettings`, y mover la entrada de `PROVIDERS` de `planned` a
   `available` (`src/domain/integrations.js`).

> Y antes del punto 4, cerrar la pregunta que `docs/producto.md` deja abierta:
> **si la sección Calendario se retira o se absorbe en la ficha**. Esta
> integración no depende de esa sección —escribe en el calendario de Google, no
> en el de la aplicación—, pero conviene no construir encima de una decisión sin
> tomar.

---

## 5. Si algo falla

| Lo que dice Google | Qué pasa de verdad |
| --- | --- |
| `redirect_uri_mismatch` | La URI de §3.3 no coincide carácter a carácter. Sobra una barra al final, o pusiste tu dominio en vez del de la función. |
| `access_denied` sin pantalla de permiso | La app está en Testing y esa cuenta no está en *Test users* (§3.5). |
| `accessNotConfigured` al escribir | Falta encender la Calendar API (§3.1). El permiso sí se dio. |
| Funciona una hora y deja de funcionar | No llegó token de refresco: faltó `access_type=offline` en la ida. |
| Funciona una semana y deja de funcionar | Es §0: en Testing, el refresco caduca a los 7 días. No es un fallo tuyo. |
| `invalid_client` | El Client Secret del secreto de Supabase no es el de ese Client ID. Se mezclan fácil teniendo dos clientes. |
