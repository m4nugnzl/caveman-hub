import { useState } from 'react';
import { Route } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { directionById } from '@/domain/goals';
import { metricColor } from '@/domain/metrics';
import { weekFromStart } from '@/domain/photos';
import { localeNumber, miles, shortDate, weekStart } from '@/lib/dates';
import { useElementWidth } from '@/lib/useElementWidth';
import { Globo, GloboCifra, GloboLinea, GloboNada, sitioDelGlobo } from '@/components/ui/Globo';
import { EmptyState, SegmentedControl } from '@/components/ui/primitives';
import { LeyendaDelPlan, LineaDelPlan } from './LineaDelPlan';
import { ventanaDe } from './geometria';
import { usePlanDelRoadmap } from './usePlanDelRoadmap';

/**
 * LA TEMPORADA ENTERA, DE UN VISTAZO.
 *
 * ══ Qué es ════════════════════════════════════════════════════════════════
 *
 * La pestaña con la que abre la ventana del plan: la gráfica continua de toda
 * la temporada —las fases de fondo, el peso real contra lo esperado, los
 * fantasmas de cada igualado, el cruce con sus dos caminos, los hechos en su
 * franja y la escalera de kcal con los hilos que suben hasta la curva—. Es
 * exactamente el mismo dibujo que las tiras de la portada de Revisiones, a otro
 * zoom: la misma escala (`escalaDePeso`), la misma tinta y los mismos puntos de
 * pesaje (`TrazoDelPeso`). La otra pestaña, «Plan», es donde se edita.
 *
 * ══ Se mira, no se toca ════════════════════════════════════════════════════
 *
 * Señalar una semana enseña su globo; pulsarla lleva a esa semana en Revisiones
 * y cierra la ventana. Aquí no se cambia nada: no se arrastra la selección, no
 * se abre el editor del plan desde la banda de fases y no se iguala. Para eso
 * están la pestaña «Plan» y la propia revisión de la semana.
 *
 * ── Datos, no veredictos ───────────────────────────────────────────────────
 * El globo dice lo que esa semana pesó, lo que se esperaba y lo que tenía
 * pautado. El desvío va en tinta, sin rojo ni verde y sin una palabra sobre si
 * la semana fue bien: eso lo decide quien mira.
 */

const ZOOMS = [
  { id: 'temporada', label: 'Temporada' },
  { id: 'fase', label: 'Fase' },
];

/* Más ancha, las semanas se separan tanto que la media deja de leerse como una
   curva. La misma regla que la espina de la revisión. */
const ANCHO_MAXIMO = 1280;

/*
  ── VOLVER DONDE SE ESTABA ────────────────────────────────────────────────
  Al pulsar una semana la ventana se cierra y la app se va a esa revisión; si
  se vuelve a abrir, vuelve en Temporada y con esa semana marcada. Se guarda
  aquí, en memoria y por cliente: es dónde estaba mirando, no una preferencia
  suya, así que no tiene por qué sobrevivir a recargar la página.
*/
const visto = new Map();

const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signoKg = (v) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : '±'}${kg(Math.abs(v))}`;
const signoMiles = (v) => `${v > 0 ? '+' : '−'}${miles(Math.abs(v))}`;

export const VistaDeTemporada = ({ onIrASemana }) => {
  const { activeClient } = useApp();
  const { plan, hoy } = usePlanDelRoadmap();
  const [ref, medido] = useElementWidth(820);
  const [zoom, setZoom] = useState('temporada');
  /* La fase que se mira en el zoom de Fase: la de la última semana señalada.
     Se mueve con el ratón porque ahí no marca nada, solo elige la ventana. */
  const [foco, setFoco] = useState(() => visto.get(activeClient?.id) || null);
  /* Y la que quedó marcada de la última vez: se lee al montar y no se toca.
     Pasar el ratón por encima no es elegir una semana. */
  const [marcada] = useState(() => visto.get(activeClient?.id) || null);
  /* La señalada lleva su sitio dentro del dibujo: los márgenes y la escala son
     de la línea, y el globo se monta fuera del SVG. */
  const [senalada, setSenalada] = useState(null);

  if (!plan || plan.semanas.length === 0) {
    return (
      <EmptyState
        icon={Route}
        title="Todavía no hay temporada que dibujar"
        message="Cuando tenga una fase con fechas y algún pesaje, aquí verás su temporada entera: lo esperado, lo que pesó y lo que le pautaste."
      />
    );
  }

  const ancho = Math.min(medido, ANCHO_MAXIMO);
  const lunes = foco || weekStart(hoy);
  const ventana = ventanaDe({ zoom, plan, lunes });
  const hayOriginal = [...plan.expectativas.values()].some((e) => e && e.tramos.length > 1);
  const hayKcal = plan.semanas.some((s) => s.pauta?.kcals);

  const senalar = (semana, sitio) => {
    if (!semana) return setSenalada(null);
    setFoco(semana);
    setSenalada({ lunes: semana, ...sitio });
  };
  const abrir = (semana) => {
    visto.set(activeClient?.id, semana);
    onIrASemana?.(semana);
  };

  const s = senalada ? plan.semanas.find((x) => x.lunes === senalada.lunes) : null;
  const cambioKcal = s?.cambios?.find((c) => c.k === 'kcals') || null;
  const numero = s ? weekFromStart(activeClient?.startDate, s.lunes) : null;
  const tintaFase = s?.fase ? directionById(s.fase.direction)?.color || null : null;

  return (
    <div className="stack">
      <div className="temporada-mandos">
        <span className="temporada-ayuda">Pulsa una semana para abrir su revisión</span>
        {/* «Ver» delante porque la pestaña de arriba ya se llama Temporada: sin
            el rótulo, la misma palabra sale dos veces diciendo cosas distintas. */}
        <span className="temporada-zoom">
          <span className="temporada-rotulo">Ver</span>
          <SegmentedControl value={zoom} onChange={setZoom} options={ZOOMS} label="Cuánto tiempo se ve" />
        </span>
      </div>

      <div className="temporada-lienzo" ref={ref}>
        <LineaDelPlan
          plan={plan}
          ventana={ventana}
          ancho={ancho}
          elegida={marcada}
          senalada={senalada?.lunes || null}
          onSenalar={senalar}
          onElegir={abrir}
        />
        {s && senalada && (
          <Globo
            {...sitioDelGlobo({ x: senalada.x, y: senalada.y, W: senalada.W, H: senalada.H })}
            cab={`${numero ? `S${numero} · ` : ''}${shortDate(s.lunes)}`}
            marca={s.estado === 'hoy' ? 'Esta semana' : null}
          >
            {s.media !== null && s.media !== undefined ? (
              <GloboCifra color={metricColor('weight')} unidad="kg">
                {kg(s.media)}
              </GloboCifra>
            ) : (
              <GloboNada>{s.estado === 'futura' ? 'Todavía no ha pasado' : 'Sin pesaje esa semana'}</GloboNada>
            )}

            {s.esperado !== null && s.esperado !== undefined && (
              <GloboLinea muestra="meta" color={tintaFase}>
                Esperado {kg(s.esperado)} kg
                {s.desvio !== null && s.desvio !== undefined ? ` · ${signoKg(s.desvio)}` : ''}
              </GloboLinea>
            )}
            {s.pauta?.kcals ? (
              <GloboLinea muestra="fondo" color="var(--text-tertiary)">
                {miles(s.pauta.kcals)} kcal pautadas
              </GloboLinea>
            ) : null}
            {cambioKcal && cambioKcal.de !== null && cambioKcal.de !== undefined && (
              <GloboLinea muestra="escalon" color="var(--text-tertiary)">
                {signoMiles(cambioKcal.a - cambioKcal.de)} kcal esa semana
              </GloboLinea>
            )}
            {/* La fase y en qué punto de ella va. El ritmo no: ya está
                escrito encima de su banda, en el propio dibujo. */}
            {s.fase && (
              <GloboLinea>
                {s.fase.title}
                {s.semanaFase ? ` · semana ${s.semanaFase}${s.totalFase ? ` de ${s.totalFase}` : ''}` : ''}
              </GloboLinea>
            )}
            {s.hechos.length > 0 && <GloboLinea>{s.hechos.map((h) => h.title).join(' · ')}</GloboLinea>}
          </Globo>
        )}
      </div>

      <LeyendaDelPlan hayOriginal={hayOriginal} hayKcal={hayKcal} />
    </div>
  );
};
