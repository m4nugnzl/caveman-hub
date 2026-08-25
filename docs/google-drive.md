# Google Drive

Cómo conseguir las credenciales para la integración de carpetas. Es trabajo de
**configuración** —consola de Google y secretos de Supabase—, no de código: el
código está escrito y desplegado con `supabase functions deploy google-drive`.

Léelo entero antes de empezar. Son unos quince minutos y, al contrario que el
calendario, **no hay nada que esperar**: ni verificación, ni vídeo, ni semanas.

---

## 0. Por qué esto sí y el calendario no

`docs/google-calendar.md` §0 cuenta por qué aquella integración se aparcó: el
ámbito `calendar.events` es **sensible**, y eso obliga a elegir entre pasar la
verificación de Google —dominio verificado, política de privacidad, vídeo del
flujo, semanas de espera— o quedarse en modo Testing, donde **el token de
refresco caduca cada 7 días** y la integración se rompe sola todos los lunes.

Ésta usa un ámbito distinto y ahí está toda la diferencia:

| | Calendario (aparcado) | Drive (esto) |
| --- | --- | --- |
| Ámbito | `.../auth/calendar.events` | `.../auth/drive.file` |
| Clasificación de Google | **Sensible** | **No sensible** |
| Verificación para publicar | Sí, con vídeo y espera | **No** |
| Refresco en Testing | Caduca a los 7 días | Caduca a los 7 días |
| Refresco en producción | No caduca | **No caduca** |
| Qué ve de tu cuenta | Tus eventos | **Solo lo que crea la app** |

`drive.file` es el ámbito recomendado por Google precisamente porque no da
acceso al Drive de nadie: da acceso **a los archivos y carpetas que crea la
propia aplicación**, y a nada más. Publicar con él no pasa por revisión.

> **La contrapartida, que hay que tener clara:** la aplicación **no puede abrir
> una carpeta que ya tengas**. Solo las suyas. Elegir una carpeta existente
> exigiría el selector de Google —otra biblioteca cargada desde fuera, que el CSP
> de este proyecto no admite— o el ámbito `drive` completo, que es **restringido**
> y lleva auditoría de seguridad anual pagada. Así que la aplicación crea
> «Caveman Hub» en tu Drive y una carpeta por cliente dentro.
>
> No es una limitación técnica que se pueda esquivar más adelante con un parche:
> es el precio exacto de no tener que pedir permiso a Google. Y es el bueno.

Aun así, **publica la aplicación** (§5). En modo Testing el refresco caduca a los
siete días con cualquier ámbito, y eso sí rompe la integración.

---

## 0 bis. Quién pone qué (la duda que salta primero)

> «Si el Drive es el de cada entrenador, ¿por qué tengo que registrar yo unas
> credenciales?»

Porque son dos cosas distintas con nombres parecidos:

| | Qué es | Quién lo pone | Cuántas veces |
| --- | --- | --- | --- |
| **Client ID + Secret** | La identidad de la **aplicación** ante Google | **Tú**, el dueño del producto | **Una**, para todos los entrenadores |
| **Token de refresco** | El permiso sobre **un Drive concreto** | Cada entrenador, pulsando «Conectar mi Drive» | Uno por entrenador |

El Client ID es lo que hace que la pantalla de permiso de Google diga «**Caveman
Hub** quiere acceder a tu Google Drive» y no «una aplicación cualquiera». De ahí
salen el nombre, el logotipo y el dominio que ve el entrenador antes de aceptar.
No da acceso a ningún Drive por sí solo: es una matrícula, no una llave.

La llave es el token de refresco, y llega **después** de que él acepte. Va a
`integration_secrets` (una fila por integración, migración 0010), donde solo lo
puede leer la función de borde — exactamente igual que el token de Notion de cada
uno hoy.

**Por qué esto no se parece a Notion ni a Stripe.** Ahí cada entrenador pega su
propia clave, así que no hay nada que registrar en ningún sitio: la aplicación no
se presenta ante nadie, solo usa la credencial que le dan. OAuth quita ese paso
—no hay clave que crear ni pegar, se pulsa un botón— y el precio es que la
aplicación tiene que estar dada de alta. Es el mismo trato que «Continuar con
Google» (`docs/despliegue.md`), que ya funciona así: un solo Client ID y entra
con él todo el mundo, cada uno con su cuenta.

---

## 1. El proyecto de Google

`console.cloud.google.com` → el mismo proyecto donde configuraste «Continuar con
Google» siguiendo `docs/despliegue.md`. **Mismo proyecto, cliente nuevo**, por lo
mismo que explica §2 del documento del calendario: son dos flujos que no se
parecen y que guardan cosas distintas.

Añadir el ámbito de Drive al cliente del acceso tendría además un coste feo:
metería en la pantalla de permiso a *todos* los que entran con Google, incluidos
los que no van a usar Drive nunca.

## 2. Encender la API

**APIs & Services → Library** → busca *Google Drive API* → **Enable**.

Si se olvida, el permiso se concede sin problema y la primera llamada contesta
`accessNotConfigured` — un error que no menciona en ninguna parte que falte
encender nada.

## 3. Declarar el ámbito

**Google Auth Platform → Data access → Add or remove scopes** → añade **uno**:

```
https://www.googleapis.com/auth/drive.file
```

Ése y **ninguno más**. Si en esa pantalla acabas marcando `.../auth/drive` o
`.../auth/drive.readonly`, Google los clasifica como **restringidos** y la
aplicación pasa a necesitar la auditoría anual: el mismo agujero del que este
diseño existe para salir. Comprueba que la tabla de ámbitos concedidos tiene una
sola fila y que dice *Non-sensitive*.

## 4. Crear el cliente

**Google Auth Platform → Clients → Create client → Web application**.

Nómbralo distinto de los otros («Caveman Hub — Drive»), que dentro de un año la
lista se lee sola.

- **Authorized JavaScript origins**: ninguno. Este flujo no lo empieza JavaScript
  con la biblioteca de Google; es una redirección normal del navegador.
- **Authorized redirect URIs** — una, y es la de la función de borde:

  ```
  https://pscpermmojmircadirzk.supabase.co/functions/v1/google-drive/oauth
  ```

  Letra por letra. Google compara la cadena entera: sobra una barra al final y el
  permiso se rechaza con `redirect_uri_mismatch`, que es el error más común de
  todo este trámite.

Guarda el **Client ID** y el **Client Secret**. El segundo solo se enseña entero
al crearlo.

### Por qué NO hay que añadir `localhost` aquí

Tienta añadir `http://localhost:5173` para poder probar en desarrollo, y es
inútil: esa lista se compara contra el `redirect_uri` que manda la aplicación, y
el nuestro es **siempre** la dirección de la función de borde. Google no redirige
nunca al navegador hacia la aplicación —redirige hacia la función, que es la
única que tiene el secreto para canjear el código—, así que tu máquina no aparece
en esa conversación. Dejarlo puesto no rompe nada; simplemente no se usa jamás.

**Y aun así, conectar desde `localhost` funciona.** El circuito es local →
Google → función → token guardado en la base, que es la misma en los dos sitios.
Lo único distinto es el último salto: la función devuelve el navegador a
`APP_URL/ajustes/integraciones`, o sea al sitio DESPLEGADO. Conectas desde
`localhost:5173` y terminas mirando producción con el «Tu Drive ha quedado
conectado»; vuelves a localhost, recargas y está conectado.

Si algún día molesta lo suficiente, la solución NO es tocar esta lista: es que
`authorize` acepte a dónde volver y la función lo valide contra una lista blanca
antes de redirigir. Sin esa validación sería una redirección abierta, que es un
agujero clásico y caro — así que no se hace «rápido» ni se hace con un parámetro
a pelo.

## 5. Publicar la aplicación

**Google Auth Platform → Audience → Publish app**.

Con un solo ámbito no sensible, Google publica sin revisión: no pide vídeo, no
pide dominio verificado y no hay cola. Lo que se gana es lo importante: **los
tokens de refresco dejan de caducar a los siete días**.

Si prefieres probarlo antes en Testing, añádete como usuario de prueba y cuenta
con reconectar cada semana hasta que publiques.

Y una consecuencia de que el Client ID sea uno para todos (§0 bis): en Testing la
lista de usuarios de prueba es **de la aplicación entera**, con un tope de 100.
Cualquier entrenador que no esté en esa lista verá que Google le rechaza el
permiso, y el error no dirá que es por eso. Es el segundo motivo para publicar
antes de enseñárselo a nadie.

## 6. Los secretos de Supabase

```
npx supabase secrets set GOOGLE_DRIVE_CLIENT_ID=...
npx supabase secrets set GOOGLE_DRIVE_CLIENT_SECRET=...
```

`APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya
están puestas para las otras funciones. `APP_URL` importa aquí: es a donde vuelve
el navegador al terminar el permiso, y si apunta a otro sitio el entrenador
acaba en una pantalla que no es la suya.

## 7. Desplegar

```
npx supabase db push                      # la migración 0082
npx supabase functions deploy google-drive
```

La función toma `verify_jwt = false` de `supabase/config.toml`, y ahí es
REQUISITO y no el apaño del preflight de las demás: la vuelta de Google es una
redirección del navegador y no puede traer cabecera de sesión. Lo que autoriza
esa vuelta es el `state`, que vive en una tabla sin políticas, se consume al
usarlo y caduca a los diez minutos.

---

## 8. Comprobar que funciona

1. **Ajustes → Integraciones → Google Drive → Conectar mi Drive.** Sale la
   pantalla de permiso de Google diciendo, literalmente, que la aplicación podrá
   «ver y gestionar los archivos de Drive que abras o crees con esta aplicación».
   Esa frase es el ámbito `drive.file` bien contado.
2. Al aceptar, vuelves al catálogo con «Tu Drive ha quedado conectado».
3. Y ya está: **en Ajustes no queda nada más que configurar**. Las carpetas se
   crean solas cuando se usan, así que lo siguiente pasa en la ficha de alguien.
4. Abre la **ficha de un cliente que tenga correo** → «Vuestra relación» → **Su
   carpeta**. Enciende **«Puede dejar archivos aquí»**: eso crea la carpeta, la
   comparte con él y le enciende las subidas de una vez. En tu Drive aparece
   «Caveman Hub / Nombre del cliente», compartida con él como lector.
5. Entra en su portal con «Ver su portal». En su inicio, abajo, sale «Tu carpeta»
   con el botón de subir. Sube algo: aparece en la carpeta, en tu Drive.
6. Y el otro camino: en su **Alta**, un paso que admita contenido → «Añadir
   contenido» → **«Subir a su Drive»**. También crea la carpeta si no la había, y
   deja el enlace del archivo puesto en el paso.

### Cuando algo falla

| Lo que se ve | Qué es |
| --- | --- |
| `redirect_uri_mismatch` en la pantalla de Google | La URI del §4 no coincide letra por letra |
| «Google no ha dado un permiso duradero» | Google no mandó `refresh_token`. Quita el acceso de la aplicación en tu cuenta de Google → *Datos y privacidad → Aplicaciones de terceros* y vuelve a conectar |
| «Google ha retirado el permiso» al usarla | El refresco ya no vale: o se retiró el acceso, o la aplicación sigue en Testing y han pasado 7 días (§5) |
| `accessNotConfigured` | Falta encender la Drive API (§2) |
| La carpeta se crea pero no se comparte | El cliente no tiene correo en su ficha, o el que tiene no es una dirección válida |

---

## 9. Lo que esta integración NO hace, y por qué

- **No mueve nada de tu Drive.** No lo puede ni leer. Si desconectas, las
  carpetas y su contenido se quedan donde están, y siguen siendo tuyas.
- **No sustituye al almacenamiento de la aplicación.** Las fotos de progreso, las
  de la maquinaria del gimnasio y los adjuntos del alta siguen en el bucket
  privado de Supabase, con sus URL firmadas y su caducidad. Drive es el sitio
  común de vosotros dos, no el archivo de la aplicación — mezclarlos dejaría los
  datos de salud de alguien repartidos en dos sitios con dos reglas distintas.
- **No comparte por enlace público.** Comparte con el correo del cliente, que es
  un permiso con nombre y se puede retirar desde Drive. Un enlace «para
  cualquiera» es lo que este repositorio ya criticó dos veces por escrito
  (migración 0039): un permiso que no se puede quitar porque no se sabe quién lo
  tiene.
- **No sabe qué hay dentro** hasta que alguien lo pregunta. La lista de archivos
  se pide a Google solo cuando se pulsa «Ver lo que hay»: el resto sale de
  `client_folders`, que es una fila de nuestra base.
