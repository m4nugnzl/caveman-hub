import { describe, expect, it } from 'vitest';

import { PROFILE_FIELDS } from './profile';
import {
  DEFAULT_ASKED,
  MAX_CUSTOM,
  MAX_FORMS,
  addCustom,
  buildIntakeForm,
  camposDelCapitulo,
  coachIntakeForm,
  coachIntakeForms,
  defaultIntakeForm,
  formProgress,
  formSections,
  intakeFormById,
  intakeFormsToPreferences,
  isFormEmpty,
  isRequired,
  missingRequired,
  moverEnCapitulo,
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

describe('preguntar quién es', () => {
  /* La otra parte que nace encendida: edad, altura y peso son los tres hechos
     que entran en todas las cuentas, y hasta ahora los tecleaba el entrenador de
     memoria o no estaban. */
  it('viene encendida de serie', () => {
    expect(defaultIntakeForm().askBasics).toBe(true);
    expect(coachIntakeForm({}).askBasics).toBe(true);
  });

  it('pero se puede apagar', () => {
    expect(coachIntakeForm({ intakeForm: { askBasics: false } }).askBasics).toBe(false);
  });

  /* No son campos del perfil: la edad y la altura son columnas de `clients` y el
     peso es una serie. Colarlas en `asked` las habría mandado a `clients.profile`,
     que es exactamente donde no pueden estar. */
  it('no entra en el catálogo de preguntas del perfil', () => {
    const form = coachIntakeForm({});
    expect(form.asked).not.toContain('age');
    expect(form.asked).not.toContain('heightCm');
    expect(form.asked).not.toContain('weight');
  });
});

describe('preguntar por su salud', () => {
  /* Una de las dos partes que nacen encendidas —la otra es `askBasics`—, contra
     la regla de «nada llega encendido» a propósito: sin ella esto no es una
     anamnesis. */
  it('viene encendida de serie', () => {
    expect(defaultIntakeForm().askHealth).toBe(true);
    expect(coachIntakeForm({}).askHealth).toBe(true);
  });

  it('pero se puede apagar', () => {
    expect(coachIntakeForm({ intakeForm: { askHealth: false } }).askHealth).toBe(false);
  });
});

/* ══ Varias altas, una por tipo de cliente (D14) ══════════════════════════ */

describe('coachIntakeForms — la lista de altas', () => {
  it('sin lista, el formulario único de siempre ES la lista', () => {
    const lista = coachIntakeForms({ intakeForm: { asked: ['experience'] } });
    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe('form_general');
    expect(lista[0].name).toBe('Alta');
    expect(lista[0].asked).toEqual(['experience']);
  });

  it('con lista, manda la lista y cada una se sanea como el de siempre', () => {
    const prefs = {
      intakeForm: { asked: ['experience'] },
      intakeForms: {
        items: [
          { id: 'f1', name: '  Pérdida de grasa  ', asked: ['mealsPerDay', 'campo-que-no-existe'] },
          { id: 'f2', name: '', asked: [] },
          null,
          { name: 'sin id' },
        ],
      },
    };
    const lista = coachIntakeForms(prefs);
    expect(lista.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(lista[0].name).toBe('Pérdida de grasa');
    expect(lista[0].asked).toEqual(['mealsPerDay']);
    expect(lista[1].name).toBe('Alta');
  });

  it('corta en el tope', () => {
    const items = Array.from({ length: MAX_FORMS + 3 }, (_, i) => ({ id: `f${i}`, name: `Alta ${i}` }));
    expect(coachIntakeForms({ intakeForms: { items } })).toHaveLength(MAX_FORMS);
  });
});

describe('intakeFormById — la elegida al invitar', () => {
  const prefs = {
    intakeForms: {
      items: [
        { id: 'f1', name: 'Pérdida de grasa' },
        { id: 'f2', name: 'Fuerza', asked: ['experience'] },
      ],
    },
  };

  it('encuentra la pedida', () => {
    expect(intakeFormById(prefs, 'f2').name).toBe('Fuerza');
  });

  it('con un id roto o sin id cae en la primera: nadie se queda sin alta', () => {
    expect(intakeFormById(prefs, 'no-existe').id).toBe('f1');
    expect(intakeFormById(prefs, null).id).toBe('f1');
    expect(intakeFormById({}, null).id).toBe('form_general');
  });
});

describe('buildIntakeForm e intakeFormsToPreferences', () => {
  it('una alta nueva nace con las preguntas de serie y su nombre', () => {
    const nueva = buildIntakeForm({ name: 'Fuerza' });
    expect(nueva.name).toBe('Fuerza');
    expect(nueva.asked).toEqual(DEFAULT_ASKED);
    expect(nueva.id).toBeTruthy();
  });

  it('lo guardado pasa por el mismo saneo que lo leído', () => {
    const { items } = intakeFormsToPreferences([
      buildIntakeForm({ name: 'Fuerza' }),
      { id: 'x', name: 'Rota', asked: ['no-existe'] },
    ]);
    expect(items).toHaveLength(2);
    expect(items[1].asked).toEqual([]);
  });
});

describe('el orden del alta', () => {
  const ids = (form, g) => camposDelCapitulo(form, g).map((f) => f.id);

  it('sin haber movido nada, manda el catálogo y no el orden de asked', () => {
    /* DEFAULT_ASKED empieza por los días y no por la experiencia: leerlo tal
       cual habría reordenado el alta de todos los clientes de golpe. */
    const form = coachIntakeForm({ intakeForm: { asked: ['sleepHours', 'experience'] } });
    expect(ids(form, 'training')).toEqual(['experience', 'sleepHours']);
    expect(form.ordenPropio).toBeUndefined();
  });

  it('arrastrar mueve dentro del capítulo, enciende el orden propio y sobrevive al guardado', () => {
    const form = { asked: ['experience', 'daysAvailable', 'sleepHours', 'mealsPerDay'], custom: [] };
    const movido = moverEnCapitulo(form, 'training', 2, 0);
    expect(ids(movido, 'training')).toEqual(['sleepHours', 'experience', 'daysAvailable']);
    expect(ids(movido, 'nutrition')).toEqual(['mealsPerDay']);

    const guardado = coachIntakeForm({ intakeForm: movido });
    expect(guardado.ordenPropio).toBe(true);
    expect(formSections(guardado)[0].fields.map((f) => f.id)).toEqual([
      'sleepHours',
      'experience',
      'daysAvailable',
    ]);
  });

  it('las propias se mueven entre ellas', () => {
    const form = {
      asked: [],
      custom: [
        { id: 'a', label: 'A', kind: 'text' },
        { id: 'b', label: 'B', kind: 'text' },
      ],
    };
    expect(moverEnCapitulo(form, 'custom', 1, 0).custom.map((q) => q.id)).toEqual(['b', 'a']);
  });
});
