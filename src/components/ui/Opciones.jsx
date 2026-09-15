import { Check, X } from 'lucide-react';

/**
 * ELEGIR: sí/no, una de varias, varias de varias.
 *
 * ══ Por qué es una pieza ═══════════════════════════════════════════════════
 *
 * Este control vivía escrito a mano dentro de `Client/CampoLibre`, que es el
 * formulario suelto, y el check-in no lo tenía porque su modelo solo guardaba
 * escalas y textos. Al abrirlo (`QUESTION_KINDS`), la salida fácil era copiar
 * los botones al cuestionario: dos copias del mismo control, y la que divergiría
 * sería la que se contesta todas las semanas.
 *
 * Es la misma decisión que ya está tomada con `ui/Escala`, y por el mismo
 * motivo: el cliente contesta los dos formularios y no tiene por qué encontrarse
 * dos maneras distintas de decir que sí.
 *
 * ══ Botones y no un desplegable ════════════════════════════════════════════
 *
 * Con cinco opciones o menos, un desplegable esconde lo que hay que elegir
 * detrás de un toque y obliga a abrirlo para saber qué se puede contestar. Aquí
 * las opciones están a la vista y cada una es su propio objetivo táctil.
 *
 * Y volver a pulsar la marcada la QUITA. Sin eso, marcar por error la primera de
 * siete no se puede deshacer, y dejar un dato falso es peor que no tener dato —
 * la misma ley que la escala.
 *
 * @param valor       Una cadena en `sino`/`una`; un array en `varias`.
 * @param readOnly    Ya se contestó: se lee, no se toca. Solo lo marcado.
 * @param soloLectura Así se va a ver: el control ENTERO, apagado. Lo usan los
 *   constructores para enseñar la pregunta como le llegará al cliente.
 */

const SI_NO = [
  { id: 'si', label: 'Sí', icono: Check },
  { id: 'no', label: 'No', icono: X },
];

/**
 * @param sino UN SÍ/NO, y no «elegir una de dos».
 *
 * Las dos respuestas son siempre las mismas, están en todas las preguntas de
 * este tipo y una confirma mientras la otra niega. Pintadas como dos píldoras
 * idénticas con dos palabras dentro, «Sí» y «No» se leen como dos etiquetas
 * cualesquiera y hay que leerlas para saber cuál es cuál — que es justo lo que
 * un sí/no no debería costar.
 *
 * Con su marca —el visto y el aspa— se distinguen por la forma antes que por la
 * palabra, y se reconocen de reojo al repasar un formulario contestado. Es la
 * misma idea que la rampa: que el control DIBUJE lo que significa.
 */
export const Opciones = ({
  ops = null,
  varias = false,
  sino = false,
  valor,
  onChange,
  etiqueta,
  readOnly = false,
  soloLectura = false,
}) => {
  /* Sin lista, es un sí/no: las dos opciones son siempre las mismas y pedírselas
     a quien monta la pregunta sería dejarle escribir «Sí» y «Nop». */
  const esSiNo = sino || !(ops && ops.length > 0);
  /*
    Una opción puede venir de dos sitios y no guardan lo mismo.

    Las que escribe el entrenador en un formulario son TEXTO —lo que se guarda es
    la palabra que puso— y llegan como una lista de cadenas. Las del catálogo del
    perfil (la experiencia, cómo pasa el día) tienen id propio: se guarda `inter`
    y se lee «1 a 3 años», y ése es el valor que `cleanProfile` valida contra la
    lista. Por eso también se aceptan `{ id, label }` — lo contrario obligaría a
    guardar la etiqueta en vez del id, que es cambiar el dato para que le encaje
    un botón.
  */
  const lista = esSiNo ? SI_NO : ops.map((o) => (typeof o === 'string' ? { id: o, label: o } : o));
  const puestas = varias ? (Array.isArray(valor) ? valor : []) : [];
  const marcada = (id) => (varias ? puestas.includes(id) : valor === id);

  /* En lectura no es un grupo de controles: son las que marcó. Las siete que no
     eligió no dicen nada y llenan el renglón de opciones apagadas. */
  if (readOnly) {
    const dadas = lista.filter((o) => marcada(o.id));
    if (dadas.length === 0) return null;
    return (
      <span className="opciones-libres es-leida">
        {dadas.map((o) => (
          <span className={`chip-op es-dada${esSiNo ? ' es-sino' : ''}`} key={o.id}>
            {o.icono && <o.icono size={15} className="icon-inline" />}
            {o.label}
          </span>
        ))}
      </span>
    );
  }

  return (
    <div className={`opciones-libres${esSiNo ? ' es-sino' : ''}`} role="group" aria-label={etiqueta}>
      {lista.map((o) => (
        <button
          key={o.id}
          type="button"
          className="chip-op"
          aria-pressed={marcada(o.id)}
          disabled={soloLectura}
          onClick={() => {
            if (!varias) return onChange(marcada(o.id) ? '' : o.id);
            return onChange(
              marcada(o.id) ? puestas.filter((x) => x !== o.id) : [...puestas, o.id]
            );
          }}
        >
          {o.icono && <o.icono size={15} className="icon-inline" />}
          {o.label}
        </button>
      ))}
    </div>
  );
};
