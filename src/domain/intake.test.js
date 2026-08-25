import { describe, expect, it } from 'vitest';

import {
  MAX_CUSTOM_STEPS,
  addCustomStep,
  clientIntake,
  defaultIntake,
  intakeDeliverables,
  intakeProgress,
  intakeSteps,
  intakeToPreferences,
  markStep,
  clientSteps,
  coachSteps,
  moveStep,
  setStepOwner,
  removeCustomStep,
  safeLink,
  setStepFile,
  setStepLink,
  stepById,
  stepDone,
  stepFile,
  stepLink,
  toggleStep,
} from './intake';

/** Preferencias de un cliente con esta configuración de alta. */
const prefs = (intake) => ({ intake });

describe('safeLink', () => {
  it('deja pasar http y https', () => {
    expect(safeLink('https://youtu.be/abc')).toBe('https://youtu.be/abc');
    expect(safeLink('http://ejemplo.com/x')).toBe('http://ejemplo.com/x');
  });

  /* El enlace lo escribe el entrenador y lo pulsa el CLIENTE: un `javascript:`
     aquí ejecutaría código en la sesión de otra persona. */
  it('bloquea los esquemas que ejecutan código', () => {
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('JavaScript:alert(1)')).toBeNull();
    expect(safeLink('data:text/html,<script>')).toBeNull();
    expect(safeLink('vbscript:msgbox')).toBeNull();
  });

  it('devuelve null con basura y con vacío', () => {
    expect(safeLink('no soy una url')).toBeNull();
    expect(safeLink('')).toBeNull();
    expect(safeLink(null)).toBeNull();
    expect(safeLink(undefined)).toBeNull();
  });
});

describe('clientIntake', () => {
  it('sin preferencias devuelve los pasos de serie', () => {
    expect(clientIntake(undefined).steps).toEqual(['form', 'gymPhotos', 'onboarding', 'postureReview']);
    expect(clientIntake({}).steps).toEqual(defaultIntake().steps);
    expect(clientIntake({ protocol: { modules: [] } }).steps).toEqual(defaultIntake().steps);
  });

  it('descarta ids que no existen en vez de romperse', () => {
    expect(clientIntake(prefs({ steps: ['goals', 'inventado'] })).steps).toEqual(['goals']);
  });

  it('no deja marcado un paso que ya no está encendido', () => {
    const intake = clientIntake(prefs({ steps: ['goals'], done: ['goals', 'payment'] }));
    expect(intake.done).toEqual(['goals']);
  });

  it('sanea los enlaces al leerlos, no solo al escribirlos', () => {
    const intake = clientIntake(
      prefs({
        steps: ['welcome', 'goals'],
        links: { welcome: 'javascript:alert(1)', goals: 'https://ok.com/' },
      })
    );
    expect(intake.links.welcome).toBeUndefined();
    expect(intake.links.goals).toBe('https://ok.com/');
  });

  it('ignora un paso propio que choque con el catálogo', () => {
    const intake = clientIntake(prefs({ steps: ['goals'], custom: [{ id: 'goals', label: 'El mío' }] }));
    expect(intake.custom).toEqual([]);
    expect(stepById(intake, 'goals').label).toBe('Objetivos acordados');
  });
});

describe('estado de un paso', () => {
  const conColumna = stepById(defaultIntake(), 'onboarding');
  const sinColumna = stepById(defaultIntake(), 'goals');

  /* Los dos pasos viejos siguen leyendo su columna de `clients`: si esto se
     rompe, todos los clientes que ya existen aparecen sin hacer. */
  it('los pasos con columna leen del cliente', () => {
    const intake = defaultIntake();
    expect(stepDone(conColumna, { onboardingComplete: true }, intake)).toBe(true);
    expect(stepDone(conColumna, { onboardingComplete: false }, intake)).toBe(false);
  });

  it('el resto lee de las preferencias', () => {
    const intake = { ...defaultIntake(), steps: ['goals'], done: ['goals'] };
    expect(stepDone(sinColumna, {}, intake)).toBe(true);
    expect(stepDone(sinColumna, {}, { ...intake, done: [] })).toBe(false);
  });

  it('markStep manda a la columna o a las preferencias según el paso', () => {
    const intake = clientIntake(prefs({ steps: ['onboarding', 'goals'] }));

    const conCol = markStep(intake, conColumna, true);
    expect(conCol.fields).toEqual({ onboardingComplete: true });
    expect(conCol.intake.done).toEqual([]);

    const sinCol = markStep(intake, sinColumna, true);
    expect(sinCol.fields).toBeNull();
    expect(sinCol.intake.done).toEqual(['goals']);
  });

  it('markStep no duplica ni deja huella si no cambia nada', () => {
    const intake = { ...defaultIntake(), steps: ['goals'], done: ['goals'] };
    expect(markStep(intake, sinColumna, true).intake).toBe(intake);
  });
});

describe('progreso', () => {
  it('cuenta los dos orígenes a la vez', () => {
    const intake = clientIntake(prefs({ steps: ['onboarding', 'goals', 'payment'], done: ['goals'] }));
    expect(intakeProgress({ onboardingComplete: true }, intake)).toEqual({
      done: 2,
      total: 3,
      complete: false,
    });
  });

  /* Un entrenador que no pide nada tiene el alta completa, no vacía: si esto
     devolviera `complete: false` le saldría un aviso eterno por no hacer algo
     que él mismo decidió no hacer. */
  it('sin pasos, el alta está completa', () => {
    expect(intakeProgress({}, clientIntake(prefs({ steps: [] })))).toEqual({
      done: 0,
      total: 0,
      complete: true,
    });
  });
});

describe('configurar', () => {
  it('encender y apagar un paso', () => {
    let intake = defaultIntake();
    intake = toggleStep(intake, 'goals');
    expect(intake.steps).toContain('goals');
    intake = toggleStep(intake, 'goals');
    expect(intake.steps).not.toContain('goals');
  });

  it('apagar un paso se lleva su enlace y su marca', () => {
    let intake = clientIntake(prefs({ steps: ['welcome'], done: ['welcome'] }));
    intake = setStepLink(intake, 'welcome', 'https://youtu.be/x');
    intake = toggleStep(intake, 'welcome');
    expect(intake.links.welcome).toBeUndefined();
    expect(intake.done).not.toContain('welcome');
  });

  it('mover respeta los bordes', () => {
    const intake = clientIntake(prefs({ steps: ['goals', 'payment'] }));
    expect(moveStep(intake, 'goals', -1).steps).toEqual(['goals', 'payment']);
    expect(moveStep(intake, 'payment', 1).steps).toEqual(['goals', 'payment']);
    expect(moveStep(intake, 'goals', 1).steps).toEqual(['payment', 'goals']);
  });

  it('los pasos propios se añaden, se quitan y tienen tope', () => {
    let intake = defaultIntake();
    for (let i = 0; i < MAX_CUSTOM_STEPS + 2; i += 1) {
      intake = addCustomStep(intake, `p${i}`, `Paso ${i}`);
    }
    expect(intake.custom).toHaveLength(MAX_CUSTOM_STEPS);

    intake = removeCustomStep(intake, 'p0');
    expect(intake.custom).toHaveLength(MAX_CUSTOM_STEPS - 1);
    expect(intake.steps).not.toContain('p0');
  });

  it('un paso propio sin etiqueta no entra', () => {
    const intake = defaultIntake();
    expect(addCustomStep(intake, 'x', '   ')).toBe(intake);
  });

  it('setStepLink con un enlace inválido lo quita', () => {
    let intake = setStepLink(defaultIntake(), 'onboarding', 'https://ok.com/');
    expect(intake.links.onboarding).toBe('https://ok.com/');
    intake = setStepLink(intake, 'onboarding', 'javascript:alert(1)');
    expect(intake.links.onboarding).toBeUndefined();
  });
});

describe('guardado', () => {
  it('ida y vuelta conserva lo configurado', () => {
    let intake = defaultIntake();
    intake = addCustomStep(intake, 'mio', 'Prueba de fuerza');
    intake = setStepLink(intake, 'mio', 'https://ok.com/v');

    const vuelta = clientIntake(prefs(intakeToPreferences(intake)));
    expect(vuelta.steps).toEqual(intake.steps);
    expect(vuelta.custom[0].label).toBe('Prueba de fuerza');
    expect(vuelta.links.mio).toBe('https://ok.com/v');
  });

  /* Se guarda el objeto ENTERO y no un parche: `updateClientPreferences` fusiona
     por sección, así que una clave ausente conservaría el valor viejo y quitar un
     paso no llegaría a guardarse nunca. */
  it('escribe las cinco claves aunque estén vacías', () => {
    expect(Object.keys(intakeToPreferences(defaultIntake())).sort()).toEqual([
      'custom',
      'done',
      'files',
      'links',
      'steps',
    ]);
  });
});

/*
  ══ Enlace o archivo, nunca los dos ══════════════════════════════════════════

  Un paso entrega UNA cosa. Con las dos puestas, el portal del cliente tendría
  que pintar dos botones «Abrir» en la misma fila sin poder decir cuál es cuál.
  Por eso poner una retira la otra, en las dos direcciones.
*/
describe('el archivo subido de un paso', () => {
  const ruta = '11111111-2222-3333-4444-555555555555/intake/1738-welcome-guia.pdf';

  it('poner un archivo retira el enlace, y al revés', () => {
    let intake = clientIntake(prefs({ steps: ['welcome'] }));

    intake = setStepLink(intake, 'welcome', 'https://youtu.be/w');
    intake = setStepFile(intake, 'welcome', ruta);
    expect(stepFile(intake, 'welcome')).toBe(ruta);
    expect(stepLink(intake, 'welcome')).toBeNull();

    intake = setStepLink(intake, 'welcome', 'https://youtu.be/w');
    expect(stepLink(intake, 'welcome')).toBe('https://youtu.be/w');
    expect(stepFile(intake, 'welcome')).toBeNull();
  });

  /* La ruta la escribe la aplicación, pero llega desde `preferences`, que el
     entrenador puede escribir con la API: una ruta que no sea la de la carpeta
     del alta de un cliente no se guarda. */
  it('una ruta que no es la del alta no se acepta', () => {
    let intake = clientIntake(prefs({ steps: ['welcome'] }));
    for (const mala of ['../otro/secreto.pdf', 'c1/photos/week-1/a.jpg', 'https://x.com/a.pdf', '']) {
      intake = setStepFile(intake, 'welcome', mala);
      expect(stepFile(intake, 'welcome')).toBeNull();
    }
  });

  it('sobrevive a la ida y vuelta por preferencias', () => {
    let intake = clientIntake(prefs({ steps: ['welcome'] }));
    intake = setStepFile(intake, 'welcome', ruta);

    const vuelta = clientIntake(prefs(intakeToPreferences(intake)));
    expect(stepFile(vuelta, 'welcome')).toBe(ruta);
    expect(intakeDeliverables(vuelta)).toEqual([
      expect.objectContaining({ id: 'welcome', path: ruta, url: null }),
    ]);
  });

  /* Apagar el paso se lleva su archivo: si no, volver a encenderlo resucitaría
     un documento que su entrenador ya había retirado del portal del cliente. */
  it('apagar el paso se lleva el archivo', () => {
    let intake = clientIntake(prefs({ steps: ['welcome'] }));
    intake = setStepFile(intake, 'welcome', ruta);
    intake = toggleStep(intake, 'welcome');
    expect(intake.files.welcome).toBeUndefined();
  });
});

describe('lo que ve el cliente', () => {
  it('solo los pasos con contenido, en el orden del entrenador', () => {
    let intake = clientIntake(prefs({ steps: ['welcome', 'goals', 'routineVideo'] }));
    intake = setStepLink(intake, 'routineVideo', 'https://loom.com/r');
    intake = setStepLink(intake, 'welcome', 'https://youtu.be/w');

    expect(intakeDeliverables(intake).map((s) => s.id)).toEqual(['welcome', 'routineVideo']);
    expect(intakeDeliverables(intake)[0].url).toBe('https://youtu.be/w');
  });

  it('sin enlaces no hay nada que enseñar', () => {
    expect(intakeDeliverables(defaultIntake())).toEqual([]);
  });

  it('intakeSteps no devuelve huecos aunque el id sea desconocido', () => {
    const intake = { ...defaultIntake(), steps: ['onboarding', 'fantasma'] };
    expect(intakeSteps(intake)).toHaveLength(1);
  });
});

describe('de quién es cada paso', () => {
  /*
    ══ Por qué el reparto se puede mover ══════════════════════════════════════

    «El cliente te manda su vídeo de postura» es suyo para quien se lo pide y es
    un recordatorio privado para quien lo graba en persona. El catálogo trae un
    reparto sensato, no uno universal.
  */
  const conPasos = (steps, owners) => clientIntake({ intake: { steps, owners } });

  it('sin tocar nada, manda el catálogo', () => {
    const intake = conPasos(['form', 'postureReview']);
    expect(clientSteps(intake).map((s) => s.id)).toEqual(['form']);
    expect(coachSteps(intake).map((s) => s.id)).toEqual(['postureReview']);
  });

  it('un paso tuyo se puede pasar a lo que entrega él', () => {
    const intake = setStepOwner(conPasos(['postureVideo']), 'postureVideo', 'client');
    expect(clientSteps(intake).map((s) => s.id)).toEqual(['postureVideo']);
    expect(coachSteps(intake)).toEqual([]);
  });

  it('y volver', () => {
    let intake = setStepOwner(conPasos(['postureVideo']), 'postureVideo', 'client');
    intake = setStepOwner(intake, 'postureVideo', 'coach');
    expect(coachSteps(intake).map((s) => s.id)).toEqual(['postureVideo']);
  });

  /*
    Los automáticos NO se mueven: lo que los da por hechos es que él los haya
    entregado, así que del lado del entrenador serían una casilla que no se
    puede marcar nunca.
  */
  it('los que se marcan solos son suyos y no se mueven', () => {
    const intake = setStepOwner(conPasos(['form']), 'form', 'coach');
    expect(clientSteps(intake).map((s) => s.id)).toEqual(['form']);
    expect(coachSteps(intake)).toEqual([]);
  });

  it('un dueño inventado no se guarda', () => {
    const intake = setStepOwner(conPasos(['postureVideo']), 'postureVideo', 'nadie');
    expect(intake.owners.postureVideo).toBeUndefined();
  });

  /* Un dueño de un paso que ya no está sería una entrada muerta creciendo en una
     columna con tope de 8 KB. */
  it('el dueño de un paso retirado no se conserva', () => {
    const intake = clientIntake({ intake: { steps: ['form'], owners: { postureVideo: 'client' } } });
    expect(intake.owners).toEqual({});
  });
});
