import { Check, CircleHelp, TriangleAlert } from 'lucide-react';

import { sortedReading } from '@/domain/reading';

const MARCA = { good: Check, warn: TriangleAlert, bad: TriangleAlert, unknown: CircleHelp };

/**
 * Lo que dicen los datos sobre UNA pregunta, encima de su prueba.
 *
 * ══ Por qué la lectura ya no es una lista aparte ════════════════════════════
 *
 * Era «Lectura de la semana»: las cuatro conclusiones juntas en un panel, y cada
 * una con un enlace al grupo de gráficos que la sostiene. Funcionaba como índice
 * de una página de diez gráficos, y esa página ya no existe: ahora cada pregunta
 * tiene su ventana y se abre desde la pieza del panel que la resume.
 *
 * Con eso, el índice sobra y estorba: obligaba a leer cuatro frases sobre cuatro
 * asuntos distintos para después pulsar y llegar a la prueba de una. La
 * conclusión va DONDE ESTÁ SU PRUEBA —dentro de la ventana, arriba del todo— y
 * lo único que queda fuera es la de dirección, que es el veredicto del panel.
 *
 * El cálculo sigue entero en `domain/reading.js`, sin React y con sus pruebas.
 *
 * ── Y siguen sin ser consejos ───────────────────────────────────────────────
 * «Estancado y la adherencia es del 40 %» es un hecho. Lo que se hace con él
 * depende de lo que el entrenador sabe de esa persona y no está en ninguna tabla.
 */
export const Hallazgos = ({ findings, grupo, vacio = null }) => {
  const propios = sortedReading(findings.filter((f) => f.evidence === grupo));

  if (propios.length === 0) {
    return vacio ? <p className="t-sm t-tertiary">{vacio}</p> : null;
  }

  return (
    <ul className="reading">
      {propios.map((finding) => {
        const Icono = MARCA[finding.tone] || CircleHelp;
        return (
          <li key={finding.id}>
            <div className={`read is-${finding.tone}`}>
              <span className="read-mark">
                <Icono size={13} />
              </span>
              <span className="read-body">
                <strong>{finding.title}</strong>
                <span className="t-xs t-secondary">{finding.detail}</span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

/**
 * La chincheta de aviso de un bloque, para su cabecera.
 *
 * Es lo que quedaba de la barra de pestañas del análisis: **qué ventana merece
 * abrirse antes de abrirla**. Sin ella, tres «Ver a fondo →» son tres puertas
 * idénticas y hay que entrar en las tres para saber si pasa algo.
 *
 * ── Por qué recibe un filtro y no un grupo ──────────────────────────────────
 * Porque los bloques del panel y los grupos de evidencia no se corresponden uno
 * a uno. «Ejecución» mezcla los pesajes —que son del cuerpo, y viven en
 * Evolución— con las series registradas, que son del gimnasio. Con un grupo por
 * bloque, Evolución avisaría de que no ha entrenado.
 */
export const avisoDe = (findings, filtro) => {
  const propios = findings.filter(filtro);
  if (propios.some((f) => f.tone === 'bad')) return 'bad';
  if (propios.some((f) => f.tone === 'warn')) return 'warn';
  return null;
};

/** Qué hallazgos son de cada bloque. Ver `avisoDe`. */
export const DE_EVOLUCION = (f) => f.id === 'weigh-ins' || f.id === 'noisy';
export const DE_ENTRENO = (f) =>
  f.evidence === 'performance' || f.evidence === 'feel' || f.id === 'sets';
