import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Flag, Route } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { entrenaPorSuCuenta, resolvedMicrocycles, splitDelBloque, tramosDeLosBloques } from '@/domain/blocks';
import { clientGoal, directionById } from '@/domain/goals';
import { estadoDe, impactoDe, intervencionesDelCliente, kcalDelCambio, MAX_DIAS_DE_VENTANA, ventanasDe } from '@/domain/intervenciones';
import { entrenoDeLasSemanas } from '@/domain/lenteDeEntreno';
import { metricColor } from '@/domain/metrics';
import { activeQuestions, checkinQuestions, clientProtocol } from '@/domain/protocol';
import { casillasDeLaSemana, esIntervencion, kcalsDeIntervencion, pautaDeLosDias, tiposDeLaSemana } from '@/domain/pautaDelDia';
import { mejorMarcaEntre, rendimientoDeLaTemporada } from '@/domain/rendimiento';
import { rangoAParam, rangoDeParam, resumenDelRango } from '@/domain/resumenDelRango';
import { sortPhases } from '@/domain/roadmap';
import { HECHO_KINDS, tramoDeFechas } from '@/domain/semanasDelPlan';
import { allSessions } from '@/domain/sessions';
import { addDays, daysBetween, localeNumber, weekStart } from '@/lib/dates';
import { traeALaVista } from '@/lib/motion';
import { useElementWidth } from '@/lib/useElementWidth';
import { useEsTelefono } from '@/lib/useMediaQuery';
import { semanaPath } from '@/routes';
import { usePautaFechada } from '@/components/nutrition/usePautaFechada';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { EmptyState, SegmentedControl } from '@/components/ui/primitives';
import { Calendario } from './Calendario';
import { semanasDelCalendario } from './semanasDelCalendario';
import { altoDeEscalones, CarrilDeEscalones } from './CarrilDeEscalones';
import {
  capasDeLaVista,
  capasDisponibles,
  celdasDeCheckin,
  celdasDeEntrenos,
  celdasDeSesionPorDia,
  celdasDeSesionPorSemana,
  escalaDe,
  GRUPOS,
  mismasCapas,
  moverCapa,
  quitarCapa,
  vistaPorDefecto,
} from './capas';
import { CarrilPeso } from './CarrilPeso';
import { EjeDeTiempo } from './EjeDeTiempo';
import { FilaDeCapa } from './FilaDeCapa';
import { ALTO_SPLIT, FranjaDelSplit } from './FranjaDelSplit';
import { Inspector } from './Inspector';
import { altoDeLaRuta, hechosDeLaRuta, marcasDeLaRuta, Ruta } from './Ruta';
import { alCambiar, escalaVertical, sinRepetir, numerosDeDias, numerosDeSemanas, tramosDeDias, tramosDeSemanas } from './escalones';
import {
  aDia,
  aMs,
  atajoDe,
  crearEscala,
  desplazar,
  DIA_MS,
  limitesDe,
  nivelDe,
  vistaAParams,
  vistaDeFranja,
  vistaDelAtajo,
  vistaDeParams,
  vistaDeSemanas,
} from './escalaDeTiempo';
import { Minimapa } from './Minimapa';
import { cabeceraDelPlan, lecturaDeSemana, lecturaDelDia, ritmoDeFase } from './lectura';
import { cifrasDelPeriodo } from './periodo';
import { nombreCorto, tramoCorto } from './PiezasDelInspector';
import { SelectorDeVista } from './SelectorDeVista';
import { ALTO_TIRA, TiraDeCalor } from './TiraDeCalor';
import { mediaMovil, tintaDe } from './series';
import { useVista } from './useVista';

/**
 * LA TEMPORADA: el roadmap como una sola historia (24 sep 2026).
 *
 * ══ De arriba abajo ═══════════════════════════════════════════════════════
 *
 *     ⚑ Autonómico  el 16 ene a 74 kg     14 semanas  78,2 kg  −0,5 %/sem
 *                                          Faltan      Peso     Ritmo
 *     (con el cursor, flotando encima: lo de esa semana o ese día)
 *     ▓▓ Volumen ▓▓▓▓▓▓│░░ Definición · −0,5 %/sem ░░(?)  ⚑             ← ruta
 *       ▬ Vacaciones
 *     ·•—•—•—•  ═══ banda esperada ═══ - - - →   ─ 74              ← peso
 *     ──┐2.600 ┌█┐3.570 ──────                                     ← kcal
 *     ──────12.000──────────                                       ← pasos
 *     [ Torso-pierna · 4 días      ][ Full body ┄┄┄┄ ]             ← split
 *   ‹ (✓S10)(✓S11)(•S12)(S13)(S14) ›  ← eje: una píldora por semana
 *     31 ago   7 sep   14   21   28
 *     Lo que se ve · 29 dic – 10 ene      ← el resumen del periodo, 4 cifras
 *
 * La cabecera dice a dónde va y cómo va. La ruta es el plan: las fases, el
 * punto de decisión, el destino y los hechos colgando. El peso es la gráfica
 * protagonista; debajo, la pauta como dos áreas en escalón y el split. El
 * color de cada fase es el fondo muy suave del peso y la pauta. Al pie, el eje:
 * una píldora por semana con su revisión dentro, las fechas y las flechas.
 *
 * SIN LEYENDA (25 sep): cada fila lleva su nombre a la izquierda y cada
 * trazo se rotula en su sitio (lo esperado, las kcal y sus refeeds). En
 * reposo, tres zonas: la cabecera, la gráfica y el resumen del periodo.
 *
 * ══ El cursor de lectura ══════════════════════════════════════════════════
 * Al pasar el ratón, o deslizando un dedo, una línea vertical cruza peso,
 * pauta y split con un punto sobre la media del peso, y la línea de lectura
 * dice todo lo de esa columna (`lectura.js`): una semana en Temporada, un día
 * en Rango. Sin cursor, el resumen de lo que se ve o del rango elegido.
 *
 * ══ Lo que ves es el rango (25 sep) ═══════════════════════════════════════
 * No hay una selección aparte: el zoom ES el rango. Arrastrar sobre la
 * gráfica dibuja una franja y soltarla acerca la vista a ese tramo, en
 * semanas enteras (o días si es corto). Doble clic vuelve al zoom anterior;
 * «Temporada» o Esc, a todo. «3 meses» y «4 semanas» son atajos centrados en
 * hoy. Desplazar: la rueda horizontal, Mayús + rueda, las flechas del eje o
 * el MINIMAPA, que aparece bajo el eje cuando no se ve toda la temporada. La
 * dirección guarda lo que se ve (`?desde=…&hasta=…`), y el resumen del
 * periodo, bajo la gráfica, describe siempre ese tramo.
 *
 * ══ La granularidad ═══════════════════════════════════════════════════════
 * El zoom es continuo y la granularidad cambia sola según lo que cabe: por
 * semanas cuando hay muchas a la vista (la media de cada semana), por días al
 * acercar (la tendencia —media móvil de 7 días— con los pesajes tenues, la
 * pauta de cada día y el cursor por día). Pulsar una semana o un día la lleva
 * al INSPECTOR, bajo la gráfica; pulsar una pieza de la ruta, la suya
 * (`Inspector`); pulsar una píldora del eje, su semana. Los gestos, en
 * `useVista`. La herramienta enseña; el entrenador decide: sin avisos ni
 * sugerencias.
 *
 * ══ El calendario ═════════════════════════════════════════════════════════
 * El conmutador Gráfica / Calendario (`?ver=calendario`) enseña la misma
 * temporada día a día (`Calendario`). La cabecera y el inspector son los
 * mismos. En el calendario, arrastrar sobre semanas las elige (el resumen es
 * de ellas) y, al volver a la gráfica, la vista se acerca a esas semanas. La
 * gráfica sigue montada y escondida, para volver a ella con su zoom.
 *
 * Vive en Revisiones, detrás del conmutador de su portada, hasta que
 * sustituya a las tiras (fase 7 del encargo).
 */

const VISTAS = [
  { id: 'grafica', label: 'Gráfica' },
  { id: 'calendario', label: 'Calendario' },
];
const ATAJOS = [
  { id: 'temporada', label: 'Temporada' },
  { id: '3m', label: '3 meses' },
  { id: '4s', label: '4 semanas' },
];

/* La vista con la que abre: la de la dirección (`?desde=…&hasta=…`, o el
   `?rango=` de antes, que aún traen los enlaces viejos) o la temporada. */
const vistaDeLaUrl = (params) => {
  const v = vistaDeParams(params.get('desde'), params.get('hasta'));
  if (v) return v;
  const r = rangoDeParam(params.get('rango'));
  return r ? vistaDeSemanas(r.desde, r.hasta) : null;
};

const entre01 = (v) => Math.max(0, Math.min(1, v));

/* Los píxeles que necesita un día para que la gráfica vaya por días: unas
   diez semanas en el escritorio, tres en el teléfono. En Temporada, siempre
   por semanas. */
const PX_DIA = 14;

const Temporada = ({
  plan,
  semanas,
  fases,
  objetivoKg,
  clientId,
  client,
  hechos,
  program,
  prefs,
  guardarPrefs,
  notasDeIntervencion,
  guardarIntervencion,
}) => {
  const navigate = useNavigate();
  const telefono = useEsTelefono();
  /* La columna de los nombres de las filas. */
  const nombres = telefono ? 64 : 112;
  /* A la derecha, el sitio de la flecha › del eje. */
  const derecha = telefono ? 24 : 28;
  const [refAncho, medido] = useElementWidth(900);
  const ancho = Math.max(200, medido - nombres - derecha);

  /* El día bajo el cursor (`null` sin cursor) y lo elegido para el inspector:
     una semana, un día o una pieza de la ruta (`null`: el resumen). */
  const [cursor, setCursor] = useState(null);
  const [pieza, setPieza] = useState(null);
  /* Las filas que se ven, si el entrenador las ha tocado (`null`: las de la
     vista elegida), y la fila con el menú abierto por una pulsación larga. */
  const [capasTocadas, setCapasTocadas] = useState(null);
  const [filaAbierta, setFilaAbierta] = useState(null);

  const [params, setParams] = useSearchParams();

  /* Las semanas elegidas en el CALENDARIO, arrastrando: `{ desde, hasta, fin }`.
     En la gráfica no hay selección: lo que se ve es el rango. */
  const [seleccion, setSeleccion] = useState(null);
  const elegirDias = useCallback(({ a, b, fin }) => {
    const [x, y] = a <= b ? [a, b] : [b, a];
    setSeleccion({ desde: weekStart(x), hasta: addDays(weekStart(y), 6), fin });
  }, []);
  const quitarSeleccion = useCallback(() => setSeleccion(null), []);

  /* La franja que se está arrastrando sobre la gráfica, en ms: `{ a, b }`. */
  const [franja, setFranja] = useState(null);
  /* Los zooms de antes: el doble clic vuelve al último. */
  const historial = useRef([]);

  /* El mes que se ve arriba del calendario: lo que resume el periodo sin semanas elegidas. */
  const [mesVisto, setMesVisto] = useState(null);
  /* Solo cambia de estado cuando cambia el día: el ratón no repinta a cada píxel. */
  const alCursor = useCallback((t) => setCursor(t === null ? null : aDia(t)), []);

  const limites = useMemo(() => limitesDe({ plan, fases }), [plan, fases]);
  const [vistaInicial] = useState(() => vistaDeLaUrl(params));
  const irARef = useRef(null);
  const vistaRef = useRef(null);
  /* Soltar la franja acerca la vista a ella; el zoom de antes queda para el doble clic. */
  const alFranja = useCallback((f) => {
    if (!f || !f.fin) return setFranja(f ? { a: f.a, b: f.b } : null);
    setFranja(null);
    if (Math.abs(f.b - f.a) < DIA_MS / 2) return undefined;
    historial.current.push(vistaRef.current);
    irARef.current?.(vistaDeFranja(f.a, f.b));
    return undefined;
  }, []);
  const { vista, irA, ponerYa, lienzoRef, gestos, seMovio, enElTrazo } = useVista({
    limites,
    inicial: vistaInicial || limites,
    margen: nombres,
    margenDerecho: derecha,
    onFranja: alFranja,
    onCursor: alCursor,
  });
  irARef.current = irA;
  vistaRef.current = vista;

  const escala = crearEscala(vista, ancho);
  const nivel = nivelDe(vista, limites);
  const atajo = atajoDe(vista, limites);

  /* Lo que se ve, en la dirección: para recargar y para compartirlo. En
     Temporada, nada. Espera a que el zoom pare, y no apila historial. */
  const claveDeVista = nivel === 'temporada' ? '' : `${vistaAParams(vista).desde}..${vistaAParams(vista).hasta}`;
  useEffect(() => {
    const t = setTimeout(() => {
      setParams(
        (p) => {
          const siguiente = new URLSearchParams(p);
          siguiente.delete('rango');
          if (claveDeVista) {
            const [desde, hasta] = claveDeVista.split('..');
            siguiente.set('desde', desde);
            siguiente.set('hasta', hasta);
          } else {
            siguiente.delete('desde');
            siguiente.delete('hasta');
          }
          return siguiente.toString() === p.toString() ? p : siguiente;
        },
        { replace: true }
      );
    }, 300);
    return () => clearTimeout(t);
  }, [claveDeVista, setParams]);

  /* Los atajos de arriba: toda la temporada, o tres meses o cuatro semanas
     centrados en hoy. */
  const elegirAtajo = (id) => {
    if (id === 'temporada') {
      historial.current = [];
      return irA(limites);
    }
    historial.current.push(vista);
    return irA(vistaDelAtajo(id, plan.hoy, limites));
  };
  /* Alejar: el zoom de antes, o la temporada si no hay. */
  const alejar = () => {
    const previa = historial.current.pop();
    irA(previa || limites);
  };

  /* Gráfica o calendario: en la dirección, para enlazarlo y volver a él. Las
     semanas elegidas en el calendario se vuelven el zoom de la gráfica. */
  const modo = params.get('ver') === 'calendario' ? 'calendario' : 'grafica';
  const cambiarModo = (m) => {
    if (m === 'grafica' && seleccion?.fin) {
      historial.current.push(vista);
      irA(vistaDeSemanas(seleccion.desde, seleccion.hasta));
      setSeleccion(null);
    }
    setParams(
      (p) => {
        const siguiente = new URLSearchParams(p);
        if (m === 'calendario') siguiente.set('ver', 'calendario');
        else siguiente.delete('ver');
        return siguiente;
      },
      { replace: true }
    );
  };
  /* Por días en cuanto un día tiene sitio; si no, y en Temporada, por semanas. */
  const porDias = nivel !== 'temporada' && escala.pxPorDia >= PX_DIA;
  const { hoy, destino } = plan;

  /* ── Los datos, calculados una vez ──────────────────────────────────────
     Todo sale de la misma cuenta (`pautaDelDia`): las semanas, sus tipos de
     día y la pauta de cada día. */
  const porLunes = useMemo(() => new Map(semanas.map((s) => [s.lunes, s])), [semanas]);
  const casillas = useMemo(() => {
    const m = new Map();
    for (const s of plan.semanas) m.set(s.lunes, casillasDeLaSemana(client, program, s.lunes));
    return m;
  }, [plan.semanas, client, program]);
  const tiposDe = useCallback(
    (lunes) => tiposDeLaSemana({ semana: porLunes.get(lunes), casillas: casillas.get(lunes) }),
    [porLunes, casillas]
  );
  /* Los refeeds y diet breaks: pauta de unos días, en el área de kcal. */
  const intervenciones = useMemo(() => (hechos || []).filter((e) => esIntervencion(e) && e.date), [hechos]);
  const diasDe = useCallback(
    (lunes) => pautaDeLosDias({ semana: porLunes.get(lunes), hechos: intervenciones, casillas: casillas.get(lunes) }),
    [porLunes, intervenciones, casillas]
  );
  const kcalPorSemana = useMemo(
    () => tramosDeSemanas({ semanas: plan.semanas, clave: 'kcals', hoy, intervenciones }),
    [plan.semanas, hoy, intervenciones]
  );
  const pasosPorSemana = useMemo(() => tramosDeSemanas({ semanas: plan.semanas, clave: 'steps', hoy }), [plan.semanas, hoy]);
  const numKcalPorSemana = useMemo(
    () => numerosDeSemanas({ semanas: plan.semanas, clave: 'kcals', hoy, tiposDe, intervenciones }),
    [plan.semanas, hoy, tiposDe, intervenciones]
  );
  const numPasosPorSemana = useMemo(
    () => numerosDeSemanas({ semanas: plan.semanas, clave: 'steps', hoy, tiposDe }),
    [plan.semanas, hoy, tiposDe]
  );
  /* La escala vertical de cada área: una para toda la temporada, con los tipos
     de día y los refeeds dentro, para que no salte al moverse. */
  const escalaKcal = useMemo(
    () =>
      escalaVertical([
        ...kcalPorSemana.map((b) => b.valor),
        ...plan.semanas.flatMap((s) => (s.pauta?.tipos || []).map((t) => t.kcals)),
        ...intervenciones.flatMap(kcalsDeIntervencion),
      ]),
    [kcalPorSemana, plan.semanas, intervenciones]
  );
  const escalaPasos = useMemo(
    () =>
      escalaVertical([
        ...pasosPorSemana.map((b) => b.valor),
        ...plan.semanas.flatMap((s) => (s.pauta?.tipos || []).map((t) => t.steps ?? s.pauta.steps)),
      ]),
    [pasosPorSemana, plan.semanas]
  );
  /* Los hechos de contexto: vacaciones, enfermedad, competiciones. Cuelgan de la ruta. */
  const contexto = useMemo(
    () => (hechos || []).filter((e) => HECHO_KINDS.includes(e?.kind) && !esIntervencion(e) && !e.ancla && e.date),
    [hechos]
  );
  const conEntreno = !entrenaPorSuCuenta(client);
  const rendimiento = useMemo(
    () => (conEntreno ? rendimientoDeLaTemporada({ program, semanas: plan.semanas }) : null),
    [conEntreno, program, plan.semanas]
  );
  const entreno = useMemo(
    () => (conEntreno ? entrenoDeLasSemanas({ program, client, semanas: plan.semanas }) : new Map()),
    [conEntreno, program, client, plan.semanas]
  );
  const bloques = useMemo(
    () =>
      conEntreno
        ? tramosDeLosBloques(program, {
            cycleType: client?.cycleType,
            cyclePattern: client?.cyclePattern,
            startDate: client?.startDate,
          }).map((t) => ({
            id: t.bloque.id,
            nombre: t.bloque.name,
            desde: t.desde,
            hasta: t.hasta,
            previstoHasta: t.previstoHasta,
            split: splitDelBloque(program, t.bloque, client),
          }))
        : [],
    [conEntreno, program, client]
  );
  const cabecera = useMemo(() => cabeceraDelPlan({ plan, objetivoKg }), [plan, objetivoKg]);

  /* ── Las intervenciones: refeeds y diet breaks, cambios de dieta y bloques
     nuevos, con lo que el entrenador escribió de cada una (0143). */
  const versiones = usePautaFechada();
  const todas = useMemo(
    () =>
      intervencionesDelCliente({
        hechos: hechos || [],
        versiones,
        bloques: bloques.map((b) => ({ id: b.id, nombre: b.nombre, desde: b.desde, split: b.split?.texto || b.split?.datos || null })),
        capa: notasDeIntervencion || [],
        hoy,
      }),
    [hechos, versiones, bloques, notasDeIntervencion, hoy]
  );

  /* Lo que cuenta el cliente: las preguntas de su protocolo de hoy y el parte
     de cada sesión, por día. */
  const protocolo = useMemo(() => clientProtocol(client?.preferences), [client?.preferences]);
  const preguntasCheckin = useMemo(() => checkinQuestions(protocolo), [protocolo]);
  const preguntasSesion = useMemo(() => activeQuestions(protocolo), [protocolo]);
  const sesiones = useMemo(() => allSessions(program?.microcycles || []).filter((x) => x.date), [program]);
  const [sesionesPorDia, sesionesPorLunes] = useMemo(() => {
    const dia = new Map();
    const lunes = new Map();
    for (const x of sesiones) {
      if (!dia.has(x.date)) dia.set(x.date, []);
      dia.get(x.date).push(x);
      const l = weekStart(x.date);
      if (!lunes.has(l)) lunes.set(l, []);
      lunes.get(l).push(x);
    }
    return [dia, lunes];
  }, [sesiones]);

  /* La tendencia del peso: la media móvil de 7 días de todos sus pesajes. */
  const tendencia = useMemo(() => mediaMovil(semanas.flatMap((s) => s.pesajes || [])), [semanas]);
  const porFecha = useMemo(() => new Map(tendencia.map((t) => [t.fecha, t.valor])), [tendencia]);

  /* ── Las filas: las que tiene este cliente y las que se ven ─────────────
     La vista elegida manda hasta que el entrenador toca una fila; cambiar de
     fase no cambia de vista. */
  const disponibles = useMemo(
    () =>
      capasDisponibles({
        preguntasCheckin,
        preguntasSesion,
        semanas,
        sesiones,
        hay: {
          kcal: kcalPorSemana.length > 0,
          pasos: pasosPorSemana.length > 0,
          split: conEntreno && bloques.length > 0,
          entrenos: conEntreno && [...entreno.values()].some((e) => e.hechas > 0),
        },
      }),
    [preguntasCheckin, preguntasSesion, semanas, sesiones, kcalPorSemana, pasosPorSemana, conEntreno, bloques, entreno]
  );
  const capaPorId = useMemo(() => new Map(disponibles.map((c) => [c.id, c])), [disponibles]);

  /* ── La intervención abierta: sus ventanas y su tabla de impacto ────────
     Mientras se arrastra un borde de sus ventanas, `arrastre` manda sobre lo
     guardado; al soltar se guarda y vuelve a mandar lo guardado. */
  const [arrastre, setArrastre] = useState(null);
  const abierta = pieza?.tipo === 'intervencion' ? todas.find((x) => x.id === pieza.id) || null : null;
  const todasLasCeldas = useMemo(
    () =>
      disponibles
        .filter((c) => c.origen)
        .map((c) => ({
          id: c.id,
          nombre: c.nombre,
          max: escalaDe(c.pregunta).max,
          celdas:
            c.origen === 'checkin'
              ? celdasDeCheckin({ semanas, pregunta: c.pregunta, hoy })
              : celdasDeSesionPorDia({ sesionesPorDia, pregunta: c.pregunta, desde: '0000-01-01', hasta: '9999-12-31' }),
        })),
    [disponibles, semanas, hoy, sesionesPorDia]
  );
  const datosAbierta = useMemo(() => {
    if (!abierta) return null;
    const x = arrastre?.id === abierta.id ? { ...abierta, capa: { ...abierta.capa, [arrastre.campo]: arrastre.dia } } : abierta;
    const ventanas = ventanasDe(x, { todas, fases });
    const fase = fases.find((f) => f.startsOn && f.startsOn <= x.desde && (!f.endsOn || f.endsOn >= x.desde)) || null;
    /* Las referencias del bloque en el que empieza: su marca en cada ventana. */
    const delBloque = (rendimiento?.bloques || []).find((b) => b.desde <= x.desde && b.hasta >= x.desde) || null;
    /* Lo pautado cada día: UNA cuenta para «Qué fue» y para la tabla. */
    const pautaDelDia = (fecha) => {
      const l = weekStart(fecha);
      return porLunes.get(l)?.pauta ? diasDe(l).find((d) => d.fecha === fecha) || null : null;
    };
    return {
      x,
      ventanas,
      estado: estadoDe(x, ventanas, hoy),
      objetivo: fase ? ritmoDeFase(fase, x.desde) : null,
      hoy,
      kcal: x.tipo === 'dieta' ? kcalDelCambio(x, pautaDelDia) : null,
      impacto: impactoDe({
        ventanas,
        hoy,
        pesajes: semanas.flatMap((s) => s.pesajes || []),
        pautaDelDia,
        sensaciones: todasLasCeldas,
        entrenoDelDia: conEntreno ? (fecha) => entreno.get(weekStart(fecha))?.dias?.find((d) => d.fecha === fecha) || null : null,
        referencias: (delBloque?.referencias || []).map((r) => ({
          nombre: r.nombre,
          marca: (desde, hasta) => mejorMarcaEntre({ program, nombres: r.nombres || [r.nombre], desde, hasta }),
        })),
      }),
    };
  }, [abierta, arrastre, todas, fases, rendimiento, hoy, semanas, porLunes, diasDe, todasLasCeldas, conEntreno, entreno, program]);
  const vistas = useMemo(() => (Array.isArray(prefs?.vistas) ? prefs.vistas : []), [prefs?.vistas]);
  const vistaElegida = vistas.find((v) => v.id === prefs?.ultima) || null;
  const deLaVista = capasDeLaVista(vistaElegida ? vistaElegida.capas : vistaPorDefecto(disponibles), disponibles);
  const ids = capasTocadas ? capasDeLaVista(capasTocadas, disponibles) : deLaVista;
  /* Solo una vista guardada tiene nombre: lo demás es «Vista», y el menú ofrece guardarla. */
  const nombreDeVista = mismasCapas(ids, deLaVista) ? vistaElegida?.nombre || null : null;
  const tocarCapas = (siguiente) => setCapasTocadas(siguiente);
  const elegirVista = (v) => {
    setCapasTocadas(null);
    guardarPrefs({ ultima: v ? v.id : null });
  };
  const guardarVista = (nombre) => {
    const igual = vistas.find((v) => v.nombre.toLowerCase() === nombre.toLowerCase());
    const nueva = { id: igual?.id || `v${Date.now().toString(36)}`, nombre, capas: ids };
    setCapasTocadas(null);
    return guardarPrefs({ vistas: igual ? vistas.map((v) => (v.id === igual.id ? nueva : v)) : [...vistas, nueva], ultima: nueva.id });
  };
  const borrarVista = (id) => {
    /* Lo que se ve no cambia: solo deja de tener nombre. */
    setCapasTocadas(ids);
    guardarPrefs({ vistas: vistas.filter((v) => v.id !== id), ultima: null });
  };

  /* ── El resumen del periodo: lo que se ve ─────────────────────────────── */
  const resumirEntre = useCallback(
    (desde, hasta) => resumenDelRango({ semanas, desde, hasta, hoy, rendimiento, entreno: conEntreno ? entreno : null }),
    [semanas, hoy, rendimiento, entreno, conEntreno]
  );
  /* Lo que se ve: en la gráfica, las semanas de su vista; en el calendario,
     las semanas elegidas o el mes de arriba. */
  const elegidas = modo === 'calendario' && seleccion?.fin ? seleccion : null;
  const enCalendario = modo === 'calendario' && mesVisto;
  const tramoDesde = elegidas ? elegidas.desde : enCalendario ? mesVisto.desde : weekStart(escala.primerDia);
  const tramoHasta = elegidas ? elegidas.hasta : enCalendario ? mesVisto.hasta : addDays(weekStart(escala.ultimoDia), 6);
  const resumenVisto = useMemo(() => resumirEntre(tramoDesde, tramoHasta), [resumirEntre, tramoDesde, tramoHasta]);

  /* Contra el tramo de antes de la misma duración (si lo hay). */
  const periodo = useMemo(() => {
    const n = Math.max(1, Math.round(((daysBetween(tramoDesde, tramoHasta) ?? 6) + 1) / 7));
    const antesDesde = addDays(tramoDesde, -7 * n);
    const vividasEntre = (a, b) => semanas.filter((s) => s.lunes >= a && s.lunes <= b && s.lunes <= hoy).map((s) => s.lunes);
    const lunesAntes = vividasEntre(antesDesde, addDays(tramoDesde, -1));
    const conAntes = semanas.some((s) => s.lunes >= antesDesde && s.lunes < tramoDesde && s.lunes <= hoy);
    const vividas = vividasEntre(tramoDesde, tramoHasta);
    return {
      titulo: `${elegidas ? 'Semanas elegidas' : 'Lo que se ve'} · ${tramoCorto(tramoDesde, tramoHasta)}`,
      pendientes: semanas.filter((s) => s.lunes >= tramoDesde && s.lunes <= tramoHasta && s.revision5 === 'pendiente').map((s) => s.lunes),
      vividas,
      contra: conAntes ? (n === 1 ? 'contra la semana anterior' : `contra las ${n} semanas anteriores`) : null,
      cifras: cifrasDelPeriodo({
        actual: resumenVisto,
        anterior: conAntes ? resumirEntre(antesDesde, addDays(tramoDesde, -1)) : null,
        lunes: vividas,
        lunesAntes,
        capas: disponibles.filter((c) => c.origen),
        semanas,
        sesionesPorLunes,
        nombreDe: (l) => (porLunes.get(l) ? nombreCorto(porLunes.get(l)) : l),
      }),
    };
  }, [tramoDesde, tramoHasta, elegidas, semanas, hoy, resumenVisto, resumirEntre, disponibles, sesionesPorLunes, porLunes]);

  /* «Abrir revisiones de estas semanas»: la primera pendiente del tramo o, si
     no hay, la primera vivida; sus flechas recorren solo estas semanas. */
  const abrirRevisiones = () => {
    const { vividas, pendientes } = periodo;
    const lunes = pendientes[0] || vividas[0];
    if (!lunes) return;
    const recorrido = { desde: vividas[0], hasta: addDays(vividas[vividas.length - 1], 6) };
    navigate(`${semanaPath(clientId, lunes)}?rango=${rangoAParam(recorrido)}`);
  };

  /* El día que hay bajo un puntero, o `null` fuera de la gráfica. */
  const diaBajo = (clientX) => {
    const r = lienzoRef.current?.getBoundingClientRect();
    if (!r) return null;
    const px = clientX - r.left - nombres;
    if (px < 0 || px > ancho) return null;
    return aDia(escala.tDe(px));
  };

  /* Pulsar lleva al inspector la semana (por semanas, o sobre las píldoras
     del eje) o el día (por días). */
  const antesDelClic = useRef(null);
  const pulsar = (e) => {
    if (seMovio()) return;
    const dia = diaBajo(e.clientX);
    if (!dia || !porLunes.has(weekStart(dia))) return;
    const enElEje = Boolean(e.target.closest?.('[data-eje]'));
    if (e.detail <= 1) antesDelClic.current = pieza;
    setPieza(porDias && !enElEje ? { tipo: 'dia', fecha: dia } : { tipo: 'semana', lunes: weekStart(dia) });
  };
  /* Elegir una intervención (en la ruta, desde una nota): si sus ventanas no
     se ven enteras, la vista va a ellas; el zoom de antes, al doble clic. */
  const acercarA = (desde, hasta) => {
    historial.current.push(vista);
    irA(vistaDeFranja(aMs(desde) - 3 * DIA_MS, aMs(hasta) + 4 * DIA_MS));
  };
  const marcoRef = useRef(null);
  const elegirPieza = (p) => {
    setPieza(p);
    if (p?.tipo !== 'intervencion') return;
    /* En el teléfono la tarjeta sube a media altura: la gráfica, arriba del
       todo, para que sus ventanas queden a la vista por encima. */
    if (telefono) traeALaVista(marcoRef.current, { block: 'start', behavior: 'smooth' });
    const x = todas.find((i) => i.id === p.id);
    if (!x) return;
    const v = ventanasDe(x, { todas, fases });
    const desde = v.antes?.desde || x.desde;
    const hasta = v.despues?.hasta || x.hasta;
    if (escala.x(desde) < 0 || escala.x(addDays(hasta, 1)) > ancho) acercarA(desde, hasta);
  };

  /* Doble clic en la gráfica: el zoom de antes. Los dos clics que lo forman
     no eligen nada: lo elegido vuelve a ser lo de antes. */
  const alDobleClic = (e) => {
    if (!enElTrazo(e.clientX) || e.target.closest?.('[data-eje]')) return;
    setPieza(antesDelClic.current);
    alejar();
  };

  /* Las flechas del eje: media vista hacia un lado, en semanas enteras. */
  const pasoDeFlecha = Math.max(1, Math.round((vista.fin - vista.inicio) / 2 / (7 * DIA_MS))) * 7 * DIA_MS;
  const alPrincipio = vista.inicio <= limites.inicio;
  const alFinal = vista.fin >= limites.fin;
  const flecha = (sentido) => (e) => {
    e.stopPropagation();
    irA(desplazar(vista, sentido * pasoDeFlecha, limites));
  };
  const noEsLienzo = (e) => e.stopPropagation();

  /* Las flechas del inspector: la semana o el día de al lado. Si se sale de lo
     que se ve, la vista se mueve lo mismo. */
  const mover = (paso) => {
    if (!pieza || (pieza.tipo !== 'semana' && pieza.tipo !== 'dia')) return;
    const dias = pieza.tipo === 'semana' ? 7 * paso : paso;
    const fecha = addDays(pieza.tipo === 'semana' ? pieza.lunes : pieza.fecha, dias);
    if (!porLunes.has(weekStart(fecha))) return;
    setPieza(pieza.tipo === 'semana' ? { tipo: 'semana', lunes: fecha } : { tipo: 'dia', fecha });
    if (!escala.toca(fecha, pieza.tipo === 'semana' ? addDays(fecha, 6) : fecha)) {
      const ms = dias * 86400000;
      irA({ inicio: vista.inicio + ms, fin: vista.fin + ms });
    }
  };

  /* Escape vuelve al resumen; sin nada elegido, en la gráfica aleja a toda la
     temporada y en el calendario suelta las semanas elegidas. En el teléfono
     lo elegido es una hoja, que ya se cierra sola con Escape. Un Escape que
     es de otro sitio (un campo, un menú abierto fuera) no aleja. */
  useEffect(() => {
    const alTeclear = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (pieza) {
        if (!telefono) setPieza(null);
        return;
      }
      if (modo === 'calendario') {
        if (seleccion) quitarSeleccion();
        return;
      }
      const t = e.target;
      if (t !== document.body && !t?.closest?.('.tl')) return;
      if (nivel !== 'temporada') {
        historial.current = [];
        irA(limites);
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [pieza, telefono, modo, seleccion, quitarSeleccion, nivel, irA, limites]);

  /* ── La granularidad ────────────────────────────────────────────────────
     El zoom cambia la granularidad, no solo el tamaño: la pauta pasa de
     escalones de semana a escalones de día poco a poco, justo antes de que
     el peso pase a ir por días. En Temporada, siempre por semanas. */
  const formaDeLaSemana = nivel === 'temporada' ? 0 : entre01((escala.pxPorDia - (PX_DIA - 3)) / 3);
  const lunesDeHoy = weekStart(hoy);
  const ve = (x) => escala.toca(x.desde, x.hasta);
  const semanasVistas = semanas.filter((s) => escala.toca(s.lunes, s.domingo));
  const conPautaVistas = semanasVistas.filter((s) => s.lunes <= lunesDeHoy && s.pauta);
  const diasVistos = formaDeLaSemana > 0.02 ? conPautaVistas.flatMap((s) => diasDe(s.lunes)) : [];

  /* ── Kcal y pasos: áreas en escalón ───────────────────────────────────── */
  /* El área de las kcal tiene presencia: se lee de un vistazo cuándo sube y baja. */
  const area = telefono ? 40 : 48;
  const numerosDiarios = formaDeLaSemana * entre01((escala.pxPorDia - 14) / 6);
  const capas = { semanas: 1 - formaDeLaSemana, dias: formaDeLaSemana, numSemanas: 1 - numerosDiarios, numDias: numerosDiarios };
  const escalones = ({ semanales, diarias, numSemanas, ...resto }) =>
    semanales.some(ve) || diarias.some(ve) ? (
      <CarrilDeEscalones
        escala={escala}
        area={area}
        semanales={semanales}
        diarias={diarias}
        numSemanas={capas.numSemanas > 0.02 ? sinRepetir(alCambiar(numSemanas.filter(ve))) : []}
        numDias={capas.numDias > 0.02 ? sinRepetir(alCambiar(numerosDeDias(diarias).filter(ve))) : []}
        capas={capas}
        hoy={hoy}
        {...resto}
      />
    ) : null;
  const kcal = escalones({
    escalaY: escalaKcal,
    color: metricColor('kcals'),
    semanales: kcalPorSemana,
    diarias: tramosDeDias({ dias: diasVistos, clave: 'kcals', hoy }),
    numSemanas: numKcalPorSemana,
  });
  const pasos = escalones({
    escalaY: escalaPasos,
    color: metricColor('steps'),
    semanales: pasosPorSemana,
    diarias: tramosDeDias({ dias: diasVistos, clave: 'steps', hoy }),
    numSemanas: numPasosPorSemana,
  });

  /* ── Las tiras: sensaciones y entrenos ───────────────────────────────────
     Las del check-in, una celda por semana; las de la sesión, la media de la
     semana o, por días, una celda por sesión. */
  const celdasDe = (capa) => {
    if (capa.origen === 'checkin') {
      /* Por días, lo que se pregunta también en la sesión se lee sesión a sesión. */
      const diarias = porDias && capa.sesion
        ? celdasDeSesionPorDia({ sesionesPorDia, pregunta: capa.sesion, desde: escala.primerDia, hasta: escala.ultimoDia })
        : [];
      return diarias.length ? diarias : celdasDeCheckin({ semanas, pregunta: capa.pregunta, hoy });
    }
    if (capa.origen === 'sesion')
      return porDias
        ? celdasDeSesionPorDia({ sesionesPorDia, pregunta: capa.pregunta, desde: escala.primerDia, hasta: escala.ultimoDia })
        : celdasDeSesionPorSemana({ semanas, sesionesPorLunes, pregunta: capa.pregunta, hoy });
    if (capa.id === 'entrenos') return celdasDeEntrenos({ semanas, entreno, hoy, porDias });
    return [];
  };
  const tiras = new Map(ids.filter((id) => capaPorId.get(id)?.origen || id === 'entrenos').map((id) => [id, celdasDe(capaPorId.get(id))]));

  /* ── El cursor: su columna, su x y lo que se lee ───────────────────────
     En Temporada, la semana entera (la línea en su centro); en Rango, el día. */
  const lunesCursor = cursor ? weekStart(cursor) : null;
  const semanaCursor = lunesCursor ? porLunes.get(lunesCursor) : null;
  let cursorX = null;
  let lectura;
  if (cursor && semanaCursor) {
    const anterior = porLunes.get(addDays(lunesCursor, -7)) || null;
    const suyo = conEntreno ? entreno.get(lunesCursor) || null : null;
    if (porDias) {
      cursorX = escala.x(cursor) + escala.pxPorDia / 2;
      const pauta = semanaCursor.pauta && lunesCursor <= lunesDeHoy ? diasDe(lunesCursor).find((d) => d.fecha === cursor) : null;
      lectura = lecturaDelDia({
        fecha: cursor,
        pauta,
        semana: semanaCursor,
        entreno: suyo?.dias?.find((d) => d.fecha === cursor) || null,
        peso: semanaCursor.media ?? anterior?.media ?? null,
        tendencia: porFecha.get(cursor) ?? null,
        hoy,
      });
    } else {
      cursorX = escala.x(lunesCursor) + escala.pxPorDia * 3.5;
      lectura = lecturaDeSemana({ semana: semanaCursor, anterior, tipos: tiposDe(lunesCursor), intervenciones, entreno: suyo, hoy });
    }
    /* Y lo que dicen las tiras de sensaciones que se ven, en su orden. */
    const deLasTiras = [];
    for (const [id, celdas] of tiras) {
      const capa = capaPorId.get(id);
      const c = capa?.origen ? celdas.find((x) => x.valor !== null && cursor >= x.desde && cursor <= x.hasta) : null;
      const max = (c && c.desde === c.hasta && capa.sesion ? capa.sesion : capa?.pregunta)?.max ?? 10;
      if (c) deLasTiras.push(`${capa.nombre.toLowerCase()} ${localeNumber(c.valor, { maximumFractionDigits: 1 })}/${max}`);
    }
    lectura = { ...lectura, piezas: [...lectura.piezas, ...deLasTiras] };
  } else if (franja) {
    /* Mientras se arrastra, el tramo al que irá la vista al soltar. */
    const v = vistaDeFranja(franja.a, franja.b);
    const dias = Math.round((v.fin - v.inicio) / DIA_MS);
    const cuanto = dias % 7 === 0 && dias >= 14 ? `${dias / 7} semanas` : `${dias} ${dias === 1 ? 'día' : 'días'}`;
    lectura = { titulo: `${tramoDeFechas(aDia(v.inicio), aDia(v.fin - 1))} · ${cuanto}`, piezas: [] };
  } else {
    /* En reposo no hay lectura: la cabecera dice a dónde va y el resumen
       del periodo, bajo la gráfica, lo que pasó. */
    lectura = null;
  }
  if (cursorX !== null && (cursorX < 0 || cursorX > ancho)) cursorX = null;

  /* ── El fondo de la gráfica ─────────────────────────────────────────────
     El color de cada fase, muy suave (lo que falta, más aún), detrás del peso
     y de la pauta; y una raya fina en cada lunes, que se apaga cuando las
     semanas se juntan demasiado. */
  const tramoEnPx = (desde, hasta) => {
    const a = Math.max(0, escala.x(desde));
    const b = Math.min(ancho, escala.x(addDays(hasta, 1)));
    return b > a ? { left: a, width: b - a } : null;
  };
  const fondoDeFases = fases
    .filter((f) => f.startsOn && escala.toca(f.startsOn, f.endsOn || escala.ultimoDia))
    .flatMap((f, i) => {
      const hasta = f.endsOn || escala.ultimoDia;
      const color = directionById(f.direction)?.color || 'var(--text-tertiary)';
      const corte = hoy < f.startsOn ? addDays(f.startsOn, -1) : hoy > hasta ? hasta : hoy;
      return [
        corte >= f.startsOn && { desde: f.startsOn, hasta: corte, clase: 'tl-fondo-fase' },
        corte < hasta && { desde: addDays(corte, 1), hasta, clase: 'tl-fondo-fase is-plan' },
      ]
        .filter(Boolean)
        .map((t) => {
          const px = tramoEnPx(t.desde, t.hasta);
          return px ? <span key={`${f.id || i}-${t.desde}`} className={t.clase} style={{ ...px, '--tinta': color }} /> : null;
        });
    });
  const rayas = entre01((escala.pxPorDia * 7 - 12) / 24);
  const rayasDeSemana = [];
  if (rayas > 0.02) {
    for (let l = weekStart(escala.primerDia); l <= escala.ultimoDia; l = addDays(l, 7)) {
      const x = escala.x(l);
      if (x > 0.5 && x < ancho) rayasDeSemana.push(<span key={l} className="tl-raya-semana" style={{ left: Math.round(x) }} />);
    }
  }
  const vertical = (dia, clase) => {
    const x = escala.x(dia) + escala.pxPorDia / 2;
    return x >= 0 && x <= ancho ? <span className={`tl-vertical ${clase}`} style={{ left: x }} /> : null;
  };

  /* Lo elegido se marca en la gráfica: su columna, muy suave. */
  let columnaElegida = null;
  if (pieza?.tipo === 'semana' || pieza?.tipo === 'dia') {
    const px = pieza.tipo === 'semana' ? tramoEnPx(pieza.lunes, addDays(pieza.lunes, 6)) : tramoEnPx(pieza.fecha, pieza.fecha);
    if (px) columnaElegida = <span className="tl-elegida" style={px} />;
  }

  /* Las ventanas de la intervención abierta: antes, durante y después, muy
     suaves, con su nombre si cabe. El principio de «antes» y el final de
     «después» se arrastran (o se mueven con las flechas del teclado): al
     soltar se guardan en su capa (0143). */
  let ventanasEnPx = null;
  if (datosAbierta) {
    const { x, ventanas } = datosAbierta;
    const cambio = x.tipo === 'dieta' || x.tipo === 'bloque';
    const bandas = [
      ['antes', 'Antes', ventanas.antes],
      ['durante', cambio ? '1.ª semana' : 'Durante', ventanas.durante],
      ['despues', 'Después', ventanas.despues],
    ].map(([id, nombre, v]) => {
      const px = v ? tramoEnPx(v.desde, v.hasta) : null;
      return px ? (
        <span key={id} className={`tl-ventana is-${id}`} style={{ ...px, '--tinta': tintaDe(x) }} aria-hidden="true">
          {px.width >= 64 && <span className="tl-ventana-nombre">{nombre}</span>}
        </span>
      ) : null;
    });
    /* El día que queda a cada lado del borde: se redondea al canto más cercano. */
    const acotado = (campo, dia) =>
      campo === 'antesDesde'
        ? [addDays(x.desde, -MAX_DIAS_DE_VENTANA), dia, addDays(x.desde, -1)].sort()[1]
        : [addDays(x.hasta, 1), dia, addDays(x.hasta, MAX_DIAS_DE_VENTANA)].sort()[1];
    const diaDelBorde = (campo, clientX) => {
      const r = lienzoRef.current?.getBoundingClientRect();
      if (!r) return null;
      const px = clientX - r.left - nombres;
      return acotado(campo, aDia(escala.tDe(campo === 'antesDesde' ? px + escala.pxPorDia / 2 : px - escala.pxPorDia / 2)));
    };
    const soltar = (campo, dia) => {
      guardarIntervencion(clientId, x.fuente, { [campo]: dia }).finally(() => setArrastre(null));
    };
    const asa = (campo, dia, borde) => {
      const px = escala.x(borde);
      if (px < -6 || px > ancho + 6) return null;
      const antes = campo === 'antesDesde';
      return (
        <span
          key={campo}
          className="tl-ventana-asa"
          style={{ left: px }}
          role="slider"
          tabIndex={0}
          aria-label={antes ? 'Principio de la ventana de antes' : 'Final de la ventana de después'}
          aria-valuetext={tramoDeFechas(dia, dia)}
          aria-valuemin={-MAX_DIAS_DE_VENTANA}
          aria-valuemax={MAX_DIAS_DE_VENTANA}
          aria-valuenow={antes ? daysBetween(x.desde, dia) : daysBetween(x.hasta, dia)}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setArrastre({ id: x.id, campo, dia, moviendo: true });
          }}
          onPointerMove={(e) => {
            if (arrastre?.moviendo && arrastre.campo === campo) {
              const d = diaDelBorde(campo, e.clientX);
              if (d && d !== arrastre.dia) setArrastre({ ...arrastre, dia: d });
            }
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            if (arrastre?.moviendo && arrastre.campo === campo) {
              setArrastre({ ...arrastre, moviendo: false });
              soltar(campo, arrastre.dia);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            e.stopPropagation();
            const d = acotado(campo, addDays(dia, e.key === 'ArrowLeft' ? -1 : 1));
            setArrastre({ id: x.id, campo, dia: d, moviendo: false });
            soltar(campo, d);
          }}
        />
      );
    };
    ventanasEnPx = (
      <>
        {bandas}
        {asa('antesDesde', ventanas.antes?.desde || x.desde, ventanas.antes?.desde || x.desde)}
        {asa('despuesHasta', ventanas.despues?.hasta || x.hasta, addDays(ventanas.despues?.hasta || x.hasta, 1))}
      </>
    );
  }

  /* La franja que se arrastra, tal cual va el puntero: la vista se ajusta a
     semanas o días al soltar. */
  let franjaEnPx = null;
  if (franja) {
    const a = Math.max(0, escala.xMs(Math.min(franja.a, franja.b)));
    const b = Math.min(ancho, escala.xMs(Math.max(franja.a, franja.b)));
    if (b > a) franjaEnPx = <span className="tl-franja" style={{ left: a, width: b - a }} />;
  }

  const hechosVistos = hechosDeLaRuta(contexto, escala);
  const marcasVistas = marcasDeLaRuta(todas, escala);
  const altoRuta = altoDeLaRuta(hechosVistos.length > 0, marcasVistas.length > 0);
  const altoPeso = telefono ? 190 : 250;
  const altoPauta = altoDeEscalones(area);

  const ctx = {
    hoy,
    semanas,
    expectativas: plan.expectativas,
    destino,
    cruce: plan.cruce,
    objetivoKg,
    semanaDe: (fecha) => porLunes.get(weekStart(fecha)) || null,
    diasDe: (lunes) => (porLunes.get(lunes)?.pauta && lunes <= lunesDeHoy ? diasDe(lunes) : []),
    entrenoDe: (lunes) => (conEntreno ? entreno.get(lunes) || null : null),
    tiposDe,
    preguntasCheckin,
    preguntasSesion,
    /* El check-in de una semana (con cadencia quincenal, el de su periodo). */
    entregaDe: (s) => s?.entrega || null,
    /* Los check-ins de las semanas anteriores de su fase, cada uno una vez. */
    entregasDeLaFase: (s) => {
      if (!s?.fase) return [];
      const vistas = new Set([s.entrega]);
      const suyas = [];
      for (const x of semanas) {
        if (x.fase?.id !== s.fase.id || x.lunes >= s.lunes || !x.entrega?.answers || vistas.has(x.entrega)) continue;
        vistas.add(x.entrega);
        suyas.push(x.entrega);
      }
      return suyas;
    },
    sesionesDelDia: (fecha) => sesionesPorDia.get(fecha) || [],
    /* El split del bloque de una semana: «Torso-pierna · 4 días». */
    splitDe: (s) => {
      const b = bloques.find((x) => x.id === s?.bloque?.id);
      return b?.split?.texto || b?.split?.datos || null;
    },
    /* El entreno del bloque de una semana: sus series efectivas y cuánto se
       movió cada referencia desde que empezó el bloque. */
    bloqueDe: (s) => {
      const b = bloques.find((x) => x.id === s?.bloque?.id);
      if (!b?.desde || !conEntreno) return null;
      const suyo = (r) => r.bloques.find((x) => x.nombre === b.nombre) || null;
      const semana = suyo(resumirEntre(s.lunes, s.domingo));
      const desdeElInicio = suyo(resumirEntre(weekStart(b.desde), s.domingo));
      if (!semana && !desdeElInicio) return null;
      return { nombre: b.nombre, efectivas: semana?.efectivas ?? 0, referencias: desdeElInicio?.referencias || [] };
    },
    /* Pulsar una tarjeta del inspector lleva a su semana, su día o su intervención. */
    elegir: elegirPieza,
    /* La intervención abierta, con sus ventanas y su tabla; las de un tramo; y
       escribir lo que el entrenador piensa de una. */
    intervencion: datosAbierta,
    intervencionesEntre: (desde, hasta) => todas.filter((x) => x.desde <= hasta && x.hasta >= desde),
    guardarIntervencion: (x, campos) => guardarIntervencion(clientId, x.fuente, campos),
  };

  /* ── Las filas, en el orden de la vista ─────────────────────────────────── */
  const svg = (alto, hijos) => (
    <svg className="tl-capa-svg" width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true">
      {hijos}
    </svg>
  );
  const contenidoDe = (id) => {
    if (id === 'peso')
      return [
        altoPeso,
        <CarrilPeso
          key="peso"
          escala={escala}
          alto={altoPeso}
          semanas={semanas}
          fases={fases}
          expectativas={plan.expectativas}
          hoy={hoy}
          destino={destino}
          objetivoKg={objetivoKg}
          pesajes={porDias}
          extremos={!porDias}
          tendencia={porDias ? tendencia : null}
          cursorX={cursorX}
        />,
      ];
    if (id === 'kcal') return [altoPauta, kcal];
    if (id === 'pasos') return [altoPauta, pasos];
    if (id === 'split') return [ALTO_SPLIT, <FranjaDelSplit key="split" escala={escala} bloques={bloques} />];
    if (tiras.has(id)) return [ALTO_TIRA, <TiraDeCalor key={id} escala={escala} celdas={tiras.get(id)} cursor={cursor} />];
    return [0, null];
  };
  const filas = ids.map((id, i) => {
    const capa = capaPorId.get(id);
    const [alto, hijos] = contenidoDe(id);
    return (
      <FilaDeCapa
        key={id}
        capa={capa}
        alto={alto}
        arriba={id === 'peso'}
        primera={i === 0}
        ultima={i === ids.length - 1}
        abierta={filaAbierta === id}
        onAbrir={(si) => setFilaAbierta(si ? id : null)}
        onMover={(paso) => tocarCapas(moverCapa(ids, id, paso))}
        onQuitar={() => {
          setFilaAbierta(null);
          tocarCapas(quitarCapa(ids, id));
        }}
      >
        {svg(alto, hijos)}
      </FilaDeCapa>
    );
  });

  /* «+ Añadir fila»: lo que no se ve y tiene datos, por grupos. */
  const porAnadir = disponibles.filter((c) => !ids.includes(c.id));
  const itemsAnadir = GRUPOS.flatMap((g) => {
    const suyas = porAnadir.filter((c) => c.grupo === g);
    return suyas.length ? [{ grupo: g }, ...suyas.map((c) => ({ label: c.nombre, run: () => tocarCapas([...ids, c.id]) }))] : [];
  });

  const hueco = <span className="tl-fila-nombre" aria-hidden="true" />;

  /* ── El calendario: las mismas cuentas, día a día ───────────────────────
     Las sensaciones de la vista que se ve en la gráfica, por semanas: la
     semana enseña la primera que esté en un extremo. */
  const claveDeFilas = ids.join('|');
  const sensaciones = useMemo(
    () =>
      claveDeFilas
        .split('|')
        .map((id) => capaPorId.get(id))
        .filter((c) => c?.origen)
        .map((c) => ({
          id: c.id,
          nombre: c.nombre,
          max: escalaDe(c.pregunta).max,
          celdas:
            c.origen === 'checkin'
              ? celdasDeCheckin({ semanas, pregunta: c.pregunta, hoy })
              : celdasDeSesionPorSemana({ semanas, sesionesPorLunes, pregunta: c.pregunta, hoy }),
        })),
    [claveDeFilas, capaPorId, semanas, sesionesPorLunes, hoy]
  );
  const semanasCal = useMemo(
    () =>
      modo === 'calendario'
        ? semanasDelCalendario({
            semanas,
            hoy,
            diasDe,
            entrenoDe: (l) => (conEntreno ? entreno.get(l) || null : null),
            intervenciones,
            contexto,
            destino,
            fases,
            sensaciones,
          })
        : [],
    [modo, semanas, hoy, diasDe, conEntreno, entreno, intervenciones, contexto, destino, fases, sensaciones]
  );

  /* Dónde va y cómo va: la misma cabecera en la gráfica y en el calendario. */
  const cabeceraDeLaTemporada = (
    <header className="tl-cabecera">
      <p className="tl-cabecera-destino">
        {destino && <Flag size={15} aria-hidden="true" />}
        <b>{cabecera.titulo}</b>
        {cabecera.detalle.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </p>
      {cabecera.cifras.length > 0 && (
        <dl className="tl-cabecera-cifras">
          {cabecera.cifras.map((c) => (
            <div key={c.dice} title={c.title || undefined}>
              <dt>{c.dice}</dt>
              <dd className="tnum">{c.valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );

  return (
    <div className={`tl${modo === 'calendario' ? ' is-calendario' : ''}`}>
      <div className="tl-mandos">
        <SegmentedControl value={modo} onChange={cambiarModo} options={VISTAS} label="Cómo se ve" />
        {/* Las vistas son filas de la gráfica: en el calendario no pintan nada. */}
        {modo === 'grafica' && (
          <div className="tl-mandos-derecha">
            <SelectorDeVista
              nombre={nombreDeVista}
              vistas={vistas}
              actual={mismasCapas(ids, deLaVista) ? vistaElegida?.id ?? null : null}
              porDefecto={!vistaElegida && mismasCapas(ids, deLaVista)}
              onElegir={elegirVista}
              onGuardar={guardarVista}
              onBorrar={borrarVista}
            />
            <SegmentedControl value={atajo} onChange={elegirAtajo} options={ATAJOS} label="Cuánto tiempo se ve" />
          </div>
        )}
      </div>

      {modo === 'calendario' && (
        <div className="tl-marco is-calendario">
          <div className="tl-arriba">{cabeceraDeLaTemporada}</div>
          <Calendario
            semanas={semanasCal}
            hoy={hoy}
            seleccion={seleccion}
            elegida={pieza}
            telefono={telefono}
            onPieza={setPieza}
            onSeleccion={elegirDias}
            onMes={setMesVisto}
          />
        </div>
      )}

      {/* La gráfica no se desmonta en el calendario: vuelve con su zoom. */}
      <div ref={marcoRef} className="tl-marco" style={{ '--tl-nombres': `${nombres}px`, '--tl-derecha': `${derecha}px` }} hidden={modo === 'calendario'}>
        {/* ── Dónde va y cómo va; con el cursor, lo que hay debajo ── */}
        <div className="tl-arriba">
          {cabeceraDeLaTemporada}
          {lectura && (
            <div className="tl-lectura">
              <p className="tl-lectura-texto tnum">
                <b>{lectura.titulo}</b>
                {lectura.piezas.map((p, i) => (
                  <span key={`${i}-${p}`}>{p}</span>
                ))}
              </p>
            </div>
          )}
        </div>

        <div
          ref={(el) => {
            refAncho.current = el;
            lienzoRef.current = el;
          }}
          className={`tl-lienzo is-${nivel}`}
          role="application"
          aria-roledescription="línea de tiempo"
          aria-label={`Temporada. Pasar por encima lee cada ${porDias ? 'día' : 'semana'}; pulsar enseña su detalle debajo. Flechas para moverse, más y menos para acercar; arrastrar acerca a ese tramo y el doble clic aleja; pulsar una semana del pie la abre.`}
          tabIndex={0}
          {...gestos}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setCursor(null);
          }}
          onClick={pulsar}
          onDoubleClick={alDobleClic}
        >
          {/* ── La ruta ── */}
          <div className="tl-fila">
            {hueco}
            <svg className="tl-ruta" width={ancho} height={altoRuta} viewBox={`0 0 ${ancho} ${altoRuta}`}>
              <Ruta
                escala={escala}
                fases={fases}
                hoy={hoy}
                destino={destino}
                cruce={plan.cruce}
                hechos={hechosVistos}
                marcas={marcasVistas}
                elegida={abierta?.id ?? null}
                onPieza={elegirPieza}
                onGrupo={(g) => acercarA(g.desde, g.hasta)}
              />
            </svg>
          </div>

          {/* ── Las filas, sobre el color de sus fases ── */}
          <div className="tl-grafica">
            <div className="tl-fondo" aria-hidden="true">
              {fondoDeFases}
              <div style={{ opacity: Math.round(rayas * 100) / 100 }}>{rayasDeSemana}</div>
            </div>
            {filas}
            <div className="tl-capa" aria-hidden="true">
              {destino?.date && vertical(destino.date, 'is-destino')}
              {vertical(hoy, 'is-hoy')}
              {columnaElegida}
              {franjaEnPx}
              {cursorX !== null && <span className="tl-cursor" style={{ left: cursorX }} />}
            </div>
            {/* Fuera de la capa muda: sus bordes se mueven con el teclado. */}
            {ventanasEnPx && <div className="tl-capa tl-capa-ventanas">{ventanasEnPx}</div>}
          </div>

          <div className="tl-fila tl-fila-eje">
            <span className="tl-fila-nombre tl-eje-flecha is-izquierda">
              <button type="button" className="btn btn-icon btn-icon-compact" aria-label="Semanas anteriores" disabled={alPrincipio} onPointerDown={noEsLienzo} onClick={flecha(-1)}>
                <ChevronLeft size={16} />
              </button>
            </span>
            <EjeDeTiempo escala={escala} semanas={semanas} hoy={hoy} />
            <span className="tl-eje-flecha">
              <button type="button" className="btn btn-icon btn-icon-compact" aria-label="Semanas siguientes" disabled={alFinal} onPointerDown={noEsLienzo} onClick={flecha(1)}>
                <ChevronRight size={16} />
              </button>
            </span>
          </div>
        </div>

        {/* ── Dónde estás: la temporada entera, cuando no se ve toda ── */}
        {nivel !== 'temporada' && (
          <div className="tl-fila tl-fila-mini">
            {hueco}
            <Minimapa limites={limites} vista={vista} ancho={ancho} fases={fases} semanas={semanas} hoy={hoy} onMover={ponerYa} onIr={irA} />
          </div>
        )}

        {itemsAnadir.length > 0 && (
          <div className="tl-anadir-fila">
            <MenuAcciones label="+ Añadir fila" clase="tl-anadir" sinFlecha alineado="izquierda" ariaLabel="Añadir una fila a la gráfica" items={itemsAnadir} />
          </div>
        )}
      </div>

      <Inspector
        pieza={pieza}
        ctx={ctx}
        periodo={periodo}
        rango={elegidas}
        telefono={telefono}
        onCerrar={() => setPieza(null)}
        onMover={mover}
        onAbrirRevision={(l) => navigate(semanaPath(clientId, l))}
        onAbrirRevisiones={abrirRevisiones}
        onQuitarRango={quitarSeleccion}
      />
    </div>
  );
};

/**
 * La línea de tiempo del cliente activo, con las semanas de Revisiones.
 *
 * @param plan    `useSemanasDeRevision().plan`: las filas del plan.
 * @param estados `useSemanasDeRevision().estados`: el estado de revisión de
 *                cada semana. Llega de quien la monta (la portada) para no
 *                pedir las entregas dos veces.
 */
export const LineaDeTiempo = ({ plan, estados }) => {
  const { activeClient, phases, hechos, workoutData, coachPrefs, updateCoachPreferences, notasDeIntervencion, guardarIntervencion } = useApp();
  /* Las vistas de la gráfica son del ENTRENADOR, no del cliente: viven en
     `profiles.preferences.temporada` (`{ vistas: [{ id, nombre, capas }],
     ultima }`) y le sirven para todos sus clientes. */
  const guardarPrefs = useCallback((parche) => updateCoachPreferences('temporada', parche), [updateCoachPreferences]);
  const fases = useMemo(() => sortPhases(phases), [phases]);
  const objetivoKg = activeClient ? clientGoal(activeClient)?.targetWeightKg ?? null : null;
  /* El programa con el plan del bloque puesto en cada semana, como lo leen
     la portada y la revisión. */
  const program = useMemo(() => {
    const suyo = workoutData?.[activeClient?.id];
    return suyo ? { ...suyo, microcycles: resolvedMicrocycles(suyo) } : null;
  }, [workoutData, activeClient?.id]);
  const semanas = useMemo(
    () => (plan ? plan.semanas.map((s) => estados?.porLunes.get(s.lunes) || s) : []),
    [plan, estados]
  );

  if (!activeClient) return null;
  if (!plan || (fases.length === 0 && !plan.semanas.some((s) => s.media !== null))) {
    return (
      <EmptyState
        icon={Route}
        title="Todavía no hay temporada que dibujar"
        message="Cuando tenga una fase con fechas o algún pesaje, aquí verás su temporada entera: a dónde va, por qué fases pasa y lo que pesa."
      />
    );
  }

  return (
    <Temporada
      plan={plan}
      semanas={semanas}
      fases={fases}
      objetivoKg={objetivoKg}
      clientId={activeClient.id}
      client={activeClient}
      hechos={hechos}
      program={program}
      prefs={coachPrefs?.temporada || null}
      guardarPrefs={guardarPrefs}
      notasDeIntervencion={notasDeIntervencion}
      guardarIntervencion={guardarIntervencion}
    />
  );
};
