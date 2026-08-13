-- ============================================================================
-- Biblioteca de partida: ejercicios y alimentos
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva. Requiere `0006_teams.sql` (y `0019` si quieres que se siembre al
--     crear el equipo, que es donde encaja). No pisa nada: solo escribe en
--     bibliotecas VACÍAS.
--
-- ══ Por qué esto es parte de cobrar y no un adorno ═════════════════════════
--
-- Un entrenador que se registra hoy entra a una aplicación en blanco: sin
-- clientes —eso es inevitable— y **sin un solo ejercicio ni un solo alimento**.
-- Lo primero que intenta hacer es programarle algo a alguien, y para escribir
-- «Press banca» tiene que darlo de alta él. Y luego «Sentadilla». Y luego los
-- treinta siguientes.
--
-- El minuto uno de la prueba es el que decide si alguien vuelve el día dos. Una
-- biblioteca de partida no es contenido de relleno: es la diferencia entre
-- «programo la semana de un cliente ahora mismo» y «esto habrá que rellenarlo
-- algún día».
--
-- ══ Por qué se siembra en la base y no en la aplicación ════════════════════
--
-- Porque el equipo puede nacer por dos caminos —`ensure_my_team()` al entrar, o
-- el disparador del alta de clientes— y el navegador no interviene en el segundo.
-- Sembrar desde React significaría dos sitios que tienen que acordarse, y uno de
-- los dos se olvidaría.
--
-- ══ Qué NO hace ═══════════════════════════════════════════════════════════
--
-- No toca una biblioteca que ya tenga algo. Ni para completarla: si un entrenador
-- ha escrito sus tres ejercicios, meterle cuarenta y cinco al lado es reordenarle
-- el trabajo sin permiso. Lo comprueba por separado para ejercicios y alimentos,
-- porque puede tener uno lleno y el otro vacío.
-- ============================================================================

BEGIN;

/**
 * Siembra la biblioteca de un equipo. Devuelve cuántas filas ha escrito.
 *
 * Los grupos musculares son EXACTAMENTE los de `domain/training.js`. No es
 * cosmético: de esa cadena salen el color del ejercicio en la analítica y sus
 * umbrales MEV/MRV, así que un «Espalda alta» en minúscula deja al ejercicio sin
 * color y fuera del cómputo de volumen.
 */
CREATE OR REPLACE FUNCTION public.seed_team_library(target_team uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_added integer := 0;
  -- `GET DIAGNOSTICS` solo sabe asignar a una variable: `x = x + ROW_COUNT` es un
  -- error de sintaxis, no una suma. De ahí este intermedio.
  v_rows  integer := 0;
BEGIN
  SELECT owner_id INTO v_owner FROM public.teams WHERE id = target_team;
  IF v_owner IS NULL THEN
    RETURN 0;
  END IF;

  -- ── Ejercicios ───────────────────────────────────────────────────────────
  -- Un básico y dos o tres accesorios por grupo. Ni uno solo —que obliga a
  -- escribir a la primera sesión— ni doscientos, que es una lista imposible de
  -- recorrer en el desplegable y que además impone una nomenclatura ajena.
  IF NOT EXISTS (SELECT 1 FROM public.exercises WHERE team_id = target_team) THEN
    INSERT INTO public.exercises (coach_id, team_id, name, muscle_group)
    SELECT v_owner, target_team, t.name, t.muscle
    FROM (VALUES
      ('Press banca',                      'Pecho'),
      ('Press inclinado con mancuernas',   'Pecho'),
      ('Aperturas en polea',               'Pecho'),
      ('Fondos en paralelas',              'Pecho'),

      ('Dominadas',                        'Dorsal'),
      ('Jalón al pecho',                   'Dorsal'),
      ('Remo con barra',                   'Dorsal'),
      ('Pullover en polea',                'Dorsal'),

      ('Remo en máquina',                  'Espalda Alta'),
      ('Face pull',                        'Espalda Alta'),
      ('Encogimientos con mancuernas',     'Espalda Alta'),

      ('Press francés',                    'Tríceps'),
      ('Extensión en polea alta',          'Tríceps'),
      ('Press cerrado',                    'Tríceps'),

      ('Curl con barra',                   'Bíceps'),
      ('Curl inclinado',                   'Bíceps'),
      ('Curl martillo',                    'Bíceps'),

      ('Press militar',                    'Deltoides Anterior'),
      ('Elevación frontal',                'Deltoides Anterior'),

      ('Elevaciones laterales',            'Deltoides Lateral'),
      ('Elevaciones laterales en polea',   'Deltoides Lateral'),

      ('Pájaros con mancuernas',           'Deltoides Posterior'),
      ('Reverse pec deck',                 'Deltoides Posterior'),

      ('Sentadilla',                       'Cuádriceps'),
      ('Prensa',                           'Cuádriceps'),
      ('Extensión de cuádriceps',          'Cuádriceps'),
      ('Zancadas',                         'Cuádriceps'),
      ('Sentadilla búlgara',               'Cuádriceps'),

      ('Peso muerto rumano',               'Isquiotibiales'),
      ('Curl femoral tumbado',             'Isquiotibiales'),
      ('Curl femoral sentado',             'Isquiotibiales'),
      ('Buenos días',                      'Isquiotibiales'),

      ('Hip thrust',                       'Glúteos'),
      ('Peso muerto convencional',         'Glúteos'),
      ('Patada de glúteo en polea',        'Glúteos'),
      ('Abducción en máquina',             'Glúteos'),

      ('Aducción en máquina',              'Aductor'),

      ('Elevación de talones de pie',      'Gemelo'),
      ('Elevación de talones sentado',     'Gemelo'),

      ('Plancha',                          'Abdominales'),
      ('Crunch en polea',                  'Abdominales'),
      ('Elevación de piernas colgado',     'Abdominales'),
      ('Rueda abdominal',                  'Abdominales'),

      ('Cinta',                            'Otros'),
      ('Bicicleta estática',               'Otros'),
      ('Remo ergómetro',                   'Otros')
    ) AS t(name, muscle);

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_added := v_added + v_rows;
  END IF;

  -- ── Alimentos ────────────────────────────────────────────────────────────
  -- Macros por 100 g de producto crudo salvo donde se indica lo contrario.
  -- Son valores de referencia: cada marca trae los suyos en la etiqueta, y para
  -- eso la biblioteca es editable. Sirven para empezar a montar una dieta hoy,
  -- no para sustituir a la etiqueta.
  IF NOT EXISTS (SELECT 1 FROM public.foods WHERE team_id = target_team) THEN
    INSERT INTO public.foods (coach_id, team_id, name, protein_per_100g, carbs_per_100g, fats_per_100g)
    SELECT v_owner, target_team, t.name, t.p, t.c, t.f
    FROM (VALUES
      -- Proteína
      ('Pechuga de pollo',            23.0,  0.0,  2.6),
      ('Pavo (pechuga)',              22.0,  0.0,  1.5),
      ('Ternera magra',               21.0,  0.0,  5.0),
      ('Lomo de cerdo',               21.0,  0.0,  6.0),
      ('Merluza',                     17.0,  0.0,  2.0),
      ('Salmón',                      20.0,  0.0, 13.0),
      ('Atún al natural (lata)',      24.0,  0.0,  1.0),
      ('Gambas',                      20.0,  0.0,  1.0),
      ('Huevo entero',                13.0,  1.0, 11.0),
      ('Clara de huevo',              11.0,  0.7,  0.2),
      ('Yogur griego natural',         9.0,  4.0,  5.0),
      ('Queso fresco batido 0%',       8.0,  4.0,  0.2),
      ('Leche semidesnatada',          3.3,  4.8,  1.6),
      ('Jamón serrano',               31.0,  0.3, 16.0),
      ('Tofu',                         8.0,  1.9,  4.8),
      ('Proteína de suero (polvo)',   80.0,  7.0,  5.0),

      -- Hidratos
      ('Arroz blanco (crudo)',         7.0, 78.0,  0.6),
      ('Arroz integral (crudo)',       7.5, 76.0,  2.7),
      ('Pasta (cruda)',               12.0, 71.0,  1.5),
      ('Avena',                       13.0, 60.0,  7.0),
      ('Pan integral',                 9.0, 41.0,  3.0),
      ('Patata',                       2.0, 17.0,  0.1),
      ('Boniato',                      1.6, 20.0,  0.1),
      ('Quinoa (cocida)',              4.4, 21.0,  1.9),
      ('Lentejas (cocidas)',           9.0, 16.0,  0.4),
      ('Garbanzos (cocidos)',          8.9, 27.0,  2.6),
      ('Alubias (cocidas)',            8.0, 20.0,  0.5),
      ('Miel',                         0.3, 82.0,  0.0),

      -- Fruta y verdura
      ('Plátano',                      1.1, 23.0,  0.3),
      ('Manzana',                      0.3, 14.0,  0.2),
      ('Naranja',                      0.9, 12.0,  0.1),
      ('Fresas',                       0.7,  8.0,  0.3),
      ('Arándanos',                    0.7, 14.0,  0.3),
      ('Brócoli',                      2.8,  7.0,  0.4),
      ('Espinacas',                    2.9,  3.6,  0.4),
      ('Tomate',                       0.9,  3.9,  0.2),
      ('Lechuga',                      1.4,  2.9,  0.2),
      ('Calabacín',                    1.2,  3.1,  0.3),
      ('Pimiento',                     1.0,  6.0,  0.3),

      -- Grasa
      ('Aceite de oliva virgen extra', 0.0,  0.0,100.0),
      ('Aguacate',                     2.0,  9.0, 15.0),
      ('Almendras',                   21.0, 22.0, 50.0),
      ('Nueces',                      15.0, 14.0, 65.0),
      ('Crema de cacahuete',          25.0, 20.0, 50.0),
      ('Queso curado',                25.0,  1.3, 33.0),
      ('Chocolate negro 85%',         10.0, 19.0, 46.0)
    ) AS t(name, p, c, f);

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_added := v_added + v_rows;
  END IF;

  RETURN v_added;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_team_library(uuid) FROM public;

COMMIT;


BEGIN;

/**
 * `ensure_my_team`, ahora con biblioteca.
 *
 * Es la misma función de la `0019` con una línea más al final. Se reescribe
 * entera —y no se parchea— porque `CREATE OR REPLACE` reemplaza el cuerpo
 * completo: dejar aquí solo el trozo nuevo borraría el resto.
 */
CREATE OR REPLACE FUNCTION public.ensure_my_team()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_team uuid;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesión';
  END IF;

  SELECT team_id INTO v_team FROM public.team_members
  WHERE profile_id = auth.uid() LIMIT 1;
  IF v_team IS NOT NULL THEN
    RETURN v_team;
  END IF;

  -- Un cliente no tiene equipo propio: pertenece a la cartera de su entrenador.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'client') THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(NULLIF(full_name, ''), 'Mi equipo') INTO v_name
  FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.teams (name, owner_id) VALUES (COALESCE(v_name, 'Mi equipo'), auth.uid())
  RETURNING id INTO v_team;

  INSERT INTO public.team_members (team_id, profile_id, role) VALUES (v_team, auth.uid(), 'owner');

  -- La prueba empieza al crear el equipo, no al registrarse: es cuando de verdad
  -- empieza a usarse esto. La tabla puede no existir si no está la 0019.
  BEGIN
    INSERT INTO public.team_subscriptions (team_id, plan, status, trial_ends_at)
    VALUES (v_team, 'prueba', 'trialing', now() + interval '14 days');
  EXCEPTION WHEN undefined_table THEN
    NULL; -- Sin 0019 no hay planes, y el equipo se crea igual.
  END;

  -- Y la biblioteca, para que la primera sesión se pueda programar hoy.
  PERFORM public.seed_team_library(v_team);

  RETURN v_team;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_team() FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_my_team() TO authenticated;

COMMIT;


BEGIN;

/*
  Los equipos que ya existen.

  Solo entra donde no hay nada. Un entrenador con su biblioteca hecha no nota que
  esta migración ha pasado; uno que se registró la semana pasada y la dejó vacía,
  se la encuentra puesta.
*/
DO $$
DECLARE
  t record;
  total integer := 0;
BEGIN
  FOR t IN SELECT id FROM public.teams LOOP
    total := total + public.seed_team_library(t.id);
  END LOOP;
  RAISE NOTICE 'Biblioteca sembrada: % filas', total;
END $$;

COMMIT;

-- ============================================================================
-- Después de aplicarla
-- ----------------------------------------------------------------------------
--   SELECT t.name,
--          (SELECT count(*) FROM public.exercises e WHERE e.team_id = t.id) AS ejercicios,
--          (SELECT count(*) FROM public.foods f WHERE f.team_id = t.id)     AS alimentos
--   FROM public.teams t;
--
-- ── Ojo con esto ───────────────────────────────────────────────────────────
-- La aplicación consulta las bibliotecas por `coach_id`, no por `team_id` (está
-- anotado en `docs/modelo-de-equipo.md` como pendiente). Como aquí se escriben
-- las dos columnas —`coach_id` es el dueño del equipo—, el dueño ve la biblioteca
-- sembrada. **Un entrenador contratado del equipo todavía no la ve**: ese cambio
-- son las dos líneas de la carga que la 0006 dejó pendientes.
-- ============================================================================
