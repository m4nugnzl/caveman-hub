import { useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { useCapaFlotante } from '@/lib/useCapaFlotante';
import { useClickOutside } from '@/lib/useClickOutside';
import { useDismissable } from '@/lib/useDismissable';
import { SegmentedControl, Switch } from '@/components/ui/primitives';
import { WEEK_DAYS } from '@/domain/training';
import { clampInt } from '@/lib/num';
import { enumeraEs } from '@/lib/texto';

/**
 * LOS AJUSTES DEL PLAN, con controles de verdad.
 *
 * ══ Qué había antes ═════════════════════════════════════════════════════════
 *
 * Los cuatro ajustes eran cuatro líneas de texto en el «···», marcadas con una
 * casilla. Tres cosas fallaban:
 *
 *   1. Las dos primeras —«menú cerrado» y «plan por macros»— son UNA elección
 *      con dos caras, no dos interruptores. Puestas como dos casillas marcables,
 *      parecía que se podían tener las dos o ninguna.
 *   2. Lo marcado se pinta en el color de acento, así que lo que estaba PUESTO
 *      salía en rojo y lo que no, en blanco: se leía al revés, y tres líneas
 *      rojas seguidas parecen un aviso.
 *   3. Ninguna decía qué hace. «Plan por macros, sin menú» es media explicación
 *      y «Dos dietas: entreno y descanso», un titular.
 *
 * ══ Lo que hay ahora ════════════════════════════════════════════════════════
 *
 * El mismo sitio —estos ajustes se tocan una vez al mes y no merecen una fila
 * permanente en la pantalla— pero un PANEL en vez de una lista: la elección del
 * tipo de plan es un carril de dos opciones con su explicación debajo, que
 * cambia según cuál esté puesta, y lo que sí son interruptores son
 * interruptores, con su letra pequeña diciendo qué encienden.
 *
 * El botón deja de ser el «···» de más acciones y pasa a ser el de ajustes: lo
 * que hay aquí dentro no son cosas que se hacen, son cosas que se configuran.
 */
export const AjustesPlan = ({
  cerrado,
  onTipo,
  equivalencias,
  onEquivalencias,
  /* La procedencia del interruptor de equivalencias: de qué protocolo sale y la
     puerta a leerlo entero (`PieDeProtocolo`). Llega como NODO y no se monta
     aquí: quien sabe de protocolos es la pantalla del cliente, y este panel es
     de la dieta y no tiene por qué aprenderlo.

     La hoja que abre es un diálogo, que va por encima de este flotante (z 200
     contra 60) y lo tapa entero. Así que el panel se queda abierto detrás y al
     cerrar la hoja se vuelve justo donde se estaba, con el foco en su sitio. */
  pie,
  reparte,
  onReparto,
  avanzado,
  onAvanzado,
  /* Cuándo entrena quien solo tiene la dieta: `{ tipo, patron, dias, inicio }`,
     o nada si entrena con nosotros —ahí lo dice su bloque—. Ver
     `entrenaPorSuCuenta` en `domain/blocks`. */
  ciclo = null,
  onTipoDeCiclo,
  onPatron,
  onCiclo,
  /* Abierto desde fuera: el aviso de la cinta («Marcar sus días de entreno»)
     trae aquí. Sin estas dos, el panel lleva su propio estado. */
  abierto: abiertoFuera,
  onAbierto,
}) => {
  const [abiertoPropio, setAbiertoPropio] = useState(false);
  const controlado = abiertoFuera !== undefined;
  const abierto = controlado ? abiertoFuera : abiertoPropio;
  const setAbierto = (valor) => {
    const siguiente = typeof valor === 'function' ? valor(abierto) : valor;
    if (controlado) onAbierto?.(siguiente);
    else setAbiertoPropio(siguiente);
  };
  const ref = useRef(null);
  useClickOutside(ref, () => setAbierto(false), abierto);
  const pop = useDismissable(abierto);
  const capa = useCapaFlotante(pop.mounted, ref, pop.ref, { alineado: 'derecha' });

  return (
    <div ref={ref} className="menu-acciones">
      <button
        type="button"
        className="btn btn-icon"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label="Ajustes del plan"
        title="Ajustes del plan"
        onClick={() => setAbierto((v) => !v)}
      >
        <SlidersHorizontal size={15} />
      </button>

      {pop.mounted && (
        <div
          ref={pop.ref}
          className="popover popover-right ajustes-plan"
          style={capa.estilo}
          {...capa.atributos}
          data-state={pop.closing ? 'closing' : 'open'}
        >
          <div className="ajustes-plan-grupo">
            <span className="ajustes-plan-k">Cómo se le pauta</span>
            <SegmentedControl
              ancho
              label="Tipo de plan"
              value={cerrado ? 'closed' : 'macros'}
              onChange={onTipo}
              options={[
                { id: 'closed', label: 'Menú cerrado' },
                { id: 'macros', label: 'Por macros' },
              ]}
            />
            <p className="ajustes-plan-pie">
              {cerrado
                ? 'Le montas las comidas una a una, con sus alimentos y sus alternativas.'
                : 'Le pones cifras, no alimentos: qué come con ellas lo decide él.'}
            </p>
          </div>

          {/*
            ══ Y CUÁNTO SE LE CIERRA, QUE ES LA MISMA PREGUNTA UN PELDAÑO MÁS ══

            «No tiene sentido que te muestre permanentemente esa decisión: eso
            tendría que estar en ajustes de la dieta.»

            Vivía en la MESA, y como dos tarjetas grandes con icono, título y
            explicación —`ComoSePauta`— clavadas encima del trabajo. Se elige una
            vez cada varios meses y se quedaba ahí ocupando el sitio noble de la
            pantalla, con la decisión ya tomada dibujada como una pregunta
            abierta: en un plan «solo el objetivo» esas dos tarjetas eran lo
            primero y lo más grande de la hoja, y debajo cabían cuatro cifras.

            Aquí es lo que es: el segundo peldaño de «cómo se le pauta». Menú
            cerrado → le pautas los alimentos; por macros con reparto → le pautas
            las cifras de cada comida; por macros a secas → le pautas el día. Un
            solo grupo, de más cerrado a más abierto, con su explicación debajo.
          */}
          {!cerrado && (
            <div className="ajustes-plan-grupo">
              <span className="ajustes-plan-k">Qué le pides</span>
              <SegmentedControl
                ancho
                label="Qué se le pauta por macros"
                value={reparte ? 'comidas' : 'dia'}
                onChange={(id) => onReparto(id === 'comidas')}
                options={[
                  { id: 'dia', label: 'El día' },
                  { id: 'comidas', label: 'Cada comida' },
                ]}
              />
              <p className="ajustes-plan-pie">
                {reparte
                  ? 'Le dices cuántas kcal y qué macros lleva cada comida del día.'
                  : 'Un solo objetivo al día: se organiza las comidas como quiera.'}
              </p>
            </div>
          )}

          {/*
            ══ CUÁNDO ENTRENA, para quien solo tiene la dieta ══════════════
            Sin entreno con nosotros no hay bloque que diga qué días entrena, y
            sin eso los días de dieta no se pueden repartir por el entreno. Lo
            decide su entrenador aquí, no el cliente en su app.
          */}
          {ciclo && (
            <>
              <hr className="menu-sep" />
              <div className="ajustes-plan-grupo">
                <span className="ajustes-plan-k">Cuándo entrena</span>
                <SegmentedControl
                  ancho
                  label="Cómo es su ciclo"
                  value={ciclo.tipo}
                  onChange={onTipoDeCiclo}
                  options={[
                    { id: 'weekly', label: 'Semanal' },
                    { id: 'rotating', label: 'Rotativo' },
                  ]}
                />

                {ciclo.tipo === 'rotating' ? (
                  <div className="ajustes-plan-patron">
                    <label>
                      <span>Entrena</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="input input-center"
                        value={ciclo.patron.train}
                        onChange={(e) => onPatron({ train: clampInt(e.target.value, 1, 14, 1) })}
                      />
                    </label>
                    <label>
                      <span>Descansa</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="input input-center"
                        value={ciclo.patron.rest}
                        onChange={(e) => onPatron({ rest: clampInt(e.target.value, 0, 14, 0) })}
                      />
                    </label>
                    <label>
                      <span>Día 1</span>
                      <input
                        type="date"
                        className="input"
                        value={ciclo.inicio || ''}
                        onChange={(e) => onCiclo({ inicio: e.target.value || null })}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="ajustes-plan-dias" role="group" aria-label="Días que entrena">
                    {WEEK_DAYS.map((dia) => {
                      const puesto = ciclo.dias.includes(dia);
                      return (
                        <button
                          key={dia}
                          type="button"
                          className="chip"
                          aria-pressed={puesto}
                          aria-label={dia}
                          title={dia}
                          onClick={() =>
                            onCiclo({
                              dias: puesto ? ciclo.dias.filter((d) => d !== dia) : [...ciclo.dias, dia],
                            })
                          }
                        >
                          {dia.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                )}

                <p className="ajustes-plan-pie">
                  {ciclo.tipo === 'rotating'
                    ? `${ciclo.patron.train} de entreno y ${ciclo.patron.rest} de descanso, en bucle desde el día 1.`
                    : ciclo.dias.length > 0
                      ? `Entrena ${enumeraEs(ciclo.dias.map((d) => d.toLowerCase()))}.`
                      : 'Marca los días que entrena para repartir su dieta por el entreno.'}
                </p>
              </div>
            </>
          )}

          {/*
            ── AQUÍ ESTUVO «DOS DIETAS» ──────────────────────────────────────
            Un interruptor que encendía y apagaba la segunda dieta, y era el
            único sitio desde el que se podía. O sea: los días del plan se veían
            en la cinta y se administraban tres dedos más allá, dentro de un
            panel de ajustes — y desde la cinta no había forma de quitar el día
            que acababas de añadir.

            Ahora los días viven enteros en la cinta: se añaden con su «+», se
            renombran pulsándolos y se duplican o se quitan desde su «···». Un
            ajuste que solo sabía contar hasta dos no tenía dónde volver.
          */}
          {/* Solo con menú cerrado: sin alimentos pautados no hay nada por lo
              que cambiar nada. */}
          {cerrado && (
            <>
              <hr className="menu-sep" />
              <div className="ajustes-plan-grupo">
                {/*
                  ══ EL DESDOBLE: el plan arriba, SU APP abajo ═══════════════

                  Los dos interruptores de abajo colgaban de nada: venían detrás
                  de un filete, sin rótulo, y por tanto se leían como el tercer y
                  cuarto peldaño de «cómo se le pauta». No lo son, y ni siquiera
                  son la misma clase de cosa entre ellos: uno cambia lo que ve el
                  CLIENTE en su app —es su protocolo— y el otro cambia lo que ves
                  TÚ, en todos tus clientes.

                  Con su rótulo, el panel dice las tres cosas que decide: qué le
                  pautas, cómo es su app y qué miras tú. Es el mismo corte que
                  parte en dos la hoja de su protocolo.
                */}
                <span className="ajustes-plan-k">Cómo es su app</span>
                <Switch
                  label="El cliente ve las equivalencias"
                  hint="En su app puede cambiar un alimento por otro del mismo grupo."
                  checked={equivalencias}
                  onChange={onEquivalencias}
                />
                {pie}
              </div>
            </>
          )}

          {/*
            ── LAS CUATRO DEL ENVASE, para quien las mire ────────────────────
            Fibra, azúcares, saturadas y sal se suman siempre —la fibra se lee
            al pie del costado— pero enseñarlas las cuatro, con su objetivo y su
            veredicto, es el modo de quien pauta fibra o vigila la sal. Para el
            resto son cuatro renglones más en una columna de 300 px.

            Es del ENTRENADOR y no de este cliente: quien mira una dieta así las
            mira en todas. Por eso vive en sus preferencias y no en el protocolo
            —el protocolo dice qué ve el CLIENTE en su app, y esto no se lo
            enseña a nadie más que a ti—.

            Apagado no se juzga nada: un objetivo de fibra escrito sigue
            guardado, pero una cifra que juzga y no se ve es una trampa.
          */}
          <hr className="menu-sep" />
          <div className="ajustes-plan-grupo">
            <span className="ajustes-plan-k">Lo que ves tú</span>
            <Switch
              label="Fibra, azúcares, saturadas y sal"
              hint="Las ves sumadas en el costado y puedes ponerles objetivo. En todos tus clientes."
              checked={avanzado}
              onChange={onAvanzado}
            />
          </div>
        </div>
      )}
    </div>
  );
};
