import { metricPoints } from '@/domain/analytics';
import { blockChanges } from '@/domain/blocks';
import { metricColor } from '@/domain/metrics';
import { fmt } from '@/lib/num';
import { BandChart } from '@/components/ui/charts';
import { Link } from 'react-router-dom';

import { Delta } from '@/components/ui/metrics';
import { ReviewChart } from '@/components/review/ReviewChart';
import { Tarjeta } from './Tarjeta';

/**
 * EL CUERPO — la curva del peso, y debajo lo que le fuiste poniendo.
 *
 * El peso de hoy con lo que ha cambiado, cuántos pesajes lleva, y la curva con
 * la escalera de calorías (o de pasos) debajo: cada peldaño es un ajuste tuyo,
 * y lo de arriba es lo que pasó después. Es la única forma de la tarjeta.
 *
 * Todo lo demás —la tabla semana a semana, la tendencia, el % graso, los
 * perímetros, las escalas del check-in— se abre en su ventana (`PanelCuerpo`):
 * es la prueba, y la prueba se consulta; el panel se mira.
 */
export const TarjetaCuerpo = ({
  serie,
  track,
  conAjustes,
  program,
  ancho,
  banda,
  onBanda,
  hayPasos,
  pesoActual,
  pesoWow,
  checkIn,
  isClient = false,
  onAbrir,
  /* El archivo de sus fotos por semanas. Vivía en la revisión, y las fotos no
     son de una semana: son del cuerpo a lo largo del tiempo, que es esto. */
  aFotos = null,
}) => {
  const weightPts = metricPoints(serie, 'weight');

  return (
    <Tarjeta
      rotulo={isClient ? 'Tu cuerpo' : 'El cuerpo'}
      span={12}
      className="peso"
      accion={
        <div className="tarjeta-acciones">
          {aFotos && (
            <Link className="cab-accion is-puerta" to={aFotos}>
              {isClient ? 'Tus fotos' : 'Sus fotos'}
            </Link>
          )}
          <button type="button" className="cab-accion is-puerta" aria-haspopup="dialog" onClick={onAbrir}>
            Ver a fondo
          </button>
        </div>
      }
    >
      <div className="peso-cab">
        <div className="peso-say">
          <span className="peso-cifra" style={{ color: metricColor('weight') }}>
            {fmt(pesoActual, { decimals: 1 })}
            <small> kg</small>
          </span>
          <Delta value={pesoWow?.delta} unit=" kg" lowerIsBetter />
          {/* Cuántos pesajes lleva: dice si el promedio de esta semana es de
              fiar, no cómo va nadie. Por eso va en voz baja. */}
          <span className="peso-meta">
            {checkIn.count} de {checkIn.target} pesajes esta semana
          </span>
        </div>

        {conAjustes && hayPasos && (
          <div className="rail-wrap" role="group" aria-label="Contra qué se compara el peso">
            <button type="button" className="chip" aria-pressed={banda === 'kcals'} onClick={() => onBanda('kcals')}>
              Calorías
            </button>
            <button type="button" className="chip" aria-pressed={banda === 'steps'} onClick={() => onBanda('steps')}>
              Pasos
            </button>
          </div>
        )}
      </div>

      {conAjustes ? (
        <ReviewChart weeks={track} ancho={ancho} soloLectura banda={banda} cambios={blockChanges(program)} />
      ) : (
        <BandChart
          labels={serie.map((row) => row.label)}
          series={[
            {
              id: 'weight',
              label: 'Peso',
              color: metricColor('weight'),
              unit: ' kg',
              decimals: 1,
              points: weightPts,
            },
          ]}
          height={180}
          emptyMessage={
            isClient
              ? 'Apunta tu peso en el check-in y aquí verás la evolución.'
              : 'Sin pesajes registrados todavía.'
          }
        />
      )}
    </Tarjeta>
  );
};
