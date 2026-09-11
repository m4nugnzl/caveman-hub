import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Repeat, Send, Users } from 'lucide-react';

import { useActions, useApp } from '@/context/AppContext';
import {
  AUDIENCIAS,
  CUANDOS,
  MAX_DESTINATARIOS,
  MAX_NOTA,
  QUE_MANDAR,
  audienciaById,
  destinatarios,
  fechaPara,
  pideEnlace,
  queById,
  sePuedeProgramar,
} from '@/domain/envios';
import { NOTE_MAX, noteStamp } from '@/domain/updates';
import { formulariosMandables } from '@/domain/formularios';
import { coachProtocolos } from '@/domain/protocolos';
import { VERBOS, buildAutomatizacion, buildPaso, deProtocolo, hiloDice, nombreDe } from '@/domain/automatizaciones';
import { cuentaElementos, resumenElementos } from '@/domain/formulario';
import { addDays, dayMonthMaybeYear, todayISO } from '@/lib/dates';
import { useToast } from '@/components/ui/ToastProvider';
import { BotonAccion, Field, Notice, TextInput } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';

/**
 * MANDAR ALGO: el «a quién» y el «cuándo» que a las acciones les faltaban.
 *
 * ══ Las tres preguntas, y en este orden ════════════════════════════════════
 *
 * Qué les mandas · A quién · Cuándo. En ese orden porque es el orden en que se
 * piensa: primero se tiene algo que pedir y después se decide a quién. Al revés
 * —elegir gente y luego buscar qué mandarle— es como están montadas las
 * automatizaciones de Coachway, y obliga a saber el final antes de empezar.
 *
 * ══ Y ahora una pregunta por pantalla ══════════════════════════════════════
 *
 * Estaban numeradas pero se enseñaban las tres a la vez: tres rótulos, dos
 * desplegables, una lista de clientes con su propio scroll dentro del scroll
 * del diálogo y un pie con la cuenta. Un diálogo con veinte controles no se lee,
 * se rebusca — y el que decide a cuánta gente le caen deberes es justo el que
 * no puede rebuscarse.
 *
 * Es el mismo asistente que la revisión semanal, con el mismo carril de pasos
 * (`wiz`, en `revision.css`): no es un parecido, son las mismas clases y el
 * mismo footer. Dos formas distintas de partir un formulario en pasos dentro de
 * la misma aplicación serían dos productos.
 *
 * El último paso REMATA con la frase entera —qué, a quién con nombres, y
 * cuándo—, que es la comprobación que ningún competidor hace: los dos que hemos
 * mirado enseñan el nombre del segmento y no su contenido, y con eso no hay
 * forma de ver que le estás mandando el alta a cuarenta personas hasta que ya
 * la tienen.
 *
 * ══ Y a veces son DOS preguntas, no tres ═══════════════════════════════════
 *
 * Este diálogo vivió montado solo en las dos pantallas del Taller, y su primera
 * audiencia se llama «A los que marqué» — pero el único sitio de la aplicación
 * donde se marca gente es la cartera, y su barra de lote solo sabía avisar,
 * etiquetar y pausar. El enchufe llevaba meses puesto, con el nombre del gesto,
 * y sin nada enchufado.
 *
 * Ahora se llega desde ahí con `preseleccion`, y entonces el paso «A quién» no
 * se enseña vacío para volver a contestar lo que ya se ha contestado: **se
 * quita**. Es exactamente lo que ya hacía `formulario` por el otro extremo. Lo
 * que NO se hace es esconder la respuesta: los destinatarios se quedan a la
 * vista en los dos pasos que quedan (`.wiz-ya`), porque aquí lo que se decide es
 * a quién le caen deberes.
 *
 * ══ Y los pausados no entran ═══════════════════════════════════════════════
 *
 * Ninguna audiencia calculada alcanza a quien está en pausa o archivado (ver
 * `destinatarios`). La única forma de mandarle algo a alguien en pausa es
 * elegirlo a mano, uno por uno — que es una decisión, no un descuido.
 */

const CLIENTES_VISIBLES = 3;

const PASOS_TODOS = [
  { id: 'que', titulo: 'Qué' },
  { id: 'quien', titulo: 'A quién' },
  { id: 'cuando', titulo: 'Cuándo' },
];

/**
 * @param formulario    Se llega desde un formulario concreto: el «qué» ya está
 *   contestado y el asistente empieza por el siguiente paso.
 * @param preseleccion  Ids de cliente que vienen marcados de la cartera. Con
 *   ellos, el «a quién» ya está contestado y **su paso desaparece**: quedan dos.
 *   Es la misma inversión que `formulario`, por el otro extremo.
 */
export const MandarAlgo = ({ formulario = null, preseleccion = null, queInicial = 'form', onCerrar }) => {
  const { coachPrefs, clients } = useApp();
  const { mandarAccion, addClientEvent, updateClientPreferences } = useActions();
  const toast = useToast();

  /* El criterio vive en el dominio (`formulariosMandables`): lo comparten esta
     boca, el «⊕» del carril y la comprobación del motor 2 en la base. */
  const formularios = useMemo(() => formulariosMandables(coachPrefs), [coachPrefs]);
  const protocolos = useMemo(() => coachProtocolos(coachPrefs), [coachPrefs]);

  const etiquetas = useMemo(() => {
    const set = new Set();
    for (const c of clients || []) for (const t of c.tags || []) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [clients]);

  const [que, setQue] = useState(queInicial);
  const [formId, setFormId] = useState(formulario?.id || formularios[0]?.id || null);
  const [texto, setTexto] = useState('');
  const [enlace, setEnlace] = useState('');

  /* El mensaje que va grapado al formulario. Solo para formularios: lo demás
     viaja como paso del alta, que solo tiene rótulo y enlace. */
  const [nota, setNota] = useState('');

  const dePreseleccion = Array.isArray(preseleccion) && preseleccion.length > 0;

  const [audiencia, setAudiencia] = useState('marcados');
  const [etiqueta, setEtiqueta] = useState(etiquetas[0] || null);
  const [protocoloId, setProtocoloId] = useState(protocolos[0]?.id || null);
  const [marcados, setMarcados] = useState(() => (dePreseleccion ? [...preseleccion] : []));
  const [busca, setBusca] = useState('');

  const [cuando, setCuando] = useState('ahora');
  const [dia, setDia] = useState(addDays(todayISO(), 7));
  const [semanas, setSemanas] = useState(6);

  /* Con gente marcada de la cartera el «a quién» ya está contestado, así que su
     paso NO se enseña vacío para volver a contestarlo: desaparece. Quedan dos. */
  const PASOS = useMemo(
    () => PASOS_TODOS.filter((p) => p.id !== 'quien' || !dePreseleccion),
    [dePreseleccion]
  );

  /* Quien llega desde un formulario concreto ya ha contestado el primer paso,
     así que empieza en el segundo —que es «A quién» normalmente y «Cuándo» si
     además viene con gente marcada—. Lo puede desandar con «Atrás». */
  const [indice, setIndice] = useState(formulario ? 1 : 0);
  const paso = PASOS[indice];
  const ultimo = indice === PASOS.length - 1;

  const valorAudiencia = audiencia === 'etiqueta' ? etiqueta : audiencia === 'protocolo' ? protocoloId : null;

  const elegidos = useMemo(
    () => destinatarios({ tipo: audiencia, valor: valorAudiencia, marcados }, clients || []),
    [audiencia, valorAudiencia, marcados, clients]
  );

  const elForm = formularios.find((f) => f.id === formId) || null;
  const elQue = queById(que);
  const esForm = que === 'form';
  const esAviso = elQue.carril === 'aviso';
  const conEnlace = pideEnlace(que);
  /* Lo tuyo no lleva recado: el recado es para quien lo recibe, y esto no lo
     recibe nadie. */
  const conRecado = elQue.carril === 'accion';

  const queListo = esForm
    ? Boolean(elForm)
    : texto.trim().length > 0 && (!conEnlace || enlace.trim().length > 0);
  const quienListo = elegidos.length > 0;
  const listos = queListo && quienListo;
  /* Cada paso abre la puerta del siguiente, y solo la suya: el botón dice
     «Siguiente» y tiene que ser verdad que lo de esta pantalla está resuelto. */
  const puedeSeguir = paso.id === 'que' ? queListo : paso.id === 'quien' ? quienListo : listos;

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const vivos = clients || [];
    return q ? vivos.filter((c) => c.name?.toLowerCase().includes(q)) : vivos;
  }, [clients, busca]);

  const mandar = async () => {
    if (!listos) return { ok: false };

    const elCuando = { tipo: cuando, valor: cuando === 'dia' ? dia : semanas };

    /*
      ── Lo suyo: una fila por persona en la tabla de lo mandado ─────────────

      Los cuatro tipos entran por la misma puerta desde la 0105. Antes solo lo
      hacía el formulario y el resto se escribía como un paso del alta de cada
      cliente, con tres consecuencias que nadie relacionaría con haber mandado un
      vídeo: se les reabría el alta, no había fecha ni estado, y cada envío
      declaraba EXCEPCIÓN DE PROTOCOLO —o sea que el siguiente «poner al día» se
      saltaba a esa gente para siempre—.
    */
    if (elQue.carril === 'accion') {
      const res = await mandarAccion({
        tipo: elQue.tipo,
        formulario: esForm ? elForm : null,
        titulo: texto.trim(),
        enlace: enlace.trim(),
        audiencia: { tipo: audiencia, valor: valorAudiencia },
        cuando: elCuando,
        clientes: elegidos,
        nota,
      });
      if (!res.ok) {
        toast({ text: res.error, tone: 'danger' });
        return res;
      }
      toast({
        text:
          cuando === 'ahora'
            ? `Mandado a ${res.cuantos}. Lo verán la próxima vez que entren.`
            : `Programado para ${res.cuantos}.`,
      });
      onCerrar();
      return res;
    }

    /*
      ── Y lo tuyo: a tu agenda, y solo la ves tú ────────────────────────────

      Una casilla tuya no es algo que se le manda a nadie: es trabajo tuyo con
      fecha sobre una persona, que es exactamente lo que `client_events` guarda
      desde la 0009 y lo que la agenda y la bandeja ya reclaman. Va marcada como
      privada (0106), así que no aparece en el calendario que él ve.

      De una en una y no en paralelo: son escrituras independientes y lo que
      importa es poder contar las que fallan, no acabar antes.
    */
    /*
      ── Y el aviso: una novedad, no un pendiente ────────────────────────────

      Cae donde han caído siempre los avisos —`updates.note` de cada cliente—,
      que es lo que hace que se lea y se descarte con el mismo gesto que las
      demás novedades del portal. Un aviso nuevo pisa al anterior: esto es un
      tablón con sitio para una nota, no un archivo de circulares.
    */
    if (elQue.carril === 'aviso') {
      const nota = noteStamp(texto);
      if (!nota) return { ok: false };
      for (const c of elegidos) updateClientPreferences(c.id, 'updates', { note: nota });
      toast({
        text:
          elegidos.length === 1
            ? `Aviso enviado a ${elegidos[0].name?.split(' ')[0] || elegidos[0].name}.`
            : `Aviso enviado a ${elegidos.length}.`,
      });
      onCerrar();
      return { ok: true };
    }

    let fallos = 0;
    for (const c of elegidos) {
      const res = await addClientEvent({
        clientId: c.id,
        date: fechaPara(elCuando, c) || todayISO(),
        kind: 'note',
        title: texto.trim(),
        privada: true,
      });
      if (res && res.ok === false) fallos += 1;
    }

    toast({
      text:
        fallos === 0
          ? `Apuntado en tu agenda${elegidos.length > 1 ? `, ${elegidos.length} veces` : ''}.`
          : `Apuntadas ${elegidos.length - fallos} de ${elegidos.length}. ${fallos} no se han podido guardar.`,
      tone: fallos === 0 ? undefined : 'danger',
    });
    onCerrar();
    return { ok: fallos === 0 };
  };

  const nombres = elegidos.slice(0, CLIENTES_VISIBLES).map((c) => c.name?.split(' ')[0] || c.name);
  const resto = elegidos.length - nombres.length;
  const cuantos = elegidos.length === 1 ? '1 persona' : `${elegidos.length} personas`;

  const gente =
    elegidos.length === 0
      ? 'Todavía no has elegido a nadie'
      : `${cuantos} — ${nombres.join(', ')}${resto > 0 ? ` y ${resto} más` : ''}`;

  /*
    Lo tuyo no lo ve nadie más, así que decir «lo verá la próxima vez que entre»
    sería mentira en la única pantalla del asistente que existe para repasar. Un
    repaso que dice algo distinto de lo que va a pasar es peor que no tenerlo.
  */
  const esMio = elQue.carril === 'agenda';

  const dicho = esMio
    ? cuando === 'ahora'
      ? 'Hoy, en tu agenda. Él no la ve'
      : cuando === 'dia'
        ? `El ${dayMonthMaybeYear(dia)}, en tu agenda. Él no la ve`
        : `A las ${semanas} semanas de su alta, en tu agenda. Él no la ve`
    : cuando === 'ahora'
      ? 'La próxima vez que entre en su portal'
      : cuando === 'dia'
        ? `El ${dayMonthMaybeYear(dia)}, no antes`
        : `A las ${semanas} semanas de su alta, a cada uno cuando le toque`;

  return (
    <Modal
      size="lg"
      title="Mandar algo"
      onClose={onCerrar}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={indice === 0 ? onCerrar : () => setIndice((i) => i - 1)}
          >
            {indice === 0 ? (
              'Cancelar'
            ) : (
              <>
                <ArrowLeft size={15} /> Atrás
              </>
            )}
          </button>

          {ultimo ? (
            <BotonAccion className="btn btn-primary" onClick={mandar} disabled={!listos}>
              <Send size={15} />
              {esMio
                ? `Apuntármelo${elegidos.length > 1 ? ` para ${elegidos.length}` : ''}`
                : cuando === 'ahora'
                  ? `Mandárselo a ${elegidos.length}`
                  : `Dejarlo programado para ${elegidos.length}`}
            </BotonAccion>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!puedeSeguir}
              onClick={() => setIndice((i) => i + 1)}
            >
              Siguiente <ArrowRight size={15} />
            </button>
          )}
        </>
      }
    >
      <div className="wiz">
        <ol className="wiz-rail">
          {PASOS.map((p, i) => (
            <li
              className={`wiz-mark${i === indice ? ' is-on' : ''}${i < indice ? ' is-done' : ''}`}
              key={p.id}
              aria-current={i === indice ? 'step' : undefined}
            >
              <span className="wiz-mark-n" aria-hidden="true">
                {i < indice ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              <span className="wiz-mark-k">{p.titulo}</span>
            </li>
          ))}
        </ol>

        <p className="wiz-count">
          Paso {indice + 1} de {PASOS.length}
        </p>

        {/*
          Con gente marcada, el «a quién» no tiene paso — así que tiene que
          verse SIEMPRE. Un asistente que se salta una pregunta y no enseña la
          respuesta que se ha dado por él es un asistente que decide a espaldas
          de quien lo usa, y aquí lo que se decide es a quién le caen deberes.
        */}
        {dePreseleccion && (
          <p className="wiz-ya">
            <Users size={15} aria-hidden="true" />
            <span>{gente}</span>
          </p>
        )}

        {/* La `key` remonta el panel al cambiar de paso: la animación de entrada
            se reproduce y el diálogo vuelve arriba. */}
        <div className="wiz-panel" key={paso.id}>
          {/* ── 1 · Qué ─────────────────────────────────────────────────── */}
          {paso.id === 'que' && (
            <>
              <p className="t-sm t-secondary">Empieza por lo que quieres que reciba.</p>

              <div className="eleccion">
                {QUE_MANDAR.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    className="eleccion-op"
                    aria-pressed={que === q.id}
                    disabled={q.id === 'form' && formularios.length === 0}
                    onClick={() => {
                      setQue(q.id);
                      /*
                        Y el «cuándo» vuelve a hoy si lo nuevo no se puede
                        programar. Sin esto, elegir un día con un formulario y
                        cambiar después a un aviso dejaba la fecha puesta en un
                        estado que ya no se puede cumplir: es la misma clase de
                        mentira que este diálogo acaba de quitarse de encima con
                        los vídeos, y la única forma de que no vuelva es que el
                        estado imposible no llegue a existir.
                      */
                      if (!sePuedeProgramar(q.id)) setCuando('ahora');
                    }}
                  >
                    <span className="eleccion-marca" aria-hidden="true" />
                    <span className="eleccion-texto">
                      <span className="eleccion-nom">{q.label}</span>
                      <span className="eleccion-dice">{q.hint}</span>
                    </span>
                  </button>
                ))}
              </div>

              {/*
                ── Los formularios, en la misma gramática que el «qué» ────────

                Esto era un `<select>` nativo: el único desplegable del sistema
                operativo en mitad de un asistente hecho de opciones con marca,
                y encima escondía lo único que hay que mirar para elegir —qué
                lleva cada uno—. Ahora son las MISMAS opciones que las cuatro de
                arriba, así que elegir el formulario se lee como la continuación
                de elegir que es un formulario, y no como otro control.
              */}
              {esForm &&
                (formularios.length === 0 ? (
                  <Notice tone="info">
                    Todavía no tienes ningún formulario suelto con preguntas. Se crean en Formularios.
                  </Notice>
                ) : (
                  <>
                    <Field label="Cuál">
                      <div className="eleccion eleccion-lista" role="group" aria-label="Qué formulario">
                        {formularios.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            className="eleccion-op"
                            aria-pressed={formId === f.id}
                            onClick={() => setFormId(f.id)}
                          >
                            <span className="eleccion-marca" aria-hidden="true" />
                            <span className="eleccion-texto">
                              <span className="eleccion-nom">{f.name}</span>
                              <span className="eleccion-dice">{resumenElementos(f.elementos)}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </Field>
                  </>
                ))}

              {/*
                El aviso ES su texto, así que se escribe en el sitio donde se
                escriben las frases y no en un renglón: cabe una línea y media y
                lo que se manda suele ser «esta semana no paso consulta,
                escribidme lo urgente».
              */}
              {esAviso && (
                <Field label="Qué les dices" hint="Lo leen como novedad en su portal. No tienen que hacer nada.">
                  {({ id }) => (
                    <textarea
                      id={id}
                      className="textarea"
                      rows={4}
                      value={texto}
                      maxLength={NOTE_MAX}
                      placeholder="Esta semana no paso consulta: escribidme lo urgente."
                      onChange={(e) => setTexto(e.target.value)}
                    />
                  )}
                </Field>
              )}

              {!esForm && !esAviso && (
                <div className="col gap-2">
                  <TextInput
                    value={texto}
                    onChange={setTexto}
                    aria-label={que === 'tarea' ? 'Qué tienes que hacer' : 'Cómo se lo dices'}
                    placeholder={
                      que === 'tarea'
                        ? 'Llamarle antes del viernes'
                        : que === 'pide'
                          ? 'Mándame el vídeo de tu sentadilla'
                          : 'Cómo grabar tus series'
                    }
                  />
                  {conEnlace && (
                    <TextInput
                      value={enlace}
                      onChange={setEnlace}
                      aria-label="El enlace"
                      placeholder="Pega aquí el enlace"
                    />
                  )}
                </div>
              )}

              {/*
                El recado, para todo lo que le llega a él.

                Vivía solo con el formulario porque era lo único que tenía dónde
                guardarlo; desde la 0105 es una columna y vale igual para un
                vídeo —«mírate el minuto 4»— o para lo que le pides. Lo tuyo no
                lo lleva: no lo recibe nadie.
              */}
              {conRecado && !(esForm && formularios.length === 0) && (
                <Field
                  label="Un mensaje tuyo"
                  hint={
                    esForm
                      ? 'Opcional. Lo lee al abrirlo, antes de las preguntas.'
                      : 'Opcional. Lo lee junto a lo que le mandas.'
                  }
                >
                  {({ id }) => (
                    <textarea
                      id={id}
                      className="textarea"
                      rows={3}
                      value={nota}
                      maxLength={MAX_NOTA}
                      placeholder="Es el de la analítica: contéstalo antes del jueves y mándame la foto del informe."
                      onChange={(e) => setNota(e.target.value)}
                    />
                  )}
                </Field>
              )}
            </>
          )}

          {/* ── 2 · A quién ─────────────────────────────────────────────── */}
          {paso.id === 'quien' && (
            <>
              <p className="t-sm t-secondary">
                Quien esté en pausa o archivado no entra en ninguna de estas listas: para mandarle
                algo hay que elegirlo a mano.
              </p>

              <div className="eleccion">
                {AUDIENCIAS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="eleccion-op"
                    aria-pressed={audiencia === a.id}
                    disabled={
                      (a.id === 'etiqueta' && etiquetas.length === 0) ||
                      (a.id === 'protocolo' && protocolos.length === 0)
                    }
                    onClick={() => setAudiencia(a.id)}
                  >
                    <span className="eleccion-marca" aria-hidden="true" />
                    <span className="eleccion-texto">
                      <span className="eleccion-nom">{a.label}</span>
                    </span>
                  </button>
                ))}
              </div>

              {audiencia === 'etiqueta' && (
                <select
                  className="select"
                  aria-label="Qué etiqueta"
                  value={etiqueta || ''}
                  onChange={(e) => setEtiqueta(e.target.value)}
                >
                  {etiquetas.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}

              {audiencia === 'protocolo' && (
                <select
                  className="select"
                  aria-label="Qué protocolo"
                  value={protocoloId || ''}
                  onChange={(e) => setProtocoloId(e.target.value)}
                >
                  {protocolos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}

              {audiencia === 'marcados' && (
                <div className="col gap-2">
                  <input
                    className="input input-sm"
                    value={busca}
                    aria-label="Buscar un cliente"
                    placeholder="Buscar por nombre"
                    onChange={(e) => setBusca(e.target.value)}
                  />
                  <ul className="mandar-gente">
                    {filtrados.map((c) => {
                      const puesto = marcados.includes(c.id);
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="mandar-quien"
                            aria-pressed={puesto}
                            onClick={() =>
                              setMarcados((prev) =>
                                puesto ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                              )
                            }
                          >
                            <span className="mandar-tic" aria-hidden="true">
                              {puesto && <Check size={13} />}
                            </span>
                            {c.name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* El recuento con nombres: lo único que evita mandarle deberes a
                  cuarenta personas sin querer. */}
              <p className="mandar-cuenta">
                {elegidos.length === 0 ? (
                  <span className="t-tertiary">Todavía no has elegido a nadie.</span>
                ) : (
                  <>
                    <b>{cuantos}</b>
                    {' — '}
                    {nombres.join(', ')}
                    {resto > 0 && ` y ${resto} más`}.
                  </>
                )}
              </p>
              {elegidos.length >= MAX_DESTINATARIOS && (
                <Notice tone="warn">
                  El tope de un envío son {MAX_DESTINATARIOS} personas. Manda el resto en una segunda
                  tanda.
                </Notice>
              )}
            </>
          )}

          {/* ── 3 · Cuándo, y el repaso ─────────────────────────────────── */}
          {paso.id === 'cuando' && (
            <>
              <div className="eleccion">
                {CUANDOS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="eleccion-op"
                    aria-pressed={cuando === c.id}
                    /* El aviso es lo único que no se puede dejar para más
                       adelante: no tiene dónde guardar una fecha. */
                    disabled={esAviso && c.id !== 'ahora'}
                    /*
                      Y ya no hay tipos de segunda.

                      Esto estaba apagado para todo lo que no fuera un
                      formulario, porque un paso del alta no tiene fecha. Y la
                      mitad de la avería quedaba viva igual: elegido un día,
                      cambiar el «qué» a un vídeo dejaba el día puesto, el botón
                      decía «Dejarlo programado para 12» y se mandaba en el acto.
                      Ahora la fecha es de verdad para los cuatro —`due` en lo
                      suyo, el día del evento en lo tuyo—.
                    */
                    onClick={() => setCuando(c.id)}
                  >
                    <span className="eleccion-marca" aria-hidden="true" />
                    <span className="eleccion-texto">
                      <span className="eleccion-nom">{c.label}</span>
                      <span className="eleccion-dice">{c.dice}</span>
                    </span>
                  </button>
                ))}
              </div>

              {cuando === 'dia' && (
                <input
                  type="date"
                  className="input"
                  aria-label="Qué día"
                  value={dia}
                  min={todayISO()}
                  onChange={(e) => setDia(e.target.value)}
                />
              )}

              {cuando === 'semanas' && (
                <div className="input-suffix">
                  <input
                    type="number"
                    className="input"
                    aria-label="Cuántas semanas"
                    min={1}
                    max={52}
                    value={semanas}
                    onChange={(e) => setSemanas(Number(e.target.value) || 1)}
                  />
                  <span aria-hidden="true">semanas</span>
                </div>
              )}

              {/* El repaso. Es la única pantalla donde las tres respuestas se
                  leen juntas, y va antes de pulsar y no después. */}
              <dl className="repaso">
                <div className="repaso-fila">
                  <dt className="repaso-k">Qué</dt>
                  <dd className="repaso-v">
                    {esForm
                      ? `${elForm?.name} · ${elForm ? cuentaElementos(elForm.elementos) : 0} elementos`
                      : `${elQue.label.toLowerCase()}: ${texto.trim()}`}
                  </dd>
                </div>
                {/*
                  Y solo donde de verdad viaja. El recado se escribe con el
                  formulario puesto y se queda en el estado; si después se cambia
                  el «qué» a un aviso o a una casilla tuya, el repaso lo seguía
                  enseñando y no se mandaba con nada. Es la misma clase de
                  mentira que el «cuándo» de un tipo que no se puede programar.
                */}
                {conRecado && nota.trim() && (
                  <div className="repaso-fila">
                    <dt className="repaso-k">Tu mensaje</dt>
                    <dd className="repaso-v">«{nota.trim()}»</dd>
                  </div>
                )}
                <div className="repaso-fila">
                  <dt className="repaso-k">A quién</dt>
                  <dd className="repaso-v">
                    {gente}
                    {audiencia !== 'marcados' && (
                      <span className="t-tertiary"> · {audienciaById(audiencia).label.toLowerCase()}</span>
                    )}
                  </dd>
                </div>
                <div className="repaso-fila">
                  <dt className="repaso-k">{esMio ? 'Cuándo te sale' : 'Cuándo lo verá'}</dt>
                  <dd className="repaso-v">{dicho}</dd>
                </div>
              </dl>

              <p className="t-xs t-tertiary mandar-aviso">
                {esMio
                  ? 'Se apunta en tu agenda, con lo del día y lo vencido. El cliente no la ve.'
                  : 'Nada le llega por correo: le aparecerá entre sus pendientes la próxima vez que entre en su portal.'}
              </p>

              <GuardarComoPaso
                que={que}
                formId={formId}
                titulo={texto}
                enlace={enlace}
                nota={nota}
                cuando={cuando}
                semanas={semanas}
                protocolos={protocolos}
                onCerrar={onCerrar}
              />
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

/**
 * EL PUENTE: «Guárdalo como paso de un protocolo».
 *
 * ══ Por qué va aquí y no en el carril ══════════════════════════════════════
 *
 * Porque es en este momento cuando se sabe. Nadie abre el carril de un protocolo
 * para inventarse un paso: se manda una cosa, se manda otra vez al mes
 * siguiente, y a la tercera uno piensa «esto lo hago siempre». La herramienta
 * nueva se aprende desde la que ya se usa, y este es el único sitio de la
 * aplicación donde ya están contestadas las dos preguntas que un paso necesita:
 * qué, y a los cuántos días.
 *
 * ══ Y por qué no siempre se puede ═════════════════════════════════════════
 *
 * Un paso lleva un DESFASE —a los cuántos días del disparador— y los tres
 * «cuándo» de un envío no son la misma clase de cosa:
 *
 *     Ahora                    → ese mismo día        ✓
 *     A las N semanas          → a las N semanas      ✓
 *     El 24 de octubre         → …¿desde cuándo?      ✗
 *
 * Un día del calendario no se puede convertir en un desfase sin inventarse desde
 * dónde se cuenta. Así que en ese caso no se ofrece el botón: se dice por qué,
 * que es lo que deja aprender la diferencia en vez de tropezar con ella.
 *
 * El aviso tampoco: no tiene dónde guardar un cuándo, y por eso no es un verbo
 * del carril (ver `VERBOS`, en `domain/automatizaciones`).
 */
const GuardarComoPaso = ({ que, formId, titulo, enlace, nota, cuando, semanas, protocolos, onCerrar }) => {
  const { automatizaciones } = useApp();
  const { guardarAutomatizacion, correrAutomatizaciones } = useActions();
  const toast = useToast();

  const [abierto, setAbierto] = useState(false);
  const [protocoloId, setProtocoloId] = useState(protocolos[0]?.id || null);
  const [destino, setDestino] = useState('nueva');

  const cabe = VERBOS.some((v) => v.id === que);
  const suyas = useMemo(
    () => deProtocolo(automatizaciones || [], protocoloId),
    [automatizaciones, protocoloId]
  );

  if (!cabe || protocolos.length === 0) return null;

  if (cuando === 'dia') {
    return (
      <p className="t-xs t-tertiary mandar-aviso">
        Para guardarlo como paso de un protocolo, el cuándo tiene que ser «Ahora» o «A las N
        semanas»: un día del calendario no dice a los cuántos días de empezar le toca a cada uno.
      </p>
    );
  }

  const dia = cuando === 'semanas' ? Number(semanas) * 7 : 0;

  const guardar = async () => {
    const paso = buildPaso({ que, dia, formId, titulo, enlace, nota });
    /* A una que ya existe se le AÑADE el paso; si no, nace una nueva con el
       disparador que casi siempre es el que se quiere —al empezar contigo—, y
       queda encendida: quien pulsa esto está diciendo que lo hace siempre. */
    const base =
      destino === 'nueva'
        ? buildAutomatizacion({ protocoloId, disparador: 'alta' })
        : suyas.find((a) => a.id === destino);
    if (!base) return;

    const res = await guardarAutomatizacion({ ...base, pasos: [...base.pasos, paso] });
    if (!res.ok) {
      toast({ text: res.error, tone: 'danger' });
      return;
    }
    /* Y corre: lo que acabas de escribir tiene que salirle a quien ya lo lleva
       puesto sin esperar al siguiente arranque. */
    correrAutomatizaciones();
    toast({
      text: `Guardado en ${nombreDe(res.automatizacion)}. A partir de ahora le pasa solo a quien lleve ese protocolo.`,
    });
    onCerrar();
  };

  if (!abierto) {
    return (
      <button type="button" className="btn btn-secondary btn-sm mandar-puente" onClick={() => setAbierto(true)}>
        <Repeat size={15} /> ¿Esto lo haces siempre? Guárdalo como paso de un protocolo
      </button>
    );
  }

  return (
    <div className="mandar-puente col gap-3">
      <Field label="De qué protocolo">
        <select className="select" value={protocoloId || ''} onChange={(e) => setProtocoloId(e.target.value)}>
          {protocolos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Dentro de qué" hint={`Entra ${hiloDice({ disparador: 'alta' }, dia)}.`}>
        <select className="select" value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="nueva">Una nueva · cuando empieza contigo</option>
          {suyas.map((a) => (
            <option key={a.id} value={a.id}>
              {nombreDe(a)}
            </option>
          ))}
        </select>
      </Field>

      <div className="row gap-2">
        <BotonAccion className="btn btn-secondary btn-sm" onClick={guardar}>
          <Repeat size={15} /> Guardarlo como paso
        </BotonAccion>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAbierto(false)}>
          Ahora no
        </button>
      </div>
    </div>
  );
};
