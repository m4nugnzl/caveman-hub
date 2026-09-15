import { useEffect, useMemo, useState } from 'react';

import { useActions, useApp } from '@/context/AppContext';
import {
  coachFormularios,
  desdeElementos,
  elementosDe,
  formulariosToPreferences,
} from '@/domain/formularios';
import { MAX_MEDIDAS, coachMedidas, esFija, medidasToPreferences } from '@/domain/medidas';
import { useToast } from '@/components/ui/ToastProvider';
import { ConstructorFormulario } from './ConstructorFormulario';
import { ConstructorLibre } from './ConstructorLibre';

/**
 * ESCRIBIR UN FORMULARIO, desde donde se esté.
 *
 * ══ Por qué es una pieza y no un trozo de pantalla ═════════════════════════
 *
 * Porque ahora se abre desde DOS sitios: desde la lista de formularios y desde
 * la acción del protocolo que lo pide. Antes, editar el formulario de una acción
 * era `navigate('/formularios')` con un `state.volver` escrito a propósito para
 * que el entrenador no se perdiera —y cuando hay que programar el camino de
 * vuelta, el viaje sobraba—.
 *
 * Lo que costaba montarlo en el protocolo no era el constructor: era esto de
 * aquí, las cuatro cosas que hay que saber para editar uno. Copiarlas en la otra
 * pantalla habría sido el mismo campo con dos editores, que es la avería que el
 * producto lleva un mes cerrando. Así que se extraen una vez:
 *
 *   · **El lienzo es estado.** `elementosDe` no lee ids: los FABRICA. Un
 *     formulario del modelo viejo guarda ids de catálogo (`adherence`) y campos
 *     sueltos (`weighIns`), así que sus elementos nacen con `newId` en cada
 *     llamada. Calcularlos en el render significaría que el elemento que estás
 *     tocando cambia de identidad en cada tecla: el carril se cerraría solo, las
 *     `key` de React se rehacen enteras y reordenar movería otra cosa. Se
 *     siembra UNA vez al abrir y vive aquí mientras se edita.
 *   · **Se guarda en su forma de siempre.** `desdeElementos` lo devuelve a como
 *     estaba guardado, así que el portal, la revisión y la analítica siguen
 *     leyendo exactamente lo mismo.
 *   · **Una medida nueva es vocabulario TUYO**, no del formulario: va a tus
 *     preferencias y vale para todos tus clientes. Ver `domain/medidas.js`.
 *   · **El alta tiene su propio editor.** Su modelo son campos de perfil
 *     (`asked`, `askBasics`…) y no elementos, así que no hay lienzo que sembrar
 *     ni renderizador que montar. El día que lo tenga, esta bifurcación es la
 *     única línea que se cae.
 *
 * @param formId   Cuál se edita. Si ya no existe —lo has quitado desde otro
 *   sitio— no se pinta nada: quien llama decide qué enseñar en su lugar.
 * @param onVolver La flecha de atrás. Devuelve a donde se abrió, que es lo único
 *   que las dos pantallas no comparten.
 * @param onMandar El verbo del suelto, si quien llama lo ofrece.
 */
export const EditorDeFormulario = ({ formId, onVolver, onMandar = null }) => {
  const { coachPrefs } = useApp();
  const { updateCoachPreferences } = useActions();
  const toast = useToast();

  const formularios = coachFormularios(coachPrefs);
  const form = formularios.find((f) => f.id === formId) || null;
  const medidas = useMemo(() => coachMedidas(coachPrefs), [coachPrefs]);

  const [lienzo, setLienzo] = useState([]);

  useEffect(() => {
    setLienzo(form ? elementosDe(form, medidas) : []);
    /* Solo al cambiar de formulario abierto: resembrar en cada cambio de `form`
       volvería a fabricar ids y traería de vuelta el problema de arriba. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]);

  const guardarUno = (siguiente) =>
    updateCoachPreferences(
      'formularios',
      formulariosToPreferences(formularios.map((f) => (f.id === siguiente.id ? siguiente : f)))
    );

  const guardarLienzo = (elementos) => {
    setLienzo(elementos);
    if (form) guardarUno(desdeElementos(form, elementos));
  };

  const guardarMedida = (medida) => {
    if (medidas.filter((m) => !esFija(m.id)).length >= MAX_MEDIDAS) {
      toast({ text: `Ya tienes ${MAX_MEDIDAS} medidas tuyas, que es el tope.` });
      return;
    }
    updateCoachPreferences('medidas', medidasToPreferences([...medidas, medida]));
  };

  if (!form) return null;

  /*
    ── Y EL ALTA YA NO SALTA AL PORTAL ──────────────────────────────────────

    Aquí vivía un «ver como cliente» que hacía `openClientView('/mi/alta')`, y
    era la última pieza que quedaba de la avería que los otros tres momentos ya
    tenían cerrada: allí se ve el alta DE ESE CLIENTE —otra distinta, con sus
    respuestas, y solo si la tiene pendiente—, así que el formulario que se
    estaba montando era justo el que no se podía mirar.

    Ahora el alta se ensaya en el constructor como los otros tres, con
    `CuerpoDelAlta` extraído de la pantalla de verdad del cliente. Lo que este
    salto necesitaba —un cliente abierto— era además la confesión: una
    previsualización que exige que exista una persona con eso pendiente no es
    una previsualización.
  */
  if (form.momento === 'alta') {
    return <ConstructorFormulario form={form} onChange={guardarUno} onVolver={onVolver} />;
  }

  return (
    <ConstructorLibre
      form={form}
      elementos={lienzo}
      medidas={medidas}
      onNuevaMedida={guardarMedida}
      onChange={guardarLienzo}
      onVolver={onVolver}
      onMandar={onMandar}
    />
  );
};
