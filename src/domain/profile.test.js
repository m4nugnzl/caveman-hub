import { describe, expect, it } from 'vitest';

import {
  COACH_FIELDS,
  MAX_FIELD,
  PROFILE_FIELDS,
  PROFILE_GROUPS,
  cleanProfile,
  fieldText,
  filledCount,
  isProfileEmpty,
  profileRows,
} from './profile';

/**
 * ══ Lo que estas pruebas defienden ══════════════════════════════════════════
 *
 * Esta es la parte de la ficha que se dibuja SOLA a partir del catálogo, así que
 * el catálogo es código: un `group` mal escrito no rompe nada, simplemente hace
 * que ese campo no aparezca en ninguna parte —ni en la lectura ni en el
 * formulario— y nadie se entera hasta que un entrenador escribe algo, guarda y
 * ve que no se ha guardado.
 *
 * Lo otro que se blinda es la regla de la pantalla: **lo vacío no se pinta**. Es
 * lo que permite que la ficha tenga diecinueve campos sin parecer un formulario
 * abandonado.
 */

describe('el catálogo', () => {
  it('no tiene ids repetidos', () => {
    const ids = PROFILE_FIELDS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /* Un `group` que no existe deja el campo huérfano: no sale en ningún bloque y
     tampoco da error. Es el fallo silencioso de este diseño. */
  it('todos los campos pertenecen a un grupo declarado', () => {
    const grupos = new Set(PROFILE_GROUPS.map((g) => g.id));
    for (const field of PROFILE_FIELDS) {
      expect(grupos.has(field.group), `${field.id} → grupo «${field.group}»`).toBe(true);
    }
  });

  it('los dos grupos tienen campos', () => {
    for (const g of PROFILE_GROUPS) {
      expect(PROFILE_FIELDS.filter((f) => f.group === g.id).length, g.id).toBeGreaterThan(0);
    }
  });

  it('toda opción de un desplegable tiene id y etiqueta', () => {
    for (const field of PROFILE_FIELDS.filter((f) => f.kind === 'choice')) {
      expect(Array.isArray(field.options), `${field.id} sin opciones`).toBe(true);
      for (const o of field.options) {
        expect(Boolean(o.id && o.label), `${field.id} → opción incompleta`).toBe(true);
      }
    }
  });
});

describe('cleanProfile', () => {
  it('se queda solo con lo que conoce', () => {
    const limpio = cleanProfile({ trainingWindow: '6:00-7:45', inventado: 'lo que sea' });
    expect(limpio).toEqual({ trainingWindow: '6:00-7:45' });
  });

  /* Borrar el contenido de un campo tiene que QUITARLO de la ficha, no dejar la
     etiqueta con nada al lado. Por eso lo vacío no se guarda. */
  it.each([
    ['', 'cadena vacía'],
    ['   ', 'solo espacios'],
    [null, 'nulo'],
    [undefined, 'sin poner'],
  ])('%s no se guarda (%s)', (valor) => {
    expect(cleanProfile({ trainingWindow: valor })).toEqual({});
  });

  it('recorta el texto al tope de una línea', () => {
    expect(cleanProfile({ trainingWindow: 'a'.repeat(500) }).trainingWindow).toHaveLength(MAX_FIELD);
  });

  describe('números', () => {
    it('acepta la cifra y descarta lo que no lo es', () => {
      expect(cleanProfile({ sleepHours: '6,5' }).sleepHours).toBe(6.5);
      expect(cleanProfile({ sleepHours: 'ocho' })).toEqual({});
    });

    /* Cero no es una respuesta: es un dedo. Y guardado se convierte en un dato
       que alguien puede llegar a creerse — «duerme 0 horas». */
    it.each([
      [0, 'cero'],
      [-3, 'negativo'],
    ])('%s no se guarda (%s)', (valor) => {
      expect(cleanProfile({ sleepHours: valor })).toEqual({});
    });
  });

  describe('sí/no', () => {
    it('acepta booleanos y las cadenas del desplegable', () => {
      expect(cleanProfile({ coachedBefore: true }).coachedBefore).toBe(true);
      expect(cleanProfile({ coachedBefore: 'false' }).coachedBefore).toBe(false);
    });

    /* «Sin contestar» es un tercer estado, no un «no». Que un cliente no haya
       dicho si tuvo entrenador antes no significa que no lo tuviera. */
    it('lo que no es ni sí ni no queda sin contestar', () => {
      expect(cleanProfile({ coachedBefore: 'quizá' })).toEqual({});
      expect(fieldText(cleanProfile({}), 'coachedBefore')).toBeNull();
    });

    it('un «no» guardado NO es lo mismo que un hueco', () => {
      const dicho = cleanProfile({ coachedBefore: false });
      expect(dicho.coachedBefore).toBe(false);
      expect(fieldText(dicho, 'coachedBefore')).toBe('No');
    });
  });

  describe('desplegables', () => {
    it('solo admite una opción del catálogo', () => {
      expect(cleanProfile({ experience: 'adv' }).experience).toBe('adv');
      expect(cleanProfile({ experience: 'muchísima' })).toEqual({});
    });
  });
});

describe('fieldText', () => {
  it.each([
    ['experience', 'adv', '3 a 5 años', 'la etiqueta de la opción, no su id'],
    /* Coma decimal, no punto: la cifra se escribe en el idioma de la aplicación
       como todas las demás. Salía con el punto de JavaScript, y al lado del
       «53,9 kg» de la cabecera eran dos ortografías del mismo tipo de dato. */
    ['sleepHours', 6.5, '6,5 h', 'la cifra con su unidad, en español'],
    /* Y con los decimales que declara el catálogo: los minutos de una sesión no
       tienen mitades, así que «100.12 min» era falsa precisión traída del
       cuestionario. */
    ['sessionMinutes', 100.12, '100 min', 'redondeado a lo que declara el campo'],
    ['coachedBefore', true, 'Sí', 'el booleano en palabras'],
    ['trainingWindow', '6:00-7:45', '6:00-7:45', 'el texto tal cual'],
  ])('%s = %s → «%s» (%s)', (id, valor, esperado) => {
    expect(fieldText({ [id]: valor }, id)).toBe(esperado);
  });

  it('un campo que no existe no revienta', () => {
    expect(fieldText({ x: 1 }, 'x')).toBeNull();
  });
});

describe('profileRows', () => {
  const profile = cleanProfile({
    trainingWindow: '6:00-7:45',
    experience: 'adv',
    mealsPerDay: 3,
  });

  /* La regla de la pantalla: con diecinueve campos, pintar los huecos sería una
     columna de grises que nadie va a rellenar por leerla. */
  it('solo devuelve lo que tiene valor', () => {
    expect(profileRows(profile, 'training').map((r) => r.id)).toEqual(['experience', 'trainingWindow']);
  });

  it('respeta el orden del catálogo, no el de escritura', () => {
    const revuelto = cleanProfile({ trainingWindow: 'X', experience: 'novice' });
    const orden = PROFILE_FIELDS.filter((f) => f.group === 'training').map((f) => f.id);
    const filas = profileRows(revuelto, 'training').map((r) => r.id);
    expect(filas).toEqual(orden.filter((id) => filas.includes(id)));
  });

  it('cada bloque solo ve lo suyo', () => {
    expect(profileRows(profile, 'nutrition').map((r) => r.id)).toEqual(['mealsPerDay']);
  });

  it('un perfil vacío no da filas y lo dice', () => {
    expect(profileRows({}, 'training')).toEqual([]);
    expect(filledCount({}, 'training')).toBe(0);
    expect(isProfileEmpty({})).toBe(true);
    expect(isProfileEmpty(profile)).toBe(false);
  });

  it('aguanta que no le pasen nada', () => {
    expect(profileRows(null, 'training')).toEqual([]);
    expect(isProfileEmpty(null)).toBe(true);
  });
});

describe('lo que apunta el entrenador NO es una pregunta', () => {
  /*
    ══ El fallo que esto evita, y que llegó a producción de una revisión ══════

    La carpeta de Drive estaba dentro de `PROFILE_FIELDS`, y de esa lista salen
    TRES cosas: los bloques de la ficha, el catálogo de preguntas que el
    entrenador puede encender, y el formulario que ve el cliente.

    El resultado era que se le podía pedir a un cliente que pegara el enlace a
    una carpeta de Drive que no es suya. No es un dato de la persona: es una
    decisión de cómo trabaja su entrenador.
  */
  it('no se puede preguntar por la carpeta de sus fotos', () => {
    expect(PROFILE_FIELDS.map((f) => f.id)).not.toContain('gymFolder');
  });

  it('ningún ajuste del entrenador se cuela en el catálogo de preguntas', () => {
    const preguntas = new Set(PROFILE_FIELDS.map((f) => f.id));
    for (const field of COACH_FIELDS) {
      expect(preguntas.has(field.id), `«${field.id}» es preguntable y no debería`).toBe(false);
    }
  });

  it('tampoco sale en ningún bloque de la ficha', () => {
    const conCarpeta = cleanProfile({ gymFolder: 'https://drive.google.com/x' });
    for (const grupo of PROFILE_GROUPS) {
      expect(profileRows(conCarpeta, grupo.id).map((r) => r.id)).not.toContain('gymFolder');
    }
  });

  /* Pero SÍ se guarda y SÍ se lee: es la misma columna, solo que la escribe y la
     enseña otro sitio —el bloque de la maquinaria—. */
  it('pero se guarda y se puede leer, que para eso está', () => {
    const limpio = cleanProfile({ gymFolder: 'https://drive.google.com/x' });
    expect(limpio.gymFolder).toBe('https://drive.google.com/x');
    expect(fieldText(limpio, 'gymFolder')).toBe('https://drive.google.com/x');
  });

  /* Un `href` con `javascript:` dentro es una ejecución en la sesión de quien lo
     pulse, y este valor acaba en un `href`. */
  it('solo entra lo que es una dirección de verdad', () => {
    expect(cleanProfile({ gymFolder: 'javascript:alert(1)' }).gymFolder).toBeUndefined();
    expect(cleanProfile({ gymFolder: 'drive.google.com/x' }).gymFolder).toBeUndefined();
  });
});
