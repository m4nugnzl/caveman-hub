-- ============================================================================
-- Más ejercicios, y con su ficha (C13, dato)
-- ----------------------------------------------------------------------------
-- ⚠️  Solo dato: INSERT con ON CONFLICT DO NOTHING y UPDATE de descripciones
--     sobre el catálogo común (0033/0094). No toca esquema ni permisos.
--
-- ══ Qué siembra ═════════════════════════════════════════════════════════════
--
-- Una tanda grande de ejercicios de gimnasio con las tres cosas que la 0094
-- abrió: nombre, músculo, EQUIPAMIENTO y DESCRIPCIÓN. El equipamiento es lo que
-- permite cruzar el ejercicio con el álbum del gimnasio del cliente; la
-- descripción es la técnica en una frase, referencia y no doctrina.
--
-- ── El criterio de la tanda ─────────────────────────────────────────────────
-- Sale del oficio, no de un raspado: variantes que de verdad se programan
-- (agarres, ángulos, unilateral, máquina/polea/mancuerna), en el vocabulario en
-- que las escribe un entrenador español. Nada de rellenar por rellenar: cada
-- fila es prescribible. El catálogo puede seguir creciendo por tandas — un
-- INSERT con ON CONFLICT es aditivo y revisable.
--
-- ── Los grupos musculares ───────────────────────────────────────────────────
-- Los mismos que la 0033 («Pectoral», «Dorsal», «Trapecio»…): la aplicación ya
-- los traduce a su vocabulario con `MUSCLE_ALIASES`, y dos convenciones en la
-- misma tabla serían peores que una imperfecta.
-- ============================================================================

BEGIN;

/* ── Las fichas de los clásicos que ya estaban ────────────────────────────── */

UPDATE public.catalog_exercises SET description = 'Escápulas retraídas y pies firmes. La barra baja con control al pecho y sube sin rebotar.' WHERE name = 'Press banca' AND description IS NULL;
UPDATE public.catalog_exercises SET description = 'Espalda neutra, el pecho acompaña a la cadera. Baja hasta donde la técnica aguante.' WHERE name = 'Sentadilla' AND description IS NULL;
UPDATE public.catalog_exercises SET description = 'La barra pegada a la pierna; la cadera empuja, la espalda no redondea.' WHERE name = 'Peso muerto convencional' AND description IS NULL;
UPDATE public.catalog_exercises SET description = 'Desde colgado, el pecho busca la barra. Sin balanceo: el dorsal tira, el brazo remata.' WHERE name = 'Dominadas' AND description IS NULL;
UPDATE public.catalog_exercises SET description = 'De pie o sentado, el tronco firme. La barra sube por delante de la cara sin arquear la lumbar.' WHERE name = 'Press militar con barra' AND description IS NULL;
UPDATE public.catalog_exercises SET description = 'Cadera atrás con rodillas casi fijas; estira el isquio y vuelve empujando con la cadera.' WHERE name = 'Peso muerto rumano' AND description IS NULL;
UPDATE public.catalog_exercises SET description = 'Espalda apoyada en el banco, barra sobre la cadera. Sube hasta la extensión completa y aprieta arriba.' WHERE name = 'Hip thrust' AND description IS NULL;
UPDATE public.catalog_exercises SET description = 'Torso inclinado y fijo. La barra viaja al abdomen bajo; el codo pasa pegado al cuerpo.' WHERE name = 'Remo con barra' AND description IS NULL;
UPDATE public.catalog_exercises SET description = 'Agarre algo más ancho que los hombros; el pecho sube a buscar la barra, el codo baja al costado.' WHERE name = 'Jalón al pecho' AND description IS NULL;
UPDATE public.catalog_exercises SET description = 'Codos fijos al costado; solo se mueve el antebrazo. Arriba aprieta, abajo estira del todo.' WHERE name = 'Extensión de tríceps en polea' AND description IS NULL;

/* ── La tanda nueva ───────────────────────────────────────────────────────── */

INSERT INTO public.catalog_exercises (name, muscle_group, equipment, description)
VALUES
  -- ── Pectoral ─────────────────────────────────────────────────────────────
  ('Press banca agarre cerrado con mancuernas', 'Pectoral', 'Mancuernas', 'Mancuernas juntas y neutras; aprieta el pecho durante todo el recorrido.'),
  ('Press inclinado en multipower',        'Pectoral', 'Multipower', 'Banco a 30–45º bajo la barra guiada; baja a la parte alta del pecho.'),
  ('Press inclinado en máquina',           'Pectoral', 'Máquina', 'Espalda pegada al respaldo; empuja sin bloquear el codo de golpe.'),
  ('Press declinado con mancuernas',       'Pectoral', 'Mancuernas', 'En banco declinado; el codo baja algo cerrado, el pecho manda.'),
  ('Press en máquina convergente',         'Pectoral', 'Máquina', 'Los mangos convergen al frente; ajusta el asiento para empujar a la altura del pecho.'),
  ('Press de suelo con barra',             'Pectoral', 'Barra', 'Tumbado en el suelo; el tríceps toca y pausa antes de empujar. Recorrido corto y hombro protegido.'),
  ('Aperturas inclinadas con mancuernas',  'Pectoral', 'Mancuernas', 'Codo casi fijo, brazos en arco; estira el pecho abajo sin perder la tensión.'),
  ('Aperturas en banco declinado',         'Pectoral', 'Mancuernas', 'El mismo arco, con el pecho bajo como protagonista.'),
  ('Cruces en polea a la altura del pecho','Pectoral', 'Polea', 'Desde los costados, las manos se encuentran delante del esternón.'),
  ('Flexiones con lastre',                 'Pectoral', 'Peso corporal', 'Flexión estricta con disco o chaleco; el cuerpo baja en bloque.'),
  ('Flexiones con déficit',                'Pectoral', 'Peso corporal', 'Manos sobre soportes para bajar más allá del suelo; estira el pecho al fondo.'),
  ('Flexiones inclinadas',                 'Pectoral', 'Peso corporal', 'Manos en un banco: más fácil, misma técnica. Para acumular repeticiones limpias.'),
  ('Flexiones declinadas',                 'Pectoral', 'Peso corporal', 'Pies elevados; el énfasis sube a la parte alta del pecho.'),
  ('Press con banda en el suelo',          'Pectoral', 'Banda elástica', 'La banda cruza la espalda; empuja al frente. Para casa o calentamiento con carga real.'),
  ('Fondos lastrados en paralelas',        'Pectoral', 'Peso corporal', 'Fondos con lastre y torso inclinado al frente; baja hasta estirar el pecho sin dolor de hombro.'),

  -- ── Dorsal ───────────────────────────────────────────────────────────────
  ('Dominadas agarre neutro',              'Dorsal', 'Barra fija', 'En agarre neutro el hombro va cómodo; el pecho busca la barra.'),
  ('Dominadas lastradas',                  'Dorsal', 'Barra fija', 'Con disco o chaleco cuando el peso corporal se queda corto. Mismo recorrido completo.'),
  ('Dominadas asistidas en máquina',       'Dorsal', 'Máquina', 'La rodilla apoya en la plataforma; quita ayuda a medida que salgan enteras.'),
  ('Dominadas con banda',                  'Dorsal', 'Banda elástica', 'La banda ayuda abajo, donde más cuesta; útil de camino a la primera estricta.'),
  ('Jalón al pecho agarre estrecho',       'Dorsal', 'Polea', 'Maneral en V; el codo baja pegado y el dorsal estira arriba del todo.'),
  ('Jalón al pecho agarre supino',         'Dorsal', 'Polea', 'Palmas hacia ti; entra más bíceps y el dorsal trabaja en su recorrido largo.'),
  ('Jalón con brazo recto',                'Dorsal', 'Polea', 'De pie, brazos casi rectos: solo el hombro se mueve. Aísla el dorsal sin bíceps.'),
  ('Jalón unilateral en polea',            'Dorsal', 'Polea', 'Un lado cada vez, arrodillado o sentado; corrige diferencias entre lados.'),
  ('Remo con barra agarre supino',         'Dorsal', 'Barra', 'Torso fijo, palmas hacia delante; la barra viaja al abdomen bajo.'),
  ('Remo en máquina con apoyo al pecho',   'Dorsal', 'Máquina', 'El pecho apoyado quita la lumbar de la ecuación: todo el trabajo es de espalda.'),
  ('Remo sentado agarre ancho',            'Dorsal', 'Polea', 'Barra ancha a la base del pecho; codos abiertos, espalda alta protagonista.'),
  ('Remo con mancuerna a una mano',        'Dorsal', 'Mancuernas', 'Rodilla y mano en el banco; la mancuerna sube a la cadera, no al hombro.'),
  ('Remo Pendlay',                         'Dorsal', 'Barra', 'Cada repetición arranca del suelo, torso paralelo; explosivo al abdomen.'),
  ('Remo Meadows',                         'Dorsal', 'Barra', 'Con barra en esquina (landmine), agarre por fuera; abre el codo y remonta a la cadera.'),
  ('Remo invertido',                       'Dorsal', 'Peso corporal', 'Colgado bajo una barra baja, cuerpo en tabla; el pecho sube a la barra.'),
  ('Remo en punta a una mano',             'Dorsal', 'Máquina', 'En la T-bar o landmine, un lado cada vez; deja que el dorsal estire abajo.'),
  ('Rack pull',                            'Dorsal', 'Barra', 'Peso muerto desde soportes a la altura de la rodilla; permite cargar la espalda sin el tramo bajo.'),
  ('Pull-over con mancuerna en banco',     'Dorsal', 'Mancuernas', 'Tumbado cruzado en el banco; la mancuerna viaja por detrás de la cabeza con codos casi fijos.'),

  -- ── Espalda alta ─────────────────────────────────────────────────────────
  ('Encogimientos con mancuernas',         'Trapecio', 'Mancuernas', 'Los hombros suben rectos hacia las orejas; sin rotar, sin rebotar.'),
  ('Encogimientos en multipower',          'Trapecio', 'Multipower', 'La barra guiada deja concentrarse en subir y aguantar un segundo arriba.'),
  ('Face pull con cuerda',                 'Trapecio', 'Polea', 'La cuerda viaja a la cara con codos altos; separa las manos al final y aprieta la escápula.'),
  ('Remo al mentón agarre ancho',          'Trapecio', 'Barra', 'Agarre ancho para que el codo mande y el hombro no pince; la barra sube al esternón.'),
  ('Pájaros con apoyo en banco inclinado', 'Deltoides Posterior', 'Mancuernas', 'El pecho en el banco quita el impulso: solo abre el posterior.'),
  ('Encogimiento en banco inclinado',      'Trapecio', 'Mancuernas', 'Boca abajo en banco inclinado; los hombros suben y atrás. Trapecio medio sin lumbar.'),

  -- ── Hombro ───────────────────────────────────────────────────────────────
  ('Press militar sentado con mancuernas', 'Deltoides Anterior', 'Mancuernas', 'Respaldo casi vertical; las mancuernas suben sin chocarse arriba.'),
  ('Press militar en máquina',             'Deltoides Anterior', 'Máquina', 'Guiado y estable: útil para acercarse al fallo sin pelear el equilibrio.'),
  ('Press en multipower sentado',          'Deltoides Anterior', 'Multipower', 'La barra guiada baja por delante hasta la barbilla; sube sin arquear.'),
  ('Push press',                           'Deltoides Anterior', 'Barra', 'Un empujón corto de piernas ayuda a pasar el punto muerto; se baja con control.'),
  ('Elevaciones frontales con disco',      'Deltoides Anterior', 'Disco', 'El disco sube al frente hasta los ojos con codos casi rectos.'),
  ('Elevaciones laterales sentado',        'Deltoides Lateral', 'Mancuernas', 'Sentado se roba menos con las piernas; el codo sube antes que la mano.'),
  ('Elevaciones laterales con banda',      'Deltoides Lateral', 'Banda elástica', 'La banda tensa arriba, donde la mancuerna afloja; para casa o de remate.'),
  ('Elevación lateral unilateral en polea','Deltoides Lateral', 'Polea', 'La polea baja cruza por delante; tensión constante desde el primer grado.'),
  ('Elevaciones laterales tumbado en banco','Deltoides Lateral', 'Mancuernas', 'De lado en un banco inclinado; la parte baja del recorrido deja de ser gratis.'),
  ('Press Arnold sentado',                 'Deltoides Anterior', 'Mancuernas', 'Las palmas rotan durante el press: recorrido largo y hombro completo.'),
  ('Pájaros en polea cruzada',             'Deltoides Posterior', 'Polea', 'Cables cruzados a la altura de la cara; abre en arco hacia atrás.'),
  ('Tirón a la cara en banda',             'Deltoides Posterior', 'Banda elástica', 'El face pull de casa: la banda a la cara, codos altos, escápalas juntas al final.'),
  ('Press cubano',                         'Deltoides Posterior', 'Mancuernas', 'Remo alto, rotación externa y press: tres tramos con peso ligero y técnica fina.'),

  -- ── Bíceps ───────────────────────────────────────────────────────────────
  ('Curl araña',                           'Bíceps', 'Mancuernas', 'Pecho apoyado en banco inclinado, brazos colgando verticales; imposible robar.'),
  ('Curl bayesiano en polea',              'Bíceps', 'Polea', 'De espaldas a la polea baja, el brazo queda detrás del cuerpo: el bíceps trabaja estirado.'),
  ('Curl martillo en polea con cuerda',    'Bíceps', 'Polea', 'Agarre neutro con la cuerda; tensión constante y muñeca cómoda.'),
  ('Curl con barra Z en banco Scott',      'Bíceps', 'Barra', 'El banco fija el brazo; abajo estira sin bloquear el codo de golpe.'),
  ('Curl inclinado con supinación',        'Bíceps', 'Mancuernas', 'Desde colgado y neutro, la palma rota al subir; máximo estiramiento abajo.'),
  ('Curl 21',                              'Bíceps', 'Barra', 'Siete medias abajo, siete arriba, siete completas. Un remate, no una base.'),
  ('Curl con banda',                       'Bíceps', 'Banda elástica', 'Pisa la banda y sube; la tensión crece arriba. Para casa o de remate.'),
  ('Curl martillo cruzado',                'Bíceps', 'Mancuernas', 'La mancuerna cruza hacia el pecho contrario; braquial y antebrazo.'),
  ('Curl en máquina',                      'Bíceps', 'Máquina', 'El apoyo fija el codo; útil para llegar al fallo con la técnica intacta.'),
  ('Curl de arrastre con barra',           'Bíceps', 'Barra', 'La barra sube pegada al cuerpo con los codos viajando atrás; sin impulso posible.'),

  -- ── Tríceps ──────────────────────────────────────────────────────────────
  ('Press francés con mancuernas',         'Tríceps', 'Mancuernas', 'Tumbado, las mancuernas bajan a los lados de la cabeza con el codo quieto.'),
  ('Press francés inclinado',              'Tríceps', 'Barra', 'En banco inclinado la cabeza larga trabaja más estirada.'),
  ('Extensión sobre la cabeza en polea',   'Tríceps', 'Polea', 'De espaldas a la polea baja, la cuerda estira por encima de la cabeza; la cabeza larga manda.'),
  ('Extensión de tríceps unilateral',      'Tríceps', 'Polea', 'Un brazo cada vez; corrige diferencias y deja el codo clavado.'),
  ('Press cerrado en multipower',          'Tríceps', 'Multipower', 'Agarre al ancho de los hombros; el codo pasa pegado al costado.'),
  ('Fondos en máquina',                    'Tríceps', 'Máquina', 'Empuje vertical guiado; todo tríceps y nada de equilibrio.'),
  ('Extensión con banda sobre la cabeza',  'Tríceps', 'Banda elástica', 'La banda anclada abajo y atrás; estira por encima de la cabeza.'),
  ('Flexiones diamante',                   'Tríceps', 'Peso corporal', 'Las manos forman un rombo bajo el pecho; el codo pasa rozando el cuerpo.'),
  ('Patada de tríceps en polea',           'Tríceps', 'Polea', 'Torso inclinado y codo alto y fijo; solo extiende el antebrazo.'),

  -- ── Antebrazo ────────────────────────────────────────────────────────────
  ('Curl de muñeca con barra',             'Antebrazo', 'Barra', 'Antebrazos apoyados; solo la muñeca sube y baja, recorrido completo.'),
  ('Curl de muñeca invertido',             'Antebrazo', 'Barra', 'Palmas hacia abajo; el extensor trabaja y la muñeca se equilibra.'),
  ('Paseo del granjero con mancuernas',    'Antebrazo', 'Mancuernas', 'Camina recto con peso pesado en cada mano; el agarre aguanta, el tronco ni se inclina.'),
  ('Cuelgue de barra',                     'Antebrazo', 'Barra fija', 'Colgado a tiempo: agarre, hombro y paciencia. Suma segundos, no rebotes.'),
  ('Rodillo de antebrazo',                 'Antebrazo', 'Otro', 'Enrolla la cuerda con el peso colgando, arriba y abajo; quema garantizada.'),

  -- ── Cuádriceps ───────────────────────────────────────────────────────────
  ('Sentadilla goblet',                    'Cuádriceps', 'Mancuernas', 'La mancuerna abrazada al pecho mantiene el torso erguido; ideal para enseñar el patrón.'),
  ('Sentadilla con barra baja',            'Cuádriceps', 'Barra', 'La barra dos dedos más abajo; más cadera, más carga, misma espalda neutra.'),
  ('Sentadilla con pausa',                 'Cuádriceps', 'Barra', 'Dos segundos quieto abajo; se pierde el rebote y se gana control.'),
  ('Sentadilla búlgara con mancuernas',    'Cuádriceps', 'Mancuernas', 'El pie trasero en el banco; la rodilla delantera viaja sobre el pie.'),
  ('Prensa a una pierna',                  'Cuádriceps', 'Máquina', 'Una pierna cada vez; el rango se controla mejor y las diferencias se ven.'),
  ('Prensa horizontal',                    'Cuádriceps', 'Máquina', 'El respaldo fija la lumbar; baja hasta donde la cadera no bascule.'),
  ('Extensión de cuádriceps unilateral',   'Cuádriceps', 'Máquina', 'Una pierna cada vez, con pausa arriba; el vasto trabaja sin escondite.'),
  ('Zancada inversa',                      'Cuádriceps', 'Mancuernas', 'El paso va hacia atrás: menos estrés en la rodilla, mismo trabajo.'),
  ('Zancada búlgara en multipower',        'Cuádriceps', 'Multipower', 'La barra guiada da equilibrio para cargar la búlgara de verdad.'),
  ('Step-up alto con mancuernas',          'Cuádriceps', 'Mancuernas', 'El cajón a la altura de la rodilla; sube empujando con la pierna de arriba, sin impulso.'),
  ('Sentadilla en pistol asistida',        'Cuádriceps', 'Peso corporal', 'A una pierna, agarrado a un soporte; baja lento y sube sin ayuda de la otra.'),
  ('Sissy squat en soporte',               'Cuádriceps', 'Máquina', 'Las rodillas viajan al frente con el cuerpo en línea; el cuádriceps estira entero.'),
  ('Sentadilla Zercher',                   'Cuádriceps', 'Barra', 'La barra en el pliegue del codo obliga a un torso muy erguido.'),
  ('Sentadilla con salto',                 'Cuádriceps', 'Peso corporal', 'Baja con control y explota hacia arriba; aterriza blando y encadena.'),

  -- ── Isquiotibiales ───────────────────────────────────────────────────────
  ('Peso muerto rumano con mancuernas',    'Isquiotibiales', 'Mancuernas', 'Las mancuernas bajan pegadas a la pierna; la cadera va atrás hasta estirar el isquio.'),
  ('Peso muerto rumano a una pierna',      'Isquiotibiales', 'Mancuernas', 'Bisagra a una pierna; equilibrio, isquio y glúteo en la misma repetición.'),
  ('Curl nórdico',                         'Isquiotibiales', 'Peso corporal', 'Los tobillos sujetos; el cuerpo baja en bloque frenando con el isquio. Brutal: pocas y buenas.'),
  ('Curl femoral con fitball',             'Isquiotibiales', 'Otro', 'Puente sobre la pelota y arrastra los talones hacia el glúteo.'),
  ('Curl femoral deslizante',              'Isquiotibiales', 'Otro', 'Con deslizadores o toalla; el puente se mantiene mientras las piernas van y vienen.'),
  ('Buenos días sentado',                  'Isquiotibiales', 'Barra', 'Sentado a horcajadas; bisagra corta y segura para la lumbar.'),
  ('Hiperextensión a 45º con énfasis en isquio', 'Isquiotibiales', 'Máquina', 'Espalda neutra fija; solo la cadera se dobla y el isquio frena.'),
  ('Peso muerto con barra hexagonal',      'Isquiotibiales', 'Barra', 'El agarre neutro centra el peso: espalda más vertical, patrón más amable.'),

  -- ── Glúteos ──────────────────────────────────────────────────────────────
  ('Hip thrust en máquina',                'Glúteos', 'Máquina', 'El mismo empuje de cadera con el montaje resuelto; extensión completa y pausa arriba.'),
  ('Hip thrust a una pierna',              'Glúteos', 'Peso corporal', 'Una pierna en el suelo, la otra al pecho; la cadera sube recta.'),
  ('Puente de glúteo con barra',           'Glúteos', 'Barra', 'Desde el suelo, recorrido corto; útil para aprender a empujar con la cadera.'),
  ('Patada de glúteo en máquina',          'Glúteos', 'Máquina', 'La plataforma se empuja atrás y arriba; la lumbar no se arquea.'),
  ('Abducción en polea baja',              'Glúteos', 'Polea', 'De pie, la pierna abre contra el cable; el glúteo medio sujeta la pelvis.'),
  ('Abducción con banda sentado',          'Glúteos', 'Banda elástica', 'La banda sobre las rodillas; abre contra ella y aguanta arriba.'),
  ('Frog pump',                            'Glúteos', 'Peso corporal', 'Plantas de los pies juntas y rodillas abiertas; la cadera sube en bombeos cortos.'),
  ('Peso muerto sumo con mancuerna',       'Glúteos', 'Mancuernas', 'Postura ancha, la mancuerna entre las piernas; la cadera manda.'),
  ('Zancada lateral',                      'Glúteos', 'Mancuernas', 'El paso va al costado; la pierna que recibe carga glúteo y aductor.'),

  -- ── Aductor ──────────────────────────────────────────────────────────────
  ('Aducción en polea',                    'Aductor', 'Polea', 'De pie, la pierna cruza contra el cable por delante del cuerpo.'),
  ('Copenhagen plank',                     'Aductor', 'Peso corporal', 'De lado con el pie de arriba en un banco; el aductor sostiene la cadera en línea.'),
  ('Sentadilla cosaca',                    'Aductor', 'Peso corporal', 'Una pierna dobla y la otra estira al costado; movilidad y fuerza a la vez.'),

  -- ── Gemelo ───────────────────────────────────────────────────────────────
  ('Elevación de talones en multipower',   'Gemelo', 'Multipower', 'De pie bajo la barra guiada, con la punta en un alza; abajo estira, arriba pausa.'),
  ('Elevación de talones a una pierna',    'Gemelo', 'Mancuernas', 'Una pierna con mancuerna en la mano del mismo lado; recorrido completo y lento.'),
  ('Elevación de talones en máquina de pie','Gemelo', 'Máquina', 'Hombros bajo las almohadillas; sube a la punta y baja más allá del escalón.'),
  ('Gemelo en prensa a una pierna',        'Gemelo', 'Máquina', 'En la prensa, solo la punta apoya; empuja con el tobillo, la rodilla casi fija.'),

  -- ── Abdominales ──────────────────────────────────────────────────────────
  ('Crunch en máquina',                    'Abdominales', 'Máquina', 'El respaldo enrolla el tronco contra resistencia; exhala al cerrar.'),
  ('Crunch invertido',                     'Abdominales', 'Peso corporal', 'Las rodillas viajan al pecho y la pelvis despega; sin tirones de cuello.'),
  ('Elevación de rodillas en paralelas',   'Abdominales', 'Máquina', 'Apoyado en los antebrazos; las rodillas suben con la pelvis, no solo las piernas.'),
  ('Plancha con lastre',                   'Abdominales', 'Disco', 'Un disco en la espalda; la cadera ni cae ni sube. Suma segundos de calidad.'),
  ('Plancha lateral con elevación',        'Abdominales', 'Peso corporal', 'De lado, la cadera baja y sube sin girar; el oblicuo trabaja donde debe.'),
  ('Rueda abdominal de rodillas',          'Abdominales', 'Otro', 'La rueda avanza hasta donde la lumbar no se arquee; vuelve tirando del abdomen.'),
  ('Pallof press de rodillas',             'Abdominales', 'Polea', 'El cable tira de lado y tú no giras: antirrotación pura, brazos al frente.'),
  ('Leñador en polea alta',                'Abdominales', 'Polea', 'El cable baja en diagonal cruzando el cuerpo; la cadera acompaña, la lumbar no rota.'),
  ('Leñador en polea baja',                'Abdominales', 'Polea', 'La diagonal contraria: de abajo arriba, girando desde el tronco.'),
  ('Dead bug con banda',                   'Abdominales', 'Banda elástica', 'La banda tira de los brazos mientras las piernas bajan alternas; la lumbar pegada al suelo.'),
  ('Mountain climbers',                    'Abdominales', 'Peso corporal', 'En plancha, las rodillas corren al pecho; la cadera no rebota.'),
  ('Crunch de bicicleta',                  'Abdominales', 'Peso corporal', 'Codo a la rodilla contraria, lento y con giro real del tronco.'),
  ('Ab rollout en barra',                  'Abdominales', 'Barra', 'La barra con discos hace de rueda; el mismo veto a arquear la lumbar.'),

  -- ── Cardio y acondicionamiento ───────────────────────────────────────────
  ('Assault bike',                         'Otros', 'Máquina', 'Brazos y piernas a la vez; intervalos cortos y duros o rodaje suave.'),
  ('Ski erg',                              'Otros', 'Máquina', 'El tirón vertical del esquí; tronco y dorsal marcan el ritmo.'),
  ('Caminata en cinta con inclinación',    'Otros', 'Máquina', 'Cuesta arriba sin correr: pulso alto de bajo impacto.'),
  ('Comba',                                'Otros', 'Otro', 'Saltos cortos y pegados al suelo; la muñeca gira, el tobillo amortigua.'),
  ('Trineo (sled drag)',                   'Otros', 'Otro', 'Arrastra el trineo caminando de espaldas o de frente; piernas sin impacto.'),
  ('Kettlebell swing',                     'Otros', 'Kettlebell', 'La cadera lanza la pesa hasta el pecho; los brazos solo la acompañan.'),
  ('Clean con kettlebell',                 'Otros', 'Kettlebell', 'La pesa sube pegada al cuerpo y se recibe en el rack sin golpear la muñeca.'),
  ('Turkish get-up',                       'Otros', 'Kettlebell', 'Del suelo a de pie con la pesa arriba; siete pasos, cero prisa.'),
  ('Wall ball',                            'Otros', 'Otro', 'Sentadilla y lanzamiento al blanco en un solo gesto; recibe la pelota amortiguando.'),
  ('Box jump',                             'Otros', 'Otro', 'Salta al cajón y aterriza en sentadilla suave; se baja andando, no saltando.'),
  ('Farmer carry con kettlebells',         'Otros', 'Kettlebell', 'Camina firme con una pesa en cada mano; el tronco ni se dobla ni rota.')
ON CONFLICT (name) DO NOTHING;

COMMIT;
