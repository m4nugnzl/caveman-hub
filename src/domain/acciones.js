/**
 * LA LÍNEA DE ACCIONES: el protocolo leído como lo que es.
 *
 * ══ La tesis ═══════════════════════════════════════════════════════════════
 *
 * **Un protocolo es una lista de acciones con su premisa.** No una pantalla de
 * conmutadores que declara qué EXISTE para una persona, sino un plan que dice
 * qué PASA y cuándo.
 *
 * ══ El primitivo no se inventa aquí: ya existía ════════════════════════════
 *
 * `domain/intake.js` guarda desde hace meses un paso con dueño
 * (`owner: client|coach`), con lo que entrega (`link`/`file`), con estado
 * (`done`) y con automarcado (`auto`). Eso es una acción completa. Lo único que
 * le faltaba era el **cuándo**: estaba clavada en un momento —el alta— y hasta
 * el vocabulario lo encerraba (`INTAKE_CATALOG`, `clientSteps`).
 *
 * Este módulo no cambia ese modelo: lo LEE desde fuera del alta, y le junta las
 * otras cosas que ya pasaban en otros momentos y que nadie llamaba acciones —el
 * parte de la sesión, los pesajes, los bloques del check-in, las varas de
 * aviso—. Ninguna columna nueva, ninguna migración: **lo que cambia es la
 * lectura**, igual que hizo en su día `LineaDelProcedimiento`. La diferencia es
 * que aquella se quedó en un índice y ésta es el editor.
 *
 * ══ Las cuatro clases de acción ════════════════════════════════════════════
 *
 * Salen de lo que ya hay repartido, no de un catálogo inventado:
 *
 *   · **pedir**  — cuestionarios, pesajes, perímetros, pliegues, fotos, y los
 *                  pasos del alta que son del cliente.
 *   · **dar**    — los pasos con `link: true`: el vídeo de bienvenida, la rutina
 *                  explicada, la anamnesis en PDF.
 *   · **hacer**  — los pasos del entrenador: el análisis postural, el cobro.
 *   · **avisar** — `alertDays`, y el recordatorio del check-in.
 *
 * ══ Y las premisas ═════════════════════════════════════════════════════════
 *
 * Cuatro existían de forma implícita y no se podían decir; una es nueva.
 */

import {
  ALERT_DAYS,
  CHECKIN_BLOCKS,
  WEIGH_INS_MAX,
  activeQuestions,
  checkinMode,
  checkinQuestions,
  clientProtocol,
  isModuleOn,
  setAlertDays,
  toggleModule,
  weighInsTarget,
} from './protocol';
import {
  MAX_CUSTOM_STEPS,
  addCustomStep,
  intakeSteps,
  removeCustomStep,
  stepOwner,
  toggleStep,
} from './intake';
import { cuentaPreguntas } from './formularios';
import { clientIntakeForm } from './intakeForm';
/* La regla de «contestada y sin leer» vive en `envios.js` y se lee desde aquí:
   ningún módulo del dominio importa de éste, así que no hay ciclo posible. */
import { sinLeer } from './envios';
import { DIAS, sanitizeSchedule } from './protocolos';
import { newId } from '@/lib/ids';

/**
 * Los tramos de la vida de un cliente, en orden.
 *
 * `mandada` no sale nunca en un protocolo: es la premisa de una acción suelta,
 * puesta a mano sobre UNA persona (ver `accionesDeCliente`). Vive en la misma
 * lista porque es la misma clase de cosa y porque la pantalla del cliente los
 * pinta con la misma gramática.
 */
export const PREMISAS = [
  { id: 'entrar', rot: 'Al entrar', hint: 'Lo que pasa una vez, cuando empieza contigo.' },
  { id: 'sesion', rot: 'Al terminar de entrenar', hint: 'Su parte, cada vez que cierra una sesión.' },
  { id: 'semana', rot: 'Cada semana', hint: 'Su check-in: lo que se mide y lo que se pregunta.' },
  { id: 'silencio', rot: 'Si pasa demasiado tiempo', hint: 'Lo que te avisa a ti. El cliente no se entera.' },
  { id: 'mandada', rot: 'Cuando se la mandes', hint: 'Suelta, para una persona concreta.' },
];

export const premisaById = (id) => PREMISAS.find((p) => p.id === id) || null;

/** El disco de cada clase. Salen de `--data-*`: los discos distinguen. */
export const TONOS = {
  form: 'azul',
  medida: 'violeta',
  entrega: 'verde',
  tarea: 'ambar',
  aviso: 'naranja',
};

/** A qué familia de disco pertenece cada tipo de acción. */
const FAMILIA = {
  form: 'form',
  peso: 'medida',
  perimeters: 'medida',
  folds: 'medida',
  fotos: 'medida',
  entrega: 'entrega',
  tarea: 'tarea',
  aviso: 'aviso',
  recordatorio: 'aviso',
};

const VERBO = { pedir: 'Pídele', dar: 'Dale', hacer: 'Haz tú', avisar: 'Avísame' };

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Las piezas de la semana viven en su formulario; sin él, en el protocolo. */
const piezasSemana = (protocolo, formularios) => {
  const form = formularios.find((f) => f.id === protocolo?.forms?.semana && f.momento === 'semana');
  return {
    form,
    checkin: form ? form.checkin : protocolo?.checkin,
    weighIns: form ? form.weighIns : protocolo?.weighIns,
    askPhotos: form ? form.askPhotos === true : false,
    preguntas: form ? form.questions : protocolo?.checkinQuestions || [],
  };
};

const formDe = (formularios, id, momento) =>
  formularios.find((f) => f.id === id && f.momento === momento) || null;

/** «Su peso, sus perímetros y sus pliegues» — la conjunción, no una lista con comas. */
const enumerar = (partes) => {
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
};

/**
 * Lo que se MIDE en el check-in de esta semana, con lo que lleva puesto cada
 * pieza.
 *
 * Salía como cuatro acciones y ahora es el detalle de una sola, así que se
 * calcula una vez y viaja dentro de ella: la fila lo resume y el carril lo
 * lista. Cada pieza conserva su `tipo` porque es lo que elige su icono, y las
 * dos de medida su `bloque`, que es lo que abre su lámina.
 */
export const piezasDelCheckin = (semana) => {
  const out = [];

  const n = weighInsTarget({ weighIns: semana.weighIns });
  if (n > 0) {
    out.push({
      id: 'peso',
      tipo: 'peso',
      suj: 'Su peso',
      corto: 'su peso',
      dice: 'Es lo que hace fiable la media de la semana',
      lleva: n === WEIGH_INS_MAX ? 'cada día' : `${n} a la semana`,
    });
  }

  for (const bloque of CHECKIN_BLOCKS) {
    const modo = checkinMode({ checkin: semana.checkin }, bloque.id);
    if (modo === 'off') continue;
    out.push({
      id: bloque.id,
      tipo: bloque.id,
      bloque: bloque.id,
      suj: bloque.label,
      corto: bloque.id === 'perimeters' ? 'sus perímetros' : 'sus pliegues',
      dice: bloque.hint,
      lleva: modo === 'required' ? 'obligatorio' : 'opcional',
    });
  }

  if (semana.askPhotos) {
    out.push({
      id: 'fotos',
      tipo: 'fotos',
      suj: 'Sus fotos de progreso',
      corto: 'sus fotos',
      dice: 'Frente, perfil y espalda, en las mismas condiciones',
      lleva: '3 tomas',
    });
  }

  return out;
};

// ══ LEER ═══════════════════════════════════════════════════════════════════

/**
 * La línea entera de un protocolo, en orden de tiempo.
 *
 * Cada acción trae `id` DERIVADO y estable: `step:welcome`, `form:sesion`,
 * `block:folds`. Estable importa porque es lo que la pantalla usa para saber
 * cuál está tocada, y un id que cambiara en cada render dejaría el carril
 * derecho saltando solo.
 */
export const accionesDe = ({ protocolo, formularios = [] }) => {
  if (!protocolo) return [];
  const out = [];

  // ── AL ENTRAR: los pasos del alta, en su orden ──────────────────────────
  const intake = protocolo.intake;
  for (const step of intakeSteps(intake)) {
    const owner = stepOwner(intake, step);
    const esForm = step.id === 'form';
    const alta = esForm ? formDe(formularios, protocolo.forms?.alta, 'alta') : null;

    /* `step` viene resuelto por `intakeSteps`, así que `link` está tanto si es
       del catálogo como si es un paso propio: no hace falta preguntarle dos
       veces al catálogo por algo que el paso ya trae puesto. */
    const tipo = esForm
      ? 'form'
      : step.id === 'gymPhotos'
        ? 'fotos'
        : step.id === 'firstCheckIn'
          ? 'peso'
          : step.link
            ? 'entrega'
            : 'tarea';

    const hace = step.link && owner === 'coach' ? 'dar' : owner === 'client' ? 'pedir' : 'hacer';

    out.push({
      id: `step:${step.id}`,
      premisa: 'entrar',
      hace,
      verbo: VERBO[hace],
      tipo,
      familia: FAMILIA[tipo] || 'tarea',
      suj: esForm && alta ? alta.name : step.label,
      dice: esForm && alta ? 'El cuestionario que contesta en su portal' : step.hint || '',
      lleva: esForm && alta ? plural(cuentaPreguntas(alta), 'pregunta', 'preguntas') : '',
      quien: owner,
      stepId: step.id,
      formId: esForm ? alta?.id || null : null,
      quitable: true,
    });
  }

  // ── AL TERMINAR DE ENTRENAR: el parte ───────────────────────────────────
  const sesion = formDe(formularios, protocolo.forms?.sesion, 'sesion');
  if (isModuleOn(protocolo, 'sessionFeedback') && sesion) {
    out.push({
      id: 'form:sesion',
      premisa: 'sesion',
      hace: 'pedir',
      verbo: VERBO.pedir,
      tipo: 'form',
      familia: 'form',
      suj: sesion.name,
      dice: 'Lo que le preguntas nada más cerrar la sesión',
      lleva: plural(cuentaPreguntas(sesion), 'pregunta', 'preguntas'),
      quien: 'client',
      formId: sesion.id,
      quitable: true,
    });
  }

  /*
    ── CADA SEMANA: lo que le pides es SU CHECK-IN, y el check-in es UN
       formulario ───────────────────────────────────────────────────────────

    Aquí había cuatro acciones —su peso, sus perímetros, sus pliegues y el
    cuestionario— y las cuatro son **campos del mismo formulario de la semana**
    (`piezasSemana` lee `weighIns`, `checkin` y `questions` de él). Eso no era
    una lista de cuatro cosas que le pasan a un cliente: era un formulario
    desmontado en piezas y editable desde dos pantallas, porque los mismos
    campos ya tienen su mando en el constructor —los enchufes, con su
    obligatorio/opcional y sus pesajes—.

    Dos editores del mismo campo es el D1 del replanteamiento repetido en otro
    sitio, y se paga dos veces: el que lo toca en un sitio no sabe que existe el
    otro, y la línea del protocolo miente sobre cuántas cosas pasan de verdad
    cada semana. Pasa UNA cosa: se le pide su check-in.

    Así que el protocolo se queda con lo suyo —a quién, qué día, cada cuántas
    semanas, y el recordatorio— y el QUÉ vive entero en el formulario. La fila
    lo resume («Su peso, sus perímetros y sus pliegues · 6 preguntas») y el
    carril lo detalla, en lectura, con la puerta para editarlo.
  */
  const semana = piezasSemana(protocolo, formularios);
  const piezas = piezasDelCheckin(semana);

  if (semana.form || piezas.length > 0 || semana.preguntas.length > 0) {
    const cuantas = semana.preguntas.length;
    out.push({
      id: 'form:semana',
      premisa: 'semana',
      hace: 'pedir',
      verbo: VERBO.pedir,
      tipo: 'form',
      familia: 'form',
      /* Sin formulario apuntado la acción existe igual: el protocolo sigue
         pidiendo su check-in, solo que las piezas viven en él (protocolos
         heredados). El carril es el que ofrece apuntarle uno. */
      suj: semana.form ? semana.form.name : 'Su check-in',
      dice:
        piezas.length > 0
          ? enumerar(piezas.map((p) => p.corto))
          : 'Lo que la báscula no mide',
      lleva: cuantas > 0 ? plural(cuantas, 'pregunta', 'preguntas') : '',
      quien: 'client',
      formId: semana.form?.id || null,
      /* Lo que se le mide, para que el carril lo enseñe sin recalcularlo. */
      piezas,
      quitable: Boolean(semana.form),
    });
  }

  /*
    El recordatorio: la única acción de todo el protocolo que le habla al cliente
    sin que el entrenador pulse nada ese día. Por eso nace apagado y por eso lo
    enciende él aquí — y por eso el texto no reprocha: se le recuerda, no se le
    reclama. Va por el canal de siempre (`updates.js`), con el mismo descarte que
    las demás novedades.
  */
  const horario = sanitizeSchedule(protocolo.schedule);
  if (horario.remindAfter > 0) {
    out.push({
      id: 'recordatorio',
      premisa: 'semana',
      hace: 'avisar',
      verbo: 'Recuérdaselo',
      tipo: 'recordatorio',
      familia: 'aviso',
      suj: `A los ${plural(horario.remindAfter, 'día', 'días')}, si no lo ha entregado`,
      dice: 'Le llega como una novedad más en su portal. Sin reproches.',
      lleva: '',
      quien: 'app',
      quitable: true,
    });
  }

  // ── SI PASA DEMASIADO TIEMPO: las varas de aviso ────────────────────────
  for (const umbral of ALERT_DAYS) {
    const dias = protocolo.alertDays?.[umbral.id] || 0;
    if (dias <= 0) continue;
    out.push({
      id: `alert:${umbral.id}`,
      premisa: 'silencio',
      hace: 'avisar',
      verbo: VERBO.avisar,
      tipo: 'aviso',
      familia: 'aviso',
      suj: umbral.label,
      dice: umbral.hint,
      lleva: `${dias} días`,
      quien: 'app',
      quitable: true,
    });
  }

  return out;
};

/** Agrupadas por premisa y sin las vacías, que es como se pintan. */
export const porPremisa = (acciones) =>
  PREMISAS.map((p) => ({ ...p, acciones: acciones.filter((a) => a.premisa === p.id) })).filter(
    (p) => p.acciones.length > 0
  );

/** Cuántas lleva un protocolo, para la columna de la lista. */
export const cuentaAcciones = (plan) => accionesDe(plan).length;

/** El día en que se le pide el check-in, dicho como se lee. */
export const diaDelCheckin = (protocolo) =>
  DIAS.find((d) => d.id === sanitizeSchedule(protocolo?.schedule).weekday)?.corto || 'lunes';

/*
  ══ LOS MOMENTOS: el protocolo en cuatro renglones ═════════════════════════

  El dibujo del protocolo (Figma 98:86, 18 sep) lo lee en filas de «qué · cuándo
  · cuánto»: el alta al entrar, el parte tras entrenar, el check-in cada semana.
  Es el resumen de `accionesDe` y no otra cuenta: cada cifra sale de la acción
  que ya existe, así que la tarjeta y el banco no pueden discrepar.

  Los avisos son el cuarto renglón. No salen en el dibujo, pero son lo único
  del protocolo que le pasa al entrenador y no al cliente, y en la ficha su
  vara necesita un sitio donde tocarse.
*/

/** «Cada lunes» · «Sábado, cada 2 semanas». */
const cuandoCheckin = (schedule) => {
  const { weekday, everyWeeks } = sanitizeSchedule(schedule);
  const dia = DIAS.find((d) => d.id === weekday) || DIAS[0];
  return everyWeeks === 1 ? `Cada ${dia.corto}` : `${dia.label}, cada ${everyWeeks} semanas`;
};

const cuantoCheckin = (preguntas, medidas) =>
  [
    preguntas > 0 && plural(preguntas, 'pregunta', 'preguntas'),
    medidas > 0 && plural(medidas, 'medida', 'medidas'),
  ]
    .filter(Boolean)
    .join(' + ');

const cuantosAvisos = (alertDays) => ALERT_DAYS.filter((u) => (alertDays?.[u.id] || 0) > 0).length;

const momentos = ({ alta, parte, checkin, avisos }) => [
  { id: 'alta', rot: 'Alta', cuando: 'Al entrar', cuanto: alta || 'Sin cuestionario', apagado: !alta },
  {
    id: 'parte',
    rot: 'El parte',
    cuando: 'Tras entrenar',
    cuanto: parte.on ? parte.cuanto || 'Sin preguntas' : 'Apagado',
    apagado: !parte.on || !parte.cuanto,
  },
  {
    id: 'checkin',
    rot: 'El check-in',
    cuando: checkin.cuando,
    cuanto: checkin.cuanto || 'Vacío',
    apagado: !checkin.cuanto,
  },
  {
    id: 'avisos',
    rot: 'Tus avisos',
    cuando: 'Si no hay noticias',
    cuanto: avisos > 0 ? plural(avisos, 'aviso', 'avisos') : 'Ninguno',
    apagado: avisos === 0,
  },
];

/** Los de un protocolo del entrenador, con sus formularios. */
export const momentosDe = ({ protocolo, formularios = [] }) => {
  const acciones = accionesDe({ protocolo, formularios });
  const alta = acciones.find((a) => a.id === 'step:form');
  const parte = acciones.find((a) => a.id === 'form:sesion');
  const semana = acciones.find((a) => a.id === 'form:semana');
  const nSemana = semana ? piezasSemana(protocolo, formularios).preguntas.length : 0;

  return momentos({
    alta: alta?.lleva || '',
    parte: { on: isModuleOn(protocolo, 'sessionFeedback'), cuanto: parte?.lleva || '' },
    checkin: {
      cuando: cuandoCheckin(protocolo?.schedule),
      cuanto: cuantoCheckin(nSemana, semana?.piezas?.length || 0),
    },
    avisos: cuantosAvisos(protocolo?.alertDays),
  });
};

/**
 * Los de UN cliente, leídos de su copia y no del protocolo del que sale.
 *
 * Lo que se le pregunta es lo que tiene escrito en sus preferencias —puede estar
 * afinado a mano o haberse quedado atrás—, y su cita es la suya: si la eligió
 * él, no es la del protocolo. Ver `citasDelProtocolo`.
 */
export const momentosDelCliente = (preferences) => {
  const protocol = clientProtocol(preferences);
  const nAlta = cuentaPreguntas({ ...clientIntakeForm(preferences), momento: 'alta' });
  const nParte = activeQuestions(protocol).length;
  const piezas = piezasDelCheckin({
    weighIns: protocol.weighIns,
    checkin: protocol.checkin,
    askPhotos: protocol.askPhotos === true,
  });
  const pauta = preferences?.checkin;
  const cita = Number.isInteger(pauta?.weekday) ? pauta : protocol.schedule;

  return momentos({
    alta: nAlta > 0 ? plural(nAlta, 'pregunta', 'preguntas') : '',
    parte: {
      on: isModuleOn(protocol, 'sessionFeedback'),
      cuanto: nParte > 0 ? plural(nParte, 'pregunta', 'preguntas') : '',
    },
    checkin: {
      cuando: cuandoCheckin(cita),
      cuanto: cuantoCheckin(checkinQuestions(protocol).length, piezas.length),
    },
    avisos: cuantosAvisos(protocol.alertDays),
  });
};

// ══ ESCRIBIR ═══════════════════════════════════════════════════════════════

/**
 * Lo que se puede añadir, y en qué momentos vale cada cosa.
 *
 * `premisas` no está para adornar: sin ella el selector ofrecería «sus pliegues
 * al terminar de entrenar», que no significa nada, y el segundo paso del
 * diálogo se convertiría en una lista de opciones malas.
 */
export const QUE_CATALOGO = [
  {
    hace: 'pedir',
    rot: 'Pídele',
    items: [
      { id: 'form', label: 'Un formulario', icono: 'form', premisas: ['entrar', 'sesion', 'semana', 'mandada'] },
      /*
        Su peso, sus perímetros, sus pliegues y sus fotos NO están aquí, y no es
        un olvido: son piezas DEL formulario de la semana y se encienden en él,
        con los enchufes que ya tienen su mando (cuántos pesajes, obligatorio u
        opcional). Ofrecerlas también aquí es lo que hacía que el mismo campo
        tuviera dos interruptores en dos pantallas.
      */
      { id: 'archivo', label: 'Un archivo', icono: 'archivo', premisas: ['entrar', 'mandada'] },
    ],
  },
  {
    hace: 'dar',
    rot: 'Dale',
    items: [
      { id: 'video', label: 'Un vídeo', icono: 'video', premisas: ['entrar', 'mandada'] },
      { id: 'documento', label: 'Un documento', icono: 'archivo', premisas: ['entrar', 'mandada'] },
    ],
  },
  {
    hace: 'hacer',
    rot: 'Haz tú',
    items: [{ id: 'tarea', label: 'Una casilla tuya', icono: 'tarea', premisas: ['entrar', 'mandada'] }],
  },
  {
    hace: 'avisar',
    rot: 'Avísame',
    items: [
      { id: 'alert:training', label: 'Si no entrena', icono: 'campana', premisas: ['silencio'] },
      { id: 'alert:weight', label: 'Si no se pesa', icono: 'campana', premisas: ['silencio'] },
      { id: 'recordar', label: 'Si no entrega el check-in', icono: 'campana', premisas: ['semana'] },
    ],
  },
];

export const queById = (id) =>
  QUE_CATALOGO.flatMap((g) => g.items.map((it) => ({ ...it, hace: g.hace }))).find((it) => it.id === id) ||
  null;

/** Las premisas en las que cabe una cosa. Vacío = no cabe en ninguna. */
export const premisasDe = (queId) => {
  const que = queById(queId);
  if (!que) return [];
  return PREMISAS.filter((p) => que.premisas.includes(p.id));
};


/**
 * Añadir una acción: qué se pide y cuándo.
 *
 * Devuelve el PLAN entero —protocolo y formularios— porque una acción de la
 * semana no vive necesariamente en el protocolo: los bloques, los pesajes y las
 * fotos son piezas de su formulario. Devolver solo el protocolo obligaría a
 * quien llama a acordarse de la otra mitad, y a la tercera pantalla alguien se
 * olvidaría.
 *
 * `formId` solo se usa al añadir un formulario; el resto lo ignora.
 */
export const anadirAccion = (plan, { que, premisa, formId = null, label = '' }) => {
  const { protocolo, formularios } = plan;
  const cual = queById(que);
  if (!cual || !cual.premisas.includes(premisa)) return plan;

  if (que === 'form') {
    if (premisa === 'entrar') {
      const conPaso = intakeSteps(protocolo.intake).some((s) => s.id === 'form')
        ? protocolo.intake
        : toggleStep(protocolo.intake, 'form');
      return {
        formularios,
        protocolo: { ...protocolo, intake: conPaso, forms: { ...protocolo.forms, alta: formId } },
      };
    }
    if (premisa === 'sesion') {
      /* El parte cuelga del módulo: sin encenderlo, las preguntas existen y no
         se le hacen. Añadir la acción ES encenderlo — si no, la fila aparecería
         en la línea sin que al cliente le llegara nada. */
      const conModulo = isModuleOn(protocolo, 'sessionFeedback')
        ? protocolo
        : toggleModule(protocolo, 'sessionFeedback');
      return { formularios, protocolo: { ...conModulo, forms: { ...protocolo.forms, sesion: formId } } };
    }
    return { formularios, protocolo: { ...protocolo, forms: { ...protocolo.forms, semana: formId } } };
  }

  if (que === 'recordar') {
    return {
      formularios,
      protocolo: { ...protocolo, schedule: sanitizeSchedule({ ...protocolo.schedule, remindAfter: 1 }) },
    };
  }

  if (que.startsWith('alert:')) {
    const cual2 = que.slice(6);
    const umbral = ALERT_DAYS.find((u) => u.id === cual2);
    if (!umbral) return plan;
    /* Diez días es la vara general de `THRESHOLDS`, no un número nuevo: quien
       añade la acción está pidiendo la de siempre y puede afinarla al lado. */
    return { formularios, protocolo: setAlertDays(protocolo, cual2, 10) };
  }

  /* Lo que queda son pasos del alta: un vídeo, un documento, un archivo que él
     manda o una casilla tuya. Todos caben en el catálogo del alta o, si no
     están, como paso propio. */
  const texto = String(label || cual.label).trim();
  const catalogo = { video: 'welcome', documento: 'anamnesis', archivo: 'postureVideo' }[que];
  if (catalogo && !intakeSteps(protocolo.intake).some((s) => s.id === catalogo)) {
    return { formularios, protocolo: { ...protocolo, intake: toggleStep(protocolo.intake, catalogo) } };
  }
  if ((protocolo.intake.custom || []).length >= MAX_CUSTOM_STEPS) return plan;
  return {
    formularios,
    protocolo: { ...protocolo, intake: addCustomStep(protocolo.intake, newId('paso'), texto) },
  };
};

/**
 * Quitar una acción. Nunca borra el trabajo que hay detrás.
 *
 * Quitar «Sus perímetros» los apaga; no tira las medidas que el cliente ya haya
 * mandado. Quitar un formulario del protocolo no borra el formulario: sigue en
 * su cajón, y la pantalla de Formularios dirá que no lo pide nadie. Es la misma
 * regla que ya sostiene todo el producto — apagar no es destruir.
 */
export const quitarAccion = (plan, accion) => {
  const { protocolo, formularios } = plan;
  if (!accion) return plan;

  if (accion.id === 'recordatorio') {
    return {
      formularios,
      protocolo: { ...protocolo, schedule: sanitizeSchedule({ ...protocolo.schedule, remindAfter: 0 }) },
    };
  }

  if (accion.id.startsWith('alert:')) {
    return { formularios, protocolo: setAlertDays(protocolo, accion.id.slice(6), 0) };
  }

  if (accion.id === 'form:sesion') {
    /* Se apaga el módulo, que es lo que de verdad deja de hacérselo. El
       formulario sigue apuntado: volver a encenderlo devuelve lo que había, en
       vez de obligar a elegirlo otra vez. */
    return { formularios, protocolo: toggleModule(protocolo, 'sessionFeedback') };
  }

  if (accion.id === 'form:semana') {
    /*
      Se desapunta el formulario —que sigue entero en su cajón, con sus piezas y
      sus preguntas— y se apaga además el RESPALDO heredado del protocolo.

      Sin lo segundo, quitar el check-in no lo quitaba: `piezasSemana` cae al
      protocolo cuando no hay formulario apuntado, así que la acción volvía a
      salir pidiendo el peso y los perímetros de una copia que ya no edita
      nadie. Apagar aquí no destruye nada recuperable: volver a apuntar el
      formulario devuelve lo que tenía puesto.
    */
    return {
      formularios,
      protocolo: {
        ...protocolo,
        forms: { ...protocolo.forms, semana: null },
        weighIns: 0,
        checkin: { perimeters: 'off', folds: 'off' },
      },
    };
  }

  if (accion.stepId) {
    const esPropio = (protocolo.intake.custom || []).some((c) => c.id === accion.stepId);
    const intake = esPropio
      ? removeCustomStep(protocolo.intake, accion.stepId)
      : toggleStep(protocolo.intake, accion.stepId);
    return { formularios, protocolo: { ...protocolo, intake } };
  }

  return plan;
};

// ══ LO DE UN CLIENTE CONCRETO ══════════════════════════════════════════════

/**
 * Todo lo que le has mandado a UNA persona, en una sola lista.
 *
 * ══ Por qué esto es un puente y no una consulta ════════════════════════════
 *
 * Porque lo mandado vive en dos sitios y solo uno tiene futuro:
 *
 *   · `client_actions` (0105) — lo de ahora. Con tipo, fecha, estado y recado.
 *   · `intake.custom`         — lo de antes. Un paso propio del ALTA de ese
 *     cliente, sin fecha y con el estado en una casilla que solo marcaba el
 *     entrenador. Ahí siguen los que ya estaban escritos.
 *
 * Lo escrito no se migra —el mismo criterio que tomó la 0099 con el check-in y
 * el parte: no se mueven datos a cambio de elegancia—, así que la costura la
 * cose la LECTURA. Quien pinta la ficha no tiene que saber que hubo dos épocas.
 *
 * ── Lo viejo se puede quitar y ya no se puede añadir ──────────────────────
 * `quitable` viaja en cada renglón porque los dos sitios se vacían de forma
 * distinta, y `de` dice cuál es cuál. Lo que no vuelve es la forma de escribir
 * en el sitio viejo: `mandarleAlgo` se retiró con la tanda 2, y con ella el
 * efecto que nadie relacionaba con mandar un vídeo —declarar excepción de
 * protocolo sobre esa persona—.
 */
export const loQueLeHasMandado = ({ intake, filas = [] }) => {
  const out = filas.map((f) => ({
    id: f.id,
    de: 'accion',
    tipo: f.tipo || 'form',
    title: f.title,
    cuando: f.sent_at || null,
    hecha: Boolean(f.submitted_at),
    link: f.link || null,
    /* Lo que contestó, y con qué se preguntó. Van juntos porque una respuesta
       sin su enunciado es un valor suelto: el esquema viaja congelado en la
       fila justo para poder leerla meses después (ver `filasDeEnvio`). */
    contestadaEl: f.submitted_at || null,
    elementos: f.schema?.elementos || [],
    respuestas: f.answers || null,
    /* Si te falta por leerla (0108). La regla vive en `domain/envios.js`. */
    sinLeer: sinLeer(f),
  }));

  for (const paso of intake?.custom || []) {
    out.push({
      id: paso.id,
      de: 'paso',
      /* Los pasos viejos no tenían tipo. Con enlace era algo que le dabas y sin
         él una casilla tuya, que es lo único que se puede deducir sin inventar
         una historia que no está escrita. */
      tipo: intake.links?.[paso.id] ? 'documento' : 'pide',
      title: paso.label,
      cuando: null,
      hecha: (intake.done || []).includes(paso.id),
      link: intake.links?.[paso.id] || null,
      /* Lo viejo no guardaba respuestas: un paso del alta se marcaba, no se
         contestaba. Se declaran igual para que quien pinta la lista no tenga que
         saber de qué época es cada renglón. */
      contestadaEl: null,
      elementos: [],
      respuestas: null,
      sinLeer: false,
    });
  }

  /* Lo más reciente primero, y lo viejo —que no tiene fecha— al final: es lo que
     lleva ahí meses y lo que menos se mira. */
  return out.sort((a, b) => String(b.cuando || '').localeCompare(String(a.cuando || '')));
};

export { MAX_CUSTOM_STEPS, setAlertDays };
