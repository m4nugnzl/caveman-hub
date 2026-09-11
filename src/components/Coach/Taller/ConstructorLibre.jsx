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
import { estanteria, tiposDeMomento } from '@/domain/formularios';
import { MAX_CUSTOM as MAX_PROPIAS, WEIGH_INS_MAX as MAX_VECES } from '@/domain/protocol';
import {
  Field,
  SegmentedControl,
  Switch,
  TextInput,
  TextoEnSitio,
} from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { Pliegue } from '@/components/ui/Pliegue';
/* El control del cliente, tal cual. Ver el porqué en `CampoLibre`. */
import { CampoLibre } from '@/components/Client/CampoLibre';
import { GUIAS, GuiaDeMedidas } from './GuiaDeMedidas';

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

const Lamina = ({ onElegir, onCoger, tipos, balda = [], sinCupo = null, inline = false }) => (
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
      {balda.length > 0 && (
        <div className="selector-col">
          <span className="selector-rot">
            <span className="disco-fam" data-tono="pregunta" aria-hidden="true" />
            Las de siempre
          </span>
          {balda.map((e) => (
            <button key={e.origen} type="button" className="tipo-suelto" onClick={() => onCoger(e)}>
              <ListChecks size={15} aria-hidden="true" />
              <span className="tipo-nom">{e.enun}</span>
            </button>
          ))}
          <span className="tipo-hint">Cógela y es tuya: puedes cambiarle lo que quieras.</span>
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
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onCambiar({ ops: [...ops, `Opción ${ops.length + 1}`] })}
        >
          <Plus size={13} /> Otra opción
        </button>
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
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onCambiar({ regla: reglaPorDefecto(candidatos[candidatos.length - 1]) })}
      >
        <Plus size={13} /> Ponerle una regla
      </button>
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

      {elem.tipo === 'escala' && (
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
      )}

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
  onChange,
  onVolver,
  onMandar = null,
  onVerComoCliente = null,
}) => {
  const [tocado, setTocado] = useState(null);
  const [anadiendo, setAnadiendo] = useState(false);
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
  const balda = estanteria(form.momento || 'libre').filter((e) => !puestos.has(e.origen));

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
            {/* El mando del ancho, en la calle del chasis: el mismo botón y el
                mismo punto que en las demás cintas — un constructor es una
                pantalla más, y de las que agradecen el ancho. Ver `ui/Pliegue`. */}
            <Pliegue />
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
              {/* Verlo en el portal de verdad, que es donde se contesta. Lo
                  tenía el editor de los cuestionarios del protocolo y se
                  conserva al pasar por aquí. */}
              {onVerComoCliente && (
                <button type="button" className="cab-accion" onClick={onVerComoCliente}>
                  <Eye size={15} aria-hidden="true" />
                  <span>Ver como cliente</span>
                </button>
              )}
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

              <button
                type="button"
                className="btn btn-secondary anadir-pregunta"
                onClick={() => setAnadiendo(true)}
                disabled={lleno}
              >
                <Plus size={15} />
                {lleno ? `El tope son ${MAX_ELEMENTOS} elementos` : 'Añadir'}
              </button>
            </>
          )}
        </div>

        <Carril elem={elem} elementos={elementos} onCambiar={cambiar} onGuia={setGuia} />
      </div>

      <Modal open={anadiendo} onClose={() => setAnadiendo(false)} size="lg" title="Añadir">
        <Lamina onElegir={anadir} onCoger={coger} tipos={tipos} balda={balda} sinCupo={sinCupo} />
      </Modal>

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
