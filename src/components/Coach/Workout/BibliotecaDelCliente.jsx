import { useMemo, useState } from 'react';
import { ExternalLink, Plus, Search } from 'lucide-react';

import { useData } from '@/context/AppContext';
import { byMuscle } from '@/domain/equipment';
import { pieceSummary } from '@/domain/pieces';
import { fieldText } from '@/domain/profile';
import { strengthByExercise } from '@/domain/reading';
import { localeNumber } from '@/lib/dates';
import { Thumb } from '@/components/photos/Thumb';

/**
 * LA BIBLIOTECA: de dónde salen los ejercicios, al lado de donde se ponen.
 *
 * ══ Lo que había, y por qué no valía ═══════════════════════════════════════
 * El cajón de material enseñaba el gimnasio del cliente, su historial y las
 * piezas del entrenador — todo de LEER. Para meter un ejercicio había que
 * teclearlo en un buscador que estaba en otra parte de la pantalla, así que el
 * panel que ocupaba un cuarto del ancho no participaba en el trabajo: era un
 * álbum de fotos al lado de un formulario.
 *
 * Aquí la lista es la herramienta: se busca, y cada fila tiene su «+» que la
 * mete en la hoja abierta. Es lo que Coachway resuelve bien —«two clicks and
 * you're there»— y lo que a esta pantalla le faltaba.
 *
 * ══ Y sigue siendo ESTE cliente, que es nuestra ventaja ════════════════════
 * Su catálogo no es un almacén de 1.772 ejercicios de nadie: es la biblioteca
 * del entrenador más el catálogo, y cada fila trae lo que ESTA persona ha
 * levantado —«último 92,5 kg ↑»— porque es lo que decide si el ejercicio entra
 * o no. No propone nada: pone el material delante.
 *
 * ══ Tres pestañas, un trabajo cada una ═════════════════════════════════════
 * · Ejercicios — buscar y meter.
 * · Piezas     — tus días guardados, para poner uno entero.
 * · Gimnasio   — sus máquinas, en miniaturas ordenadas por grupo. Se mira
 *                mientras se elige; por eso está aquí y no en otra pantalla.
 */

const MAX_LISTA = 60;

const normaliza = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export const BibliotecaDelCliente = ({
  library = [],
  microcycles = [],
  piezas = [],
  /* Cada acción existe si —y solo si— llega su manejador, como en toda la casa. */
  onAnadirEjercicio = null,
  onPonerPieza = null,
  hojaAbierta = null,
}) => {
  const { equipment, activeClient } = useData();
  const [pestana, setPestana] = useState('ejercicios');
  const [busca, setBusca] = useState('');

  const tandas = byMuscle(equipment);
  const carpeta = fieldText(activeClient?.profile, 'gymFolder');

  /* Lo que ha levantado, por nombre, para poder cruzarlo con el catálogo. */
  const historial = useMemo(() => {
    const mapa = new Map();
    strengthByExercise(microcycles).forEach((f) => mapa.set(normaliza(f.name), f));
    return mapa;
  }, [microcycles]);

  const encontrados = useMemo(() => {
    const q = normaliza(busca.trim());
    const lista = q
      ? library.filter((ex) => normaliza(ex.name).includes(q) || normaliza(ex.muscle).includes(q))
      : library;
    /* Sin búsqueda, primero lo que ya ha entrenado: es lo que se repite. */
    const conPeso = (ex) => (historial.has(normaliza(ex.name)) ? 0 : 1);
    return [...lista].sort((a, b) => conPeso(a) - conPeso(b) || a.name.localeCompare(b.name)).slice(0, MAX_LISTA);
  }, [library, busca, historial]);

  const pestanas = [
    { id: 'ejercicios', label: 'Ejercicios' },
    { id: 'piezas', label: 'Piezas' },
    { id: 'gimnasio', label: 'Gimnasio' },
  ];

  return (
    <aside className="biblioteca" aria-label="La biblioteca del cliente">
      <div className="biblioteca-tabs" role="tablist" aria-label="Qué mirar">
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestana === p.id}
            className={`biblioteca-tab${pestana === p.id ? ' is-on' : ''}`}
            onClick={() => setPestana(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {pestana === 'ejercicios' && (
        <>
          <div className="biblioteca-busca">
            <Search size={15} aria-hidden="true" />
            <input
              className="biblioteca-campo"
              type="search"
              value={busca}
              placeholder="Buscar un ejercicio"
              aria-label="Buscar un ejercicio en la biblioteca"
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          {encontrados.length === 0 ? (
            <p className="biblioteca-vacio">
              {busca.trim()
                ? `Nada con «${busca.trim()}». Escríbelo en la hoja y se guarda en tu biblioteca.`
                : 'Tu biblioteca está vacía. El primer ejercicio que escribas en una hoja se guarda aquí.'}
            </p>
          ) : (
            <ul className="biblioteca-lista">
              {encontrados.map((ex) => {
                const suyo = historial.get(normaliza(ex.name));
                return (
                  <li className="biblioteca-fila" key={`${ex.name}-${ex.muscle}`}>
                    <span className="biblioteca-say">
                      <span className="biblioteca-nombre">{ex.name}</span>
                      <span className="biblioteca-meta">
                        {[ex.muscle, ex.equipment].filter(Boolean).join(' · ')}
                      </span>
                      {/* Lo que ESTA persona levanta: el dato que decide. */}
                      {suyo && (
                        <span className={`biblioteca-suyo${suyo.dir === 'up' ? ' is-sube' : ''}`}>
                          {localeNumber(suyo.e1rm, 1)} kg{suyo.dir === 'up' ? ' ↑' : suyo.dir === 'down' ? ' ↓' : ''}
                        </span>
                      )}
                    </span>
                    {onAnadirEjercicio && (
                      <button
                        type="button"
                        className="btn btn-icon btn-icon-compact biblioteca-mas"
                        disabled={!hojaAbierta}
                        aria-label={hojaAbierta ? `Añadir ${ex.name} a ${hojaAbierta}` : `Añadir ${ex.name}`}
                        title={hojaAbierta ? `Añadir a «${hojaAbierta}»` : 'Abre una hoja para poder añadir'}
                        onClick={() => onAnadirEjercicio(ex)}
                      >
                        <Plus size={15} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {pestana === 'piezas' && (
        <>
          {piezas.length === 0 ? (
            <p className="biblioteca-vacio">
              Todavía no has guardado ninguna. Una pieza es un día tuyo —«Pierna completa»— listo
              para ponerlo en el bloque de cualquier cliente.
            </p>
          ) : (
            <ul className="biblioteca-lista">
              {piezas.map((pieza) => (
                <li className="biblioteca-fila" key={pieza.id}>
                  <span className="biblioteca-say">
                    <span className="biblioteca-nombre">{pieza.name}</span>
                    <span className="biblioteca-meta">{pieceSummary(pieza)}</span>
                  </span>
                  {onPonerPieza && (
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-compact biblioteca-mas"
                      aria-label={`Poner la pieza ${pieza.name} como hoja`}
                      title="Ponerla como una hoja más del bloque"
                      onClick={() => onPonerPieza(pieza)}
                    >
                      <Plus size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {pestana === 'gimnasio' && (
        <>
          {tandas.length === 0 ? (
            <p className="biblioteca-vacio">
              No hay fotos de su gimnasio.{' '}
              {carpeta ? 'Están en su carpeta.' : 'Se suben desde su ficha, en «Su gimnasio».'}
            </p>
          ) : (
            <div className="biblioteca-gimnasio">
              {tandas.map((tanda) => (
                <section key={tanda.group}>
                  <span className="biblioteca-grupo">
                    {tanda.group} <small>{tanda.items.length}</small>
                  </span>
                  <div className="biblioteca-fotos">
                    {tanda.items.map((it) => (
                      <Thumb key={it.id} url={it.url} alt={it.name || tanda.group} width={160} className="biblioteca-foto" />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          {carpeta && (
            <a className="link biblioteca-carpeta" href={carpeta} target="_blank" rel="noreferrer noopener">
              <ExternalLink size={13} aria-hidden="true" /> Abrir su carpeta
            </a>
          )}
        </>
      )}
    </aside>
  );
};
