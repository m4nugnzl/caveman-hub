import { useState } from 'react';

import { useApp } from '@/context/AppContext';
import { ANCHOR_KINDS, kindMeta } from '@/domain/calendar';
import { forkDraft, validateFork } from '@/domain/fork';
import { GOAL_DIRECTIONS, clientGoal, directionById, isDirectionLabel } from '@/domain/goals';
import { camposDeFase, validatePhase } from '@/domain/roadmap';
import { addDays, daysBetween, localeNumber, shortDate } from '@/lib/dates';
import { toNum } from '@/lib/num';
import { Plegable } from '@/components/nutrition/VentanaDeVariacion';
import { ForkForm } from '@/components/roadmap/ForkForm';
import { Modal } from '@/components/ui/Modal';
import { BotonAccion, Notice, SegmentedControl, useAccionDeBoton } from '@/components/ui/primitives';

/**
 * LAS VENTANAS DEL PLAN EN LA TEMPORADA (26 sep 2026): la fase, el destino y
 * el punto de decisión, creados y cambiados desde la ruta.
 *
 * Lo mínimo a la vista y lo demás plegado, como la ventana de una variación
 * (`VentanaDeVariacion`), de la que toman las piezas y las clases: una fase
 * se decide por su dirección, su ritmo y sus fechas; su nombre sale de la
 * dirección y la nota casi nunca se escribe. En el teléfono son hojas desde
 * abajo; en el escritorio, ventanas (`Modal`).
 *
 * Todo pasa por `gesto` (`useGestosDelPlan`): se hace, se apunta con su
 * inverso y se anuncia con «Deshacer». Por eso borrar no pide confirmación.
 *
 * «¿Por qué?» (letra d): una línea opcional en cada ventana, que vale para lo
 * que se haga desde ella —guardar, borrar, elegir un camino—. Va a la nota de
 * la versión del plan que deja el cambio (`gesto.anotar`), no a la fase: es
 * del entrenador y no la lee el cliente.
 */

const SEMANAS_POR_DEFECTO = 12;

const semanasEntre = (desde, hasta) => {
  const d = desde && hasta ? daysBetween(desde, hasta) : null;
  return d === null ? null : (d + 1) / 7;
};
const semanasTexto = (n) => {
  if (n === null) return null;
  const r = Math.round(n * 10) / 10;
  return `${localeNumber(r, { maximumFractionDigits: 1 })} ${r === 1 ? 'semana' : 'semanas'}`;
};

/** El pie de una ventana: borrar a un lado, cancelar y guardar al otro. */
const Pie = ({ onBorrar, borrar, onCerrar, estado, guardar, deshabilitado }) => (
  <div className="var-pie">
    {onBorrar && (
      <button type="button" className="btn btn-danger" onClick={onBorrar}>
        {borrar}
      </button>
    )}
    <span className="grow" />
    <button type="button" className="btn btn-secondary" onClick={onCerrar}>
      Cancelar
    </button>
    <BotonAccion type="submit" form="ventana-del-plan" className="btn btn-primary" estado={estado} disabled={deshabilitado}>
      {guardar}
    </BotonAccion>
  </div>
);

/** «¿Por qué?»: una línea, siempre opcional. */
const PorQue = ({ motivo }) => (
  <label className="var-fecha is-porque">
    <span className="var-cifra-k">¿Por qué?</span>
    <input
      className="input"
      maxLength={280}
      value={motivo.texto}
      placeholder="Opcional · solo lo ves tú"
      onChange={(e) => motivo.setTexto(e.target.value)}
    />
  </label>
);

/**
 * El motivo de una ventana. Se anota DESPUÉS del cambio, que es el que deja la
 * versión: son dos escrituras. Si la segunda falla, se dice y lo escrito se
 * queda; el cambio ya está hecho, así que el siguiente «Guardar» solo vuelve a
 * intentar el motivo (`pendiente`).
 */
const useMotivo = ({ gesto, onCerrar, setError }) => {
  const [texto, setTexto] = useState('');
  const [pendiente, setPendiente] = useState(false);
  const cerrar = async () => {
    if (texto.trim()) {
      const r = await gesto.anotar(texto);
      if (!r.ok) {
        setPendiente(true);
        setError(`El cambio está guardado. ${r.error}`);
        return false;
      }
    }
    onCerrar();
    return true;
  };
  return { texto, setTexto, pendiente, cerrar };
};

/* ══════════════════════════════════════════════════════════════════════════
   LA FASE
   ══════════════════════════════════════════════════════════════════════════ */

const borradorDeFase = ({ desde, hasta }) => {
  const meta = directionById('cut');
  return {
    title: meta.label,
    direction: meta.id,
    ratePct: meta.defaultRate,
    startsOn: desde,
    endsOn: hasta && daysBetween(desde, hasta) >= 6 ? hasta : addDays(desde, SEMANAS_POR_DEFECTO * 7 - 1),
    note: '',
    nextOptions: null,
    nextQuestion: '',
    replanteos: null,
  };
};

/**
 * Añadir una fase (con las fechas del hueco que se pulsó) o cambiarla.
 *
 * @param inicial `{ fase }` para cambiarla, o `{ desde, hasta }` para una nueva.
 * @param onDecision abre el punto de decisión de esta fase (plantearlo o verlo).
 */
export const VentanaDeFase = ({ inicial, gesto, onCerrar, onDecision = null }) => {
  const { activeClient, phases, addPhase, updatePhase, removePhase } = useApp();
  const cid = activeClient?.id;
  const fase = inicial?.fase || null;
  const [f, setF] = useState(() => (fase ? camposDeFase(fase) : borradorDeFase(inicial || {})));
  const [plegado, setPlegado] = useState(false);
  const [error, setError] = useState('');
  const motivo = useMotivo({ gesto, onCerrar, setError });
  const envio = useAccionDeBoton();
  const meta = directionById(f.direction);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const semanas = semanasEntre(f.startsOn, f.endsOn);
  const esLaUltima = fase && !phases.some((p) => p.id !== fase.id && p.startsOn > fase.startsOn);

  const guardar = async () => {
    if (motivo.pendiente) return motivo.cerrar();
    const titulo = f.title.trim() || meta?.label || 'Fase';
    const campos = { ...f, title: titulo, ratePct: meta?.sign === 0 ? 0 : toNum(String(f.ratePct).replace(',', '.')) ?? 0 };
    const problema = validatePhase(phases, campos, fase?.id || null);
    if (problema) {
      setError(problema);
      return false;
    }
    if (!campos.endsOn && campos.nextOptions) {
      setError('Tiene un punto de decisión al final: sin fecha de fin no habría día en el que decidir.');
      return false;
    }
    if (fase) {
      const antes = camposDeFase(fase);
      const res = await gesto({
        texto: `${titulo}: cambiada.`,
        hacer: () => updatePhase(fase.id, campos),
        deshacer: () => updatePhase(fase.id, antes),
      });
      if (!res.ok) {
        setError(res.error);
        return false;
      }
    } else {
      let vivo = null;
      const res = await gesto({
        texto: `Añadida «${titulo}».`,
        hacer: async () => {
          const r = await addPhase(cid, campos);
          if (r.ok) vivo = r.phase.id;
          return r;
        },
        deshacer: () => removePhase(vivo),
      });
      if (!res.ok) {
        setError(res.error);
        return false;
      }
    }
    return motivo.cerrar();
  };

  const borrar = async () => {
    const campos = camposDeFase(fase);
    let vivo = fase.id;
    const res = await gesto({
      texto: `Borrada «${fase.title}».`,
      hacer: () => removePhase(vivo),
      deshacer: async () => {
        const r = await addPhase(cid, campos);
        if (r.ok) vivo = r.phase.id;
        return r;
      },
    });
    if (res.ok) await motivo.cerrar();
    else setError(res.error);
  };

  return (
    <Modal
      open
      title={fase ? fase.title : 'Nueva fase'}
      sub={fase ? 'Sus fechas, su dirección y su ritmo.' : 'Un tramo de la temporada con una dirección y un ritmo.'}
      onClose={onCerrar}
      footer={
        <Pie
          onBorrar={fase && !motivo.pendiente ? borrar : null}
          borrar="Borrar"
          onCerrar={onCerrar}
          estado={envio.estado}
          guardar={fase ? 'Guardar cambios' : 'Añadir fase'}
        />
      }
    >
      <form
        id="ventana-del-plan"
        className="var-form"
        onSubmit={(e) => {
          e.preventDefault();
          envio.lanzar(guardar);
        }}
      >
        <SegmentedControl
          label="Dirección"
          value={f.direction}
          onChange={(id) => {
            const d = directionById(id);
            /* Como en `PhaseForm`: el ritmo por defecto de la nueva dirección, y
               su nombre mientras siga siendo el de la anterior. */
            set({ direction: id, ratePct: d.defaultRate, ...(isDirectionLabel(f.title) ? { title: d.label } : {}) });
          }}
          options={GOAL_DIRECTIONS.map((d) => ({ id: d.id, label: d.label, hint: d.hint }))}
        />

        {meta?.sign !== 0 && (
          <label className="var-cifra">
            <span className="section-label">Ritmo</span>
            <span className="var-cifra-caja is-ancha">
              <input
                className="input"
                inputMode="decimal"
                value={String(f.ratePct ?? '').replace('.', ',')}
                aria-label="Ritmo semanal en % del peso"
                onChange={(e) => set({ ratePct: e.target.value })}
              />
              <span className="var-cifra-u">%/sem</span>
            </span>
          </label>
        )}

        <fieldset className="var-seccion">
          <legend className="section-label">Fechas</legend>
          <div className="var-fechas">
            <label className="var-fecha">
              <span className="var-cifra-k">Empieza</span>
              <input type="date" className="input" value={f.startsOn || ''} onChange={(e) => set({ startsOn: e.target.value })} />
            </label>
            <label className="var-fecha">
              <span className="var-cifra-k">Termina</span>
              <input
                type="date"
                className="input"
                value={f.endsOn || ''}
                min={f.startsOn || undefined}
                onChange={(e) => set({ endsOn: e.target.value || null })}
              />
            </label>
            {semanas !== null && <p className="var-fechas-dice tnum">{semanasTexto(semanas)}</p>}
          </div>
          <label className="var-check">
            <input
              type="checkbox"
              checked={!f.endsOn}
              onChange={(e) => set({ endsOn: e.target.checked ? null : addDays(f.startsOn, SEMANAS_POR_DEFECTO * 7 - 1) })}
            />
            Todavía no sé cuándo acaba
          </label>
        </fieldset>

        <Plegable titulo="Nombre y nota" pista={f.title} abierto={plegado} onAbrir={() => setPlegado((x) => !x)}>
          <div className="var-form">
            <label className="var-fecha">
              <span className="var-cifra-k">Nombre</span>
              <input className="input" maxLength={80} value={f.title} onChange={(e) => set({ title: e.target.value })} />
            </label>
            <label className="var-fecha">
              <span className="var-cifra-k">Nota para el cliente</span>
              <textarea className="textarea" rows={2} value={f.note || ''} onChange={(e) => set({ note: e.target.value })} />
            </label>
          </div>
        </Plegable>

        {esLaUltima && fase.endsOn && onDecision && (
          <button type="button" className="tl-ins-enlace var-escalonar" onClick={onDecision}>
            {fase.nextOptions ? 'Ver el punto de decisión' : 'Plantear qué se decide al acabar'}
          </button>
        )}

        <PorQue motivo={motivo} />
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Modal>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   EL DESTINO
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Crear o cambiar el destino: nombre, fecha y el peso al que se llega. El
 * peso objetivo es del cliente (`preferences.goal`) y va con una dirección;
 * sin ella no se ofrece.
 */
export const VentanaDeDestino = ({ destino, hoy, gesto, onCerrar }) => {
  const { activeClient, saveAnchor, removeAnchor, updateClientPreferences } = useApp();
  const cid = activeClient?.id;
  const goal = clientGoal(activeClient);
  const pesoAntes = goal?.targetWeightKg ?? null;
  const [v, setV] = useState(() => ({
    kind: destino?.kind || 'race',
    title: destino?.title || '',
    date: destino?.date || addDays(hoy, 16 * 7),
    peso: pesoAntes === null ? '' : String(pesoAntes).replace('.', ','),
  }));
  const [error, setError] = useState('');
  const motivo = useMotivo({ gesto, onCerrar, setError });
  const envio = useAccionDeBoton();
  const set = (p) => setV((x) => ({ ...x, ...p }));

  const ponerPeso = (kg) => {
    updateClientPreferences(cid, 'goal', { targetWeightKg: kg });
    return { ok: true };
  };

  const guardar = async () => {
    if (motivo.pendiente) return motivo.cerrar();
    const titulo = v.title.trim();
    if (!titulo) {
      setError('Ponle un nombre: es lo que va a leer tu cliente.');
      return false;
    }
    if (!v.date) {
      setError('Falta la fecha.');
      return false;
    }
    const peso = v.peso.trim() === '' ? null : toNum(v.peso.replace(',', '.'));
    if (v.peso.trim() !== '' && (peso === null || peso < 30 || peso > 300)) {
      setError('El peso objetivo va en kilos, entre 30 y 300.');
      return false;
    }
    const nuevo = { id: destino?.id || null, kind: v.kind, title: titulo, date: v.date, competicion: destino?.competicion || null };
    const cambiaPeso = goal && peso !== pesoAntes;
    let vivo = destino?.id || null;
    const res = await gesto({
      texto: destino ? `Destino: ${titulo}, ${shortDate(v.date)}.` : `Destino: ${titulo}.`,
      hacer: async () => {
        const r = await saveAnchor(cid, { ...nuevo, id: vivo });
        if (!r.ok) return r;
        vivo = r.anchor.id;
        if (cambiaPeso) ponerPeso(peso);
        return r;
      },
      deshacer: async () => {
        if (cambiaPeso) ponerPeso(pesoAntes);
        return destino ? saveAnchor(cid, { ...destino, id: destino.id }) : removeAnchor(vivo);
      },
    });
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    return motivo.cerrar();
  };

  const quitar = async () => {
    const res = await gesto({
      texto: `«${destino.title}» ya no es el destino.`,
      hacer: () => removeAnchor(destino.id),
      deshacer: () => saveAnchor(cid, { ...destino, id: destino.id }),
    });
    if (res.ok) await motivo.cerrar();
    else setError(res.error);
  };

  return (
    <Modal
      open
      title={destino ? destino.title || 'Destino' : 'Nuevo destino'}
      sub="A dónde va la temporada: una competición o una fecha."
      onClose={onCerrar}
      footer={
        <Pie
          onBorrar={destino && !motivo.pendiente ? quitar : null}
          borrar="Quitar"
          onCerrar={onCerrar}
          estado={envio.estado}
          guardar={destino ? 'Guardar cambios' : 'Añadir destino'}
        />
      }
    >
      <form
        id="ventana-del-plan"
        className="var-form"
        onSubmit={(e) => {
          e.preventDefault();
          envio.lanzar(guardar);
        }}
      >
        <SegmentedControl
          label="Qué es"
          value={v.kind}
          onChange={(kind) => set({ kind })}
          options={ANCHOR_KINDS.map((id) => ({ id, label: kindMeta(id).label, hint: kindMeta(id).hint }))}
        />
        <div className="var-fechas">
          <label className="var-fecha">
            <span className="var-cifra-k">Nombre</span>
            <input
              className="input"
              maxLength={80}
              value={v.title}
              placeholder={v.kind === 'race' ? 'Nacional 2027' : 'Boda de Lucía'}
              onChange={(e) => set({ title: e.target.value })}
            />
          </label>
          <label className="var-fecha">
            <span className="var-cifra-k">Fecha</span>
            <input type="date" className="input" value={v.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
        </div>
        {goal ? (
          <label className="var-cifra">
            <span className="var-cifra-k">Peso objetivo</span>
            <span className="var-cifra-caja">
              <input className="input" inputMode="decimal" value={v.peso} onChange={(e) => set({ peso: e.target.value })} />
              <span className="var-cifra-u">kg</span>
            </span>
          </label>
        ) : (
          <p className="var-nada">El peso objetivo va con una dirección: fíjala en su ficha y podrás ponerlo aquí.</p>
        )}
        <PorQue motivo={motivo} />
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Modal>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   EL PUNTO DE DECISIÓN
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * El punto de decisión al final de la última fase: la pregunta y sus caminos.
 * «Elegir este» convierte ese camino en una fase; los caminos y la pregunta se
 * cambian aquí mismo (`ForkForm`, el de siempre). Sin proyección de peso: es
 * una pregunta abierta.
 *
 * @param fase    la última fase (la que lleva los caminos).
 * @param cruce   `plan.cruce`, o `null` si todavía no hay caminos.
 */
export const VentanaDeDecision = ({ fase, cruce, gesto, onCerrar }) => {
  const { phases, setPhaseFork, chooseFork, removePhase } = useApp();
  const opciones = fase?.nextOptions || null;
  const [editar, setEditar] = useState(() => (opciones ? null : { options: forkDraft(), pregunta: '' }));
  const [error, setError] = useState('');
  const motivo = useMotivo({ gesto, onCerrar, setError });

  const plantear = async () => {
    if (motivo.pendiente) return motivo.cerrar();
    const problema = validateFork(phases, fase.id, editar.options, editar.pregunta || '');
    if (problema) {
      setError(problema);
      return false;
    }
    const antes = { options: opciones, pregunta: fase.nextQuestion || '' };
    const res = await gesto({
      texto: opciones ? 'Punto de decisión cambiado.' : 'Punto de decisión planteado.',
      hacer: () => setPhaseFork(fase.id, editar.options, (editar.pregunta || '').trim()),
      deshacer: () => setPhaseFork(fase.id, antes.options, antes.pregunta),
    });
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    return motivo.cerrar();
  };

  const elegir = async (option) => {
    let nueva = null;
    const res = await gesto({
      texto: `Elegido «${option.title}».`,
      hacer: async () => {
        const r = await chooseFork(fase, option);
        if (r.ok) nueva = r.phase.id;
        return r;
      },
      deshacer: async () => {
        const r = await removePhase(nueva);
        if (!r.ok) return r;
        return setPhaseFork(fase.id, opciones, fase.nextQuestion || '');
      },
    });
    if (res.ok) await motivo.cerrar();
    else setError(res.error);
  };

  const quitar = async () => {
    const res = await gesto({
      texto: 'Punto de decisión quitado.',
      hacer: () => setPhaseFork(fase.id, null),
      deshacer: () => setPhaseFork(fase.id, opciones, fase.nextQuestion || ''),
    });
    if (res.ok) await motivo.cerrar();
    else setError(res.error);
  };

  return (
    <Modal
      open
      size="lg"
      title="Punto de decisión"
      sub={fase ? `Al acabar ${fase.title}, el ${shortDate(fase.endsOn)}.` : null}
      onClose={onCerrar}
      footer={
        editar ? null : motivo.pendiente ? (
          <div className="var-pie">
            <span className="grow" />
            <button type="button" className="btn btn-secondary" onClick={onCerrar}>
              Cerrar
            </button>
            <button type="button" className="btn btn-primary" onClick={motivo.cerrar}>
              Guardar el motivo
            </button>
          </div>
        ) : (
          <div className="var-pie">
            <button type="button" className="btn btn-danger" onClick={quitar}>
              Quitar
            </button>
            <span className="grow" />
            <button type="button" className="btn btn-secondary" onClick={() => setEditar({ options: opciones, pregunta: fase.nextQuestion || '' })}>
              Cambiar caminos
            </button>
          </div>
        )
      }
    >
      {editar ? (
        <ForkForm
          value={editar}
          onChange={setEditar}
          onCancel={() => (opciones ? setEditar(null) : onCerrar())}
          onSubmit={plantear}
          error={error}
          extra={<PorQue motivo={motivo} />}
        />
      ) : (
        <div className="var-form">
          {cruce?.pregunta && <p className="tl-dec-pregunta">{cruce.pregunta}</p>}
          <ul className="tl-dec-caminos">
            {(cruce?.caminos || []).map((c) => {
              const meta = directionById(c.direccion);
              const option = opciones?.[c.indice];
              return (
                <li key={c.indice} className="tl-dec-camino" style={{ '--fase': meta?.color }}>
                  <span className="tl-dec-cuando">{c.cuando || 'Sin respuesta escrita'}</span>
                  <b className="tl-dec-titulo">{c.titulo}</b>
                  <span className="tl-dec-dice tnum">
                    {[meta?.label, c.semanas ? `${c.semanas} semanas` : null, meta?.sign !== 0 ? `${localeNumber(c.ratePct, { maximumFractionDigits: 2 })} %/sem` : null]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                  {option && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => elegir(option)}>
                      Elegir este
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <PorQue motivo={motivo} />
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </Modal>
  );
};
