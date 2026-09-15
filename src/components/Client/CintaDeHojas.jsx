import { useEffect, useRef } from 'react';

import { Panel, Switch } from '@/components/ui/primitives';
import { traeALaVista } from '@/lib/motion';
import { useDeslizar } from '@/lib/useDeslizar';
import { tramoDeHojas } from './hojas';

/**
 * Las piezas con las que se RECORRE la rutina: la pastilla de una sesión, la
 * cinta que las pone en fila, la hoja del microciclo que aún no existe y el
 * marco que las junta en el teléfono.
 *
 * La pastilla la usan las dos geometrías —en el ordenador es la rejilla de días
 * de la semana; en el teléfono, la cinta—, así que vive aquí y no en ninguna de
 * las dos.
 */

/** Una sesión en la tira: qué toca, si es hoy y cuántas series llevas. */
export const DayPill = ({ entry, active, onOpen }) => {
  const done = entry.planned > 0 && entry.logged >= entry.planned;

  return (
    <button
      type="button"
      className={`day-pill${entry.isToday ? ' is-today' : ''}${done ? ' is-done' : ''}`}
      aria-pressed={active}
      onClick={onOpen}
    >
      {/*
        ══ El rótulo solo cuando dice algo ═══════════════════════════════════

        `lead` es dos cosas distintas. Con reparto por días es el día de la
        semana —«MIÉ»—, y eso es información: contesta «¿esta es la de hoy?».
        Sin reparto es «Sesión 1», «Sesión 2»… o sea la POSICIÓN de la tarjeta,
        que ya dice el orden en el que están puestas, encima del nombre que ya
        las distingue.

        Y ese caso no es raro: es el de todo cliente al que su entrenador aún no
        le ha asignado días, que son casi todos al principio. Ahí la tira gastaba
        un renglón entero por tarjeta en repetir el orden, y como cuatro tarjetas
        no caben en 390 px, ese renglón se pagaba DOS veces —una por fila— justo
        encima del primer ejercicio.
      */}
      {entry.lead && (
        <span className="lead">
          {entry.lead}
          {entry.isToday && <span className="dot" aria-label="hoy" />}
        </span>
      )}
      <span className="nm">{entry.name}</span>
      <span className="pg">{entry.planned > 0 ? `${entry.logged}/${entry.planned}` : 'sin series'}</span>
    </button>
  );
};

/**
 * Los extremos de la cinta: a qué microciclo se va, en dos caracteres.
 *
 * El de la derecha, cuando ya no hay más programa montado, es el que ABRE el
 * siguiente. Lleva un «+» delante por lo mismo que lo llevaba en el carril
 * viejo: es el único destino de la tira que no existe todavía.
 */
const MarcaDeCinta = ({ corta, larga, nueva, activa, onIr }) => {
  /* Dos caracteres en pantalla y la frase entera para quien la escucha: «M3» no
     es un nombre, es una abreviatura que solo se entiende con la tira delante. */
  const dice = nueva ? `Empezar el ${larga}` : `Ir al ${larga}`;

  return (
    <button
      type="button"
      className={`cinta-marca${nueva ? ' is-nueva' : ''}`}
      aria-pressed={activa}
      aria-label={dice}
      title={dice}
      onClick={onIr}
    >
      {nueva ? '+ ' : ''}
      {corta}
    </button>
  );
};

/**
 * ══ LA CINTA ═════════════════════════════════════════════════════════════════
 *
 * Una tira de una sola línea que hace dos trabajos a la vez y por eso cabe:
 * dice DÓNDE estás dentro del microciclo —sus sesiones, con la de hoy marcada y
 * cuánto llevas de cada una— y es por donde se salta a las de al lado. En los
 * extremos, dos marcas cortas: el microciclo anterior y el siguiente.
 *
 * Sustituye a tres piezas apiladas que decían lo mismo por turnos —la miga de
 * tres tramos, el carril de microciclos y la rejilla de días—, y que entre las
 * tres se comían la pantalla antes del primer ejercicio.
 *
 * ── Por qué las marcas de los extremos son cortas ───────────────────────────
 * Porque no son destinos que se elijan, son la prueba de que la cinta sigue.
 * Con el nombre entero pesarían igual que una sesión, y la tira dejaría de
 * decir de un vistazo cuál es el microciclo que se está entrenando.
 */
const CintaDeHojas = ({ hojas, indice, onIr, etiquetaCorta, etiquetaLarga }) => {
  const { desde, hasta, anterior, siguiente } = tramoDeHojas(hojas, indice);
  const marcada = useRef(null);

  /* La tira se sale de 390 px en cuanto hay cuatro sesiones, así que la hoja
     abierta se trae al centro cuando cambia: si no, entrenas el jueves mirando
     una tira que empieza el lunes y no ves dónde estás. */
  useEffect(() => {
    const pastilla = marcada.current;
    if (pastilla && typeof pastilla.scrollIntoView === 'function') {
      traeALaVista(pastilla, { inline: 'center', block: 'nearest' });
    }
  }, [indice]);

  if (hojas.length === 0) return null;

  return (
    /* `data-sin-deslizar`: esta tira ya se mueve a lo ancho con el dedo. Sin la
       marca, arrastrarla cambiaría además de hoja. Ver `lib/useDeslizar`. */
    <nav className="cinta-tira" aria-label="Tus sesiones" data-sin-deslizar>
      {anterior >= 0 && (
        <MarcaDeCinta
          corta={etiquetaCorta(hojas[anterior])}
          larga={etiquetaLarga(hojas[anterior])}
          activa={indice === anterior}
          onIr={() => onIr(anterior)}
        />
      )}

      {hojas.slice(desde, hasta + 1).map((hoja, i) => (
        <div className="cinta-hueco" key={hoja.clave} ref={desde + i === indice ? marcada : null}>
          <DayPill entry={hoja.entry} active={desde + i === indice} onOpen={() => onIr(desde + i)} />
        </div>
      ))}

      {siguiente >= 0 && (
        <MarcaDeCinta
          corta={etiquetaCorta(hojas[siguiente])}
          larga={etiquetaLarga(hojas[siguiente])}
          nueva={hojas[siguiente].tipo === 'nueva'}
          activa={indice === siguiente}
          onIr={() => onIr(siguiente)}
        />
      )}
    </nav>
  );
};

/**
 * ══ LA ÚLTIMA HOJA: el microciclo que aún no existe ══════════════════════════
 *
 * Quien monta el plan es el entrenador; quien lo RECORRE es el cliente, y hasta
 * que no empieza el microciclo siguiente no tiene dónde apuntar. Ese gesto —el
 * más repetido de su portal, uno cada siete días— estuvo escondido en una marca
 * de 34 px dentro de la línea de bloques y luego en un carril de píldoras.
 *
 * Aquí es a donde llegas al pasar la última hoja: acabas la última sesión,
 * deslizas una vez más y lo que hay es esto. No hay que encontrarlo.
 *
 * ── Y también sale en la portada, con otro rótulo ──────────────────────────
 * El día que se cierra el microciclo, esto mismo abre su inicio: allí el rótulo
 * dice de dónde viene la oferta —«Has cerrado el microciclo 2»— y la tarjeta se
 * levanta, porque es lo único de la pantalla que espera una decisión suya. Es
 * la MISMA pieza y no una copia: la frase de lo que se copia, el verbo y lo que
 * pasa al pulsarlo tienen que decir lo mismo en los dos sitios.
 *
 * ── Y la casilla de que se abra solo ───────────────────────────────────────
 * Solo donde la tarjeta DECIDE, que es la portada. La oferta y el ajuste dicen
 * lo mismo con distinto alcance —«ábrelo» y «ábrelos siempre»—, así que el
 * sitio de la segunda es debajo de la primera, en el momento en que la pregunta
 * tiene sentido. En la cinta no está: allí esto es una hoja más del programa y
 * un ajuste permanente dentro de una hoja sería un panel de preferencias
 * escondido en mitad de la rutina.
 *
 * @param rotulo  Lo que va encima del nombre. Por defecto, «Lo que viene».
 * @param decide  Levanta la tarjeta. Solo donde es la decisión de la pantalla.
 * @param seguirSolo    Si ya lo tiene pedido. Ver `abreSoloElCiclo`.
 * @param onSeguirSolo  Sin él no hay casilla.
 */
export const HojaNueva = ({
  unidad,
  numero,
  onContinuar,
  rotulo = 'Lo que viene',
  decide = false,
  seguirSolo = false,
  onSeguirSolo = null,
}) => {
  const nombre = `${unidad.toLowerCase()} ${numero}`;

  return (
    <Panel className={`col gap-4 hoja-nueva${decide ? ' card-aviso' : ''}`}>
      <div className="col gap-1">
        <span className="section-label">{rotulo}</span>
        {/* En la cinta, el nombre de la hoja: es una hoja más y se llama como
            las otras. En la portada es una OFERTA, y una oferta se dice con un
            verbo — «Te toca el microciclo 3», que es lo que el prototipo pone
            de titular. El mismo dato, dicho como lo que es en cada sitio. */}
        <h3 className="day-name">
          {decide ? `Te toca el ${nombre}` : `${unidad} ${numero}`}
        </h3>
      </div>
      <p className="t-sm t-secondary">
        Se copia del anterior con los mismos ejercicios, tus notas y las de tu entrenador. Los kilos
        los apuntas tú.
      </p>
      <button type="button" className="btn btn-primary btn-block" onClick={onContinuar}>
        Empezar el {nombre}
      </button>
      {/* Un interruptor y no una casilla de tarea: esto no es algo que se marque
          hecho, es un ajuste que queda puesto a partir de ahora. Ver `Switch`. */}
      {decide && onSeguirSolo && (
        <Switch
          label="Que el siguiente se abra solo al cerrar este"
          checked={seguirSolo}
          onChange={onSeguirSolo}
        />
      )}
    </Panel>
  );
};

/**
 * ══ LA RUTINA EN HOJAS: lo que ve el teléfono ════════════════════════════════
 *
 * Tres piezas y ninguna más: una línea que dice dónde estás, la cinta, y la
 * hoja. Lo que en el ordenador son cuatro planos de mandos aquí es el gesto de
 * pasar página, que es lo que ya sabe hacer cualquiera con un teléfono en la
 * mano y lo que se hereda tal cual el día que esto sea una aplicación nativa.
 *
 * ── Por qué la hoja no se anima al cambiar ──────────────────────────────────
 * Porque la hoja no es una tarjeta: son dos mil píxeles de sesión con veinte
 * campos dentro. Deslizar cuatro pantallas de alto de un lado a otro es un
 * efecto que se nota mucho más que el contenido, y se hace veinte veces por
 * entreno. Lo que sí se mueve es la tira, que trae al centro la hoja abierta.
 */
export const HojasDelPrograma = ({
  hojas,
  indice,
  onIr,
  etiquetaCorta,
  etiquetaLarga,
  donde,
  children,
}) => {
  const marco = useRef(null);
  const yaMontada = useRef(false);

  const irRelativo = (paso) => {
    /* Desde fuera de la cinta —un microciclo sin días— cualquiera de los dos
       lados lleva a la última hoja, que es de donde se viene. */
    const destino = indice < 0 ? hojas.length - 1 : indice + paso;
    if (destino >= 0 && destino < hojas.length) onIr(destino);
  };

  const gestos = useDeslizar({
    activo: hojas.length > 1,
    onAnterior: () => irRelativo(-1),
    onSiguiente: () => irRelativo(1),
  });

  /*
    Al cambiar de hoja se vuelve arriba.

    Se pasa hoja estando abajo del todo —se acaba el último ejercicio y se mira
    qué toca mañana—, y sin esto la hoja siguiente se abría por su mitad, en un
    ejercicio cualquiera y sin la cabecera que dice de cuál se trata.

    En el primer render no: ahí la página se está pintando y llevarla a la cinta
    se llevaría por delante el título de la pantalla, que nadie ha pedido mover.
  */
  useEffect(() => {
    if (!yaMontada.current) {
      yaMontada.current = true;
      return;
    }
    if (typeof marco.current?.scrollIntoView === 'function') {
      traeALaVista(marco.current, { block: 'start' });
    }
  }, [indice]);

  return (
    <div className="hojas" ref={marco}>
      {/* Dónde estás, en UNA línea: el bloque y por qué microciclo vas. Era una
          miga de tres tramos con vuelta a un nivel que en el teléfono no
          existe. */}
      <p className="cinta-donde">{donde}</p>

      <CintaDeHojas
        hojas={hojas}
        indice={indice}
        onIr={onIr}
        etiquetaCorta={etiquetaCorta}
        etiquetaLarga={etiquetaLarga}
      />

      <div className="hoja" {...gestos}>
        {children}
      </div>
    </div>
  );
};
