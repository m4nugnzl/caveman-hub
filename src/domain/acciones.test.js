import { describe, expect, it } from 'vitest';

import {
  PREMISAS,
  QUE_CATALOGO,
  accionesDe,
  anadirAccion,
  cuentaAcciones,
  diaDelCheckin,
  loQueLeHasMandado,
  porPremisa,
  premisasDe,
  quitarAccion,
  queById,
} from './acciones';
import { coachFormularios } from './formularios';
import { coachProtocolos } from './protocolos';
import { addCustomStep, clientIntake } from './intake';
import { isModuleOn } from './protocol';

/** El plan de un entrenador que no ha tocado nada: lo que la app hace hoy. */
const planDeSerie = (prefs = {}) => ({
  protocolo: coachProtocolos(prefs)[0],
  formularios: coachFormularios(prefs),
});

describe('acciones · la línea sale del dato de hoy', () => {
  it('un protocolo de serie ya tiene línea, sin haber guardado nada nuevo', () => {
    const acciones = accionesDe(planDeSerie());
    expect(acciones.length).toBeGreaterThan(0);
    expect(acciones.every((a) => a.id && a.verbo && a.suj)).toBe(true);
  });

  it('los pasos del alta son acciones con premisa «al entrar»', () => {
    const acciones = accionesDe(planDeSerie());
    const entrar = acciones.filter((a) => a.premisa === 'entrar');
    // Los cuatro de `defaultIntake`: form, gymPhotos, onboarding, postureReview
    expect(entrar.map((a) => a.stepId)).toEqual(['form', 'gymPhotos', 'onboarding', 'postureReview']);
  });

  it('el paso del cuestionario toma el NOMBRE del formulario de alta apuntado', () => {
    const prefs = { intakeForms: { items: [{ id: 'a', name: 'Pérdida de grasa' }] } };
    const alta = accionesDe(planDeSerie(prefs)).find((a) => a.stepId === 'form');
    expect(alta.suj).toBe('Pérdida de grasa');
    expect(alta.tipo).toBe('form');
    expect(alta.formId).toBe('a');
  });

  it('el verbo sale del dueño del paso, y «dar» de que entregue algo', () => {
    const acciones = accionesDe(planDeSerie());
    expect(acciones.find((a) => a.stepId === 'form').verbo).toBe('Pídele');
    expect(acciones.find((a) => a.stepId === 'gymPhotos').verbo).toBe('Pídele');
    expect(acciones.find((a) => a.stepId === 'postureReview').verbo).toBe('Dale');
    expect(acciones.find((a) => a.stepId === 'onboarding').verbo).toBe('Haz tú');
  });

  it('el parte solo aparece si el módulo está encendido', () => {
    const conFeedback = planDeSerie();
    expect(accionesDe(conFeedback).some((a) => a.id === 'form:sesion')).toBe(true);

    const sinFeedback = planDeSerie({ protocolTemplate: { modules: [] } });
    expect(accionesDe(sinFeedback).some((a) => a.id === 'form:sesion')).toBe(false);
  });

  it('cada semana pasa UNA cosa: se le pide su check-in, con sus piezas dentro', () => {
    const plan = planDeSerie({
      protocolTemplate: {
        weighIns: 3,
        checkin: { perimeters: 'required', folds: 'off' },
        checkinQuestions: ['adherence'],
      },
    });
    const semana = accionesDe(plan).filter((a) => a.premisa === 'semana');
    /* Una, y no cuatro: el peso, los bloques y las preguntas son campos del
       MISMO formulario, así que se leen de él y se enseñan juntos. */
    expect(semana.map((a) => a.id)).toEqual(['form:semana']);

    const checkin = semana[0];
    expect(checkin.formId).toBe(plan.protocolo.forms.semana);
    expect(checkin.lleva).toBe('1 pregunta');
    /* Las fotos salen de serie: es lo que la aplicación hacía antes de que se
       pudieran apagar (ver `askPhotos` en `defaultProtocol`). */
    expect(checkin.piezas.map((p) => p.id)).toEqual(['peso', 'perimeters', 'fotos']);
    expect(checkin.piezas.find((p) => p.id === 'peso').lleva).toBe('3 a la semana');
    expect(checkin.piezas.find((p) => p.id === 'perimeters').lleva).toBe('obligatorio');
    /* Y la fila dice lo que se mide sin tener que abrirla. */
    expect(checkin.dice).toBe('su peso, sus perímetros y sus fotos');
  });

  it('sin pesajes pedidos no hay pieza de peso: la lista vacía es el apagado', () => {
    const plan = planDeSerie({ protocolTemplate: { weighIns: 0 } });
    const checkin = accionesDe(plan).find((a) => a.id === 'form:semana');
    expect(checkin.piezas.some((p) => p.id === 'peso')).toBe(false);
  });

  it('las varas de aviso son acciones con premisa «silencio»', () => {
    const plan = planDeSerie();
    plan.protocolo = { ...plan.protocolo, alertDays: { training: 12, weight: 0 } };
    const avisos = accionesDe(plan).filter((a) => a.premisa === 'silencio');
    expect(avisos).toHaveLength(1);
    expect(avisos[0].id).toBe('alert:training');
    expect(avisos[0].lleva).toBe('12 días');
  });

  it('el recordatorio no existe hasta que se pide', () => {
    const plan = planDeSerie();
    expect(accionesDe(plan).some((a) => a.id === 'recordatorio')).toBe(false);

    plan.protocolo = { ...plan.protocolo, schedule: { day: 1, every: 1, remindAfter: 2 } };
    const r = accionesDe(plan).find((a) => a.id === 'recordatorio');
    expect(r.verbo).toBe('Recuérdaselo');
    expect(r.quien).toBe('app');
  });

  it('cada acción trae su familia de disco', () => {
    const plan = planDeSerie({ protocolTemplate: { weighIns: 1 } });
    const acciones = accionesDe(plan);
    expect(acciones.find((a) => a.id === 'form:semana').familia).toBe('form');
    expect(acciones.find((a) => a.id === 'form:sesion').familia).toBe('form');
    expect(acciones.find((a) => a.stepId === 'postureReview').familia).toBe('entrega');
  });

  it('los ids son estables entre lecturas', () => {
    const plan = planDeSerie();
    expect(accionesDe(plan).map((a) => a.id)).toEqual(accionesDe(plan).map((a) => a.id));
  });

  it('se agrupan por premisa y las vacías no se pintan', () => {
    const grupos = porPremisa(accionesDe(planDeSerie()));
    expect(grupos.every((g) => g.acciones.length > 0)).toBe(true);
    /* «Cada semana» SÍ sale de serie: hay formulario de la semana, y sus dos
       bloques nacen en «opcional» —lo que la aplicación hacía antes de que esto
       se pudiera configurar—. «Si pasa demasiado tiempo» no sale, porque las
       varas nacen en 0. */
    expect(grupos.map((g) => g.id)).toEqual(['entrar', 'sesion', 'semana']);
    expect(grupos.find((g) => g.id === 'semana').acciones.map((a) => a.id)).toEqual(['form:semana']);
  });

  it('sin protocolo, la línea está vacía y no revienta', () => {
    expect(accionesDe({ protocolo: null, formularios: [] })).toEqual([]);
    expect(cuentaAcciones({ protocolo: null })).toBe(0);
  });

  it('el día del check-in es lunes mientras nadie diga otra cosa', () => {
    expect(diaDelCheckin({})).toBe('lunes');
    expect(diaDelCheckin({ schedule: { day: 6 } })).toBe('sábado');
  });
});

describe('acciones · añadir', () => {
  it('las piezas del check-in NO se añaden desde el protocolo: son del formulario', () => {
    const plan = planDeSerie({
      protocolTemplate: { weighIns: 0, checkin: { perimeters: 'off', folds: 'off' } },
    });
    /*
      El catálogo del protocolo no las ofrece, y pedirlas a mano no hace nada.
      Su mando vive en los enchufes del formulario de la semana, que ya traen
      los pesajes y el obligatorio/opcional. Dos interruptores para el mismo
      campo es lo que había antes.
    */
    for (const que of ['peso', 'perimeters', 'folds', 'fotos']) {
      expect(queById(que)).toBe(null);
      expect(anadirAccion(plan, { que, premisa: 'semana' })).toBe(plan);
    }
  });

  it('pedir el parte ENCIENDE el módulo: si no, la fila mentiría', () => {
    const plan = planDeSerie({ protocolTemplate: { modules: [] } });
    const nuevo = anadirAccion(plan, { que: 'form', premisa: 'sesion', formId: 'form_sesion' });
    expect(isModuleOn(nuevo.protocolo, 'sessionFeedback')).toBe(true);
    expect(accionesDe(nuevo).some((a) => a.id === 'form:sesion')).toBe(true);
  });

  it('las fotos se leen del formulario, y salen como pieza del check-in', () => {
    const plan = planDeSerie();
    const conFotos = {
      ...plan,
      formularios: plan.formularios.map((f) =>
        f.momento === 'semana' ? { ...f, askPhotos: true } : f
      ),
    };
    const checkin = accionesDe(conFotos).find((a) => a.id === 'form:semana');
    expect(checkin.piezas.some((p) => p.id === 'fotos')).toBe(true);
  });

  it('avisar usa la vara general de 10 días, no un número inventado', () => {
    const nuevo = anadirAccion(planDeSerie(), { que: 'alert:training', premisa: 'silencio' });
    expect(accionesDe(nuevo).find((a) => a.id === 'alert:training').lleva).toBe('10 días');
  });

  it('el recordatorio entra en 1 día', () => {
    const nuevo = anadirAccion(planDeSerie(), { que: 'recordar', premisa: 'semana' });
    expect(nuevo.protocolo.schedule.remindAfter).toBe(1);
  });

  it('un vídeo cae en el paso del catálogo que le corresponde', () => {
    const plan = planDeSerie({ intakeTemplate: { steps: ['form'], custom: [], owners: {} } });
    const nuevo = anadirAccion(plan, { que: 'video', premisa: 'entrar' });
    expect(nuevo.protocolo.intake.steps).toContain('welcome');
  });

  it('una casilla propia entra como paso propio con su texto', () => {
    const nuevo = anadirAccion(planDeSerie(), { que: 'tarea', premisa: 'entrar', label: 'Prueba de fuerza' });
    expect(nuevo.protocolo.intake.custom.map((c) => c.label)).toContain('Prueba de fuerza');
    expect(accionesDe(nuevo).some((a) => a.suj === 'Prueba de fuerza')).toBe(true);
  });

  it('una premisa que no cabe no hace nada', () => {
    const plan = planDeSerie();
    expect(anadirAccion(plan, { que: 'folds', premisa: 'sesion' })).toBe(plan);
    expect(anadirAccion(plan, { que: 'inventado', premisa: 'entrar' })).toBe(plan);
  });

  it('el catálogo declara en qué premisas cabe cada cosa', () => {
    expect(premisasDe('archivo').map((p) => p.id)).toEqual(['entrar', 'mandada']);
    expect(premisasDe('form').map((p) => p.id)).toEqual(['entrar', 'sesion', 'semana', 'mandada']);
    expect(premisasDe('no-existe')).toEqual([]);
    expect(queById('video').hace).toBe('dar');
  });

  it('todo lo del catálogo apunta a premisas que existen', () => {
    const ids = PREMISAS.map((p) => p.id);
    for (const grupo of QUE_CATALOGO) {
      for (const item of grupo.items) {
        expect(item.premisas.length).toBeGreaterThan(0);
        expect(item.premisas.every((p) => ids.includes(p))).toBe(true);
      }
    }
  });
});

describe('acciones · quitar no destruye', () => {
  it('quitar el check-in lo quita de verdad, y el formulario se queda entero', () => {
    const plan = planDeSerie({ protocolTemplate: { weighIns: 3 } });
    const checkin = accionesDe(plan).find((a) => a.id === 'form:semana');
    const nuevo = quitarAccion(plan, checkin);

    /* Ya no le pasa nada cada semana. Sin apagar el respaldo del protocolo, la
       acción reaparecía leyendo una copia que no edita nadie. */
    expect(accionesDe(nuevo).filter((a) => a.premisa === 'semana')).toEqual([]);

    /* Pero el formulario sigue en su cajón con sus pesajes puestos: volver a
       apuntarlo devuelve lo que tenía. */
    const form = nuevo.formularios.find((f) => f.momento === 'semana');
    expect(form.weighIns).toBe(3);
  });

  it('quitar el parte apaga el módulo pero CONSERVA el formulario apuntado', () => {
    const plan = planDeSerie();
    const parte = accionesDe(plan).find((a) => a.id === 'form:sesion');
    const nuevo = quitarAccion(plan, parte);
    expect(isModuleOn(nuevo.protocolo, 'sessionFeedback')).toBe(false);
    expect(nuevo.protocolo.forms.sesion).toBe(plan.protocolo.forms.sesion);
  });

  it('quitar un formulario del protocolo NO borra el formulario', () => {
    const plan = planDeSerie({ protocolTemplate: { checkinQuestions: ['adherence'] } });
    const semana = accionesDe(plan).find((a) => a.id === 'form:semana');
    const nuevo = quitarAccion(plan, semana);
    expect(nuevo.protocolo.forms.semana).toBeNull();
    expect(nuevo.formularios.some((f) => f.momento === 'semana')).toBe(true);
  });

  it('quitar un paso del catálogo lo apaga; quitar uno propio lo borra', () => {
    const conPropio = anadirAccion(planDeSerie(), { que: 'tarea', premisa: 'entrar', label: 'Mía' });
    const propia = accionesDe(conPropio).find((a) => a.suj === 'Mía');
    const sinPropia = quitarAccion(conPropio, propia);
    expect(sinPropia.protocolo.intake.custom).toHaveLength(0);

    const onboarding = accionesDe(conPropio).find((a) => a.stepId === 'onboarding');
    const sinPaso = quitarAccion(conPropio, onboarding);
    expect(sinPaso.protocolo.intake.steps).not.toContain('onboarding');
  });

  it('quitar una acción que no existe deja el plan como estaba', () => {
    const plan = planDeSerie();
    expect(quitarAccion(plan, null)).toBe(plan);
    expect(quitarAccion(plan, { id: 'zzz' })).toBe(plan);
  });

  it('añadir y quitar deja la línea como estaba', () => {
    const plan = planDeSerie({ protocolTemplate: { weighIns: 0 } });
    const antes = accionesDe(plan).map((a) => a.id);
    const conPeso = anadirAccion(plan, { que: 'peso', premisa: 'semana' });
    const quitado = quitarAccion(conPeso, accionesDe(conPeso).find((a) => a.id === 'weighins'));
    expect(accionesDe(quitado).map((a) => a.id)).toEqual(antes);
  });
});

/*
  ══ Lo que se le ha mandado a una persona, de las dos épocas ════════════════

  Aquí se probaba `mandarleAlgo`, la primitiva que escribía un paso propio en el
  ALTA del cliente. Se retiró con la tanda 2 y con ella tres efectos que nadie
  relacionaba con haber mandado un vídeo: que le reabriera el alta, que lo que se
  le PEDÍA no lo viera nadie —un paso propio nace del lado del entrenador—, y que
  cada envío declarase excepción de protocolo sobre esa persona.

  Lo escrito no se migra, así que lo que queda por probar es el PUENTE: que la
  ficha lea las dos épocas como una sola lista.
*/
describe('acciones · lo que le has mandado', () => {
  const intakeConPasos = () => {
    let intake = clientIntake({});
    intake = addCustomStep(intake, 'paso_1', 'Mándame el vídeo de tu sentadilla');
    intake = addCustomStep(intake, 'paso_2', 'La guía de la dieta');
    return { ...intake, links: { paso_2: 'https://x.test/guia' }, done: ['paso_2'] };
  };

  it('junta la tabla y los pasos viejos en una sola lista', () => {
    const lista = loQueLeHasMandado({
      intake: intakeConPasos(),
      filas: [
        { id: 'a1', tipo: 'video', title: 'Cómo grabar tus series', sent_at: '2026-09-05T10:00:00Z', link: 'https://x.test/v' },
      ],
    });
    expect(lista.map((x) => x.title)).toEqual([
      'Cómo grabar tus series',
      'Mándame el vídeo de tu sentadilla',
      'La guía de la dieta',
    ]);
    expect(lista.map((x) => x.de)).toEqual(['accion', 'paso', 'paso']);
  });

  it('el estado se lee de donde viva cada uno', () => {
    const lista = loQueLeHasMandado({
      intake: intakeConPasos(),
      filas: [
        { id: 'a1', tipo: 'form', title: 'Sueño', sent_at: '2026-09-05T10:00:00Z', submitted_at: '2026-09-06T10:00:00Z' },
      ],
    });
    const por = (t) => lista.find((x) => x.title === t);
    expect(por('Sueño').hecha).toBe(true);
    /* El viejo: su casilla en las preferencias, la que solo marcaba el
       entrenador. */
    expect(por('La guía de la dieta').hecha).toBe(true);
    expect(por('Mándame el vídeo de tu sentadilla').hecha).toBe(false);
  });

  it('un paso viejo con enlace era algo que le dabas; sin enlace, algo que le pedías', () => {
    const lista = loQueLeHasMandado({ intake: intakeConPasos(), filas: [] });
    const por = (t) => lista.find((x) => x.title === t);
    expect(por('La guía de la dieta').tipo).toBe('documento');
    expect(por('Mándame el vídeo de tu sentadilla').tipo).toBe('pide');
  });

  it('sin nada de ninguna de las dos épocas, la lista está vacía', () => {
    expect(loQueLeHasMandado({ intake: clientIntake({}), filas: [] })).toEqual([]);
  });
});
