import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { AUDIENCIAS, destinatarios } from '@/domain/envios';
import { coachProtocolos } from '@/domain/protocolos';
import { BLOCK_CHANGE } from '@/domain/blocks';
import { cloneExerciseAsTemplate } from '@/domain/training';
import { NOMBRE_DE_TIPO, TIPO } from '@/lib/portapapeles';
import { consecuenciaDe, loQueLleva, pideSitio, queLee, sitioDeOrigen, sitiosDe, sustituye } from '@/domain/reparto';
import { norm } from '@/lib/texto';
import { Modal } from '@/components/ui/Modal';
import { Notice } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/ToastProvider';

/**
 * PONER LO QUE LLEVAS EN VARIAS PERSONAS, CON LAS CONSECUENCIAS DELANTE.
 *
 * ══ De dónde viene esta pantalla ═══════════════════════════════════════════
 *
 * Era `MandarBloque`, y hacía esto mismo con una sola pieza. La regla que
 * estrenó sigue entera y es la razón de que exista: **ésta es la única pantalla
 * del producto que escribe en el trabajo de varias personas a la vez, así que
 * no se pulsa nada sin ver qué le pasa a cada una**. Es lo que hace bien el
 * reparto de Efort y casi nadie más — con una diferencia: ellos enseñan lo que
 * el atleta YA tiene, y aquí se enseña lo que VA A PASAR.
 *
 * Lo que cambia es de dónde sale. Un bloque no era la única cosa repartible:
 * era la única que tenía panel. Desde que el portapapeles lleva las cinco
 * piezas del producto en la mano, la misma pantalla las reparte todas, y qué
 * significa repartir cada una está en `domain/reparto` — aquí no se decide
 * nada, se pregunta a quién, se enseña y se escribe.
 *
 * ══ Y NO es un envío ═══════════════════════════════════════════════════════
 *
 * `domain/envios` es lo que se le PIDE a alguien y vuelve contestado; esto es
 * una escritura en su plan. De ahí se toma solo el vocabulario del «a quién»
 * —las mismas audiencias, la misma función `destinatarios`— para no inventar
 * una segunda forma de decir lo mismo.
 *
 * ══ Por qué hace falta cargar el plan de cada uno ══════════════════════════
 *
 * Desde que la cartera arranca con RESÚMENES (migración 0024), ni el programa
 * ni la dieta de los demás están en memoria. Y los dos actualizadores escriben
 * la fila entera a partir de lo que haya en memoria: sin cargarlo antes,
 * mandarle algo a alguien le BORRARÍA lo que tuviera. Por eso se pide con
 * `ensureProgram` / `ensureNutrition` ANTES de enseñar las consecuencias —que
 * es además de dónde salen— y quien no haya llegado todavía no se manda.
 */

/* Cómo se llama el verbo en el pie, por pieza. «Mandar» es del bloque —se le
   manda un programa a alguien—; una comida o un ejercicio se PONEN, que es lo
   que de verdad pasa: entran en algo que ya está montado. */
const elVerbo = (n, borra = false) => {
  /* Sin nadie, el botón dice qué falta y no «Ponerlo en 0», que se lee como un
     error de cuentas. Pasa siempre con lo que SUSTITUYE —ahí ninguna fila viene
     marcada de fábrica— y pasaba ya con una audiencia sin gente dentro. */
  if (n === 0) return 'Marca a quién';
  /* Lo que sustituye lo dice en el botón. «Ponerlo» describe añadir, y quien
     está a punto de borrarle la dieta a seis personas tiene que leer «Sustituir
     la dieta de 6» justo antes de pulsar, no enterarse después. */
  if (borra) return n === 1 ? 'Sustituir su dieta' : `Sustituir la dieta de ${n}`;
  return n === 1 ? 'Ponerlo' : `Ponerlo en ${n}`;
};

export const MandarLaPieza = ({ pieza, onClose }) => {
  const {
    clients,
    coachPrefs,
    ensureProgram,
    ensureNutrition,
    conditionsOfMany,
    startBlockWithPlan,
    addBlockSheet,
    addBlockExercise,
    appendMeal,
    addDietDayWithMeals,
    replaceDiet,
    logBlockChange,
  } = useApp();
  const toast = useToast();

  const protocolos = useMemo(() => coachProtocolos(coachPrefs), [coachPrefs]);
  const etiquetas = useMemo(() => {
    const set = new Set();
    for (const c of clients || []) for (const t of c.tags || []) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [clients]);

  const [audiencia, setAudiencia] = useState('marcados');
  const [etiqueta, setEtiqueta] = useState(etiquetas[0] || null);
  const [protocoloId, setProtocoloId] = useState(protocolos[0]?.id || null);
  const [marcados, setMarcados] = useState([]);
  const [busca, setBusca] = useState('');
  const [mandando, setMandando] = useState(false);
  /* Dónde cae la pieza dentro de lo que cada uno ya tiene, cuando la pieza lo
     pide (un ejercicio va en UNA hoja). Por nombre: ver `domain/reparto`. */
  const [sitio, setSitio] = useState(sitioDeOrigen(pieza) || '');

  const valor = audiencia === 'etiqueta' ? etiqueta : audiencia === 'protocolo' ? protocoloId : null;

  /*
    ── DE QUIÉN SALE NO PUEDE SER DESTINATARIO ───────────────────────────────
    La pieza acaba de salir de ahí: mandarle su propio bloque a su dueño le
    cerraría el que está mirando para abrirle una copia.

    Por el ORIGEN de la pieza y no por el cliente abierto, que es lo que miraba
    `MandarBloque`. Ahí daban lo mismo —el bloque era el del cliente que tenías
    delante— pero desde la mano no: se copia la hoja de Marta, se navega a Luis
    y se reparte, y Luis es un destinatario tan legítimo como cualquiera. Lo que
    hay que dejar fuera es a Marta.
  */
  /* Salvo la dieta que lleva su pauta: es «Copiar mis cambios» del choque con
     una programada, y su sitio natural es volver a su dueño. */
  const cartera = useMemo(
    () => (pieza.carga?.pauta ? clients || [] : (clients || []).filter((c) => c.name !== pieza.origen?.cliente)),
    [clients, pieza]
  );

  const elegidos = useMemo(
    () => destinatarios({ tipo: audiencia, valor, marcados }, cartera),
    [audiencia, valor, marcados, cartera]
  );

  const filtrados = useMemo(() => {
    const q = norm(busca);
    return q ? cartera.filter((c) => norm(c.name).includes(q)) : cartera;
  }, [cartera, busca]);

  /*
    ── El plan de los elegidos, traído en cuanto se eligen ───────────────────
    Es lo que hace posibles las dos cosas de esta pantalla: decir qué le pasa a
    cada uno y escribir sin pisarle nada a nadie. `ensure*` ya agrupa las
    peticiones repetidas del mismo cliente, y el conjunto de los pedidos va en
    un ref para que pedirlo no dependa de lo que ya se tiene: con el mapa en las
    dependencias, cada respuesta relanzaría el efecto.
  */
  const [datos, setDatos] = useState({});
  const pedidos = useRef(new Set());
  const ids = useMemo(() => elegidos.map((c) => c.id), [elegidos]);
  const clave = ids.join(',');
  const esDieta = queLee(pieza.tipo) === 'dieta';

  useEffect(() => {
    let vivo = true;
    const traer = esDieta ? ensureNutrition : ensureProgram;
    for (const id of ids) {
      if (pedidos.current.has(id)) continue;
      pedidos.current.add(id);
      traer(id).then((leido) => {
        if (vivo) setDatos((prev) => ({ ...prev, [id]: leido }));
      });
    }
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, esDieta, ensureNutrition, ensureProgram]);

  /*
    ── Y lo que le condiciona ────────────────────────────────────────────────
    En UNA consulta para todos (`conditionsOfMany`). `null` es «no se ha podido
    mirar», y entonces se dice: un fallo de red leído como vía libre es
    exactamente el error que los condicionantes existen para evitar.
  */
  const [condiciones, setCondiciones] = useState({});
  const [sinMirar, setSinMirar] = useState(false);
  useEffect(() => {
    const faltan = ids.filter((id) => !(id in condiciones));
    if (faltan.length === 0) return undefined;
    let vivo = true;
    conditionsOfMany(faltan).then((mapa) => {
      if (!vivo) return;
      if (mapa === null) setSinMirar(true);
      else setCondiciones((prev) => ({ ...prev, ...mapa }));
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, conditionsOfMany]);

  /* Los nombres de hoja o de día que los elegidos tienen de verdad, más el de
     origen: proponer una lista inventada sería peor que no proponer ninguna. */
  const sitiosPosibles = useMemo(() => {
    if (!pideSitio(pieza.tipo)) return [];
    const set = new Set([sitioDeOrigen(pieza)].filter(Boolean));
    for (const id of ids) for (const nombre of sitiosDe(pieza.tipo, datos[id])) set.add(nombre);
    return [...set];
  }, [pieza, ids, datos]);

  const consecuencias = useMemo(
    () =>
      elegidos.map((cliente) => ({
        cliente,
        que: consecuenciaDe({
          pieza,
          datos: datos[cliente.id],
          sitio,
          condiciones: condiciones[cliente.id] || null,
        }),
      })),
    [elegidos, datos, sitio, condiciones, pieza]
  );

  /*
    ── QUIÉN ENTRA, AL FINAL ─────────────────────────────────────────────────
    No hay un estado «marcados»: hay lo que el entrenador ha QUITADO y lo que ha
    REPUESTO. Lo demás se deriva, y por eso una fila con veto entra desmarcada
    aunque el condicionante llegue tres décimas después que el nombre: no hay
    ningún estado sembrado que corregir cuando llega la respuesta.
  */
  const [quitados, setQuitados] = useState(() => new Set());
  const [repuestos, setRepuestos] = useState(() => new Set());
  /*
    ── Y LO QUE SUSTITUYE ENTRA DESMARCADO, TODO ────────────────────────────
    Es el mismo mecanismo del veto y por el mismo motivo: no se pisa la dieta de
    nadie por descuido. Repartir una comida o un día AÑADE —y si sobra se quita,
    que es un error reversible—; mandar la dieta entera borra la que tenía, y
    una dieta borrada no está en ninguna parte. Así que aquí el entrenador no
    desmarca a los que no quiere: marca a los que sí, uno a uno, leyendo lo que
    pierde cada uno en su columna. Ver `sustituye` en `domain/reparto`.
  */
  const borra = sustituye(pieza.tipo);
  const entra = (fila) =>
    fila.que.estado === 'va' &&
    !quitados.has(fila.cliente.id) &&
    ((fila.que.veto.length === 0 && !borra) || repuestos.has(fila.cliente.id));

  const alternarFila = (id, puesto) => {
    setQuitados((prev) => {
      const s = new Set(prev);
      if (puesto) s.add(id);
      else s.delete(id);
      return s;
    });
    setRepuestos((prev) => {
      const s = new Set(prev);
      if (puesto) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  const cargando = consecuencias.some((x) => x.que.estado === 'cargando');
  const van = consecuencias.filter(entra);
  const listos = van.length > 0 && !cargando && !mandando;

  const alternar = (id) =>
    setMarcados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /*
    ── LA ESCRITURA ──────────────────────────────────────────────────────────
    El «qué» ya está resuelto en `domain/reparto`; aquí solo se llama al verbo
    que corresponde. Los ids se renuevan AQUÍ y no en el dominio: una pieza se
    reparte a ocho, y ocho copias con el mismo identificador acabarían
    compartiendo historial y récords.
  */
  const escribir = (cliente, plan) => {
    switch (plan.que) {
      case 'bloque':
      case 'hoja-sola':
        startBlockWithPlan(cliente.id, {
          ...plan.plan,
          sessions: (plan.plan.sessions || []).map((h) => ({
            dayName: h.dayName,
            exercises: (h.exercises || []).map(cloneExerciseAsTemplate),
          })),
        });
        break;
      case 'hoja':
        addBlockSheet(cliente.id, plan.bloqueId, plan.nombre);
        plan.exercises.forEach((ex) =>
          addBlockExercise(cliente.id, plan.bloqueId, plan.nombre, cloneExerciseAsTemplate(ex))
        );
        /* La bitácora del bloque de CADA UNO: lo que cuenta qué le cambiaste a
           esa persona y cuándo. Sin esto, la mitad de su plan aparecería sin
           que nada dijera de dónde salió. */
        logBlockChange(cliente.id, plan.bloqueId, {
          kind: BLOCK_CHANGE.HOJA_MAS,
          alcance: 'bloque',
          semanas: [],
          hoja: plan.nombre,
          que: plan.nombre,
        });
        break;
      case 'ejercicio':
        addBlockExercise(cliente.id, plan.bloqueId, plan.hoja, cloneExerciseAsTemplate(plan.exercise));
        logBlockChange(cliente.id, plan.bloqueId, {
          kind: BLOCK_CHANGE.EJERCICIO_MAS,
          alcance: 'bloque',
          semanas: [],
          hoja: plan.hoja,
          que: plan.exercise?.name || pieza.titulo,
        });
        break;
      case 'comida':
        appendMeal(cliente.id, plan.dayId, plan.meal);
        break;
      case 'dia':
        addDietDayWithMeals(cliente.id, { name: plan.name, meals: plan.meals });
        break;
      case 'dieta':
        replaceDiet(cliente.id, plan.days, plan.pauta || null);
        break;
      default:
        break;
    }
  };

  const mandar = () => {
    if (!listos) return;
    setMandando(true);
    for (const fila of van) escribir(fila.cliente, fila.que.plan);
    toast({
      text:
        van.length === 1
          ? `«${pieza.titulo}» puesto en ${van[0].cliente.name}.`
          : `«${pieza.titulo}» puesto en ${van.length} clientes.`,
    });
    onClose();
  };

  const dentro = loQueLleva(pieza, 4);

  return (
    <Modal
      size="lg"
      title={borra ? `Sustituir la dieta con «${pieza.titulo}»` : `Poner «${pieza.titulo}» en…`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          {/* Sigue siendo `btn-primary` aunque borre: `btn-danger` es un peso
              de la casa que «nunca es la acción de la pantalla» (ver
              `controles.css`), y esta lo es. Lo que avisa del peligro es el
              VERBO —«Sustituir la dieta de 6»— y, sobre todo, que ninguna fila
              venga marcada de fábrica. */}
          <button type="button" className="btn btn-primary" disabled={!listos} onClick={mandar}>
            {elVerbo(van.length, borra)}
          </button>
        </>
      }
    >
      <div className="reparto">
        {/* ── A quién ──────────────────────────────────────────────────── */}
        <div className="col gap-3">
          {/* Qué llevas, arriba del todo: quien abre esto desde la mano puede
              llevar tres piezas parecidas, y el título solo dice el nombre. */}
          <div className="pieza-carta">
            <b>{pieza.titulo}</b>
            <span>
              {[NOMBRE_DE_TIPO[pieza.tipo] || pieza.tipo, pieza.detalle, pieza.origen?.cliente]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {dentro.lineas.length > 0 && (
              <ul>
                {dentro.lineas.map((linea) => (
                  <li key={linea}>{linea}</li>
                ))}
                {dentro.mas > 0 && <li className="mas">y {dentro.mas} más</li>}
              </ul>
            )}
          </div>

          {/*
            ── DÓNDE CAE, cuando la pieza cae dentro de algo ────────────────
            Se pregunta UNA vez y para todos, por nombre. Ni las hojas ni los
            días de ocho personas se llaman igual por decreto, así que quien no
            tenga ese nombre sale en la columna diciéndolo — que es mejor que
            recibirlo en un sitio elegido por la aplicación.
          */}
          {pideSitio(pieza.tipo) && (
            <label className="field">
              <span className="field-label">
                {pideSitio(pieza.tipo) === 'hoja' ? '¿En qué hoja?' : '¿En qué día?'}
              </span>
              <input
                className="input input-sm"
                list="reparto-sitios"
                value={sitio}
                placeholder={pideSitio(pieza.tipo) === 'hoja' ? 'Lower A' : 'Días de entreno'}
                onChange={(e) => setSitio(e.target.value)}
              />
              <datalist id="reparto-sitios">
                {sitiosPosibles.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
          )}

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
                        onClick={() => alternar(c.id)}
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
        </div>

        {/* ── Y qué le pasa a cada uno ─────────────────────────────────── */}
        <div className="col gap-3">
          {consecuencias.length === 0 ? (
            /* El vacío dice qué falta por decidir, no que no haya nada. */
            <p className="t-sm t-secondary">
              Elige a quién se lo pones y aquí verás, antes de guardar, qué le entra a cada uno y
              qué le cambia.
            </p>
          ) : (
            <>
              {consecuencias.map(({ cliente, que }) => {
                const puesto = entra({ cliente, que });
                const vetado = que.veto.length > 0;
                return (
                  <div className={`consec${puesto ? '' : ' es-fuera'}`} key={cliente.id}>
                    <h6>
                      {/* La casilla solo existe cuando hay algo que decidir: con
                          la consecuencia en «no se toca» no hay nada que marcar. */}
                      {que.estado === 'va' && (
                        <input
                          type="checkbox"
                          checked={puesto}
                          aria-label={`Ponérselo a ${cliente.name}`}
                          onChange={(e) => alternarFila(cliente.id, !e.target.checked)}
                        />
                      )}
                      {cliente.name}
                    </h6>

                    {que.estado === 'cargando' ? (
                      <p className="consec-fila">
                        <span className="que">
                          <Loader2 size={13} className="is-girando" aria-hidden="true" /> Mirando lo
                          que tiene…
                        </span>
                      </p>
                    ) : (
                      que.filas.map((fila) => (
                        <p className="consec-fila" key={fila.texto}>
                          <span className="que">{fila.texto}</span>
                          {/* «se le cierra» es del bloque, que se cierra y se
                              queda en su lista. Una dieta no se cierra: se
                              BORRA, y la chapa tiene que decir cuál de las dos
                              cosas pasa. Ver `sustituye` en `domain/reparto`. */}
                          {fila.marca && (
                            <span className={`marca ${fila.marca}`}>
                              {fila.marca === 'entra' ? 'entra' : borra ? 'se borra' : 'se le cierra'}
                            </span>
                          )}
                        </p>
                      ))
                    )}

                    {/* Lo que le condiciona, con su peso: un «no se le puede
                        poner» desmarca la fila y se dice entero; un «tenlo en
                        cuenta» se dice y no decide por nadie. */}
                    {vetado && (
                      <p className="consec-veto">No se le puede poner: {que.veto.join(' · ')}</p>
                    )}
                    {que.ojo.length > 0 && <p className="consec-ojo">Ojo: {que.ojo.join(' · ')}</p>}
                  </div>
                );
              })}

              {sinMirar && (
                <Notice tone="warn">
                  No se han podido leer los condicionantes. Compruébalos en su ficha antes de
                  ponérselo.
                </Notice>
              )}

              {/*
                El pie dice lo que de verdad va a pasar, y son TRES casos y no
                dos. Aquí había uno solo para todo lo que no fuera un bloque
                —«esto solo añade: nada se toca ni se sustituye»— y con la dieta
                entera delante era literalmente lo contrario de la verdad.
              */}
              {borra ? (
                <Notice tone="warn">
                  Esto SUSTITUYE la dieta de cada uno: sus días y sus comidas se pierden, y una dieta
                  borrada no queda en ninguna parte.{' '}
                  {pieza.carga?.pauta
                    ? 'Entra también su pauta: objetivo, reparto, pasos y cardio.'
                    : 'Su objetivo, sus pautas, sus pasos y su cardio se quedan.'}
                </Notice>
              ) : pieza.tipo === TIPO.BLOQUE ? (
                <Notice tone="info">
                  Cerrar un bloque no borra nada: lo que cada uno tenga entrenado se queda en su
                  historial, y su bloque anterior sigue en su lista.
                </Notice>
              ) : (
                <Notice tone="info">
                  Esto solo añade: nada de lo que cada uno tenga puesto se toca ni se sustituye.
                </Notice>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};
