import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, CircleHelp, Target, TriangleAlert } from 'lucide-react';

import { metricPoints } from '@/domain/analytics';
import { blocksOf } from '@/domain/blocks';
import { GOAL_DIRECTIONS } from '@/domain/goals';
import { phaseProjection } from '@/domain/roadmap';
import { addDays, localeNumber } from '@/lib/dates';
import { fmt } from '@/lib/num';
import { useOculto } from '@/components/Client/Oculto';
import { GraficaDelProgreso } from './GraficaDelProgreso';
import { Tarjeta, TarjetaVacia } from './Tarjeta';

const MARCA = { good: Check, warn: TriangleAlert, bad: TriangleAlert, unknown: CircleHelp };

/** El ritmo, con dos decimales y el signo menos de verdad (−, no el guion). */
const ritmoDicho = (perWeek) =>
  `${perWeek > 0 ? '+' : '−'}${localeNumber(Math.abs(perWeek), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} kg/semana`;

/**
 * EL PROGRESO — de dónde salió, dónde está y contra qué se compara. UNA caja.
 *
 * ══ Por qué ahora es una sola tarjeta (frame de Figma 50:119, 17 sep) ══════
 *
 * Eran TRES: «Cómo va» (la cuenta y el veredicto), «Desde que empezó» (cuatro
 * cifras) y «El cuerpo» (la curva con la escalera debajo). Tres cajas para una
 * sola pregunta —*¿esto está funcionando?*— y con el peso dicho en las tres: el
 * hito de hoy en la primera, el cambio total en la segunda, la cifra grande en
 * la tercera. Medido sobre la pantalla real: a una persona sin objetivo
 * declarado, «Cómo va» le quedaba en una fila de tres botones y 190 px de aire.
 *
 * El prototipo lo resuelve juntándolas, y la forma que sale es mejor que la
 * suma de las tres porque cada pieza deja de repetir a la de al lado:
 *
 *     El progreso        [En rumbo −0,45 kg/sem]  [Calorías|Pasos]  a fondo →
 *     ┌──────────────────────────────────────────────────────────────────┐
 *     │  la gráfica: el peso en puntos sobre el fondo del plan           │
 *     └──────────────────────────────────────────────────────────────────┘
 *     ─────────────────────────────────────────────────────────────────────
 *     PESO TOTAL −3,8 kg   CINTURA −2,8 cm   ENTRENOS 47   FASE Definición
 *
 *   · El VEREDICTO es una chapa en la cabecera, no un párrafo: es una etiqueta
 *     de estado, y dicha en una línea deja de competir con el dibujo.
 *   · Los HITOS —de dónde salió, dónde está, adónde tiene que llegar— se dicen
 *     DENTRO del dibujo, pegados a su punto. Era una lista de tres cifras al
 *     lado de la misma curva que ya las enseñaba.
 *   · Las cifras de «desde que empezó» pasan de cuatro baldosas hundidas a una
 *     TIRA al pie, bajo un filete: son el contexto de lo de arriba, no cuatro
 *     medidas sueltas que merezcan su propia caja.
 *
 * ── Lo que NO se ha ido con la fusión ──────────────────────────────────────
 * La trayectoria de la fase (`Trayectoria`) sí: era un tercer dibujo del mismo
 * peso, y su proyección la dicen ahora la chapa del objetivo y el veredicto. La
 * fase se queda al pie, como sexta cifra, y sigue abriendo sus fases. Las dos
 * ventanas «a fondo» —el cuerpo y las fotos— siguen en la cabecera.
 *
 * ══ Y la tira se va arriba del todo (19 sep, tercera vuelta) ══════════════
 * Las cifras del pie salen de esta tarjeta y pasan a ser la franja de
 * mini-tarjetas que abre el Resumen (`FranjaCifras`). Lo que queda aquí es el
 * dibujo y su barra de herramientas: con qué se compara (calorías o pasos) y
 * las dos puertas, en una fila encima de la gráfica y no mezcladas con el
 * título. A quien le ocultan el peso esta tarjeta ya no tiene nada que decir
 * —era solo la tira— y no se pinta.
 */
export const TarjetaProgreso = ({
  // ── el dibujo ──
  serie,
  track,
  conAjustes,
  program,
  banda,
  onBanda,
  hayPasos,
  // ── la lectura ──
  trend,
  veredicto,
  goal,
  canEditGoal = false,
  onSetGoal,
  fases,
  hoy,
  history,
  // ── quién mira y por dónde sale ──
  isClient = false,
  onAbrir,
  aFotos = null,
  aPesaje = null,
}) => {
  /*
    ══ Lo que su entrenador le oculta A ÉL ════════════════════════════════════
    Con las calorías ocultas, el fondo del dibujo es exactamente la cifra que no
    debe volverle —y encima con su historia entera—, así que se pasa a pasos; si
    no le pones pasos, no hay fondo y queda la curva sola. Ver `Oculto`.
  */
  const oculto = useOculto();
  /*
    ══ Y A QUIEN LE OCULTAN EL PESO, esta tarjeta no existe ══════════════════
    Toda ella —la chapa, el dibujo, los hitos— es el peso, y a medias no se le
    enseña: se retira entera. Lo que sí puede leer (cintura, entrenos, semanas
    y su fase) lo dice la franja de cifras de arriba. Ver `Oculto.jsx`.
  */
  const soloCifras = oculto.weight;
  const conBandas = conAjustes && hayPasos && !oculto.nutrition;
  const conPlan = conAjustes && !(oculto.nutrition && !hayPasos);
  const bandaVista = oculto.nutrition ? 'steps' : banda;

  const fase = fases?.current || null;
  const proyeccion = fase
    ? phaseProjection({ phase: fase, history, perWeek: trend?.ok ? trend.perWeek : null, goal, date: hoy })
    : null;

  /*
    Al cliente no se le pone nota: la marca de aprobado y el verde son el juicio,
    y el juicio es de su entrenador (ver la ley escrita en `TarjetaComoVa`, que
    esta tarjeta hereda). Lo que sí es suyo es la cifra: su ritmo, sin adjetivo.
  */
  const tono = isClient ? null : veredicto?.tone || 'unknown';
  const Icono = MARCA[tono] || CircleHelp;
  const ritmo = trend?.ok && Number.isFinite(trend.perWeek) ? ritmoDicho(trend.perWeek) : null;
  const chapa = isClient
    ? ritmo && { texto: `A su ritmo, ${ritmo}`, detalle: null }
    : veredicto && {
        /* El título del veredicto YA trae el ritmo dentro («En rumbo: −0,34
           kg/semana»), que es la frase que dibuja el frame. Pegarle el ritmo
           detrás lo decía dos veces en la misma chapa. */
        texto: veredicto.title,
        detalle:
          proyeccion && proyeccion.objetivo !== null
            ? proyeccion.desvio === 0
              ? `Acaba clavado en el objetivo (${fmt(proyeccion.objetivo, { decimals: 1 })} kg).`
              : `Acaba ${fmt(Math.abs(proyeccion.desvio), { decimals: 1 })} kg ${
                  proyeccion.desvio > 0 ? 'por encima' : 'por debajo'
                } del objetivo (${fmt(proyeccion.objetivo, { decimals: 1 })} kg).`
            : veredicto.detail,
      };
  /* Sin objetivo y pudiendo ponerlo, el sermón sobra: lo que hay que hacer son
     los tres chips de aquí abajo. */
  const pideObjetivo = canEditGoal && !goal && veredicto?.id === 'no-goal';

  /*
    ══ LAS SEMANAS DEL DIBUJO ════════════════════════════════════════════════
    Con historia de revisiones, las filas del `track`: llevan el peso Y lo que le
    tenías puesto esa semana, que es lo que dibuja el fondo. Sin ella, la
    serie semanal a secas — el peso solo, sin plan detrás. Se numeran por su
    semana de programa, que es lo que dice el eje.
  */
  const semanas = useMemo(() => {
    if (conPlan) return track;
    return serie
      .map((row, i) => ({
        week: row.programWeeks?.[0] ?? i + 1,
        weight: row.weight,
        kcals: null,
        steps: null,
      }))
      .filter((f) => f.weight !== null && f.weight !== undefined);
  }, [conPlan, track, serie]);

  /*
    ══ LAS BANDAS DEL DIBUJO: PRIMERO LAS FASES, Y SI NO LOS BLOQUES ═════════

    El dibujo tiene que contestar «¿en qué fase está?» sin que haya que leer
    nada más, y eso lo dice la FASE —«Definición», «Volumen»—, no el número de
    bloque: un bloque es una unidad de la rutina, y saber que va por el tercero
    no dice hacia dónde está yendo el cuerpo.

    Así que si el cliente tiene roadmap, las bandas son sus fases. Y si no lo
    tiene —una cartera entera puede no tener ni una, ver `roadmap.js`—, los
    bloques del programa, que es el único reparto del tiempo que queda. Un solo
    sistema de bandas en el dibujo y no dos superpuestos.

    Se traducen aquí, en índices de `semanas`, y no dentro de la gráfica: el
    dibujo no tiene por qué saber qué es una fase ni cómo se compara una fecha
    con el lunes de una semana.
  */
  const tramos = useMemo(() => {
    const porFase = new Map();
    for (const fase of fases?.all || []) {
      if (!fase?.startsOn) continue;
      semanas.forEach((f, i) => {
        if (!f.weekStart) return;
        const domingo = addDays(f.weekStart, 6);
        /* Se solapan si la fase empieza antes de que acabe la semana y acaba
           después de que empiece: una fase que arranca un miércoles cuenta ya
           esa semana, que es como se lee un calendario. */
        if (fase.startsOn > domingo) return;
        if (fase.endsOn && fase.endsOn < f.weekStart) return;
        const t = porFase.get(fase.id) || { desde: i, hasta: i, name: fase.title, id: fase.id };
        t.hasta = i;
        porFase.set(fase.id, t);
      });
    }
    if (porFase.size > 0) return [...porFase.values()].sort((a, b) => a.desde - b.desde);

    if (!conPlan) return [];
    /* TODOS los bloques, el primero incluido: una banda sin nombre no separa
       nada, y el del primero hace falta para leer la del segundo. */
    const bloques = blocksOf(program);
    return bloques
      .map((b, k) => {
        const siguiente = bloques[k + 1];
        let desde = -1;
        let hasta = -1;
        semanas.forEach((f, i) => {
          if (f.week >= b.fromWeek && (!siguiente || f.week < siguiente.fromWeek)) {
            if (desde < 0) desde = i;
            hasta = i;
          }
        });
        return desde < 0 ? null : { desde, hasta, name: b.name, id: b.id };
      })
      .filter(Boolean);
  }, [fases, semanas, conPlan, program]);
  const pesajes = metricPoints(serie, 'weight').length;

  /* Sin peso que enseñar no queda tarjeta: lo que sí puede leer —cintura,
     entrenos, semanas, fase— ya está en la franja de arriba. */
  if (soloCifras) return null;

  const vacio = semanas.length < 2;
  const conBarra = !vacio && (conBandas || aFotos || onAbrir);

  return (
    <Tarjeta
      rotulo={isClient ? 'Tu progreso' : 'El progreso'}
      span={12}
      className="progreso"
      vacia={vacio}
      accion={
        chapa && !pideObjetivo ? (
          <span className={`progreso-chip${tono ? ` is-${tono}` : ' is-neutro'}`}>
            {!isClient && (
              <i aria-hidden="true">
                <Icono size={13} strokeWidth={2.5} />
              </i>
            )}
            {chapa.texto}
          </span>
        ) : null
      }
    >
      {/* Sin objetivo, lo único que hay que hacer: ponerlo. Los tres chips aquí
          mismo y no en una pantalla de ajustes, porque es lo que desbloquea la
          lectura del panel entero. */}
      {pideObjetivo && (
        <div className="goal-set" role="group" aria-label="Objetivo del cliente">
          <Target size={13} />
          <span className="k">¿Qué busca?</span>
          {GOAL_DIRECTIONS.map((d) => (
            <button key={d.id} type="button" className="chip" aria-pressed={false} title={d.hint} onClick={() => onSetGoal(d.id)}>
              {d.short}
            </button>
          ))}
        </div>
      )}
      {!pideObjetivo && chapa?.detalle && <p className="progreso-dicho">{chapa.detalle}</p>}

      {/* ── LA BARRA DEL DIBUJO ──────────────────────────────────────────────
          Dos grupos, y NO uno.

          Estaban los cuatro mandos dentro de un mismo carril hundido con
          canto, y con la misma letra y el mismo fantasma: el conmutador se
          extendía y se llevaba dentro a «Sus fotos» y «Ver a fondo», que no
          son alternativas de la misma serie — una navega a otra pantalla y la
          otra abre una ventana. Un control segmentado dice «esto o lo otro, y
          ahora mismo estás en esto»; decir eso de una puerta es mentira.

          A la izquierda, LA SERIE DE FONDO: un conmutador de verdad, con su
          píldora hundida, donde una opción está pulsada y la otra no. A la
          derecha, LAS ACCIONES: la que navega en forma de enlace y la que abre
          la ventana en forma de botón. Tres idiomas, tres formas. */}
      {conBarra && (
        <div className="progreso-barra">
          {conBandas && (
            /* Es UNA elección entre dos, así que va en el conmutador de la casa
               y no en dos chips sueltos. */
            <div className="segmented" role="group" aria-label="Qué serie se dibuja de fondo">
              <button
                type="button"
                className="segmented-item"
                aria-pressed={banda === 'kcals'}
                onClick={() => onBanda('kcals')}
              >
                Calorías
              </button>
              <button
                type="button"
                className="segmented-item"
                aria-pressed={banda === 'steps'}
                onClick={() => onBanda('steps')}
              >
                Pasos
              </button>
            </div>
          )}
          <div className="progreso-acciones">
            {aFotos && (
              <Link className="progreso-enlace" to={aFotos}>
                {isClient ? 'Tus fotos' : 'Sus fotos'}
                <ChevronRight size={13} aria-hidden="true" />
              </Link>
            )}
            <button type="button" className="progreso-puerta" aria-haspopup="dialog" onClick={onAbrir}>
              Ver a fondo
            </button>
          </div>
        </div>
      )}

      {vacio ? (
        /* El vacío con su verbo: la curva empieza con el primer pesaje, y
           anotarlo está a un clic. */
        <TarjetaVacia
          accion={
            !isClient &&
            aPesaje && (
              <Link className="cab-accion is-puerta" to={aPesaje}>
                {pesajes === 0 ? 'Anota su primer pesaje' : 'Anota otro pesaje'}
              </Link>
            )
          }
        >
          {pesajes === 0
            ? 'Sin pesajes todavía. La curva empieza con el primero.'
            : 'Un solo pesaje. La curva empieza con el segundo.'}
        </TarjetaVacia>
      ) : (
        <GraficaDelProgreso
          semanas={semanas}
          banda={bandaVista}
          tramos={tramos}
          objetivo={proyeccion?.objetivo ?? null}
          ariaLabel={`Su peso de la semana ${semanas[0].week} a la ${semanas[semanas.length - 1].week}`}
        />
      )}
    </Tarjeta>
  );
};
