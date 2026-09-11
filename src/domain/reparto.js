/**
 * EL REPARTO: lo que llevas en la mano, puesto en varias personas a la vez.
 *
 * ══ De dónde sale ══════════════════════════════════════════════════════════
 *
 * `MandarBloque` enseñó la regla en una sola pantalla: **no se pulsa nada sin
 * ver qué le pasa a cada uno**. Era el único sitio del producto que escribe en
 * el trabajo de varias personas de golpe, y lo hacía con las consecuencias
 * delante — quién empieza de cero, a quién se le cierra el bloque que tenía.
 *
 * Y era el único que podía hacerlo, porque el bloque era la única cosa que se
 * podía repartir. Desde el portapapeles se lleva en la mano cualquiera de las
 * cinco piezas del producto, así que la pregunta «¿y esto, a seis?» tiene cinco
 * respuestas distintas y ninguna estaba escrita.
 *
 * Este módulo es esa tabla, y solo eso: **qué necesita leer cada pieza para
 * repartirse, qué le pasa a cada destinatario, y qué habría que escribirle**.
 * No escribe: devuelve un `plan` y quien tenga los verbos del contexto lo
 * ejecuta. Así se puede probar entero sin montar una pantalla, que es lo que
 * hace falta cuando el fallo de una consecuencia mal calculada no es un
 * parpadeo sino la dieta de ocho personas.
 *
 * ══ Las dos familias, que es la decisión de diseño ═════════════════════════
 *
 * Repartir una pieza es contestar «¿dónde cae en el suyo?», y hay dos clases de
 * respuesta:
 *
 *   · **Las que abren sitio.** Un bloque abre un bloque; una hoja entra en el
 *     bloque abierto, que es uno solo; un día de dieta se AÑADE como día más.
 *     No hay nada que preguntar: el sitio es el único que hay.
 *   · **Las que caen dentro de algo que ya existe.** Un ejercicio va en UNA
 *     hoja y una comida en UN día, y ni las hojas ni los días de ocho personas
 *     se llaman igual por decreto. Aquí el sitio SE PREGUNTA una vez —por
 *     nombre, con el de origen puesto por defecto— y cada destinatario lo tiene
 *     o no lo tiene. Quien no lo tenga sale en la lista diciendo eso mismo, en
 *     vez de recibir la pieza en un sitio que la aplicación haya elegido por el
 *     entrenador.
 *
 * Es la misma ley que el tramo y la pauta (ver `docs/estudio-portapapeles.md`):
 * lo que no se sabe al copiar se pregunta al PEGAR.
 *
 * ══ Y lo que nunca sustituye ═══════════════════════════════════════════════
 *
 * Salvo el bloque —que cierra el abierto porque eso es empezar un bloque en
 * este producto, y por eso lo dice en la columna—, **repartir solo AÑADE**. Una
 * dieta no se «cierra»: no hay lista de planes, así que escribir encima
 * sustituye y lo sustituido no está en ninguna parte. Un día mandado es un día
 * más, y si sobra se quita, que es un error reversible.
 */

import { TIPO } from '@/lib/portapapeles';
import { norm } from '@/lib/texto';

import { blockSessionsOf, currentBlock, weeksOfBlock } from './blocks';
import { migrateBlockPlans } from './blocksMigration';
import { conditionsFor } from './conditions';
import { freeSheetName } from './pieces';
import { hasCycleMap, planDays, rescaleMeals, targetsFor } from './nutrition';
import { unitLabelPlural } from './training';

/**
 * Qué hace falta leer del destinatario para saber qué le pasa.
 *
 * Es la mitad cara del reparto: ni el programa ni la dieta de los demás están
 * en memoria (la cartera arranca con RESÚMENES desde la 0024), y escribir sin
 * haberlo leído no deja el dato a medias — lo BORRA, porque los dos
 * actualizadores parten de lo que haya en memoria. Por eso quien no haya
 * terminado de cargar no se puede mandar, y por eso esto se declara aquí y no
 * se deduce en la pantalla.
 *
 * `area` es la del condicionante que mira cada pieza: mandarle una dieta a
 * quien no puede comer eso y mandarle un empuje por encima de la cabeza a quien
 * tiene el hombro tocado son el mismo error.
 */
export const REPARTO = {
  [TIPO.BLOQUE]: { lee: 'programa', area: 'training', sitio: null },
  [TIPO.HOJA]: { lee: 'programa', area: 'training', sitio: null },
  [TIPO.EJERCICIO]: { lee: 'programa', area: 'training', sitio: 'hoja' },
  [TIPO.COMIDA]: { lee: 'dieta', area: 'nutrition', sitio: 'dia' },
  [TIPO.DIA_DIETA]: { lee: 'dieta', area: 'nutrition', sitio: null },
  /* La única pieza de nutrición que SUSTITUYE. `sustituye: true` no es un
     adorno: la pantalla lo lee para desmarcar las filas de fábrica y para
     cambiar el verbo del pie. Ver «LA DIETA ENTERA» más abajo. */
  [TIPO.DIETA]: { lee: 'dieta', area: 'nutrition', sitio: null, sustituye: true },
};

/**
 * ¿Esta pieza BORRA lo que el destinatario tenía?
 *
 * Hoy solo la dieta entera. El bloque cierra el que hubiera —eso es empezar un
 * bloque— pero no lo borra: sigue en su lista, con sus semanas y su registro.
 * Una dieta no tiene lista, así que escribir encima es perderla.
 */
export const sustituye = (tipo) => Boolean(REPARTO[tipo]?.sustituye);

/** ¿Esta pieza se puede poner en varios? Las cinco, hoy. */
export const seReparte = (tipo) => Boolean(REPARTO[tipo]);

/** Qué hay que traer de cada destinatario: `programa` o `dieta`. */
export const queLee = (tipo) => REPARTO[tipo]?.lee || null;

/** El área de condicionantes que mira esta pieza. */
export const areaDe = (tipo) => REPARTO[tipo]?.area || null;

/**
 * Si esta pieza cae DENTRO de algo que ya existe, qué es ese algo:
 * `hoja`, `dia` o `null` cuando la pieza abre su propio sitio.
 */
export const pideSitio = (tipo) => REPARTO[tipo]?.sitio || null;

/**
 * El sitio del que salió la pieza, que es el que se propone.
 *
 * Va en `origen` y no en la carga porque es exactamente eso —de dónde salió— y
 * porque la carga de un ejercicio ES el ejercicio: colgarle ahí el nombre de su
 * hoja metería un campo que no es suyo en algo que se clona y se escribe.
 */
export const sitioDeOrigen = (pieza) => pieza?.origen?.hoja || pieza?.origen?.dia || null;

/** El programa del destinatario, leído como lo lee la aplicación. */
const programaDe = (datos) => (datos ? migrateBlockPlans(datos).program : null);

const cuenta = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const nombresDeHoja = (program) => blockSessionsOf(currentBlock(program) || {}).map((h) => h.dayName);

/**
 * Los sitios que este destinatario tiene, para poder proponer los que existen
 * de verdad en vez de una lista inventada.
 */
export const sitiosDe = (tipo, datos) => {
  if (pideSitio(tipo) === 'hoja') {
    const program = programaDe(datos);
    if (!program || (program.microcycles || []).length === 0) return [];
    return nombresDeHoja(program);
  }
  if (pideSitio(tipo) === 'dia') return planDays(datos).map((d) => d.name);
  return [];
};

/* Por nombre y sin acentos ni mayúsculas: «Lower A» y «lower a» son la misma
   hoja para cualquiera menos para un `===`. */
const buscarPorNombre = (lista, nombre, campo) => {
  const q = norm(nombre || '');
  if (!q) return null;
  return lista.find((x) => norm(campo(x)) === q) || null;
};

// ── Qué lleva dentro una pieza ─────────────────────────────────────────────

const serieLegible = (set) =>
  [
    set?.targetReps ? `${set.targetReps} reps` : null,
    set?.targetKg ? `${set.targetKg} kg` : null,
    set?.targetRir === '' || set?.targetRir === undefined || set?.targetRir === null
      ? null
      : `RIR ${set.targetRir}`,
  ]
    .filter(Boolean)
    .join(' · ') || 'sin objetivo';

const CONTENIDO = {
  [TIPO.BLOQUE]: (carga) =>
    (carga?.sessions || []).map(
      (h) => `${h.dayName} · ${cuenta((h.exercises || []).length, 'ejercicio', 'ejercicios')}`
    ),
  [TIPO.HOJA]: (carga) =>
    (carga?.exercises || []).map((ex) => `${ex.name} · ${cuenta((ex.sets || []).length, 'serie', 'series')}`),
  [TIPO.EJERCICIO]: (carga) => (carga?.sets || []).map(serieLegible),
  [TIPO.COMIDA]: (carga) =>
    (carga?.options?.[0]?.foods || []).map((f) => `${f.name}${f.grams ? ` · ${f.grams} g` : ''}`),
  [TIPO.DIA_DIETA]: (carga) =>
    (carga?.meals || []).map(
      (m) => `${m.name || 'Comida'} · ${cuenta((m.options || []).length, 'opción', 'opciones')}`
    ),
  /* De la dieta entera se leen sus DÍAS, no sus comidas: quince comidas
     seguidas sin decir de qué día es cada una no se pueden mirar. */
  [TIPO.DIETA]: (carga) =>
    (carga?.days || []).map(
      (d) => `${d.name || 'Día'} · ${cuenta((d.meals || []).length, 'comida', 'comidas')}`
    ),
};

/**
 * Qué lleva dentro, en unas pocas líneas.
 *
 * Es lo que convierte la lista de la mano en algo que se puede mirar: doce
 * piezas con nombre y nada más obligan a pegar para saber cuál era. El tope
 * existe porque esto vive en un cajón de 320 px al pie de la pantalla, no
 * porque las demás líneas no importen — por eso se dice cuántas quedan.
 */
export const loQueLleva = (pieza, tope = 5) => {
  const todas = (CONTENIDO[pieza?.tipo] || (() => []))(pieza?.carga) || [];
  return { lineas: todas.slice(0, tope), mas: Math.max(0, todas.length - tope) };
};

// ── Qué le pasa a cada uno ─────────────────────────────────────────────────

const CARGANDO = { estado: 'cargando', filas: [], veto: [], ojo: [], plan: null };

const no = (texto) => ({ estado: 'no', filas: [{ texto }], veto: [], ojo: [], plan: null });

const va = (filas, plan) => ({ estado: 'va', filas, veto: [], ojo: [], plan });

/**
 * El reescalado, que es la firma de repartir una dieta.
 *
 * **Mandar la misma dieta a ocho no es darles la misma dieta.** El menú entra
 * ajustado al objetivo que el destinatario YA tiene (`rescaleMeals` mueve la
 * fuente de hidratos y deja quieta la proteína), y lo que viaja entre sus días
 * es la proporción, no las cifras. Quien no tenga objetivo puesto lo recibe tal
 * cual, y la columna lo dice: es lo que hay, pero enterarse después no.
 */
const reescalado = (pieza, dieta, dia) => {
  const desde = Number(pieza?.origen?.objetivoKcals) || 0;
  const hasta = Number(targetsFor(dieta, dia?.id)?.targetKcals) || 0;
  const meals = pieza.tipo === TIPO.DIA_DIETA ? pieza.carga?.meals || [] : [pieza.carga];

  if (!hasta) return { meals, fila: { texto: 'No tiene objetivo puesto: entra tal cual' } };
  if (!desde) return { meals, fila: { texto: 'Sin objetivo de origen: entra sin reescalar' } };
  if (desde === hasta) return { meals, fila: null };

  const hecho = rescaleMeals(meals, { fromKcals: desde, toKcals: hasta });
  if (!hecho) {
    return { meals, fila: { texto: `Nada que mover para llegar a sus ${hasta} kcal: entra tal cual` } };
  }
  return { meals: hecho.meals, fila: { texto: `Reescalado de ${desde} a ${hasta} kcal` } };
};

const CONSECUENCIA = {
  /*
    EL BLOQUE. El único que sustituye, porque empezar un bloque es cerrar el
    anterior: no es un efecto que convenga esconder, así que ocupa su fila con
    la marca de que sale.
  */
  [TIPO.BLOQUE]: (pieza, { datos }) => {
    const program = programaDe(datos);
    const hojas = pieza.carga?.sessions || [];
    const entra = { texto: `${pieza.titulo} · ${cuenta(hojas.length, 'hoja', 'hojas')}`, marca: 'entra' };

    if ((program?.microcycles || []).length === 0) {
      return va([entra, { texto: 'Todavía no tenía rutina: empieza aquí' }], { que: 'bloque', plan: pieza.carga });
    }
    const abierto = currentBlock(program);
    const semanas = weeksOfBlock(program, abierto).length;
    return va(
      [
        entra,
        {
          texto: `${abierto?.name || 'su bloque abierto'} · ${cuenta(
            semanas,
            'microciclo',
            unitLabelPlural(program.cycleType)
          )}`,
          marca: 'sale',
        },
      ],
      { que: 'bloque', plan: pieza.carga }
    );
  },

  /*
    LA HOJA. Entra en el bloque abierto, que es uno solo; a quien no tenga
    ninguno se le abre uno con ella dentro, que es lo que el entrenador está
    pidiendo cuando le reparte un día a alguien que empieza. Y el nombre se
    libera ANTES de enseñarlo: quien ya tenga una «Lower A» lo lee en la
    columna, no se lo encuentra después.
  */
  [TIPO.HOJA]: (pieza, { datos }) => {
    const program = programaDe(datos);
    const dayName = pieza.carga?.dayName || pieza.titulo || 'Hoja';
    const ejercicios = pieza.carga?.exercises || [];

    if ((program?.microcycles || []).length === 0) {
      return va(
        [
          { texto: `${dayName} · ${cuenta(ejercicios.length, 'ejercicio', 'ejercicios')}`, marca: 'entra' },
          { texto: 'No tenía rutina: se le abre un bloque con esta hoja' },
        ],
        { que: 'hoja-sola', plan: { name: dayName, sessions: [{ dayName, exercises: ejercicios }] } }
      );
    }

    const abierto = currentBlock(program);
    const nombre = freeSheetName(dayName, nombresDeHoja(program));
    return va(
      [
        { texto: `${nombre} · ${cuenta(ejercicios.length, 'ejercicio', 'ejercicios')}`, marca: 'entra' },
        {
          texto:
            nombre === dayName
              ? `Se añade a «${abierto?.name || 'su bloque'}»`
              : `Ya tiene una hoja «${dayName}»: entra en «${abierto?.name || 'su bloque'}» como «${nombre}»`,
        },
      ],
      { que: 'hoja', bloqueId: abierto?.id, nombre, exercises: ejercicios }
    );
  },

  /*
    EL EJERCICIO. Cae dentro de una hoja que ya existe, así que el sitio es una
    pregunta y la respuesta puede ser «aquí no». Que a alguien no le entre no es
    un fallo: es la información por la que se abre esta pantalla.
  */
  [TIPO.EJERCICIO]: (pieza, { datos, sitio }) => {
    const program = programaDe(datos);
    if ((program?.microcycles || []).length === 0) return no('No tiene ningún bloque abierto');

    /* Sin sitio no se dice «no tiene ninguna hoja «»»: lo que falta es la
       respuesta, no la hoja. Pasa con lo copiado por una versión anterior, que
       no guardaba de qué hoja salía. */
    if (!sitio) return no('Falta decir en qué hoja cae');

    const abierto = currentBlock(program);
    const hoja = buscarPorNombre(blockSessionsOf(abierto || {}), sitio, (h) => h.dayName);
    if (!hoja) return no(`«${abierto?.name || 'Su bloque'}» no tiene ninguna hoja «${sitio}»`);

    const comoSeLlama = pieza.carga?.name || pieza.titulo;
    const repetido = (hoja.exercises || []).some((ex) => norm(ex.name) === norm(comoSeLlama || ''));
    return va(
      [
        {
          texto: `${comoSeLlama} · ${cuenta((pieza.carga?.sets || []).length, 'serie', 'series')}`,
          marca: 'entra',
        },
        {
          texto: repetido
            ? `Ya tiene «${comoSeLlama}» en «${hoja.dayName}»: entraría otra vez`
            : `En «${hoja.dayName}», de «${abierto?.name || 'su bloque'}»`,
        },
      ],
      { que: 'ejercicio', bloqueId: abierto?.id, hoja: hoja.dayName, exercise: pieza.carga }
    );
  },

  /*
    LA COMIDA. Mismo trato que el ejercicio con una excepción medida: con UN
    solo día no hay a dónde elegir, así que cae ahí se llame como se llame.
    Exigirle a una dieta de un día que su día se llame igual que el de otra
    persona sería un peaje por un nombre que nadie ha puesto.
  */
  [TIPO.COMIDA]: (pieza, { datos, sitio }) => {
    const dias = planDays(datos);
    const dia = dias.length === 1 ? dias[0] : buscarPorNombre(dias, sitio, (d) => d.name);
    if (!dia) return no(sitio ? `No tiene ningún día «${sitio}»` : 'Falta decir en qué día cae');

    const { meals, fila } = reescalado(pieza, datos, dia);
    const alimentos = (pieza.carga?.options?.[0]?.foods || []).length;
    return va(
      [
        { texto: `${pieza.titulo} · ${cuenta(alimentos, 'alimento', 'alimentos')}`, marca: 'entra' },
        { texto: `Al final de «${dia.name}»` },
        ...(fila ? [fila] : []),
      ],
      { que: 'comida', dayId: dia.id, meal: meals[0] }
    );
  },

  /*
    EL DÍA. Añade un día más y no toca ninguno de los que hay. Es la regla que
    ya sigue copiar una comida a otro día (`copyMealToVariant`): copiar no
    debería poder borrar.
  */
  [TIPO.DIA_DIETA]: (pieza, { datos }) => {
    const dias = planDays(datos);
    /* Contra el primero, que es el que manda el objetivo del plan mientras no
       haya reparto del ciclo. Ver `targetsFor`. */
    const { meals, fila } = reescalado(pieza, datos, dias[0]);
    return va(
      [
        { texto: `${pieza.titulo} · ${cuenta(meals.length, 'comida', 'comidas')}`, marca: 'entra' },
        { texto: `Pasa a tener ${dias.length + 1} días; no se le toca ninguno` },
        ...(fila ? [fila] : []),
      ],
      { que: 'dia', name: pieza.titulo, meals }
    );
  },

  /*
    ══ LA DIETA ENTERA, Y ES LA ÚNICA QUE BORRA ══════════════════════════════

    Todo lo demás de este módulo AÑADE, y está escrito arriba por qué: una dieta
    no se «cierra» como un bloque, no hay lista de planes, así que escribir
    encima pierde lo que hubiera y no queda en ninguna parte.

    Por eso esta consecuencia enseña las DOS mitades —lo que entra y lo que se
    va, con nombres y con cuentas— y por eso `sustituye(tipo)` hace que la fila
    entre desmarcada en la pantalla. Marcarla es una decisión que el entrenador
    toma mirando esta columna, igual que con un condicionante que veta.

    ── Lo que viaja y lo que no ───────────────────────────────────────────────
    Viajan los días con su nombre y su menú, cada uno REESCALADO al objetivo que
    el destinatario ya tiene. No viajan sus objetivos —«mandar la misma dieta a
    ocho no es darles la misma dieta»— ni sus hábitos, pasos, cardio o
    equivalencias, que son de la persona y no del plan.

    ── Y la proporción entre días ────────────────────────────────────────────
    Con un alto/bajo, lo que define el plan no son las cifras sino la DISTANCIA
    entre ellas. El primer día se reescala al objetivo del destinatario y los
    demás guardan su proporción con él, así que un ciclado del 20 % sigue siendo
    del 20 % con otras calorías. Sin objetivo de origen no hay proporción que
    calcular y entra tal cual, dicho en la columna.
  */
  [TIPO.DIETA]: (pieza, { datos }) => {
    const suyos = planDays(datos);
    const entran = pieza.carga?.days || [];
    if (entran.length === 0) return no('La dieta que llevas no tiene ningún día');

    const suyasComidas = suyos.reduce((n, d) => n + (d.meals?.length || 0), 0);
    const suPrimero = Number(targetsFor(datos, suyos[0]?.id)?.targetKcals) || 0;
    const desde = Number(pieza.origen?.objetivoKcals) || 0;

    /*
      ── Y SE CUENTA CUÁNTOS SE HAN PODIDO REESCALAR DE VERDAD ────────────────
      `rescaleMeals` mueve lo que NO es fuente de proteína, así que hay saltos
      que no puede dar: bajar de 3.050 a 1.950 kcal en un desayuno de claras y
      huevo pide tocar precisamente lo que no se toca, y entonces devuelve
      `null` y el menú entra tal cual. Eso es correcto y hay que DECIRLO: la
      primera versión de esto escribía «Reescalada de 3.050 a 1.950» pasara lo
      que pasara, y una columna que miente en la única pantalla que escribe en
      el plan de ocho personas es peor que no tener columna.
    */
    let reescalados = 0;
    const dias = entran.map((dia) => {
      /* Cada día contra el objetivo del destinatario multiplicado por la
         proporción que ese día tenía en el plan de origen. */
      const proporcion = Number(dia.proporcion) || 1;
      const hasta = suPrimero ? Math.round(suPrimero * proporcion) : 0;
      const deEsteDia = desde ? Math.round(desde * proporcion) : 0;

      if (!hasta || !deEsteDia || deEsteDia === hasta) return { ...dia, meals: dia.meals || [] };
      const hecho = rescaleMeals(dia.meals || [], { fromKcals: deEsteDia, toKcals: hasta });
      if (hecho) reescalados += 1;
      return { ...dia, meals: hecho ? hecho.meals : dia.meals || [] };
    });

    /* Solo cuentan los días que TIENEN menú: uno vacío no se reescala y decir
       «2 de 3» por él sería contar un fallo que no ha ocurrido. */
    const conMenu = entran.filter((d) => (d.meals || []).length > 0).length;
    const laCuenta =
      reescalados === 0
        ? `Nada que mover para llegar a sus ${suPrimero} kcal: entra tal cual`
        : reescalados >= conMenu
          ? `Reescalada de ${desde} a ${suPrimero} kcal, y sus días guardan la proporción`
          : `Reescalados ${reescalados} de ${conMenu} días a sus ${suPrimero} kcal; el resto entra tal cual`;

    const total = dias.reduce((n, d) => n + (d.meals?.length || 0), 0);
    /* Sin las casillas del destinatario a mano —aquí se contesta por ocho
       personas a la vez, y cada una tiene el ciclo que tenga—: para decir «y
       pierde su reparto» basta con saber que hay algo puesto. */
    const repartida = hasCycleMap(datos);

    return va(
      [
        {
          texto: `${cuenta(dias.length, 'día', 'días')} · ${cuenta(total, 'comida', 'comidas')}`,
          marca: 'entra',
        },
        {
          texto:
            suyasComidas === 0
              ? `No tenía menú: ${cuenta(suyos.length, 'día', 'días')} en blanco`
              : `Pierde ${cuenta(suyos.length, 'día', 'días')} y ${cuenta(suyasComidas, 'comida', 'comidas')}: ${suyos
                  .map((d) => d.name)
                  .join(', ')}`,
          marca: suyasComidas === 0 ? undefined : 'sale',
        },
        !suPrimero
          ? { texto: 'No tiene objetivo puesto: entra tal cual' }
          : !desde
            ? { texto: 'Sin objetivo de origen: entra sin reescalar' }
            : desde === suPrimero
              ? null
              : { texto: laCuenta },
        { texto: 'Se le quedan sus pautas, sus pasos y su cardio' },
        /* Y su reparto del ciclo, que apunta a días que dejan de existir: se
           vacía, y a quien lo tuviera puesto hay que decírselo — es la única
           consecuencia que no se ve mirando el menú. Ver `replaceDietDays`. */
        repartida ? { texto: 'Pierde el reparto de su ciclo: hay que volver a hacerlo' } : null,
      ].filter(Boolean),
      { que: 'dieta', days: dias }
    );
  },
};

/**
 * Qué le pasa a esta persona, y qué habría que escribirle.
 *
 * @param pieza       La del portapapeles.
 * @param datos       Su programa o su dieta, YA leídos. `null` es «todavía no».
 * @param sitio       El nombre de la hoja o del día, cuando la pieza lo pide.
 * @param condiciones Sus condicionantes, para el veto.
 */
export const consecuenciaDe = ({ pieza, datos, sitio = null, condiciones = null }) => {
  const calcular = CONSECUENCIA[pieza?.tipo];
  if (!calcular) return no('Esta pieza no se puede repartir');
  if (!datos) return CARGANDO;

  const salida = calcular(pieza, { datos, sitio });
  if (salida.estado !== 'va' || !condiciones) return salida;

  /*
    ── EL VETO ───────────────────────────────────────────────────────────────
    Lo que le condiciona no se enseña como una nota al pie: una fila con un «no
    se le puede poner» entra DESMARCADA, y volver a marcarla es una decisión que
    el entrenador toma mirándolo. Los «tenlo en cuenta» se dicen y no desmarcan:
    desmarcar por todo sería lo mismo que no desmarcar por nada.
  */
  const suyos = conditionsFor(condiciones, areaDe(pieza.tipo));
  return {
    ...salida,
    veto: suyos.filter((c) => c.severity === 'block').map((c) => c.label),
    ojo: suyos.filter((c) => c.severity !== 'block').map((c) => c.label),
  };
};
