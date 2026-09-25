import { useMemo, useState } from 'react';

import { blockPlan, sheetVolumeByGroup } from '@/domain/blocks';
import { dayPlannedVolume, unitLabel } from '@/domain/training';
import { BarrasDeVolumen } from '@/components/ui/BarrasDeVolumen';
import { VolumenPopup } from './VolumenPopup';

/**
 * EL VOLUMEN, DONDE SE PLANIFICA.
 *
 * ══ El hueco que tapa ═══════════════════════════════════════════════════════
 *
 * Las series por grupo se miraban solo en la vista de conjunto. Pero los
 * ejercicios se añaden y las series se suben con la HOJA abierta, así que la
 * cuenta estaba en todas partes menos donde se toca: para saber si el pecho se
 * te estaba yendo había que salir al bloque, mirar, y volver. «Estaría bien ir
 * sabiendo el volumen a la hora de planificar» — pues aquí.
 *
 * ══ Por qué la hoja puede hablar del bloque sin romper su ley ═══════════════
 *
 * La ley de esta pantalla es que con una hoja abierta el costado dice de lo que
 * trata la mesa y nada más: fue lo que se quitó el 9 de septiembre, cuando las
 * lecturas del bloque empujaban la columna a mil cuatrocientos píxeles y había
 * que bajar por ellas para llegar a lo del ejercicio que se estaba escribiendo.
 *
 * Esto no es aquello. El SUJETO es la hoja —son sus grupos y sus series, y solo
 * salen los grupos que ella trabaja—; el bloque entra únicamente como el fondo
 * contra el que esa cifra significa algo. «6» no dice nada. «6 de 18, y el MRV
 * está en 22» sí, y es literalmente la pregunta que uno se hace mientras añade
 * un ejercicio: esto que estoy poniendo, ¿hace falta o ya va servido en otro
 * día? Sin la segunda cifra la tarjeta sería un contador, no una lectura.
 *
 * ── Y no receta ────────────────────────────────────────────────────────────
 * Señala y calla. No dice «quita dos series de pecho»: dice cuántas hay y
 * dónde está el tramo útil. Qué hacer con eso es del entrenador.
 */
const cuenta = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

/* Cuatro grupos a la vista, como en la tarjeta del bloque. Los demás se cuentan
   en el pie, que es la puerta a la tabla entera. */
const GRUPOS_A_LA_VISTA = 4;

/**
 * @param hojas  Las del bloque, ya traducidas (`planSessionView`), para quien
 *   no tiene un bloque guardado del que sacarlas: el COMPOSITOR monta su plan
 *   en memoria y no hay `blockPlan` que recorrer. Sin ellas se leen del
 *   programa, que es el caso de Entreno.
 */
export const VolumenDeLaHoja = ({ program = null, bloque, hoja, cycleType, hojas = null }) => {
  const [abierto, setAbierto] = useState(false);
  const unidad = unitLabel(cycleType);

  /*
    La hoja se cuenta de lo que hay en la MESA y el bloque de su plan. Con una
    excepción puesta en este microciclo los dos no coinciden, y entonces la
    cifra de delante tiene que ser la del día que se está mirando: es el que se
    está tocando. Las dos lecturas van juntas en un memo porque `blockPlan`
    recorre el bloque entero y esto se pinta en cada tecleo de la tabla.
  */
  const sesiones = useMemo(
    () => hojas ?? blockPlan(program, bloque).sessions,
    [hojas, program, bloque]
  );
  const grupos = useMemo(
    () => sheetVolumeByGroup(dayPlannedVolume(hoja), sesiones),
    [hoja, sesiones]
  );

  const pasados = grupos.filter((g) => g.mrv && g.valor > g.mrv).length;
  const series = grupos.reduce((n, g) => n + g.parte, 0);

  return (
    <>
      <section
        className={`lado-tarjeta vol-hoja${grupos.length > 0 ? ' tarjeta-puerta' : ''}`}
        aria-label={`Volumen de ${hoja.dayName}`}
      >
        {grupos.length > 0 && (
          <button
            type="button"
            className="task-hit"
            onClick={() => setAbierto(true)}
            aria-label={`Ver el volumen de «${bloque.name}»`}
            title={`Ver el volumen de «${bloque.name}»`}
          />
        )}
        <div className="lado-cab">
          <span className="section-label">Volumen de {hoja.dayName}</span>
          <div className="lado-cab-fila">
            <span className="lado-titulo">{cuenta(series, 'serie', 'series')}</span>
            {pasados > 0 && (
              <span className="lado-aviso is-sobre" title="Grupos de esta hoja que en el bloque pasan de su MRV estimado">
                {pasados} sobre el MRV
              </span>
            )}
          </div>
        </div>

        {grupos.length === 0 ? (
          <p className="t-sm t-tertiary">Sin ejercicios todavía.</p>
        ) : (
          <>
            {/* La leyenda solo cuando hay dos cifras que distinguir. Con todos
                los grupos viviendo en esta hoja —que es lo normal en un bloque
                de tres días— las filas enseñan UNA cifra, y explicar una
                columna que no está es peor que no explicar nada. */}
            {grupos.some((g) => g.parte !== g.valor) && (
              <div className="subjetivo-parte-leyenda">
                esta hoja, de lo que el grupo lleva en todo el bloque
              </div>
            )}
            <BarrasDeVolumen grupos={grupos.slice(0, GRUPOS_A_LA_VISTA)} />
            <button type="button" className="lado-mas" onClick={() => setAbierto(true)}>
              {grupos.length > GRUPOS_A_LA_VISTA
                ? `y ${grupos.length - GRUPOS_A_LA_VISTA} más, hoja a hoja`
                : 'el bloque, hoja a hoja'}
            </button>
          </>
        )}
      </section>

      {/* La tabla entera es la misma que se abre desde el bloque: grupos por
          hojas, con los totales contra el tramo útil. Montada solo abierta. */}
      {abierto && (
        <VolumenPopup
          open
          onClose={() => setAbierto(false)}
          bloque={bloque}
          hojas={sesiones}
          unidad={unidad}
        />
      )}
    </>
  );
};
