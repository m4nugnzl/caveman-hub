# Correo transaccional

Cómo dejar de depender del SMTP compartido de Supabase. Es trabajo de
configuración —cuenta y DNS—, no de código: la parte de código viene después y
está al final.

---

## Atajo: el aviso de soporte funciona YA, sin dominio

Todo lo de abajo hace falta para los correos que van **a tus usuarios**. Pero hay
uno que va **a ti**, y ese se puede tener hoy.

Resend permite enviar desde `onboarding@resend.dev` sin verificar ningún dominio,
con una limitación: **solo entrega a la dirección con la que te registraste**.
Para invitaciones o restablecer contraseña eso lo hace inservible; para avisarte
de un ticket, es exactamente lo que hace falta.

La función `supabase/functions/support-notify` ya está escrita. Para encenderla:

```bash
npx supabase secrets set RESEND_API_KEY=re_...
npx supabase secrets set SUPPORT_EMAIL=el-correo-de-tu-cuenta-resend@ejemplo.com
npx supabase functions deploy support-notify
```

`SUPPORT_EMAIL` **tiene que ser el correo de la cuenta de Resend**; cualquier otro
lo rechaza mientras no haya dominio verificado.

Cuando lo tengas, añade `SUPPORT_FROM` con tu remitente propio y la función no se
toca:

```bash
npx supabase secrets set SUPPORT_FROM="Caveman Hub <soporte@tu-dominio.com>"
```

Y si no configuras nada, no pasa nada: la función responde «no configurado», el
ticket se guarda igual y el contador de Ajustes › Ayuda sigue avisando dentro de
la aplicación.

---

## Aviso por Telegram (mejor que el correo para esto)

La misma función manda también un mensaje de Telegram, y es **el canal que de
verdad cambia el tiempo de respuesta**: el correo llega a un buzón que se mira
cuando se mira; esto llega al bolsillo al momento.

No necesita dominio, ni verificación, ni tarjeta. Son dos datos:

### 1. Crear el bot

En Telegram, habla con [@BotFather](https://t.me/BotFather):

```
/newbot
```

Te pide un nombre y un usuario (tiene que acabar en `bot`, p. ej. `cavemanhub_soporte_bot`).
Al terminar te da un **token** con esta pinta:

```
8123456789:AAF-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Es una credencial: del chat de BotFather a la terminal, y a ningún sitio más.

### 2. Sacar tu `chat_id`

Un bot **no puede escribirte hasta que tú le escribas primero** — es de Telegram,
para que nadie te mande mensajes sin permiso. Así que:

1. Busca tu bot por su usuario y dale a **Iniciar** (o mándale cualquier cosa).
2. Abre esta URL en el navegador, con tu token:

```
https://api.telegram.org/bot<TU_TOKEN>/getUpdates
```

3. Busca en la respuesta `"chat":{"id":123456789`. Ese número es tu `chat_id`.

> Si sale `"result":[]`, es que el bot todavía no ha recibido ningún mensaje
> tuyo. Escríbele algo y recarga.

### 3. Guardarlo

```bash
npx supabase secrets set TELEGRAM_BOT_TOKEN=8123456789:AAF-...
npx supabase secrets set TELEGRAM_CHAT_ID=123456789
npx supabase functions deploy support-notify
```

Los dos canales son independientes: puedes tener solo Telegram, solo correo, o
los dos. Se lanzan a la vez y **el fallo de uno no cancela al otro**.

---

## Por qué hay que hacerlo

Supabase manda los correos de autenticación con un SMTP **compartido entre todos
los proyectos gratuitos**, y por eso viene con un límite muy bajo (del orden de
unos pocos correos por hora, y variable). Ese límite es del proyecto entero, no
por usuario.

Las consecuencias concretas, hoy:

- **El restablecimiento de contraseña falla en silencio.** Supabase devuelve
  «hemos enviado un correo» aunque no lo haya enviado, porque no quiere revelar
  si esa dirección existe. El usuario espera, no llega nada, y vuelve a pedirlo —
  lo que consume el siguiente hueco del límite.
- **Los correos caen en spam.** Salen de un dominio que no es el tuyo y sin
  autenticar contra él.
- **Las invitaciones de cliente se copian a mano a WhatsApp**, porque no hay
  ningún camino de correo en el que se pueda confiar.

Con dominio propio y un proveedor propio, los tres se arreglan a la vez.

---

## 1. Cuenta en Resend

[resend.com](https://resend.com). El plan gratuito son 3.000 correos al mes y
100 al día, que para lo que hay aquí sobra con mucho margen: un restablecimiento
de contraseña, una invitación por cliente nuevo y un aviso por ticket.

Se puede usar cualquier otro (Postmark, Brevo, Mailgun, Amazon SES). Resend está
recomendado por dos motivos: da SMTP y API a la vez —lo primero lo usa Supabase,
lo segundo lo usarán las Edge Functions— y la verificación de dominio es de las
menos dolorosas.

> **Encargado de tratamiento.** Vas a mandarle direcciones de correo de tus
> entrenadores y de sus clientes, así que es un encargado más, como Supabase,
> Cloudflare y Stripe. Hay que **añadirlo a la lista de
> `src/components/legal/legalContent.jsx`** y firmar su DPA, que Resend ofrece
> desde el panel. Esto no es un trámite decorativo: la lista que hay publicada
> tiene que ser cierta.

---

## 2. Verificar el dominio

En Resend, **Domains → Add Domain**. Pon el dominio que uses para el hub.

Te dará tres registros para añadir en tu DNS —en Cloudflare, si es donde tienes
el dominio, en la pestaña **DNS**:

| Tipo  | Para qué sirve                                                        |
| ----- | --------------------------------------------------------------------- |
| MX    | Recibir los rebotes (correos que no llegan a su destinatario).         |
| TXT   | **SPF**: declara que Resend puede enviar en tu nombre.                 |
| TXT   | **DKIM**: firma criptográfica de cada correo, para que no se falsifiquen. |

Dos avisos que cuestan una tarde:

- **En Cloudflare, esos registros van con la nube GRIS (DNS only), no naranja.**
  El proxy de Cloudflare es para tráfico web; aplicado a registros de correo, los
  rompe.
- **La propagación tarda.** Resend los verifica solo, pero puede pasar de unos
  minutos a unas horas. No toques nada mientras tanto.

Añade además un registro **DMARC**, que Resend no pide pero que decide si acabas
en la bandeja de entrada o en spam:

```
Nombre:  _dmarc
Tipo:    TXT
Valor:   v=DMARC1; p=none; rua=mailto:tu-correo@tu-dominio.com
```

`p=none` significa «solo informa, no rechaces nada». Es lo correcto para empezar:
te llegan informes de quién manda en tu nombre y no te arriesgas a tirar correos
legítimos mientras la configuración se asienta. Cuando lleves unas semanas sin
sorpresas, se puede subir a `p=quarantine`.

---

## 3. Conectarlo a Supabase

Panel de Supabase → **Authentication → Emails → SMTP Settings** → *Enable Custom
SMTP*:

| Campo             | Valor                                                    |
| ----------------- | -------------------------------------------------------- |
| Host              | `smtp.resend.com`                                        |
| Port              | `465`                                                    |
| Username          | `resend`                                                 |
| Password          | Tu **API key** de Resend (empieza por `re_`)             |
| Sender email      | `no-responder@tu-dominio.com`                            |
| Sender name       | Caveman Hub                                              |

La `re_` es una clave de servicio: **del panel de Resend al de Supabase y a
ningún sitio más**. Ni al repositorio, ni al chat, ni a una variable `VITE_`.

Justo debajo hay **Rate Limits**: el valor por defecto está pensado para el SMTP
compartido. Súbelo a algo razonable (100/hora sobra) o seguirás con el mismo
techo que querías quitarte.

### Comprobarlo

Cierra sesión en la aplicación, dale a «He olvidado mi contraseña» y mira el
apartado **Logs** de Resend. Ahí se ve si el correo salió, y si rebotó, por qué.

Si sale pero no llega, casi siempre es DKIM sin verificar todavía.

### Y los textos

Mientras estás ahí, en **Authentication → Emails → Templates** están las
plantillas. Las que vienen por defecto son en inglés y dicen «Supabase». Merece
la pena traducir al menos la de restablecer contraseña y la de invitación: es el
primer correo que recibe un entrenador y ahora mismo parece de otro producto.

---

## 4. Lo que falta programar (ya con la cuenta lista)

Lo de arriba arregla los correos que manda **Supabase Auth** por su cuenta
(restablecer contraseña, confirmar dirección). Los de la aplicación son otra
cosa y van por una Edge Function que llama a la API de Resend:

1. **Aviso de ticket nuevo** — el que hace que el soporte de la migración `0034`
   sirva de verdad. Sin él hay que entrar a mirar la bandeja, y eso aguanta con
   tres entrenadores y se rompe con treinta.
2. **Invitación de cliente por correo** — hoy el enlace se copia a mano a
   WhatsApp. Con esto, se manda desde la ficha.
3. **Aviso de check-in entregado** — opcional, y solo si el entrenador lo quiere:
   es el único de los tres que puede llegar a ser molesto.

La función necesitará `RESEND_API_KEY` en los secretos de Supabase:

```bash
npx supabase secrets set RESEND_API_KEY=re_...
```

Cuando tengas el dominio verificado, dilo y la escribo.

---

## Resumen de lo que tienes que hacer tú

1. Crear cuenta en Resend y firmar su DPA.
2. Añadir el dominio y los tres registros DNS **con la nube gris**.
3. Añadir el registro DMARC.
4. Pegar la API key en el SMTP de Supabase y subir el límite de envío.
5. Añadir Resend a la lista de encargados en `legalContent.jsx`.
6. Guardar la API key también en los secretos de Supabase para la Edge Function.
