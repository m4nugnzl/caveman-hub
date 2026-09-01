import { useEffect, useRef } from 'react';
import { Plus, Settings2 } from 'lucide-react';

import { blockSummary, blocksOf, weeksOfBlock } from '@/domain/blocks';
import { executedSessions } from '@/domain/sessions';
import { findMicrocycle } from '@/domain/training';
import { localeNumber, shortDate } from '@/lib/dates';

/**
 * LA LÍNEA DE TIEMPO: los bloques de esta persona, y dentro sus semanas.
 *
 * Cada tramo crece con sus semanas, así que un bloque de ocho pesa el doble
 * que uno de cuatro y la línea se lee como tiempo. El abierto lleva el borde;
 * los demás van en voz baja. Al final, en el bloque en curso, la semana de
 * más y el bloque de más: cada «+» al final de lo que alarga.
 *
 * ══ Por qué vive en su propio archivo ══════════════════════════════════════
 *
 * Nació dentro de `VistaBloque` —el plan del entrenador— y la usan los DOS
 * lados. El portal del cliente navegaba su programa con un carril plano de
 * «Semana 1 … Semana 14»: una enumeración que no dice nada de por qué la
 * semana 5 es distinta de la 9. Su entrenador ya no programa así —programa
 * por bloques, y les pone nombre: «Adaptación», «Acumulación»—, y esa es
 * justamente la parte que al cliente le explica en qué anda metido.
 *
 * Copiar la línea al portal habría dejado dos dibujos del mismo dato que se
 * separan al primer cambio. Es la misma línea; lo que cambia es quién puede
 * tocarla.
 *
 * ══ Lo que se puede hacer sale de los MANEJADORES que llegan ═══════════════
 *
 * No hay un `soloLectura`, y a propósito: cada cosa que se puede hacer aparece
 * si —y solo si— llega su manejador. Sin `onRenombrarBloque` el nombre del
 * bloque abierto es texto y no un campo; sin `onNuevaSemana` no hay «+»; sin
 * `onNuevoBloque` no hay tramo de más; sin `onAjustes` no hay engranaje. El
 * portal no pasa ninguno de esos cuatro y la línea queda de leer y navegar,
 * que es exactamente lo que el cliente puede hacer con su programa. Un
 * booleano de más habría que acordarse de cruzarlo con cada manejador.
 *
 * `bloque` es el SELECCIONADO, no el abierto: es el tramo cuyas semanas se
 * pueden pulsar. Para viajar a otro se pulsa su cabecera (`onIrBloque`), y
 * entonces pasa a ser el seleccionado y se abren sus semanas. Así se recorre
 * el historial entero sin que la línea tenga dos modos.
 */
export const LineaDeBloques = ({
  program,
  bloque,
  contexto,
  semanaEnCurso,
  unidad,
  unidades,
  etiqueta = 'Bloques del programa',
  onIrBloque,
  onIrSemana,
  onNuevaSemana,
  onNuevoBloque,
  onRenombrarBloque,
  onAjustes,
}) => {
  const bloques = blocksOf(program);
  const microcycles = program?.microcycles || [];

  /*
    Cuando la línea no cabe, se abre por el FINAL.
    En un teléfono con tres bloques, el carril arrancaba a la izquierda —o sea,
    en el bloque de junio— y el que está en curso quedaba cortado contra el
    borde derecho: justo el único que hacía falta ver al entrar. El tiempo
    sigue yendo de izquierda a derecha, que es lo que hace que la línea se lea;
    lo que cambia es por dónde está abierta.

    Solo al montar y solo si desborda: después manda el dedo, y arrastrar hacia
    atrás para mirar la historia no puede rebotar.
  */
  const carril = useRef(null);
  useEffect(() => {
    const el = carril.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  }, []);

  return (
    <nav className="linea" aria-label={etiqueta}>
      <ol className="linea-tramos" ref={carril}>
        {bloques.map((b, i) => {
          const esEste = b.id === bloque.id;
          const r = blockSummary(program, b);
          const semanas = weeksOfBlock(program, b);
          const cifras = [r.kg > 0 && `${localeNumber(r.kg)} kg`, r.adherencia !== null && `${r.adherencia} % de lo pautado`].filter(Boolean).join(' · ');
          const cuando = `${r.desde ? shortDate(r.desde) : 'sin fechas'}${r.abierto ? ' · abierto' : r.hasta ? ` – ${shortDate(r.hasta)}` : ''}`;

          return (
            <li key={b.id} className={`linea-tramo${esEste ? ' is-on' : ''}${r.abierto ? ' is-abierto' : ''}`} style={{ flexGrow: Math.max(2, semanas.length) }}>
              {esEste ? (
                /* El tramo abierto ES la cabecera del bloque: el nombre se
                   escribe aquí, y no se repite en ningún titular encima. */
                <div className="linea-cab is-este">
                  <span className="linea-n">B{i + 1}</span>
                  {onRenombrarBloque ? (
                    <input
                      key={b.id}
                      className="linea-nombre is-campo"
                      defaultValue={b.name}
                      size={Math.max(6, b.name.length + 1)}
                      aria-label="Nombre del bloque"
                      onBlur={(e) => {
                        const nombre = e.target.value.trim();
                        if (nombre && nombre !== b.name) onRenombrarBloque(b.id, nombre);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                  ) : (
                    <span className="linea-nombre">{b.name}</span>
                  )}
                  <span className="linea-cuando">{[cuando, contexto].filter(Boolean).join(' · ')}</span>
                </div>
              ) : (
                <button type="button" className="linea-cab" onClick={() => onIrBloque(b)} title={`Ir a ${b.name}${cifras ? ` · ${cifras}` : ''}`}>
                  <span className="linea-n">B{i + 1}</span>
                  <span className="linea-nombre">{b.name}</span>
                  <span className="linea-cuando">{cuando}</span>
                </button>
              )}

              <div className="linea-semanas" role="list" aria-label={`${unidades} de ${b.name}`}>
                {semanas.map((w) => {
                  const micro = findMicrocycle(microcycles, w) || {};
                  const hecha = executedSessions(micro).length > 0;
                  const estado = w === semanaEnCurso ? 'is-curso' : hecha ? 'is-hecha' : '';
                  const n = w - b.fromWeek + 1;
                  const titulo = `${unidad} ${n}${micro.date ? ` · ${shortDate(micro.date)}` : ''}${w === semanaEnCurso ? ' · en curso' : hecha ? ' · entrenada' : ' · por hacer'}`;
                  return esEste ? (
                    <button key={w} type="button" role="listitem" className={`linea-semana${estado ? ` ${estado}` : ''}`} onClick={() => onIrSemana(w)} title={`Abrir ${titulo}`}>
                      {n}
                    </button>
                  ) : (
                    <span key={w} role="listitem" className={`linea-semana${estado ? ` ${estado}` : ''}`} title={titulo}>
                      {n}
                    </span>
                  );
                })}
                {esEste && r.abierto && onNuevaSemana && (
                  <button type="button" className="linea-semana is-nueva" onClick={onNuevaSemana} aria-label={`Añadir ${unidad.toLowerCase()}`} title={`Añadir ${unidad.toLowerCase()} ${semanas.length + 1}`}>
                    <Plus size={11} />
                  </button>
                )}
              </div>
            </li>
          );
        })}

        {onNuevoBloque && (
          <li className="linea-tramo is-siguiente">
            <button type="button" className="linea-mas" onClick={onNuevoBloque} title="Cierra el bloque abierto y empieza el siguiente">
              <Plus size={14} aria-hidden="true" /> bloque
            </button>
          </li>
        )}
      </ol>
      {onAjustes && (
        <button type="button" className="btn btn-icon btn-icon-compact linea-ajustes" onClick={onAjustes} aria-label="Ajustes del programa" title="Ajustes: tipo de ciclo, patrón, fecha de inicio y protocolo">
          <Settings2 size={16} />
        </button>
      )}
    </nav>
  );
};
