import { useMemo, useState } from 'react';
import { Eye, RotateCcw } from 'lucide-react';

import { comoProtocoloDesdeElementos, desdeElementos, preguntasDe } from '@/domain/formularios';
import { faltanObligatorias } from '@/domain/formulario';
import { isFormEmpty } from '@/domain/intakeForm';
import { todayISO } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { Notice } from '@/components/ui/primitives';
import { CuerpoDeFormulario } from '@/components/Client/CuerpoDeFormulario';
import { CuerpoDelAlta, conRespuesta } from '@/components/Client/IntakeQuestions';
import { ReviewWizard } from '@/components/anthropometry/ReviewWizard';
import { SessionFeedback } from '@/components/Coach/Workout/SessionFeedback';

/**
 * EL ENSAYO: tu formulario, contestándolo tú, con lo que verá el cliente.
 *
 * ══ Lo que esto arregla ════════════════════════════════════════════════════
 *
 * «Ver como cliente» no enseñaba el formulario: te metía en el portal de una
 * persona de verdad y allí el formulario **solo aparece si está pendiente para
 * ella**. O sea que lo que acabas de montar era justo lo único que no se podía
 * ver. Y la vitrina del lienzo enseña las preguntas apagadas, una a una, sin
 * reglas: en una vitrina no hay respuestas, así que una pregunta condicionada
 * —«esta solo si contesta que sí»— no se ve nunca.
 *
 * Aquí se contesta. Las reglas corren, los campos aparecen y desaparecen, y el
 * botón dice lo que le dirá a él cuando le falte algo.
 *
 * ══ Por qué NO es una maqueta ══════════════════════════════════════════════
 *
 * Porque monta el componente de verdad de cada momento, y no uno parecido:
 *
 *   · **Suelto** — `CuerpoDeFormulario`, el mismo que pinta su pantalla de «lo
 *     que te ha mandado».
 *   · **Al terminar de entrenar** — `SessionFeedback`, que es con el que
 *     contesta de verdad su parte, debajo de la sesión.
 *   · **Cada semana** — `ReviewWizard` ENTERO, que es su revisión: el carril de
 *     pasos, el peso propuesto, las láminas de medición, las tres tomas y el
 *     cuestionario al final.
 *
 * Una maqueta diverge a la tercera semana y la que divergiría sería justo la que
 * el entrenador mira para decidir qué preguntar.
 *
 * ── Y el check-in enseñaba OTRA COSA. Corregido ───────────────────────────
 * Hasta ahora el check-in se ensayaba como una pila de preguntas con una rejilla
 * de medidas debajo, y encima lo decía en voz alta: «además le pide su peso, sus
 * perímetros y sus pliegues, y no se ensayan aquí». Pero el cliente no ve eso ni
 * de lejos —ve un asistente de cuatro pasos—, así que el botón que dice «verlo
 * como cliente» enseñaba una pantalla que no existe en ninguna parte.
 *
 * Ahora monta su asistente de verdad con un cliente de mentira hecho del lienzo
 * que hay delante: el mismo componente, los mismos pasos y las mismas reglas de
 * qué paso existe y cuál no. Lo único que cambia es que al terminar no escribe
 * —`ensayo`—, y el pie lo dice.
 *
 * ── Y no escribe nada ──────────────────────────────────────────────────────
 * Las respuestas viven en un `useState` que muere al cerrar. No hay cliente, no
 * hay envío y no hay fila: es un ensayo, y lo dice el pie.
 */
/**
 * @param medidas El vocabulario de medidas del entrenador. De ahí salen la
 *   unidad, los decimales y el tope de cada una: el elemento del lienzo solo
 *   guarda su id, así que sin el catálogo el ensayo pintaría una glucosa sin
 *   saber que son mg/dL ni que 950 es un dedazo.
 */
export const VistaPreviaFormulario = ({ form, elementos = [], medidas = [], onCerrar }) => {
  /* El borrador del alta arranca con sus dos bolsas puestas: `conRespuesta`
     escribe dentro de `custom` y de `scoff` y sin ellas la primera respuesta a
     una pregunta tuya se perdería. Ver `IntakeQuestions`. */
  const [borrador, setBorrador] = useState({ custom: {}, scoff: {} });

  const esSuelto = form?.momento === 'libre';
  /*
    ══ Y EL ALTA, QUE ERA LA QUE NO SE PODÍA VER ══════════════════════════════

    Tenía su propio «Ver como cliente» que saltaba al portal del cliente abierto
    —`openClientView('/mi/alta')`—, y allí se ve el alta DE ESA PERSONA: otra
    distinta, con sus respuestas, y solo si la tiene pendiente. El formulario
    que acabas de montar era literalmente el único que el botón no enseñaba.

    Ahora se ensaya aquí como los otros tres, y con `CuerpoDelAlta`, que es el
    cuerpo de verdad de su pantalla extraído para los dos.
  */
  const esAlta = form?.momento === 'alta';

  /* Las preguntas tal y como quedarían guardadas. El lienzo del constructor son
     `elementos` y el parte y el check-in se guardan en el modelo viejo, así que
     la traducción es la misma que usa el guardado: sin ella, el ensayo enseñaría
     algo que no es lo que se va a escribir. */
  const preguntas = useMemo(
    () => (esSuelto ? [] : preguntasDe(desdeElementos(form, elementos))),
    [esSuelto, form, elementos]
  );

  /*
    ══ EL CLIENTE DE MENTIRA CON EL QUE SE ENSAYA LA SEMANA ═══════════════════

    Su revisión no es un formulario: es un asistente cuyos pasos SALEN DEL
    PROTOCOLO —el peso salvo que esté oculto, las medidas solo si se piden, las
    fotos solo si se piden, el cuestionario solo si hay preguntas—. Así que para
    montarlo de verdad hace falta un cliente con un protocolo, y el protocolo es
    exactamente lo que el lienzo escribe al guardar (`comoProtocoloDesdeElementos`).

    O sea que no se imita nada: se le da al asistente el mismo protocolo que
    tendrá esa persona el domingo, y él decide sus pasos como decidirá los suyos.

    Las DEFINICIONES de las medidas encendidas van dentro, como en el protocolo
    de verdad: el asistente lee `protocol.medidas` y de ahí saca la unidad y los
    decimales. Sin ellas, una medida encendida no se pintaría.

    `startDate` es hoy porque las fotos se archivan por semana desde el alta y
    aquí no hay alta; nada de lo que se hace en el ensayo se guarda.
  */
  const esSemana = form?.momento === 'semana';
  const clienteDeEnsayo = useMemo(() => {
    if (!esSemana) return null;
    const protocolo = comoProtocoloDesdeElementos(elementos, 'semana');
    const pedidas = new Set(Object.keys(protocolo.checkin || {}));
    return {
      id: 'ensayo',
      name: 'tu cliente',
      /* Puesto a propósito: sin sexo, el paso de medidas abre con un aviso de
         que falta un dato de la ficha de alguien que no existe. */
      gender: 'Hombre',
      startDate: todayISO(),
      preferences: {
        protocol: { ...protocolo, medidas: medidas.filter((m) => pedidas.has(m.id)) },
      },
    };
  }, [esSemana, elementos, medidas]);

  const faltan = esSuelto ? faltanObligatorias(elementos, borrador) : [];
  const hayHoja = esAlta ? !isFormEmpty(form) : esSuelto ? elementos.length > 0 : preguntas.length > 0;
  const vacio = !hayHoja;

  /*
    Vaciarlo: el alta necesita sus dos bolsas de vuelta, no un objeto pelado.

    Y el alta se recorre por capítulos, con su índice dentro de `CuerpoDelAlta`
    —que es donde tiene que estar: el portal tampoco quiere ese estado fuera—.
    Borrar las respuestas y dejarte en el capítulo tres no es empezar de nuevo,
    así que la `vuelta` remonta el cuerpo y con él su índice.
  */
  const [vuelta, setVuelta] = useState(0);
  const empezarDeNuevo = () => {
    setBorrador(esAlta ? { custom: {}, scoff: {} } : {});
    setVuelta((v) => v + 1);
  };
  const tocado = Object.keys(borrador).some(
    (k) => (k === 'custom' || k === 'scoff' ? Object.keys(borrador[k] || {}).length > 0 : true)
  );

  /*
    ══ LA SEMANA SE ENSAYA ENTERA ═════════════════════════════════════════════

    Y se va por aquí, sin el diálogo de esta pantalla: el asistente ES un
    diálogo, con su carril de pasos, su pie y su botón de entregar, y meterlo
    dentro de otro serían dos ventanas apiladas —el `Escape` cerraría la que no
    toca— para enseñar una pantalla que él ve sola.

    Un check-in sin ningún elemento sí cae al aviso de siempre: el asistente
    tiene un paso de cortesía para quien no tiene nada que hacer, y enseñárselo
    al entrenador que acaba de abrir un formulario vacío no le dice lo que
    necesita saber, que es que todavía no ha puesto nada.
  */
  if (esSemana && elementos.length > 0) {
    return (
      <ReviewWizard
        ensayo
        client={clienteDeEnsayo}
        history={[]}
        audience="client"
        onAdd={() => {}}
        /* Con selector de fotos: si el formulario las pide, el paso existe. Lo
           que se elija aquí no sube a ninguna parte — `ensayo` corta el final. */
        photos={[]}
        onUploadPhoto={async () => ({ ok: true })}
        onClose={onCerrar}
      />
    );
  }

  return (
    <Modal
      /* `lg` porque la hoja del cliente es una columna de lectura de 880 px
         (`--max-w-columna`): en el ancho de un diálogo normal, un formulario de
         catorce preguntas se lee más estrecho de lo que lo verá él, y el ensayo
         dejaría de contestar la pregunta que se le hace. */
      size="lg"
      title="Como lo verá tu cliente"
      onClose={onCerrar}
      footer={
        <div className="row between gap-2 wrap">
          <span className="t-xs t-tertiary">
            Es un ensayo: lo que contestes aquí no se guarda en ningún sitio.
          </span>
          <div className="row gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={empezarDeNuevo}
              disabled={!tocado}
            >
              <RotateCcw size={15} /> Empezar de nuevo
            </button>
            <button type="button" className="btn btn-primary" onClick={onCerrar}>
              Seguir montándolo
            </button>
          </div>
        </div>
      }
    >
      <div className="col gap-4">
        {vacio ? (
          <Notice tone="info">
            <Eye size={15} aria-hidden="true" /> Todavía no le preguntas nada: añade la primera y
            vuelve a mirar.
          </Notice>
        ) : (
          <>
            {/*
              Dónde le llega. Va arriba y no al pie: quien abre esto está
              comprobando si está bien montado, y enterarse al final de que
              estaba mirando media pantalla es peor que saberlo antes de empezar.

              Y sale DERIVADO, no escrito a mano. Lo estuvo una versión y decía
              «su peso y sus fotos» a un protocolo que no pide peso: un texto
              fijo dentro de una pantalla que existe para no mentir es la peor
              línea que se puede escribir.
            */}
            {esAlta && (
              <p className="t-xs t-tertiary" style={{ margin: 0 }}>
                Es lo primero que le pides: le llega en su portal el día que entra, y puede dejarlo
                a medias y volver.
              </p>
            )}

            {!esSuelto && !esAlta && (
              <p className="t-xs t-tertiary" style={{ margin: 0 }}>
                Así le llega al terminar de entrenar, debajo de su sesión.
              </p>
            )}

            <div className="hoja-libre vista-previa">
              {/*
                El título SOLO en el suelto, que es el único que le llega como
                hoja con nombre. Su check-in y su parte son un tramo dentro de
                otra pantalla —el asistente, la sesión— y ahí el nombre que tú le
                pusiste al formulario no lo ve nadie: enseñarlo aquí sería
                inventarse un encabezado que él no tiene.
              */}
              {esSuelto && (
                <header className="libre-cab">
                  <h1 className="libre-tit">{form?.name || 'Sin título'}</h1>
                </header>
              )}

              {esAlta ? (
                <div className="col gap-4">
                  <CuerpoDelAlta
                    key={vuelta}
                    form={form}
                    borrador={borrador}
                    onChange={(field, valor) =>
                      setBorrador((prev) => conRespuesta(prev, field, valor))
                    }
                  />
                </div>
              ) : esSuelto ? (
                <CuerpoDeFormulario
                  elementos={elementos}
                  borrador={borrador}
                  onChange={(id, v) => setBorrador((prev) => ({ ...prev, [id]: v }))}
                />
              ) : (
                /* El parte: dos o tres preguntas debajo de su sesión. Sin
                   numerar, que es como le llegan —el cuaderno de detrás no va
                   numerado y un «01» suelto diría que hay una secuencia que no
                   hay—. La semana no pasa por aquí: se ensaya con su asistente. */
                <SessionFeedback
                  questions={preguntas}
                  answers={borrador}
                  title="Cómo ha ido"
                  onChange={(id, value) => setBorrador((prev) => ({ ...prev, [id]: value }))}
                />
              )}

              {/* El pie del cliente, con su botón y su cuenta de lo que falta.
                  Sin `onClick`: aquí no se entrega nada, y un botón que no hace
                  nada es exactamente lo que hay que enseñar de un ensayo. */}
              {esSuelto && (
                <div className="libre-pie">
                  <button type="button" className="btn btn-primary" disabled>
                    Enviárselo
                  </button>
                  {faltan.length > 0 && (
                    <span className="libre-nota">
                      {faltan.length === 1
                        ? 'Le falta una respuesta.'
                        : `Le faltan ${faltan.length} respuestas.`}
                    </span>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
