import { Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dumbbell, FileText, Salad, Scale, Send } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { useSesionEnCurso } from '@/context/SesionEnCurso';
import { weightSeries } from '@/domain/anthropometry';
import { cicloPorAbrir, clientCycleSlots, microcicloDeLaSemana, semanaDelCliente } from '@/domain/blocks';
import { clientIntake, clientSteps, intakeDeliverables, stepDone } from '@/domain/intake';
import { dietaDeHoy } from '@/domain/nutrition';
import { pautaEspecialDelDia } from '@/domain/pautaDelDia';
import {
  LA_DIETA_SIGUE_AL_PLAN,
  casillaParaLaDieta,
  diasDelCalendario,
  dietaConVariosDias,
  entrenaElDia,
  hoyLocal,
  hoySegunElPlan,
  iniciosDeMicrociclo,
  movidasDeAtrasar,
  puedeAtrasarDesde,
  resumenDelMicrociclo,
  sesionesSinDia,
  sesionesDelPlan,
} from '@/domain/planDeSesiones';
import { onboardingState } from '@/domain/onboardingState';
import { weekFromStart } from '@/domain/photos';
import { clientProtocol } from '@/domain/protocol';
import { anclaSiguiente, cuentaAtras, effectiveGoal, phaseAt } from '@/domain/roadmap';
import {
  allSessions,
  minutosDeSesion,
  sesionAMedias,
  sessionSetCount,
  sessionTonnage,
} from '@/domain/sessions';
import { clientWeek } from '@/domain/week';
import { localeNumber, miles, shortDate, todayISO, weekdayName } from '@/lib/dates';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { lazyRoute } from '@/lib/lazyRoute';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastProvider';
import { Loading } from '@/components/ui/primitives';
import { HojaDePortal } from './ClientLayout';
import { IntakeDeliverables } from './IntakeDeliverables';
import { useAvisos } from './useAvisos';
import { useDondeEstas } from './useDondeEstas';
import {
  ejerciciosConMarca,
  loUltimo,
  proximaDelMicrociclo,
  sensacionesRecientes,
  sesionDeHoy,
  tiraDeLaSemana,
  tiraPorFechas,
} from './hoy';
import { useFichaDe } from './useFichaDe';
import { useOculto } from './Oculto';
import { PantallaHoy as HoyEnMonitor } from './pc/PantallaHoy';
import { PantallaHoy as HoyEnTelefono } from './movil/PantallaHoy';

/* El alta va diferida, como su propia ruta (`/mi/alta` en `App`): se enseña la
   primera semana de cada cliente y no tiene por qué pesar en la portada de las
   demás. Es el mismo trozo para las dos entradas. */
const ClientOnboarding = lazyRoute(() =>
  import('./ClientOnboarding').then((m) => ({ default: m.ClientOnboarding }))
);

/**
 * LA PORTADA DEL CLIENTE — la capa de DATOS de las dos «Hoy».
 *
 * ══ Por qué esta pieza ya no pinta nada ════════════════════════════════════
 *
 * Desde el 14 de septiembre de 2026 el portal monta piezas distintas en cada
 * aparato: el monitor es la rejilla de cajas de `docs/estudio-cajas.html` y el
 * teléfono es la app de registro de `docs/estudio-la-app-del-cliente.html`. No
 * son la misma escritura repartida con CSS —son dos diseños, y así los eligió el
 * dueño—, así que lo que se comparte es lo único que se puede compartir: la
 * lectura.
 *
 * Aquí se hacen las cuentas una vez y se entregan hechas a `pc/PantallaHoy` o a
 * `movil/PantallaHoy`. Ninguna de las dos vuelve a preguntarle nada al dominio.
 *
 * ══ Las dos preguntas que esta pantalla contesta ═══════════════════════════
 *
 *   · «¿Voy al día?» — las cuatro teselas arriba y la mesa del microciclo.
 *   · «¿Qué hago hoy?» — la sesión, la dieta, los pasos y lo que te falta.
 *
 * ══ Y la tercera, que se perdió en la mudanza ══════════════════════════════
 *
 *   · «¿Qué me ha dicho mi entrenador?» — lo que ha cambiado desde la última
 *     vez que entró, lo que le ha mandado y lo que le contestó.
 *
 * Esa lista existía, la escribían cuatro sitios del lado del entrenador y el
 * rediseño del 14 de septiembre la dejó sin pantalla: el componente que la
 * pintaba (`ClientUpdates`) se quedó sin montar y era además **el único que
 * sellaba `feed.seen`**, así que `unseenUpdates` pasó a devolver vacío para
 * siempre. Cuatro avisos que se escribían bien y no llegaban a nadie.
 *
 * Aquí vuelve, y con ella el sello: `useAvisos({ sellar: true })` congela la
 * lista al entrar, la sella dos segundos después y trae el gesto de descartar.
 * Quien la pinta es quien la sella — por eso las dos barras, que cuentan lo
 * mismo para su punto, llaman al gancho sin sellar.
 *
 * ── Y la decisión, si la hay ───────────────────────────────────────────────
 * Una sesión a medias o el microciclo que se abre, NUNCA las dos: son dos verbos
 * delante de alguien que va a hacer una cosa. Manda la de medias, que es lo único
 * que está esperando una respuesta suya; lo otro es una oferta. Ver `la ley del
 * reposo`.
 */
export const ClientStart = () => {
  const {
    activeClient,
    equipment,
    checkIns,
    nutrition,
    phases,
    anchors,
    progressPhotos,
    discardSession,
    continueProgram,
    updateClientPreferences,
    isCoach,
    sessionPlans,
    atrasarSesiones,
    deshacerAtraso,
    hechos,
  } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const oculto = useOculto();
  const { seguir } = useSesionEnCurso();
  const fichaDe = useFichaDe();
  const enMonitor = useMediaQuery('(min-width: 1024px)');
  /* Lo que le ha dicho su entrenador y lo que le ha mandado. Esta pantalla es
     la que lo enseña, así que es la que lo sella: ver `useAvisos`. */
  const { novedades, pendientes, quitar } = useAvisos({ sellar: true });
  /* La capa de lo que su entrenador le dejó preparado. No es una ruta —son dos o
     tres enlaces— ver `la app es panel, no documento`. */
  const [verEntregables, setVerEntregables] = useState(false);

  /* Dónde está y cómo va su semana: la misma lectura que el carril del
     escritorio. Ver `useDondeEstas`. */
  const donde = useDondeEstas();
  const { program, micros, historial } = donde;
  const casillas = useMemo(
    () => (activeClient ? clientCycleSlots(activeClient, program) : []),
    [program, activeClient]
  );
  const casillaDeHoy = useMemo(
    () => semanaDelCliente(activeClient, program, casillas)?.find((d) => d.esHoy)?.key || null,
    [activeClient, program, casillas]
  );
  /* El récord: lo que lleva sumado desde que empezó. Es la pieza que hace que la
     app valga sin entrenador —el plan caduca, el registro no— y en el teléfono
     abre el segundo tercio de la portada. */
  const total = useMemo(() => {
    const sesiones = allSessions(micros);
    return sesiones.reduce(
      (acc, s) => ({
        sesiones: acc.sesiones + 1,
        series: acc.series + sessionSetCount(s),
        kilos: acc.kilos + sessionTonnage(s),
      }),
      { sesiones: 0, series: 0, kilos: 0 }
    );
  }, [micros]);

  /* El plan de sus sesiones (0138): la fecha que da el patrón a cada una, o la
     que él le dio al atrasarla. Ver `domain/planDeSesiones`. */
  const hoyDelAparato = hoyLocal();
  const suyos = useMemo(
    () => (sessionPlans || []).filter((p) => p.client_id === activeClient?.id),
    [sessionPlans, activeClient?.id]
  );
  const delPlan = useMemo(
    () => (program ? sesionesDelPlan({ program, client: activeClient, plans: suyos, hoy: hoyDelAparato }) : []),
    [program, activeClient, suyos, hoyDelAparato]
  );

  const hoy = useMemo(
    () => hoySegunElPlan(sesionDeHoy({ client: activeClient, program }), delPlan, micros, hoyDelAparato),
    [activeClient, program, delPlan, micros, hoyDelAparato]
  );

  if (!activeClient) return null;

  /*
    ══ Mientras no haya empezado, su alta manda sobre TODO ════════════════════
    A alguien que aún no ha contestado el cuestionario se le estaba pidiendo la
    tercera cosa antes que la primera.
  */
  const intake = clientIntake(activeClient.preferences);
  const estadoAlta = onboardingState({
    client: activeClient,
    equipment,
    checkIn: checkIns?.[activeClient.id],
  });
  const pasosDelAlta = clientSteps(intake);
  const hechosDelAlta = pasosDelAlta.filter((p) => stepDone(p, activeClient, intake, estadoAlta));
  const altaPendiente = hechosDelAlta.length < pasosDelAlta.length;

  /* «Sábado 13 de septiembre», la fecha entera y en voz baja. Se le quitan dos
     cosas al idioma: la coma que el español pone tras el día de la semana y la
     minúscula inicial de `toLocaleDateString`, que aquí abre la línea. */
  const crudo = weekdayName(todayISO(), { conFecha: true }).replace(',', '');
  const diaDeHoy = crudo.charAt(0).toUpperCase() + crudo.slice(1);
  /* En el teléfono la cabecera lleva solo «Sábado 13»: el mes se sabe, y la
     línea de debajo se gasta en un dato que no —por dónde vas—. */
  const diaCorto = diaDeHoy.split(' de ')[0];

  const { semanaActual, unidad, cuantos, vaPor, porDonde } = donde;

  /* La misma lectura que usa la revisión de su entrenador (`clientWeek`): lo
     programado y lo ejecutado de cada día, bajo una misma semana. */
  const semana = clientWeek({
    microcycles: micros,
    history: historial,
    startDate: activeClient.startDate,
    weekNumber: semanaActual,
  });

  const aMedias = sesionAMedias(micros);
  /* Cuándo le toca uno nuevo lo dice el DOMINIO y no esta pantalla: la misma
     regla la pregunta el automatismo de «que el siguiente se abra solo». */
  const ofreceNueva = Boolean(cicloPorAbrir(program, activeClient));
  const ponerSeguirSolo = (valor) =>
    updateClientPreferences(activeClient.id, 'rutina', { seguirSolo: valor });

  /*
    ══ LA PREGUNTA DE SI EL SIGUIENTE SE ABRE SOLO ═══════════════════════════

    El automatismo existía (`useCicloAutomatico`), pero su interruptor vivía en
    la cinta de hojas del teléfono y se fue con ella el 18 sep: nadie podía
    pedirlo. Ahora se PREGUNTA, una vez, en la portada y junto a la sesión, que
    es donde se decide cómo se entrena. Contestada —sí o no—, deja de salir y se
    cambia desde «Lo tuyo».

    «Sin contestar» es que la clave no exista, no que sea falsa: `false` es un
    «no» dicho, y volver a preguntárselo sería no haberle escuchado.

    Con «Ver como» no sale: la preferencia es del cliente, no de quien mira.
  */
  const contestado = typeof activeClient.preferences?.rutina?.seguirSolo === 'boolean';
  const preguntaDelCiclo =
    !isCoach && !contestado && micros.length > 0
      ? {
          unidad: unidad.toLowerCase(),
          onSi: () => ponerSeguirSolo(true),
          onNo: () => ponerSeguirSolo(false),
        }
      : null;

  const pesajes = weightSeries(historial);
  const objetivo = effectiveGoal(activeClient, phases, todayISO())?.targetWeightKg ?? null;

  const { entrega, periodo, sinEntregar, resumen, pasos, pasosHechos, loQueFalta } = donde;

  const revision = sinEntregar
    ? {
        /* La misma frase, palabra por palabra, que la cabecera de «Tu revisión»:
           el vocabulario de la interfaz es la señalización del producto. */
        estado: periodo?.tarde
          ? `todavía puedes mandar la del ${shortDate(periodo.dueOn)}`
          : periodo?.isDue
            ? 'te toca hoy'
            : periodo?.dueOn
              ? `la entregas el ${shortDate(periodo.dueOn)}`
              : 'cuando la tengas',
        espera: Boolean(periodo?.isDue),
      }
    : null;

  /* Lo último que le dijo su entrenador. Solo si hay respuesta escrita: una fila
     que dijera «revisada» sin traer sus palabras sería un acuse de recibo. */
  const respuesta = entrega?.reviewedAt && entrega?.coachNotes ? entrega : null;

  /*
    ══ LO QUE LE HA MANDADO, y solo eso de todo lo que cuenta `useAvisos` ═════

    Los pendientes de la SEMANA —los pesajes y las medidas— ya los dice esta
    pantalla en la fila de la entrega, con su «te falta …». Repetirlos aquí
    sería la misma reclamación dos veces y con distinta caja. Lo que le ha
    mandado a mano —un formulario, un vídeo, un documento, algo que le pide—
    no lo dice ninguna otra pieza de la portada.
  */
  const mandados = pendientes.filter((p) => p.de === 'mandado');
  /* Las novedades con su gesto de descartar ya cogido: las dos pantallas pintan
     lo que se les da y no saben nada de preferencias. */
  const avisos = novedades.map((n) => ({ ...n, onQuitar: () => quitar(n) }));

  const entregables = intakeDeliverables(intake);
  /* La dieta sigue al plan (`LA_DIETA_SIGUE_AL_PLAN`): si hoy se entrena lo
     dicen sus sesiones, no la casilla. */
  const suDieta = nutrition?.[activeClient.id];
  const entrenaHoy = entrenaElDia(hoyDelAparato, { items: delPlan, micros, hoy: hoyDelAparato });
  const dieta = dietaDeHoy(suDieta, casillas, undefined, casillaParaLaDieta(suDieta, casillas, casillaDeHoy, entrenaHoy));
  const pasosDelDia = String(nutrition?.[activeClient.id]?.stepsGoal ?? '').trim();
  /* Un refeed o un diet break hoy: sus kcal mandan sobre las de la dieta, y su
     indicación va con ellas (ver `Client/DiaEspecial`). */
  const especial = dieta ? pautaEspecialDelDia(hechos, hoyDelAparato) : null;
  const kcalDeHoy = especial?.kcals > 0 ? especial.kcals : dieta?.kcal;

  /* La sesión que se ofrece en la portada: la de medias manda sobre la de hoy. */
  const diaDeMedias = aMedias
    ? micros
        .find((m) => m.weekNumber === aMedias.weekNumber)
        ?.days?.find((d) => d.dayName === aMedias.dayName) || null
    : null;
  const laSesion = aMedias
    ? {
        viva: true,
        nombre: aMedias.dayName,
        hechas: aMedias.hechas,
        series: aMedias.series,
        ejercicios: diaDeMedias?.exercises || aMedias.session.entries || [],
        /* Lo ANOTADO sale de la sesión y los ejercicios del plan: son dos cosas
           distintas, y contar las series hechas sobre el plan daba la regla
           llena sin haber entrenado nada. Ver `ejerciciosConMarca`. */
        anotadas: aMedias.session.entries || [],
        weekNumber: aMedias.weekNumber,
      }
    : hoy && !hoy.descanso
      ? {
          viva: false,
          nombre: hoy.name,
          hechas: hoy.logged,
          series: hoy.planned,
          ejercicios: hoy.day?.exercises || [],
          anotadas: [],
          weekNumber: hoy.weekNumber ?? semanaActual,
          vez: hoy.vez,
        }
      : null;

  const irASeguir = () => {
    if (laSesion) seguir({ weekNumber: laSesion.weekNumber, dayName: laSesion.nombre });
    navigate('/mi/rutina');
  };

  const puertas = [
    entregables.length > 0
      ? {
          icono: FileText,
          rotulo: 'De tu entrenador',
          frase: 'lo que te dejó preparado al empezar',
          cifra: entregables.length,
          onClick: () => setVerEntregables(true),
        }
      : null,
  ].filter(Boolean);

  /*
    ══ SI EL ALTA ES LO ÚNICO QUE HAY, «HOY» ES EL ALTA ═══════════════════════
    A quien acaba de entrar sin plan, la portada le enseñaba cuatro teselas que
    no salían, «Lo de hoy» sin filas y un aviso con «Seguir» que llevaba a otra
    pantalla. Su única tarea es contarle de sí mismo a su entrenador, así que se
    le pone delante y ya. En cuanto haya algo más —un plan, una sesión, algo que
    le hayan mandado o dicho—, vuelve la portada con el aviso encima.

    Lo que su entrenador le dejó preparado al empezar solo tiene puerta en la
    portada, así que viaja con el alta: sin eso, quien tiene un vídeo de
    bienvenida se quedaría sin forma de llegar a él justo la primera semana.
  */
  const soloElAlta =
    altaPendiente &&
    !laSesion &&
    !aMedias &&
    !ofreceNueva &&
    !dieta &&
    total.sesiones === 0 &&
    !(semana?.sessions?.planned > 0) &&
    mandados.length === 0 &&
    avisos.length === 0 &&
    !respuesta;

  if (soloElAlta) {
    return (
      <HojaDePortal>
        <Suspense fallback={<Loading />}>
          <div className="stack">
            <ClientOnboarding />
            <IntakeDeliverables client={activeClient} />
          </div>
        </Suspense>
      </HojaDePortal>
    );
  }

  const kcalVisible = !oculto.nutrition && kcalDeHoy > 0;
  const pesoVisible = !oculto.weight && pesajes.length > 0;
  const ahora = pesoVisible ? pesajes[pesajes.length - 1].value : null;
  const anterior = pesoVisible && pesajes.length > 1 ? pesajes[pesajes.length - 2].value : null;
  const primero = pesoVisible && pesajes.length > 1 ? pesajes[0].value : null;

  /* ── Lo que lee el monitor ─────────────────────────────────────────────── */
  const datosPC = {
    nombre: activeClient.name?.split(' ')[0] || activeClient.name,
    diaDeHoy,
    porDonde,
    unidad,
    teselas: [
      pesoVisible
        ? {
            rot: 'Tu peso',
            icono: Scale,
            val: kg(ahora),
            uni: 'kg',
            delta: deltaDe(ahora, anterior),
            pie:
              resumen.average !== null
                ? `media de la semana ${kg(resumen.average)}`
                : null,
          }
        : null,
      semana?.sessions?.planned > 0
        ? {
            rot: 'Esta semana',
            icono: Dumbbell,
            val: String(semana.sessions.done),
            uni: `de ${semana.sessions.planned}`,
            pie: 'sesiones anotadas',
          }
        : null,
      dieta
        ? {
            rot: 'Hoy te toca',
            icono: Salad,
            val: kcalVisible ? miles(kcalDeHoy) : especial ? especial.nombre : dieta.unica ? 'Tu dieta' : dieta.name,
            uni: kcalVisible ? 'kcal' : null,
            pie: [
              especial ? especial.nombre.toLowerCase() : null,
              hoy?.descanso ? 'descanso' : laSesion ? laSesion.nombre.toLowerCase() : null,
              dieta.comidas > 0 ? `${dieta.comidas} comidas` : null,
            ]
              .filter(Boolean)
              .join(' · '),
          }
        : null,
      pasos.length > 0
        ? {
            rot: 'Para entregar',
            icono: Send,
            val: String(pasosHechos),
            uni: `de ${pasos.length}`,
            pie: loQueFalta ? `te ${faltanDe(loQueFalta)}` : 'lo tienes todo',
          }
        : null,
    ].filter(Boolean),
    alta: altaPendiente
      ? {
          frase: `Tu entrenador lo necesita para montarte el plan — ${hechosDelAlta.length} de ${pasosDelAlta.length} hechos.`,
        }
      : null,
    media: aMedias
      ? {
          nombre: aMedias.dayName,
          cuando: cuandoSeQuedo(aMedias.session),
          hechas: aMedias.hechas,
          series: aMedias.series,
          ejercicios: aMedias.ejercicios,
          conAlgo: aMedias.conAlgo,
          onSeguir: irASeguir,
          /* Decidir con cuatro series sin saber que son cuatro no es decidir. */
          queSePierde: `Descartarla y perder ${aMedias.hechas === 1 ? 'la serie' : `las ${aMedias.hechas} series`} que apuntaste`,
          onDescartar: () =>
            discardSession(activeClient.id, aMedias.weekNumber, aMedias.session.id),
        }
      : null,
    nueva:
      !aMedias && ofreceNueva
        ? {
            rotulo: `Has cerrado el ${unidad.toLowerCase()} ${vaPor}`,
            numero: vaPor + 1,
            onContinuar: () => {
              if (continueProgram(activeClient.id)) navigate('/mi/rutina');
            },
          }
        : null,
    preguntaDelCiclo,
    semana: semana?.days?.length > 0 ? { ...semana, days: conFecha(semana.days) } : null,
    hoy: {
      dieta: dieta
        ? {
            rotulo: especial
              ? `${especial.nombre}${especial.dias > 1 ? `, día ${especial.dia} de ${especial.dias}` : ''}`
              : dieta.unica
                ? 'Tu dieta'
                : dieta.name,
            frase: [
              kcalVisible ? `${miles(kcalDeHoy)} kcal` : null,
              dieta.comidas > 0 ? `${dieta.comidas} comidas` : null,
            ]
              .filter(Boolean)
              .join(' · '),
            nota: especial?.nota || null,
          }
        : null,
      entreno: hoy?.descanso
        ? { rotulo: 'Descansas', frase: null, descanso: true }
        : laSesion
          ? {
              rotulo: laSesion.nombre,
              frase: laSesion.series > 0 ? `${laSesion.hechas} de ${laSesion.series} series` : null,
            }
          : null,
      pasos: pasosDelDia ? (Number(pasosDelDia) ? miles(pasosDelDia) : pasosDelDia) : null,
      pesaje: oculto.weight
        ? null
        : resumen.asked
          ? `${resumen.count} de ${resumen.target} esta semana`
          : `${resumen.count} esta semana`,
      revision: revision
        ? {
            frase: loQueFalta ? `te ${faltanDe(loQueFalta)}` : revision.estado,
            pildora:
              pasos.length > 0
                ? {
                    tono: revision.espera ? 'espera' : 'nada',
                    texto: `${pasosHechos} de ${pasos.length}`,
                  }
                : null,
          }
        : null,
    },
    peso: pesoVisible
      ? {
          ahora: kg(ahora),
          desde: primero !== null ? kg(primero) : null,
          objetivo: objetivo ? kg(objetivo) : null,
          delta: deltaDe(ahora, primero),
          serie: pesajes.map((p) => p.value),
        }
      : null,
    respuesta: respuesta
      ? { texto: respuesta.coachNotes, cuando: `Revisión del ${shortDate(respuesta.reviewedAt)}` }
      : null,
    novedades: avisos,
    mandados,
    puertas,
  };

  /* ── Y lo que lee el teléfono ──────────────────────────────────────────── */
  /*
    ══ EL HÉROE: el gesto del día, y nunca vacío ══════════════════════════════

    Es la pantalla 1 de `docs/la-sesion-manda.md`. La portada no enseña un
    menú: dice lo único que hay que hacer ahora y lo pone a un toque.

      · Con sesión (la de hoy o la que dejó a medias) → entrar a entrenar, y
        directo a la sesión, no a la lista de días.
      · Día de descanso con la semana por entregar → pesarse y las fotos.
      · Descanso y nada pendiente → que descansa. Es un hecho, y el único que
        hay que dar ese día.

    «Hoy» se retiró una vez porque la mayoría de los días no tenía nada que
    decir. Esto no es aquello: por construcción siempre dice algo.
  */
  const irASesion = () => {
    if (laSesion && Number.isFinite(laSesion.weekNumber)) {
      seguir({ weekNumber: laSesion.weekNumber, dayName: laSesion.nombre, vez: laSesion.vez });
    }
    navigate('/mi/rutina/sesion');
  };
  const conMarca = laSesion
    ? ejerciciosConMarca(micros, laSesion.ejercicios, laSesion.anotadas)
    : [];
  const ultimaVez = laSesion ? ultimaVezDelDia(micros, laSesion.nombre) : null;
  const diaDeLaSemana = weekdayName(todayISO()).toUpperCase();

  /* Sin sesión de HOY que ofrecer —no hay reparto por días, o el ciclo es
     rotativo— el bloque del entreno no se cae: ofrece la siguiente del
     microciclo, la misma que la caja «Próxima sesión» de Entreno. En un día de
     descanso del reparto no: ese día lo que toca es descansar. */
  const ultimo = micros[micros.length - 1];
  const proxima =
    !laSesion && !hoy?.descanso && ultimo
      ? proximaDelMicrociclo(micros, microcicloDeLaSemana(program, ultimo.weekNumber, activeClient))
      : null;
  const ejerciciosDelHeroe = laSesion?.ejercicios || proxima?.day?.exercises || [];

  const heroe = laSesion
    ? {
        viva: laSesion.viva,
        rotulo: laSesion.viva
          ? `La dejaste a medias · ${cuandoSeQuedo(aMedias.session)}`
          : `Hoy · ${diaDeLaSemana}`,
        titulo: laSesion.nombre,
        sub: [
          `${conMarca.length} ${conMarca.length === 1 ? 'ejercicio' : 'ejercicios'}`,
          laSesion.series > 0
            ? laSesion.viva
              ? `${laSesion.hechas} de ${laSesion.series} series`
              : `${laSesion.series} series`
            : null,
          ultimaVez?.minutos ? `unos ${ultimaVez.minutos} min` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        verbo: laSesion.viva ? 'Seguir la sesión' : 'Empezar sesión',
        onVerbo: irASesion,
        pie: ultimaVez
          ? `La última vez: ${miles(ultimaVez.kilos)} kg${ultimaVez.minutos ? ` en ${ultimaVez.minutos} min` : ''}`
          : null,
      }
    : hoy?.descanso
      ? {
          viva: false,
          rotulo: `Hoy · ${diaDeLaSemana}`,
          titulo: revision ? 'Pésate y sube tus fotos' : 'Descansas',
          sub: revision
            ? loQueFalta
              ? `Hoy no entrenas · te ${faltanDe(loQueFalta)}`
              : `Hoy no entrenas · ${revision.estado}`
            : 'Hoy no te toca entreno',
          verbo: revision ? 'Ir a tu revisión' : null,
          to: revision ? '/mi/evolucion' : null,
          pie: null,
        }
      : proxima
        ? {
            viva: false,
            rotulo: 'Tu próximo entreno',
            titulo: proxima.dayName,
            sub: null,
            verbo: proxima.hechas > 0 ? 'Continuar entrenamiento' : 'Iniciar entrenamiento',
            onVerbo: () => {
              seguir({ weekNumber: proxima.weekNumber, dayName: proxima.dayName });
              navigate('/mi/rutina/sesion');
            },
            pie: null,
          }
      : revision
        ? {
            viva: false,
            rotulo: 'Esta semana',
            titulo: 'Cierra la semana',
            sub: loQueFalta ? `te ${faltanDe(loQueFalta)}` : revision.estado,
            verbo: 'Ir a tu revisión',
            to: '/mi/evolucion',
            pie: null,
          }
        : null;

  /*
    ══ EL TELÉFONO: el frame `327:8` (18 sep 2026) ═══════════════════════════

    La cabecera saluda y dice dónde estás en tres escalas —la semana desde que
    empezó, el microciclo del bloque y la fase de su plan—; cada una sale solo
    si existe. Luego la semana, el entreno de hoy con los grupos que toca, lo
    que su entrenador le ha dejado, el peso, las sensaciones y lo último.
  */
  const semanaDesdeAlta = activeClient.startDate ? weekFromStart(activeClient.startDate, todayISO()) : null;
  const fase = phaseAt(phases, todayISO());
  /* Y hacia dónde va, si su entrenador le ha fijado un destino (0122): la
     cuarta escala. «Nacional: faltan 14 semanas». */
  const destino = anclaSiguiente(anchors, todayISO());
  const cuenta = destino ? cuentaAtras(destino, todayISO()) : null;
  const nombrePila = String(activeClient.name || '').trim().split(/\s+/)[0] || '';

  /* Sin reparto por días, la semana del calendario con lo que entrenó: la fila
     de siete discos es lo primero del dibujo y no se cae por falta de plan. */
  const tira = tiraDeLaSemana({ client: activeClient, program }) || tiraPorFechas({ micros });
  const indiceHoy = tira ? tira.findIndex((d) => d.hoy) : -1;

  /* Los grupos que toca hoy, del propio ejercicio o de su ficha del catálogo,
     sin repetir y como mucho tres: son chapas, no un índice. */
  const etiquetas = ejerciciosDelHeroe.length > 0
    ? [
        ...new Set(
          ejerciciosDelHeroe
            .map((ex) => String(ex.muscle || fichaDe(ex.name)?.muscle || '').trim())
            .filter(Boolean)
        ),
      ].slice(0, 3)
    : [];

  const sensaciones = sensacionesRecientes(micros, clientProtocol(activeClient.preferences));
  const fotosSuyas = (progressPhotos || []).filter((p) => p.clientId === activeClient.id);

  /* ── El calendario: abrir una sesión y atrasar desde un día ─────────────── */
  const abrirDelCalendario = (s) => {
    seguir({ weekNumber: s.weekNumber, dayName: s.hoja, vez: s.vez ?? undefined, sessionId: s.sessionId || undefined });
    navigate('/mi/rutina/sesion');
  };

  const atrasar = async (desde, dias) => {
    const calculo = movidasDeAtrasar(delPlan, desde, dias, hoyDelAparato);
    if (!calculo.ok) {
      toast({ text: calculo.motivo });
      return calculo;
    }
    const res = await atrasarSesiones(activeClient.id, { desde, dias, movidas: calculo.movidas });
    if (!res.ok) {
      toast({ text: res.error });
      return res;
    }
    try {
      navigator.vibrate?.(8);
    } catch {
      /* Sin vibración, el aviso basta. */
    }
    toast({
      text: `Atrasado ${dias} ${dias === 1 ? 'día' : 'días'}`,
      action: {
        label: 'Deshacer',
        onClick: async () => {
          const vuelta = await deshacerAtraso(res.id);
          if (!vuelta.ok) toast({ text: vuelta.error });
        },
      },
    });
    return res;
  };

  const datosMovil = {
    preguntaDelCiclo,
    cabecera: {
      titulo: nombrePila ? `Hola, ${nombrePila}` : diaCorto,
      sub: [
        semanaDesdeAlta ? `Semana ${semanaDesdeAlta}` : null,
        cuantos > 0 ? `${unidad} ${vaPor}` : null,
        fase?.title || null,
        destino && cuenta ? `${destino.title}: ${cuenta.texto}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || diaCorto,
    },
    dias: tira ? tira.map((d, i) => ({ ...d, pasado: indiceHoy >= 0 && i < indiceHoy })) : null,
    calendario: {
      hoy: hoyDelAparato,
      dias: diasDelCalendario({ items: delPlan, micros }),
      resumen: resumenDelMicrociclo(delPlan),
      sinDia: sesionesSinDia(delPlan),
      /* Sin ninguna fecha, un día vacío no es «descanso»: no hay reparto. */
      conDias: delPlan.some((i) => i.fechaPlan),
      inicios: iniciosDeMicrociclo(micros),
      ajustaDieta: LA_DIETA_SIGUE_AL_PLAN && dietaConVariosDias(suDieta),
      /* «Ver como» no atrasa: es cosa del cliente, y su entrenador recibe el aviso. */
      puedeAtrasar: (fecha) => !isCoach && puedeAtrasarDesde(delPlan, fecha, hoyDelAparato),
      vistaPrevia: (fecha, n) => movidasDeAtrasar(delPlan, fecha, n, hoyDelAparato),
      onAbrir: abrirDelCalendario,
      onAtrasar: atrasar,
    },
    entreno: heroe
      ? {
          ...heroe,
          /* El rótulo del dibujo cuando es la sesión de hoy; el que ya había
             cuando la dejó a medias o descansa, que dice más. */
          rotulo: laSesion && !laSesion.viva ? 'Tu entreno de hoy' : heroe.rotulo,
          verbo: laSesion ? (laSesion.viva ? 'Continuar entrenamiento' : 'Iniciar entrenamiento') : heroe.verbo,
          etiquetas,
          hechas: laSesion ? laSesion.hechas : proxima ? proxima.hechas : 0,
          series: laSesion ? laSesion.series : proxima ? proxima.series : 0,
        }
      : null,
    /* Lo que su entrenador le ha dejado: su respuesta, lo que ha cambiado y lo
       que le ha mandado, y lo que queda del alta. Una sola lista. */
    recados: [
      respuesta
        ? {
            id: 'respuesta',
            que: 'Tu entrenador te ha contestado',
            cual: `${shortDate(respuesta.reviewedAt)} · ${primeraLinea(respuesta.coachNotes)}`,
            to: '/mi/evolucion',
            verbo: 'Leer',
          }
        : null,
      altaPendiente
        ? {
            id: 'alta',
            que: 'Cuéntanos de ti',
            cual: `${hechosDelAlta.length} de ${pasosDelAlta.length} hechos`,
            to: '/mi/alta',
          }
        : null,
      entregables.length > 0
        ? {
            id: 'entregables',
            que: 'Te ha preparado',
            cual: `${entregables.length} ${entregables.length === 1 ? 'cosa' : 'cosas'}`,
            verbo: 'Ver',
            onClick: () => setVerEntregables(true),
          }
        : null,
      ...avisos.map((n) => ({
        id: n.id,
        que: n.label,
        cual: n.hint,
        to: n.href || undefined,
        onQuitar: n.onQuitar,
        etiqueta: `Descartar «${n.label}»`,
      })),
      ...mandados.map((m) => ({ id: m.id, que: m.label, cual: m.hint, to: m.href })),
    ].filter(Boolean),
    peso: pesoVisible
      ? {
          valor: kg(ahora),
          /* El cambio contra el pesaje anterior, en tinta y con su signo: bajar
             no es «bien» para quien está ganando masa. */
          delta: anterior !== null ? `${conSigno(ahora - anterior)} kg` : null,
          puntos: pesajes.slice(-8).map((p) => p.value),
          to: '/mi/evolucion/peso',
        }
      : null,
    sensaciones:
      sensaciones.length > 0
        ? {
            items: sensaciones,
            cuando: sensaciones[0].cuando ? `del ${shortDate(sensaciones[0].cuando)}` : '',
          }
        : null,
    ultimo: loUltimo({
      micros,
      historial,
      fotos: fotosSuyas,
      entrega,
      sinPeso: oculto.weight,
    }),
  };

  return (
    <>
      {enMonitor ? <HoyEnMonitor datos={datosPC} /> : <HoyEnTelefono datos={datosMovil} />}

      {/* Los entregables abren una CAPA y no una ruta: son dos o tres enlaces
          que se abren fuera de la aplicación, y una URL propia para eso sería
          una pantalla a la que nunca se vuelve. */}
      {verEntregables && (
        <Modal open title="De tu entrenador" onClose={() => setVerEntregables(false)}>
          <IntakeDeliverables client={activeClient} desnudo />
        </Modal>
      )}
    </>
  );
};

/* El peso se dice con su decimal: la báscula da uno, y quitarlo hace dudar de
   si la cifra está redondeada. */
const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** El delta de una cifra contra otra, con su tono. Baja verde, sube rojo. */
const deltaDe = (ahora, antes) => {
  if (ahora === null || antes === null || ahora === undefined || antes === undefined) return null;
  const d = Math.round((ahora - antes) * 10) / 10;
  if (d === 0) return { tono: 'quieta', texto: 'igual' };
  return {
    tono: d < 0 ? 'baja' : 'sube',
    texto: `${d < 0 ? '↓' : '↑'} ${kg(Math.abs(d))} kg`,
  };
};

/** «te faltan las medidas» — lo primero que falta, dicho corto. */
/* El verbo concuerda con lo que falta: «tus medidas» y «tus fotos» son plural. */
const faltanDe = (paso) => {
  const que = paso.titulo.toLowerCase();
  return `falta${/^(tus|las|los)\s/.test(que) ? 'n' : ''} ${que}`;
};

/** Cuándo se quedó a medias: la hora si la hay, el día si no. */
const cuandoSeQuedo = (session) => {
  if (session?.startedAt) {
    return new Date(session.startedAt).toLocaleString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return session?.date ? shortDate(session.date) : null;
};

/** «−3,4» — una diferencia de peso con su signo, que es lo que dice hacia dónde. */
const conSigno = (d) => {
  const r = Math.round(d * 10) / 10;
  if (r === 0) return '0';
  return `${r > 0 ? '+' : '−'}${kg(Math.abs(r))}`;
};

/** La primera línea de lo que escribió su entrenador, y corta. */
const primeraLinea = (texto) => {
  const linea = String(texto || '').split('\n').find((l) => l.trim()) || '';
  return linea.length > 60 ? `${linea.slice(0, 57).trimEnd()}…` : linea.trim();
};

/**
 * LA ÚLTIMA VEZ QUE HIZO ESTE DÍA: los kilos y lo que tardó.
 *
 * Solo sesiones cerradas y con algo anotado: una a medias no dice cuánto se
 * tarda en hacerla. Los minutos, solo si se midieron (`minutosDeSesion`).
 */
const ultimaVezDelDia = (micros, dayName) => {
  const sesiones = allSessions(micros).filter(
    (s) => s.dayName === dayName && s.endedAt && sessionSetCount(s) > 0
  );
  const ultima = sesiones[sesiones.length - 1];
  if (!ultima) return null;
  return { kilos: Math.round(sessionTonnage(ultima)), minutos: minutosDeSesion(ultima) };
};

/** La fecha real en que entrenó, que es lo que hace legible «lo hizo el sábado». */
const conFecha = (days) =>
  days.map((d) => ({ ...d, cuando: d.date ? shortDate(d.date) : null }));
