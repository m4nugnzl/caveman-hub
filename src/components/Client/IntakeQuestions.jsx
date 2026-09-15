import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check } from 'lucide-react';

import { useActions } from '@/context/AppContext';
import {
  clientIntakeForm,
  formProgress,
  formSections,
  isFormEmpty,
  isRequired,
} from '@/domain/intakeForm';
import { MAX_FIELD, customAnswers, examplePlaceholder } from '@/domain/profile';
import { SCOFF_QUESTIONS, scoffBool } from '@/domain/scoff';
import {
  BotonAccion,
  Field,
  HUECO_CIFRA,
  Notice,
  Panel,
  useAccionDeBoton,
} from '@/components/ui/primitives';
import { Opciones } from '@/components/ui/Opciones';
import { Contador } from '@/components/ui/Contador';
import { CarrilDePasos } from '@/components/ui/Asistente';
import { prefiereMenosMovimiento, traeALaVista } from '@/lib/motion';

/** Una respuesta cuenta si tiene algo dentro. El mismo criterio que `formProgress`. */
const puesto = (valor) => valor !== undefined && valor !== null && valor !== '';

/**
 * Un sí/no del alta, dicho con los botones de la casa.
 *
 * `ui/Opciones` contesta «si»/«no» —es el vocabulario del formulario suelto, del
 * parte y del check-in— y esta bolsa guarda «true»/«false», que es lo que
 * `cleanProfile` sabe volver booleano. La traducción vive aquí y no en el
 * dominio a propósito: cambiar lo que se guarda para que encaje con un botón
 * sería cambiar el dato por el control.
 */
const comoSiNo = (valor) =>
  valor === true || valor === 'true' ? 'si' : valor === false || valor === 'false' ? 'no' : '';
const desdeSiNo = (id) => (id === 'si' ? 'true' : id === 'no' ? 'false' : '');

/**
 * CÓMO SE CONTESTA UNA PREGUNTA DEL ALTA.
 *
 * ══ Se contesta con los controles del cliente, no con los de un ajuste ══════
 *
 * Elegir era un `<select>` —«Sin contestar ▾»— y ese desplegable es de otra
 * generación: esconde detrás de un toque lo que hay que elegir, obliga a abrirlo
 * para saber qué se puede contestar y deja las opciones sin objetivo táctil
 * propio. El mismo cliente, en su check-in y en cualquier formulario que le
 * mandes, contesta ese tipo de pregunta con `ui/Opciones` —botones a la vista, y
 * el sí/no con su visto y su aspa—. Dos maneras de decir que sí en el mismo
 * producto, y la primera que ve es la peor.
 *
 * Y una cifra se escribe en la placa, que es como se escribe una cifra en esta
 * casa desde la revisión: la caja mide lo que mide el número y la unidad va
 * dentro, pegada, en vez de flotar en un rótulo. Salvo las que se cuentan con
 * los dedos, que llevan sus dos botones — ver más abajo.
 *
 * ══ Por qué es UNA pieza y la usan los dos ═════════════════════════════════
 *
 * Porque el constructor enseña, al lado de cada pregunta, «cómo la ve él», y eso
 * tiene que ser este control apagado y no un dibujo parecido. Un segundo
 * renderizador es el que se queda atrás el día que aquí cambie algo — y el que
 * se quedaría atrás es justo el que el entrenador mira para decidir qué
 * preguntar.
 *
 * @param campo       Lo que `Field` le pasa a su control: el `id` al que apunta
 *   su `<label>`. Va tal cual al `<input>`; los grupos de botones no lo reciben
 *   —no hay un elemento al que ponérselo— y se nombran solos con `etiqueta`.
 * @param soloLectura Así se va a ver: el control entero, apagado.
 */
const ControlDelAlta = ({ field, valor, onChange, soloLectura = false, campo = null }) => {
  if (field.kind === 'yesno' || field.kind === 'choice') {
    const sino = field.kind === 'yesno';
    return (
      <Opciones
        sino={sino}
        /* Las propias del entrenador declaran `kind` pero no traen lista: sin el
           respaldo, una de elección sin opciones reventaba el `map`. Se ve antes
           en el constructor que en el portal, porque allí la pregunta se pinta
           según se escribe. */
        ops={sino ? null : field.options || []}
        valor={sino ? comoSiNo(valor) : (valor ?? '')}
        etiqueta={field.label}
        soloLectura={soloLectura}
        onChange={(id) => onChange(sino ? desdeSiNo(id) : id)}
      />
    );
  }

  /*
    ══ LO QUE SE CUENTA CON LOS DEDOS SE CUENTA CON DOS BOTONES ═══════════════

    «Días que puedes entrenar» es un número del 1 al 7 y estaba pidiéndose con
    una casilla de seis caracteres: una caja de 145 px para un dígito, con la
    unidad colgando a la derecha del hueco vacío. Desproporcionada no es una
    manera de hablar — es literalmente una caja diez veces más ancha que su
    respuesta, y en un móvil pide el teclado entero para escribir un «4».

    Este control ya existe en la casa y esta misma regla ya está escrita en el
    formulario suelto (`CampoLibre`): cuántos días, cuántas veces, cuántas
    comidas se cuentan con «−» y «+». Lo que cambia aquí es de dónde sale la
    decisión: allí se deduce de que la pregunta no lleve unidad y eso no sirve
    para el catálogo del perfil, donde «días» y «comidas» SON la unidad. Así que
    lo dice el campo (`cuenta`, en `domain/profile`), que es quien sabe si su
    respuesta es una cuenta pequeña o una medida.

    La unidad no se pierde: en los dos campos que la llevan está ya dentro del
    enunciado —«Días que puedes entrenar», «Comidas al día»— y repetirla al lado
    de la cifra sería decirlo dos veces en el mismo renglón.
  */
  if (field.kind === 'number' && field.cuenta) {
    return (
      <Contador
        valor={valor ?? ''}
        etiqueta={field.label}
        soloLectura={soloLectura}
        onChange={onChange}
      />
    );
  }

  if (field.kind === 'number') {
    return (
      <span className="placa placa-cifra">
        <input
          {...campo}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          /* El hueco es la raya de cifra y no un ejemplo: en una casilla alineada
             a la derecha, un número gris de ejemplo se lee como una respuesta ya
             escrita. Ver `HUECO_CIFRA`. */
          placeholder={HUECO_CIFRA}
          /* Y la casilla mide LO QUE MIDE LA RESPUESTA. Eran seis caracteres
             para todas: los que necesitan los pasos del día («12000») y el
             triple de los que necesita la duración de una sesión. El catálogo
             dice cuántas cifras tiene cada una; cuatro es el respaldo para las
             que escribe el entrenador, de las que no se sabe la magnitud. */
          style={{ width: `${field.digitos || 4}ch` }}
          value={valor ?? ''}
          disabled={soloLectura}
          onChange={(e) => onChange(e.target.value)}
        />
        {field.unit && (
          <span className="placa-u" aria-hidden="true">
            {field.unit}
          </span>
        )}
      </span>
    );
  }

  return (
    <input
      {...campo}
      type="text"
      className="input"
      maxLength={MAX_FIELD}
      placeholder={examplePlaceholder(field)}
      value={valor ?? ''}
      disabled={soloLectura}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};

/**
 * Una pregunta con su rótulo encima: el renglón de la hoja del alta.
 *
 * La montan los dos lados. El cliente, dentro de su hoja numerada —una de éstas
 * por renglón, con su número al lado—; y el constructor, apagada, como vitrina
 * de «cómo la ve él» al lado de los ajustes de esa pregunta. Es la misma pieza
 * a propósito: un segundo renderizador es el que diverge, y el que divergiría
 * sería justo el que el entrenador mira para decidir qué preguntar.
 */
export const Pregunta = ({ field, obligatoria, value, onChange, soloLectura = false }) => {
  /* Con botones, el `<label>` de `Field` no tendría a qué apuntar —un grupo no
     recibe el `id`— y un `for` huérfano se anuncia solo. Ver `Field`: sin la
     función de render pinta un `<span>`, y el grupo se nombra con su `etiqueta`. */
  const eligiendo = field.kind === 'yesno' || field.kind === 'choice';
  const control = (campo) => (
    <ControlDelAlta
      field={field}
      valor={value}
      campo={campo}
      soloLectura={soloLectura}
      onChange={onChange}
    />
  );

  return (
    <Field
      /* El asterisco y no la palabra «obligatoria» al lado: son hasta diecinueve
         campos y repetir la palabra en cinco de ellos convierte la etiqueta en
         ruido. Lo que las nombra es el aviso de abajo, cuando de verdad faltan. */
      label={obligatoria ? `${field.label} *` : field.label}
      hint={field.hint}
      /* La ayuda ANTES del control, como en el formulario suelto: siempre dice
         cómo se contesta —«los que de verdad te cuadran»— y puesta debajo se lee
         cuando ya has contestado. Ver `Field` y `CampoLibre`. */
      hintArriba
    >
      {eligiendo ? control(null) : (props) => control(props)}
    </Field>
  );
};

/**
 * Dónde cae la respuesta de un campo, y de dónde se lee.
 *
 * Un alta mezcla tres clases de pregunta que no viven en el mismo sitio: las de
 * la ficha van sueltas en el perfil, las que escribe el entrenador van en
 * `custom` y las del cribado en `scoff`. Eso era una pareja de funciones dentro
 * del componente; están fuera porque ahora las usan DOS pantallas —el portal y
 * el ensayo del constructor— y la segunda copia sería la que se quedara atrás
 * el día que aparezca una cuarta bolsa.
 */
export const valorDeCampo = (field, borrador = {}) =>
  field.scoff
    ? borrador.scoff?.[field.id]
    : field.custom
      ? borrador.custom?.[field.id]
      : borrador[field.id];

export const conRespuesta = (borrador, field, valor) =>
  field.scoff
    ? { ...borrador, scoff: { ...borrador.scoff, [field.id]: valor } }
    : field.custom
      ? { ...borrador, custom: { ...borrador.custom, [field.id]: valor } }
      : { ...borrador, [field.id]: valor };

/**
 * EL ALTA, PREGUNTA A PREGUNTA.
 *
 * ══ Por qué se extrae ══════════════════════════════════════════════════════
 *
 * Porque el alta era el único formulario sin ensayo. Los otros tres momentos se
 * contestan en una ventana antes de encenderle nada a nadie; el alta conservaba
 * un «Ver como cliente» que saltaba al portal del cliente abierto, y allí se ve
 * EL ALTA DE ESA PERSONA —otra distinta, y solo si la tiene pendiente—. O sea
 * que el formulario que acabas de montar era justo el que no se podía mirar.
 *
 * Rehacerlo en el constructor habría sido un segundo renderizador del mismo
 * formulario, que es la avería que este producto lleva meses cerrando. Así que
 * el cuerpo sale de aquí y lo montan los dos: el portal le pone su estado, su
 * barra de guardar y su aviso de lo que falta; el ensayo, un borrador que muere
 * al cerrar.
 *
 * ══ UNA HOJA POR CAPÍTULO ══════════════════════════════════════════════════
 *
 * Esto ha sido cuatro cosas antes que ésta, y conviene tenerlas a la vista para
 * no volver a ninguna:
 *
 *   1. **Una pila de diecinueve campos**, todos seguidos.
 *   2. **Una pila POR TANDAS** con la rejilla de dos columnas de cada tanda
 *      entera a la vez: renglones descuadrados, ayuda debajo de unas y no de
 *      otras.
 *   3. **Una pregunta por pantalla**, con su «Atrás» y su «Siguiente». Ordenó el
 *      desorden y cobró un peaje que el dueño señaló en cuanto lo tuvo delante:
 *      **trece toques para contestar trece preguntas**, cada uno sin más premio
 *      que enseñar la siguiente.
 *   4. **La hoja numerada entera**, las trece seguidas en una columna. Y ahí
 *      salió lo contrario: *«todo está como una lista desproporcionada sin
 *      control ni ventanas… los apartados ahora casi ni se ven»*. Medida, esa
 *      hoja son **1.504 px de una tirada** —dos pantallas y media— con el
 *      nombre del capítulo puesto en once píxeles de tinta terciaria, o sea el
 *      elemento más callado de la pantalla haciendo el trabajo de estructurarla.
 *
 * La salida no es ninguna de las cuatro, es la del medio: **un capítulo por
 * hoja**. Trece preguntas en tres hojas son DOS toques, no trece, y cada toque
 * sí compra algo —se acabó «cómo entrenas» y empieza «cómo comes»—, que es la
 * prueba que tiene que pasar un recorrido paginado para ganarse el gesto.
 *
 * ══ Y LOS CAPÍTULOS SE VEN, que era la otra mitad de la queja ══════════════
 *
 * Los nombra el carril de pasos (`CarrilDePasos`, el mismo de la revisión
 * semanal, de «Mandar algo» y del ajuste de la dieta), donde el que toca va en
 * tinta principal, en negrita y con su disco en acento. Dentro de la hoja ya no
 * se repite el nombre: decirlo dos veces a treinta píxeles de distancia es
 * ruido, y en estrecho el carril esconde los que no tocan y deja puesto el que
 * sí (ver `.wiz-mark-k`).
 *
 * El carril se PULSA —`onIr`—, porque aquí no hay nada obligatorio y saltar
 * adelante no deja ninguna respuesta sin dar. Y por eso mismo su visto significa
 * CONTESTADA y no «pasaste»: un capítulo con una pregunta en blanco no lleva
 * visto aunque lo hayas cruzado entero. Eso es lo que hace el `hecho` de cada
 * paso, que `CarrilDePasos` acepta justo para este caso.
 *
 * ── La cuenta de las preguntas NO se reinicia ─────────────────────────────
 * El «01» sigue siendo el primero del alta, no el primero del capítulo: lo que
 * dice ese número es cuánto llevas de lo que te han pedido, y reiniciarlo en
 * cada tanda convertiría trece preguntas en tres cuentas de cuatro.
 *
 * ── Con una sola tanda no hay nada que recorrer ───────────────────────────
 * Ni carril, ni pie: la hoja entera, como estaba. Un carril de un paso es el
 * índice de algo que no se recorre.
 *
 * ══ EL PRECIO, que es real y se paga cosido ════════════════════════════════
 *
 * Esta hoja no vive sola en una ventana. En el portal es UN apartado de la
 * pantalla de alta —la lista de tareas encima, la salud y el cajón de las fotos
 * debajo—, así que hay dos maneras de avanzar en la misma pantalla: bajar, que
 * no se puede quitar, y el pie de este cuerpo.
 *
 * Lo que hace que no se note es que al cambiar de capítulo el cuerpo VUELVE A LA
 * VISTA. Sin eso, quien pulsa «Siguiente» desde el final del capítulo se queda
 * mirando la salud con un capítulo nuevo empezado más arriba, fuera de la
 * pantalla — que es exactamente el mareo que se le teme a la doble navegación.
 * Va por `traeALaVista`, que salta en vez de deslizarse para quien ha pedido
 * menos movimiento.
 */
export const CuerpoDelAlta = ({ form, borrador = {}, onChange }) => {
  const [indice, setIndice] = useState(0);
  const cuerpo = useRef(null);
  /* El primer render no desplaza nada: al abrir la pantalla nadie ha pedido ir
     a ninguna parte, y traer el formulario a la vista al montarlo movería una
     página que la persona acaba de abrir por arriba. */
  const montado = useRef(false);

  const tandas = formSections(form);
  /* El índice sobrevive a que el formulario cambie debajo —en el ensayo, el
     entrenador apaga una tanda y vuelve a mirar—: sin el tope, el capítulo
     cuarto de un formulario que ahora tiene tres deja la hoja en blanco. */
  const i = Math.min(indice, Math.max(tandas.length - 1, 0));
  const conCapitulos = tandas.length > 1;

  useEffect(() => {
    if (!montado.current) {
      montado.current = true;
      return;
    }
    traeALaVista(cuerpo.current, { block: 'start', behavior: 'smooth' });
  }, [i]);

  if (tandas.length === 0) return null;

  /*
    Dónde empieza la cuenta de cada capítulo.

    La numeración corre por encima de las tandas y solo se pinta una, así que no
    vale con un contador que avance según se dibuja: hay que saber cuántas
    preguntas van DELANTE de la que se está enseñando.
  */
  let antes = 0;
  const desde = tandas.map((t) => {
    const d = antes;
    antes += t.fields.length;
    return d;
  });

  const tanda = tandas[i];
  const siguiente = conCapitulos && i < tandas.length - 1 ? tandas[i + 1] : null;

  /* La `key` remonta la ventana al cambiar de capítulo: vuelve a la primera
     pregunta y se reproduce sola la entrada de `.wiz-panel`, la misma animación
     del asistente de la revisión. */
  const ventana = (
    <VentanaDeTanda
      key={tanda.id}
      form={form}
      tanda={tanda}
      primero={desde[i]}
      borrador={borrador}
      onChange={onChange}
      siguiente={siguiente?.label}
      alSiguiente={siguiente ? () => setIndice(i + 1) : null}
      alAnterior={conCapitulos && i > 0 ? () => setIndice(i - 1) : null}
    />
  );

  if (!conCapitulos) return ventana;

  const pasos = tandas.map((t) => ({
    id: t.id,
    titulo: t.label,
    /* Contestada es contestada: basta con que una quede en blanco para que el
       capítulo no lleve visto. Ver `CarrilDePasos`. */
    hecho: t.fields.every((f) => puesto(valorDeCampo(f, borrador))),
  }));

  return (
    <div className="wiz alta-hojas" ref={cuerpo}>
      <CarrilDePasos pasos={pasos} indice={i} onIr={setIndice} />
      {ventana}
    </div>
  );
};

/** Lo que se elige con un toque: contestarlo ya dice que has terminado con ella. */
const seEligeDeUnToque = (field) => field.kind === 'choice' || field.kind === 'yesno';

/**
 * UN CAPÍTULO, VISTO POR UNA VENTANA.
 *
 * ══ La sexta vuelta, y qué corrige ═════════════════════════════════════════
 *
 * Con el capítulo por hoja los apartados se veían, pero dentro de cada uno las
 * preguntas seguían saliendo *«en bloque, juntas, como una lista de la
 * compra»*. Lo que se pidió es que al bajar unas se fueran y otras llegaran.
 *
 * Así que la hoja es una VENTANA de alto fijo por la que pasan las preguntas:
 * cada una encaja arriba (`scroll-snap`), la que está puesta se ve entera y
 * encendida, la anterior se desvanece por el borde de arriba y la siguiente
 * asoma apagada por el de abajo. Todas las hojas miden lo mismo, así que
 * cambiar de capítulo tampoco hace saltar la pantalla.
 *
 * ══ Y NO es «una pregunta por pantalla» (la segunda vuelta, rechazada) ═════
 *
 * Aquella cobraba un toque en «Siguiente» por pregunta. Aquí no hace falta
 * ninguno: se baja con la rueda o el dedo, y lo que se elige de un toque —las
 * opciones, el sí/no— baja SOLO a la siguiente en cuanto se contesta. Enter en
 * un campo de texto hace lo mismo. Los botones del pie están para quien los
 * quiera, no son el camino.
 *
 * ══ Lo que se ve de lado ═══════════════════════════════════════════════════
 *
 * La mira: un punto por pregunta del capítulo, el de la puesta más largo y los
 * contestados en acento. Sustituye a la barra de desplazamiento, que en una
 * ventana de encaje no dice nada útil.
 *
 * Con UNA sola pregunta no hay nada que pase por la ventana: se pinta suelta,
 * a su altura (`data-sola`).
 */
const VentanaDeTanda = ({
  form,
  tanda,
  primero,
  borrador,
  onChange,
  siguiente,
  alSiguiente,
  alAnterior,
}) => {
  const [activa, setActiva] = useState(0);
  const ventana = useRef(null);
  const preguntas = useRef([]);
  const marco = useRef(0);
  const espera = useRef(0);

  const n = tanda.fields.length;
  const sola = n === 1;

  useEffect(
    () => () => {
      cancelAnimationFrame(marco.current);
      clearTimeout(espera.current);
    },
    []
  );

  /* Cuánto aire se deja por encima de la puesta para que asome la anterior. Lo
     dice el CSS (`scroll-padding-top`) y se lee de ahí: una sola fuente. */
  const holgura = (v) => parseFloat(getComputedStyle(v).scrollPaddingTop) || 0;

  const irA = (k) => {
    const v = ventana.current;
    const el = preguntas.current[k];
    if (!v || !el) return;
    setActiva(k);
    v.scrollTo({
      top: el.offsetTop - holgura(v),
      behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth',
    });
  };

  /* La puesta es la que queda más cerca del borde de encaje. Una vez por
     fotograma, no por evento: la rueda dispara decenas. */
  const alMover = () => {
    if (marco.current) return;
    marco.current = requestAnimationFrame(() => {
      marco.current = 0;
      const v = ventana.current;
      if (!v) return;
      const objetivo = v.scrollTop + holgura(v);
      let mejor = 0;
      let distancia = Infinity;
      preguntas.current.forEach((el, k) => {
        if (!el) return;
        const d = Math.abs(el.offsetTop - objetivo);
        if (d < distancia) {
          distancia = d;
          mejor = k;
        }
      });
      setActiva(mejor);
    });
  };

  const contestar = (field, k, valor) => {
    onChange(field, valor);
    /* Solo dentro del capítulo: pasar de capítulo solo, sin que nadie lo pida,
       cambiaría la hoja entera debajo del dedo. Una pausa corta para que se vea
       la opción marcada antes de que se vaya. */
    if (seEligeDeUnToque(field) && valor !== '' && k < n - 1) {
      clearTimeout(espera.current);
      espera.current = setTimeout(() => irA(k + 1), 280);
    }
  };

  /* Enter en un campo pasa a la siguiente y le lleva el foco, como quien tabula;
     en la última del capítulo, al capítulo siguiente. En la última del alta se
     deja pasar: en el portal es guardar. */
  const alTeclear = (e, k) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.nativeEvent.isComposing) return;
    if (k < n - 1) {
      e.preventDefault();
      irA(k + 1);
      preguntas.current[k + 1]?.querySelector('input, button')?.focus({ preventScroll: true });
    } else if (alSiguiente) {
      e.preventDefault();
      alSiguiente();
    }
  };

  const hayAtras = activa > 0 || alAnterior;
  const haySigue = activa < n - 1 || alSiguiente;

  return (
    <div className="wiz-panel">
      <div className="alta-marco">
        <div
          className="alta-ventana"
          ref={ventana}
          data-sola={sola ? '1' : undefined}
          onScroll={sola ? undefined : alMover}
        >
          <div className="libre-campos">
            {tanda.fields.map((field, k) => {
              const valor = valorDeCampo(field, borrador);
              return (
                <div
                  key={field.id}
                  ref={(el) => {
                    preguntas.current[k] = el;
                  }}
                  className={`campo-q es-numerada alta-q${k === activa ? ' is-activa' : ''}`}
                  /* Tocar o tabular a una apagada la trae: no se contesta a
                     ciegas lo que está a medio desvanecer. */
                  onFocus={() => k !== activa && irA(k)}
                  onClick={() => k !== activa && irA(k)}
                  onKeyDown={(e) => alTeclear(e, k)}
                >
                  {/* EL NÚMERO, encendido en cuanto hay respuesta. Corre por
                      encima de los capítulos. */}
                  <span
                    className="feedback-n"
                    data-hecha={puesto(valor) ? '1' : undefined}
                    aria-hidden="true"
                  >
                    {String(primero + k + 1).padStart(2, '0')}
                  </span>
                  <Pregunta
                    field={field}
                    obligatoria={isRequired(form, field.id)}
                    value={valor}
                    onChange={(v) => contestar(field, k, v)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {!sola && (
          <div className="alta-mira" aria-hidden="true">
            {tanda.fields.map((field, k) => (
              <i
                key={field.id}
                data-hecha={puesto(valorDeCampo(field, borrador)) ? '1' : undefined}
                className={k === activa ? 'is-activa' : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/*
        El pie: dos secundarios, porque el botón principal de la pantalla es
        Guardar y aquí no se entrega nada. Dentro del capítulo mueven la
        ventana; en sus bordes, cambian de capítulo.

        Y el que cambia de capítulo LLEVA ESCRITO A DÓNDE VA: en estrecho el
        carril esconde los que no tocan.
      */}
      {(hayAtras || haySigue) && (
        <div className="alta-pie">
          {activa > 0 ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => irA(activa - 1)}>
              <ArrowUp size={15} /> Anterior
            </button>
          ) : (
            alAnterior && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={alAnterior}>
                <ArrowLeft size={15} /> Atrás
              </button>
            )
          )}
          {activa < n - 1 ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm alta-sigue"
              onClick={() => irA(activa + 1)}
            >
              Siguiente <ArrowDown size={15} />
            </button>
          ) : (
            alSiguiente && (
              <button type="button" className="btn btn-secondary btn-sm alta-sigue" onClick={alSiguiente}>
                <span className="alta-sigue-k">{siguiente}</span>
                <ArrowRight size={15} />
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
};

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
  const [borrador, setBorrador] = useState(() => ({
    ...perfil,
    custom: { ...propias },
    /* Las del cribado van en su propia bolsa: no son campos de la ficha. */
    scoff: { ...(perfil.scoff || {}) },
  }));
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

  /*
    El avance se mide sobre lo que hay EN PANTALLA, no sobre lo guardado.

    Contando lo guardado, contestar una pregunta no movía nada hasta pulsar el
    botón: el formulario se quedaba mudo justo mientras se rellena, que es cuando
    la barra sirve de algo. Que pueda decir «10 de 10» con cosas sin mandar no es
    un problema mientras la barra de abajo lo diga — y lo dice.
  */
  const progreso = formProgress(form, borrador);

  const set = (field, valor) => {
    setTocado(true);
    setBorrador((prev) => conRespuesta(prev, field, valor));
  };

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
      /* El cribado, normalizado a booleanos: el `<select>` habla en «true»/«false». */
      if (form.askScreening) {
        respuestas.scoff = {
          ...(perfil.scoff || {}),
          ...Object.fromEntries(SCOFF_QUESTIONS.map((q) => [q.id, scoffBool(borrador.scoff?.[q.id])])),
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
          {progreso.done === progreso.total && <Check size={13} />} {progreso.done} de{' '}
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
        <CuerpoDelAlta form={form} borrador={borrador} onChange={set} />

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
