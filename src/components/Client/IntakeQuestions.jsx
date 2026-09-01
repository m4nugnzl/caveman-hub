import { useState } from 'react';
import { Check } from 'lucide-react';

import { useActions } from '@/context/AppContext';
import {
  clientIntakeForm,
  formProgress,
  formSections,
  isFormEmpty,
  isRequired,
} from '@/domain/intakeForm';
import { MAX_FIELD, customAnswers, examplePlaceholder } from '@/domain/profile';
import {
  BotonAccion,
  Field,
  Notice,
  NumberInput,
  Panel,
  useAccionDeBoton,
} from '@/components/ui/primitives';

/** Una respuesta cuenta si tiene algo dentro. El mismo criterio que `formProgress`. */
const puesto = (valor) => valor !== undefined && valor !== null && valor !== '';

/**
 * Un control, según lo que pida la pregunta.
 *
 * Sirve para las dos clases de pregunta —las del catálogo del perfil y las
 * propias del entrenador— porque las dos declaran su `kind` con el mismo
 * vocabulario. Si no fuera así habría dos formularios que mantener, y el segundo
 * sería el que se quedara atrás.
 */
const Pregunta = ({ field, obligatoria, value, onChange }) => (
  <Field
    /* El asterisco y no la palabra «obligatoria» al lado: son hasta diecinueve
       campos y repetir la palabra en cinco de ellos convierte la etiqueta en
       ruido. Lo que las nombra es el aviso de abajo, cuando de verdad faltan. */
    label={obligatoria ? `${field.label} *` : field.label}
    hint={field.hint}
  >
    {(props) => {
      if (field.kind === 'number') {
        return (
          <div className="input-suffix">
            <NumberInput
              {...props}
              center={false}
              placeholder={examplePlaceholder(field)}
              value={value}
              onChange={onChange}
            />
            {field.unit && <span aria-hidden="true">{field.unit}</span>}
          </div>
        );
      }

      if (field.kind === 'choice' || field.kind === 'yesno') {
        const opciones =
          field.kind === 'yesno'
            ? [
                { id: 'true', label: 'Sí' },
                { id: 'false', label: 'No' },
              ]
            : field.options;

        return (
          <select
            {...props}
            className="select"
            value={value === true ? 'true' : value === false ? 'false' : value ?? ''}
            onChange={(e) => onChange(e.target.value)}
          >
            {/* «Prefiero no decirlo» es una respuesta, y dejarla fuera obligaría
                a inventarse una. */}
            <option value="">Sin contestar</option>
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        );
      }

      return (
        <input
          {...props}
          className="input"
          maxLength={MAX_FIELD}
          placeholder={examplePlaceholder(field)}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }}
  </Field>
);

/**
 * El cuestionario de alta, contestado por el cliente.
 *
 * ══ Lo que sustituye ═══════════════════════════════════════════════════════
 *
 * Un Word de trece páginas que va por correo, se contesta a mano y se archiva.
 * Todo lo que decide el primer plan está ahí dentro y ninguna de esas respuestas
 * llegaba a la aplicación de una forma que pudiera usar.
 *
 * ══ Se guarda ENTERO y de una vez ══════════════════════════════════════════
 *
 * No campo a campo al salir del foco. En un móvil con mala cobertura, guardar al
 * vuelo son doce peticiones que pueden fallar por separado y dejar media
 * respuesta puesta sin que nadie lo sepa. Aquí se contesta lo que se quiera y se
 * pulsa una vez: o entra todo o no entra nada, y lo que no entra se dice.
 *
 * ══ Y se puede dejar a medias ══════════════════════════════════════════════
 *
 * Ninguna pregunta es obligatoria. Un formulario que no deja guardar sin
 * completarlo se abandona en la tercera pregunta y no llega nada; uno que guarda
 * lo que haya deja a su entrenador con cinco respuestas de siete, que es mucho
 * más de lo que tenía. El contador de arriba dice por dónde va.
 *
 * ══ El botón de guardar VIAJA con la pantalla ══════════════════════════════
 *
 * Y es la corrección que más se nota. Guardar de una vez tiene un precio que
 * antes se pagaba entero: el único botón estaba al FINAL de un formulario que en
 * un teléfono mide cinco pantallas, así que quien contestaba tres preguntas y
 * salía perdía las tres —sin ningún aviso, porque desde fuera no había nada que
 * dijera que quedaba algo por hacer—.
 *
 * La barra pegajosa dice las dos cosas que faltaban: cuánto llevas y que tienes
 * algo **sin guardar**. Y como está siempre a un dedo, guardar deja de ser el
 * final del recorrido para ser lo que es: algo que se hace cuando quieras.
 */
export const IntakeQuestions = ({ client }) => {
  const { saveClientProfile } = useActions();

  const form = clientIntakeForm(client.preferences);
  const perfil = client.profile || {};
  const propias = customAnswers(perfil);

  /* El borrador arranca con lo ya contestado: volver a la pantalla tiene que
     enseñar lo que puso, no un formulario en blanco que invita a repetirlo. */
  const [borrador, setBorrador] = useState(() => ({ ...perfil, custom: { ...propias } }));
  /* El giro y el tic del botón de guardar; ver `BotonAccion`. */
  const guardado = useAccionDeBoton();
  const [aviso, setAviso] = useState(null);
  /*
    ¿Hay algo escrito y sin mandar?

    Un booleano que se enciende al tocar y se apaga al guardar, y no una
    comparación del borrador contra el perfil. La comparación parece más lista y
    es peor: `client.profile` se actualiza de forma optimista al guardar, así que
    durante el viaje de ida los dos son iguales y la barra diría «guardado» antes
    de que el servidor haya contestado.
  */
  const [tocado, setTocado] = useState(false);

  if (isFormEmpty(form)) return null;

  const tandas = formSections(form);
  /*
    El avance se mide sobre lo que hay EN PANTALLA, no sobre lo guardado.

    Contando lo guardado, contestar una pregunta no movía nada hasta pulsar el
    botón: el formulario se quedaba mudo justo mientras se rellena, que es cuando
    la barra sirve de algo. Que pueda decir «10 de 10» con cosas sin mandar no es
    un problema mientras la barra de abajo lo diga — y lo dice.
  */
  const progreso = formProgress(form, borrador);

  const set = (field) => (valor) => {
    setTocado(true);
    setBorrador((prev) =>
      field.custom
        ? { ...prev, custom: { ...prev.custom, [field.id]: valor } }
        : { ...prev, [field.id]: valor }
    );
  };

  const valorDe = (field) => (field.custom ? borrador.custom?.[field.id] : borrador[field.id]);

  const guardar = (e) => {
    e.preventDefault();
    guardado.lanzar(async () => {
      setAviso(null);

      /*
        Se manda SOLO lo que este formulario pregunta, no el borrador entero.

        El borrador arrastra lo que ya había en el perfil —incluido lo que apuntó
        el entrenador y que aquí ni se pinta—, y devolvérselo tal cual sería
        escribirlo otra vez con el valor que tuviera al abrir la pantalla. Mandando
        solo lo preguntado, la mezcla de `set_client_profile` hace lo que dice.
      */
      const respuestas = {};
      for (const id of form.asked) respuestas[id] = borrador[id] ?? null;
      if (form.custom.length > 0) {
        respuestas.custom = {
          ...propias,
          ...Object.fromEntries(form.custom.map((q) => [q.id, borrador.custom?.[q.id] ?? null])),
        };
      }

      const res = await saveClientProfile(client.id, respuestas);
      if (res.ok) setTocado(false);
      setAviso(
        res.ok
          ? { tone: 'success', text: 'Guardado. Puedes volver y cambiarlo cuando quieras.' }
          : { tone: 'error', text: res.error }
      );
      return res.ok;
    });
  };

  return (
    <Panel
      title="Cuéntanos de ti"
      sub="Con esto te montan la rutina y la dieta. No hace falta que lo contestes todo de una vez."
      className="col gap-4"
      action={
        <span className={`badge${progreso.done === progreso.total ? ' badge-ok' : ''}`}>
          {progreso.done === progreso.total && <Check size={11} />} {progreso.done} de{' '}
          {progreso.total}
        </span>
      }
    >
      {/* La barra dice lo mismo que la chapa de la cabecera y lo dice de otra
          manera: una cifra es un dato, una barra es la promesa de que se acaba.
          En un formulario que se puede dejar a medias, saber cuánto queda es lo
          que decide si se retoma. */}
      <div
        className="form-progress"
        role="progressbar"
        aria-valuenow={progreso.done}
        aria-valuemin={0}
        aria-valuemax={progreso.total}
        aria-label="Preguntas contestadas"
      >
        <i style={{ width: `${progreso.total ? (progreso.done / progreso.total) * 100 : 0}%` }} />
      </div>

      {form.intro && <p className="t-sm t-secondary">{form.intro}</p>}
      {aviso && <Notice tone={aviso.tone}>{aviso.text}</Notice>}

      {/*
        Lo obligatorio que falta, NOMBRADO.

        No bloquea el guardado —un formulario que no deja guardar sin completarlo
        se abandona en la tercera pregunta— pero sí impide que el alta se dé por
        terminada. Y se dice cuáles son: «te falta algo obligatorio» sin decir qué
        es una pantalla que no se puede obedecer.
      */}
      {progreso.missing.length > 0 && (
        <Notice tone="warn">
          Tu entrenador necesita {progreso.missing.length === 1 ? 'esto' : 'estas cosas'} para poder
          empezar: {progreso.missing.map((q) => q.label).join(', ')}. Puedes guardar lo demás
          igualmente y volver.
        </Notice>
      )}

      <form className="col gap-4" onSubmit={guardar}>
        {tandas.map((tanda, i) => {
          /* Lo contestado de ESTA tanda. Con cuatro rótulos y diecinueve campos,
             la cifra de arriba dice cuánto queda en total y ninguna dice dónde
             está lo que falta — que es lo que hay que saber para seguir. */
          const contestadas = tanda.fields.filter((f) => puesto(valorDe(f))).length;
          const llena = contestadas === tanda.fields.length;

          return (
            <div key={tanda.id} className={`form-block col gap-3${llena ? ' is-full' : ''}`}>
              <div className="row between gap-2">
                <span className="section-label">
                  {/* El número, y no un icono: dice cuántas tandas quedan sin
                      tener que contarlas, que es la pregunta de quien rellena
                      algo largo en un móvil. */}
                  <span className="n" aria-hidden="true">
                    {i + 1}
                  </span>
                  {tanda.label}
                </span>
                {/* La cuenta de la tanda, en voz baja: informa sin competir con
                    el rótulo, que es lo que se lee para ubicarse. */}
                <span className="tanda-n">
                  {llena && <Check size={11} />} {contestadas}/{tanda.fields.length}
                </span>
              </div>
              <div className="grid-2">
                {tanda.fields.map((field) => (
                  <Pregunta
                    key={field.id}
                    field={field}
                    obligatoria={isRequired(form, field.id)}
                    value={valorDe(field)}
                    onChange={set(field)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/*
          La barra de guardar, pegada al pie de la ventana mientras se rellena.

          Lo que dice a la izquierda cambia con el estado y ésa es toda su razón
          de ser: «sin guardar» es un aviso, «guardado» es un acuse, y el resto
          del tiempo es la cuenta. Tres frases distintas en el mismo sitio, que es
          donde ya está mirando quien acaba de contestar algo.
        */}
        <div className={`form-bar${tocado ? ' is-dirty' : ''}`}>
          <span className="t-xs t-secondary" style={{ minWidth: 0 }}>
            {tocado
              ? 'Tienes respuestas sin guardar.'
              : progreso.done === progreso.total
                ? 'Lo tienes todo contestado.'
                : `Te faltan ${progreso.total - progreso.done} por contestar. Puedes dejarlo a medias.`}
          </span>
          {/* El rótulo ya no hace de indicador: «Guardado» en reposo era un
              estado disfrazado de acción. Ahora dice siempre lo que hace y el
              tic del botón confirma cuando ocurre. */}
          <BotonAccion
            type="submit"
            className="btn btn-primary btn-sm shrink-0"
            estado={guardado.estado}
            disabled={!tocado}
          >
            Guardar
          </BotonAccion>
        </div>
      </form>
    </Panel>
  );
};
