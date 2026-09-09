import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dumbbell, ExternalLink } from 'lucide-react';

import { useData } from '@/context/AppContext';
import { byMuscle } from '@/domain/equipment';
import { muscleColor } from '@/domain/training';
import { pieceSummary } from '@/domain/pieces';
import { strengthByExercise } from '@/domain/reading';
import { fieldText } from '@/domain/profile';
import { localeNumber } from '@/lib/dates';
import { Thumb } from '@/components/photos/Thumb';

/**
 * EL CAJÓN DE MATERIAL: el cliente, al lado de la mesa.
 *
 * ══ La ley que lo trae ═════════════════════════════════════════════════════
 * El material viene a la mesa: lo que hace falta para decidir aparece donde se
 * decide. Montar un bloque se hacía con el álbum del gimnasio en otra pestaña
 * y el historial en popups, ejercicio a ejercicio. Aquí están los dos, en una
 * columna al lado del plan, mientras se escribe.
 *
 * ── Y por qué NO es un catálogo ────────────────────────────────────────────
 * El cajón de Coachway es un almacén genérico (1.772 ejercicios de nadie). El
 * nuestro es ESTE cliente: las fotos de sus máquinas por grupo muscular, y lo
 * que ha levantado con su tendencia. No propone nada — trae el material, y el
 * criterio es del entrenador.
 *
 * ── Plegable, y se acuerda ─────────────────────────────────────────────────
 * Quien programa cada semana ya se sabe el gimnasio de su cliente y quiere el
 * ancho para las hojas. Plegado queda un asa con el icono; la elección se
 * guarda en el navegador porque es una postura de trabajo, no un dato.
 */

const PLEGADO_KEY = 'banco-cajon-plegado';

const leePlegado = () => {
  try {
    return localStorage.getItem(PLEGADO_KEY) === '1';
  } catch {
    /* Sin almacenamiento (modo privado), se abre: es el defecto. */
    return false;
  }
};

const guardaPlegado = (valor) => {
  try {
    localStorage.setItem(PLEGADO_KEY, valor ? '1' : '0');
  } catch {
    /* Sin almacenamiento no se recuerda: la postura dura lo que la pestaña. */
  }
};

export const CajonDeMaterial = ({
  microcycles = [],
  /* Tus piezas: los días guardados del entrenador, y sus dos verbos. Como en
     toda la casa, cada acción existe si —y solo si— llega su manejador. */
  piezas = [],
  onPonerPieza = null,
  onQuitarPieza = null,
}) => {
  const { equipment, activeClient } = useData();
  const [plegado, setPlegado] = useState(leePlegado);
  const [pestana, setPestana] = useState(null);

  const tandas = byMuscle(equipment);
  const carpeta = fieldText(activeClient?.profile, 'gymFolder');

  /* Los últimos pesos y su tendencia, por ejercicio: el mismo 1RM estimado que
     usan la lectura y la progresión. En orden alfabético, que es como se busca
     un nombre concreto — aquí no se juzga, se consulta. */
  const historial = useMemo(
    () => strengthByExercise(microcycles).sort((a, b) => a.name.localeCompare(b.name)),
    [microcycles]
  );

  /* Sin foto ninguna pero con historial, el cajón abre por donde hay algo. */
  const abierta = pestana || (tandas.length === 0 && historial.length > 0 ? 'historial' : 'gimnasio');

  const plegar = (valor) => {
    setPlegado(valor);
    guardaPlegado(valor);
  };

  if (plegado) {
    return (
      <aside className="banco-cajon is-plegado" aria-label="El material del cliente">
        <button
          type="button"
          className="btn btn-icon cajon-abrir"
          onClick={() => plegar(false)}
          aria-label="Desplegar el material del cliente"
          title="El material: su gimnasio y su historial"
        >
          <Dumbbell size={15} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="banco-cajon" aria-label="El material del cliente">
      <div className="cajon-cab">
        <span className="section-label">El material</span>
        <button type="button" className="link cajon-plegar" onClick={() => plegar(true)}>
          plegar
        </button>
      </div>

      <div className="cajon-tabs" role="tablist" aria-label="Qué material mirar">
        <button
          type="button"
          role="tab"
          aria-selected={abierta === 'gimnasio'}
          className={`cajon-tab${abierta === 'gimnasio' ? ' is-on' : ''}`}
          onClick={() => setPestana('gimnasio')}
        >
          Su gimnasio
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={abierta === 'historial'}
          className={`cajon-tab${abierta === 'historial' ? ' is-on' : ''}`}
          onClick={() => setPestana('historial')}
        >
          Su historial
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={abierta === 'piezas'}
          className={`cajon-tab${abierta === 'piezas' ? ' is-on' : ''}`}
          onClick={() => setPestana('piezas')}
        >
          Tus piezas
        </button>
      </div>

      {abierta === 'gimnasio' ? (
        <div className="cajon-cuerpo">
          {tandas.length === 0 ? (
            <p className="t-xs t-tertiary">
              Sin fotos de sus máquinas todavía. Se suben en su{' '}
              <Link to={`/c/${activeClient?.id}/ficha`}>ficha</Link> y aquí se ven mientras
              programas: qué tiene para pierna, el día que toca pierna.
            </p>
          ) : (
            tandas.map((tanda) => (
              <div key={tanda.group} className="cajon-grupo">
                <span className="section-label" style={{ color: muscleColor(tanda.group) }}>
                  {tanda.group} · {tanda.items.length}
                </span>
                <div className="cajon-fotos">
                  {tanda.items
                    .filter((pieza) => pieza.url)
                    .map((pieza) => (
                      <figure key={pieza.id} className="gym-shot">
                        <Thumb url={pieza.url} alt={pieza.name || tanda.group} width={220} />
                        {pieza.name && (
                          <figcaption className="t-2xs t-tertiary">{pieza.name}</figcaption>
                        )}
                      </figure>
                    ))}
                </div>
              </div>
            ))
          )}
          {carpeta && (
            <a className="t-xs cajon-carpeta" href={carpeta} target="_blank" rel="noreferrer noopener">
              <ExternalLink size={13} /> Abrir su carpeta
            </a>
          )}
        </div>
      ) : abierta === 'piezas' ? (
        <div className="cajon-cuerpo">
          {piezas.length === 0 ? (
            <p className="t-xs t-tertiary">
              Ninguna pieza guardada todavía. Guarda tu mejor día —el menú de su hoja, «Guardarla
              como pieza tuya»— y tenlo aquí para el bloque de cualquier cliente.
            </p>
          ) : (
            <ul className="cajon-historial">
              {piezas.map((pieza) => (
                <li key={pieza.id}>
                  <div className="cajon-fila">
                    <span className="cajon-ej" title={pieza.name}>
                      {pieza.name}
                    </span>
                  </div>
                  <span className="cajon-dir">{pieceSummary(pieza)}</span>
                  <span className="cajon-verbos">
                    {onPonerPieza && (
                      <button
                        type="button"
                        className="link"
                        onClick={() => onPonerPieza(pieza)}
                        title="Entra como una hoja nueva del bloque abierto, con todo lo suyo dentro"
                      >
                        ponerla en el bloque
                      </button>
                    )}
                    {onQuitarPieza && (
                      <button type="button" className="link" onClick={() => onQuitarPieza(pieza)}>
                        quitar
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="cajon-cuerpo">
          {historial.length === 0 ? (
            <p className="t-xs t-tertiary">
              Aún no hay historial: sale solo cuando registre unos cuantos entrenamientos.
            </p>
          ) : (
            <ul className="cajon-historial">
              {historial.map((fila) => (
                <li key={fila.name}>
                  <div className="cajon-fila">
                    <span
                      className="cajon-ej"
                      title={`${fila.name}: 1RM estimado en sus últimos ${fila.weeks} registros`}
                    >
                      {fila.name}
                    </span>
                    <span className="cajon-kg">{localeNumber(Math.round(fila.e1rm))} kg</span>
                  </div>
                  {/* «A la baja» en ámbar, no en rojo: es una señal para el plan
                      siguiente, no un vencimiento. Sin reproches. */}
                  <span className={`cajon-dir${fila.dir === 'down' ? ' is-baja' : ''}`}>
                    {fila.dir === 'up' ? 'sube' : fila.dir === 'down' ? 'a la baja' : 'plano'} ·{' '}
                    {fila.weeks} registros
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
};
