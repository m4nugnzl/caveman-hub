/**
 * Clientes de demostración con TEMPORADA: fases, bloques, eventos y su historia.
 *
 * ══ Para qué existe ═════════════════════════════════════════════════════════
 *
 * La cartera de `demo.mjs` enseña ocho semanas de programa y una báscula, pero
 * no enseña lo que distingue a esta aplicación: un plan de temporada de
 * culturismo —volumen, preparación, peak week, el campeonato y la vuelta— con
 * los bloques de entreno y la dieta colgando de él. Sin eso, quien la prueba ve
 * un cuaderno de entrenos más.
 *
 * ══ Un perfil describe a la persona; `sembrarPerfil` la escribe ════════════
 *
 * Todo va en SEMANAS DEL PROGRAMA contadas desde el alta, y el alta se coloca
 * `semanaActual − 1` lunes antes de hoy: así la demo siempre cae en el mismo
 * punto de la temporada, se siembre el día que se siembre.
 *
 * Se escribe con el cliente de Supabase que se reciba —la `service_role` de la
 * demo local o la SESIÓN del entrenador en `demo-entrenador.mjs`— y solo en
 * tablas y columnas que ese entrenador puede escribir desde la aplicación.
 * Por eso lo que solo escribe el cliente (check-ins, fotos) no está aquí.
 */

const DIA = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const aMs = (fecha) => Date.parse(`${fecha}T00:00:00Z`);
const masDias = (fecha, n) => iso(aMs(fecha) + n * DIA);

/** Hoy en la hora de la península, no en UTC: a las 00:30 ya es mañana. */
export const hoyLocal = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

const lunesDe = (fecha) => masDias(fecha, -((new Date(aMs(fecha)).getUTCDay() + 6) % 7));

/** Un ruido que no cambia entre siembras: la misma demo dos veces es la misma. */
const ruido = (n) => Math.sin(n * 1.7) * 0.35 + Math.cos(n * 0.9) * 0.2;
const tira = (n) => (Math.sin(n * 12.9898) * 43758.5453) % 1;
const azar = (n) => Math.abs(tira(n));

const redondea = (kg) => (kg >= 40 ? Math.round(kg / 2.5) * 2.5 : Math.round(kg));

// ── Las hojas ──────────────────────────────────────────────────────────────

/*
  Ejercicios de un gimnasio de culturismo, con el grupo muscular tal y como lo
  nombra `MRV_GOALS` (`domain/training.js`): un grupo que no está en esa lista
  cae en «Otros» y la lectura de volumen no lo cuenta.
  [nombre, grupo, kg de partida, series, repeticiones]
*/
const EJERCICIOS = {
  Empuje: [
    ['Press inclinado con barra', 'Pecho', 90, 4, '6-8'],
    ['Press plano con mancuernas', 'Pecho', 36, 3, '8-10'],
    ['Press militar sentado', 'Deltoides Anterior', 30, 3, '8-10'],
    ['Elevaciones laterales en polea', 'Deltoides Lateral', 10, 4, '12-15'],
    ['Extensión de tríceps sobre la cabeza', 'Tríceps', 30, 3, '10-12'],
  ],
  Tirón: [
    ['Dominadas lastradas', 'Dorsal', 15, 4, '6-8'],
    ['Remo con barra', 'Espalda Alta', 90, 3, '8-10'],
    ['Jalón unilateral', 'Dorsal', 40, 3, '10-12'],
    ['Face pull', 'Deltoides Posterior', 25, 3, '12-15'],
    ['Curl inclinado con mancuernas', 'Bíceps', 14, 3, '10-12'],
  ],
  'Pierna A': [
    ['Sentadilla hack', 'Cuádriceps', 140, 4, '6-8'],
    ['Prensa 45º', 'Cuádriceps', 260, 3, '10-12'],
    ['Extensión de cuádriceps', 'Cuádriceps', 70, 3, '12-15'],
    ['Aductor en máquina', 'Aductor', 80, 3, '12-15'],
  ],
  Torso: [
    ['Press inclinado en máquina', 'Pecho', 80, 3, '8-10'],
    ['Remo en polea baja', 'Espalda Alta', 75, 3, '8-10'],
    ['Aperturas en polea', 'Pecho', 20, 3, '12-15'],
    ['Pullover en polea', 'Dorsal', 35, 3, '12-15'],
    ['Elevaciones laterales con mancuernas', 'Deltoides Lateral', 12, 3, '12-15'],
  ],
  'Pierna B': [
    ['Peso muerto rumano', 'Isquiotibiales', 140, 4, '6-8'],
    ['Curl femoral sentado', 'Isquiotibiales', 60, 3, '10-12'],
    ['Hip thrust', 'Glúteos', 160, 3, '8-10'],
    ['Sentadilla búlgara', 'Glúteos', 24, 3, '10-12'],
  ],
};

const slug = (t) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

/** El RIR que se pide según a qué juega el bloque. */
const RIR = { adaptacion: '3', acumulacion: '2', intensificacion: '1', descarga: '4', mantenimiento: '2' };

/**
 * Las hojas de un bloque. En definición se quita una serie a los básicos: el
 * volumen baja con la dieta, que es lo que hace cualquier preparador.
 */
const hojasDe = (nombres, { fuerza, intent, definicion }) =>
  nombres.map((dayName) => ({
    dayName,
    exercises: EJERCICIOS[dayName].map(([name, muscle, base, series, reps], i) => ({
      id: `ex-${slug(dayName)}-${slug(name)}`,
      name,
      muscle,
      base: redondea(base * fuerza),
      sets: Array.from({ length: definicion && i < 2 ? series - 1 : series }, () => ({
        kg: '',
        reps: '',
        rir: '',
        targetKg: '',
        targetReps: reps,
        targetRir: RIR[intent] || '2',
      })),
    })),
  }));

/** El plan tal y como se guarda: sin la carga de partida, que es de la siembra. */
const sinBase = (hojas) =>
  hojas.map((h) => ({
    ...h,
    exercises: h.exercises.map((ex) => {
      const { base, ...plan } = ex;
      void base;
      return plan;
    }),
  }));

// ── El programa ────────────────────────────────────────────────────────────

/**
 * Los bloques y los microciclos, con lo ENTRENADO en `microcycles[].sessions`
 * (el modelo de `domain/sessions.js`), no los kilos dentro del plan.
 */
const programa = (perfil, alta, semanaActual, hoy) => {
  const { bloques, dias, fuerza = 1, adherencia = 0.93 } = perfil;
  const semanasDeFase = (w) => perfil.fases.find((f) => w >= f.desde && w <= f.hasta);
  const enDescanso = (fecha) =>
    (perfil.eventos || []).some(
      (e) => e.kind === 'rest' && fecha >= eventoFecha(alta, e) && fecha <= eventoHasta(alta, e)
    );

  const blocks = bloques.map((b) => {
    const definicion = semanasDeFase(b.desde)?.direccion === 'cut';
    const hojas = hojasDe([...new Set(dias.filter(Boolean))], { fuerza, intent: b.intencion, definicion });
    return {
      id: b.id,
      name: b.nombre,
      intent: b.intencion,
      fromWeek: b.desde,
      toWeek: b.hasta ?? null,
      ...(b.previstas ? { plannedWeeks: b.previstas } : {}),
      ...(b.nota ? { note: b.nota } : {}),
      sessions: sinBase(hojas),
      microciclo: { tipo: 'semanal', dias: dias.map((d) => (d ? { hoja: d } : { descanso: true })) },
      weeklySplit: {},
      _hojas: hojas,
    };
  });

  const bloqueDe = (w) => blocks.find((b) => w >= b.fromWeek && (b.toWeek === null || w <= b.toWeek));

  /* La carga a lo largo de la temporada: sube en volumen, se sostiene en la
     transición y cede un poco en definición. La descarga va aparte. */
  let factor = 1;
  const factores = [];
  for (let w = 1; w <= semanaActual; w += 1) {
    const dir = semanasDeFase(w)?.direccion;
    factor *= dir === 'bulk' ? 1.006 : dir === 'cut' ? 0.997 : 1;
    factores[w] = factor;
  }

  let n = 0;
  const microcycles = [];
  for (let w = 1; w <= semanaActual; w += 1) {
    const bloque = bloqueDe(w);
    const lunes = masDias(alta, (w - 1) * 7);
    const descarga = bloque.intent === 'descarga';
    const sessions = [];

    dias.forEach((dayName, i) => {
      const fecha = masDias(lunes, i);
      if (!dayName || fecha >= hoy || enDescanso(fecha)) return;
      n += 1;
      if (azar(n) > adherencia) return;
      const hoja = bloque._hojas.find((h) => h.dayName === dayName);
      const hora = 17 + Math.floor(azar(n + 7) * 4);
      const minutos = 60 + Math.floor(azar(n + 3) * 35);
      const empieza = new Date(`${fecha}T${String(hora).padStart(2, '0')}:${azar(n + 5) > 0.5 ? '30' : '00'}:00Z`);
      sessions.push({
        id: `ses-${w}-${i}`,
        date: fecha,
        dayName,
        startedAt: empieza.toISOString(),
        endedAt: new Date(empieza.getTime() + minutos * 60000).toISOString(),
        notes: w === semanaActual && i === 0 ? 'Buena sesión, la inclinada subió limpia.' : '',
        entries: hoja.exercises.map((ex, e) => {
          const [bajo, alto] = ex.sets[0].targetReps.split('-').map(Number);
          const kg = ex.base === 0 ? 0 : redondea(ex.base * factores[w] * (descarga ? 0.85 : 1));
          return {
            exerciseId: ex.id,
            name: ex.name,
            muscle: ex.muscle,
            sets: ex.sets.map((_, s) => ({
              kg: String(kg),
              reps: String(Math.max(bajo, alto - s - (azar(n * 31 + e * 7 + s) > 0.7 ? 1 : 0))),
              rir: String(Math.max(0, Number(ex.sets[s].targetRir) - (s === ex.sets.length - 1 ? 1 : 0))),
            })),
          };
        }),
      });
    });

    microcycles.push({ id: `micro-${w}`, weekNumber: w, date: lunes, days: bloque.sessions, sessions });
  }

  const guardables = blocks.map((b) => {
    const { _hojas, ...bloque } = b;
    void _hojas;
    return bloque;
  });
  return { blocks: guardables, microcycles };
};

// ── La báscula ─────────────────────────────────────────────────────────────

/** Un pesaje cada dos o tres días, siguiendo el ritmo de la fase de cada semana. */
const pesajes = (perfil, alta, hoy) => {
  const salida = [];
  let peso = perfil.pesoInicial;
  let n = 0;
  for (let fecha = alta; fecha < hoy; fecha = masDias(fecha, 1)) {
    const semana = Math.floor((aMs(fecha) - aMs(alta)) / DIA / 7) + 1;
    const fase = perfil.fases.find((f) => semana >= f.desde && semana <= f.hasta);
    const ritmo = fase?.direccion === 'maintain' ? 0 : fase?.direccion === 'cut' ? -fase.ritmo : fase?.ritmo || 0;
    peso *= (1 + ritmo / 100) ** (1 / 7);
    n += 1;
    if (n % 3 === 0 || n % 7 === 1) {
      salida.push({ id: `peso-${n}`, date: fecha, weight: Math.round((peso + ruido(n) * 0.9) * 10) / 10 });
    }
  }
  return salida;
};

// ── Fechas de los eventos ──────────────────────────────────────────────────

/** Un evento se describe como semana del programa + día (0 = lunes). */
const eventoFecha = (alta, e) => masDias(alta, (e.semana - 1) * 7 + (e.dia || 0));
const eventoHasta = (alta, e) => (e.duracion > 1 ? masDias(eventoFecha(alta, e), e.duracion - 1) : eventoFecha(alta, e));

// ── Los perfiles ───────────────────────────────────────────────────────────

const CICLO_CINCO = ['Empuje', 'Tirón', 'Pierna A', null, 'Torso', 'Pierna B', null];

/**
 * LA TEMPORADA: un Classic Physique a nueve semanas de su campeonato.
 *
 * Veinticuatro semanas de volumen, cuatro de transición, dieciséis de
 * preparación con sus refeeds y un diet break, la peak week y el campeonato
 * —con una clasificatoria tres semanas antes—, y detrás la vuelta a
 * mantenimiento con la pregunta que decide lo que viene.
 */
export const TEMPORADA = {
  nombre: 'Rubén Castaño',
  sexo: 'Hombre',
  alturaCm: 178,
  nacimiento: '1996-04-11',
  plan: 'Preparación · 150 €/mes',
  renueva: 9,
  semanaActual: 38,
  pesoInicial: 84,
  fuerza: 1,
  adherencia: 0.95,
  dias: CICLO_CINCO,
  objetivo: { direction: 'cut', ratePct: 0.7, targetWeightKg: 79.5, note: 'Pisar tarima por debajo de 80.' },
  dieta: { kcal: 2450, proteina: 210, carbos: 245, grasas: 65, pasos: 12000 },
  fases: [
    { titulo: 'Volumen', direccion: 'bulk', ritmo: 0.25, desde: 1, hasta: 24, nota: 'Off-season: subir sin pasar de 0,3 %/sem.' },
    { titulo: 'Transición', direccion: 'maintain', ritmo: 0, desde: 25, hasta: 28, nota: 'Estabilizar el peso antes de recortar.' },
    { titulo: 'Preparación', direccion: 'cut', ritmo: 0.7, desde: 29, hasta: 44, nota: 'A tarima. Revisión semanal con fotos y posing.' },
    { titulo: 'Peak week', direccion: 'maintain', ritmo: 0, desde: 45, hasta: 45, nota: 'Carga de carbohidratos jueves y viernes.' },
    {
      titulo: 'Vuelta a mantenimiento',
      direccion: 'maintain',
      ritmo: 0,
      desde: 46,
      hasta: 51,
      nota: 'Subir kcal 150 por semana hasta mantenimiento.',
      pregunta: '¿Compite en primavera?',
      opciones: [
        { when: 'Sí, en abril', title: 'Volumen corto', direction: 'bulk', ratePct: 0.2, weeks: 12 },
        { when: 'No, temporada larga', title: 'Volumen', direction: 'bulk', ratePct: 0.25, weeks: 24 },
      ],
    },
  ],
  bloques: [
    { id: 'b-adaptacion', nombre: 'Adaptación', intencion: 'adaptacion', desde: 1, hasta: 3 },
    { id: 'b-acumulacion-1', nombre: 'Acumulación I', intencion: 'acumulacion', desde: 4, hasta: 9 },
    { id: 'b-intensificacion-1', nombre: 'Intensificación I', intencion: 'intensificacion', desde: 10, hasta: 13 },
    { id: 'b-descarga-1', nombre: 'Descarga', intencion: 'descarga', desde: 14, hasta: 14 },
    { id: 'b-acumulacion-2', nombre: 'Acumulación II', intencion: 'acumulacion', desde: 15, hasta: 20 },
    { id: 'b-intensificacion-2', nombre: 'Intensificación II', intencion: 'intensificacion', desde: 21, hasta: 23 },
    { id: 'b-descarga-2', nombre: 'Descarga', intencion: 'descarga', desde: 24, hasta: 24 },
    { id: 'b-mantenimiento', nombre: 'Mantenimiento', intencion: 'mantenimiento', desde: 25, hasta: 28 },
    { id: 'b-prep-1', nombre: 'Preparación I', intencion: 'acumulacion', desde: 29, hasta: 34, nota: 'El volumen baja con la dieta; las cargas se sostienen.' },
    { id: 'b-descarga-3', nombre: 'Descarga', intencion: 'descarga', desde: 35, hasta: 35 },
    { id: 'b-prep-2', nombre: 'Preparación II', intencion: 'intensificacion', desde: 36, hasta: null, previstas: 9, nota: 'Mantener fuerza hasta la peak week.' },
  ],
  borradores: [{ id: 'd-peak', name: 'Peak week', intent: 'descarga', plannedWeeks: 1, note: 'Bombeo, sin fallo, dos sesiones de cuerpo completo.' }],
  eventos: [
    { kind: 'rest', semana: 16, dia: 0, duracion: 7, titulo: 'Vacaciones' },
    { kind: 'refeed', semana: 32, dia: 5, titulo: 'Refeed', kcal: 3400 },
    { kind: 'diet_break', semana: 34, dia: 0, duracion: 7, titulo: 'Diet break', kcal: 2900 },
    { kind: 'refeed', semana: 37, dia: 5, titulo: 'Refeed', kcal: 3400 },
    { kind: 'refeed', semana: 40, dia: 5, titulo: 'Refeed', kcal: 3300 },
    { kind: 'appointment', semana: 39, dia: 3, titulo: 'Posing con el juez' },
    {
      kind: 'race',
      semana: 42,
      dia: 6,
      titulo: 'Copa de Madrid',
      competicion: { federacion: 'AEFN', categoria: 'Classic Physique', sede: 'Madrid' },
    },
    { kind: 'appointment', semana: 44, dia: 3, titulo: 'Posing: pase final' },
    {
      kind: 'race',
      semana: 45,
      dia: 6,
      titulo: 'Campeonato de España',
      ancla: true,
      competicion: { federacion: 'AEFN', categoria: 'Classic Physique', sede: 'Valencia' },
    },
  ],
};

/** Una Wellness en volumen: la otra cara de la temporada, lejos de tarima. */
export const VOLUMEN = {
  nombre: 'Laura Méndez',
  sexo: 'Mujer',
  alturaCm: 165,
  nacimiento: '1999-09-02',
  plan: 'Mensual · 90 €',
  renueva: 17,
  semanaActual: 20,
  pesoInicial: 60.5,
  fuerza: 0.55,
  adherencia: 0.9,
  dias: ['Pierna A', 'Torso', null, 'Pierna B', 'Tirón', null, null],
  objetivo: { direction: 'bulk', ratePct: 0.2, targetWeightKg: 64, note: '' },
  dieta: { kcal: 2250, proteina: 130, carbos: 290, grasas: 65, pasos: 9000 },
  fases: [{ titulo: 'Volumen', direccion: 'bulk', ritmo: 0.2, desde: 1, hasta: 36, nota: 'Prioridad: glúteo y hombro.' }],
  bloques: [
    { id: 'b-adaptacion', nombre: 'Adaptación', intencion: 'adaptacion', desde: 1, hasta: 3 },
    { id: 'b-acumulacion-1', nombre: 'Acumulación I', intencion: 'acumulacion', desde: 4, hasta: 9 },
    { id: 'b-intensificacion-1', nombre: 'Intensificación I', intencion: 'intensificacion', desde: 10, hasta: 13 },
    { id: 'b-descarga-1', nombre: 'Descarga', intencion: 'descarga', desde: 14, hasta: 14 },
    { id: 'b-acumulacion-2', nombre: 'Acumulación II', intencion: 'acumulacion', desde: 15, hasta: null, previstas: 6 },
  ],
  borradores: [],
  eventos: [{ kind: 'goal', semana: 36, dia: 6, titulo: 'Fin del volumen', ancla: true }],
};

// ── La escritura ───────────────────────────────────────────────────────────

const ok = (r, que) => {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
};

/**
 * Escribe a la persona entera en una ficha que ya existe (`create_client`).
 *
 * @param db       cliente de Supabase con permiso sobre esa ficha
 * @param clientId la ficha
 * @param coachId  quien firma las fases y los eventos (`created_by`)
 */
export const sembrarPerfil = async (db, clientId, coachId, perfil, { hoy = hoyLocal() } = {}) => {
  const alta = masDias(lunesDe(hoy), -(perfil.semanaActual - 1) * 7);
  const fechaDeSemana = (w) => masDias(alta, (w - 1) * 7);

  /* `preferences` lleva más cosas que el objetivo (el protocolo, la
     privacidad): se añade, no se pisa. */
  const ficha = ok(await db.from('clients').select('preferences').eq('id', clientId).single(), 'leer la ficha');

  ok(
    await db
      .from('clients')
      .update({
        start_date: alta,
        gender: perfil.sexo,
        height_cm: perfil.alturaCm,
        birth_date: perfil.nacimiento,
        cycle_type: 'weekly',
        plan: perfil.plan,
        payment_status: 'paid',
        next_payment_date: masDias(hoy, perfil.renueva),
        preferences: { ...(ficha?.preferences || {}), goal: perfil.objetivo },
        /* Lleva meses entrenando: su alta está hecha. Sin esto la cartera lo
           marca «Onboarding sin cerrar» y su portal le pide el cuestionario. */
        onboarding_complete: true,
      })
      .eq('id', clientId),
    'ficha'
  );

  const { blocks, microcycles } = programa(perfil, alta, perfil.semanaActual, hoy);
  ok(
    await db.from('workout_data').upsert(
      {
        client_id: clientId,
        microcycles,
        blocks,
        draft_blocks: perfil.borradores,
        weekly_split: {},
        /* Una firma nueva: la 0131 rechaza cambiar el plan sin ella. */
        escrito_por: `siembra-demo-${Date.now()}`,
      },
      { onConflict: 'client_id' }
    ),
    'programa'
  );

  ok(
    await db
      .from('anthropometry')
      .upsert({ client_id: clientId, history: pesajes(perfil, alta, hoy) }, { onConflict: 'client_id' }),
    'báscula'
  );

  ok(
    await db.from('nutrition_plans').upsert(
      {
        client_id: clientId,
        target_kcals: perfil.dieta.kcal,
        protein_grams: perfil.dieta.proteina,
        carbs_grams: perfil.dieta.carbos,
        fats_grams: perfil.dieta.grasas,
        steps_goal: perfil.dieta.pasos,
      },
      { onConflict: 'client_id' }
    ),
    'dieta'
  );

  ok(await db.from('client_phases').delete().eq('client_id', clientId), 'fases viejas');
  ok(await db.from('client_events').delete().eq('client_id', clientId), 'eventos viejos');

  ok(
    await db.from('client_phases').insert(
      perfil.fases.map((f) => ({
        client_id: clientId,
        title: f.titulo,
        direction: f.direccion,
        rate_pct: f.ritmo,
        starts_on: fechaDeSemana(f.desde),
        ends_on: masDias(fechaDeSemana(f.hasta), 6),
        note: f.nota || '',
        created_by: coachId,
        next_question: f.pregunta || null,
        next_options: f.opciones || null,
      }))
    ),
    'fases'
  );

  /* Cada fila con TODAS las claves: PostgREST rellena con NULL, no con el
     valor por defecto, las que falten en alguna, y `ancla` es NOT NULL. */
  ok(
    await db.from('client_events').insert(
      perfil.eventos.map((e) => ({
        client_id: clientId,
        date: eventoFecha(alta, e),
        hasta: e.duracion > 1 ? eventoHasta(alta, e) : null,
        kind: e.kind,
        title: e.titulo,
        kcal: e.kcal ?? null,
        ancla: Boolean(e.ancla),
        competicion: e.competicion ?? null,
        privada: false,
        created_by: coachId,
      }))
    ),
    'eventos'
  );

  return { alta, sesiones: microcycles.reduce((n, m) => n + m.sessions.length, 0) };
};
