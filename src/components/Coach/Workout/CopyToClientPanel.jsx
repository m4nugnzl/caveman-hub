import { useId, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Copy, Layers, Salad, Users, Waves } from 'lucide-react';

import { unitLabelPlural } from '@/domain/training';
import { Notice, OptionCard } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { CarrilDePasos } from '@/components/ui/Asistente';
import { useToast } from '@/components/ui/ToastProvider';

/**
 * Réplica de un cliente a otro.
 *
 * Antes solo copiaba días o semanas del entrenamiento, y dejaba fuera la
 * estructura semanal y el tipo de ciclo — así que el programa llegaba a medias:
 * los días existían pero no la planificación de la semana. Y no había forma de
 * traerse la dieta, que es la otra mitad del trabajo cuando montas a un cliente
 * nuevo como otro que ya tienes.
 *
 * Ahora se elige **entrenamiento, dieta o las dos cosas**. Copiar SUSTITUYE lo
 * que el destino tuviera de esos bloques, así que la confirmación lo dice
 * explícitamente antes de tocar nada.
 *
 * ── El mismo panel, con un solo bloque ──────────────────────────────────────
 * `bloques` dice qué se ofrece. Entreno lo abre con los tres; Dieta lo abre con
 * `['diet']`, porque allí la pregunta no es «qué me llevo» sino «de quién»:
 * ofrecer desde la dieta sustituir doce semanas de programa sería abrir una
 * puerta a otra sección. Con un solo bloque no hay nada que elegir —viene
 * marcado y el selector no se pinta—, pero la confirmación, los tres finales y
 * el aviso de qué se sustituye son exactamente los mismos.
 */
export const CopyToClientPanel = ({
  clients,
  activeClient,
  cycleType,
  weekCount,
  hasProgram,
  hasDiet,
  hasWarmup,
  conNutricion = true,
  bloques = ['training', 'warmup', 'diet'],
  onReplicate,
  onClose,
}) => {
  const toast = useToast();
  const formId = useId();
  const [paso, setPaso] = useState(0);
  const [sourceId, setSourceId] = useState('');
  const [busca, setBusca] = useState('');
  /*
    ══ Nada viene marcado ═════════════════════════════════════════════════════

    Copiar SUSTITUYE lo que el destino tuviera, así que llegar con una casilla ya
    puesta es llegar armado: basta con elegir de quién y pulsar para reemplazar
    doce semanas de programa sin haber decidido nada.

    Y era además lo que rompía la movilidad: «Entrenamiento» venía marcado y la
    casilla del calentamiento estaba `disabled` mientras lo estuviera, así que
    NACÍA BLOQUEADA. Para poder pulsarla había que descubrir primero que hay que
    desmarcar la de arriba, cosa que no dice nadie.
  */
  /* …salvo cuando solo se ofrece un bloque: ahí no hay nada que armar —es ese
     bloque o nada—, y la decisión que queda, de quién, sigue siendo explícita. */
  const soloUno = bloques.length === 1;
  const [training, setTraining] = useState(soloUno && bloques[0] === 'training');
  const [warmup, setWarmup] = useState(soloUno && bloques[0] === 'warmup');
  const [diet, setDiet] = useState(soloUno && bloques[0] === 'diet' && conNutricion);
  const [result, setResult] = useState(null);

  const others = clients.filter((c) => c.id !== activeClient.id);
  const source = others.find((c) => c.id === sourceId) || null;
  const nothingSelected = !training && !diet && !warmup;
  /* El buscador solo aparece con cartera larga (ver el paso ①): con cinco
     clientes, un campo de búsqueda encima de cinco nombres es un mando que
     sobra. */
  const losQueSalen = busca.trim()
    ? others.filter((c) => c.name.toLowerCase().includes(busca.trim().toLowerCase()))
    : others;

  /*
    ══ AQUÍ ESTUVO EL DIÁLOGO DE CONFIRMACIÓN ════════════════════════════════
    `useConfirm` abría una ventana ENCIMA de esta para preguntar lo que esta
    misma podía decir, con el agravante de que la de debajo era un panel
    incrustado en la página y la de encima una ventana de verdad: dos
    superficies distintas para una sola decisión.

    Lo que decía aquel diálogo —de quién a quién, qué viene y qué se sustituye—
    es hoy el TERCER PASO, y el botón del pie es el que confirma. Una sola
    pregunta, en la superficie en la que ya estabas mirando. No se pierde la
    protección: al último paso no se llega sin haber contestado los anteriores,
    el resumen dice en rojo qué se va a sustituir y el botón cambia de rótulo a
    «Sustituir y copiar» cuando de verdad se lleva algo por delante.
  */
  const copiar = async () => {
    if (!source || nothingSelected) return;

    const done = await onReplicate(sourceId, { training, diet, warmup });
    const NOMBRES = { training: 'entrenamiento', warmup: 'calentamiento', diet: 'dieta' };
    const copied = ['training', 'warmup', 'diet'].filter((k) => done[k]).map((k) => NOMBRES[k]);
    const fallidos = (done.failed || []).map((k) => NOMBRES[k]);

    /*
      ── Tres finales, no dos ──────────────────────────────────────────────────
      «No se pudo leer» era antes «no tiene datos», y son cosas opuestas: la
      primera se arregla volviendo a pulsar y la segunda significa que ahí no hay
      nada que traer. Confundirlas hacía que un fallo de red pareciera un cliente
      sin dieta, y nadie reintenta lo que cree vacío.
    */
    if (fallidos.length > 0) {
      const copiadoTambien = copied.length > 0 ? ` Sí se copió: ${copied.join(' y ')}.` : '';
      setResult({
        tone: 'error',
        text: `No se pudo leer ${fallidos.join(' y ')} de ${source.name}. Inténtalo otra vez.${copiadoTambien}`,
      });
      return;
    }

    /*
      ── Salió bien: el panel se CIERRA ────────────────────────────────────
      Copiar es un encargo, no una sesión de trabajo: se elige de quién, se
      copia y se acabó. El panel se quedaba abierto con su aviso verde encima
      del menú que se acababa de traer, así que había que leerlo, entenderlo y
      cerrarlo a mano para ver el resultado — y hasta entonces tapaba justo lo
      que confirmaba. Lo que se hizo se dice en el aviso efímero, que es lo que
      esta casa usa para «ya está», y la pantalla se queda en lo copiado.

      Los otros dos finales SÍ se quedan: un fallo se reintenta desde aquí y un
      cliente sin datos pide elegir otro. Cerrar en esos casos sería esconder la
      única pieza donde continuar.
    */
    if (copied.length > 0) {
      toast({ text: `Copiado de ${source.name}: ${copied.join(' y ')}.` });
      onClose();
      return;
    }

    setResult({ tone: 'warn', text: `${source.name} no tiene datos en los bloques seleccionados.` });
  };

  /* Sin nadie de quien traer, la ventana lo dice y se cierra: los dos sitios que
     la abren ya no la ofrecen en ese caso, así que esto es el cinturón. */
  if (others.length === 0) {
    return (
      <Modal open onClose={onClose} size="md" title="Traer de otro cliente" icono={Users}>
        <Notice tone="info">Necesitas al menos dos clientes para copiar entre ellos.</Notice>
      </Modal>
    );
  }

  /*
    ══ EL CARRIL DE PASOS ════════════════════════════════════════════════════
    Dos o tres, según lo que haya que contestar: de quién siempre, qué se copia
    solo cuando hay más de un bloque que ofrecer, y el resumen siempre. El
    resumen es un paso y no una pantalla de cortesía: es DONDE SE CONFIRMA, y
    por eso existe aunque solo se ofrezca la dieta.
  */
  const PASOS = [
    { id: 'quien', titulo: 'De quién' },
    ...(soloUno ? [] : [{ id: 'que', titulo: 'Qué se copia' }]),
    { id: 'resumen', titulo: 'Confirmar' },
  ];
  const indice = Math.min(paso, PASOS.length - 1);
  const actual = PASOS[indice];
  /* No se avanza sin contestar: sin cliente elegido no hay nada que copiar, y
     sin bloque marcado tampoco. El carril informa y no navega (`onIr` va sin
     poner) por lo mismo — saltar al resumen dejaría la pregunta sin dar. */
  const puedeSeguir =
    actual.id === 'quien' ? Boolean(source) : actual.id === 'que' ? !nothingSelected : true;

  /* Lo que se va a sustituir, dicho con nombre y apellidos. Es la frase que
     antes vivía dentro del diálogo de confirmación; ahora ES el último paso. */
  const loQueViene = [
    training && 'el programa de entrenamiento',
    !training && warmup && 'el calentamiento',
    diet && 'el plan nutricional',
  ]
    .filter(Boolean)
    .join(' y ');
  const loQueSeSustituye = [
    training && hasProgram && 'su programa actual',
    !training && warmup && hasWarmup && 'su calentamiento actual',
    diet && hasDiet && 'su dieta actual',
  ]
    .filter(Boolean)
    .join(' y ');

  const avanzar = (event) => {
    event.preventDefault();
    if (puedeSeguir && actual.id !== 'resumen') {
      setPaso(indice + 1);
      return;
    }
    if (actual.id === 'resumen') copiar();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={soloUno && bloques[0] === 'diet' ? 'Traer la dieta de otro cliente' : 'Traer de otro cliente'}
      sub={`A la ficha de ${activeClient.name}`}
      icono={Users}
      footer={
        <>
          {/* En el primer paso «Cancelar» va sin caja y en los demás «← Atrás»
              con ella: irse de una ventana sin haber tocado nada no es un mando
              que compita con «Siguiente», y volver un paso sí. La misma regla
              que el asistente del objetivo. */}
          <button
            type="button"
            className={indice === 0 ? 'btn btn-plain' : 'btn btn-secondary'}
            onClick={indice === 0 ? onClose : () => setPaso(indice - 1)}
          >
            {indice === 0 ? (
              'Cancelar'
            ) : (
              <>
                <ChevronLeft size={15} /> Atrás
              </>
            )}
          </button>
          <button
            type="submit"
            form={formId}
            /* En rojo cuando de verdad sustituye algo. Es la única pantalla del
               flujo en la que el botón se lleva por delante el trabajo de otro,
               y el color es lo que lo dice antes de pulsarlo. */
            className={`btn ${actual.id === 'resumen' && loQueSeSustituye ? 'btn-danger' : 'btn-primary'}`}
            disabled={!puedeSeguir}
          >
            {actual.id === 'resumen' ? (
              <>
                <Copy size={15} /> {loQueSeSustituye ? 'Sustituir y copiar' : 'Copiar'}
              </>
            ) : (
              <>
                Siguiente <ChevronRight size={15} />
              </>
            )}
          </button>
        </>
      }
    >
      <form id={formId} className="wiz" onSubmit={avanzar}>
        <CarrilDePasos pasos={PASOS} indice={indice} />

        {result && <Notice tone={result.tone}>{result.text}</Notice>}

        {/* La `key` remonta el panel al cambiar de paso: la animación de entrada
            se reproduce y la ventana vuelve arriba. */}
        <div className="wiz-panel" key={actual.id}>
          {/* ── ① DE QUIÉN ───────────────────────────────────────────────
              Una lista y no un desplegable. En un paso propio hay sitio, y lo
              que se elige es una PERSONA: verlas es media respuesta, mientras
              que un `select` obliga a abrirlo para saber siquiera a quién
              tienes. Es la misma pieza con la que se elige en el resto de la
              casa (`OptionCard`). */}
          {actual.id === 'quien' && (
            <>
              <p className="t-sm t-secondary">
                El cliente que ya tiene lo que quieres replicar. Se copia de él a{' '}
                <strong>{activeClient.name}</strong>, nunca al revés.
              </p>
              {others.length > 6 && (
                <label className="field">
                  <span className="field-label">Buscar</span>
                  <input
                    className="input"
                    type="search"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Nombre del cliente"
                    autoFocus
                  />
                </label>
              )}
              <div className="opt-group copia-clientes">
                {losQueSalen.map((client) => (
                  <OptionCard
                    key={client.id}
                    unaSola
                    name="copia-desde"
                    label={client.name}
                    checked={client.id === sourceId}
                    onChange={() => {
                      setSourceId(client.id);
                      setResult(null);
                    }}
                  />
                ))}
              </div>
              {losQueSalen.length === 0 && (
                <Notice tone="info">Ningún cliente se llama así.</Notice>
              )}
            </>
          )}

          {/* ── ② QUÉ SE COPIA ───────────────────────────────────────────
              Las mismas tarjetas de siempre, pero ahora a lo ancho de su propio
              paso: antes compartían renglón con el selector de cliente y con los
              dos botones, y el renglón las dejaba a media altura de la ventana
              con el aire repartido a ojo. */}
          {actual.id === 'que' && (
            <>
              <p className="t-sm t-secondary">
                Qué te llevas de <strong>{source?.name}</strong>.
              </p>
              <div className="opt-group">
                {bloques.includes('training') && (
                  <OptionCard
                    icon={Layers}
                    label="Entrenamiento"
                    hint={`Estructura semanal, ${weekCount} ${unitLabelPlural(cycleType)}, tipo de ciclo y su calentamiento.`}
                    checked={training}
                    onChange={setTraining}
                  />
                )}
                {/*
                  El calentamiento va aparte de «Entrenamiento» porque es lo que
                  MÁS se repite entre clientes —la misma pauta articular para
                  media cartera— mientras que el programa es lo que menos.
                  Mezclarlos obligaba a sustituir doce semanas de trabajo para
                  traerse cuatro estiramientos. Y no se desactiva: la redundancia
                  se DICE, no se prohíbe.
                */}
                {bloques.includes('warmup') && (
                  <OptionCard
                    icon={Waves}
                    label="Calentamiento y movilidad"
                    hint={
                      training
                        ? 'Ya va incluido con el entrenamiento.'
                        : 'Solo la pauta previa a entrenar, sin tocar su programa.'
                    }
                    checked={warmup || training}
                    onChange={setWarmup}
                  />
                )}
                {/* La dieta solo si a esta persona se la llevas: copiarle un plan
                    nutricional a un cliente de solo entrenamiento lo dejaría
                    guardado en una sección que ni él ni tú podéis abrir. */}
                {conNutricion && bloques.includes('diet') && (
                  <OptionCard
                    icon={Salad}
                    label="Dieta"
                    hint="Objetivo, macros, menú cerrado y tus pautas."
                    checked={diet}
                    onChange={setDiet}
                  />
                )}
              </div>
            </>
          )}

          {/* ── ③ CONFIRMAR ──────────────────────────────────────────────
              Aquí estaba el diálogo de confirmación que se abría al pulsar
              «Copiar». Era una ventana encima de otra ventana diciendo lo que la
              de debajo ya podía decir, así que su contenido sube al último paso
              y el botón del pie pasa a ser el que confirma. Una sola pregunta y
              en el sitio donde se estaba mirando. */}
          {actual.id === 'resumen' && (
            <>
              <div className="copia-resumen">
                <span className="copia-resumen-quien">{source?.name}</span>
                <ArrowRight size={18} aria-hidden="true" className="copia-resumen-flecha" />
                <span className="copia-resumen-quien is-destino">{activeClient.name}</span>
              </div>
              <p className="t-sm t-secondary">
                Se trae <strong>{loQueViene}</strong>.
              </p>
              {loQueSeSustituye ? (
                <Notice tone="warn">
                  Esto sustituye {loQueSeSustituye} de {activeClient.name}. No se puede deshacer.
                </Notice>
              ) : (
                <Notice tone="info">
                  {activeClient.name} no tiene nada en esos bloques, así que no se sobrescribe nada.
                </Notice>
              )}
              {/* Qué NO se lleva, dicho antes de pulsar. */}
              {training && (
                <p className="t-xs t-tertiary">
                  No se copian las sesiones registradas: son el registro de lo que ejecutó otra persona y
                  no tienen sentido en esta ficha.
                </p>
              )}
              {/*
                ── Y en qué se diferencia de copiar una pieza ──────────────
                Ésta es una de las cuatro puertas que parecen la misma —el
                portapapeles, traer un día, traer un fichero y esto— y era la
                única que no decía en qué se distingue: las otras tres AÑADEN una
                pieza donde tú la sueltes y ésta REEMPLAZA el plan entero de una
                persona por el de otra.
              */}
              <p className="t-xs t-tertiary">
                Esto trae el plan <strong>entero</strong>. Para llevarte solo un día o una comida,
                cópialos desde su ficha: se quedan en tu mano y los pegas donde quieras.
              </p>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
};