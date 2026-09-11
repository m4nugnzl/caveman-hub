import { useState } from 'react';
import { CalendarDays, FlaskConical, Layers } from 'lucide-react';

import { Modal } from '@/components/ui/Modal';
import { OptionCard } from '@/components/ui/primitives';
import { ALCANCES, ALCANCE_POR_DEFECTO, ALCANCE_TITULO, SEMANAS } from './alcances';

/**
 * HASTA CUÁNDO VALE LO QUE SE PEGA.
 *
 * ══ Por qué el pegado pregunta ══════════════════════════════════════════════
 *
 * *«Pegar estructuras en otras semanas»* no es un tipo nuevo del portapapeles ni
 * un destino nuevo: es una pregunta que el pegado no estaba haciendo. Añadir un
 * ejercicio a mano ya la hace —el «Hasta cuándo» del alta— y pegarlo es el OTRO
 * CAMINO AL MISMO SITIO: los dos acaban en `addPlanExercise`, así que los dos
 * tienen que poder decir si eso entra en el plan del bloque, si es una prueba de
 * unas semanas o si es cosa de este microciclo y nada más.
 *
 * Es además lo que un modelo de semanas duplicadas no puede ofrecer: allí cada
 * semana es un texto aparte y la única respuesta posible es duplicar. Aquí el
 * tramo existe desde que el plan vive en el bloque (ver `domain/blocks`).
 *
 * ══ Y por qué NO siempre ════════════════════════════════════════════════════
 *
 * Porque una pregunta cuyas tres respuestas hacen lo mismo no es una pregunta,
 * es un peaje. Con un solo microciclo en el bloque no hay ninguna otra semana a
 * la que el ejercicio pueda llegar o dejar de llegar, así que las tres se ven
 * igual y quien pega lo único que nota es un clic de más. Eso lo decide quien
 * llama (`WorkoutLogEditor`), que es quien sabe cuántas semanas tiene el bloque;
 * cuando no pregunta, vale la de siempre —el plan del bloque—, que además es la
 * que sigue valiendo cuando mañana se añada el segundo microciclo.
 *
 * ── El aire de la ventana ──────────────────────────────────────────────────
 * Tres tarjetas de `.opt-group`, la misma pieza que usa cualquier elección con
 * consecuencias de la casa (ver `ComoSePauta`): cada respuesta tiene que decir
 * qué le pasa al programa, y eso no cabe en un desplegable cuando la ventana ya
 * está abierta. En el alta sí es un `select` porque allí es una línea más de un
 * formulario que se está rellenando, no la única decisión de la pantalla.
 *
 * ══ La misma pregunta para las dos cosas que caen en una hoja ═══════════════
 *
 * Un ejercicio se AÑADE a la hoja; una hoja se pone ENCIMA de otra y le cambia
 * lo que lleva dentro. Son dos escrituras distintas y una sola pregunta —hasta
 * cuándo vale—, así que la ventana es la misma y lo que cambia es cómo se
 * llama lo que va a pasar. Dos ventanas con tres tarjetas iguales y distinto
 * título serían dos dibujos para una decisión.
 *
 * @param pieza   Lo que se pega, del portapapeles.
 * @param donde   La hoja que lo recibe: «Lower A».
 * @param titulo  Si llega, manda sobre el «Pegar «X» en Y» de siempre.
 * @param intro   La línea de debajo del título.
 * @param verbo   Lo que dice el botón que confirma.
 * @param onPegar Recibe el alcance ya traducido a `{ semanas }`, como el alta.
 */
const ICONOS = { bloque: Layers, unas: FlaskConical, una: CalendarDays };

export const TramoDelPegado = ({
  pieza,
  donde,
  titulo = null,
  intro = 'Hasta cuándo vale aquí lo que estás pegando.',
  verbo = 'Pegar',
  onPegar,
  onClose,
}) => {
  const [solo, setSolo] = useState(ALCANCE_POR_DEFECTO);
  const nombre = pieza?.carga?.name || pieza?.titulo || 'el ejercicio';

  return (
    <Modal
      title={titulo || `Pegar «${nombre}» en ${donde}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onPegar({ semanas: SEMANAS[solo] })}>
            {verbo}
          </button>
        </>
      }
    >
      <div className="col gap-3">
        <p className="t-sm t-secondary">{intro}</p>
        {/* Una de las tres, siempre: desmarcar la puesta dejaría la ventana sin
            respuesta y el botón sin significado. Por eso el grupo es de radio y
            no de casillas —`unaSola`—, que además trae las flechas del teclado. */}
        <div className="opt-group" role="radiogroup" aria-label="Hasta cuándo">
          {Object.keys(ALCANCES).map((clave) => {
            const Icono = ICONOS[clave];
            return (
              <OptionCard
                key={clave}
                unaSola
                name="tramo-del-pegado"
                icon={Icono}
                label={ALCANCE_TITULO[clave]}
                hint={ALCANCES[clave]}
                checked={solo === clave}
                onChange={() => setSolo(clave)}
              />
            );
          })}
        </div>
      </div>
    </Modal>
  );
};
