import { useCallback } from 'react';

import { useApp } from '@/context/AppContext';
import { CAJONES, FORMAS, guardadosDe, tieneCajon } from '@/domain/cajon';
import { useToast } from '@/components/ui/ToastProvider';

/**
 * GUARDAR LO QUE LLEVAS EN TUS PLANTILLAS. Un solo camino, tres puertas.
 *
 * ══ Por qué salió de la mano ═══════════════════════════════════════════════
 *
 * Vivía dentro de `ManoDelPortapapeles`, que era el único sitio desde donde se
 * podía guardar. Y ahí estaba la avería que lo saca de allí: *«no veo que se
 * pueda pegar en plantillas… entras a plantillas y debería valer»*. Tenía
 * razón. `/plantillas` es LA pantalla del material guardado y era la única de
 * la casa que no se registraba como destino: llegabas con una comida en la mano
 * y la mano se quedaba en gris, porque no había nadie diciendo «aquí cae esto».
 *
 * Ahora se registra (`Destino` en `PlantillasPanel`), y en cuanto hay dos
 * puertas al mismo gesto, el gesto no puede estar escrito dentro de una de
 * ellas: guardar desde la ficha de la mano y guardar al llegar a la pantalla
 * tienen que desempatar el nombre igual, respetar el mismo tope y decirlo con
 * la misma frase, o son dos funciones que se parecen.
 *
 * La tercera puerta llegó con los bloques: **la fila de `ListaDeBloques`**, que
 * es donde se ve cuál fue el que funcionó. Tres puertas, y por eso este módulo
 * no sabe de ninguna.
 *
 * ══ Guardar no es pegar ════════════════════════════════════════════════════
 *
 * Tres verbos y tres significados, con la misma pieza en la mano: **pegar**
 * escribe en el trabajo de UNA persona y se deshace; **poner en varios** es lo
 * mismo a N, con las consecuencias delante; **guardar** va a tu cajón, con
 * nombre y para siempre, y no le toca nada a nadie. Por eso el destino de
 * `/plantillas` dice «Guardar» y no «Pegar» —`registrarDestino` acepta el verbo
 * justamente para esto— y por eso no pide confirmación: no hay nada que
 * deshacer.
 *
 * ══ Y por qué ya no hay una rama por forma ═════════════════════════════════
 *
 * Escribía en `preferences.piezas` y `preferences.platos` con dos bloques casi
 * idénticos —el mismo tope, el mismo desempate de nombre, el mismo aviso con
 * otras palabras— y la tercera forma habría sido un tercero. Desde la 0112 lo
 * guardado vive en `coach_templates` y **qué cambia de una forma a otra lo dice
 * `CAJONES`**: el tope, cómo se desempata el nombre, qué se limpia al entrar y
 * si hay algo que guardar. Aquí solo queda el gesto, que es el mismo para las
 * tres. Ver `docs/replanteamiento-lo-guardado.md`, §10 (G-04…G-06).
 */

/** Cómo se llama el destino. Lo dice la mano —«Guardar «Comida 1» en tus
 *  plantillas»— y lo mira ella misma para no ofrecer el verbo dos veces. */
export const EL_CAJON = 'tus plantillas';

/**
 * Las formas que tienen dónde ir: bloque, hoja y comida.
 *
 * Sale de `domain/cajon` y no de una lista escrita aquí, que es lo que
 * garantiza que la mano ofrezca «Guardar» exactamente de lo que la pantalla
 * sabe enseñar. Un ejercicio no entra —ya tiene biblioteca propia y editable,
 * la Librería— ni un menú entero, que es el plan de una persona.
 */
export const FORMAS_CON_CAJON = FORMAS;

export const sePuedeGuardar = tieneCajon;

/**
 * @returns `guardar(pieza)` → el tipo guardado, o `null` si no se pudo. Quien
 * llama lo usa para llevar la vista al tramo donde acaba de caer; el aviso lo
 * da este gancho, que es quien sabe con qué nombre entró.
 *
 * Es asíncrono desde la 0112: el cajón es una tabla y guardar es una escritura
 * que puede fallar —sin red, o sin la migración—, y entonces lo que hay que
 * decir es que no se guardó, no llevar la vista a un tramo donde no hay nada.
 */
export const useGuardarEnPlantillas = () => {
  const { cajon, cabeEnCajon, guardarEnCajon } = useApp();
  const toast = useToast();

  return useCallback(
    async (pieza) => {
      const forma = CAJONES[pieza?.tipo];
      if (!forma) return null;

      const carga = pieza.carga || {};
      if (!forma.vale(carga)) {
        toast({ text: `«${pieza.titulo}» está en blanco: no hay nada que guardar.` });
        return null;
      }

      /* El tope lo decide el cajón y no esta cuenta: `useCajon` es quien lo
         posee, y con la regla escrita en dos sitios el día que una forma cambie
         de tope habría dos verdades. */
      if (!cabeEnCajon(pieza.tipo)) {
        toast({
          text: `Ya tienes ${forma.tope} ${forma.tramo.toLowerCase()}. Quita alguno para hacer sitio.`,
        });
        return null;
      }

      /* El nombre, desempatado como al pegar una hoja en un bloque: en el cajón
         ya puede haber un «Lower A» de otra persona, y dos plantillas con el
         mismo nombre son dos que hay que abrir para saber cuál es cuál. */
      const name = forma.libre(
        pieza.titulo,
        guardadosDe(cajon, pieza.tipo).map((x) => x.name)
      );

      /* La carga entra CRUDA: la limpieza es de `construir`, que la hace dentro
         de `guardarEnCajon` con la misma tabla. Limpiarla aquí antes sería la
         segunda copia de una decisión que ya tiene dueño. */
      const { ok, error } = await guardarEnCajon({ kind: pieza.tipo, name, carga });
      if (!ok) {
        toast({ text: error || 'No se ha podido guardar.' });
        return null;
      }

      toast({
        text: `«${name}» ${forma.guardado.toLowerCase()} en tus ${forma.tramo.toLowerCase()}, para cualquier cliente.`,
      });
      return pieza.tipo;
    },
    [cajon, cabeEnCajon, guardarEnCajon, toast]
  );
};
