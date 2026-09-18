import { useState } from 'react';

import { BotonMas } from '@/components/ui/BotonMas';
import { RenombrarEnSitio } from '@/components/ui/primitives';
import { MenuAcciones } from '@/components/ui/MenuAcciones';

/**
 * LA BARRA DE LA DIETA: a qué casillas del ciclo le toca el día abierto, cómo
 * se le pauta y los verbos del plan.
 *
 * ══ Lo que el frame 64:107 dibuja aquí, y lo que NO ════════════════════════
 *
 * Esta barra tuvo un titular («La dieta»), una chapa de tipo pegada a él y una
 * segunda fila rotulada «Le toca» con las nueve casillas del ciclo, cada una
 * con el nombre del día escrito debajo. El frame la deja en un solo renglón:
 *
 *     D1 Legs A  D2 Push A  D4 Pull A  D5 Legs B  D7 Push Cueva ··· dieta cerrada  ⧉ ⧉ ⚙
 *
 * Tres decisiones, y ninguna es de adorno:
 *
 *   1. **No hay titular.** Encima de esta barra están las tarjetas de día
 *      (`TarjetasDeDia`), que ya llevan el nombre del que se mira y su cifra.
 *      «La dieta» sobre una pantalla que solo tiene dieta no decía nada, y el
 *      nombre del día abierto lo decía dos veces a veinte píxeles.
 *   2. **Solo están las casillas del día abierto.** La barra contesta «¿qué
 *      días come así?» enseñando esos días y ninguno más, en vez de las nueve
 *      del ciclo con seis encendidas. El nombre del día no hace falta dentro
 *      —son todas del mismo— y sigue en el `title` y en el `aria-label`; el
 *      menú de cada casilla sigue siendo donde se reparte.
 *   3. **Cómo se le pauta vuelve al canto derecho**, en voz de rótulo y no de
 *      chapa: es la ficha técnica del plan, no su titular.
 *
 * Con UN solo día no hay casillas que repartir —y tampoco tarjetas encima—, así
 * que entonces, y solo entonces, el titular es el nombre de ese día y se
 * renombra pulsándolo.
 *
 * @param {Array}  dias       Los días del plan (`planDays`).
 * @param {string} [activo]   El día que se está mirando: sus casillas se encienden.
 * @param {string} [tipo]     Cómo se le pauta, al canto derecho.
 * @param {node}   [derecha]  Los verbos del plan, después del hueco elástico.
 * @param {Array}  [casillas] `[{ key, corto, sesion, dia, items }]` — el reparto
 *                            del ciclo. Sin él (o con un solo día) no hay pastillas.
 */
export const TiraDeLaDieta = ({
  dias,
  activo = null,
  onMas = null,
  onRenombrar = null,
  masPalabra = 'día',
  tipo = null,
  derecha = null,
  casillas = null,
  avisoCiclo = null,
}) => {
  const [renombrando, setRenombrando] = useState(false);

  const unico = dias.length === 1 ? dias[0] : null;

  return (
    <nav className="tira dieta-tira" aria-label="Los días de esta dieta">
      <div className="tira-fila is-una">
        <div className="tira-camino">
          <div className="tira-lista">
            {/* El titular solo existe cuando no hay nada más que poner aquí: un
                día, ninguna casilla que repartir y ninguna tarjeta encima. */}
            {unico &&
              (renombrando && onRenombrar ? (
                <RenombrarEnSitio
                  value={unico.name}
                  label="Nuevo nombre del día"
                  onRename={(nombre) => onRenombrar(unico.id, nombre)}
                  onDone={() => setRenombrando(false)}
                />
              ) : (
                <h2
                  className={`tira-titulo${onRenombrar ? ' is-editable' : ''}`}
                  {...(onRenombrar
                    ? {
                        role: 'button',
                        tabIndex: 0,
                        title: `${unico.name} · púlsalo para renombrarlo`,
                        onClick: () => setRenombrando(true),
                        onKeyDown: (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setRenombrando(true);
                          }
                        },
                      }
                    : {})}
                >
                  {unico.name}
                </h2>
              ))}

            {/*
              ══ LAS CASILLAS DEL CICLO, EN UN RENGLÓN (frame 64:114) ════════

              SOLO LAS DEL DÍA ABIERTO. El frame dibuja seis pastillas junto a
              un día que cae «×6 días»: la barra contesta «¿qué días come así?»
              enseñando esos días y ninguno más.

              Estuvieron todas —las nueve, con las del día abierto en acento y
              las demás apagadas—, y el argumento era que repartir es moverlas
              entre días y una casilla que no se ve no se puede mover. Sigue
              siendo cierto y sigue pudiéndose hacer: cada casilla vive bajo el
              día que la tiene, así que para traerla aquí se abre el día del que
              es y se manda a este. Un clic más para repartir, a cambio de que
              la barra deje de repetir la palabra «High» seis veces y de que
              enseñe lo que de verdad hay debajo.

              Lo que NO se filtra es la casilla SIN ASIGNAR: no es de ningún
              día, así que si no sale aquí no sale en ninguna parte y nadie
              puede adoptarla. Va con su filete discontinuo, que es como se ve
              un hueco en esta casa.

              Y con el filtro puesto, el acento sobra: cuando todas las
              pastillas de la fila son del día abierto, pintarlas de azul no
              distingue a ninguna de ninguna. Ver `.dieta-casilla`.

              Siete con nombre de día si entrena por semanas; los días del
              microciclo —descansos incluidos— si su ciclo es rotativo. Esta
              pieza no distingue: pinta las que le den. Ver `cycleSlots`.
            */}
            {casillas
              ?.filter(({ dia }) => !dia || dia.id === activo)
              .map(({ key, corto, sesion, dia, items }) => (
                <MenuAcciones
                  key={key}
                  clase={`dieta-casilla${dia ? '' : ' is-vacia'}`}
                  label={
                    <>
                      {corto}
                      {sesion && <em>{sesion}</em>}
                    </>
                  }
                  ariaLabel={`${corto}${sesion ? ` (${sesion})` : ''}: ${dia ? dia.name : 'sin asignar'}`}
                  titulo={dia ? dia.name : 'Sin asignar'}
                  items={items}
                  alineado="izquierda"
                  sinFlecha
                />
              ))}
          </div>
        </div>

        <span className="tira-hueco" />

        {avisoCiclo}

        {/* «+ día», a secas: el día nuevo puede ser el alto en hidratos, el de
            piernas o el domingo, y el nombre lo pone quien lo añade —pulsando
            su tarjeta, que es donde se lee—. */}
        {onMas && <BotonMas palabra={masPalabra} onClick={onMas} title={`Añadir ${masPalabra}`} />}

        {/* La ficha técnica del plan, en voz de rótulo. */}
        {tipo && <span className="dieta-tira-tipo">{tipo}</span>}

        {/*
          ── TODOS LOS VERBOS, EN EL MISMO CANTO ──────────────────────────────
          Como en la cinta de Entreno: lo que copia, lo que ajusta y, al final,
          la papelera. «Creo que deberían ir todos a la derecha.»
        */}
        {derecha}
      </div>
    </nav>
  );
};
