import { Fragment, useEffect, useRef, useState } from 'react';
import { Bell, CheckSquare, CornerDownRight, FileText, Plus, Trash2, Video, Zap } from 'lucide-react';

import {
  DIAS_SILENCIO,
  DISPARADORES,
  MAX_AUTOMATIZACIONES,
  MAX_DIA,
  MAX_PASOS,
  QUE_PASOS,
  SILENCIOS,
  buildAutomatizacion,
  buildPaso,
  disparadorById,
  encadenables,
  hiloDice,
  nombreDe,
  verboById,
} from '@/domain/automatizaciones';
import { DIAS, EVERY_MAX } from '@/domain/protocolos';
import { pideEnlace, queById } from '@/domain/envios';
import { cuentaElementos } from '@/domain/formulario';
import { clampInt } from '@/lib/num';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { EmptyState, Field, TextInput } from '@/components/ui/primitives';

/**
 * EL CARRIL: lo que le pasa a un cliente sin que tú lo mandes.
 *
 * ══ Carril y no lienzo ═════════════════════════════════════════════════════
 *
 * Una automatización nuestra es *disparador + n pasos con desfase*. No hay
 * bifurcación, no hay confluencia y no viajan datos entre pasos. Un lienzo
 * pediría colocar cajas y estirar cables para escribir **una lista ordenada**:
 * todo el coste de la metáfora y ninguna de sus ventajas, y encima no cabe en un
 * móvil.
 *
 * Lo que hace que Coachway se lea moderno no es el lienzo —son cuatro cosas y
 * las cuatro son gratis aquí—: el disparador es un nodo, los pasos están
 * encadenados, el desfase se lee ENTRE nodos y cada paso se edita en su sitio.
 *
 * El día que haya una rama de verdad —«si contestó, esto; si no, avísame»— el
 * lienzo se la habrá ganado. Ese día es otra tanda.
 *
 * ══ El hilo es la firma de la pantalla ═════════════════════════════════════
 *
 * Entre dos nodos baja un filete y el filete dice CUÁNDO le pasa. No es una
 * etiqueta: es un botón, se toca y se convierte en su mando. Y **habla el idioma
 * de su disparador** —«ese mismo día», «el día 3», «el jueves»— porque un «+3d»
 * obliga a hacer la cuenta en la cabeza cada vez, y quien la haga mal le manda el
 * check-in a alguien un domingo.
 *
 * ══ Las reglas que sigue, todas ya escritas ════════════════════════════════
 *
 * · **La caja se enciende, el verbo va en azul**: sin flechas y sin lápices, el
 *   nodo se toca y se abre en su sitio.
 * · **En reposo no está**: el «⊕» de en medio del hilo aparece al acercarte; el
 *   del final, siempre, porque es donde se añade y no una decoración.
 * · **Un disco por clase**, con `f-disco` y `data-tono`, el mecanismo de la
 *   cartera y del avatar. No se usa la paleta de datos: ésa es del dato dentro
 *   de un gráfico.
 * · **No receta.** El carril enseña lo que hay. No propone encender nada.
 */

/* El icono de cada verbo, con el vocabulario de `ProtocolosPanel`: un
   formulario es una hoja, una entrega es un vídeo, lo tuyo es una casilla. */
const ICONO = {
  form: FileText,
  pide: Bell,
  documento: FileText,
  video: Video,
  tarea: CheckSquare,
  salta: CornerDownRight,
};

/* El mismo reparto de tonos que las acciones del protocolo, para que un vídeo
   sea del mismo color en las dos listas de la misma pantalla. */
const TONO = { form: 4, pide: 5, documento: 2, video: 2, tarea: 7, salta: 0 };

const Disco = ({ que }) => {
  const Icono = ICONO[que] || Zap;
  return (
    <span className="f-disco" data-tono={TONO[que] ?? 4} aria-hidden="true">
      <Icono size={13} />
    </span>
  );
};

/** Cómo se lee un paso en una línea: el verbo, y de qué va. */
const diceElPaso = (paso, { formularios, automatizaciones }) => {
  if (paso.que === 'salta') {
    const destino = automatizaciones.find((a) => a.id === paso.saltaA);
    return { verbo: 'Empieza', suj: destino ? nombreDe(destino) : 'otra automatización', dice: '' };
  }
  const verbo = verboById(paso.que);
  if (paso.que === 'form') {
    const form = formularios.find((f) => f.id === paso.formId);
    const n = form ? cuentaElementos(form.elementos) : 0;
    return {
      verbo: verbo.rot,
      suj: form?.name || 'Sin formulario',
      dice: form ? `${n} ${n === 1 ? 'pregunta' : 'preguntas'}` : 'elige cuál',
    };
  }
  return { verbo: verbo.rot, suj: paso.titulo || 'Sin título', dice: queById(paso.que).label.toLowerCase() };
};

/*
  Cuánto se espera antes de escribir en la base lo que se está tecleando. Corto
  de más son veinte escrituras por frase; largo de más, el repaso que va detrás
  tarda en enterarse de lo que acabas de pautar. Setecientos es lo que tarda
  cualquiera en levantar los dedos del teclado.
*/
const RETARDO = 700;

/* ══ El hilo ═════════════════════════════════════════════════════════════ */

/**
 * El filete entre dos nodos: dice cuándo, y se convierte en su mando al tocarlo.
 *
 * El «⊕» vive aquí y no en una barra de herramientas porque **se añade donde se
 * mira**: entre estos dos pasos. Meter un paso en medio no recoloca nada, porque
 * el desfase de cada uno es absoluto desde el disparador.
 */
const Hilo = ({ auto, paso, onDia, onMas, final = false }) => {
  const [tocando, setTocando] = useState(false);

  return (
    <li className={`auto-hilo${final ? ' es-final' : ''}`}>
      <span className="auto-linea" aria-hidden="true" />
      <div className="auto-hilo-cuerpo">
        {paso &&
          (tocando ? (
            <span className="auto-dia">
              <label>
                <span className="sr-only">A los cuántos días del disparador</span>
                <input
                  type="number"
                  className="input input-sm"
                  min={0}
                  max={MAX_DIA}
                  autoFocus
                  value={paso.dia}
                  onChange={(e) => onDia(clampInt(e.target.value, 0, MAX_DIA, 0))}
                  onBlur={() => setTocando(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setTocando(false)}
                />
              </label>
              <span className="t-xs t-tertiary">{hiloDice(auto, paso.dia)}</span>
            </span>
          ) : (
            <button type="button" className="auto-cuando" onClick={() => setTocando(true)}>
              {hiloDice(auto, paso.dia)}
            </button>
          ))}

        {/*
          El «⊕». En reposo no está: el de en medio aparece al acercarte, el del
          final siempre —es donde se añade, no una decoración—.

          Y lo que ofrece es **el mismo selector que «Mandar algo»**: los verbos
          de la casa, no un catálogo nuevo. Más el salto, que va separado porque
          no es un verbo: no le pasa nada a nadie, empieza otra automatización.
        */}
        <MenuAcciones
          ariaLabel={final ? 'Añadir un paso al final' : 'Añadir un paso aquí'}
          clase="auto-mas"
          sinFlecha
          /* Los verbos se ELIGEN, y para elegir hace falta leer en qué se
             diferencian: la frase va debajo del rótulo, no al canto. */
          descriptivo
          label={
            <>
              <Plus size={13} />
              {final && <span>Añadir paso</span>}
            </>
          }
          items={[
            ...QUE_PASOS.map((q) => ({
              label: q.label,
              sub: q.hint,
              icon: ICONO[q.id],
              run: () => onMas(q.id),
            })),
            null,
            { label: 'Empieza otra automatización', icon: CornerDownRight, run: () => onMas('salta') },
          ]}
        />
      </div>
    </li>
  );
};

/* ══ Un paso ═════════════════════════════════════════════════════════════ */

const Paso = ({ auto, paso, abierto, contexto, onTocar, onCambiar, onQuitar }) => {
  const { formularios, automatizaciones } = contexto;
  const { verbo, suj, dice } = diceElPaso(paso, contexto);
  const set = (parche) => onCambiar({ ...paso, ...parche });

  return (
    <li className={`auto-paso${abierto ? ' is-abierto' : ''}`}>
      <span className="auto-linea" aria-hidden="true" />
      <Disco que={paso.que} />

      <div className="auto-paso-cuerpo">
        <button type="button" className="auto-paso-linea" onClick={onTocar}>
          <span className="a-verbo">{verbo}</span>
          <span className="q-titulo">{suj}</span>
          {dice && <span className="q-tipo">{dice}</span>}
        </button>

        {abierto && (
          <div className="auto-paso-hoja col gap-3">
            {paso.que === 'form' && (
              <Field label="Qué formulario" hint="Se escribe en Formularios; aquí se elige cuál se usa.">
                <select
                  className="select"
                  value={paso.formId || ''}
                  onChange={(e) => set({ formId: e.target.value || null })}
                >
                  <option value="">Elige uno…</option>
                  {formularios.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {paso.que === 'salta' ? (
              <Field
                label="Qué automatización empieza"
                hint="Solo las que esperan a que las llamen, y solo si no cierran un círculo."
              >
                <select
                  className="select"
                  value={paso.saltaA || ''}
                  onChange={(e) => set({ saltaA: e.target.value || null })}
                >
                  <option value="">Elige una…</option>
                  {encadenables(auto, automatizaciones).map((a) => (
                    <option key={a.id} value={a.id}>
                      {nombreDe(a)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              paso.que !== 'form' && (
                <Field label={paso.que === 'tarea' ? 'Qué te tienes que acordar' : 'Cómo se llama'}>
                  <TextInput
                    value={paso.titulo}
                    onChange={(v) => set({ titulo: v })}
                    placeholder={paso.que === 'tarea' ? 'Repasar su primera semana' : 'Cómo medirte en casa'}
                    maxLength={80}
                  />
                </Field>
              )
            )}

            {pideEnlace(paso.que) && (
              <Field label="El enlace" hint="Sin enlace no sale: sería un renglón sin destino.">
                <TextInput
                  value={paso.enlace}
                  onChange={(v) => set({ enlace: v })}
                  placeholder="https://…"
                  maxLength={500}
                />
              </Field>
            )}

            {/* El recado es para quien lo recibe, así que lo tuyo no lo lleva. */}
            {paso.que !== 'salta' && paso.que !== 'tarea' && (
              <Field label="Un recado, si hace falta" hint="Va grapado a lo que le llega.">
                <TextInput
                  value={paso.nota}
                  onChange={(v) => set({ nota: v })}
                  placeholder="Mándamelo antes del jueves"
                  maxLength={280}
                />
              </Field>
            )}

            <div className="row gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={onQuitar}>
                <Trash2 size={13} /> Quitar el paso
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
};

/* ══ Una automatización ══════════════════════════════════════════════════ */

const Automatizacion = ({ auto, contexto, tocado, onTocar, onGuardar, onQuitar, onLanzar }) => {
  const disparador = disparadorById(auto.disparador);
  const horario = auto.valor || { day: 1, every: 1 };
  /* El saneado ya deja `{ que, dias }` en su sitio; el respaldo es para el
     instante entre crear una y releerla de la base. */
  const silencio = { que: 'entrenar', dias: 10, ...(auto.valor || {}) };

  const conPasos = (pasos) => onGuardar({ ...auto, pasos });

  /*
    Añadir un paso donde se pulsó: hereda el desfase del que tiene delante, que
    es lo que hace que «⊕» entre dos nodos signifique «aquí». Al final, un día
    más que el último — y en el primero, el día del disparo.
  */
  const anadir = (indice, que) => {
    const anterior = auto.pasos[indice - 1];
    const dia = anterior ? anterior.dia + (indice === auto.pasos.length ? 1 : 0) : 0;
    const nuevo = buildPaso({ que, dia });
    const pasos = [...auto.pasos];
    pasos.splice(indice, 0, nuevo);
    conPasos(pasos);
    onTocar(nuevo.id);
  };

  return (
    <section className={`auto${auto.activa ? '' : ' es-apagada'}`}>
      <header className="auto-cab">
        {/* El disparador NO lleva tono de familia: no es una acción, es de
            dónde cuelgan. Un disco de color aquí lo pondría a competir con los
            pasos, que son lo que de verdad se distingue por clase. */}
        <span className="auto-disco" aria-hidden="true">
          <Zap size={13} />
        </span>
        <span className="auto-rot">Cuando</span>

        {/*
          ══ El silencio se lee como una frase ════════════════════════════════

          «Cuando lleve 10 días sin entrenar». Los dos mandos van DENTRO de la
          frase y no en una hoja aparte porque son la frase: sin el número y sin
          el «sin qué», este disparador no dice nada —es el único cuyo enunciado
          está incompleto hasta que se elige—.

          Y el mando de los días es una lista cerrada, no un número libre: entre
          «10 días» y «11 días» no hay ninguna decisión que tomar, y ofrecer el
          teclado invita a afinar algo que no se afina.
        */}
        {auto.disparador === 'silencio' ? (
          <>
            <span className="auto-nombre">lleve</span>
            <select
              className="input input-sm premisa-dia"
              value={silencio.dias}
              aria-label="Cuántos días sin dar señales"
              onChange={(e) =>
                onGuardar({ ...auto, valor: { ...silencio, dias: Number(e.target.value) } })
              }
            >
              {DIAS_SILENCIO.map((n) => (
                <option key={n} value={n}>
                  {n} días
                </option>
              ))}
            </select>
            <span className="auto-nombre">sin</span>
            <select
              className="input input-sm premisa-dia"
              value={silencio.que}
              aria-label="Sin hacer qué"
              onChange={(e) =>
                onGuardar({ ...auto, valor: { ...silencio, que: e.target.value } })
              }
            >
              {SILENCIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className="auto-nombre">{disparador.label.replace(/^Cuando /, '')}</span>
        )}

        {/*
          ══ El disparador del motor 2 elige CUÁL ═════════════════════════════

          «Cuando te conteste» sin más dispararía con cualquier cosa que la
          persona entregue —su check-in incluido—, y entonces «cuando conteste
          su alta, mándale el vídeo del día 3» le mandaría ese vídeo todas las
          semanas. Con el formulario apuntado se compara contra `form_id`, que es
          una columna de texto: la base acierta sin saber qué es un formulario.

          «Cualquiera» se queda como primera opción porque es un caso de verdad
          —«cuando me conteste algo, avísame»— y no un hueco sin rellenar.
        */}
        {auto.disparador === 'contesta' && (
          <select
            className="input input-sm premisa-dia"
            value={auto.valor?.formId || ''}
            aria-label="Qué formulario tiene que contestar"
            onChange={(e) => onGuardar({ ...auto, valor: { formId: e.target.value || null } })}
          >
            <option value="">cualquier cosa que le pidas</option>
            {contexto.formularios.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}

        {auto.disparador === 'semana' && (
          <>
            <select
              className="input input-sm premisa-dia"
              value={horario.day}
              aria-label="Qué día se dispara"
              onChange={(e) => onGuardar({ ...auto, valor: { ...horario, day: Number(e.target.value) } })}
            >
              {DIAS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.corto}
                </option>
              ))}
            </select>
            <select
              className="input input-sm premisa-dia"
              value={horario.every}
              aria-label="Cada cuántas semanas"
              onChange={(e) => onGuardar({ ...auto, valor: { ...horario, every: Number(e.target.value) } })}
            >
              {Array.from({ length: EVERY_MAX }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? 'todas las semanas' : `cada ${n} semanas`}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="auto-cab-fin">
          {/* Apagarla es la única forma de pararla para TODOS a la vez, así que
              se lee sin abrir nada: es el mando del que depende que no salga
              algo que ya no quieres que salga. */}
          {/*
            Y es el MISMO interruptor de la casa, con sus clases: `.track` solo
            está dibujado bajo `.switch-row`, así que con una clase propia el
            mando no se pintaba —ni carril, ni botón, ni nada— y la única forma
            de parar una automatización para todos a la vez era invisible.
          */}
          <label className={`switch-row auto-switch${auto.activa ? ' is-on' : ''}`}>
            <input
              type="checkbox"
              role="switch"
              className="pick-input"
              checked={auto.activa}
              onChange={(e) => onGuardar({ ...auto, activa: e.target.checked })}
            />
            <span className="track" aria-hidden="true" />
            <span className="sr-only">{auto.activa ? 'Encendida' : 'Apagada'}</span>
          </label>

          <MenuAcciones
            ariaLabel={`Más de ${nombreDe(auto)}`}
            items={[
              auto.disparador === 'manual' && {
                label: 'Mandársela ahora a los suyos',
                icon: Zap,
                run: () => onLanzar(auto),
              },
              auto.disparador === 'manual' && null,
              { label: 'Quitar la automatización', icon: Trash2, danger: true, run: () => onQuitar(auto) },
            ]}
          />
        </div>
      </header>

      {/*
        Hilo, paso, hilo, paso… El hilo va SIEMPRE delante del paso al que se
        refiere, porque lo que dice es cuándo le pasa ESO. Detrás se leería como
        el tiempo que falta para lo siguiente, que es otra cosa.
      */}
      <ol className="auto-pasos">
        {auto.pasos.map((paso, i) => (
          <Fragment key={paso.id}>
            <Hilo
              auto={auto}
              paso={paso}
              onDia={(dia) => conPasos(auto.pasos.map((p) => (p.id === paso.id ? { ...p, dia } : p)))}
              onMas={(que) => anadir(i, que)}
            />
            <Paso
              auto={auto}
              paso={paso}
              contexto={contexto}
              abierto={tocado === paso.id}
              onTocar={() => onTocar(tocado === paso.id ? null : paso.id)}
              onCambiar={(siguiente) =>
                conPasos(auto.pasos.map((p) => (p.id === paso.id ? siguiente : p)))
              }
              onQuitar={() => {
                conPasos(auto.pasos.filter((p) => p.id !== paso.id));
                onTocar(null);
              }}
            />
          </Fragment>
        ))}

        {auto.pasos.length === 0 && (
          <li className="auto-vacia">
            <span className="auto-linea" aria-hidden="true" />
            <p className="t-sm t-tertiary">
              Todavía no pasa nada. Añade el primer paso y se lo llevará a quien lleve este
              protocolo.
            </p>
          </li>
        )}

        {auto.pasos.length < MAX_PASOS && (
          <Hilo auto={auto} paso={null} final onMas={(que) => anadir(auto.pasos.length, que)} onDia={() => {}} />
        )}
      </ol>
    </section>
  );
};

/* ══ El carril entero ════════════════════════════════════════════════════ */

/**
 * @param automatizaciones  Las de ESTE protocolo, ya filtradas.
 * @param todas             Las del entrenador entero: el selector de «empieza
 *   otra» solo ofrece las de este protocolo, pero la comprobación del ciclo
 *   tiene que mirar la cadena completa o un círculo entre protocolos se colaría.
 */
export const CarrilAutomatizaciones = ({
  protocoloId,
  automatizaciones,
  todas,
  formularios,
  onGuardar,
  onQuitar,
  onLanzar,
}) => {
  const [tocado, setTocado] = useState(null);

  /*
    ══ El borrador, y por qué hace falta ══════════════════════════════════════

    Cada campo de un paso escribe la automatización ENTERA —los pasos van en un
    `jsonb`, no hay forma de guardar medio—. Sin esto, escribir «Cómo medirte en
    casa» serían veinte escrituras a la base, una por tecla, y el campo iría a
    tirones porque su valor vendría de la última que hubiera vuelto.

    Así que lo que se pinta es el borrador —inmediato, local— y lo que se guarda
    va con retardo. Es la misma mecánica que la copia local usa para no escribir
    a disco en cada pulsación, y por el mismo motivo: el caso que importa no
    ocurre a mitad de tecla.
  */
  const [borradores, setBorradores] = useState({});
  const relojes = useRef({});
  const pendientes = useRef({});

  /* Al salir se guarda lo que quede a medias, sin esperar al reloj: cerrar el
     protocolo con media frase escrita no puede perderla. */
  useEffect(
    () => () => {
      for (const id of Object.keys(relojes.current)) {
        clearTimeout(relojes.current[id]);
        if (pendientes.current[id]) onGuardar(pendientes.current[id]);
      }
    },
    [onGuardar]
  );

  const cambiar = (auto) => {
    setBorradores((prev) => ({ ...prev, [auto.id]: auto }));
    pendientes.current[auto.id] = auto;
    clearTimeout(relojes.current[auto.id]);
    relojes.current[auto.id] = setTimeout(async () => {
      delete relojes.current[auto.id];
      delete pendientes.current[auto.id];
      await onGuardar(auto);
      /*
        Y el borrador se retira solo si sigue siendo EL QUE SE GUARDÓ. Quien
        escribió otra tecla mientras el guardado iba de viaje ya tiene un
        borrador nuevo, y tirarlo le borraría de la pantalla lo que acaba de
        teclear para poner lo que había antes.
      */
      setBorradores((prev) => {
        if (prev[auto.id] !== auto) return prev;
        const siguiente = { ...prev };
        delete siguiente[auto.id];
        return siguiente;
      });
    }, RETARDO);
  };

  const lista = automatizaciones.map((a) => borradores[a.id] || a);
  const contexto = { formularios, automatizaciones: todas.map((a) => borradores[a.id] || a) };

  /* Una nueva se guarda YA: no hay nada que teclear todavía y hasta que no
     exista la fila no se le puede colgar un paso. */
  const nueva = (disparador) => onGuardar(buildAutomatizacion({ protocoloId, disparador }));

  return (
    <div className="carril-autos stack-sm">
      {lista.length === 0 ? (
        /*
          El vacío del taller es una BANDA —azulejo, frase y verbo en una línea—
          y no una losa centrada: ver el porqué en `taller.css`. Este se caía al
          vacío de serie porque la regla colgaba de `.cartera-cuerpo > .card`, y
          el carril vive dos cajas más adentro; el resultado eran 340 px de caja
          con tres renglones centrados en medio de una hoja que se lee de
          izquierda a derecha.
        */
        <EmptyState
          icon={Zap}
          title="Aquí no le pasa nada solo"
          message="Un disparador y unos pasos con su día: el vídeo del día 3, el check-in de cada lunes. Se lo lleva quien tenga este protocolo puesto."
        />
      ) : (
        lista.map((auto) => (
          <Automatizacion
            key={auto.id}
            auto={auto}
            contexto={contexto}
            tocado={tocado}
            onTocar={setTocado}
            onGuardar={cambiar}
            onQuitar={onQuitar}
            onLanzar={onLanzar}
          />
        ))
      )}

      {lista.length < MAX_AUTOMATIZACIONES && (
        <MenuAcciones
          /* Con su «+», como «Añadir acción» justo encima: las dos listas de
             esta columna contestan la misma pregunta y se amplían con el mismo
             gesto, así que no pueden tener dos formas de ofrecerlo. */
          label={
            <>
              <Plus size={15} />
              Añadir algo que pase solo
            </>
          }
          ariaLabel="Añadir una automatización"
          clase="btn anadir-pregunta"
          descriptivo
          alineado="izquierda"
          items={DISPARADORES.map((d) => ({
            label: d.label,
            sub: d.dice,
            icon: Zap,
            run: () => nueva(d.id),
          }))}
        />
      )}
    </div>
  );
};
