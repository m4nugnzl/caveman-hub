import { useState } from 'react';
import { RotateCw } from 'lucide-react';

import { WEEK_DAYS, isRestDay } from '@/domain/training';
import { MenuAcciones } from '@/components/ui/MenuAcciones';

/**
 * QUÉ TOCA CADA DÍA DEL MICROCICLO, con una sola gramática.
 *
 * ══ Una pieza, no dos ══════════════════════════════════════════════════════
 *
 * Esto fueron dos: `WeeklySplitEditor` para la semana natural —pastillas con un
 * `<select>` dentro— y una `<ol class="ciclo-tira">` escrita dentro de la vista
 * del bloque para el ciclo rotativo. La misma fila, en el mismo sitio de la
 * misma pantalla, dibujada por dos códigos distintos: cada arreglo había que
 * hacerlo dos veces y aun así se separaban, que es justo lo que pasó —el
 * rotativo acabó leyéndose como otro producto—.
 *
 * Ahora hay UNA fila de casillas y lo que cambia es de dónde salen y qué hacen:
 *
 *   · semana natural — una casilla por día de la semana, y elegir cambia QUÉ
 *     HOJA cae ese día (`onSplit`);
 *   · ciclo rotativo — una casilla por día del patrón, y elegir cambia EL ORDEN
 *     de las hojas, que es lo que decide dónde cae cada una (`onMoverHoja`): el
 *     mismo gesto que arrastrarla en la rejilla de abajo, dicho con palabras.
 *     Los descansos los pone el patrón —se cambia en Ajustes—, así que ahí no
 *     hay nada que elegir y la casilla es solo su número.
 *
 * ══ El día libre no se escribe: se deja en blanco ══════════════════════════
 * Un microciclo normal tiene tres días libres, y con un control por día la fila
 * decía «Descanso» tres veces con el mismo peso que las hojas de verdad. Ahora
 * el día libre es SOLO su rótulo —«MAR», «D3»—, estrecho, y en la semana
 * natural se abre pulsándolo, que es cuando de verdad hay algo que elegir. En
 * una fila donde los demás llevan nombre, el que no lo lleva ya está diciendo lo
 * que es; y al no reclamar su séptimo del ancho, la fila enseña la FORMA del
 * microciclo en vez de siete casillas iguales.
 *
 * ══ Y el desplegable es el de la casa ══════════════════════════════════════
 * Era un `<select>` nativo: al abrirlo salía la lista del sistema operativo
 * —otra tipografía, otro azul, otro radio, los ítems que sobran en gris— en
 * medio de una pantalla que no se parece en nada a eso. Es el `MenuAcciones` de
 * siempre, con la hoja puesta marcada, igual que cualquier otro menú del
 * producto.
 *
 * ══ Sin la carga: eso lo dice la matriz ════════════════════════════════════
 * Debajo de cada día iba su top-3 de grupos, y al pie la suma del microciclo
 * entero. Era el mismo dato que la matriz de volumen del bloque, dicho peor.
 * Aquí se contesta CUÁNDO; cuánto, en la matriz.
 */
const DESCANSO = 'Descanso';

/**
 * Una casilla del microciclo. Tres formas, de más a menos:
 *
 *   · con hoja y con opciones — la pastilla «LUN  Push A ⌄»;
 *   · sin hoja pero con opciones — el hueco del día libre, que se pulsa y abre
 *     la misma lista;
 *   · sin opciones — el número a secas: el descanso que dicta el patrón, o
 *     cualquier casilla en un bloque cerrado.
 */
const Casilla = ({ rotulo, titulo, hoja, marcado, opciones, onElegir }) => {
  /* Qué ítem sale marcado: la hoja del día, y en el día libre el «Descanso»,
     que es lo que ese día tiene puesto aunque la casilla no lo escriba. */
  const puesto = marcado ?? hoja;
  const items = (opciones || []).map((o) => ({ label: o, on: o === puesto, run: () => onElegir(o) }));

  if (!hoja) {
    return (
      <li className="micro-dia is-libre">
        {items.length > 0 ? (
          <MenuAcciones
            clase="micro-libre"
            alineado="izquierda"
            sinFlecha
            ariaLabel={`${titulo}: descanso. Ponerle una hoja`}
            label={rotulo}
            items={items}
          />
        ) : (
          <span className="micro-libre" title={`${titulo}: descanso`}>
            {rotulo}
            <span className="sr-only">descanso</span>
          </span>
        )}
      </li>
    );
  }

  return (
    <li className="micro-dia">
      <span className="micro-dia-n" aria-hidden="true">
        {rotulo}
      </span>
      {items.length > 0 ? (
        <MenuAcciones
          clase="micro-dia-hoja"
          alineado="izquierda"
          ariaLabel={`${titulo}: ${hoja}. Cambiar de hoja`}
          label={hoja}
          items={items}
        />
      ) : (
        <span className="micro-dia-hoja is-fijo" title={`${titulo}: ${hoja}`}>
          {hoja}
        </span>
      )}
    </li>
  );
};

/**
 * @param rotativo    Ciclo rotativo (`cycleType === 'rotating'`).
 * @param split       El reparto por días de la semana natural.
 * @param slots       En rotativo, la cadena del patrón (`rotatingSlots`).
 * @param hojas       Los nombres de las hojas del bloque, para ofrecerlos.
 * @param disabled    Bloque cerrado: se lee, no se toca.
 */
export const EstructuraDelMicrociclo = ({
  rotativo = false,
  split,
  slots = [],
  hojas = [],
  disabled = false,
  onSplit,
  onMoverHoja,
}) => {
  /*
    ── Y cuando no hay reparto, no se pintan siete casillas vacías ───────────
    Un bloque recién montado no tiene ningún día asignado, así que esta fila
    salía como SIETE desplegables idénticos que decían «Descanso»: noventa
    píxeles a lo ancho de la pantalla más importante del producto para no contar
    nada. Y peor, leído rápido dice lo contrario de lo que pasa —parece que le
    has programado siete días de descanso a propósito—. Así que el vacío o
    invita o desaparece: una frase que dice lo que hay y el botón que lo
    arregla. Las siete casillas siguen a un clic, y en cuanto UN día tiene hoja
    vuelven solas.
  */
  const [abierto, setAbierto] = useState(false);

  if (rotativo) {
    /* Cada casilla de entreno es la n-ésima hoja del bloque, porque así las
       reparte el patrón: elegir otra es MOVERLA a ese sitio. */
    let destino = -1;
    return (
      <ol className="micro-tira" aria-label="El microciclo, día a día">
        {slots.map((slot, i) => {
          if (slot.rest) {
            return <Casilla key={slot.key} rotulo={`D${i + 1}`} titulo={`Día ${i + 1}`} />;
          }
          destino += 1;
          const sitio = destino;
          return (
            <Casilla
              key={slot.key}
              rotulo={`D${i + 1}`}
              titulo={`Día ${i + 1}`}
              hoja={slot.name}
              opciones={disabled ? null : hojas}
              onElegir={(nombre) => {
                const origen = hojas.indexOf(nombre);
                if (origen >= 0 && origen !== sitio) onMoverHoja(origen, sitio);
              }}
            />
          );
        })}
        <li className="micro-dia is-vuelta" aria-label="y vuelta a empezar" title="Y vuelta a empezar">
          <RotateCw size={12} aria-hidden="true" />
        </li>
      </ol>
    );
  }

  const sinRepartir = WEEK_DAYS.every((d) => isRestDay(split?.[d] ?? DESCANSO));
  if (sinRepartir && !abierto) {
    return (
      <p className="micro-vacia">
        <span>
          {hojas.length === 0
            ? 'Todavía no hay hojas que repartir.'
            : 'Ninguna hoja tiene día asignado: el cliente las ve todas juntas.'}
        </span>
        {!disabled && hojas.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAbierto(true)}>
            Repartirlas por días
          </button>
        )}
      </p>
    );
  }

  return (
    <ol className="micro-tira" aria-label="El microciclo, día a día">
      {WEEK_DAYS.map((day) => {
        const value = split?.[day] ?? DESCANSO;
        const descanso = isRestDay(value);
        const opciones = [DESCANSO, ...hojas];
        /* Un valor que ya no corresponde a ninguna hoja (se renombró, se quitó)
           se sigue ofreciendo: si no, el menú lo daría por perdido y la casilla
           quedaría marcando una hoja que no es la suya. */
        if (!descanso && !opciones.includes(value)) opciones.push(value);

        return (
          <Casilla
            key={day}
            rotulo={day.slice(0, 3)}
            titulo={day}
            hoja={descanso ? null : value}
            marcado={descanso ? DESCANSO : value}
            opciones={disabled ? null : opciones}
            onElegir={(nombre) => onSplit(day, nombre)}
          />
        );
      })}
    </ol>
  );
};
