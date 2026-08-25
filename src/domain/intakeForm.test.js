import { describe, expect, it } from 'vitest';

import { PROFILE_FIELDS } from './profile';
import {
  DEFAULT_ASKED,
  MAX_CUSTOM,
  addCustom,
  coachIntakeForm,
  defaultIntakeForm,
  formProgress,
  formSections,
  isFormEmpty,
  isRequired,
  missingRequired,
  removeCustom,
  toggleAsked,
  toggleRequired,
} from './intakeForm';

/**
 * ══ Lo que estas pruebas defienden ══════════════════════════════════════════
 *
 * Que el formulario no pregunte nada que no se pueda guardar. Es el fallo propio
 * de este diseño y el peor de todos los posibles aquí: un cliente contesta doce
 * preguntas en el móvil, pulsa guardar, y una de ellas se cae en silencio porque
 * su campo ya no existe en el catálogo. No hay error, no hay hueco, y quien la
 * escribió da por hecho que su entrenador la ha leído.
 */

describe('coachIntakeForm', () => {
  it('quien no ha tocado nada tiene el formulario por defecto', () => {
    expect(coachIntakeForm(undefined)).toEqual(defaultIntakeForm());
    expect(coachIntakeForm({}).asked).toEqual(DEFAULT_ASKED);
  });

  /* Todo lo que se pregunta por defecto tiene que EXISTIR. Un id mal escrito
     aquí no rompe nada: simplemente esa pregunta no sale, y nadie se entera. */
  it('las preguntas por defecto existen todas en el catálogo', () => {
    const validos = new Set(PROFILE_FIELDS.map((f) => f.id));
    for (const id of DEFAULT_ASKED) {
      expect(validos.has(id), `«${id}» no está en el catálogo del perfil`).toBe(true);
    }
  });

  /* El caso de la cabecera: retirar un campo del perfil tiene que retirar su
     pregunta, no dejarla preguntando al vacío. */
  it('descarta las preguntas cuyo campo ya no existe', () => {
    const form = coachIntakeForm({ intakeForm: { asked: ['sleepHours', 'campoQueSeRetiro'] } });
    expect(form.asked).toEqual(['sleepHours']);
  });

  it('no repite una pregunta aunque venga dos veces', () => {
    const form = coachIntakeForm({ intakeForm: { asked: ['sleepHours', 'sleepHours'] } });
    expect(form.asked).toEqual(['sleepHours']);
  });

  it('una pregunta propia sin etiqueta o sin id no cuenta', () => {
    const form = coachIntakeForm({
      intakeForm: { asked: [], custom: [{ id: 'a', label: '  ' }, { label: 'Sin id' }, { id: 'b', label: 'Vale' }] },
    });
    expect(form.custom.map((q) => q.id)).toEqual(['b']);
  });

  it('una clase de pregunta desconocida cae en texto', () => {
    const form = coachIntakeForm({ intakeForm: { custom: [{ id: 'a', label: 'X', kind: 'video' }] } });
    expect(form.custom[0].kind).toBe('text');
  });

  it('corta por el tope de preguntas propias', () => {
    const muchas = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, label: `P${i}` }));
    expect(coachIntakeForm({ intakeForm: { custom: muchas } }).custom).toHaveLength(MAX_CUSTOM);
  });
});

describe('formSections', () => {
  it('agrupa por las mismas tandas que la ficha y en su orden', () => {
    const form = { asked: ['mealsPerDay', 'sleepHours'], custom: [] };
    expect(formSections(form).map((s) => s.id)).toEqual(['training', 'nutrition']);
  });

  it('una tanda sin preguntas no se pinta', () => {
    const form = { asked: ['mealsPerDay'], custom: [] };
    expect(formSections(form).map((s) => s.id)).toEqual(['nutrition']);
  });

  it('las propias van al final y en su propia tanda', () => {
    const form = { asked: ['sleepHours'], custom: [{ id: 'a', label: 'X', kind: 'text' }] };
    const tandas = formSections(form);
    expect(tandas[tandas.length - 1].id).toBe('custom');
    expect(tandas[tandas.length - 1].fields[0].custom).toBe(true);
  });

  it('sin nada que preguntar no hay secciones', () => {
    expect(formSections({ asked: [], custom: [] })).toEqual([]);
    expect(isFormEmpty({ asked: [], custom: [] })).toBe(true);
    expect(isFormEmpty(defaultIntakeForm())).toBe(false);
  });
});

describe('formProgress', () => {
  const form = { asked: ['sleepHours', 'mealsPerDay'], custom: [{ id: 'ask-1', label: 'X', kind: 'text' }] };

  it('cuenta sobre lo PREGUNTADO, no sobre el catálogo entero', () => {
    /* Si contara los diecinueve campos, un alta con las tres cosas que pides
       contestadas seguiría diciendo «3 de 19» y no llegaría nunca al final. */
    expect(formProgress(form, {}).total).toBe(3);
  });

  it('suma las del catálogo y las propias', () => {
    const profile = { sleepHours: 7, custom: { 'ask-1': 'contestada' } };
    expect(formProgress(form, profile)).toEqual({ done: 2, total: 3, missing: [] });
  });

  it('lo vacío no cuenta como contestado', () => {
    expect(formProgress(form, { sleepHours: '', custom: { 'ask-1': '' } }).done).toBe(0);
  });

  /* Un «no» ES una respuesta. Si contara como hueco, el alta de quien contesta
     que no a todo no se daría nunca por terminada. */
  it('un «no» cuenta como contestado', () => {
    const soloSino = { asked: ['coachedBefore'], custom: [] };
    expect(formProgress(soloSino, { coachedBefore: false })).toEqual({
      done: 1,
      total: 1,
      missing: [],
    });
  });
});

describe('editar el formulario', () => {
  it('encender y apagar una pregunta', () => {
    const form = { asked: ['sleepHours'], custom: [] };
    expect(toggleAsked(form, 'sleepHours').asked).toEqual([]);
    expect(toggleAsked(form, 'mealsPerDay').asked).toEqual(['sleepHours', 'mealsPerDay']);
  });

  it('no se puede encender algo que no existe', () => {
    const form = { asked: [], custom: [] };
    expect(toggleAsked(form, 'inventado')).toBe(form);
  });

  /*
    El id NO sale de la etiqueta. Si saliera, corregir una falta de ortografía en
    la pregunta cambiaría su id y dejaría huérfanas las respuestas ya dadas en la
    ficha de todo el mundo.
  */
  it('dos preguntas con el mismo texto son dos preguntas distintas', () => {
    let form = addCustom({ asked: [], custom: [] }, { label: '¿Fumas?' });
    form = addCustom(form, { label: '¿Fumas?' });
    expect(form.custom).toHaveLength(2);
    expect(form.custom[0].id).not.toBe(form.custom[1].id);
  });

  it('una pregunta propia sin texto no se añade', () => {
    const form = { asked: [], custom: [] };
    expect(addCustom(form, { label: '   ' })).toBe(form);
  });

  it('no se pasa del tope', () => {
    let form = { asked: [], custom: [] };
    for (let i = 0; i < MAX_CUSTOM + 3; i += 1) form = addCustom(form, { label: `P${i}` });
    expect(form.custom).toHaveLength(MAX_CUSTOM);
  });

  it('quitar una propia deja las demás', () => {
    let form = addCustom({ asked: [], custom: [] }, { label: 'A' });
    form = addCustom(form, { label: 'B' });
    const quitada = removeCustom(form, form.custom[0].id);
    expect(quitada.custom.map((q) => q.label)).toEqual(['B']);
  });
});

describe('lo obligatorio', () => {
  const form = coachIntakeForm({
    intakeForm: { asked: ['sleepHours', 'mealsPerDay'], required: ['sleepHours'] },
  });

  it('nombra lo que falta, no solo dice que falta', () => {
    /* «Te falta algo obligatorio» sin decir qué es una pantalla que no se puede
       obedecer. */
    const falta = missingRequired(form, {});
    expect(falta).toHaveLength(1);
    expect(falta[0].label).toBeTruthy();
  });

  it('contestada deja de faltar', () => {
    expect(missingRequired(form, { sleepHours: 7 })).toEqual([]);
  });

  /* Marcarla obligatoria en algo que no se pregunta dejaría el alta bloqueada
     por una pregunta que nadie ve. */
  it('no se puede exigir algo que no se pregunta', () => {
    const raro = coachIntakeForm({ intakeForm: { asked: ['sleepHours'], required: ['mealsPerDay'] } });
    expect(raro.required).toEqual([]);
  });

  it('también vale para las preguntas propias', () => {
    const conPropia = coachIntakeForm({
      intakeForm: { asked: [], custom: [{ id: 'q1', label: '¿Fumas?' }], required: ['q1'] },
    });
    expect(missingRequired(conPropia, {})[0].label).toBe('¿Fumas?');
    expect(missingRequired(conPropia, { custom: { q1: 'No' } })).toEqual([]);
  });

  /*
    ══ Obligatorio NO significa «no puedes guardar» ═══════════════════════════

    Significa «sin esto no empezamos». Un formulario que no deja guardar sin
    completarlo se abandona en la tercera pregunta y no llega nada; éste guarda
    lo que haya y lo que no cuenta como terminado es el ALTA.
  */
  it('lo que falta no impide que cuente lo contestado', () => {
    const progreso = formProgress(form, { mealsPerDay: 4 });
    expect(progreso.done).toBe(1);
    expect(progreso.missing).toHaveLength(1);
  });

  it('encender una pregunta y exigirla son dos gestos', () => {
    const base = { asked: ['sleepHours'], custom: [], required: [] };
    expect(isRequired(base, 'sleepHours')).toBe(false);
    expect(toggleRequired(base, 'sleepHours').required).toEqual(['sleepHours']);
    expect(toggleRequired(toggleRequired(base, 'sleepHours'), 'sleepHours').required).toEqual([]);
  });
});

describe('preguntar por su salud', () => {
  /* La única parte que nace encendida, y va contra la regla de «nada llega
     encendido» a propósito: sin ella esto no es una anamnesis. */
  it('viene encendida de serie', () => {
    expect(defaultIntakeForm().askHealth).toBe(true);
    expect(coachIntakeForm({}).askHealth).toBe(true);
  });

  it('pero se puede apagar', () => {
    expect(coachIntakeForm({ intakeForm: { askHealth: false } }).askHealth).toBe(false);
  });
});
