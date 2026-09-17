import { Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dumbbell, FileText, Salad, Scale, Send } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { useSesionEnCurso } from '@/context/SesionEnCurso';
import { weightSeries } from '@/domain/anthropometry';
import { abreSoloElCiclo, cicloPorAbrir, clientCycleSlots, semanaDelCliente } from '@/domain/blocks';
import { clientIntake, clientSteps, intakeDeliverables, stepDone } from '@/domain/intake';
import { dietaDeHoy } from '@/domain/nutrition';
import { onboardingState } from '@/domain/onboardingState';
import { effectiveGoal } from '@/domain/roadmap';
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
import { Loading } from '@/components/ui/primitives';
import { HojaDePortal } from './ClientLayout';
import { IntakeDeliverables } from './IntakeDeliverables';
import { useAvisos } from './useAvisos';
import { useDondeEstas } from './useDondeEstas';
import { ejerciciosConMarca, sesionDeHoy, tiraDeLaSemana } from './hoy';
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
    discardSession,
    continueProgram,
    updateClientPreferences,
  } = useApp();
  const navigate = useNavigate();
  const oculto = useOculto();
  const { seguir } = useSesionEnCurso();
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

  const hoy = useMemo(
    () => sesionDeHoy({ client: activeClient, program }),
    [activeClient, program]
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
  const ofreceNueva = Boolean(cicloPorAbrir(program));
  const seguirSolo = abreSoloElCiclo(activeClient.preferences);

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
  const dieta = dietaDeHoy(nutrition?.[activeClient.id], casillas, undefined, casillaDeHoy);
  const pasosDelDia = String(nutrition?.[activeClient.id]?.stepsGoal ?? '').trim();

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
          weekNumber: semanaActual,
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

  const kcalVisible = !oculto.nutrition && dieta?.kcal > 0;
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
            val: kcalVisible ? miles(dieta.kcal) : dieta.unica ? 'Tu dieta' : dieta.name,
            uni: kcalVisible ? 'kcal' : null,
            pie: [
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
            seguirSolo,
            onSeguirSolo: (valor) =>
              updateClientPreferences(activeClient.id, 'rutina', { seguirSolo: valor }),
          }
        : null,
    semana: semana?.days?.length > 0 ? { ...semana, days: conFecha(semana.days) } : null,
    hoy: {
      dieta: dieta
        ? {
            rotulo: dieta.unica ? 'Tu dieta' : dieta.name,
            frase: [
              kcalVisible ? `${miles(dieta.kcal)} kcal` : null,
              dieta.comidas > 0 ? `${dieta.comidas} comidas` : null,
            ]
              .filter(Boolean)
              .join(' · '),
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
      seguir({ weekNumber: laSesion.weekNumber, dayName: laSesion.nombre });
    }
    navigate('/mi/rutina/sesion');
  };
  const conMarca = laSesion
    ? ejerciciosConMarca(micros, laSesion.ejercicios, laSesion.anotadas)
    : [];
  const ultimaVez = laSesion ? ultimaVezDelDia(micros, laSesion.nombre) : null;
  const diaDeLaSemana = weekdayName(todayISO()).toUpperCase();

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

  /* «Esta semana»: lo que se entrega, dicho con sus dos piezas de siempre. */
  const pasoDeFotos = pasos.find((p) => p.id === 'fotos');
  const deLaSemana = [
    !oculto.weight && resumen.asked ? `${resumen.count} de ${resumen.target} pesajes` : null,
    pasoDeFotos ? (pasoDeFotos.hecho ? 'tus fotos, hechas' : 'tus fotos, pendientes') : null,
  ].filter(Boolean);

  const datosMovil = {
    cabecera: {
      fecha: diaCorto,
      donde: porDonde,
    },
    heroe,
    tira: tiraDeLaSemana({ client: activeClient, program }),
    /* La respuesta de su entrenador es el momento que cierra el círculo del
       producto, y vivía dos niveles dentro de su revisión. */
    respuesta: respuesta
      ? {
          que: 'Tu entrenador te ha contestado',
          cual: `${shortDate(respuesta.reviewedAt)} · ${primeraLinea(respuesta.coachNotes)}`,
          to: '/mi/evolucion',
        }
      : null,
    progreso: [
      /* El cambio va sin «kg»: la unidad ya está escrita debajo, y en un tercio
         de 390 px repetirla parte la cifra en dos líneas. */
      pesoVisible
        ? { k: 'Peso', v: kg(ahora), u: 'kg', delta: sinUnidad(deltaDe(ahora, anterior)) }
        : null,
      /* «Desde mayo» y no «desde el inicio»: el mes es un dato —cuándo empezó a
         pesarse— y cabe en una línea. */
      pesoVisible && primero !== null
        ? { k: `Desde ${mesDe(pesajes[0].date)}`, v: conSigno(ahora - primero), u: 'kg' }
        : null,
      cuantos > 0 ? { k: 'Bloque', v: String(vaPor), de: `/${cuantos}`, u: `${unidad.toLowerCase()}s` } : null,
    ].filter(Boolean),
    semana:
      pasos.length > 0
        ? {
            que: 'Esta semana',
            cual: deLaSemana.length > 0 ? deLaSemana.join(' · ') : revision?.estado || 'lo tienes todo',
            to: '/mi/evolucion',
          }
        : null,
    /* Sin nada que sumar no se pinta: «0 sesiones · 0 kg · 0 semanas» es un
       inventario de ausencias en la primera pantalla que abre. */
    record:
      total.sesiones > 0
        ? [
            { v: miles(total.sesiones), k: 'sesiones' },
            { v: enMiles(total.kilos), k: 'kg movidos' },
            { v: String(cuantos > 0 ? vaPor : micros.length), k: unidad.toLowerCase() + 's' },
          ]
        : null,
    novedades: avisos,
    mandados,
    pedidos: [
      altaPendiente
        ? {
            que: 'Cuéntanos de ti',
            cual: `${hechosDelAlta.length} de ${pasosDelAlta.length} hechos`,
            to: '/mi/alta',
          }
        : null,
      entregables.length > 0
        ? {
            que: 'De tu entrenador',
            cual: `${entregables.length} ${entregables.length === 1 ? 'cosa' : 'cosas'} preparadas`,
            verbo: 'Ver',
            onClick: () => setVerEntregables(true),
          }
        : null,
    ].filter(Boolean),
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
const faltanDe = (paso) => `falta${paso.id === 'fotos' ? 'n' : ''} ${paso.titulo.toLowerCase()}`;

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

/** «493k» — los kilos movidos de toda una vida no caben con sus seis cifras. */
const enMiles = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : miles(Math.round(n)));

/** «−3,4» — una diferencia de peso con su signo, que es lo que dice hacia dónde. */
const conSigno = (d) => {
  const r = Math.round(d * 10) / 10;
  if (r === 0) return '0';
  return `${r > 0 ? '+' : '−'}${kg(Math.abs(r))}`;
};

/** Un delta sin su unidad, para cuando la unidad ya está al lado. */
const sinUnidad = (delta) => (delta ? { ...delta, texto: delta.texto.replace(/\s*kg$/, '') } : null);

/** «mayo» — el mes de una fecha ISO, en minúscula como lo escribe el idioma. */
const mesDe = (fecha) =>
  fecha ? new Date(`${fecha}T12:00:00`).toLocaleDateString('es-ES', { month: 'long' }) : 'el inicio';

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
