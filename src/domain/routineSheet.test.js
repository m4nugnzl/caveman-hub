import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  mergeSheetReadings,
  parseRoutineSheet,
  pendingMuscles,
  toDayDrafts,
  toExerciseDraft,
} from './routineSheet';
import { normalizeMuscle } from './training';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que una rutina que vive en el Excel de otro se pueda traer aquí sin volver a
 * escribirla. Es el primer minuto de un entrenador en la aplicación y el sitio
 * donde hoy se cae la mayoría: registrarse y no llegar a montar nada.
 *
 * ══ Por qué las pruebas grandes son ficheros de verdad ═════════════════════
 *
 * Las dos hojas de `__fixtures__` son plantillas reales de dos entrenadores
 * distintos, y no se parecen en nada: una es un mesociclo de cinco días con
 * veinte semanas de registro a la derecha; la otra es UN día repetido
 * veinticinco veces, una por fecha. Ninguna se puede reproducir a mano en una
 * prueba —una tiene 179 columnas útiles— y ese es justo el motivo de guardarlas:
 * los fallos que importan salen del ruido que trae una hoja real (celdas
 * combinadas, filas de resumen debajo de la tabla, bloques de plantilla vacíos),
 * no de un ejemplo limpio de seis líneas.
 *
 * No contienen ningún dato personal: la hoja no lleva el nombre del cliente
 * dentro, solo en el nombre del fichero, que aquí es otro.
 *
 * La comprobación de la primera es la mejor que se puede pedir: **la propia hoja
 * trae una fila de totales por día**, así que hay contra qué contrastar sin
 * fiarse de lo que diga este parser.
 */

const fixture = (nombre) =>
  readFileSync(new URL(`./__fixtures__/${nombre}`, import.meta.url), 'utf8');

describe('hoja real · mesociclo de 5 días (familia «series»)', () => {
  const { format, days, targetChoices } = parseRoutineSheet(fixture('rutina-mesociclo-5-dias.tsv'));

  it('encuentra los cinco días y los llama por su nombre', () => {
    expect(format).toBe('tabla');
    expect(days.map((d) => d.name)).toEqual(['TIRÓN', 'EMPUJE', 'PIERNA A', 'TORSO', 'PIERNA B']);
  });

  /* Esta es LA prueba: los totales salen de la propia hoja, no de aquí. */
  it('cuadra con la fila de totales de la propia hoja', () => {
    const series = days.map((d) => d.exercises.reduce((s, e) => s + e.sets, 0));
    expect(series).toEqual([14, 14, 15, 15, 16]);
  });

  it('no se cuela ninguna fila de resumen ni de plantilla vacía', () => {
    expect(days.map((d) => d.exercises.length)).toEqual([6, 6, 7, 7, 7]);
    /* «SERIES │ 0 │ 0 │ 5 │ …» es la fila que la hoja deja debajo de la tabla. */
    expect(days.flatMap((d) => d.exercises).map((e) => e.name)).not.toContain('0');
  });

  it('traduce el vocabulario de la hoja al de la aplicación', () => {
    const tiron = days[0].exercises;
    expect(tiron[0]).toMatchObject({ name: 'CURL DE BÍCEPS EN POLEA CON BARRA', muscle: 'Bíceps', sets: 3 });
    /* La hoja dice DORSALES y BRAQUIAL; aquí son Dorsal y Bíceps. */
    expect(tiron[1].muscle).toBe('Dorsal');
    expect(tiron[5].muscle).toBe('Bíceps');
    expect(pendingMuscles(days)).toBe(0);
  });

  it('trae el RIR objetivo del plan y no el de las semanas registradas', () => {
    expect(days[0].exercises[0].rir).toBe('0');
    expect(days[0].exercises[1].rir).toBe('1');
  });

  it('trae la indicación del entrenador', () => {
    expect(days[0].exercises[1].note).toBe('Rir 1 primera serie');
    expect(days[3].exercises[6].note).toBe('Unilateral');
  });

  it('ofrece las DOS columnas de objetivo de la cabecera combinada', () => {
    expect(targetChoices).toBe(2);
    const curl = days[0].exercises[0];
    expect(curl.targetOptions[0]).toEqual(['8-10', '8-10', '8-10']);
    expect(curl.targetOptions[1]).toEqual(['10-12', '10-12', '10-12']);
  });

  it('no trae ni un kilo ni una repetición registrada', () => {
    const sets = toDayDrafts(days).flatMap((d) => d.exercises).flatMap((e) => e.sets);
    expect(sets.every((s) => s.kg === '' && s.reps === '' && s.rir === '')).toBe(true);
    expect(sets.length).toBe(74);
  });
});

describe('hoja real · sesiones apiladas (familia «bloques»)', () => {
  const { format, days } = parseRoutineSheet(fixture('rutina-sesiones-apiladas.tsv'));

  it('colapsa las veinticinco fechas del mismo entreno en un solo día', () => {
    expect(format).toBe('tabla');
    expect(days).toHaveLength(1);
    expect(days[0].name).toBe('Torso');
  });

  it('cuenta las series por cuántos bloques traen objetivo', () => {
    const dia = days[0];
    expect(dia.exercises).toHaveLength(9);
    expect(dia.exercises.reduce((s, e) => s + e.sets, 0)).toBe(25);
    expect(dia.exercises[0]).toMatchObject({ name: 'Deltoides Posterior Polea', sets: 2 });
    expect(dia.exercises[1]).toMatchObject({ name: 'Laterales Polea', sets: 3 });
  });

  it('conserva el objetivo distinto de cada serie', () => {
    expect(days[0].exercises[0].targetOptions[0]).toEqual(['6-8', '8-10']);
    expect(days[0].exercises[2].targetOptions[0]).toEqual(['6-8', '8-10', '8-10']);
  });

  it('encuentra la columna de músculo aunque no tenga rótulo', () => {
    expect(days[0].exercises.map((e) => e.muscle)).toEqual([
      'Deltoides Posterior', 'Deltoides Lateral', 'Pecho', 'Deltoides Anterior',
      'Pecho', 'Pecho', 'Tríceps', 'Tríceps', 'Deltoides Lateral',
    ]);
  });

  it('no confunde el RIR registrado dentro del bloque con un RIR objetivo', () => {
    expect(days[0].exercises.every((e) => e.rir === '')).toBe(true);
  });
});

describe('dos hojas reales del mismo libro, una por día', () => {
  /*
    El segundo entrenador reparte la semana en una pestaña por día, y las dos que
    hay aquí son suyas: no comparten ni el número de columnas ni dónde cae el
    rótulo «Rango Reps», porque cada pestaña se maquetó por su cuenta.

    Es el caso que hay que proteger de verdad: si una de las dos se lee y la otra
    no, quien importa se lleva la mitad del plan sin enterarse.
  */
  const torso = parseRoutineSheet(fixture('rutina-sesiones-apiladas.tsv'));
  const pierna = parseRoutineSheet(fixture('rutina-sesiones-apiladas-b.tsv'));

  it('la segunda hoja se lee igual de bien que la primera', () => {
    expect(pierna.days).toHaveLength(1);
    expect(pierna.days[0].name).toBe('Pierna');
    expect(pierna.days[0].exercises).toHaveLength(9);
    expect(pierna.days[0].exercises.reduce((s, e) => s + e.sets, 0)).toBe(23);
  });

  it('traduce el vocabulario de esta hoja, que es otro', () => {
    /* «Femoral» y «Glúteo» no están en `MUSCLE_GROUPS` con ese nombre. */
    expect(pierna.days[0].exercises.map((e) => e.muscle)).toEqual([
      'Tríceps', 'Aductor', 'Isquiotibiales', 'Cuádriceps', 'Gemelo',
      'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Isquiotibiales',
    ]);
    expect(pendingMuscles(pierna.days)).toBe(0);
  });

  it('las dos juntas son dos días, cada uno con su nombre', () => {
    const r = mergeSheetReadings([
      { name: 'Día 2', reading: torso },
      { name: 'Día 3', reading: pierna },
    ]);
    expect(r.days.map((d) => d.name)).toEqual(['Torso', 'Pierna']);
    expect(r.days.map((d) => d.exercises.length)).toEqual([9, 9]);
    expect(toDayDrafts(r.days).map((d) => d.dayName)).toEqual(['Torso', 'Pierna']);
  });
});

describe('pegar solo un trozo, que es lo que hace la gente', () => {
  /*
    Nadie selecciona una hoja de 179 columnas con el ratón: se marcan las seis
    filas del día que interesa y se copian. Ahí no viaja la cabecera, así que la
    tabla llega muda y hay que deducir qué es cada columna por lo que contiene.

    Se comprueba con las filas de verdad del primer día de la plantilla real,
    recortadas como las recortaría alguien, y contra el mismo total que declara
    la hoja: catorce series.
  */
  const hoja = fixture('rutina-mesociclo-5-dias.tsv');
  const soloUnDia = hoja
    .split('\n')
    .filter((l) => /CURL DE B|JALON CON|REMO DE ESPALDA ALTA EN M|JALÓN PRONO|REMO UNILATERAL|CURL MARTILLO/.test(l))
    .join('\n');

  const { format, days } = parseRoutineSheet(soloUnDia);

  it('lee las seis filas sin cabecera y con veinte semanas de registro al lado', () => {
    expect(format).toBe('tabla-sin-cabecera');
    expect(days).toHaveLength(1);
    expect(days[0].exercises.map((e) => e.sets)).toEqual([3, 3, 2, 2, 2, 2]);
    expect(days[0].exercises.reduce((s, e) => s + e.sets, 0)).toBe(14);
  });

  it('acierta el músculo y el objetivo sin que nadie se los diga', () => {
    expect(days[0].exercises.map((e) => e.muscle)).toEqual([
      'Bíceps', 'Dorsal', 'Espalda Alta', 'Dorsal', 'Dorsal', 'Bíceps',
    ]);
    expect(days[0].exercises[0].targetOptions[0]).toEqual(['8-10', '8-10', '8-10']);
  });
});

describe('otras formas de guardar una rutina', () => {
  it('lee una tabla sencilla con cabecera en inglés', () => {
    const { days } = parseRoutineSheet(
      'Exercise\tSets\tReps\tRIR\nBench press\t4\t8-10\t2\nRow\t3\t10-12\t1'
    );
    expect(days[0].exercises).toHaveLength(2);
    expect(days[0].exercises[0]).toMatchObject({ name: 'Bench press', sets: 4, rir: '2' });
  });

  it('lee las series y el objetivo cuando vienen juntos: «4x8-10»', () => {
    const { days } = parseRoutineSheet('Ejercicio\tSeries\nPress banca\t4x8-10\nRemo\t3x10');
    expect(days[0].exercises[0]).toMatchObject({ name: 'Press banca', sets: 4 });
    expect(days[0].exercises[0].targetOptions[0]).toEqual(['8-10', '8-10', '8-10', '8-10']);
    expect(days[0].exercises[1].sets).toBe(3);
  });

  it('lee una tabla sin ninguna cabecera, clasificando por contenido', () => {
    const { format, days } = parseRoutineSheet(
      [
        'Press banca\tPecho\t4\t8-10',
        'Press inclinado\tPecho\t3\t10-12',
        'Aperturas\tPecho\t3\t12-15',
        'Fondos\tTríceps\t3\t8-10',
      ].join('\n')
    );
    expect(format).toBe('tabla-sin-cabecera');
    expect(days[0].exercises).toHaveLength(4);
    expect(days[0].exercises[0]).toMatchObject({ name: 'Press banca', muscle: 'Pecho', sets: 4 });
  });

  it('lee una rutina escrita a mano, con los datos en cualquier orden', () => {
    const { format, days } = parseRoutineSheet(
      [
        'Día 1 · Push',
        'Press banca 4x8-10 RIR2',
        '- Press inclinado: 3 series de 10-12',
        'Elevaciones laterales @1 3x15',
        '',
        'Día 2 · Pull',
        'Jalón al pecho 4 series 8-10 reps',
      ].join('\n')
    );
    expect(format).toBe('texto');
    expect(days.map((d) => d.name)).toEqual(['Push', 'Pull']);
    expect(days[0].exercises[0]).toMatchObject({ name: 'Press banca', sets: 4, rir: '2' });
    expect(days[0].exercises[1]).toMatchObject({ name: 'Press inclinado', sets: 3 });
    expect(days[0].exercises[2]).toMatchObject({ name: 'Elevaciones laterales', sets: 3, rir: '1' });
    expect(days[1].exercises[0]).toMatchObject({ name: 'Jalón al pecho', sets: 4 });
  });

  it('respeta las comillas de un CSV: una coma dentro de una nota no parte la fila', () => {
    const { days } = parseRoutineSheet(
      'Ejercicio;Series;Reps;Notas\nPress banca;4;8-10;"Pausa en el pecho, sin rebote"'
    );
    expect(days[0].exercises[0].note).toBe('Pausa en el pecho, sin rebote');
    expect(days[0].exercises[0].sets).toBe(4);
  });

  /*
    ══ Hojas que nadie nos ha enseñado ══════════════════════════════════════

    Las dos plantillas de `__fixtures__` son las que existen; estas son las que
    podrían aparecer mañana. No se trata de acertarlas todas —eso no se puede
    prometer— sino de que las variaciones normales de maquetación no tumben la
    lectura: una columna de numeración delante, el músculo en otro sitio, media
    hoja de adorno alrededor, o los días puestos en columna en vez de en
    cabecera.
  */
  it('ignora una columna de numeración delante del nombre', () => {
    const { days } = parseRoutineSheet(
      'Nº\tEjercicio\tSeries\tReps\n1\tPress banca\t4\t8-10\n2\tRemo\t4\t8-10\n3\tCurl\t3\t10-12'
    );
    expect(days[0].exercises.map((e) => e.name)).toEqual(['Press banca', 'Remo', 'Curl']);
    expect(days[0].exercises[0].sets).toBe(4);
  });

  it('le da igual el orden de las columnas', () => {
    const { days } = parseRoutineSheet(
      'Reps\tEjercicio\tRIR\tGrupo muscular\tSeries\n8-10\tPress banca\t2\tPectoral\t4'
    );
    expect(days[0].exercises[0]).toMatchObject({
      name: 'Press banca', muscle: 'Pecho', sets: 4, rir: '2',
    });
    expect(days[0].exercises[0].targetOptions[0]).toEqual(['8-10', '8-10', '8-10', '8-10']);
  });

  it('separa los días cuando van en una columna en vez de en una cabecera', () => {
    const { days } = parseRoutineSheet(
      [
        'Día\tEjercicio\tSeries\tReps',
        'Lunes\tPress banca\t4\t8-10',
        'Lunes\tAperturas\t3\t12-15',
        'Miércoles\tSentadilla\t4\t6-8',
      ].join('\n')
    );
    expect(days.map((d) => d.name)).toEqual(['Lunes', 'Miércoles']);
    expect(days[0].exercises).toHaveLength(2);
    expect(days[1].exercises).toHaveLength(1);
  });

  it('no se traga el adorno de alrededor de la tabla', () => {
    const { days } = parseRoutineSheet(
      [
        'PLAN DE ENTRENAMIENTO 2026\t\t\t',
        '\t\t\t',
        'Cliente:\tMarta\t\t',
        'ENFOQUE:\tEMPUJE\t\t',
        'Ejercicio\tSeries\tReps\tRIR',
        'Press banca\t4\t8-10\t2',
        'Fondos\t3\t8-10\t1',
        '\t\t\t',
        'TOTAL SERIES\t7\t\t',
        'Recuerda calentar antes\t\t\t',
      ].join('\n')
    );
    expect(days).toHaveLength(1);
    expect(days[0].name).toBe('EMPUJE');
    expect(days[0].exercises.map((e) => e.name)).toEqual(['Press banca', 'Fondos']);
  });

  it('entiende «3 series» y «10 reps» escritos con la palabra dentro de la celda', () => {
    const { days } = parseRoutineSheet('Ejercicio\tSeries\nPress banca\t3 series\nRemo\t4 series');
    expect(days[0].exercises.map((e) => e.sets)).toEqual([3, 4]);
  });

  it('no inventa nada con lo que no es una rutina', () => {
    expect(parseRoutineSheet('').days).toEqual([]);
    expect(parseRoutineSheet('hola qué tal').days).toEqual([]);
    expect(parseRoutineSheet('\t\t\n\t\t').days).toEqual([]);
  });
});

describe('la misma rutina, escrita de doce maneras', () => {
  /*
    ══ Para qué está esta tabla ═══════════════════════════════════════════════

    Para responder a una pregunta legítima: si esto se escribió mirando dos
    hojas reales, ¿no estará amoldado a esas dos y a ninguna más?

    Las dos hojas de `__fixtures__` demuestran que funciona con lo que existe.
    Esto demuestra lo otro: que el mismo plan —tres ejercicios, once series—
    se recupera igual da igual cómo esté maquetado. Ninguna de estas doce
    disposiciones se parece a las dos plantillas reales, y ninguna está
    contemplada por su nombre en el código: lo que las lee son las mismas cuatro
    reglas de siempre —recortar lo vacío, mirar la cabecera si la hay, clasificar
    por contenido si no, y quedarse con el plan y no con el registro—.

    Si una regla nueva rompe cualquiera de estas doce, no era una regla: era un
    parche para el fichero que tuviera delante quien la escribió.
  */
  const ESPERADO = [
    { name: 'Press banca', muscle: 'Pecho', sets: 4, objetivo: '8-10', rir: '2' },
    { name: 'Remo con barra', muscle: 'Dorsal', sets: 4, objetivo: '8-10', rir: '1' },
    { name: 'Curl de bíceps', muscle: 'Bíceps', sets: 3, objetivo: '10-12', rir: '0' },
  ];

  const fil = (...celdas) => celdas.join('\t');
  const tabla = (filas) => filas.join('\n');

  /** Un bloque de registro semanal, para colgarlo a la derecha del plan. */
  const semanaEnBlanco = () => ['Peso', 'Serie 1', 'Serie 2', 'Serie 3', 'RIR', ''];

  const DISPOSICIONES = [
    {
      nombre: 'cabecera en castellano',
      lleva: { musculo: true, rir: true },
      texto: tabla([
        fil('Grupo muscular', 'Ejercicio', 'Series', 'Rango de reps', 'RIR'),
        ...ESPERADO.map((e) => fil(e.muscle, e.name, e.sets, e.objetivo, e.rir)),
      ]),
    },
    {
      nombre: 'cabecera en inglés',
      lleva: { musculo: true, rir: true },
      texto: tabla([
        fil('Muscle group', 'Exercise', 'Sets', 'Reps', 'RIR'),
        ...ESPERADO.map((e) => fil(e.muscle, e.name, e.sets, e.objetivo, e.rir)),
      ]),
    },
    {
      nombre: 'columnas en otro orden',
      lleva: { musculo: true, rir: true },
      texto: tabla([
        fil('RIR', 'Reps', 'Ejercicio', 'Músculo', 'Series'),
        ...ESPERADO.map((e) => fil(e.rir, e.objetivo, e.name, e.muscle, e.sets)),
      ]),
    },
    {
      nombre: 'con columnas que no nos interesan por medio',
      lleva: { musculo: true, rir: true },
      texto: tabla([
        fil('Ejercicio', 'Tempo', 'Grupo muscular', 'Vídeo', 'Series', 'Descanso', 'Rango de reps', 'RIR'),
        ...ESPERADO.map((e) =>
          fil(e.name, '3-1-1', e.muscle, 'youtu.be/x', e.sets, '90"', e.objetivo, e.rir)
        ),
      ]),
    },
    {
      nombre: 'cabeceras combinadas, con el dato una columna a la derecha',
      lleva: { musculo: true, rir: false },
      texto: tabla([
        fil('Ejercicio', '', 'Grupo muscular', '', 'Series', '', 'Rango de reps', ''),
        ...ESPERADO.map((e) => fil(e.name, '', e.muscle, '', '', e.sets, '', e.objetivo)),
      ]),
    },
    {
      nombre: 'sin ninguna cabecera',
      lleva: { musculo: true, rir: false },
      texto: tabla(ESPERADO.map((e) => fil(e.name, e.muscle, e.sets, e.objetivo))),
    },
    {
      nombre: 'series y objetivo en la misma celda',
      lleva: { musculo: true, rir: false },
      texto: tabla([
        fil('Ejercicio', 'Grupo muscular', 'Series'),
        ...ESPERADO.map((e) => fil(e.name, e.muscle, `${e.sets}x${e.objetivo}`)),
      ]),
    },
    {
      nombre: 'un bloque de columnas por serie',
      lleva: { musculo: true, rir: false },
      texto: tabla([
        fil('Ejercicio', 'Músculo', 'Kgs', 'Reps', 'Rango reps', 'Kgs', 'Reps', 'Rango reps', 'Kgs', 'Reps', 'Rango reps', 'Kgs', 'Reps', 'Rango reps'),
        ...ESPERADO.map((e) =>
          fil(
            e.name,
            e.muscle,
            ...Array.from({ length: 4 }, (_, i) => ['', '', i < e.sets ? e.objetivo : '']).flat()
          )
        ),
      ]),
    },
    {
      nombre: 'con adorno arriba y una fila de totales abajo',
      lleva: { musculo: true, rir: true },
      texto: tabla([
        fil('PLAN DE ENTRENAMIENTO 2026', '', '', '', ''),
        fil('', '', '', '', ''),
        fil('Cliente:', 'Marta', '', '', ''),
        fil('Grupo muscular', 'Ejercicio', 'Series', 'Rango de reps', 'RIR'),
        ...ESPERADO.map((e) => fil(e.muscle, e.name, e.sets, e.objetivo, e.rir)),
        fil('', '', '', '', ''),
        fil('TOTAL SERIES', '11', '', '', ''),
        fil('Acuérdate de calentar', '', '', '', ''),
      ]),
    },
    {
      nombre: 'con veinte semanas de registro colgadas a la derecha',
      lleva: { musculo: true, rir: true },
      texto: tabla([
        fil(
          'Grupo muscular', 'Ejercicio', 'Series', 'Rango de reps', 'RIR',
          ...Array.from({ length: 20 }, semanaEnBlanco).flat()
        ),
        ...ESPERADO.map((e) =>
          fil(e.muscle, e.name, e.sets, e.objetivo, e.rir, ...Array.from({ length: 120 }, () => ''))
        ),
      ]),
    },
    {
      nombre: 'un CSV con punto y coma',
      lleva: { musculo: true, rir: true },
      texto: [
        'Grupo muscular;Ejercicio;Series;Rango de reps;RIR',
        ...ESPERADO.map((e) => [e.muscle, e.name, e.sets, e.objetivo, e.rir].join(';')),
      ].join('\n'),
    },
    {
      nombre: 'escrita a mano, sin tabla',
      lleva: { musculo: false, rir: true },
      texto: ESPERADO.map((e) => `${e.name} ${e.sets}x${e.objetivo} RIR${e.rir}`).join('\n'),
    },
  ];

  it.each(DISPOSICIONES)('$nombre', ({ texto, lleva }) => {
    const { days } = parseRoutineSheet(texto);

    expect(days).toHaveLength(1);
    const leidos = days[0].exercises;

    expect(leidos.map((e) => e.name)).toEqual(ESPERADO.map((e) => e.name));
    expect(leidos.map((e) => e.sets)).toEqual(ESPERADO.map((e) => e.sets));
    expect(leidos.reduce((s, e) => s + e.sets, 0)).toBe(11);

    /* El objetivo, el mismo en todas las series de cada ejercicio. */
    leidos.forEach((e, i) => {
      expect([...new Set(e.targetOptions[0])]).toEqual([ESPERADO[i].objetivo]);
    });

    if (lleva.musculo) expect(leidos.map((e) => e.muscle)).toEqual(ESPERADO.map((e) => e.muscle));
    if (lleva.rir) expect(leidos.map((e) => e.rir)).toEqual(ESPERADO.map((e) => e.rir));
  });
});

describe('lo que no se sabe, se dice', () => {
  it('marca el músculo que no tiene equivalente en vez de colocarlo mal', () => {
    const { days } = parseRoutineSheet(
      'Grupo muscular\tEjercicio\tSeries\tReps\nHombros\tPress militar\t4\t8-10\nErectores\tHiperextensiones\t3\t12'
    );
    expect(days[0].exercises[0]).toMatchObject({ muscle: 'Otros', muscleSure: false, muscleRaw: 'Hombros' });
    expect(pendingMuscles(days)).toBe(2);
  });

  it('«Hombros» no se reparte entre los tres deltoides por su cuenta', () => {
    expect(normalizeMuscle('Hombros').sure).toBe(false);
    expect(normalizeMuscle('Pectoral')).toEqual({ muscle: 'Pecho', sure: true });
    expect(normalizeMuscle('DORSALES')).toEqual({ muscle: 'Dorsal', sure: true });
    expect(normalizeMuscle('')).toBeNull();
  });

  it('pone nombre a un día que la hoja no nombraba', () => {
    const { days } = parseRoutineSheet('Ejercicio\tSeries\nPress banca\t4');
    expect(days[0].name).toBeNull();
    expect(toDayDrafts(days)[0].dayName).toBe('Día 1');
  });
});

describe('mergeSheetReadings · un libro con una pestaña por día', () => {
  /* El caso real: hay quien reparte la semana en cuatro pestañas —«Día 1»,
     «Día 2»…— y dentro de cada una no hay ninguna fila que diga cómo se llama
     el día, porque ya lo dice la pestaña. */
  const unDia = (ejercicio) =>
    parseRoutineSheet(`Ejercicio\tSeries\tReps\n${ejercicio}\t4\t8-10`);

  it('una hoja que es un día se llama como la pestaña', () => {
    const r = mergeSheetReadings([
      { name: 'Día 1 · Push', reading: unDia('Press banca') },
      { name: 'Día 2 · Pull', reading: unDia('Remo') },
    ]);
    expect(r.days.map((d) => d.name)).toEqual(['Día 1 · Push', 'Día 2 · Pull']);
    expect(r.days.map((d) => d.exercises[0].name)).toEqual(['Press banca', 'Remo']);
    expect(r.format).toBe('libro');
  });

  it('una hoja con varios días conserva los suyos, no el nombre de la pestaña', () => {
    const cinco = parseRoutineSheet(fixture('rutina-mesociclo-5-dias.tsv'));
    const r = mergeSheetReadings([{ name: 'Plan de Entrenamiento de 5 días', reading: cinco }]);
    expect(r.days.map((d) => d.name)).toEqual(['TIRÓN', 'EMPUJE', 'PIERNA A', 'TORSO', 'PIERNA B']);
  });

  it('las hojas sin rutina no aportan nada y no estorban', () => {
    const r = mergeSheetReadings([
      { name: 'Biblioteca de Alimentos', reading: parseRoutineSheet('Alimento\tProteína\nArroz\t7') },
      { name: 'Día 1', reading: unDia('Press banca') },
      { name: 'Vacía', reading: parseRoutineSheet('') },
    ]);
    expect(r.days).toHaveLength(1);
    expect(r.days[0].name).toBe('Día 1');
  });

  it('sin nada marcado no hay lectura', () => {
    expect(mergeSheetReadings([])).toEqual({ format: null, days: [], targetChoices: 0 });
  });

  it('si una sola hoja ofrece dos objetivos, la pregunta se hace para todas', () => {
    const dos = parseRoutineSheet(fixture('rutina-mesociclo-5-dias.tsv'));
    const r = mergeSheetReadings([
      { name: 'Día 1', reading: unDia('Press banca') },
      { name: 'Plan', reading: dos },
    ]);
    expect(r.targetChoices).toBe(2);
  });
});

describe('toExerciseDraft', () => {
  const leido = {
    name: '  Press banca  ',
    muscle: 'Pecho',
    sets: 3,
    targetOptions: [['8-10', '8-10', '8-10'], ['10-12', '10-12', '10-12']],
    rir: '2',
    note: 'Pausa abajo',
  };

  it('construye las series con el objetivo y el RIR, y sin registro', () => {
    const ex = toExerciseDraft(leido);
    expect(ex.name).toBe('Press banca');
    expect(ex.sets).toHaveLength(3);
    expect(ex.sets[0]).toEqual({ kg: '', reps: '', rir: '', targetReps: '8-10', targetRir: '2' });
    expect(ex.coachNote).toBe('Pausa abajo');
    expect(ex.id).toMatch(/^ex_/);
  });

  it('usa la columna de objetivo que se le pida', () => {
    expect(toExerciseDraft(leido, { targetIndex: 1 }).sets[0].targetReps).toBe('10-12');
  });

  it('sin nota no crea el campo: `coachNote` es opcional de verdad', () => {
    expect(toExerciseDraft({ ...leido, note: '' })).not.toHaveProperty('coachNote');
  });

  it('cada ejercicio importado nace con su propio id', () => {
    const a = toExerciseDraft(leido);
    const b = toExerciseDraft(leido);
    expect(a.id).not.toBe(b.id);
    expect(a.sets[0]).not.toBe(b.sets[0]);
  });
});
