import { useState } from 'react';

import { SegmentedControl } from '@/components/ui/primitives';
import { Tarjeta } from '@/components/dashboard/Tarjeta';
import { useElementWidth } from '@/lib/useElementWidth';
import { ventanaDe } from '@/components/roadmap/geometria';
import { LeyendaDelPlan, LineaDelPlan } from '@/components/roadmap/LineaDelPlan';

/**
 * LA ESPINA: el proceso entero del cliente, y el selector de semana de toda la
 * revisión.
 *
 * ══ Qué hace aquí, arriba del todo y fuera de los apartados ═════════════════
 *
 * Es LA pieza que sostiene la pantalla. La revisión tiene tres apartados —peso,
 * entreno, fotos— y los tres hablan de UNA semana; sin algo que diga cuál, la
 * pantalla vuelve a ser tres bloques sueltos. Esto es ese algo, y hace tres
 * cosas a la vez:
 *
 *   1. **Es el selector de semana** de toda la pantalla. Se pulsa o se arrastra.
 *   2. **Es el contexto histórico**, que es lo que impide leer la cifra de esta
 *      semana en el aire: 81,5 kg viniendo de 84 y 81,5 viniendo de 79 son dos
 *      decisiones contrarias.
 *   3. **Es el mapa del proceso**, que es el papel del roadmap: las fases, lo
 *      esperado, hoy, el cruce y el destino. Por eso la espina ES la línea del
 *      roadmap (`LineaDelPlan`) y no un dibujo aparte (R2, 21 sep 2026).
 *
 * ══ En dos estados ═════════════════════════════════════════════════════════
 *
 *   · **Plegada** (por defecto): fina, con lo mínimo del plan —la banda de
 *     fase, el esperado, la media, hoy y el cruce o el destino—, las marcas de
 *     las semanas contestadas y la que espera respuesta.
 *   · **Desplegada**: la línea entera, con los fantasmas de igualado, los
 *     caminos del cruce, los hechos, la escalera de kcal con sus hilos y el zoom
 *     Temporada / Fase.
 *
 * Las dos con ALTO FIJO: si la pantalla es más ancha, la línea se alarga y no
 * se aplana. Pulsar la banda de las fases abre el plan para editarlo.
 *
 * ── Por qué no lleva eje de kilos plegada ──────────────────────────────────
 * Porque plegada no se lee un valor: se lee una FORMA. El valor está tres
 * centímetros más abajo, grande. Desplegada sí lo lleva: es la línea del
 * roadmap, y ahí se compara la media con su recta.
 *
 * El sistema enseña la desviación; no sugiere replanteos, no reajusta solo, no
 * avisa.
 */

const ZOOMS = [
  { id: 'temporada', label: 'Temporada' },
  { id: 'fase', label: 'Fase' },
];

/* Más ancha que esto, la línea se estropea: las semanas se separan tanto que
   la media deja de leerse como una curva. */
const ANCHO_MAXIMO = 1280;

export const TimelineSpine = ({
  plan,
  elegida = null,
  pendiente = null,
  marcas = null,
  abierta = false,
  onAlternar,
  onElegir,
  onPlan = null,
  oculto = {},
  /* La del cliente: se mira y no elige semana, y sin los igualados. */
  soloLectura = false,
  rotulo = 'Roadmap',
}) => {
  const [ref, medido] = useElementWidth(880);
  const [zoom, setZoom] = useState('temporada');
  const [senalada, setSenalada] = useState(null);

  if (!plan || plan.semanas.length === 0) return null;

  const ancho = Math.min(medido, ANCHO_MAXIMO);
  const ventana = ventanaDe({ zoom: abierta ? zoom : 'temporada', plan, lunes: elegida });
  const hayOriginal = !soloLectura && [...plan.expectativas.values()].some((e) => e && e.tramos.length > 1);
  const hayKcal = plan.semanas.some((s) => s.pauta?.kcals);

  return (
    <Tarjeta
      rotulo={rotulo}
      span={12}
      className={`espina${abierta ? ' is-abierta' : ''}`}
      accion={
        <div className="espina-mandos">
          {abierta && <SegmentedControl value={zoom} onChange={setZoom} options={ZOOMS} label="Cuánto tiempo se ve" />}
          <button type="button" className="cab-accion" aria-expanded={abierta} onClick={() => onAlternar?.(!abierta)}>
            {abierta ? 'Plegar ↑' : 'Desplegar ↓'}
          </button>
        </div>
      }
    >
      <div className="espina-linea" ref={ref}>
        <LineaDelPlan
          plan={plan}
          ventana={ventana}
          ancho={ancho}
          espina={!abierta}
          elegida={elegida}
          senalada={senalada}
          marcas={marcas}
          pendiente={pendiente}
          oculto={oculto}
          onSenalar={setSenalada}
          onElegir={soloLectura ? undefined : onElegir}
          onPlan={soloLectura ? null : onPlan}
          arrastrar={!soloLectura}
          sinIgualados={soloLectura}
        />
      </div>

      {abierta && <LeyendaDelPlan oculto={oculto} hayOriginal={hayOriginal} hayKcal={hayKcal} />}
    </Tarjeta>
  );
};
