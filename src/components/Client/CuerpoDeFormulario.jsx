import { MessageSquare, Ruler } from 'lucide-react';

import { contestado, elementosVisibles, esPregunta, tocaAntropometria } from '@/domain/formulario';
import { Notice } from '@/components/ui/primitives';
import { CampoLibre } from './CampoLibre';

/**
 * EL CUERPO DE UN FORMULARIO: el recado, el aviso de las medidas y los campos.
 *
 * ══ Por qué esto se extrajo ════════════════════════════════════════════════
 *
 * El constructor ya enseñaba `CampoLibre` uno a uno y con `soloLectura` —la
 * vitrina— y eso cubre «¿qué pinta tiene esta pregunta?». Lo que no cubre es lo
 * único que de verdad hay que comprobar antes de mandarle algo a alguien: **cómo
 * se comporta el formulario entero cuando se contesta**.
 *
 * Una pregunta que solo aparece si respondes «sí» a la anterior NO SE PUEDE VER
 * en una vitrina, porque en una vitrina no hay respuestas. Y es exactamente la
 * clase de cosa que se monta mal y no se descubre hasta que un cliente se queda
 * mirando un formulario que no le pregunta lo que tenía que preguntarle.
 *
 * Así que el ensayo del entrenador y el formulario del cliente son ESTE mismo
 * componente, con el mismo `elementosVisibles` resolviendo las mismas reglas
 * contra un borrador vivo. Es el argumento que ya está escrito en `CampoLibre`,
 * subido un piso: dos copias del mismo formulario divergen a la tercera semana, y
 * la que divergiría sería justo la que el entrenador usa para decidir.
 *
 * Lo que NO entra aquí es la cabecera ni el pie: el cliente entrega y el
 * entrenador ensaya, y son dos botones distintos que dicen cosas distintas.
 */
export const CuerpoDeFormulario = ({ elementos = [], borrador = {}, onChange, recado = null }) => {
  const visibles = elementosVisibles(elementos, borrador);

  return (
    <>
      {/*
        El recado de su entrenador, si lo escribió al mandarlo. Va ANTES de las
        preguntas y con su cara al lado, porque es lo que explica por qué le ha
        llegado esto: sin él, un formulario que aparece solo en el portal es una
        tarea sin remitente.
      */}
      {recado && (
        <p className="libre-recado">
          <MessageSquare size={15} aria-hidden="true" />
          <span>{recado}</span>
        </p>
      )}

      {/* El signo va en `icon` y no dentro del texto: el aviso ya pinta el suyo
          —la «i» del tono— y con la regla metida a mano salían los dos, uno
          detrás de otro, encabezando la misma frase. */}
      {tocaAntropometria(elementos) && (
        <Notice tone="info" icon={Ruler}>
          Las medidas que pongas aquí entran en tu evolución. Tómalas siempre igual: relajado y sin
          meter tripa.
        </Notice>
      )}

      {/*
        ══ LA HOJA VA NUMERADA ════════════════════════════════════════════════

        Era una pila de campos con el mismo peso y el mismo hueco entre ellos:
        catorce preguntas seguidas sin más orilla que el aire. Ahora cada una
        lleva su número a la izquierda y el número SE ENCIENDE al contestarla.

        Numerar solo vale si el contenido es de verdad una secuencia (la casa lo
        tiene escrito), y un formulario lo es: se contesta de arriba abajo. De
        paso hace el trabajo que hacía el hueco —separar— y uno que no hacía
        nadie: decir por dónde vas sin escribirlo en ninguna parte.

        Los apartados y las notas NO gastan número: no se contestan, así que
        contarlas convertiría «14 preguntas» en «19 renglones» y el número
        dejaría de corresponderse con lo que le falta por hacer.
      */}
      <div className="libre-campos">
        {(() => {
          let n = 0;
          return visibles.map((elem) => {
            const pregunta = esPregunta(elem);
            if (pregunta) n += 1;
            return (
              <div
                key={elem.id}
                /* `data-tipo` lo lee el filete: un apartado ENCABEZA lo que
                   viene detrás, así que entre él y su primera pregunta no va
                   línea. Una nota no encabeza nada y sí la lleva. */
                data-tipo={elem.tipo}
                className={`campo-q${pregunta ? ' es-numerada' : ' es-estructura'}`}
              >
                {pregunta && (
                  <span
                    className="feedback-n"
                    data-hecha={contestado(borrador[elem.id]) ? '1' : undefined}
                    aria-hidden="true"
                  >
                    {String(n).padStart(2, '0')}
                  </span>
                )}
                <CampoLibre
                  elem={elem}
                  elementos={elementos}
                  valor={borrador[elem.id]}
                  onChange={(v) => onChange(elem.id, v)}
                />
              </div>
            );
          });
        })()}
      </div>
    </>
  );
};
