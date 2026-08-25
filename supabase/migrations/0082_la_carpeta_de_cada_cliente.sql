-- ============================================================================
-- La carpeta de cada cliente, en el Drive del entrenador
-- ----------------------------------------------------------------------------
-- ⚠️  NECESARIA para la integración con Google Drive. Sin ella la aplicación no
--     se rompe —el catálogo enseña la tarjeta y conectar falla con un aviso—
--     pero no se puede conectar ni crear ninguna carpeta. Es ADITIVA: dos tablas
--     nuevas, una restricción ampliada y ni un DROP de datos.
--
-- ══ El problema, que este repositorio lleva escrito por todas partes ═══════
--
-- «Sube las fotos a una carpeta de Drive y monta la rutina mirándolas en otra
-- pestaña» (0079). «Para eso había que subirlo antes a Drive, hacerlo público y
-- pegar aquí ese enlace» (0039). «Lo que hoy tienes repartido entre la galería
-- del móvil, Drive, el calendario y la hoja de cálculo» (la portada).
--
-- Drive no es el enemigo del producto: es donde de verdad vive el material del
-- entrenador —sus vídeos de técnica, sus PDF, sus plantillas— y no hay ninguna
-- razón para pedirle que lo mueva. Lo que sobra es el TRAJÍN: abrir Drive, crear
-- la carpeta de Marta a mano, compartirla, copiar el enlace, volver aquí,
-- pegarlo. Y del otro lado, el cliente mandando por WhatsApp lo que acabará en
-- esa misma carpeta a base de descargar y volver a subir.
--
-- Esto no trae Drive dentro: pone la puerta. La carpeta se crea sola, con el
-- nombre del cliente, y queda enlazada en los dos portales.
--
-- ══ Por qué el ámbito es `drive.file` y esto NO necesita la verificación ═══
--
-- Es la decisión que hace viable la integración, y conviene dejarla escrita
-- porque la tentación de pedir más va a volver.
--
-- `docs/google-calendar.md` §0 cuenta lo que pasó con el calendario: el ámbito
-- `calendar.events` es SENSIBLE, y eso obliga a pasar la verificación de Google
-- —dominio verificado, vídeo del flujo, semanas de espera— o a quedarse en modo
-- Testing, **donde el token de refresco caduca cada 7 días** y la integración se
-- rompe sola todos los lunes. Por eso aquel se aparcó.
--
-- `https://www.googleapis.com/auth/drive.file` está en la otra categoría: Google
-- lo clasifica como **no sensible**, precisamente porque no da acceso al Drive de
-- nadie. Da acceso **solo a lo que la aplicación crea**. Publicar con él no pasa
-- por revisión, y los tokens de refresco no caducan a los siete días.
--
-- La consecuencia hay que decirla en voz alta porque es una limitación real y no
-- un detalle: **la aplicación no puede abrir una carpeta que ya tengas**. Solo
-- puede crear las suyas. Elegir una carpeta existente exigiría el selector de
-- Google (otra biblioteca cargada desde fuera, que el CSP de este proyecto no
-- admite) o el ámbito `drive` completo, que es RESTRINGIDO —revisión anual y
-- auditoría de seguridad pagada—.
--
-- Así que la aplicación crea «Caveman Hub» en la raíz de tu Drive y una carpeta
-- por cliente dentro. Tuyas son: si mañana desconectas esto, las carpetas y todo
-- lo que haya dentro se quedan donde están y siguen siendo tuyas. Lo único que
-- se pierde es la puerta.
--
-- ══ Por qué una tabla y no `clients.preferences` ═══════════════════════════
--
-- Porque el id de una carpeta de Drive no es una preferencia: es la referencia a
-- un objeto de fuera, y de esos este proyecto ya tiene un patrón —
-- `client_external_refs` para Notion—. Y sobre todo porque hace falta una
-- POLÍTICA propia: el cliente tiene que poder leer su carpeta y no la de nadie
-- más, y `preferences` la lee entera quien lee la fila.
-- ============================================================================

BEGIN;

-- ── Drive, en la lista de proveedores ───────────────────────────────────────
--
-- Mismo gesto que la 0012 con Stripe: la restricción se recrea con el valor
-- nuevo. Sin esto, insertar la integración falla con un error de restricción que
-- no dice qué proveedor sobra.

ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_provider_check;
ALTER TABLE public.integrations
  ADD CONSTRAINT integrations_provider_check
  CHECK (provider IN ('notion', 'stripe', 'google_drive'));

/*
  El token de REFRESCO va a `integration_secrets`, la tabla sin políticas de la
  0010, por `set_integration_token`. No hace falta nada nuevo: es exactamente el
  mismo problema —un secreto que solo puede leer la función de borde— y montarle
  una segunda tabla sería tener dos sitios donde buscar cuando algo no autoriza.

  Lo que NO se guarda es el token de acceso. Dura una hora, así que guardarlo
  obliga a mantener su caducidad y a decidir qué hacer con la carrera de dos
  peticiones que lo renuevan a la vez; pedirlo con el de refresco en cada llamada
  cuesta una petición a Google y ningún estado.
*/

-- ── La carpeta de un cliente ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_folders (
  /*
    Una por cliente y no una por (cliente, integración): un entrenador tiene UN
    Drive conectado —`integrations` ya es única por (owner, provider)— y dos
    carpetas para la misma persona serían dos sitios donde mirar, que es el
    problema que esto viene a quitar.
  */
  client_id      uuid PRIMARY KEY REFERENCES public.clients (id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations (id) ON DELETE CASCADE,

  -- Lo que devuelve Drive al crearla. El enlace se guarda en vez de componerlo
  -- porque el formato de las URL de Drive lo decide Google, no nosotros.
  folder_id      text NOT NULL,
  folder_url     text NOT NULL,

  /*
    ¿Puede SUBIR él, o solo mirar?

    Nace apagado, como todo en este proyecto. Y aquí importa más de lo normal: la
    carpeta está dentro del Drive PERSONAL del entrenador, y encender esto es
    dejar que otra persona escriba ahí. Que sea una decisión y no un valor por
    defecto es la diferencia entre una función y una sorpresa.

    Es por cliente, y no un ajuste global, porque no es la misma decisión para
    el que te manda la analítica en PDF cada trimestre que para el que solo tiene
    que abrir el vídeo de bienvenida.
  */
  uploads        boolean NOT NULL DEFAULT false,

  /*
    Qué le dices que deje ahí. Sale en su portal encima del botón de subir.

    Sin esto, «tu carpeta» con un botón de subir es una pregunta sin enunciado y
    lo que llega es cualquier cosa. Con «déjame aquí la analítica y el informe
    del fisio», llega eso.
  */
  ask            text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_folders_integration_idx
  ON public.client_folders (integration_id);

ALTER TABLE public.client_folders ENABLE ROW LEVEL SECURITY;

/*
  Leer: el entrenador que puede ver al cliente, Y EL PROPIO CLIENTE.

  `app_can_read_client` no incluye al cliente —está escrita para el lado del
  panel— así que el `OR app_is_client` no es redundante: sin él, el portal no
  vería su propia carpeta y el enlace no se podría pintar.
*/
DROP POLICY IF EXISTS "folders_read" ON public.client_folders;
CREATE POLICY "folders_read" ON public.client_folders
  FOR SELECT TO authenticated
  USING (public.app_can_read_client(client_id) OR public.app_is_client(client_id));

/*
  Escribir: solo el entrenador.

  La fila la crea normalmente la función de borde con la clave de servicio —es
  quien habla con Drive y sabe el id que ha salido—, pero el entrenador tiene que
  poder cambiar `uploads` y `ask` desde la aplicación sin pasar por la función:
  son dos decisiones suyas que no tocan Drive para nada.

  El cliente no escribe aquí ni una columna. Podría parecer razonable dejarle
  apagar sus propias subidas; no lo es: lo que decide qué se puede dejar en el
  Drive de alguien es de quien es el Drive.
*/
DROP POLICY IF EXISTS "folders_write" ON public.client_folders;
CREATE POLICY "folders_write" ON public.client_folders
  FOR ALL TO authenticated
  USING (public.app_can_write_client(client_id))
  WITH CHECK (public.app_can_write_client(client_id));

-- ── El estado del permiso, mientras dura el viaje a Google ──────────────────
--
-- ══ Por qué hace falta una tabla para esto ═════════════════════════════════
--
-- El flujo de OAuth vuelve de Google con una REDIRECCIÓN del navegador, o sea
-- una petición `GET` normal y sin ninguna cabecera de sesión: no hay JWT, no hay
-- `auth.uid()`, y por tanto no hay forma de saber de quién es el token que acaba
-- de llegar más que por el parámetro `state` que se mandó al empezar.
--
-- Ese parámetro tiene dos trabajos y los dos importan:
--
--   1. Decir a qué integración pertenece el permiso.
--   2. Demostrar que la vuelta corresponde a una ida NUESTRA. Sin eso, cualquiera
--      puede llamar a la dirección de retorno con un código suyo y engancharle su
--      Drive a la cuenta de otro (el ataque clásico de este flujo).
--
-- La tabla va con RLS ACTIVO y CERO POLÍTICAS, igual que `integration_secrets`:
-- el `state` no puede ser legible desde el navegador de nadie, porque leerlo es
-- exactamente lo que permite falsificar la vuelta.

CREATE TABLE IF NOT EXISTS public.integration_oauth_states (
  state          text PRIMARY KEY,
  integration_id uuid NOT NULL REFERENCES public.integrations (id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_oauth_states ENABLE ROW LEVEL SECURITY;
-- Intencionadamente sin políticas. No añadir ninguna.
REVOKE ALL ON public.integration_oauth_states FROM authenticated, anon;

COMMIT;


-- ============================================================================
-- Después de aplicarla
-- ----------------------------------------------------------------------------
-- 1. Las credenciales de Google: `docs/google-drive.md` §1 a §3. Son cinco
--    minutos de consola y NO hay verificación que esperar — ver la cabecera.
--
-- 2. Los secretos de la función:
--
--      npx supabase secrets set GOOGLE_DRIVE_CLIENT_ID=...
--      npx supabase secrets set GOOGLE_DRIVE_CLIENT_SECRET=...
--
--    `APP_URL` y las tres de Supabase ya están puestas para las otras funciones.
--
-- 3. Desplegar:
--
--      npx supabase functions deploy google-drive
--
--    Toma `verify_jwt = false` de `supabase/config.toml`, que aquí es REQUISITO
--    y no un apaño del preflight: la vuelta de Google es una redirección del
--    navegador y no puede traer sesión.
--
-- 4. Nada que tocar en `public/_headers`, y merece la pena decir por qué NO.
--
--    El archivo que sube el cliente va del navegador a la función de borde y de
--    ahí a Google. Podría ir directo —Drive admite sesiones de subida— y sería
--    una petición menos, pero exigiría que el navegador del cliente llevara un
--    permiso sobre el Drive del ENTRENADOR: o sea, repartir una credencial suya a
--    cada cliente. Pasando por el servidor, el único que habla con Google es
--    quien tiene el token, y de paso ahí es donde se comprueba que esa carpeta
--    admita subidas — que es una regla que ninguna política de Postgres puede
--    vigilar, porque la escritura ocurre fuera de esta base.
--
--    La consecuencia es que el CSP se queda como está: todo sigue yendo a
--    `*.supabase.co`, que ya está permitido.
--
-- ── Comprobarlo ─────────────────────────────────────────────────────────────
-- Que el cliente ve la suya y solo la suya (con su sesión, una fila y solo una):
--
--   SELECT client_id, uploads FROM public.client_folders;
--
-- Que no puede encenderse las subidas él mismo (cero filas afectadas):
--
--   UPDATE public.client_folders SET uploads = true WHERE client_id = '<su-id>';
--
-- ── Sin aplicar ─────────────────────────────────────────────────────────────
-- La tarjeta de Drive se ve en el catálogo y conectar falla con el aviso de que
-- la integración no está activa en la cuenta. Nada más cambia.
-- ============================================================================
