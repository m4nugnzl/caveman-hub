-- ============================================================================
-- El calendario del cliente, suscribible
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva: una tabla nueva y tres funciones. No toca ninguna tabla
--     existente, ninguna política y ningún dato. Sin ella, el portal del
--     cliente es exactamente el de ahora.
--
-- ══ Qué resuelve ════════════════════════════════════════════════════════════
--
-- El cliente tiene sus cosas apuntadas aquí —el check-in del lunes, la revisión
-- postural del martes, la carrera del sábado— y su vida en otro calendario. Hoy
-- eso significa que o entra en la aplicación a mirarlo, o se le pasa. Y lo que
-- se le pasa no es una notificación: es la entrega semanal, que es el gesto que
-- más cuesta que se haga (`docs/producto.md`).
--
-- ══ Por qué un feed y NO la API de Google ═══════════════════════════════════
--
-- La primera idea fue OAuth contra Google Calendar. Se descartó al ver a quién
-- había que pedirle permiso: **al cliente, no al entrenador**. Eso multiplica el
-- problema por toda la cartera de todos los entrenadores, y con un ámbito
-- sensible como el de calendario eso significa:
--
--   · Verificación de Google OBLIGATORIA —semanas de trámite, vídeo, revisión—
--     y hasta pasarla, un tope de 100 cuentas y una pantalla de «esta aplicación
--     no está verificada» delante de cada cliente.
--   · Guardar tokens de refresco de cientos de personas. Cada uno es la llave
--     del calendario personal de alguien que no es cliente NUESTRO, sino de un
--     entrenador. Es responsabilidad que no hace falta asumir.
--   · Y deja fuera a quien use Apple, Outlook o cualquier otra cosa.
--
-- Un feed iCalendar no necesita nada de eso: es una URL que devuelve texto. El
-- cliente la suscribe una vez y su calendario —el que sea— la consulta solo. Sin
-- permisos, sin tokens de nadie, sin verificación, y funciona en todos.
--
-- El precio, dicho claro: **Google refresca los calendarios externos despacio**,
-- del orden de horas. Para lo que se publica aquí —un check-in que lleva puesto
-- desde la semana anterior— no se nota. Para un aviso de última hora, sí. Si
-- algún día hace falta inmediatez, se añade OAuth AL LADO de esto, no en su
-- lugar: el feed seguiría siendo lo que funciona en Apple y Outlook.
--
-- ══ Es el patrón de `review_links` (0011), no uno nuevo ═════════════════════
--
-- Mismo problema exacto: una URL que abre alguien SIN sesión y que tiene que
-- resolver datos privados. Y por tanto la misma respuesta, ya probada aquí:
--
--   · Un token opaco en la URL, generado en la base (`new_review_token`, 0043).
--   · La tabla NO la lee el anónimo. Quien pide el feed pasa por la función de
--     borde `client-calendar`, que resuelve el token con `service_role`. Si el
--     anónimo pudiera consultarla, podría enumerar los tokens de todos.
--   · Revocar es poner una fecha, no borrar la fila: se quiere conservar que
--     existió y cuándo se dejó de usar.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_calendar_feeds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /*
    UNIQUE: un cliente tiene UN feed. Rotarlo sustituye el token en la misma
    fila, y eso es lo que hace que «volver a generarlo» invalide de verdad el
    anterior — con varias filas vivas, el enlace viejo seguiría sirviendo y
    revocar sería una promesa a medias.
  */
  client_id   uuid NOT NULL UNIQUE REFERENCES public.clients (id) ON DELETE CASCADE,

  -- Lo que viaja en la URL: /functions/v1/client-calendar?t=<token>
  token       text NOT NULL UNIQUE,

  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Revocar es poner fecha aquí. Ver la cabecera.
  revoked_at  timestamptz,

  /*
    Para que el cliente sepa si su calendario lo está leyendo de verdad.

    No es telemetría: es la única forma de distinguir «lo suscribí mal» de «lo
    suscribí bien y Google todavía no ha pasado a mirar», que sin esto son el
    mismo síntoma —no veo nada— con dos arreglos opuestos.
  */
  first_fetched_at timestamptz,
  last_fetched_at  timestamptz,
  fetch_count      integer NOT NULL DEFAULT 0
);

COMMIT;


-- ============================================================================
-- RLS
-- ----------------------------------------------------------------------------
-- Solo el cliente, y solo el suyo.
--
-- ── Por qué el entrenador NO entra aquí ─────────────────────────────────────
-- Podría defenderse que sí: ya ve todos los eventos de ese cliente dentro de la
-- aplicación, así que el token no le daría ningún dato nuevo. Pero un token es
-- una credencial al portador sobre el calendario PERSONAL de otra persona, y el
-- entrenador no necesita ninguna: no tiene nada que hacer con ella. Un permiso
-- que no hace falta es superficie de ataque gratis.
--
-- El borrado se resuelve solo por la clave foránea: se va el cliente, se va su
-- feed.
-- ============================================================================

BEGIN;

ALTER TABLE public.client_calendar_feeds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_feeds_client_read" ON public.client_calendar_feeds;
CREATE POLICY "calendar_feeds_client_read" ON public.client_calendar_feeds
  FOR SELECT TO authenticated
  USING (public.app_is_client(client_id));

COMMIT;


-- ============================================================================
-- Crearlo, rotarlo y revocarlo
-- ----------------------------------------------------------------------------
-- Sin políticas de escritura: se pasa por estas funciones, que comprueban quién
-- llama. Es el mismo criterio que `set_integration_token` (0010) — la tabla no
-- se escribe a mano desde el navegador.
-- ============================================================================

BEGIN;

/**
 * Crea el feed del cliente, o le da un token nuevo si ya lo tenía.
 *
 * Que crear y rotar sean LA MISMA función es deliberado: desde el portal, «Crear
 * mi enlace» y «Generar otro» son el mismo gesto con distinta etiqueta, y
 * separarlas obligaría a la pantalla a saber cuál de las dos toca — un estado más
 * que mantener para nada.
 *
 * Rotar invalida el anterior de inmediato: `ON CONFLICT` machaca el token de la
 * fila única del cliente. Y limpia `revoked_at`, porque generar un enlace nuevo
 * después de haber revocado tiene que dejarlo vivo; si no, saldría un enlace que
 * no funciona y nada que lo explique.
 */
CREATE OR REPLACE FUNCTION public.create_client_calendar_feed(target uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_token text;
BEGIN
  IF NOT public.app_is_client(target) THEN
    RAISE EXCEPTION 'Ese calendario no es tuyo';
  END IF;

  new_token := public.new_review_token();

  INSERT INTO public.client_calendar_feeds (client_id, token)
  VALUES (target, new_token)
  ON CONFLICT (client_id) DO UPDATE
  SET token = EXCLUDED.token,
      revoked_at = NULL,
      created_at = now(),
      /* El contador vuelve a cero: cuenta las lecturas de ESTE enlace, y
         arrastrar las del anterior haría que un enlace recién hecho pareciera
         que ya lo está leyendo alguien. */
      first_fetched_at = NULL,
      last_fetched_at = NULL,
      fetch_count = 0;

  RETURN new_token;
END;
$$;

/**
 * Deja de servir el feed.
 *
 * No borra la fila. Un calendario suscrito no se «desuscribe» desde aquí —eso lo
 * hace el cliente en su aplicación de calendario—, así que lo que esto tiene que
 * garantizar es que la URL deje de devolver datos aunque siga pegada en algún
 * sitio. Para eso basta la fecha, y conservarla explica luego por qué un enlace
 * que existió ya no responde.
 */
CREATE OR REPLACE FUNCTION public.revoke_client_calendar_feed(target uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.app_is_client(target) THEN
    RAISE EXCEPTION 'Ese calendario no es tuyo';
  END IF;

  UPDATE public.client_calendar_feeds
  SET revoked_at = now()
  WHERE client_id = target AND revoked_at IS NULL;
END;
$$;

/*
  Y los permisos, explícitos.

  Desde la 0069 una función nueva de `public` no la ejecuta NADIE hasta que su
  migración lo diga: el `REVOKE ... FROM public` de las migraciones antiguas era
  decorativo y ahora manda el defecto cerrado. Así que el GRANT no es una
  formalidad, es lo único que hace que estas dos se puedan llamar.
*/
REVOKE ALL ON FUNCTION public.create_client_calendar_feed(uuid) FROM public;
REVOKE ALL ON FUNCTION public.revoke_client_calendar_feed(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_client_calendar_feed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_client_calendar_feed(uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- Después de aplicarla
-- ----------------------------------------------------------------------------
-- 1. Desplegar la función que sirve el feed:
--
--      npx supabase functions deploy client-calendar
--
--    Toma `verify_jwt = false` de `supabase/config.toml`, y aquí eso NO es el
--    apaño del preflight que explican las otras: es el requisito. Quien pide
--    este feed es Google, Apple o Outlook desde sus propios servidores, sin
--    sesión y sin poder añadir ninguna cabecera. Si la pasarela exigiera un JWT,
--    la suscripción sería imposible.
--
--    Comprobar que quedó desplegada:
--      curl -i "https://pscpermmojmircadirzk.supabase.co/functions/v1/client-calendar?t=x"
--    Tiene que responder 404 con un mensaje, no un 401 de la pasarela.
--
-- 2. En el portal del cliente aparece «Mi calendario». No hay nada que
--    configurar: el enlace se crea al pulsar.
-- ============================================================================
