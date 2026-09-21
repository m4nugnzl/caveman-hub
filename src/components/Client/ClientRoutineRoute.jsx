import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { useSesionEnCurso } from '@/context/SesionEnCurso';
import {
  blockOfWeek,
  blocksOf,
  currentBlock,
  isCurrentBlock,
  resolvedMicrocycles,
  structureOfBlock,
  weeksOfBlock,
} from '@/domain/blocks';
import { clientProtocol, isModuleOn } from '@/domain/protocol';
import {
  allSessions,
  allSessionsOfDay,
  historialDeEjercicio,
  marcasDeEjercicio,
  minutosDeSesion,
  registroDeEjercicios,
  sessionSetCount,
} from '@/domain/sessions';
import { drillsForDay, unitLabel, unitLabelPlural } from '@/domain/training';
import { localeNumber, shortDate } from '@/lib/dates';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { marcaDeEjercicio, pautaDe, sesionDeHoy } from './hoy';
import { useFichaDe } from './useFichaDe';
import { FichaDelEjercicio } from './movil/FichaDelEjercicio';
import { EntrenoEnMonitor } from './EntrenoEnMonitor';
import { PantallaEntreno as EntrenoEnTelefono } from './movil/PantallaEntreno';

/**
 * `/mi/rutina` — LA PANTALLA DE VER, en los dos aparatos.
 *
 * ══ Lo que ya no hace ══════════════════════════════════════════════════════
 *
 * Escribir. Desde el 14 de septiembre de 2026 «Entreno» y «En sesión» son dos
 * RUTAS con dos trabajos (ver `pc/PantallaEntreno`), y esta no tiene un solo
 * campo: enseña el programa, lo que llevas de cada sesión y lo que levantaste la
 * vez anterior en cada ejercicio. Lo de apuntar kilos vive en
 * `/mi/rutina/sesion` (`ClientSesionRoute`).
 *
 * Esa separación es una decisión de producto del dueño, no maquetación:
 *
 *   *«diferenciar si el cliente está en la app y le da a hacer el entreno, que
 *   le lleva a una visión solo con su entreno del día […] y la visión de pc, que
 *   el cliente ve sus entrenamientos.»*
 *
 * ══ Y por qué los dos aparatos leen de aquí ════════════════════════════════
 *
 * Porque las cuentas son las mismas —cuántas series lleva cada sesión, qué
 * levantó la última vez, qué bloques hay— y lo que cambia es qué se monta con
 * ellas. Ver `ClientLayout`.
 */
export const ClientRoutineRoute = () => {
  const { activeClient, workoutData, continueProgram } = useApp();
  const navigate = useNavigate();
  const { seguir } = useSesionEnCurso();
  const fichaDe = useFichaDe();
  const enMonitor = useMediaQuery('(min-width: 1024px)');
  const [ficha, setFicha] = useState(null);
  const [params, setParams] = useSearchParams();
  const hojaAbierta = params.get('hoja');
  /*
    QUÉ MICROCICLO SE ESTÁ MIRANDO, y por qué esto es nuevo.

    Hasta el 14 de septiembre esta pantalla enseñaba SIEMPRE el último
    microciclo escrito y no había manera de ver otro: el portal no tenía
    navegación de programa. El dueño: *«entreno no muestra la rutina, ni la
    progresión de forma cómoda, ni el bloque»*.

    Con la tira del taller montada (`TiraDelPrograma`) los bloques y los
    microciclos se pulsan, así que hace falta un «dónde estoy mirando». Es
    `null` mientras nadie toca nada, y entonces manda el de ahora: derivado, no
    almacenado, para que un microciclo borrado no deje la pantalla en blanco.

    El teléfono no lo mueve —allí no hay tira— así que se comporta exactamente
    igual que antes.
  */
  const [semanaVista, setSemanaVista] = useState(null);

  /*
    El programa CON EL PLAN PUESTO: el plan es del bloque y cada microciclo lleva
    encima sus excepciones (`resolvedMicrocycles`). Se resuelve aquí, en la
    frontera, y no en las vistas: así el cliente ve la rutina que le toca sin que
    ninguna de sus piezas tenga que saber que existen los bloques —que además es
    vocabulario del entrenador, no suyo—.
  */
  const guardado = workoutData?.[activeClient?.id];
  const program = useMemo(
    () => (guardado ? { ...guardado, microcycles: resolvedMicrocycles(guardado) } : guardado),
    [guardado]
  );
  const micros = useMemo(() => program?.microcycles || [], [program]);
  const hoy = useMemo(
    () => sesionDeHoy({ client: activeClient, program: guardado }),
    [activeClient, guardado]
  );
  /* El cajón: todos sus ejercicios por lo último que levantó en cada uno. Sale
     de un solo paso por las sesiones, no de uno por ejercicio. */
  const registro = useMemo(() => registroDeEjercicios(micros), [micros]);

  if (!activeClient) return null;

  const unidad = unitLabel(program?.cycleType);
  const unidades = unitLabelPlural(program?.cycleType);
  const semanas = micros.map((m) => m.weekNumber).sort((a, b) => a - b);
  /* El de AHORA: el último escrito. Es el que la tira marca «en curso» y el que
     manda mientras nadie navegue. */
  const semanaEnCurso = semanas[semanas.length - 1] ?? null;
  /* Y el que se está MIRANDO. Ver `semanaVista`. */
  const semanaActual = semanas.includes(semanaVista) ? semanaVista : semanaEnCurso;
  const micro = micros.find((m) => m.weekNumber === semanaActual) || null;
  const bloque = semanaActual !== null ? blockOfWeek(program, semanaActual) : null;
  const delBloque = bloque ? weeksOfBlock(program, bloque) : [];
  const vaPor = delBloque.length > 0 ? delBloque.indexOf(semanaActual) + 1 : 0;
  const porDonde =
    delBloque.length > 0 ? `${unidad.toLowerCase()} ${vaPor} de ${delBloque.length}` : null;

  /* Lo hecho de cada sesión del microciclo abierto. La cuenta sale de las
     sesiones EJECUTADAS de ese día, no del plan: es lo que la persona anotó. */
  const dias = (micro?.days || []).map((day) => {
    const sesiones = allSessionsOfDay(micro, day.dayName);
    const hechas = sesiones.length > 0 ? Math.max(...sesiones.map(sessionSetCount)) : 0;
    const series = (day.exercises || []).reduce((n, ex) => n + (ex.sets?.length || 0), 0);
    return {
      dayName: day.dayName,
      day,
      hechas,
      series,
      ejercicios: (day.exercises || []).length,
      esHoy: !hoy?.descanso && hoy?.name === day.dayName,
      tono: hechas === 0 ? 'nada' : series > 0 && hechas < series ? 'espera' : 'ok',
      estado:
        hechas === 0
          ? 'sin empezar'
          : series > 0 && hechas < series
            ? `${hechas} de ${series}`
            : 'entrenada',
    };
  });

  /*
    LA HOJA DE HOY, y ya no «la que se está mirando».

    Hasta el 14 de septiembre por la tarde esta pantalla tenía un elegido: se
    pulsaba una sesión en una lista y debajo salían sus ejercicios en otra. Con
    la rejilla del bloque puesta (`ConjuntoDelBloque`) las hojas están todas a
    la vez, así que no hay nada que elegir: lo único que sigue haciendo falta es
    saber cuál toca hoy, para el verbo de la cabecera.
  */
  const hojaDeHoy = dias.find((d) => d.esHoy) || null;

  /* Cuántas sesiones lleva anotadas, para la cabecera del teléfono. Las series
     por microciclo se contaban aquí para la caja «Cómo va el bloque» del
     monitor, que se ha ido: ahora esa cuenta la hace `blockSummary` dentro de
     `LecturasDelBloque`, y hacerla dos veces era arriesgarse a dos cifras. */
  const sesionesAnotadas = allSessions(micros).length;

  /*
    EL MICROCICLO SIGUIENTE, que el cliente se añade solo: las mismas hojas con
    sus notas, su calentamiento y sus pautas, y sin un solo número suyo (ver
    `continueProgram`). Cae siempre detrás del ÚLTIMO del bloque en curso, así
    que se cuenta desde ese bloque y no desde el que se esté mirando.

    Estuvo atado a mirar el último microciclo, y en el teléfono ni eso: el
    rediseño del 18 sep se llevó la cinta de hojas, que era donde vivía, y el
    cliente se quedó sin manera de seguir. Al crearlo se pasa a mirarlo.
  */
  const bloqueEnCurso = semanaEnCurso !== null ? blockOfWeek(program, semanaEnCurso) : null;
  const nueva = bloqueEnCurso
    ? {
        numero: weeksOfBlock(program, bloqueEnCurso).length + 1,
        onContinuar: () => {
          const creada = continueProgram(activeClient.id);
          if (creada) setSemanaVista(creada);
        },
      }
    : null;

  const irASesion = (dayName) => {
    seguir({ weekNumber: semanaActual, dayName });
    navigate('/mi/rutina/sesion');
  };

  const datosPC = {
    /*
      El bloque va como OBJETO y no como su nombre: la tira y las lecturas del
      taller trabajan sobre él —sus microciclos, su resumen, su volumen— y
      pasarles una cadena habría obligado a buscarlo otra vez dentro.
    */
    cliente: activeClient,
    program,
    bloque,
    semana: semanaActual,
    semanaEnCurso,
    esActual: bloque ? isCurrentBlock(program, bloque) : false,
    unidades,
    /* Navegar el programa: a otro bloque se entra por su último microciclo, que
       es el que tiene algo escrito. Al cambiar de sitio se suelta la hoja
       elegida a mano — la de otro microciclo no tiene por qué existir aquí. */
    onIrBloque: (b) => {
      const suyas = weeksOfBlock(program, b);
      if (suyas.length === 0) return;
      setSemanaVista(suyas[suyas.length - 1]);
    },
    onIrSemana: setSemanaVista,
    porDonde,
    unidad,
    /*
      EL VERBO DE LA CABECERA, y solo si hoy hay algo que hacer. En descanso no
      se pinta: un botón «Empezar el entreno» el día que no toca es una oferta
      que la propia rutina desmiente. Ver la ley del reposo.

      Quien quiera adelantar entra por el NOMBRE de su hoja en la rejilla, que
      es `onEntrenarHoja`.
    */
    hoy: hojaDeHoy
      ? {
          nombre: hojaDeHoy.dayName,
          verbo: hojaDeHoy.hechas > 0 ? 'Seguir el entreno' : 'Empezar el entreno',
        }
      : null,
    sesiones: dias,
    /* Entrar a entrenar una hoja cualquiera del microciclo abierto. Es lo que
       en el taller abre la hoja para escribirla: aquí no hay nada que escribir
       salvo lo que se levanta, así que la puerta lleva a la sesión. */
    onEntrenarHoja: irASesion,
    nueva,
    /*
      Aquí iba «Cómo va el bloque»: tres recuentos escritos a mano —microciclos
      escritos, series por microciclo, sesiones anotadas— en una caja del
      costado. Se van con `LecturasDelBloque`, que es la pieza del taller y dice
      lo mismo y más: el bloque en cifras con su fecha de inicio, la fuerza por
      ejercicio de este bloque y el volumen por grupo, cada una con su ventana.

      Tener las dos habría sido lo de siempre: dos recuentos del mismo dato,
      calculados de dos maneras, divergiendo el día que uno cambie.
    */
    /*
      EL LOGBOOK, y son tres MARCAS y no tres últimas veces.

      `registroDeEjercicios` ordena por lo más reciente y trae la serie más
      pesada de ESE día, que es lo correcto para el cajón del teléfono —«¿cuánto
      hice la última vez?»— y sería mentira bajo un rótulo que dice «tu mejor
      serie»: quien viene de una descarga vería su récord diez kilos por debajo
      de lo que es. La marca de verdad la da `marcasDeEjercicio` sobre el
      historial entero, y aquí son tres ejercicios: tres pasadas, no cuarenta.
    */
    logbook: registro.slice(0, 3).map((e) => {
      const { maxKg, maxReps } = marcasDeEjercicio(historialDeEjercicio(micros, e.nombre));
      return {
        nombre: e.nombre,
        marca: maxKg > 0 ? `${cifra(maxKg)} kg` : `${maxReps} reps`,
      };
    }),
  };

  /*
    ══ EL TELÉFONO: los frames `327:148` y `328:299` (18 sep 2026) ══════════

    LA PRÓXIMA SESIÓN es la de hoy si hoy se entrena; si no, la primera del
    microciclo que no está terminada. Con todas hechas no hay caja: el
    microciclo está cerrado y lo que toca es el siguiente.
  */
  const proximaDia =
    hojaDeHoy && (hojaDeHoy.series === 0 || hojaDeHoy.hechas < hojaDeHoy.series)
      ? hojaDeHoy
      : dias.find((d) => d.series > 0 && d.hechas < d.series) || null;

  /* La hoja ABIERTA antes de empezar, si la hay. Vive en la URL y no en un
     estado: el «atrás» del teléfono tiene que cerrarla, no sacarte de Entreno. */
  const diaDeLaHoja = dias.find((d) => d.dayName === hojaAbierta) || null;
  const abrirHoja = (dayName) => setParams({ hoja: dayName });
  const cerrarHoja = () => setParams({}, { replace: true });

  const protocolo = clientProtocol(activeClient.preferences);
  const conNotas = isModuleOn(protocolo, 'coachNote');

  const hoja = diaDeLaHoja
    ? (() => {
        const day = diaDeLaHoja.day;
        const minutos = (() => {
          const hechas = allSessionsOfDay(micro, day.dayName).filter((s) => s.endedAt && sessionSetCount(s) > 0);
          return hechas.length > 0 ? minutosDeSesion(hechas[hechas.length - 1]) : null;
        })();
        return {
          titulo: day.dayName,
          sub: [porDonde ? porDonde.charAt(0).toUpperCase() + porDonde.slice(1) : null, bloque?.name]
            .filter(Boolean)
            .join(' · '),
          resumen: { ejercicios: diaDeLaHoja.ejercicios, series: diaDeLaHoja.series, minutos },
          indicacion: conNotas ? String(day.coachNote || '').trim() : '',
          calentamiento: isModuleOn(protocolo, 'warmup')
            ? drillsForDay(bloque ? structureOfBlock(program, bloque) : program, day).filter((d) =>
                d.name?.trim()
              )
            : [],
          ejercicios: (day.exercises || []).map((ex, i) => {
            const suya = fichaDe(ex.name);
            return {
              id: `${ex.name}#${i}`,
              nombre: ex.name,
              pauta: pautaDe(ex),
              musculo: ex.muscle || suya?.muscle || null,
              ultima: marcaDeEjercicio(micros, ex.name).marca,
              nota: conNotas ? String(ex.coachNote || '').trim() : '',
              conFicha: Boolean(suya),
              onFicha: () => setFicha({ ejercicio: ex, nombre: ex.name }),
            };
          }),
          verbo:
            diaDeLaHoja.series > 0 && diaDeLaHoja.hechas >= diaDeLaHoja.series
              ? 'Abrir la sesión'
              : diaDeLaHoja.hechas > 0
                ? 'Continuar entrenamiento'
                : 'Iniciar entrenamiento',
          onEmpezar: () => irASesion(day.dayName),
          onVolver: cerrarHoja,
        };
      })()
    : null;

  const datosMovil = {
    hoja,
    cabecera: {
      titulo: bloque?.name || 'Tu rutina',
      sub: delBloque.length > 0 ? `${unidad} ${vaPor} de ${delBloque.length}` : `${sesionesAnotadas} sesiones apuntadas`,
      unidad: unidad.toLowerCase(),
    },
    /* Una raya por microciclo del bloque: los pasados en tinta, el de ahora en
       azul —dónde estás—, los que faltan en gris. */
    microciclos: delBloque.map((w) => (w < semanaActual ? 'hecha' : w === semanaActual ? 'ahora' : 'falta')),
    nueva,
    proxima: proximaDia
      ? {
          rotulo: proximaDia.esHoy ? 'Hoy te toca' : proximaDia.hechas > 0 ? 'A medias' : 'Próxima sesión',
          titulo: proximaDia.dayName,
          sub:
            proximaDia.hechas > 0
              ? `${proximaDia.hechas}/${proximaDia.series} series completadas`
              : `${proximaDia.ejercicios} ejercicios · ${proximaDia.series} series`,
          hechas: proximaDia.hechas,
          series: proximaDia.series,
          verbo: proximaDia.hechas > 0 ? 'Continuar sesión' : 'Iniciar sesión',
          onEmpezar: () => irASesion(proximaDia.dayName),
        }
      : null,
    sesiones: dias.map((d) => ({
      dayName: d.dayName,
      meta: `${d.series} series · ${d.ejercicios} ejercicios`,
      tono: d.tono === 'ok' ? 'hecho' : d.tono === 'espera' ? 'medias' : d.esHoy ? 'hoy' : 'nada',
      estado: d.tono === 'ok' ? 'Hecho' : d.tono === 'espera' ? `${d.hechas}/${d.series}` : d.esHoy ? 'Hoy' : 'Pendiente',
      onAbrir: () => abrirHoja(d.dayName),
    })),
    cajon: registro.slice(0, 8).map((e) => ({
      nombre: e.nombre,
      cuando: e.date ? `la última vez el ${shortDate(e.date)}` : 'sin fecha',
      marca: e.kg > 0 ? `${cifra(e.kg)} × ${e.reps}` : `${e.reps} reps`,
    })),
    onEjercicio: (e) => setFicha({ ejercicio: { name: e.nombre, sets: [] }, nombre: e.nombre }),
    bloques: blocksOf(program).map((b) => {
      const suyas = weeksOfBlock(program, b);
      const primera = micros.find((m) => m.weekNumber === suyas[0]);
      const cuando = primera?.startDate || primera?.date || null;
      return {
        id: b.id,
        mes: cuando ? mes(cuando) : '—',
        dia: cuando ? diaDelMes(cuando) : '',
        nombre: b.name,
        meta: `${suyas.length} ${unidad.toLowerCase()}${suyas.length === 1 ? '' : 's'}`,
        enCurso: currentBlock(program)?.id === b.id,
      };
    }),
  };

  return (
    <>
      {enMonitor ? (
        <EntrenoEnMonitor datos={datosPC} />
      ) : (
        <EntrenoEnTelefono datos={datosMovil} />
      )}

      {ficha && (
        <FichaDelEjercicio
          ejercicio={ficha.ejercicio}
          ficha={fichaDe(ficha.nombre)}
          historial={historialDeEjercicio(micros, ficha.nombre)}
          pauta={pautaDe(ficha.ejercicio)?.split(' × ')[1] || null}
          onClose={() => setFicha(null)}
        />
      )}
    </>
  );
};

/* Los kilos, con coma decimal y sin decimales cuando es entero: los discos son
   de 2,5 y «92.5» es notación de programa, no de español. */
const cifra = (n) => localeNumber(n, { maximumFractionDigits: 1 });

const mes = (iso) =>
  new Date(`${String(iso).slice(0, 10)}T00:00:00`)
    .toLocaleDateString('es-ES', { month: 'short' })
    .toUpperCase()
    .replace('.', '');
const diaDelMes = (iso) =>
  String(new Date(`${String(iso).slice(0, 10)}T00:00:00`).getDate()).padStart(2, '0');
