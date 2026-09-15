import { Minus, Plus } from 'lucide-react';

import { HUECO_CIFRA, NumberInput } from '@/components/ui/primitives';

/**
 * UNA CIFRA QUE SE CUENTA: menos, la cifra, más.
 *
 * ══ Por qué no es un campo de texto ════════════════════════════════════════
 *
 * Lo era: un `.input` con un «—» de ejemplo dentro. Y es que las preguntas de
 * este tipo son siempre la misma clase de cosa —cuántos días, cuántas veces,
 * cuántas horas—, o sea números pequeños y enteros que alguien cuenta con los
 * dedos. Para eso, un campo de texto pide un teclado entero en el móvil, acepta
 * «tres» y «3,5» y deja al que contesta la mitad del trabajo.
 *
 * Con dos botones se contesta un «2» en dos toques y sin teclado. El campo sigue
 * ahí en medio —se puede teclear un 14 sin pulsar catorce veces— y es el mismo
 * `NumberInput` que usa el resto de la casa, así que lo que se guarda no cambia.
 *
 * ── El suelo es el cero y no hay techo ────────────────────────────────────
 * Cero es una respuesta («ninguna vez»), así que «−» se apaga ahí en vez de
 * escribir un −1 que no significa nada. Arriba no se pone tope: esto no es una
 * escala, y un tope inventado convierte «he salido 12 veces» en un dato falso.
 *
 * ── Y no se estrena el valor por pulsar ───────────────────────────────────
 * Con la casilla vacía, «+» escribe 1 y «−» no hace nada: sin contestar no hay
 * cifra que bajar. Si lo que hay escrito no es un número —una respuesta vieja de
 * cuando esto era texto libre—, los botones no lo tocan: lo que no se puede
 * contar, se corrige a mano.
 *
 * @param valor       Lo contestado, como cadena.
 * @param soloLectura Así se va a ver: el control entero, apagado. Lo usan los
 *   constructores para enseñar la pregunta como le llegará al cliente.
 */
export const Contador = ({ valor, onChange, etiqueta, soloLectura = false }) => {
  const n = Number(String(valor ?? '').replace(',', '.'));
  const hay = String(valor ?? '').trim() !== '' && Number.isFinite(n);
  /* Solo los enteros se mueven con los botones. Un 2,5 escrito a mano se
     respeta: subirlo a 3 sería corregir en silencio lo que alguien contestó. */
  const contable = hay && Number.isInteger(n);

  const mover = (paso) => onChange(String((contable ? n : 0) + paso));

  return (
    <span className="contador" role="group" aria-label={etiqueta}>
      <button
        type="button"
        className="btn btn-icon"
        onClick={() => mover(-1)}
        disabled={soloLectura || !contable || n <= 0}
        aria-label="Uno menos"
      >
        <Minus size={15} />
      </button>

      <NumberInput
        value={valor ?? ''}
        disabled={soloLectura}
        placeholder={HUECO_CIFRA}
        className="input-cifra"
        aria-label={etiqueta}
        onChange={onChange}
      />

      <button
        type="button"
        className="btn btn-icon"
        onClick={() => mover(1)}
        disabled={soloLectura || (hay && !contable)}
        aria-label="Uno más"
      >
        <Plus size={15} />
      </button>
    </span>
  );
};
