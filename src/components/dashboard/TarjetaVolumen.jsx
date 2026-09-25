import { Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { blockPlan, blockPlannedVolume, currentBlock } from '@/domain/blocks';
import { MRV_GOALS, unitLabel } from '@/domain/training';
import { lazyRoute } from '@/lib/lazyRoute';
import { BarrasDeVolumen } from '@/components/ui/BarrasDeVolumen';
import { MapaMuscular } from '@/components/ui/MapaMuscular';
import { Tarjeta, TarjetaVacia } from './Tarjeta';

/* La ventana del volumen es la de Entreno, la misma pieza: diferida como las
   otras ventanas del Resumen, que se abren un día y se consultan muchos. */
const VolumenPopup = lazyRoute(() =>
  import('@/components/Coach/Workout/VolumenPopup').then((m) => ({ default: m.VolumenPopup }))
);

/*
  ══ SEIS GRUPOS, Y EL RESTO EN SU VENTANA (tercera vuelta, 18 sep) ═════════
  Con los diez o doce grupos de una rutina normal la lista medía el doble que
  el monigote, el monigote se quedaba pequeño a su lado y la tarjeta estiraba
  a su pareja —la del tonelaje— hasta dejarle un palmo vacío: «el monigote se
  ve pequeño porque pusiste todos los grupos».

  La tarjeta enseña los SEIS que más series llevan —los que deciden el bloque—
  y el monigote, que sigue pintando TODOS: es el que dice de un vistazo dónde
  está el resto. La tabla entera, con cada hoja y su MEV, está a un clic en
  «Ver a fondo», que es la misma ventana del volumen que abre Entreno.
*/
const MAX_GRUPOS = 6;

/**
 * EL VOLUMEN — cuántas series le has puesto a cada grupo, y sobre qué tope.
 *
 * ══ La forma nueva (frame 50:248) ══════════════════════════════════════════
 *
 * Las filas eran una rejilla de tres columnas —nombre a la derecha, barra en
 * medio, cifra al canto—, heredada de «Cómo lo lleva» porque es el mismo tipo de
 * dato: un valor sobre su tope. El frame las dibuja en DOS renglones:
 *
 *     Pecho (Push)                                          18 series
 *     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
 *
 * Y con la tarjeta a media fila es lo correcto: en tres columnas, «cuadriceps»
 * y «11/18» se llevaban la mitad del ancho y la barra —que es lo que se lee de
 * un vistazo— se quedaba en un canto de 120 px. A lo ancho, la barra vuelve a
 * ser comparable entre grupos, que es su único trabajo.
 *
 * ── El monigote se queda ───────────────────────────────────────────────────
 * El frame no lo dibuja. Pero el mapa muscular es una pieza que el dueño ya
 * recuperó una vez cuando se quitó, y hace algo que las barras no: decir DÓNDE
 * está el volumen sin leer diez nombres. Va AL LADO de la lista y no encima
 * (ver `.grupos-par`): encima, la tarjeta medía el doble que su pareja.
 *
 * ── Y el color sigue siendo el del dato ────────────────────────────────────
 * El frame pinta cada barra de un color distinto (azul, violeta, verde) y eso
 * aquí no significa nada: el color es del DATO —las series son verdes en todo el
 * producto—. Cuatro colores por fila serían cuatro señales que no señalan. Y
 * desde el 21 sep ni siquiera pasarse del MRV le cambia el color a la barra:
 * se dice en la cifra, en violeta (no en rojo: puede ser a propósito).
 */
export const TarjetaVolumen = ({ program, cycleType, isClient = false, aRutina = null }) => {
  const unit = unitLabel(cycleType);
  const bloque = useMemo(() => currentBlock(program), [program]);
  const pautado = useMemo(() => blockPlannedVolume(program, bloque || {}), [program, bloque]);
  const [abierta, setAbierta] = useState(false);
  const hojas = useMemo(() => (abierta ? blockPlan(program, bloque || {}).sessions || [] : []), [abierta, program, bloque]);

  const musculos = useMemo(
    () =>
      Object.entries(pautado.porMusculo)
        .map(([name, v]) => ({ name, media: v.media ?? 0, mrv: MRV_GOALS[name]?.mrv ?? null }))
        .filter((m) => m.media > 0)
        .sort((a, b) => b.media - a.media),
    [pautado]
  );
  const vistos = musculos.slice(0, MAX_GRUPOS);
  const resto = musculos.length - vistos.length;

  return (
    <Tarjeta
      rotulo="Volumen por grupo"
      sub={`Series pautadas por ${unit.toLowerCase()} sobre el MRV estimado`}
      span={6}
      className="grupos"
      vacia={musculos.length === 0}
    >
      {musculos.length === 0 ? (
        <TarjetaVacia
          accion={
            !isClient &&
            aRutina && (
              <Link className="cab-accion is-puerta" to={aRutina}>
                Monta su rutina
              </Link>
            )
          }
        >
          {isClient
            ? 'Cuando tengas rutina montada, aquí verás dónde está tu volumen.'
            : 'Sin ejercicios escritos en este bloque.'}
        </TarjetaVacia>
      ) : (
        <div className="grupos-par">
          <MapaMuscular musculos={musculos} />
          {/* Las mismas barras que el costado de Entreno: es el mismo dato
              —series por grupo contra su MRV— y tenía su tercera forma de
              dibujarse. El violeta en la cifra al pasarse del MRV, ver
              `BarrasDeVolumen`. */}
          <BarrasDeVolumen grupos={vistos.map((m) => ({ name: m.name, valor: m.media, mrv: m.mrv }))} />
        </div>
      )}

      {musculos.length > 0 && (
        <div className="ton-pie">
          <span className="tarjeta-pie">
            {resto > 0
              ? `Y ${resto} ${resto === 1 ? 'grupo más' : 'grupos más'}, con menos series`
              : `${musculos.length} grupos en ${bloque?.name || 'este bloque'}`}
          </span>
          <span className="ton-pie-mandos">
            <button type="button" className="cab-accion is-puerta" aria-haspopup="dialog" onClick={() => setAbierta(true)}>
              Ver a fondo
            </button>
          </span>
        </div>
      )}

      {abierta && (
        <Suspense fallback={null}>
          <VolumenPopup open onClose={() => setAbierta(false)} bloque={bloque} hojas={hojas} unidad={unit} />
        </Suspense>
      )}
    </Tarjeta>
  );
};
