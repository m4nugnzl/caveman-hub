import { useState } from 'react';
import {
  AlignLeft,
  ArrowLeft,
  Calendar,
  Camera,
  ChevronDown,
  ChevronUp,
  CircleDot,
  CornerDownRight,
  Eye,
  GripVertical,
  Hash,
  Layers,
  ListChecks,
  Paperclip,
  PersonStanding,
  Plus,
  Ruler,
  Scale,
  Send,
  SlidersHorizontal,
  Text,
  ToggleLeft,
  Trash2,
  Type,
} from 'lucide-react';

import {
  ESCALA_MAX,
  ESCALA_MIN,
  FAMILIAS,
  MAX_AYUDA,
  MAX_ELEMENTOS,
  MAX_ENUN,
  MAX_OPCIONES,
  anadirElemento,
  candidatosDeRegla,
  cuentaElementos,
  destinoById,
  editarElemento,
  fraseDeRegla,
  moverElemento,
  quitarElemento,
  reglaPorDefecto,
  tipoById,
  tiposDe,
  valorLegible,
} from '@/domain/formulario';
import { estanteria, medidaComoElemento, tiposDeMomento } from '@/domain/formularios';
import { CUANDOS, buildMedida } from '@/domain/medidas';
import {
  INSTRUMENTOS,
  MAX_CUSTOM as MAX_PROPIAS,
  WEIGH_INS_MAX as MAX_VECES,
  catalogQuestionById,
} from '@/domain/protocol';
import {
  Field,
  SegmentedControl,
  Switch,
  TextInput,
  TextoEnSitio,
} from '@/components/ui/primitives';
import { BotonMas } from '@/components/ui/BotonMas';
import { Modal } from '@/components/ui/Modal';
/* El control del cliente, tal cual. Ver el porqué en `CampoLibre`. */
import { CampoLibre } from '@/components/Client/CampoLibre';
import { GUIAS, GuiaDeMedidas } from './GuiaDeMedidas';
import { VistaPreviaFormulario } from './VistaPreviaFormulario';

/**
 * EL CONSTRUCTOR DE UN FORMULARIO SUELTO.
 *
 * ══ De dónde sale la gramática, y en qué la mejoramos ══════════════════════
 *
 * **De Coachway** — el renglón CONTIENE su control de verdad. En su «Client
 * Onboarding Form», el campo de circunferencias enseña dentro sus `Arm (cm)`,
 * `Chest (cm)`… con su aspa y su «+ Add Metric». No describe el campo: lo
 * dibuja. Es lo que hace que un lienzo se lea como un formulario.
 *
 * **De Efort** — el selector es una LÁMINA, no una paleta permanente:
 * «What would you like to ask? / Start with what you want to know», con columnas
 * de icono y palabra sin cajas. Aparece cuando se pide y se va.
 *
 * **Y lo que ninguno de los dos tiene, que es lo nuestro:**
 *
 *   1. **Cada renglón dice DÓNDE CAE la respuesta.** «a su antropometría», «a
 *      una serie suya». Una respuesta aquí no se queda en una hoja: entra en la
 *      ficha de una persona. Es la única frase de la pantalla que un formulario
 *      genérico no puede escribir.
 *   2. **La regla se lee bajo el renglón, como una frase.** «↳ solo si es Sí en
 *      «¿Arrastras alguna lesión?»». La lógica del formulario se entiende
 *      recorriendo el lienzo, sin abrir diez carriles.
 *   3. **La paleta no ocupa sitio.** Coachway gasta 240 px de ancho permanentes
 *      en su rail de campos; aquí ese ancho es del formulario, que es lo que se
 *      está mirando.
 *
 * ══ Y por qué no es un segundo editor ══════════════════════════════════════
 *
 * Porque no edita lo mismo. `ConstructorFormulario` edita los tres cuestionarios
 * del protocolo, que son listas de ids de un catálogo cerrado; esto edita una
 * lista de elementos libres. Comparten la gramática y la hoja de estilos, no el
 * dato — y el que entra por aquí entra por un solo sitio.
 */

const ICONO = {
  texto: Text,
  parrafo: AlignLeft,
  numero: Hash,
  sino: ToggleLeft,
  una: CircleDot,
  varias: ListChecks,
  escala: SlidersHorizontal,
  zona: PersonStanding,
  fecha: Calendar,
  archivo: Paperclip,
  peso: Scale,
  cinta: Ruler,
  pliegue: Layers,
  foto: Camera,
  apartado: Type,
  nota: AlignLeft,
};

const iconoDe = (tipo) => ICONO[tipoById(tipo)?.icono] || Text;

// ══ La lámina: «¿Qué quieres preguntar?» ═══════════════════════════════════

/**
 * ESCRIBIR UNA MEDIDA EN TU VOCABULARIO.
 *
 * ══ Los cuatro campos son los cuatro que hacen falta, y ni uno más ═════════
 *
 * El nombre y la unidad porque sin ellos no es una medida; los decimales porque
 * son la diferencia entre 36 °C y 36,4 °C; y el rango porque es lo que atrapa un
 * 950 de glucosa escrito con un dedo de más.
 *
 * Lo que NO se pregunta es qué significa el número. Ni rango «normal», ni aviso,
 * ni color por salirse: la aplicación no interpreta. Ver la ley en
 * `domain/medidas.js`.
 */
const NuevaMedida = ({ onGuardar, onCerrar }) => {
  const [label, setLabel] = useState('');
  const [unit, setUnit] = useState('');
  const [decimals, setDecimals] = useState(0);
  const [cuando, setCuando] = useState('revision');
  const [min, setMin] = useState('0');
  const [max, setMax] = useState('1000');

  const nombre = label.trim();
  const desde = Number(min);
  const hasta = Number(max);
  const valido =
    nombre.length > 0 && Number.isFinite(desde) && Number.isFinite(hasta) && hasta > desde;

  return (
    <Modal
      title="Nueva medida"
      onClose={onCerrar}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="submit"
            form="medida-form"
            className="btn btn-primary"
            disabled={!valido}
          >
            Guardarla
          </button>
        </>
      }
    >
      <form
        id="medida-form"
        className="col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valido) return;
          onGuardar(
            buildMedida({ label: nombre, unit: unit.trim(), decimals, min: desde, max: hasta, cuando })
          );
        }}
      >
        <Field label="Cómo se llama" hint="Como se lo dirías a tu cliente.">
          {(props) => (
            <TextInput {...props} value={label} placeholder="Glucosa en ayunas" onChange={setLabel} />
          )}
        </Field>

        <div className="grid-2">
          <Field label="Unidad" hint="Sale al lado del campo.">
            {(props) => (
              <TextInput {...props} value={unit} placeholder="mg/dL" onChange={setUnit} />
            )}
          </Field>
          <Field label="Decimales">
            <SegmentedControl
              value={decimals}
              onChange={setDecimals}
              options={[
                { id: 0, label: '36' },
                { id: 1, label: '36,4' },
                { id: 2, label: '36,45' },
              ]}
              label="Cuántos decimales tiene"
            />
          </Field>
        </div>

        <Field label="Cuándo se apunta">
          <SegmentedControl
            value={cuando}
            onChange={setCuando}
            options={CUANDOS.map((c) => ({ id: c.id, label: c.label }))}
            label="Cuándo se apunta esta medida"
          />
        </Field>
        <span className="t-xs t-tertiary">{CUANDOS.find((c) => c.id === cuando)?.hint}</span>

        {/* El rango, dicho por lo que es. «Mínimo» y «máximo» a secas se leen
            como un objetivo, y esto no juzga nada: solo atrapa un dedazo. */}
        <Field
          label="Entre qué valores puede caer"
          hint="Solo sirve para atrapar un dedo de más al teclear. No es un rango normal ni un aviso."
        >
          <div className="row gap-2">
            <input
              type="text"
              inputMode="numeric"
              className="input input-sm input-center"
              style={{ width: '8ch' }}
              value={min}
              onChange={(e) => setMin(e.target.value)}
              aria-label="Valor mínimo que se puede teclear"
            />
            <span className="t-sm t-tertiary" aria-hidden="true">
              —
            </span>
            <input
              type="text"
              inputMode="numeric"
              className="input input-sm input-center"
              style={{ width: '8ch' }}
              value={max}
              onChange={(e) => setMax(e.target.value)}
              aria-label="Valor máximo que se puede teclear"
            />
            <span className="t-sm t-tertiary">{unit}</span>
          </div>
        </Field>
      </form>
    </Modal>
  );
};

const Lamina = ({
  onElegir,
  onCoger,
  tipos,
  balda = [],
  sinCupo = null,
  inline = false,
  onNuevaMedida = null,
}) => (
  <div className={`selector${inline ? ' is-inline' : ''}`}>
    <div className="selector-cab">
      <span className="selector-tit">¿Qué quieres preguntar?</span>
      <span className="selector-sub">Empieza por lo que quieres saber.</span>
    </div>

    <div className="selector-grupos">
      {FAMILIAS.filter((fam) => tiposDe(fam.id).some((t) => tipos.includes(t.id))).map((fam) => (
        <div className="selector-col" key={fam.id}>
          <span className="selector-rot">
            <span className="disco-fam" data-tono={fam.tono} aria-hidden="true" />
            {fam.rot}
          </span>
          {/* Silenciosas: icono y palabra, sin cajas. Una rejilla de botones
              convierte una elección en un panel de mandos. */}
          {tiposDe(fam.id)
            .filter((t) => tipos.includes(t.id))
            .map((t) => {
            const Icono = ICONO[t.icono] || Text;
            return (
              <button
                key={t.id}
                type="button"
                className="tipo-suelto"
                disabled={Boolean(sinCupo) && fam.id === 'pregunta'}
                onClick={() => onElegir(t.id)}
              >
                <Icono size={15} aria-hidden="true" />
                <span className="tipo-nom">{t.label}</span>
                {t.cae !== 'respuesta' && t.cae !== 'nada' && (
                  <span className="tipo-cae">{destinoById(t.cae).dice}</span>
                )}
              </button>
            );
          })}
          <span className="tipo-hint">{sinCupo && fam.id === 'pregunta' ? sinCupo : fam.hint}</span>
        </div>
      ))}

      {/*
        LA ESTANTERÍA. El catálogo de este momento —las preguntas que la
        aplicación ya trae escritas y con su serie— servido como elementos que
        se cogen. Antes era un cajón de interruptores en otra pantalla: se podían
        ENCENDER y no tocar. Aquí se coge una y ya es tuya —renómbrala, cámbiale
        la escala, ponle una regla— y su serie no se parte, porque conserva de
        dónde salió.
      */}
      {balda.filter((e) => e.tipo !== 'medida').length > 0 && (
        <div className="selector-col">
          <span className="selector-rot">
            <span className="disco-fam" data-tono="pregunta" aria-hidden="true" />
            Las de siempre
          </span>
          {balda
            .filter((e) => e.tipo !== 'medida')
            .map((e) => (
              <button key={e.origen} type="button" className="tipo-suelto" onClick={() => onCoger(e)}>
                <ListChecks size={15} aria-hidden="true" />
                <span className="tipo-nom">{e.enun}</span>
              </button>
            ))}
          <span className="tipo-hint">Cógela y es tuya: puedes cambiarle lo que quieras.</span>
        </div>
      )}

      {/*
        ══ Y TU VOCABULARIO DE MEDIDAS ═══════════════════════════════════════

        En su propia columna y no mezcladas con las preguntas, porque no son lo
        mismo y el producto lleva toda esta ronda haciendo esa distinción: una
        pregunta es una opinión con forma de número y una medida es un número
        con unidad tomado con un aparato. Mezcladas, «Glucosa en ayunas» se
        leería como una escala del 1 al 10 más.

        Cada una dice SU unidad en la propia balda, que es lo que la distingue de
        un vistazo. Y el verbo de crear vive aquí, donde se ve lo que falta —la
        gramática del §5.8—: crear una medida es escribir una palabra en tu
        vocabulario, no configurar nada.
      */}
      {onNuevaMedida && (
        <div className="selector-col">
          <span className="selector-rot">
            <span className="disco-fam" data-tono="oficio" aria-hidden="true" />
            Lo que se mide
          </span>
          {balda
            .filter((e) => e.tipo === 'medida')
            .map((e) => (
              <button key={e.origen} type="button" className="tipo-suelto" onClick={() => onCoger(e)}>
                <Ruler size={15} aria-hidden="true" />
                <span className="tipo-nom">{e.enun}</span>
                {e.unidad && <span className="tipo-cae">{e.unidad}</span>}
              </button>
            ))}
          <button type="button" className="tipo-suelto" onClick={onNuevaMedida}>
            <Plus size={15} aria-hidden="true" />
            <span className="tipo-nom">Nueva medida</span>
          </button>
          <span className="tipo-hint">
            Un número con unidad, tomado con un aparato. Vale para todos tus clientes.
          </span>
        </div>
      )}
    </div>
  </div>
);

// ══ Un renglón del lienzo ══════════════════════════════════════════════════

const Renglon = ({ elem, elementos, tocado, onTocar, onCambiar, onQuitar, onSubir, onBajar }) => {
  const Icono = iconoDe(elem.tipo);
  const tipo = tipoById(elem.tipo);
  const cae = destinoById(elem.cae);
  const frase = fraseDeRegla(elem, elementos);
  const esEstructura = tipo?.fam === 'estructura';

  return (
    <div className="renglon-libre">
      {/* Pinchar cualquier hueco de la tarjeta la deja tocada, y con ella sus
          ajustes en el carril. Ya no ALTERNA: con el texto dentro, un segundo
          clic para escribir apagaba el carril justo cuando se necesitaba. */}
      <div
        className={`q-card es-libre${tocado ? ' is-tocada' : ''}`}
        onClick={onTocar}
      >
        <div className="q-libre-cab">
          <GripVertical size={15} className="q-asa" aria-hidden="true" />

          {/*
            ── EL ENUNCIADO SE ESCRIBE DONDE SE LEE ─────────────────────────
            Se escribía en el carril de la derecha, en un campo de una línea de
            240 px, mientras el texto salía a la izquierda: la vista iba y venía
            entre las dos columnas por cada palabra, y un enunciado de más de
            seis se leía por una ventanita que se desplazaba sola.

            Aquí es el mismo texto del renglón, editable en sitio y partiendo la
            línea cuando hace falta (ver `TextoEnSitio`). El carril se queda con
            lo que NO es texto, que es lo que un panel de ajustes sabe hacer.
          */}
          <div className="q-cuerpo es-escrito">
            <span className="q-glifo" data-tono={tipo?.fam}>
              <Icono size={15} aria-hidden="true" />
            </span>
            <span className="q-texto">
              <span className="q-titulo-linea">
                <TextoEnSitio
                  className="es-titulo"
                  value={elem.enun}
                  maxLength={MAX_ENUN}
                  placeholder={tipo?.label}
                  aria-label={elem.tipo === 'nota' ? 'El texto' : 'Enunciado'}
                  onFocus={onTocar}
                  onChange={(enun) => onCambiar({ enun })}
                />
                {elem.oblig && (
                  <span className="q-oblig-marca" aria-label="obligatoria">
                    *
                  </span>
                )}
              </span>

              {/* La ayuda solo se ofrece cuando la tarjeta está tocada: en
                  reposo, un campo vacío por renglón es mobiliario. Si tiene
                  algo escrito, se queda siempre — eso ya es un hecho. */}
              {elem.tipo !== 'nota' && (tocado || elem.ayuda) && (
                <TextoEnSitio
                  className="es-ayuda"
                  value={elem.ayuda}
                  maxLength={MAX_AYUDA}
                  placeholder="Una línea de ayuda debajo. Opcional."
                  aria-label="Ayuda"
                  onFocus={onTocar}
                  onChange={(ayuda) => onCambiar({ ayuda })}
                />
              )}
            </span>
          </div>

          {!esEstructura && <span className="q-donde">{cae.dice}</span>}

          <span className="q-orden">
            <button type="button" className="btn btn-icon btn-sm" onClick={onSubir} aria-label="Subir">
              <ChevronUp size={13} />
            </button>
            <button type="button" className="btn btn-icon btn-sm" onClick={onBajar} aria-label="Bajar">
              <ChevronDown size={13} />
            </button>
          </span>

          <button
            type="button"
            className="btn btn-icon btn-sm q-quitar"
            /* Sin burbujear: la tarjeta entera selecciona al pincharla, y tirar
               una y seleccionarla en el mismo clic deja el carril apuntando a
               algo que ya no existe. */
            onClick={(e) => {
              e.stopPropagation();
              onQuitar();
            }}
            aria-label={`Quitar «${elem.enun}»`}
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* EL CONTROL DE VERDAD, DENTRO DEL RENGLÓN. Es lo que hace que el
            lienzo se lea como el formulario y no como su índice. */}
        {/*
          EL CONTROL DE VERDAD, DENTRO DEL RENGLÓN.

          Sin enunciado ni ayuda: los pone la cabecera de arriba y repetirlos
          daría dos títulos por tarjeta. Y sin `elementos`, que no es un
          descuido: con ellos, `CampoLibre` pinta la frase de la regla como
          pista del campo y la tarjeta la diría dos veces —una dentro y otra en
          el renglón gris de abajo—.
        */}
        {!esEstructura && (
          <div className="q-libre-control">
            <CampoLibre elem={{ ...elem, enun: '', ayuda: '' }} soloLectura />
          </div>
        )}
      </div>

      {frase && (
        <p className="regla-frase">
          <CornerDownRight size={13} aria-hidden="true" />
          {frase}
        </p>
      )}
    </div>
  );
};

// ══ El carril: los ajustes del elemento tocado ═════════════════════════════

const Opciones = ({ elem, onCambiar }) => {
  const ops = elem.ops || [];
  return (
    <div className="col gap-2">
      <span className="ajustes-rot">Opciones</span>
      {/* La clave es la POSICIÓN, no el texto. Con el texto dentro, cada letra
          cambiaba la clave, React desmontaba el campo y lo volvía a montar, y el
          foco se perdía: solo se podía escribir una letra por clic. Las opciones
          no se reordenan, así que la posición las identifica bien. */}
      {ops.map((op, i) => (
        <div className="row gap-2" key={i}>
          <TextInput
            value={op}
            aria-label={`Opción ${i + 1}`}
            onChange={(v) => onCambiar({ ops: ops.map((o, j) => (j === i ? v : o)) })}
          />
          <button
            type="button"
            className="btn btn-icon btn-sm"
            aria-label={`Quitar «${op}»`}
            /* Con una sola opción no se puede quitar: una elección sin nada que
               elegir es un hueco, y el saneado le devolvería las de fábrica. */
            disabled={ops.length <= 1}
            onClick={() => onCambiar({ ops: ops.filter((_, j) => j !== i) })}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      {ops.length < MAX_OPCIONES && (
        <BotonMas palabra="opción" onClick={() => onCambiar({ ops: [...ops, `Opción ${ops.length + 1}`] })} />
      )}
    </div>
  );
};

const Regla = ({ elem, elementos, onCambiar }) => {
  const candidatos = candidatosDeRegla(elementos, elem.id);

  if (candidatos.length === 0) {
    return (
      <p className="ajustes-nada">
        Se la enseñas siempre. Para condicionarla, tiene que haber antes una pregunta de sí/no,
        de elegir una o de escala.
      </p>
    );
  }

  if (!elem.regla) {
    return (
      <BotonMas
        palabra="regla"
        title="Enseñarla solo si antes contestó algo"
        onClick={() => onCambiar({ regla: reglaPorDefecto(candidatos[candidatos.length - 1]) })}
      />
    );
  }

  const de = elementos.find((e) => e.id === elem.regla.de);
  const opciones = de?.tipo === 'sino' ? ['si', 'no'] : de?.tipo === 'una' ? de.ops || [] : null;

  return (
    <div className="col gap-2">
      {/* La regla se escribe como se lee, no como tres desplegables sueltos: los
          mandos van EN la frase. */}
      <p className="regla-editor">
        Enséñasela solo si
        <select
          className="select select-sm"
          aria-label="La pregunta de la que depende"
          value={elem.regla.de}
          onChange={(e) => {
            const nuevo = elementos.find((x) => x.id === e.target.value);
            onCambiar({ regla: reglaPorDefecto(nuevo) });
          }}
        >
          {candidatos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.enun}
            </option>
          ))}
        </select>
        <select
          className="select select-sm"
          aria-label="La comparación"
          value={elem.regla.op}
          onChange={(e) => onCambiar({ regla: { ...elem.regla, op: e.target.value } })}
        >
          {opciones ? (
            <>
              <option value="es">es</option>
              <option value="noEs">no es</option>
            </>
          ) : (
            <>
              <option value="mayorQue">es mayor que</option>
              <option value="menorQue">es menor que</option>
              <option value="es">es exactamente</option>
            </>
          )}
        </select>
        {opciones ? (
          <select
            className="select select-sm"
            aria-label="El valor"
            value={elem.regla.valor}
            onChange={(e) => onCambiar({ regla: { ...elem.regla, valor: e.target.value } })}
          >
            {opciones.map((o) => (
              <option key={o} value={o}>
                {valorLegible(o)}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="input input-sm input-corto"
            aria-label="El valor"
            value={elem.regla.valor}
            onChange={(e) => onCambiar({ regla: { ...elem.regla, valor: e.target.value } })}
          />
        )}
      </p>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onCambiar({ regla: null })}
      >
        Quitar la regla
      </button>
    </div>
  );
};

/* Qué lámina le toca a cada pieza del oficio. `TIPOS` ya declaraba `guia: true`
   en las dos, pero este constructor no enseñaba ninguna: la marca estaba puesta
   y no la leía nadie. */
const GUIA_DE = { perimetros: 'cinta', pliegues: 'pliegue' };

const Carril = ({ elem, elementos, onCambiar, onGuia }) => {
  if (!elem) {
    return (
      <aside className="ajustes-pregunta">
        <span className="ajustes-rot">Los ajustes</span>
        <p className="ajustes-nada">Toca un elemento del formulario para cambiarlo.</p>
      </aside>
    );
  }

  const tipo = tipoById(elem.tipo);
  const cae = destinoById(elem.cae);
  const esEstructura = tipo?.fam === 'estructura';
  const Icono = iconoDe(elem.tipo);

  return (
    <aside className="ajustes-pregunta">
      {/* La misma cabecera que el otro constructor: el azulejo del renglón que
          acabas de tocar, para que el carril se lea como su continuación. El
          glifo toma el matiz de su familia igual que en el lienzo. */}
      <div className="carril-cab">
        <span className="q-glifo" data-tono={tipo?.fam}>
          <Icono size={15} aria-hidden="true" />
        </span>
        <span className="ajustes-cual">
          <b>{tipo?.label}</b>
          <span>{esEstructura ? 'No pregunta nada' : cae.largo}</span>
        </span>
      </div>

      {/*
        Aquí NO se escribe el enunciado ni la ayuda: son texto, se leen en el
        renglón y se escriben en el renglón (ver `Renglon`). Lo que queda en el
        carril es lo que un panel de ajustes sabe hacer de verdad —opciones,
        rangos, unidades, la regla—, y por eso cabe en una columna estrecha.
      */}
      {(elem.tipo === 'una' || elem.tipo === 'varias') && (
        <Opciones elem={elem} onCambiar={onCambiar} />
      )}

      {elem.tipo === 'escala' &&
        /*
          ── EL RANGO NO SE TOCA CUANDO LO MANDA EL INSTRUMENTO ─────────────
          Una escala del catálogo que se contesta con estrellas, caras o el
          depósito tiene CINCO pasos porque el instrumento tiene cinco: diez
          estrellas no son una escala más fina, son precisión falsa. El mando
          «De cuánto a cuánto» aquí no habría sido un ajuste, habría sido la
          forma de romperlo — y además partiría la serie, porque lo ya contestado
          está en escala de 5 (migración 0120).

          Se DICE en vez de pintar dos segmentados que no se pueden pulsar, que
          es el mismo criterio que ya usan la medida de aquí al lado y la
          pregunta de catálogo del otro constructor.
        */
        (catalogQuestionById(elem.origen)?.instrumento ? (
          <p className="ajustes-nota">
            Se contesta con {INSTRUMENTOS[catalogQuestionById(elem.origen).instrumento].frase}, así que
            su escala viene puesta: es la misma en todos tus clientes y es la que tienen las
            respuestas ya dadas. Puedes moverla de sitio, cambiarle el texto o quitarla.
          </p>
        ) : (
          <>
            <Field label="De cuánto a cuánto">
              <div className="row gap-2">
                <SegmentedControl
                  label="Desde"
                  value={elem.min}
                  onChange={(min) => onCambiar({ min })}
                  options={[ESCALA_MIN, 1].map((n) => ({ id: n, label: String(n) }))}
                />
                <SegmentedControl
                  label="Hasta"
                  value={elem.max}
                  onChange={(max) => onCambiar({ max })}
                  options={[5, ESCALA_MAX].map((n) => ({ id: n, label: String(n) }))}
                />
              </div>
            </Field>
            <Switch
              label="Menos es mejor"
              hint="Para el dolor o el hambre: así la serie se lee al derecho."
              checked={elem.mejorAbajo}
              onChange={(v) => onCambiar({ mejorAbajo: v })}
            />
          </>
        ))}

      {(elem.tipo === 'numero' || elem.tipo === 'peso') && (
        <Field label="Unidad" hint="Sale a la derecha del campo.">
          {(props) => (
            <TextInput
              {...props}
              value={elem.unidad}
              placeholder="kg"
              onChange={(v) => onCambiar({ unidad: v })}
            />
          )}
        </Field>
      )}

      {/*
        Una medida no se edita aquí: su unidad, sus decimales y su rango son de
        la DEFINICIÓN, y son los mismos para todos tus clientes —esa es la razón
        de que exista un vocabulario y no un campo suelto por formulario—. Lo que
        se decide en el lienzo es si se pide y si es obligatoria. Se dice, en vez
        de pintar campos que no se pueden tocar.
      */}
      {elem.tipo === 'medida' && (
        <p className="ajustes-nota">
          Se apunta en {elem.unidad || 'su unidad'}, tal como está definida. Para cambiarle la
          unidad o los decimales, edita la medida en la Librería: vale para todos tus clientes.
        </p>
      )}

      {/* Cuántas veces a la semana se pesa. Estaba en el protocolo, en otra
          pantalla, y es una propiedad de lo que se le pide: es lo que hace
          fiable la media de la semana. */}
      {elem.tipo === 'peso' && (
        <Field label="Cuántas veces a la semana" hint="Es lo que hace fiable la media.">
          <SegmentedControl
            label="Pesajes que le pides a la semana"
            value={elem.veces || 1}
            onChange={(veces) => onCambiar({ veces })}
            options={Array.from({ length: MAX_VECES }, (_, i) => ({ id: i + 1, label: String(i + 1) }))}
          />
        </Field>
      )}

      {/* La guía va donde se pide la medida, que es aquí. Sin ella pedíamos seis
          pliegues y nueve perímetros sin explicar ni uno. */}
      {GUIA_DE[elem.tipo] && (
        <button
          type="button"
          className="btn btn-secondary btn-sm guia-enlace"
          onClick={() => onGuia(GUIA_DE[elem.tipo])}
        >
          <Ruler size={15} /> {GUIAS[GUIA_DE[elem.tipo]].titulo}
        </button>
      )}

      {!esEstructura && (
        <Switch
          label="Obligatoria"
          hint="No puede entregarlo sin contestarla."
          checked={elem.oblig}
          onChange={(v) => onCambiar({ oblig: v })}
        />
      )}

      {!esEstructura && (
        <div className="col gap-2">
          <span className="ajustes-rot">Regla</span>
          <Regla elem={elem} elementos={elementos} onCambiar={onCambiar} />
        </div>
      )}
    </aside>
  );
};

// ══ La pantalla ════════════════════════════════════════════════════════════

export const ConstructorLibre = ({
  form,
  elementos,
  /* El vocabulario de medidas del entrenador: de él sale la balda de medidas
     del check-in. Sin él, la estantería es la de siempre. */
  medidas = [],
  /* Escribir una medida nueva en el vocabulario del entrenador. Sin esto, la
     balda solo ofrece lo que ya tiene y no hay verbo para crear. */
  onNuevaMedida = null,
  onChange,
  onVolver,
  onMandar = null,
}) => {
  const [tocado, setTocado] = useState(null);
  const [anadiendo, setAnadiendo] = useState(false);
  const [creandoMedida, setCreandoMedida] = useState(false);
  /* El ensayo: contestar el formulario entero antes de mandárselo a nadie. */
  const [ensayando, setEnsayando] = useState(false);
  /* Qué lámina de medición está abierta: `null`, `'cinta'` o `'pliegue'`. */
  const [guia, setGuia] = useState(null);

  /*
    Los elementos los pone quien llama, no el formulario: un suelto los guarda
    tal cual y los del protocolo se leen del modelo viejo con `elementosDe`.
    Eso es lo que permite que este sea EL constructor de los tres sin saber en
    qué forma se guarda cada uno (ver `desdeElementos`).
  */
  const elem = elementos.find((e) => e.id === tocado) || null;

  /* Qué se puede meter en ESTE formulario. El parte y el check-in guardan
     escala o texto, así que ofrecerles «Elegir una» sería perder las opciones
     al guardar sin decirlo. */
  const tipos = tiposDeMomento(form.momento || 'libre');

  /* Las medidas son del CHECK-IN y de ningún otro momento: son lo que se toma en
     la revisión de la semana, y el parte de una sesión no mide nada. Sin verbo
     para guardarlas tampoco se ofrece crear ninguna. */
  const puedeMedir = tipos.includes('medida') && Boolean(onNuevaMedida);

  /*
    El parte y el check-in guardan seis preguntas propias como mucho
    (`MAX_CUSTOM`), y el saneado tira las que sobren: sin este tope, la séptima
    se escribía en el lienzo y desaparecía al recargar. Las del catálogo no
    cuentan, ni siquiera retocadas — su id sigue siendo el suyo.
  */
  const propias = elementos.filter(
    (e) => !e.origen && tipoById(e.tipo)?.fam === 'pregunta'
  ).length;
  const sinCupo =
    form.momento !== 'libre' && propias >= MAX_PROPIAS
      ? `El tope son ${MAX_PROPIAS} preguntas tuyas en este formulario.`
      : null;

  /* Lo que queda en la estantería: lo del catálogo de este momento que no esté
     ya en el lienzo. Comparar por `origen` y no por id es lo que evita ofrecer
     dos veces la misma pregunta con dos identidades. */
  const puestos = new Set(elementos.map((e) => e.origen).filter(Boolean));
  const balda = estanteria(form.momento || 'libre', medidas).filter((e) => !puestos.has(e.origen));

  const cambiar = (patch) => onChange(editarElemento(elementos, tocado, patch));

  const anadir = (tipo) => {
    const siguiente = anadirElemento(elementos, tipo);
    onChange(siguiente);
    /* Se queda tocado el recién puesto: lo primero que se hace después de
       añadir es escribir su enunciado, y el carril ya está en ello. */
    setTocado(siguiente[siguiente.length - 1]?.id || null);
    setAnadiendo(false);
  };

  const coger = (elem) => {
    if (elementos.length >= MAX_ELEMENTOS) return;
    onChange([...elementos, elem]);
    setTocado(elem.id);
    setAnadiendo(false);
  };

  const quitar = (id) => {
    onChange(quitarElemento(elementos, id));
    if (tocado === id) setTocado(null);
  };

  const mover = (id, dir) => onChange(moverElemento(elementos, id, dir));

  const lleno = elementos.length >= MAX_ELEMENTOS;

  return (
    <div className="constructor">
      <header className="cartera-cab cinta-pagina">
        <div className="cartera-cab-in">
          <div className="cartera-cab-linea">
            {/* Aquí estuvo el mando del ancho. Vive ahora en la fila de la marca
                  de la barra lateral, montado una sola vez para toda la
                  aplicación. Ver `ui/Pliegue`. */}
            <button
              type="button"
              className="cab-volver"
              onClick={onVolver}
              aria-label="Volver a los formularios"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="cartera-cab-titulo">{form.name}</h1>
            <span className="badge badge-info">
              {cuentaElementos(elementos)} {cuentaElementos(elementos) === 1 ? 'elemento' : 'elementos'}
            </span>
            <div className="cartera-cab-acciones">
              {/*
                Contestarlo tú, con lo que verá él. Aquí hubo un «Ver como
                cliente» que saltaba a su portal, y allí un formulario solo
                aparece si está pendiente para esa persona: lo que acabas de
                montar era justo lo que no se podía ver. Ver
                `VistaPreviaFormulario`.
              */}
              <button type="button" className="cab-accion" onClick={() => setEnsayando(true)}>
                <Eye size={15} aria-hidden="true" />
                <span>Verlo como cliente</span>
              </button>
              {onMandar && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onMandar}
                  disabled={cuentaElementos(elementos) === 0}
                >
                  <Send size={15} aria-hidden="true" />
                  <span>Mandarlo</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="constructor-cuerpo">
        <div className="lienzo">
          {elementos.length === 0 ? (
            <Lamina
              onElegir={anadir}
              onCoger={coger}
              tipos={tipos}
              balda={balda}
              sinCupo={sinCupo}
              onNuevaMedida={puedeMedir ? () => setCreandoMedida(true) : null}
              inline
            />
          ) : (
            <>
              {elementos.map((e) => (
                <Renglon
                  key={e.id}
                  elem={e}
                  elementos={elementos}
                  tocado={tocado === e.id}
                  onTocar={() => setTocado(e.id)}
                  onCambiar={(patch) => onChange(editarElemento(elementos, e.id, patch))}
                  onQuitar={() => quitar(e.id)}
                  onSubir={() => mover(e.id, 'up')}
                  onBajar={() => mover(e.id, 'down')}
                />
              ))}

              {/* El verbo, con su sustantivo: «Añadir» a secas obligaba a mirar
                  arriba para saber qué se añadía, y el constructor de al lado
                  —el del protocolo— decía «Añadir pregunta». Un gesto, un
                  nombre. Ver `docs/producto.md` §5.8.

                  Y el tope deja de disfrazarse de verbo apagado: un botón que
                  dice «El tope son 30 elementos» es un aviso dentro de un
                  control, y en reposo no está (ver la ley del reposo). */}
              {lleno ? (
                <p className="ajustes-nada">El tope son {MAX_ELEMENTOS} elementos.</p>
              ) : (
                <BotonMas palabra="pregunta" onClick={() => setAnadiendo(true)} />
              )}
            </>
          )}
        </div>

        <Carril elem={elem} elementos={elementos} onCambiar={cambiar} onGuia={setGuia} />
      </div>

      <Modal open={anadiendo} onClose={() => setAnadiendo(false)} size="lg" title="Añadir">
        <Lamina
          onElegir={anadir}
          onCoger={coger}
          tipos={tipos}
          balda={balda}
          sinCupo={sinCupo}
          onNuevaMedida={puedeMedir ? () => setCreandoMedida(true) : null}
        />
      </Modal>

      {/* Escribir una palabra en tu vocabulario de medidas. Se guarda en tus
          preferencias —vale para todos tus clientes— y entra en el lienzo en el
          mismo gesto: crear algo que hay que ir a buscar después es medio gesto. */}
      {creandoMedida && (
        <NuevaMedida
          onCerrar={() => setCreandoMedida(false)}
          onGuardar={(medida) => {
            setCreandoMedida(false);
            onNuevaMedida?.(medida);
            coger(medidaComoElemento(medida));
          }}
        />
      )}

      {/* El ensayo, con el lienzo TAL Y COMO ESTÁ: no lo guardado, sino lo que
          hay delante. Mirar cómo queda una pregunta que acabas de escribir no
          puede pedirte que guardes primero. */}
      {ensayando && (
        <VistaPreviaFormulario
          form={form}
          elementos={elementos}
          /* El vocabulario de medidas: el check-in se ensaya con el asistente de
             verdad, y él lee la unidad y los decimales del catálogo. */
          medidas={medidas}
          onCerrar={() => setEnsayando(false)}
        />
      )}

      {guia && (
        <Modal size="lg" title={GUIAS[guia].titulo} onClose={() => setGuia(null)}>
          <p className="guia-lema">{GUIAS[guia].lema}</p>
          <div className="guia-regla" aria-hidden="true" />
          <GuiaDeMedidas que={guia} />
        </Modal>
      )}
    </div>
  );
};
