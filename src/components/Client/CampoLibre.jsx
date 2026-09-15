import { Contador } from '@/components/ui/Contador';
import { Escala } from '@/components/ui/Escala';
import { Opciones } from '@/components/ui/Opciones';
import { ZonaDelCuerpo } from '@/components/ui/ZonaDelCuerpo';
import { Field, HUECO_CIFRA, NumberInput, TextInput } from '@/components/ui/primitives';
import { FOLDS_LABELS, PERIMETER_LABELS } from '@/domain/anthropometry';
import { fraseDeRegla } from '@/domain/formulario';
import { catalogQuestionById } from '@/domain/protocol';

/**
 * UN ELEMENTO DEL FORMULARIO, tal y como lo ve el cliente.
 *
 * ══ Por qué vive en el lado del cliente ════════════════════════════════════
 *
 * Porque el constructor lo IMPORTA para enseñar la vitrina —«así lo ve él»— con
 * `soloLectura`. Es el mismo recurso que ya usaba `ConstructorFormulario` con
 * `Pregunta` de `IntakeQuestions`: el entrenador no ve una imitación de lo que
 * verá el cliente, ve el componente de verdad apagado.
 *
 * Dos copias del mismo control divergen a la tercera semana, y la que divergiría
 * sería justo la que el entrenador usa para decidir qué preguntar.
 */

const LABELS = { ...PERIMETER_LABELS, ...FOLDS_LABELS };

/** Las piezas de una medida, con su nombre de verdad y su unidad. */
const Medidas = ({ elem, valor, onChange, soloLectura }) => (
  <div className="medidas-rejilla">
    {(elem.piezas || []).map((pieza) => (
      <Field key={pieza} label={LABELS[pieza] || pieza}>
        {(props) => (
          <div className="input-suffix">
            <NumberInput
              {...props}
              center={false}
              value={(valor || {})[pieza] ?? ''}
              onChange={(v) => onChange({ ...(valor || {}), [pieza]: v })}
              disabled={soloLectura}
              placeholder={HUECO_CIFRA}
            />
            <span aria-hidden="true">cm</span>
          </div>
        )}
      </Field>
    ))}
  </div>
);

const Control = ({ elem, valor, onChange, soloLectura }) => {
  /* Sí/no y elegir: la MISMA pieza que el cuestionario del check-in (`ui/
     Opciones`). Aquí vivían escritos a mano los dos controles, y al abrir el
     check-in a estos tipos la salida fácil era copiarlos allí — dos copias del
     mismo botón, y la que divergiría sería la que se contesta cada semana. Es lo
     que ya pasó con la escala y está contado debajo. */
  if (elem.tipo === 'sino' || elem.tipo === 'una' || elem.tipo === 'varias') {
    return (
      <Opciones
        ops={elem.tipo === 'sino' ? null : elem.ops}
        /* El sí/no con su visto y su aspa, igual que en el check-in: se
           distingue por la forma antes de leer la palabra. */
        sino={elem.tipo === 'sino'}
        varias={elem.tipo === 'varias'}
        valor={valor}
        etiqueta={elem.enun}
        soloLectura={soloLectura}
        onChange={onChange}
      />
    );
  }

  /* Y el cuerpo, para decir dónde le molesta. Ver `ui/ZonaDelCuerpo`: un texto
     libre de una zona no se puede leer dos veces. */
  if (elem.tipo === 'zona') {
    return (
      <ZonaDelCuerpo
        valor={valor}
        etiqueta={elem.enun}
        soloLectura={soloLectura}
        onChange={onChange}
      />
    );
  }

  if (elem.tipo === 'escala') {
    /*
      La MISMA escala del check-in y del parte (`ui/Escala`). Aquí vivió una
      copia con su propio CSS que hubo que igualar a mano a la otra; el cliente
      contesta las dos y no tiene por qué encontrarse dos controles para lo
      mismo.

      ══ Y CON SU INSTRUMENTO, que era lo que se quedaba por el camino ═══════

      Una escala de este modelo puede venir de dos sitios: la escribe el
      entrenador —y entonces es la rampa, que es lo que corresponde a una
      pregunta de la que nadie ha decidido qué clase de cosa mide— o la coge de
      la ESTANTERÍA, y entonces es una pregunta del catálogo con todo lo suyo.

      El elemento solo se trae de allí lo que se puede retocar: el enunciado, la
      ayuda, el rango. Lo que NO se retoca —el instrumento, las puntas, el color
      de la serie— no se copia a propósito, porque copiarlo sería dejarlo
      editable. La consecuencia era que «Energía» sacada a un formulario salía
      como una rampa de cinco discos en vez de como su depósito, y «Sensaciones
      generales» como otra rampa igual en vez de como sus caras: el mismo
      control dos veces, que es justo la avería que los instrumentos cerraron.

      Así que se va a buscar por `origen`, que es el id de la pregunta de serie
      y lo único que el elemento sí conserva.
    */
    const base = catalogQuestionById(elem.origen);
    return (
      <Escala
        /* EL RANGO LO MANDA EL INSTRUMENTO, igual que en `sanitizeCustom`: cinco
           estrellas son cinco. Un elemento guardado antes de que la adherencia
           bajara a 1-5 sigue diciendo `max: 10`, y sin esto el cliente se
           encontraría diez estrellas en fila. */
        min={base?.instrumento ? (base.min ?? 1) : elem.min}
        max={base?.instrumento ? (base.max ?? 5) : elem.max}
        instrumento={base?.instrumento || null}
        anclas={base?.anclas || null}
        /* La tinta de su serie. Una pregunta inventada no tiene ninguna —no se
           pinta después en ninguna gráfica— y ahí manda el acento, que es lo que
           invita; una del catálogo comparte tinta con la línea que su entrenador
           mira el lunes. */
        color={base?.color || null}
        valor={valor}
        etiqueta={elem.enun}
        soloLectura={soloLectura}
        /* De vuelta a número. La escala devuelve texto —es lo que el check-in
           guarda—, pero aquí la respuesta viaja a `client_actions` y las reglas
           («solo si es mayor que 3») la comparan como cifra: cambiar el tipo de
           lo que se guarda sería cambiar el dato, no el control. */
        onChange={(v) => onChange(v === '' ? '' : Number(v))}
      />
    );
  }

  if (elem.tipo === 'perimetros' || elem.tipo === 'pliegues') {
    return <Medidas elem={elem} valor={valor} onChange={onChange} soloLectura={soloLectura} />;
  }

  if (elem.tipo === 'parrafo') {
    return (
      <textarea
        className="input textarea"
        rows={3}
        value={valor ?? ''}
        disabled={soloLectura}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  /* Una cifra SIN unidad se cuenta con dos botones, igual que en el check-in
     (`ui/Contador`): son cuántos días, cuántas veces. Con unidad no —«75,4 kg»
     no se sube de uno en uno—, así que ésa se queda con su casilla y su
     sufijo. */
  if (elem.tipo === 'numero' && !elem.unidad) {
    return (
      <Contador valor={valor} etiqueta={elem.enun} soloLectura={soloLectura} onChange={onChange} />
    );
  }

  if (elem.tipo === 'numero' || elem.tipo === 'peso') {
    return (
      <div className="input-suffix">
        <NumberInput
          center={false}
          value={valor ?? ''}
          disabled={soloLectura}
          onChange={onChange}
          placeholder={HUECO_CIFRA}
        />
        {elem.unidad && <span aria-hidden="true">{elem.unidad}</span>}
      </div>
    );
  }

  if (elem.tipo === 'fecha') {
    return (
      <input
        type="date"
        className="input"
        value={valor ?? ''}
        disabled={soloLectura}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (elem.tipo === 'archivo') {
    /*
      Todavía no sube nada: aquí se escribe el enlace.

      Se dice así en vez de enseñar un botón que no funciona. Subir de verdad
      pasa por `uploadIntakeFile` y su carpeta, y entra cuando el envío sepa
      dónde dejarlo — no antes, porque un botón que no guarda es peor que uno
      que no está.
    */
    return (
      <TextInput
        value={valor ?? ''}
        disabled={soloLectura}
        onChange={onChange}
        placeholder="Pega aquí el enlace"
      />
    );
  }

  return <TextInput value={valor ?? ''} disabled={soloLectura} onChange={onChange} />;
};

export const CampoLibre = ({ elem, elementos = [], valor, onChange, soloLectura = false }) => {
  if (elem.tipo === 'apartado') {
    return (
      <div className="apartado-libre">
        <span className="apartado-tit">{elem.enun}</span>
        {elem.ayuda && <span className="apartado-dice">{elem.ayuda}</span>}
      </div>
    );
  }

  if (elem.tipo === 'nota') return <p className="nota-libre">{elem.enun}</p>;

  return (
    <Field
      /* El asterisco y no la palabra: en un formulario de veinte, repetir
         «obligatoria» convierte la etiqueta en ruido. Lo que las nombra es el
         aviso de abajo, cuando de verdad faltan. */
      label={elem.oblig ? `${elem.enun} *` : elem.enun}
      hint={elem.ayuda || (soloLectura ? fraseDeRegla(elem, elementos) : '')}
      /* La ayuda ANTES del control y no después. Aquí siempre dice cómo se
         contesta —«de 1 a 10», «en centímetros, sin meter tripa»— y puesta
         debajo se leía cuando ya habías contestado. Ver `Field`. */
      hintArriba
    >
      <Control elem={elem} valor={valor} onChange={onChange} soloLectura={soloLectura} />
    </Field>
  );
};
