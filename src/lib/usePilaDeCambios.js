import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * DESHACER SOBRE UN ESTADO QUE TODAVÍA NO ESTÁ ESCRITO EN NINGUNA PARTE.
 *
 * ══ Por qué no vale el deshacer del plan ═══════════════════════════════════
 *
 * El ⌘Z de Entreno vive en `useWorkout` y su ley en `domain/deshacer`: guarda
 * fotos del PROGRAMA GUARDADO cada vez que algo pasa por `applyWorkout`. El
 * compositor no pasa por ahí —monta el bloque entero en `useState` y no
 * escribe nada hasta «Cerrar el anterior y abrir este»—, así que allí no hay
 * ni una sola foto que devolver. De ahí el síntoma que reportó el dueño: «el
 * deshacer en la creación de bloque no lo veo». No es que estuviera escondido:
 * no estaba.
 *
 * Esto es la misma idea una talla más pequeña: una pila de fotos de un estado
 * local. No sabe de bloques ni de hojas —solo compara referencias— y por eso
 * sirve para cualquier pantalla que monte algo caro antes de guardarlo.
 *
 * ══ UN GESTO ES UN PASO ════════════════════════════════════════════════════
 *
 * La lección que costó dos ⌘Z en el deshacer del plan: casi ningún gesto
 * escribe una sola vez. Quitar una hoja toca `sesiones` Y `split`; heredar un
 * bloque toca las dos y además `abierta`. Aquí sale gratis porque la foto se
 * mira UNA VEZ POR RENDER, y React agrupa todos los `setState` de un mismo
 * manejador en un solo render: tres escrituras del mismo gesto son un paso.
 *
 * ══ Cómo se compara ════════════════════════════════════════════════════════
 *
 * Por referencia, clave a clave. La foto se construye en cada render
 * (`{ sesiones, split }`), así que el objeto SIEMPRE es nuevo; lo que no
 * cambia si nadie ha tocado nada son sus valores, que son los propios estados.
 * Comparar en profundidad sería recorrer el bloque entero en cada render para
 * enterarse de lo que la identidad ya dice.
 *
 * @param foto       Lo que se guarda y se devuelve. Un objeto plano de estados.
 * @param restaurar  Cómo se vuelve a poner una foto. Se lee por ref: puede
 *                   crearse de nuevo en cada render sin recrear la pila.
 * @returns `{ pasos, deshacer, rehacer, olvidar }`.
 */

/** Cuántos gestos atrás se puede llegar. Media hora de trabajo cabe de sobra. */
const MAX = 60;

/** Dos fotos son la misma si todos sus valores son el mismo objeto. */
const mismaFoto = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const claves = Object.keys(a);
  return claves.length === Object.keys(b).length && claves.every((k) => a[k] === b[k]);
};

export const usePilaDeCambios = ({ foto, restaurar }) => {
  const atras = useRef([]);
  const adelante = useRef([]);
  /* La foto vigente. No es estado: cambiarla no tiene que redibujar nada. */
  const ultima = useRef(foto);
  /*
    El cambio que viene NO es un paso. Lo arman dos cosas y solo dos: la propia
    restauración —deshacer no es un gesto que se deshaga— y `olvidar`, que es
    empezar un bloque de cero. Se consume en el primer cambio que llegue, y los
    dos sitios que lo arman escriben siempre a continuación: `restaurar` pone
    una foto distinta (nunca se apilan dos iguales) y las dos puertas del
    compositor asignan arrays nuevos.
  */
  const saltar = useRef(false);
  const devolver = useRef(restaurar);
  devolver.current = restaurar;

  /* Lo único que sí se pinta: si hay algo que deshacer y si hay algo que
     rehacer. Los mandos salen solo cuando lo hay (la ley del reposo). */
  const [pasos, setPasos] = useState({ atras: 0, adelante: 0 });

  useEffect(() => {
    if (mismaFoto(foto, ultima.current)) return;
    const anterior = ultima.current;
    ultima.current = foto;
    if (saltar.current) {
      saltar.current = false;
      return;
    }
    atras.current = [...atras.current, anterior].slice(-MAX);
    adelante.current = [];
    setPasos({ atras: atras.current.length, adelante: 0 });
  }, [foto]);

  const deshacer = useCallback(() => {
    if (atras.current.length === 0) return false;
    const vuelve = atras.current[atras.current.length - 1];
    atras.current = atras.current.slice(0, -1);
    adelante.current = [...adelante.current, ultima.current];
    saltar.current = true;
    devolver.current(vuelve);
    setPasos({ atras: atras.current.length, adelante: adelante.current.length });
    return true;
  }, []);

  const rehacer = useCallback(() => {
    if (adelante.current.length === 0) return false;
    const vuelve = adelante.current[adelante.current.length - 1];
    adelante.current = adelante.current.slice(0, -1);
    atras.current = [...atras.current, ultima.current];
    saltar.current = true;
    devolver.current(vuelve);
    setPasos({ atras: atras.current.length, adelante: adelante.current.length });
    return true;
  }, []);

  /** Tirar la pila: lo de antes ya no es de este bloque. */
  const olvidar = useCallback(() => {
    atras.current = [];
    adelante.current = [];
    saltar.current = true;
    setPasos({ atras: 0, adelante: 0 });
  }, []);

  return { pasos, deshacer, rehacer, olvidar };
};
