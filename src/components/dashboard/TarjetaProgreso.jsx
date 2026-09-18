import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Check, CircleHelp, Target, TriangleAlert } from 'lucide-react';

import { metricPoints } from '@/domain/analytics';
import { perimeterSeries, seriesDelta, weightSeries } from '@/domain/anthropometry';
import { blocksOf } from '@/domain/blocks';
import { GOAL_DIRECTIONS } from '@/domain/goals';
import { metricColor } from '@/domain/metrics';
import { phaseProgress, phaseProjection } from '@/domain/roadmap';
import { allSessions } from '@/domain/sessions';
import { trainingDayCount } from '@/domain/training';
import { daysBetween, localeNumber, shortDate } from '@/lib/dates';
import { fmt } from '@/lib/num';
import { Delta } from '@/components/ui/metrics';
import { useOculto } from '@/components/Client/Oculto';
import { GraficaDelProgreso } from './GraficaDelProgreso';
import { Tarjeta, TarjetaVacia } from './Tarjeta';

const MARCA = { good: Check, warn: TriangleAlert, bad: TriangleAlert, unknown: CircleHelp };
const signo = (v, decimals = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), { decimals })}`;

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
 *     │  la gráfica: el peso en puntos sobre las columnas del plan       │
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
  pesoWow,
  checkIn,
  trend,
  veredicto,
  goal,
  canEditGoal = false,
  onSetGoal,
  fases,
  hoy,
  history,
  microcycles,
  startDate,
  // ── quién mira y por dónde sale ──
  isClient = false,
  onAbrir,
  onAbrirFases,
  aFotos = null,
  aPesaje = null,
}) => {
  /*
    ══ Lo que su entrenador le oculta A ÉL ════════════════════════════════════
    Con las calorías ocultas, las columnas del plan son exactamente la cifra que
    no debe volverle —y encima con su historia entera—, así que se pasan a pasos;
    si no le pones pasos, no hay columnas y queda la curva sola. Ver `Oculto`.
  */
  const oculto = useOculto();
  /*
    ══ Y A QUIEN LE OCULTAN EL PESO, esta tarjeta es solo la tira ════════════
    Toda la mitad de arriba —la chapa, el dibujo, los hitos— es el peso, y a
    medias no se le enseña: se retira entera. Lo que queda es lo que sí puede
    leer, que son las cifras del pie sin la del peso (cintura, entrenos,
    semanas) y su fase. Antes esto era la tarjeta «Desde que empezó», y se
    llama igual para que siga diciendo de qué es. Ver `Oculto.jsx`.
  */
  const soloCifras = oculto.weight;
  const conBandas = conAjustes && hayPasos && !oculto.nutrition;
  const conPlan = conAjustes && !(oculto.nutrition && !hayPasos);
  const bandaVista = oculto.nutrition ? 'steps' : banda;

  const fase = fases?.current || null;
  const progreso = fase ? phaseProgress(fase, hoy) : null;
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
    tenías puesto esa semana, que es lo que dibuja las columnas. Sin ella, la
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

  /* TODOS los bloques, el primero incluido: la cinta de encima del dibujo dice
     el nombre de cada tramo, y el del primero hace falta para leer la raya. */
  const cambios = useMemo(
    () => (conPlan ? blocksOf(program).map((b) => ({ week: b.fromWeek, name: b.name, id: b.id })) : []),
    [conPlan, program]
  );
  const pesajes = metricPoints(serie, 'weight').length;

  /*
    ══ LA TIRA DEL PIE: lo que ha cambiado desde el primer día ═══════════════
    Es «Desde que empezó», con la fase añadida. Sigue siendo una lista variable:
    la cintura no existe hasta que hay dos perímetros, y a quien tiene el peso
    oculto se le retira la suya —las otras siguen, porque cuánto ha cambiado no
    es solo la báscula—.
  */
  const cifras = useMemo(() => {
    const out = [];

    const pesos = weightSeries(history);
    const peso = seriesDelta(pesos);
    if (peso && pesos.length > 1 && !oculto.weight) {
      out.push({ id: 'peso', k: 'Peso total', v: `${signo(peso.delta)} kg`, color: metricColor('weight') });
    }

    const cintura = perimeterSeries(history, 'ombligo');
    const dc = seriesDelta(cintura);
    if (dc && cintura.length > 1) {
      out.push({ id: 'cintura', k: 'Cintura', v: `${signo(dc.delta)} cm`, color: metricColor('waist') });
    }

    const sesiones = allSessions(microcycles).length;
    if (sesiones > 0) {
      const dias = program?.weeklySplit ? trainingDayCount(program.weeklySplit) : null;
      out.push({
        id: 'sesiones',
        k: 'Entrenos',
        v: `${sesiones} ${sesiones === 1 ? 'sesión' : 'ses.'}`,
        s: dias ? `${dias} a la semana` : null,
      });
    }

    const semanasVividas = startDate
      ? Math.max(1, Math.floor((daysBetween(startDate, hoy) ?? 0) / 7) + 1)
      : null;
    if (semanasVividas) {
      out.push({
        id: 'tiempo',
        k: 'Semanas',
        v: `${semanasVividas} sem.`,
        s: `desde el ${shortDate(startDate)}`,
      });
    }

    if (checkIn && pesajes > 0) {
      out.push({
        id: 'pesajes',
        k: 'Pesajes',
        v: checkIn.asked ? `${checkIn.count} de ${checkIn.target}` : `${checkIn.count}`,
        s: 'esta semana',
      });
    }

    return out;
  }, [history, microcycles, program, startDate, hoy, oculto.weight, checkIn, pesajes]);

  const vacio = soloCifras ? cifras.length === 0 : semanas.length < 2;

  return (
    <Tarjeta
      rotulo={
        soloCifras
          ? isClient
            ? 'Desde que empezaste'
            : 'Desde que empezó'
          : isClient
            ? 'Tu progreso'
            : 'El progreso'
      }
      span={12}
      className="progreso"
      vacia={vacio}
      accion={
        <div className="progreso-mandos">
          {!soloCifras && chapa && !pideObjetivo && (
            <span className={`progreso-chip${tono ? ` is-${tono}` : ' is-neutro'}`}>
              {!isClient && (
                <i aria-hidden="true">
                  <Icono size={13} strokeWidth={2.5} />
                </i>
              )}
              {chapa.texto}
            </span>
          )}
          {!soloCifras && conBandas && (
            <div className="rail-wrap" role="group" aria-label="Contra qué se compara el peso">
              <button type="button" className="chip" aria-pressed={banda === 'kcals'} onClick={() => onBanda('kcals')}>
                Calorías
              </button>
              <button type="button" className="chip" aria-pressed={banda === 'steps'} onClick={() => onBanda('steps')}>
                Pasos
              </button>
            </div>
          )}
          <div className="tarjeta-acciones">
            {aFotos && (
              <Link className="cab-accion is-puerta" to={aFotos}>
                {isClient ? 'Tus fotos' : 'Sus fotos'}
              </Link>
            )}
            {!soloCifras && (
              <button type="button" className="cab-accion is-puerta" aria-haspopup="dialog" onClick={onAbrir}>
                Ver a fondo
              </button>
            )}
          </div>
        </div>
      }
    >
      {/* Sin objetivo, lo único que hay que hacer: ponerlo. Los tres chips aquí
          mismo y no en una pantalla de ajustes, porque es lo que desbloquea la
          lectura del panel entero. */}
      {pideObjetivo && !soloCifras && (
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
      {!pideObjetivo && !soloCifras && chapa?.detalle && <p className="progreso-dicho">{chapa.detalle}</p>}

      {soloCifras ? (
        cifras.length === 0 && (
          <TarjetaVacia>
            {isClient
              ? 'Con tus primeras medidas y sesiones, aquí verás cuánto has cambiado.'
              : 'Con dos medidas o dos sesiones, aquí se cuenta cuánto ha cambiado.'}
          </TarjetaVacia>
        )
      ) : vacio ? (
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
          cambios={cambios}
          objetivo={proyeccion?.objetivo ?? null}
          ariaLabel={`Su peso de la semana ${semanas[0].week} a la ${semanas[semanas.length - 1].week}`}
        />
      )}

      {cifras.length > 0 && (
        <div className="progreso-cifras">
          {cifras.map((c) => (
            <span className="progreso-cifra" key={c.id} title={c.s || undefined}>
              <span className="k">{c.k}</span>
              <span className="v" style={c.color ? { color: c.color } : undefined}>
                {c.v}
              </span>
            </span>
          ))}
          {/* La fase es la única cifra que además es una PUERTA: es el criterio
              con el que se juzga todo lo de arriba, y se decide en su ventana. */}
          {fase && (
            <button
              type="button"
              className="progreso-cifra is-puerta"
              aria-haspopup="dialog"
              onClick={onAbrirFases}
            >
              <span className="k">Fase</span>
              <span className="v">
                {fase.title}
                {progreso?.total ? (
                  <small>
                    {' '}
                    S{Math.ceil(progreso.elapsed / 7)}/{Math.ceil(progreso.total / 7)}
                  </small>
                ) : null}
              </span>
            </button>
          )}
          {!fase && (
            <button type="button" className="progreso-cifra is-puerta" aria-haspopup="dialog" onClick={onAbrirFases}>
              <span className="k">Fase</span>
              <span className="v is-hueco">{isClient ? 'Sin fase' : 'Ponle una fase'}</span>
            </button>
          )}
          {/* La variación de la semana, al final de la tira: es la cifra que se
              lee justo después del último punto del dibujo. */}
          {pesoWow?.delta !== null && pesoWow?.delta !== undefined && !oculto.weight && (
            <span className="progreso-cifra">
              <span className="k">Esta semana</span>
              <span className="v">
                <Delta value={pesoWow.delta} unit=" kg" lowerIsBetter />
              </span>
            </span>
          )}
        </div>
      )}
    </Tarjeta>
  );
};
