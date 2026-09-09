import { Field, NumberInput, TextInput } from '@/components/ui/primitives';
import { FOLDS_LABELS, PERIMETER_LABELS } from '@/domain/anthropometry';
import { fraseDeRegla } from '@/domain/formulario';

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
              placeholder="—"
            />
            <span aria-hidden="true">cm</span>
          </div>
        )}
      </Field>
    ))}
  </div>
);

const Opciones = ({ elem, valor, onChange, soloLectura }) => {
  const varias = elem.tipo === 'varias';
  const puestas = varias ? valor || [] : [];

  return (
    <div className="opciones-libres" role="group" aria-label={elem.enun}>
      {(elem.ops || []).map((op) => {
        const marcada = varias ? puestas.includes(op) : valor === op;
        return (
          <button
            key={op}
            type="button"
            className="chip-op"
            aria-pressed={marcada}
            disabled={soloLectura}
            onClick={() => {
              if (!varias) return onChange(marcada ? '' : op);
              /* Volver a pulsar la quita: sin eso, marcar por error una de siete
                 obliga a recargar la página para deshacerlo. */
              return onChange(marcada ? puestas.filter((x) => x !== op) : [...puestas, op]);
            }}
          >
            {op}
          </button>
        );
      })}
    </div>
  );
};

const Escala = ({ elem, valor, onChange, soloLectura }) => {
  const nums = [];
  for (let i = elem.min; i <= elem.max; i += 1) nums.push(i);

  return (
    <div className="escala-libre" role="group" aria-label={elem.enun}>
      {nums.map((n) => (
        <button
          key={n}
          type="button"
          className="escala-num"
          aria-pressed={String(valor) === String(n)}
          disabled={soloLectura}
          onClick={() => onChange(String(valor) === String(n) ? '' : n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
};

const Control = ({ elem, valor, onChange, soloLectura }) => {
  if (elem.tipo === 'sino') {
    return (
      <div className="opciones-libres" role="group" aria-label={elem.enun}>
        {[
          { id: 'si', label: 'Sí' },
          { id: 'no', label: 'No' },
        ].map((o) => (
          <button
            key={o.id}
            type="button"
            className="chip-op"
            aria-pressed={valor === o.id}
            disabled={soloLectura}
            onClick={() => onChange(valor === o.id ? '' : o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  if (elem.tipo === 'una' || elem.tipo === 'varias') {
    return <Opciones elem={elem} valor={valor} onChange={onChange} soloLectura={soloLectura} />;
  }

  if (elem.tipo === 'escala') {
    return <Escala elem={elem} valor={valor} onChange={onChange} soloLectura={soloLectura} />;
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

  if (elem.tipo === 'numero' || elem.tipo === 'peso') {
    return (
      <div className="input-suffix">
        <NumberInput
          center={false}
          value={valor ?? ''}
          disabled={soloLectura}
          onChange={onChange}
          placeholder="—"
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
    >
      <Control elem={elem} valor={valor} onChange={onChange} soloLectura={soloLectura} />
    </Field>
  );
};
