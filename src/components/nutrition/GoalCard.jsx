import { useId, useState } from 'react';
import { Check } from 'lucide-react';

import { localeNumber } from '@/lib/dates';
import { toNum } from '@/lib/num';
import { Modal } from '@/components/ui/Modal';

/**
 * Un objetivo de actividad del plan: los pasos diarios, el cardio de alta
 * intensidad.
 *
 * ══ Por qué esto sale de la tarjeta de kcal ═════════════════════════════════
 *
 * Los pasos estaban dentro del objetivo de macros, y ahí no era del todo mentira
 * —se deciden a la vez que las calorías, hablando del mismo gasto— pero traía un
 * fallo que solo aparece con dos dietas: **el objetivo de kcal es POR VARIANTE y
 * la actividad no**. Es una columna del plan, una sola para la persona.
 *
 * El resultado era que el campo solo existía en la tarjeta de los días de
 * entreno, y en la de descanso se escondía a mano. Quien montara primero el día
 * de descanso no encontraba dónde ponerlo, y quien lo viera en «entreno» tenía
 * motivos para pensar que eran los pasos DE los días de entreno — que es lo que
 * la tarjeta estaba diciendo sin querer.
 *
 * Fuera de las dos tarjetas, la cifra dice lo que es: lo que esta persona hace
 * cada día, entrene o no.
 *
 * ── Y por qué sigue en la pantalla de nutrición ─────────────────────────────
 * Porque es donde se decide. La actividad es la otra mitad del balance
 * energético: se ajusta mirando las calorías, no la rutina de fuerza. Llevarla a
 * la ficha del cliente la sacaría de la conversación en la que se toma.
 *
 * ══ Por qué es genérica y no dos tarjetas ══════════════════════════════════
 *
 * Porque al añadir el cardio la alternativa era copiar este archivo entero y
 * cambiar dos cadenas. Dos copias de la misma tarjeta divergen: basta con que
 * alguien arregle el guardado con Enter en una de las dos. Lo que cambia entre
 * las dos —icono, nombre, unidad y ejemplo— son cuatro propiedades.
 *
 * ── Y por qué el cardio también es texto libre ──────────────────────────────
 * Porque se prescribe de mil maneras y ninguna cabe en dos casillas: «2 días,
 * 10 rondas de 30/30 en bici», «15 min de cinta al 80 % después de pierna», «lo
 * que te pida el cuerpo, sin pasar de tres». Partirlo en sesiones × minutos
 * obligaría a redondear la prescripción de todo el mundo a la forma que entiende
 * la aplicación, que es lo que hace inútil un campo.
 */
/**
 * @param numeric  El valor es UNA CIFRA («10000»), no una frase. Cambia dos
 *   cosas: el teclado del móvil sale numérico, y la cifra se pinta grande a la
 *   derecha del nombre. Una prescripción de cardio de doce palabras en ese hueco
 *   —a 1,25 rem y en negrita— parte la tarjeta en tres líneas y compite con todo
 *   lo que tiene alrededor, así que el texto largo va debajo y a tamaño normal.
 */
export const GoalCard = ({
  icon: Icon,
  label,
  value,
  unit = '',
  placeholder = '',
  hint = '',
  numeric = false,
  editable = false,
  onSave,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  /* El formulario vive en el cuerpo de la ventana y el botón de guardar en su
     pie, así que se atan con `form=` y hace falta un id estable. */
  const formId = useId();

  const puesto = String(value ?? '').trim();

  /* Al cliente no se le enseña un hueco vacío: sin objetivo puesto no hay nada
     que contarle, y una tarjeta que dice «sin definir» solo le hace preguntarse
     si tiene que hacer algo. */
  if (!editable && !puesto) return null;

  const Etiqueta = (
    <span className="section-label is-titulo">
      <Icon size={12} className="icon-inline" />
      {label}
    </span>
  );

  /*
    ══ SE DEFINE EN UNA VENTANA, NO EN EL SITIO ═══════════════════════════════

    La tarjeta se convertía en un formulario: el rótulo se hacía etiqueta, el
    valor casilla y aparecían dos botones. En una columna de tres tarjetas
    apiladas eso cambia de sitio todo lo que hay debajo cada vez que se toca
    algo, y la que se está editando pasa a ser la más alta y la más ruidosa de
    la columna — justo la que más quieta debería estar mientras se escribe.

    Con la ventana centrada la columna no se mueve, el campo sale enfocado y
    solo, y Escape y la equis cancelan sin ambigüedad. Es la misma pieza que ya
    usa el resto del producto para pedir un dato (`Modal`), con su foco atrapado
    y su cierre animado.
  */
  const ventana = (
    <Modal
      open={editing}
      onClose={() => setEditing(false)}
      title={label}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
            Cancelar
          </button>
          <button type="submit" form={formId} className="btn btn-primary">
            <Check size={14} /> Guardar
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft.trim());
          setEditing(false);
        }}
      >
        {/*
          Sin etiqueta: la ventana ya se titula «Pasos diarios», y repetirlo
          justo debajo era la misma frase dos veces en cuatro centímetros.
          Aquí dentro solo hay un campo, así que no hay nada que desambiguar
          —el nombre accesible lo lleva el propio `aria-label`—.

          ── La cifra se escribe como se lee ──────────────────────────────────
          Un objetivo de pasos es LA cifra de esta persona, no un dato de
          formulario, así que se teclea al tamaño y con la letra con la que
          luego se enseña, con su icono a la izquierda y su unidad dentro del
          recuadro. Es el mismo trato que la tarjeta le da al valor.
        */}
        {numeric ? (
          <span className="objetivo-campo input-suffix">
            <Icon size={18} className="objetivo-campo-icono" aria-hidden="true" />
            <input
              autoFocus
              className="input"
              inputMode="numeric"
              value={draft}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              /* Vaciar el campo es la forma de quitar el objetivo, y por eso no
                 hay un botón «Quitar»: la casilla en blanco ya lo dice. */
              aria-label={`${label} objetivo`}
            />
            {unit && <span aria-hidden="true">{unit}</span>}
          </span>
        ) : (
          /* Lo que NO es una cifra es una prescripción de varias líneas —«2
             días, 10 rondas de 30/30 en bici; el segundo después de pierna»—, y
             en un campo de una línea se escribe a ciegas: lo tecleado se va por
             la izquierda en cuanto pasa del ancho. */
          <textarea
            autoFocus
            className="textarea"
            rows={3}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={`${label} objetivo`}
          />
        )}
        <span className="field-hint">
          {hint || 'Déjalo en blanco para quitar el objetivo.'}
        </span>
      </form>
    </Modal>
  );

  /*
    ══ LA TARJETA ENTERA ES EL CONTROL ═══════════════════════════════════════

    Un objetivo de actividad es UN dato que se cambia de una vez: nombre a la
    izquierda, cifra a la derecha y nada más. Con un lápiz dentro, la tarjeta
    ofrecía un blanco de 26 px en medio de otro de 300 que no hacía nada — y
    encima el mismo gesto iba con dos trajes según el estado: «Definir →» con la
    tarjeta vacía y un lápiz gris con la tarjeta llena. Justo debajo, la de al
    lado hacía la tercera versión.

    Ahora el hueco vacío y el lleno comparten el único esqueleto que hay —la
    caja—, que es lo que esta tarjeta ya decía querer cuando ofrecía «Definir»
    en el sitio del valor.

    ── Y sin flecha ────────────────────────────────────────────────────────
    Cuando lo que se pulsa es la CAJA, la caja ya se puede encender: fondo,
    canto y cifra en acento al pasar o al enfocar. Una flecha encima es decir
    dos veces lo mismo, y además la dice en pequeño y en una esquina, que es
    donde peor se lee. El adorno se retira; el gesto se queda.

    El lápiz se queda donde SÍ hace falta: donde la caja lleva a dos sitios
    distintos (`MacroTargetCard` — el título abre la ventana del día y el lápiz
    el objetivo) o donde la fila es demasiado densa para otra cosa
    (`MealCard`). Ver «El lápiz y sus parientes» en `controles.css`.
  */
  const dentro = (
    <>
      <span className="objetivo-fila">
        {Etiqueta}
        {/* El hueco del valor solo existe si hay valor que poner o hueco que
            ofrecer: con el cardio escrito, la frase va debajo y una caja vacía
            aquí solo cobraría su hueco de la fila. */}
        {(!puesto || numeric) && (
          <span className="objetivo-v">
            {/* La cifra se dice como en el resto del producto: «11.000», no
                «11000». Se guarda como texto y se pintaba tal cual, así que los
                mismos pasos salían con punto de millar en el Resumen y sin él
                aquí. */}
            {puesto && numeric && (
              <>
                <strong className="objetivo-c">
                  {toNum(puesto) === null ? puesto : localeNumber(toNum(puesto))}
                </strong>
                {unit && <span className="objetivo-u">{unit}</span>}
              </>
            )}
            {/* Vacía, la tarjeta no constata la ausencia («Sin definir.») sino
                que ofrece el gesto, y lo ofrece en el sitio del valor: el hueco
                dice con qué se llena. */}
            {!puesto && <span className="objetivo-p">Definir</span>}
          </span>
        )}
      </span>
      {/* Con el objetivo puesto no hace falta decir nada más: se explica solo. */}
      {puesto && !numeric && <span className="t-sm pre-wrap">{puesto}</span>}
    </>
  );

  /* En el portal del cliente no hay nada que tocar: mismo esqueleto, sin puerta
     y sin flecha — una caja que se pulsa y no lleva a ningún sitio miente. */
  if (!editable) return <article className="card objetivo">{dentro}</article>;

  return (
    <>
      <button
        type="button"
        className="card objetivo is-puerta"
        onClick={() => {
          setDraft(puesto);
          setEditing(true);
        }}
        title={`${puesto ? 'Cambiar' : 'Definir'} ${label.toLowerCase()}`}
      >
        {dentro}
      </button>
      {ventana}
    </>
  );
};
