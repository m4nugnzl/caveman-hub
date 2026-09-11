import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CircleDot,
  CornerDownRight,
  Eye,
  GripVertical,
  Hash,
  HeartPulse,
  ListChecks,
  Plus,
  Ruler,
  Scale,
  SlidersHorizontal,
  Text,
  ToggleLeft,
  Trash2,
} from 'lucide-react';

import {
  CUSTOM_KINDS,
  MAX_CUSTOM,
  MAX_LABEL,
  addCustom,
  isRequired,
  removeCustom,
  toggleAsked,
  toggleRequired,
} from '@/domain/intakeForm';
import {
  MAX_CUSTOM_PREGUNTAS,
  anadirPropia,
  momentoById,
  moverPregunta,
  preguntasDe,
  preguntasLibres,
  quitarPropia,
  resumenFormulario,
  togglePregunta,
} from '@/domain/formularios';
import { CHECKIN_MODES, WEIGH_INS_MAX } from '@/domain/protocol';
import { PROFILE_FIELDS, PROFILE_GROUPS, fieldById } from '@/domain/profile';
import { SCOFF_QUESTIONS } from '@/domain/scoff';
import { FOLDS_LABELS, PERIMETER_LABELS } from '@/domain/anthropometry';
import { Field, SegmentedControl, Switch, TextInput } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { Pliegue } from '@/components/ui/Pliegue';
/* Los controles del cliente, tal cual. Ver el porqué en el carril, más abajo. */
import { Pregunta } from '@/components/Client/IntakeQuestions';
import { SessionFeedback } from '@/components/Coach/Workout/SessionFeedback';
import { GUIAS, GuiaDeMedidas, guiaById } from './GuiaDeMedidas';

/**
 * EL CONSTRUCTOR: un formulario se dibuja como se va a ver, no como un ajuste.
 *
 * ══ La gramática es la de Efort, y no la de Coachway ═══════════════════════
 *
 *   · **No hay paleta.** El lienzo es el formulario. Añadir abre un SELECTOR
 *     —«¿Qué quieres preguntar? Empieza por lo que quieres saber»— que en el
 *     formulario vacío ocupa la pantalla entera.
 *   · **A la derecha, los ajustes de LA pregunta tocada**, con el control real
 *     del cliente encima.
 *   · **La tarjeta lleva sus gestos en el canto.**
 *
 * ══ Y ahora sirve para LOS TRES cuestionarios ══════════════════════════════
 *
 * Antes solo editaba el alta, y los otros dos —el parte de la sesión y el
 * check-in de la semana— se tocaban en otra pantalla, con otro editor: una lista
 * de casillas con flechitas de subir y bajar. Tres cuestionarios, dos gramáticas,
 * dos sitios.
 *
 * Aquí es UN constructor que recibe su vocabulario del momento del formulario:
 *
 *   | Momento        | Catálogo            | Enchufes                        |
 *   |----------------|---------------------|---------------------------------|
 *   | Al entrar      | los 19 de la ficha  | partida · medidas · salud · TCA |
 *   | Tras entrenar  | SESSION_QUESTIONS   | ninguno                         |
 *   | Cada semana    | CHECKIN_QUESTIONS   | peso · perímetros · pliegues · fotos |
 *
 * ══ Los bloques del check-in son ENCHUFES, que es lo que siempre fueron ════
 *
 * Vivían en `CheckinBlocksSection`, dentro del protocolo, como un mando de tres
 * posiciones. Pero un perímetro no es un ajuste: es una pieza que se pide en el
 * mismo momento en que se pregunta y que **dice a dónde cae** lo que se conteste
 * —a su antropometría—, que es exactamente la definición de enchufe que este
 * constructor ya usaba para las medidas de partida del alta.
 *
 * Sus tres estados no se pierden: apagado es no estar en el lienzo, y
 * obligatorio/opcional es un mando en el carril.
 *
 * ══ Y cada medida lleva su GUÍA ════════════════════════════════════════════
 *
 * Pedíamos nueve perímetros y seis pliegues sin explicar ni uno, y los pliegues
 * ni siquiera tenían lámina. Cada enchufe declara ahora CUÁL es su guía —`cinta`
 * o `pliegue`— y son dos láminas del mismo cuerpo. Ver `GuiaDeMedidas`.
 */

/* Los enchufes del ALTA: piezas de la ficha que se encienden enteras. */
const ENCHUFES_ALTA = [
  {
    id: 'askBasics',
    label: 'Datos de partida',
    icon: Scale,
    dice: 'Edad, altura y peso del día 0',
    donde: 'A su ficha y su primer pesaje',
  },
  {
    id: 'askMeasures',
    label: 'Medidas de partida',
    icon: Ruler,
    dice: 'Los perímetros con los que empieza',
    donde: 'A su antropometría',
    guia: 'cinta',
  },
  {
    id: 'askHealth',
    label: 'Su salud',
    icon: HeartPulse,
    dice: 'Lesiones, operaciones, lo que le limita',
    donde: 'A sus condicionantes',
  },
  {
    id: 'askScreening',
    label: 'Cribado TCA',
    icon: ListChecks,
    dice: 'Cinco preguntas validadas (SCOFF)',
    donde: 'El resultado, solo tú',
  },
];

/*
  Los enchufes de la SEMANA vivían aquí y ya no: el parte y el check-in se editan
  con `ConstructorLibre`, donde sus piezas son elementos del oficio con su mando
  dentro (ver `tiposDeMomento` y `desdeElementos`). Este constructor edita SOLO
  el alta, cuyo modelo son campos de perfil y no preguntas.

  Lo que queda de aquella época son las ramas `esAlta ? … : …` repartidas por el
  fichero: hoy no las recorre nadie. Se retiran cuando el alta tenga también su
  puente, para no hacer cirugía en el único editor vivo del cuestionario de
  entrada mientras tanto.
*/

const ICONO_TIPO = { text: Text, number: Hash, yesno: ToggleLeft, choice: CircleDot };

const TIPO = {
  text: 'Texto',
  number: 'Un número',
  yesno: 'Sí o no',
  choice: 'Una respuesta',
  list: 'Una lista',
  scale: 'Escala',
};

/** Cómo se dice una pregunta de escala, con su rango. */
const diceEscala = (q) =>
  q.kind === 'scale'
    ? `Escala ${q.min ?? 1}–${q.max ?? 10}${q.lowerIsBetter ? ' · menos es mejor' : ''}`
    : 'Texto libre · no se puede medir';

export const ConstructorFormulario = ({ form, onChange, onVolver, onVerComoCliente }) => {
  const momento = form.momento || 'alta';
  const esAlta = momento === 'alta';

  const [tocada, setTocada] = useState(null);
  const [anadiendo, setAnadiendo] = useState(false);
  /* Qué guía está abierta: `null`, `'cinta'` o `'pliegue'`. Era un booleano
     cuando solo había una lámina. */
  const [guia, setGuia] = useState(null);

  const asked = useMemo(() => new Set(form.asked || []), [form.asked]);
  const preguntas = useMemo(() => preguntasDe(form), [form]);
  const enchufes = esAlta ? ENCHUFES_ALTA : [];
  const puestos = enchufes.filter((e) => (esAlta ? form[e.id] : e.puesto(form)));

  const vacio = esAlta
    ? (form.asked || []).length === 0 && (form.custom || []).length === 0
    : preguntas.length === 0 && puestos.length === 0;

  const apartados = PROFILE_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    campos: PROFILE_FIELDS.filter((f) => f.group === g.id && asked.has(f.id)),
  })).filter((a) => a.campos.length > 0);

  const seleccionada = (() => {
    if (!tocada) return null;
    if (tocada.tipo === 'custom') return (form.custom || []).find((q) => q.id === tocada.id) || null;
    if (tocada.tipo === 'field') return fieldById(tocada.id);
    if (tocada.tipo === 'pregunta') return preguntas.find((q) => q.id === tocada.id) || null;
    if (tocada.tipo === 'enchufe') return enchufes.find((e) => e.id === tocada.id) || null;
    return null;
  })();

  const quitarEnchufe = (e) => {
    onChange(esAlta ? { ...form, [e.id]: false } : e.quitar(form));
    if (tocada?.id === e.id) setTocada(null);
  };

  return (
    <div className="constructor">
      <header className="cartera-cab cinta-pagina">
        <div className="cartera-cab-in">
          <div className="cartera-cab-linea">
            {/* El mando del ancho, en la calle del chasis: el mismo botón y el
                mismo punto que en las demás cintas — un constructor es una
                pantalla más, y de las que agradecen el ancho. Ver `ui/Pliegue`. */}
            <Pliegue />
            <button type="button" className="cab-volver" onClick={onVolver} aria-label="Volver a los formularios">
              <ArrowLeft size={20} />
            </button>
            <h1 className="cartera-cab-titulo">{form.name}</h1>
            <span className="badge badge-info">
              {momentoById(momento).corto} · {resumenFormulario(form)}
            </span>
            <div className="cartera-cab-acciones">
              <button type="button" className="cab-accion" onClick={onVerComoCliente}>
                <Eye size={15} aria-hidden="true" />
                <span>Ver como cliente</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="constructor-cuerpo">
        {/* ══ EL LIENZO ═══════════════════════════════════════════════════ */}
        <div className="lienzo">
          {vacio ? (
            <Selector form={form} onChange={onChange} enchufes={enchufes} esAlta={esAlta} inline />
          ) : (
            <>
              {/* Los enchufes arriba y en su orden: no son preguntas, son piezas
                  de la ficha, y mezclarlos obligaría a leer cada tarjeta para
                  saber cuál es cuál. */}
              {puestos.map((e) => (
                <TarjetaEnchufe
                  key={e.id}
                  enchufe={e}
                  estado={esAlta ? null : estadoDe(e, form)}
                  tocada={tocada?.tipo === 'enchufe' && tocada.id === e.id}
                  onTocar={() => setTocada({ tipo: 'enchufe', id: e.id })}
                  onQuitar={() => quitarEnchufe(e)}
                />
              ))}

              {esAlta ? (
                <>
                  {apartados.map((a, i) => (
                    <section key={a.id} className="apartado">
                      <header className="apartado-cab">
                        <h2 className="apartado-tit">
                          {i + 1} · {a.label}
                        </h2>
                      </header>
                      {a.campos.map((f) => (
                        <TarjetaPregunta
                          key={f.id}
                          titulo={f.label}
                          tipo={TIPO[f.kind] || 'Texto'}
                          icono={ICONO_TIPO[f.kind] || Text}
                          obligatoria={isRequired(form, f.id)}
                          tocada={tocada?.tipo === 'field' && tocada.id === f.id}
                          onTocar={() => setTocada({ tipo: 'field', id: f.id })}
                          onQuitar={() => {
                            onChange(toggleAsked(form, f.id));
                            if (tocada?.id === f.id) setTocada(null);
                          }}
                        />
                      ))}
                    </section>
                  ))}

                  {(form.custom || []).length > 0 && (
                    <section className="apartado">
                      <header className="apartado-cab">
                        <h2 className="apartado-tit">Lo que preguntas tú</h2>
                      </header>
                      {form.custom.map((q) => (
                        <TarjetaPregunta
                          key={q.id}
                          titulo={q.label}
                          tipo={TIPO[q.kind] || 'Texto'}
                          icono={ICONO_TIPO[q.kind] || Text}
                          obligatoria={isRequired(form, q.id)}
                          tocada={tocada?.tipo === 'custom' && tocada.id === q.id}
                          onTocar={() => setTocada({ tipo: 'custom', id: q.id })}
                          onQuitar={() => {
                            onChange(removeCustom(form, q.id));
                            if (tocada?.id === q.id) setTocada(null);
                          }}
                        />
                      ))}
                    </section>
                  )}
                </>
              ) : (
                preguntas.length > 0 && (
                  <section className="apartado">
                    <header className="apartado-cab">
                      <h2 className="apartado-tit">
                        {momento === 'sesion' ? 'Lo que le preguntas al acabar' : 'Lo que la báscula no mide'}
                      </h2>
                    </header>
                    {preguntas.map((q, i) => (
                      <TarjetaPregunta
                        key={q.id}
                        titulo={q.label}
                        tipo={diceEscala(q)}
                        icono={q.kind === 'scale' ? SlidersHorizontal : Text}
                        tocada={tocada?.tipo === 'pregunta' && tocada.id === q.id}
                        onTocar={() => setTocada({ tipo: 'pregunta', id: q.id })}
                        onSubir={i > 0 ? () => onChange(moverPregunta(form, q.id, 'up')) : null}
                        onBajar={
                          i < preguntas.length - 1 ? () => onChange(moverPregunta(form, q.id, 'down')) : null
                        }
                        onQuitar={() => {
                          const propia = (form.custom || []).some((c) => c.id === q.id);
                          onChange(propia ? quitarPropia(form, q.id) : togglePregunta(form, q.id));
                          if (tocada?.id === q.id) setTocada(null);
                        }}
                      />
                    ))}
                  </section>
                )
              )}

              <button type="button" className="btn anadir-pregunta" onClick={() => setAnadiendo(true)}>
                <Plus size={15} /> Añadir pregunta
              </button>
            </>
          )}
        </div>

        {/*
          ══ EL SEGUNDO PLANO: CÓMO LA VE ÉL ══════════════════════════════════
          Lo primero del carril es el CONTROL DE VERDAD, apagado. Y es
          literalmente el del cliente —`Pregunta` de su portal para el alta,
          `SessionFeedback` para las escalas—, no un dibujo parecido: un segundo
          renderizador se queda atrás el día que se añada una clase de pregunta,
          y entonces la muestra miente, que es peor que no tenerla.

          Un enchufe no tiene control que enseñar —no es una pregunta, es una
          pieza de la ficha—, así que ahí manda su explicación y su mando.
        */}
        <aside className="ajustes-pregunta">
          {!seleccionada ? (
            <>
              <p className="ajustes-rot">Ajustes de la pregunta</p>
              <p className="ajustes-nada">
                Pulsa una pregunta del formulario para verla como la ve él y cambiar lo suyo.
              </p>
            </>
          ) : tocada.tipo === 'enchufe' ? (
            <>
              <p className="ajustes-rot">El enchufe</p>
              <AjustesEnchufe
                enchufe={seleccionada}
                form={form}
                onChange={onChange}
                esAlta={esAlta}
                onGuia={setGuia}
              />
            </>
          ) : tocada.tipo === 'pregunta' ? (
            <>
              <section className="como-la-ve">
                <p className="ajustes-rot">Cómo la ve él</p>
                <SessionFeedback
                  title={false}
                  questions={[seleccionada]}
                  answers={{}}
                  onChange={() => {}}
                  soloLectura
                />
              </section>
              <p className="ajustes-rot">Ajustes de la pregunta</p>
              <AjustesEscala
                form={form}
                onChange={onChange}
                pregunta={seleccionada}
                esPropia={(form.custom || []).some((c) => c.id === seleccionada.id)}
              />
            </>
          ) : (
            <>
              <section className="como-la-ve">
                <p className="ajustes-rot">Cómo la ve él</p>
                <Pregunta
                  field={seleccionada}
                  obligatoria={isRequired(form, tocada.id)}
                  value=""
                  onChange={() => {}}
                  soloLectura
                />
              </section>
              <p className="ajustes-rot">Ajustes de la pregunta</p>
              <AjustesPregunta
                form={form}
                onChange={onChange}
                id={tocada.id}
                esPropia={tocada.tipo === 'custom'}
                pregunta={seleccionada}
              />
            </>
          )}
        </aside>
      </div>

      {anadiendo && (
        <Modal size="lg" title="¿Qué quieres preguntar?" onClose={() => setAnadiendo(false)}>
          <Selector
            form={form}
            enchufes={enchufes}
            esAlta={esAlta}
            onChange={(siguiente) => {
              onChange(siguiente);
              setAnadiendo(false);
            }}
          />
        </Modal>
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

/** Lo que lleva puesto un enchufe de la semana, para el canto de su tarjeta. */
const estadoDe = (e, form) => {
  if (e.id === 'weighIns') {
    const n = form.weighIns || 0;
    return n === WEIGH_INS_MAX ? 'cada día' : `${n} a la semana`;
  }
  if (e.id === 'askPhotos') return '3 tomas';
  const modo = form.checkin?.[e.id];
  return CHECKIN_MODES.find((m) => m.id === modo)?.label.toLowerCase() || '';
};

/* ══ Las tarjetas ════════════════════════════════════════════════════════ */

const TarjetaPregunta = ({
  titulo,
  tipo,
  icono: Icono,
  obligatoria,
  tocada,
  onTocar,
  onQuitar,
  onSubir = null,
  onBajar = null,
}) => (
  <div className={`q-card${tocada ? ' is-tocada' : ''}`}>
    <span className="q-asa" aria-hidden="true">
      <GripVertical size={13} />
    </span>
    <button type="button" className="q-cuerpo" onClick={onTocar}>
      <span className="q-glifo">
        <Icono size={13} />
      </span>
      <span className="q-texto">
        <span className="q-titulo">{titulo}</span>
        <span className="q-tipo">{tipo}</span>
      </span>
    </button>
    {obligatoria && <span className="q-oblig">obligatoria</span>}
    {/*
      Las flechas solo donde el orden es del entrenador y se ve: en la sesión y
      en la semana, las preguntas salen en el orden de esta lista. En el alta el
      orden lo pone el catálogo de la ficha, así que un mando para cambiarlo
      sería un botón que no mueve nada.
    */}
    {onSubir !== null || onBajar !== null ? (
      <span className="q-orden">
        <button
          type="button"
          className="btn btn-icon"
          disabled={!onSubir}
          onClick={onSubir || undefined}
          aria-label={`Subir ${titulo}`}
        >
          <ChevronUp size={13} />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          disabled={!onBajar}
          onClick={onBajar || undefined}
          aria-label={`Bajar ${titulo}`}
        >
          <ChevronDown size={13} />
        </button>
      </span>
    ) : null}
    <button
      type="button"
      className="btn btn-icon btn-icon-danger q-quitar"
      aria-label={`Quitar ${titulo}`}
      onClick={onQuitar}
    >
      <Trash2 size={13} />
    </button>
  </div>
);

const TarjetaEnchufe = ({ enchufe, estado, tocada, onTocar, onQuitar }) => {
  const Icono = enchufe.icon;
  return (
    <div className={`q-card is-enchufe${tocada ? ' is-tocada' : ''}`}>
      <span className="q-asa" aria-hidden="true">
        <GripVertical size={13} />
      </span>
      <button type="button" className="q-cuerpo" onClick={onTocar}>
        <span className="q-glifo is-enchufe">
          <Icono size={13} />
        </span>
        <span className="q-texto">
          <span className="q-titulo">{enchufe.label}</span>
          <span className="q-tipo">{estado || enchufe.dice}</span>
        </span>
      </button>
      <span className="q-donde">{enchufe.donde}</span>
      <button
        type="button"
        className="btn btn-icon btn-icon-danger q-quitar"
        aria-label={`Quitar ${enchufe.label}`}
        onClick={onQuitar}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
};

/* ══ El selector: qué se puede poner aquí ════════════════════════════════ */

/* Las dos formas que puede tener una pregunta propia de sesión o de semana. Sale
   del componente para no reconstruirse en cada tecla del enunciado. */
const KINDS_PREGUNTA = [
  { id: 'scale', label: 'Una escala' },
  { id: 'text', label: 'Texto libre' },
];

const Selector = ({ form, onChange, enchufes, esAlta, inline = false }) => {
  const [propia, setPropia] = useState({ label: '', kind: esAlta ? 'text' : 'scale' });
  const asked = new Set(form.asked || []);
  const tope = esAlta ? MAX_CUSTOM : MAX_CUSTOM_PREGUNTAS;
  const quedan = tope - (form.custom || []).length;

  const anadirLaMia = () => {
    if (!propia.label.trim() || quedan <= 0) return;
    onChange(esAlta ? addCustom(form, propia) : anadirPropia(form, propia));
    setPropia({ label: '', kind: propia.kind });
  };

  const libres = esAlta ? [] : preguntasLibres(form);

  return (
    <div className={`selector${inline ? ' is-inline' : ''}`}>
      {inline && (
        <div className="selector-cab">
          <h2 className="selector-tit">¿Qué quieres preguntar?</h2>
          <p className="selector-sub">Empieza por lo que quieres saber.</p>
        </div>
      )}

      <div className="selector-grupos">
        {/* ── SEGUIMIENTO: los enchufes ────────────────────────────────── */}
        {enchufes.length > 0 && (
          <div className="selector-col">
            <p className="selector-rot">Seguimiento</p>
            {enchufes.map((e) => {
              const Icono = e.icon;
              const puesto = esAlta ? Boolean(form[e.id]) : e.puesto(form);
              return (
                <button
                  key={e.id}
                  type="button"
                  className="pieza"
                  disabled={puesto}
                  onClick={() => onChange(esAlta ? { ...form, [e.id]: true } : e.poner(form))}
                >
                  <span className="q-glifo is-enchufe">
                    <Icono size={13} />
                  </span>
                  <span className="pieza-texto">
                    <span className="pieza-nom">{e.label}</span>
                    <span className="pieza-dice">{puesto ? 'Ya está puesto' : e.dice}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── DE SU FICHA (alta) o DEL CATÁLOGO (sesión y semana) ───────── */}
        {esAlta
          ? PROFILE_GROUPS.map((g) => {
              const campos = PROFILE_FIELDS.filter((f) => f.group === g.id && !asked.has(f.id));
              if (campos.length === 0) return null;
              return (
                <div className="selector-col" key={g.id}>
                  <p className="selector-rot">{g.label}</p>
                  {campos.map((f) => {
                    const Icono = ICONO_TIPO[f.kind] || Text;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className="pieza"
                        onClick={() => onChange(toggleAsked(form, f.id))}
                      >
                        <span className="q-glifo">
                          <Icono size={13} />
                        </span>
                        <span className="pieza-texto">
                          <span className="pieza-nom">{f.label}</span>
                          <span className="pieza-dice">{TIPO[f.kind] || 'Texto'}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          : libres.length > 0 && (
              <div className="selector-col">
                <p className="selector-rot">Preguntas</p>
                {libres.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    className="pieza"
                    onClick={() => onChange(togglePregunta(form, q.id))}
                  >
                    <span className="q-glifo">
                      {q.kind === 'scale' ? <SlidersHorizontal size={13} /> : <Text size={13} />}
                    </span>
                    <span className="pieza-texto">
                      <span className="pieza-nom">{q.label}</span>
                      <span className="pieza-dice">{q.hint || diceEscala(q)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

        {/* ── TUYAS ─────────────────────────────────────────────────────── */}
        {/*
          ── ESCRIBIR LA TUYA: UN RENGLÓN, NO UN FORMULARIO ────────────────

          Esto eran tres bloques apilados al final del scroll —un campo con su
          pie de tres líneas, un `<select>` NATIVO y un botón— y se leía como si
          hubiera un segundo formulario dentro del selector.

          Dos cambios. El pie sube a la altura del rótulo «Tuyas»: es una
          advertencia sobre la sección entera («la aplicación las guarda y te
          las enseña; no actúa sobre ellas»), no la ayuda del campo del
          enunciado. Y lo que queda —enunciado · cómo se contesta · añadir— es
          UNA línea que se lee de izquierda a derecha, en el orden en que se
          rellena.

          El `<select>` era el único desplegable del sistema operativo de toda
          la aplicación: se abría con el traje del navegador encima de una
          pantalla que no tiene ni un control más así. Son dos o tres opciones
          cortas y excluyentes, que es literalmente para lo que existe
          `SegmentedControl` y lo que ya usa el carril de la derecha. Y ahora se
          leen las dos a la vez: con el desplegable había que abrirlo para saber
          que la otra existía.
        */}
        <div className="selector-col es-propia">
          <p className="selector-rot">Tuyas</p>
          <p className="selector-pista">
            {quedan > 0
              ? `Te quedan ${quedan} de ${tope}. La aplicación las guarda y te las enseña; no actúa sobre ellas.`
              : `Has llegado a ${tope}, el tope.`}
          </p>

          <div className="propia-linea">
            <Field label="Escríbela">
              <TextInput
                value={propia.label}
                onChange={(label) => setPropia((p) => ({ ...p, label: label.slice(0, MAX_LABEL) }))}
                placeholder={esAlta ? '¿Qué es lo que más te cuesta?' : 'Molestia en el hombro'}
                disabled={quedan <= 0}
              />
            </Field>
            <Field label="Cómo se contesta">
              <SegmentedControl
                value={propia.kind}
                onChange={(kind) => setPropia((p) => ({ ...p, kind }))}
                options={esAlta ? CUSTOM_KINDS : KINDS_PREGUNTA}
                label="Cómo se contesta"
                ancho
              />
            </Field>
            <button
              type="button"
              className="btn btn-primary btn-sm propia-anadir"
              onClick={anadirLaMia}
              disabled={!propia.label.trim() || quedan <= 0}
            >
              <Plus size={15} /> Añadir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ══ El panel de la derecha ══════════════════════════════════════════════ */

/**
 * La cabecera del carril: el azulejo, el nombre y qué es.
 *
 * Es la MISMA pieza que abre la tarjeta del lienzo —mismo glifo, mismo tamaño,
 * mismo par nombre/tipo—, y esa repetición es el trabajo que hace: el carril
 * deja de ser un panel de ajustes flotante y pasa a ser la continuación del
 * renglón que acabas de tocar.
 */
const Cabecera = ({ icono: Icono, titulo, dice, enchufe = false }) => (
  <div className="carril-cab">
    {Icono && (
      <span className={`q-glifo${enchufe ? ' is-enchufe' : ''}`}>
        <Icono size={15} aria-hidden="true" />
      </span>
    )}
    <span className="ajustes-cual">
      <b>{titulo}</b>
      <span>{dice}</span>
    </span>
  </div>
);

/**
 * Los sitios de una guía, numerados como en su lámina.
 *
 * Vive aquí y no en `GuiaDeMedidas` porque no dibuja nada: solo lee `GUIAS` para
 * que el carril y la lámina no puedan discrepar. Añadir un perímetro mañana
 * aparece en los dos sitios a la vez o en ninguno.
 */
const ListaDeSitios = ({ rot, guia }) => {
  const { sitios, etiquetas } = guiaById(guia);
  return (
    <div className="carril-lista">
      <p className="ajustes-rot">{rot}</p>
      <ol className="carril-sitios">
        {sitios.map((s, i) => (
          <li className="carril-sitio" key={s.sitio}>
            <span className="carril-sitio-n">{i + 1}</span>
            <span className="carril-sitio-txt">
              <b>{s.sitio}</b>
              {/* Las dos casillas de un sitio con dos lados. Con una sola, el
                  renglón repetiría el nombre que ya está en negrita. */}
              {s.campos.length > 1 && <span>{s.campos.map((c) => etiquetas[c]).join(' · ')}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};

const AjustesPregunta = ({ form, onChange, id, esPropia, pregunta }) => (
  <div className="col">
    <Cabecera
      icono={ICONO_TIPO[pregunta.kind] || Text}
      titulo={pregunta.label}
      dice={TIPO[pregunta.kind] || 'Texto'}
    />

    <Switch
      label="Hace falta para dar el alta por hecha"
      hint="No bloquea el guardado: lo que hace es que su alta siga contando como pendiente hasta que la conteste."
      checked={isRequired(form, id)}
      onChange={() => onChange(toggleRequired(form, id))}
    />

    {esPropia && (
      <Field label="Cómo se lee" hint="Cambiar el texto no pierde ninguna respuesta ya dada.">
        <TextInput
          value={pregunta.label}
          onChange={(label) =>
            onChange({
              ...form,
              custom: form.custom.map((q) =>
                q.id === id ? { ...q, label: label.slice(0, MAX_LABEL) } : q
              ),
            })
          }
        />
      </Field>
    )}

    {!esPropia && pregunta.hint && <p className="ajustes-nota">{pregunta.hint}</p>}

    {!esPropia && (pregunta.options || []).length > 0 && (
      <div className="ajustes-opciones">
        <p className="ajustes-rot">Contesta con</p>
        {pregunta.options.map((o) => (
          <span key={o.id} className="badge">
            {o.label}
          </span>
        ))}
      </div>
    )}
  </div>
);

/**
 * Los ajustes de una pregunta de sesión o de semana.
 *
 * Aquí no hay «obligatoria»: en estos dos momentos lo que se entrega es la
 * sesión o la semana, y bloquear una entrega semanal por una escala sin
 * contestar es la forma más rápida de que se deje de entregar. Lo que sí hay es
 * lo que decide cómo se LEE el dato después: el rango y hacia dónde es mejor.
 */
const AjustesEscala = ({ form, onChange, pregunta, esPropia }) => (
  <div className="col">
    <Cabecera
      icono={pregunta.kind === 'scale' ? SlidersHorizontal : Text}
      titulo={pregunta.label}
      dice={diceEscala(pregunta)}
    />

    {pregunta.hint && !esPropia && <p className="ajustes-nota">{pregunta.hint}</p>}

    {esPropia ? (
      <>
        <Field label="Cómo se lee" hint="Cambiar el texto no pierde ninguna respuesta ya dada.">
          <TextInput
            value={pregunta.label}
            onChange={(label) =>
              onChange({
                ...form,
                custom: form.custom.map((q) =>
                  q.id === pregunta.id ? { ...q, label: label.slice(0, MAX_LABEL) } : q
                ),
              })
            }
          />
        </Field>

        {pregunta.kind === 'scale' && (
          <>
            <Field label="Hasta dónde llega" hint="Una escala corta se contesta; una de diez se piensa.">
              <SegmentedControl
                value={pregunta.max ?? 10}
                onChange={(max) =>
                  onChange({
                    ...form,
                    custom: form.custom.map((q) => (q.id === pregunta.id ? { ...q, max } : q)),
                  })
                }
                options={[3, 5, 10].map((n) => ({ id: n, label: String(n) }))}
                label="Tope de la escala"
              />
            </Field>
            <Switch
              label="Menos es mejor"
              hint="Para lo que quieres que baje: el dolor, el hambre. Decide de qué lado pinta la analítica."
              checked={Boolean(pregunta.lowerIsBetter)}
              onChange={() =>
                onChange({
                  ...form,
                  custom: form.custom.map((q) =>
                    q.id === pregunta.id ? { ...q, lowerIsBetter: !q.lowerIsBetter } : q
                  ),
                })
              }
            />
          </>
        )}
      </>
    ) : (
      <p className="ajustes-nota">
        Es una pregunta del catálogo: su escala y su color vienen puestos para que la serie se lea
        igual en todos tus clientes. Puedes moverla de sitio o quitarla.
      </p>
    )}
  </div>
);

/**
 * Lo que un enchufe deja configurar, que es sobre todo: qué se le pide
 * exactamente, y —cuando se mide— cómo se mide.
 */
const AjustesEnchufe = ({ enchufe, form, onChange, esAlta, onGuia }) => (
  <div className="col">
    {/*
      ── EL CARRIL EMPIEZA POR DÓNDE SE ESTÁ ─────────────────────────────────
      Antes arrancaba con un nombre en negrita suelto y, debajo, una frase
      huérfana con el destino («A su antropometría.»). Tres renglones de texto
      plano con el mismo peso, sin nada que dijera a qué renglón del lienzo
      pertenecían: había que acordarse de cuál se acababa de tocar.

      Ahora abre con el MISMO azulejo y el mismo nombre que la tarjeta de la
      izquierda —es literalmente la pieza que estás mirando, no su descripción—
      y el destino baja a una chapa del acento, que es la tinta de lo que la
      aplicación sabe hacer con un dato (ver `.q-donde`). Deja de ser una frase
      que se lee y pasa a ser una etiqueta que se reconoce.
    */}
    <Cabecera icono={enchufe.icon} enchufe titulo={enchufe.label} dice={enchufe.dice} />
    <p className="carril-donde">
      <CornerDownRight size={13} aria-hidden="true" />
      {enchufe.donde}
    </p>

    {/* Los de la semana llevan su mando: cuántos pesajes, y en qué modo va el
        bloque. Es lo que vivía en `CheckinBlocksSection`, en su sitio. */}
    {!esAlta && enchufe.id === 'weighIns' && (
      <Field label="Cuántas veces a la semana" hint="Es lo que hace fiable la media.">
        <SegmentedControl
          value={form.weighIns || 1}
          onChange={(n) => onChange({ ...form, weighIns: n })}
          options={Array.from({ length: WEIGH_INS_MAX }, (_, i) => ({ id: i + 1, label: String(i + 1) }))}
          label="Pesajes que le pides a la semana"
        />
      </Field>
    )}

    {!esAlta && (enchufe.id === 'perimeters' || enchufe.id === 'folds') && (
      <Field
        label="Cómo se le pide"
        hint="Obligatorio significa que no puede cerrar el check-in sin rellenarlo."
      >
        <SegmentedControl
          value={form.checkin?.[enchufe.id] || 'optional'}
          onChange={(modo) =>
            onChange({ ...form, checkin: { ...form.checkin, [enchufe.id]: modo } })
          }
          options={CHECKIN_MODES.filter((m) => m.id !== 'off').map((m) => ({ id: m.id, label: m.label }))}
          label={`Cómo se pide: ${enchufe.label}`}
        />
      </Field>
    )}

    {/* La guía, donde de verdad hace falta: donde se pide una medida. Cada
        enchufe dice CUÁL es la suya —la cinta o el pellizco—: los pliegues se
        pedían sin ninguna, que es justo al revés de como debería ser. */}
    {enchufe.guia && (
      <button
        type="button"
        className="btn btn-secondary btn-sm guia-enlace"
        onClick={() => onGuia(enchufe.guia)}
      >
        <Ruler size={15} /> {GUIAS[enchufe.guia].titulo}
      </button>
    )}

    {/*
      ── LO QUE SE LE PIDE, POR SITIOS Y NUMERADO ────────────────────────────

      Eran nueve chapas grises en una nube. Nueve etiquetas apretadas no son una
      lista: son textura, y encima mentían un poco —«Brazo Dcho.» y «Brazo Izq.»
      son DOS casillas del mismo sitio, y así contadas parecían dos sitios—.

      La guía ya tiene la verdad: seis sitios de cinta, nueve medidas. Aquí se
      dice igual y CON LOS MISMOS NÚMEROS, así que abrir la lámina es continuar
      leyendo y no empezar de cero. Es el §25.4: la numeración vale porque el
      contenido es de verdad una secuencia numerada, la de la lámina.
    */}
    {enchufe.guia && (
      <ListaDeSitios
        rot={
          enchufe.guia === 'cinta'
            ? `Seis sitios, ${Object.keys(PERIMETER_LABELS).length} medidas`
            : `Seis pliegues`
        }
        guia={enchufe.guia}
      />
    )}

    {enchufe.id === 'askMeasures' && (
      <p className="ajustes-nota">
        Los pliegues ({Object.values(FOLDS_LABELS).length}) los tomas tú: hacen falta plicómetro y
        buena mano, y una medida mal tomada en casa vale menos que ninguna.
      </p>
    )}

    {enchufe.id === 'askScreening' && (
      <div className="carril-lista">
        <p className="ajustes-rot">Las cinco preguntas</p>
        <ol className="carril-sitios">
          {SCOFF_QUESTIONS.map((q, i) => (
            <li className="carril-sitio" key={q.id}>
              <span className="carril-sitio-n">{i + 1}</span>
              <span className="carril-sitio-txt">{q.label}</span>
            </li>
          ))}
        </ol>
      </div>
    )}

    {enchufe.id === 'askBasics' && (
      <p className="ajustes-nota">
        Edad y altura van a su ficha; el peso entra como su primer pesaje, así que su gráfica empieza
        el día que se da de alta y no la semana siguiente.
      </p>
    )}

    {enchufe.id === 'askPhotos' && (
      <p className="ajustes-nota">
        Frente, perfil y espalda. Van a su archivo de fotos y aparecen en la Revisión, comparables
        con las de cualquier semana anterior.
      </p>
    )}
  </div>
);
