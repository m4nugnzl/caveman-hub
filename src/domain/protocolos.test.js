import { describe, expect, it } from 'vitest';

import {
  MAX_PROTOCOLOS,
  PROTOCOLO_GENERAL,
  altaDe,
  buildProtocolo,
  cadaCuanto,
  clientProtocoloId,
  coachProtocolos,
  cuentaClientes,
  checkinDesdeHorario,
  defaultSchedule,
  diaDe,
  protocoloById,
  protocoloDeCliente,
  protocolosToPreferences,
  resolveProtocolo,
  sanitizeSchedule,
} from './protocolos';
import { coachFormularios } from './formularios';
import { defaultProtocol } from './protocol';

describe('protocolos · la mudanza silenciosa', () => {
  it('sin lista, el protocolo único de hoy ES la lista', () => {
    const lista = coachProtocolos({});
    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe(PROTOCOLO_GENERAL);
  });

  it('hereda la plantilla de protocolo y la de alta que ya tenía', () => {
    const prefs = {
      protocolTemplate: { modules: ['warmup'], questions: ['rpe'] },
      intakeTemplate: { steps: ['form', 'welcome'], custom: [], owners: {} },
    };
    const [p] = coachProtocolos(prefs);
    expect(p.modules).toEqual(['warmup']);
    expect(p.intake.steps).toEqual(['form', 'welcome']);
  });

  it('el heredado apunta ya a los tres cuestionarios', () => {
    const [p] = coachProtocolos({});
    const forms = coachFormularios({});
    expect(p.forms.alta).toBe(forms.find((f) => f.momento === 'alta').id);
    expect(p.forms.sesion).toBe('form_sesion');
    expect(p.forms.semana).toBe('form_semana');
  });

  it('el alta NO se pierde al sanear, aunque `clientProtocol` descarte lo que no conoce', () => {
    const items = [{ id: 'p1', name: 'X', intake: { steps: ['form', 'onboarding'], custom: [], owners: {} } }];
    const [p] = coachProtocolos({ protocolos: { items } });
    expect(p.intake.steps).toEqual(['form', 'onboarding']);
  });

  it('la lista se acota al tope y los rotos se caen', () => {
    const items = [
      ...Array.from({ length: MAX_PROTOCOLOS + 3 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
      { name: 'sin id' },
    ];
    expect(coachProtocolos({ protocolos: { items } })).toHaveLength(MAX_PROTOCOLOS);
  });

  it('guardar y volver a leer no pierde nada', () => {
    const lista = coachProtocolos({ protocolTemplate: { modules: ['warmup', 'rir'] } });
    const vuelta = coachProtocolos({ protocolos: protocolosToPreferences(lista) });
    expect(vuelta[0].modules).toEqual(lista[0].modules);
    expect(vuelta[0].forms).toEqual(lista[0].forms);
  });

  it('uno nuevo se puede sacar de otro, con id propio', () => {
    const [base] = coachProtocolos({ protocolTemplate: { modules: ['warmup'] } });
    const nuevo = buildProtocolo({ name: 'Powerlifting', desde: base });
    expect(nuevo.modules).toEqual(['warmup']);
    expect(nuevo.id).not.toBe(base.id);
    expect(nuevo.name).toBe('Powerlifting');
  });

  it('un id roto devuelve el primero: nadie se queda sin protocolo', () => {
    expect(protocoloById({}, 'no-existe').id).toBe(PROTOCOLO_GENERAL);
  });
});

describe('protocolos · quién lleva cuál', () => {
  const prefs = { protocolos: { items: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] } };

  it('sin marca, el cliente cuenta como del primero', () => {
    expect(clientProtocoloId({})).toBeNull();
    expect(protocoloDeCliente(prefs, { preferences: {} }).id).toBe('p1');
  });

  it('con marca, el suyo', () => {
    expect(protocoloDeCliente(prefs, { preferences: { protocolId: 'p2' } }).id).toBe('p2');
  });

  it('una marca a un protocolo borrado vuelve al primero', () => {
    expect(protocoloDeCliente(prefs, { preferences: { protocolId: 'zzz' } }).id).toBe('p1');
  });

  it('cuenta clientes por protocolo, y los huérfanos al primero', () => {
    const clients = [
      { preferences: { protocolId: 'p2' } },
      { preferences: { protocolId: 'p2' } },
      { preferences: {} },
      { preferences: { protocolId: 'borrado' } },
    ];
    expect(cuentaClientes(prefs, clients)).toEqual({ p1: 2, p2: 2 });
  });
});

describe('protocolos · el cuándo', () => {
  it('lo de siempre: lunes, cada semana, sin recordatorio', () => {
    expect(defaultSchedule()).toEqual({ weekday: 0, everyWeeks: 1, remindAfter: 0 });
  });

  it('se acota lo que venga escrito a mano', () => {
    expect(sanitizeSchedule({ weekday: 99, everyWeeks: 0, remindAfter: -3 })).toEqual({
      weekday: 6,
      everyWeeks: 1,
      remindAfter: 0,
    });
    expect(sanitizeSchedule(undefined)).toEqual(defaultSchedule());
  });

  /* ══ La forma vieja se lee, y no se vuelve a escribir ═══════════════════
     `day` iba de 1 a 7 y `every` se llamaba así: un protocolo guardado antes
     de que la cita se unificara tiene que seguir diciendo lo mismo, sin
     migración. Y en cuanto está la clave nueva, la vieja no puede ganarle:
     ahí es donde un residuo devolvería el día al lunes. */
  it('traduce el horario escrito con la forma vieja', () => {
    expect(sanitizeSchedule({ day: 4, every: 2, remindAfter: 1 })).toEqual({
      weekday: 3,
      everyWeeks: 2,
      remindAfter: 1,
    });
    expect(sanitizeSchedule({ day: 1, every: 1, weekday: 5, everyWeeks: 3 })).toEqual({
      weekday: 5,
      everyWeeks: 3,
      remindAfter: 0,
    });
  });

  it('se dice como se lee', () => {
    expect(diaDe({ weekday: 2 })).toBe('miércoles');
    expect(diaDe({ day: 3 })).toBe('miércoles');
    expect(cadaCuanto({ everyWeeks: 1 })).toBe('');
    expect(cadaCuanto({ everyWeeks: 4 })).toBe('cada 4 semanas');
  });

  /* ══ El protocolo propone, la ficha decide ═════════════════════════════
     Siembra al que no tiene día —que nacía sin revisión y sin cola— y no
     toca al que ya eligió el suyo. */
  it('siembra la cita solo a quien no tiene día', () => {
    expect(checkinDesdeHorario({ weekday: 3, everyWeeks: 2 }, null)).toEqual({
      weekday: 3,
      everyWeeks: 2,
    });
    expect(checkinDesdeHorario({ weekday: 3, everyWeeks: 2 }, { checkin: {} })).toEqual({
      weekday: 3,
      everyWeeks: 2,
    });
    expect(
      checkinDesdeHorario({ weekday: 3, everyWeeks: 2 }, { checkin: { weekday: 5, everyWeeks: 1 } })
    ).toBeNull();
    /* El lunes es 0, y 0 no puede leerse como «no tiene». */
    expect(
      checkinDesdeHorario({ weekday: 3, everyWeeks: 2 }, { checkin: { weekday: 0 } })
    ).toBeNull();
  });
});

describe('protocolos · la resolución', () => {
  const formularios = [
    { id: 'fa', momento: 'alta', name: 'Alta', asked: [], custom: [] },
    { id: 'fs', momento: 'sesion', name: 'Parte', questions: ['rpe', 'fatigue'], custom: [] },
    {
      id: 'fw',
      momento: 'semana',
      name: 'Semana',
      questions: ['adherence'],
      custom: [],
      checkin: { perimeters: 'required', folds: 'off' },
      weighIns: 2,
    },
  ];
  const protocolo = {
    ...defaultProtocol(),
    id: 'p1',
    name: 'X',
    forms: { alta: 'fa', sesion: 'fs', semana: 'fw' },
  };

  it('las preguntas del formulario caen donde el cliente sabe leerlas', () => {
    const r = resolveProtocolo(protocolo, formularios);
    expect(r.questions).toEqual(['rpe', 'fatigue']);
    expect(r.checkinQuestions).toEqual(['adherence']);
  });

  it('los bloques y los pesajes vienen del formulario de la semana', () => {
    const r = resolveProtocolo(protocolo, formularios);
    expect(r.checkin).toEqual({ perimeters: 'required', folds: 'off' });
    expect(r.weighIns).toBe(2);
  });

  it('sin formulario apuntado, se cae en lo que el protocolo lleve dentro', () => {
    const suelto = { ...protocolo, forms: { alta: null, sesion: null, semana: null }, questions: ['note'] };
    expect(resolveProtocolo(suelto, formularios).questions).toEqual(['note']);
  });

  it('un id que apunta a otro momento no cuela', () => {
    const cruzado = { ...protocolo, forms: { ...protocolo.forms, sesion: 'fw' }, questions: ['note'] };
    expect(resolveProtocolo(cruzado, formularios).questions).toEqual(['note']);
  });

  it('lo resuelto tiene la forma que el cliente ya sabe leer', () => {
    const r = resolveProtocolo(protocolo, formularios);
    expect(Object.keys(r).sort()).toEqual(Object.keys(defaultProtocol()).sort());
  });

  it('las preguntas propias de los dos formularios se juntan', () => {
    const conPropias = [
      formularios[0],
      { ...formularios[1], questions: ['q_a'], custom: [{ id: 'q_a', label: 'Mía', kind: 'scale', max: 10 }] },
      { ...formularios[2], questions: ['q_b'], custom: [{ id: 'q_b', label: 'Otra', kind: 'text' }] },
    ];
    const r = resolveProtocolo(protocolo, conPropias);
    expect(r.custom.map((q) => q.id).sort()).toEqual(['q_a', 'q_b']);
    expect(r.questions).toEqual(['q_a']);
    expect(r.checkinQuestions).toEqual(['q_b']);
  });

  it('el alta que le toca sale del protocolo, y hay respaldo', () => {
    expect(altaDe(protocolo, formularios).id).toBe('fa');
    expect(altaDe({ forms: {} }, formularios).id).toBe('fa');
    expect(altaDe({ forms: {} }, [])).toBeNull();
  });
});
