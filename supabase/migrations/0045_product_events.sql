-- ============================================================================
-- Qué se usa de verdad
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva. Una tabla, sus políticas y nada más. No toca ninguna tabla,
--     ninguna columna ni ninguna política existente.
--
--     La aplicación funciona SIN esta migración, como con la 0009, la 0017 y la
--     0033: si la tabla no existe, `lib/analytics.js` deja de apuntar y todo lo
--     demás va igual. Nunca rompe una pantalla por no poder registrar una visita.
--
-- ══ Qué resuelve ════════════════════════════════════════════════════════════
--
-- Hoy no hay ni un dato sobre el uso. `lib/diagnostics.js` recoge FALLOS, que es
-- otra cosa: dice qué se rompió, no qué se usa. No se puede contestar a nada de
-- esto:
--
--   · ¿Cuántos entrenadores que se registran llegan a invitar a su primer
--     cliente? Ese es el momento en el que el producto empieza a existir para
--     ellos, y es donde `monetizacion.md` §4.1 supone que está el abandono.
--   · ¿Qué pantallas se usan cada semana y cuáles no las abre nadie?
--   · ¿Vuelve alguien a la segunda semana?
--
-- Con tres a cinco entrenadores como socios de diseño —el plan escrito en
-- `monetizacion.md` §6— la muestra es demasiado pequeña para verlo a ojo, y
-- priorizar sin esto es opinar.
--
-- ══ Por qué en casa y no con una herramienta de las de siempre ══════════════
--
-- Por dos motivos, y el segundo es el que decide:
--
--   1. `public/_headers` limita `connect-src` a Supabase. Meter PostHog o
--      cualquier otra obligaría a abrir la CSP a un dominio más, y la CSP es
--      estricta a propósito.
--
--   2. Esto guarda fotos corporales, peso y pliegues: artículo 9 del RGPD.
--      Mandarle el comportamiento de sus usuarios a un tercero es una cesión de
--      datos que habría que declarar, justificar y probablemente consentir. Ya
--      hubo una cesión así sin decidirla —el avatar que se le pedía a un
--      servicio externo CON EL NOMBRE de la persona dentro de la URL,
--      `auditoria.md` §3.5— y se retiró. No se vuelve a abrir esa puerta para
--      saber cuántos clics tiene un botón.
--
-- ══ Y por qué aquí NO PUEDE haber datos personales ══════════════════════════
--
-- Es la regla de la tabla, y está impuesta por la base, no por el buen criterio
-- de quien escriba la próxima llamada:
--
--   · El NOMBRE del evento tiene que ser un identificador corto en minúsculas
--     (`^[a-z][a-z0-9_]{2,40}$`). Un nombre, un correo o una medida no pasan ese
--     patrón. No es una convención: es un CHECK.
--   · Las propiedades van acotadas a 500 bytes y son para categorías y tramos
--     —`seccion: 'rutina'`, `clientes: '10-29'`—, nunca para valores.
--   · NO hay `client_id`, y su ausencia es deliberada. Sin él, esta tabla no
--     puede describir a ninguna de las personas cuyos datos de salud guarda la
--     aplicación, ni siquiera de forma indirecta.
--
-- El actor es el ENTRENADOR, que es quien usa el producto y con quien hay una
-- relación comercial. Al cliente final no se le instrumenta: `lib/analytics.js`
-- no apunta nada desde el portal. Quien es el sujeto de los datos no es además
-- el sujeto de la medición.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.product_events (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Quién, de forma seudónima. `ON DELETE CASCADE`: si alguien borra su cuenta,
  -- su rastro de uso se va con ella. No se conserva «anonimizado», se borra.
  actor   uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,

  -- El equipo, para poder contar por cuenta y no por persona: un equipo de
  -- cuatro entrenadores es UN cliente que paga, no cuatro.
  team_id uuid        REFERENCES public.teams (id) ON DELETE SET NULL,

  name    text        NOT NULL CHECK (name ~ '^[a-z][a-z0-9_]{2,40}$'),
  props   jsonb       NOT NULL DEFAULT '{}'::jsonb
                      CHECK (pg_column_size(props) <= 500),

  at      timestamptz NOT NULL DEFAULT now()
);

/*
  Los índices salen de las dos únicas preguntas que se le van a hacer: «cuántas
  veces pasó X en tal periodo» y «qué hizo esta cuenta». Ninguna consulta busca
  por props, así que no lleva índice GIN — que en una tabla de escritura
  constante costaría más de lo que ahorra.
*/
CREATE INDEX IF NOT EXISTS product_events_name_at_idx ON public.product_events (name, at DESC);
CREATE INDEX IF NOT EXISTS product_events_team_at_idx ON public.product_events (team_id, at DESC);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

/*
  ══ Escribir sí, leer no ═══════════════════════════════════════════════════

  Cualquiera que tenga sesión puede APUNTAR lo suyo —y solo lo suyo: la política
  exige que `actor` sea él mismo, así que nadie puede escribir eventos en nombre
  de otro y ensuciar sus métricas—.

  Pero NADIE puede leer desde el navegador, ni siquiera sus propios eventos. Esto
  no es una funcionalidad del producto: es instrumentación del negocio. Se
  consulta desde el panel de Supabase o con la `service_role`, que es donde ya se
  miran las suscripciones.

  Sin política de SELECT no hay lectura posible: con RLS activo, lo que no está
  permitido explícitamente está prohibido.
*/
DROP POLICY IF EXISTS "product_events_insert_own" ON public.product_events;
CREATE POLICY "product_events_insert_own" ON public.product_events
  FOR INSERT TO authenticated
  WITH CHECK (actor = auth.uid());

REVOKE ALL ON public.product_events FROM anon;
GRANT INSERT ON public.product_events TO authenticated;

COMMIT;


-- ============================================================================
-- Podarlo
-- ----------------------------------------------------------------------------
-- Esto crece para siempre y su valor caduca: para responder «¿cuántos llegan a
-- invitar?» sobran los eventos de hace un año, y guardarlos es acumular datos que
-- ya no sirven — que es exactamente lo que el RGPD llama limitación del plazo de
-- conservación.
--
-- Seis meses cubren de sobra cualquier pregunta de producto que se vaya a hacer.
-- Con `pg_cron`, si está disponible:
--
--   SELECT cron.schedule('podar-eventos', '0 4 * * 0', $$
--     DELETE FROM public.product_events WHERE at < now() - interval '6 months';
--   $$);
--
-- Y a mano, mientras tanto:
--
--   DELETE FROM public.product_events WHERE at < now() - interval '6 months';
--
-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Que la regla del nombre se aplica de verdad (las dos tienen que FALLAR):
--
--   INSERT INTO public.product_events (actor, name) VALUES (auth.uid(), 'Ana Pérez');
--   INSERT INTO public.product_events (actor, name) VALUES (auth.uid(), 'ana@correo.com');
--
-- Que no se puede escribir en nombre de otro (tiene que FALLAR):
--
--   INSERT INTO public.product_events (actor, name)
--   VALUES ('00000000-0000-0000-0000-000000000000', 'pantalla_vista');
--
-- Que no se puede leer desde el navegador (tiene que devolver CERO filas):
--
--   SELECT * FROM public.product_events;
--
-- El embudo, que es para lo que existe todo esto:
--
--   SELECT name, count(*) AS veces, count(DISTINCT team_id) AS cuentas
--   FROM public.product_events
--   WHERE at > now() - interval '30 days'
--   GROUP BY name ORDER BY veces DESC;
-- ============================================================================
