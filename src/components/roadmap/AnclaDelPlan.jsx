import { useEffect, useMemo, useState } from 'react';
import { Flag, Pencil, Plus, X } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { ANCHOR_KINDS, competicionDe, competicionDicha, kindMeta } from '@/domain/calendar';
import { anclaSiguiente, anclasDelPlan, cuentaAtras, fraseDeLlegada, temporadas } from '@/domain/roadmap';
import { daysBetween, shortDate } from '@/lib/dates';
import { fmt } from '@/lib/num';
import { BotonAccion, Field, Notice, useAccionDeBoton } from '@/components/ui/primitives';

/**
 * EL DESTINO DEL PLAN: a qué fecha apuntan las fases.
 *
 * ══ Qué es, dicho desde el lado de quien lo usa ════════════════════════════
 *
 * En la base es un «ancla» (`client_events.ancla`, migración 0122). En pantalla
 * es el DESTINO: la competición o la fecha a la que se quiere llegar. Es un
 * evento del calendario de siempre, marcado; no una cosa nueva que aprender.
 *
 * ══ Por qué se fija aquí y no en el calendario ═════════════════════════════
 *
 * Porque es una decisión sobre el plan, y el plan se decide en esta ventana.
 * El calendario lo señala —«Destino del plan»— y nada más. Así hay un solo
 * sitio donde se mueve, y es el único sitio donde se ve qué le pasa a las fases.
 *
 * ══ Mover la fecha ═════════════════════════════════════════════════════════
 *
 * Las fases NO se mueven. El diálogo dice qué pasa —«quedará un hueco de 3
 * semanas»— y ofrece una sola casilla, desmarcada: mover también las que aún no
 * han empezado. Estirarlas no se ofrece: repartir los días sería recetar.
 * Es la decisión 1 de `docs/eje-temporal.md`.
 *
 * El cliente lo lee y no lo toca: la base no le deja cambiar un evento que es
 * destino (0122). Aquí solo se decide qué botones salen.
 */

const vacio = (hoy) => ({
  id: null,
  kind: 'race',
  title: '',
  date: '',
  competicion: { federacion: '', categoria: '', sede: '', pesoLimiteKg: '' },
  fechaAntes: null,
  moverFases: false,
  hoy,
});

const desdeEvento = (evento, hoy) => {
  const c = competicionDe(evento.competicion) || {};
  return {
    id: evento.id,
    kind: ANCHOR_KINDS.includes(evento.kind) ? evento.kind : 'race',
    title: evento.title || '',
    date: evento.date || '',
    competicion: {
      federacion: c.federacion || '',
      categoria: c.categoria || '',
      sede: c.sede || '',
      pesoLimiteKg: c.pesoLimiteKg ?? '',
    },
    /* Solo las que YA eran destino tienen una fecha «de antes» que mover:
       convertir en destino un evento del calendario no desplaza nada. */
    fechaAntes: evento.ancla ? evento.date : null,
    moverFases: false,
    hoy,
  };
};

/*
  `onPaso` (opcional): el creador del plan lo pasa para apuntar cada cambio en
  su pila de Deshacer. Recibe `{ texto, deshacer, rehacer }`; sin él, esto se
  comporta como siempre.
*/
export const AnclaDelPlan = ({ puedeEditar, hoy, onPaso = null }) => {
  const { activeClient, phases, anchors, loadEvents, saveAnchor, removeAnchor, shiftFuturePhases } = useApp();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const siguiente = useMemo(() => anclaSiguiente(anchors, hoy), [anchors, hoy]);
  const despues = useMemo(
    () => anclasDelPlan(anchors).filter((a) => a.date >= hoy && a.id !== siguiente?.id),
    [anchors, hoy, siguiente]
  );
  const cuenta = siguiente ? cuentaAtras(siguiente, hoy) : null;

  if (!activeClient) return null;
  /* Sin destino, al cliente no se le pinta nada: no hay nada que prometer. */
  if (!puedeEditar && !siguiente) return null;

  const quitar = async (evento) => {
    setBusy(true);
    const res = await removeAnchor(evento.id);
    setBusy(false);
    setError(res.ok ? '' : res.error);
    if (res.ok) {
      onPaso?.({
        texto: `«${evento.title}» ya no es el destino.`,
        deshacer: () => saveAnchor(activeClient.id, { ...evento, id: evento.id }),
        rehacer: () => removeAnchor(evento.id),
      });
    }
  };

  if (form) {
    return (
      <FormularioDelDestino
        value={form}
        onChange={setForm}
        onCancel={() => {
          setForm(null);
          setError('');
        }}
        onSubmit={async () => {
          const titulo = form.title.trim();
          if (!titulo) {
            setError('Ponle un nombre: es lo que va a leer tu cliente.');
            return false;
          }
          if (!form.date) {
            setError('Falta la fecha.');
            return false;
          }

          setBusy(true);
          const antes = form.fechaAntes ? anchors.find((a) => a.id === form.id) || null : null;
          const res = await saveAnchor(activeClient.id, form);
          if (!res.ok) {
            setBusy(false);
            setError(res.error);
            return false;
          }

          /* Solo si se marcó la casilla, y después de mover el destino: si las
             fases no caben, el destino ya está donde se pidió y se dice por
             qué ellas no se han movido. */
          const dias = form.fechaAntes ? daysBetween(form.fechaAntes, form.date) : 0;
          const tope = anclasDelPlan(anchors).find((a) => a.id !== form.id && a.date > form.fechaAntes)?.date || null;
          const conFases = Boolean(form.moverFases && dias);
          /* El Deshacer del creador: el destino a su sitio y, si se movieron,
             las fases de vuelta los mismos días. */
          const guardado = { ...form, id: res.anchor.id };
          onPaso?.({
            texto: antes ? `Destino: ${form.title.trim()}, ${form.date}.` : `Destino: ${form.title.trim()}.`,
            deshacer: async () => {
              if (conFases) {
                const r = await shiftFuturePhases(activeClient.id, -dias, tope);
                if (!r.ok) return r;
              }
              return antes ? saveAnchor(activeClient.id, { ...antes, id: antes.id }) : removeAnchor(res.anchor.id);
            },
            rehacer: async () => {
              const r = await saveAnchor(activeClient.id, guardado);
              if (r.ok && conFases) return shiftFuturePhases(activeClient.id, dias, tope);
              return r;
            },
          });
          if (conFases) {
            const movidas = await shiftFuturePhases(activeClient.id, dias, tope);
            if (!movidas.ok) {
              setBusy(false);
              setForm(null);
              setError(`El destino se ha movido. ${movidas.error}`);
              return true;
            }
          }

          setBusy(false);
          setForm(null);
          setError('');
          return true;
        }}
        phases={phases}
        anchors={anchors}
        loadEvents={loadEvents}
        clientId={activeClient.id}
        busy={busy}
        error={error}
      />
    );
  }

  return (
    <div className="destino">
      {error && <Notice tone="error">{error}</Notice>}

      {siguiente ? (
        <div className="destino-fila" style={{ '--destino': kindMeta(siguiente.kind).color }}>
          <Flag size={15} className="destino-icono" aria-hidden="true" />
          <span className="destino-texto">
            <span className="destino-nombre">
              {siguiente.title}
              <span className="destino-fecha tnum"> · {shortDate(siguiente.date)}</span>
            </span>
            <span className="destino-sub">
              {[cuenta?.texto, competicionDicha(siguiente.competicion)].filter(Boolean).join(' · ')}
              {competicionDe(siguiente.competicion)?.pesoLimiteKg
                ? ` · límite ${fmt(competicionDe(siguiente.competicion).pesoLimiteKg, { decimals: 1 })} kg`
                : ''}
            </span>
          </span>
          {puedeEditar && (
            <span className="destino-acciones">
              <button
                type="button"
                className="slot-btn"
                onClick={() => setForm(desdeEvento(siguiente, hoy))}
                aria-label={`Cambiar ${siguiente.title}`}
                title="Cambiar"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                className="slot-btn is-danger"
                onClick={() => quitar(siguiente)}
                disabled={busy}
                aria-label={`Quitar ${siguiente.title} como destino`}
                title="Quitar como destino"
              >
                <X size={13} />
              </button>
            </span>
          )}
        </div>
      ) : (
        <button type="button" className="rmap-tail" onClick={() => setForm(vacio(hoy))}>
          <Flag size={15} />
          <span>¿Hacia dónde va? Fija una competición o una fecha</span>
        </button>
      )}

      {despues.length > 0 && (
        <p className="t-xs t-tertiary">
          Después: {despues.map((a) => `${a.title} (${shortDate(a.date)})`).join(' · ')}
        </p>
      )}

      {puedeEditar && siguiente && (
        <div className="row">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(vacio(hoy))}>
            <Plus size={15} /> Otro destino
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Fijar o cambiar el destino.
 *
 * ── «Usar uno del calendario» ──────────────────────────────────────────────
 * La competición suele estar ya apuntada —muchas veces por el propio cliente—.
 * Ofrecerla evita tenerla dos veces: se marca ESE evento, no se crea otro.
 */
const FormularioDelDestino = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  phases,
  anchors,
  loadEvents,
  clientId,
  busy,
  error,
}) => {
  const envio = useAccionDeBoton();
  const set = (patch) => onChange({ ...value, ...patch });
  const setCompeticion = (patch) => set({ competicion: { ...value.competicion, ...patch } });
  const [candidatos, setCandidatos] = useState([]);

  /* Los eventos del calendario que podrían ser destino: competiciones y
     objetivos por delante, compartidos y que todavía no lo son. */
  useEffect(() => {
    if (value.id) return undefined;
    let cancelado = false;
    loadEvents(clientId, { from: value.hoy }).then((res) => {
      if (cancelado) return;
      setCandidatos(
        (res.events || []).filter((e) => ANCHOR_KINDS.includes(e.kind) && !e.ancla && !e.privada)
      );
    });
    return () => {
      cancelado = true;
    };
  }, [clientId, loadEvents, value.id, value.hoy]);

  /* Lo que les pasa a las fases con la fecha nueva, dicho antes de guardar. */
  const moviendo = Boolean(value.fechaAntes && value.date && value.date !== value.fechaAntes);
  const dias = moviendo ? daysBetween(value.fechaAntes, value.date) : 0;
  const consecuencia = useMemo(() => {
    if (!moviendo) return null;
    const otras = anchors.filter((a) => a.id !== value.id);
    const conNueva = [...otras, { id: value.id, title: value.title || 'el destino', date: value.date, ancla: true }];
    const { tramos } = temporadas(phases, conNueva, value.hoy);
    return fraseDeLlegada(tramos.find((t) => t.ancla.id === value.id));
  }, [moviendo, anchors, phases, value.id, value.title, value.date, value.hoy]);

  /* Las fases que se moverían con la casilla: las que aún no han empezado,
     hasta el destino siguiente. La misma regla que `shift_future_phases`. */
  const movibles = useMemo(() => {
    if (!moviendo) return 0;
    const tope = anclasDelPlan(anchors).find((a) => a.id !== value.id && a.date > value.fechaAntes)?.date || null;
    return phases.filter((f) => f.startsOn > value.hoy && (!tope || f.startsOn < tope)).length;
  }, [moviendo, anchors, phases, value.id, value.fechaAntes, value.hoy]);

  const semanasODias = (n) => {
    const a = Math.abs(n);
    return a % 7 === 0 ? `${a / 7} ${a === 7 ? 'semana' : 'semanas'}` : `${a} ${a === 1 ? 'día' : 'días'}`;
  };

  return (
    <form
      className="card-inset col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        envio.lanzar(() => onSubmit());
      }}
    >
      <span className="section-label">{value.fechaAntes ? 'Cambiar el destino' : 'Hacia dónde va'}</span>

      {!value.id && candidatos.length > 0 && (
        <div className="col gap-2">
          <span className="t-xs t-secondary">Ya en su calendario</span>
          <div className="rail-wrap" role="group" aria-label="Usar un evento del calendario">
            {candidatos.map((e) => (
              <button key={e.id} type="button" className="chip" onClick={() => onChange(desdeEvento(e, value.hoy))}>
                {e.title} · {shortDate(e.date)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rail-wrap" role="group" aria-label="Tipo de destino">
        {ANCHOR_KINDS.map((id) => (
          <button
            key={id}
            type="button"
            className="chip"
            aria-pressed={value.kind === id}
            title={kindMeta(id).hint}
            onClick={() => set({ kind: id })}
          >
            {kindMeta(id).label}
          </button>
        ))}
      </div>

      <div className="destino-campos">
        <Field label="Nombre">
          <input
            id="destino-nombre"
            className="input"
            value={value.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder={value.kind === 'race' ? 'Nacional 2027' : 'Boda de Lucía'}
          />
        </Field>
        <Field label="Fecha">
          <input
            id="destino-fecha"
            type="date"
            className="input"
            value={value.date}
            onChange={(e) => set({ date: e.target.value })}
          />
        </Field>
      </div>

      {value.kind === 'race' && (
        <div className="destino-campos">
          <Field label="Federación">
            <input
              id="destino-federacion"
              className="input"
              value={value.competicion.federacion}
              onChange={(e) => setCompeticion({ federacion: e.target.value })}
            />
          </Field>
          <Field label="Categoría">
            <input
              id="destino-categoria"
              className="input"
              value={value.competicion.categoria}
              onChange={(e) => setCompeticion({ categoria: e.target.value })}
              placeholder="−83 kg"
            />
          </Field>
          <Field label="Sede">
            <input
              id="destino-sede"
              className="input"
              value={value.competicion.sede}
              onChange={(e) => setCompeticion({ sede: e.target.value })}
            />
          </Field>
          <Field label="Peso límite (kg)" hint="Solo si la categoría es por peso.">
            <input
              id="destino-limite"
              className="input"
              inputMode="decimal"
              value={value.competicion.pesoLimiteKg}
              onChange={(e) => setCompeticion({ pesoLimiteKg: e.target.value })}
            />
          </Field>
        </div>
      )}

      {moviendo && (
        <div className="col gap-2">
          <Notice tone="info">
            La fecha pasa {semanasODias(dias)} {dias > 0 ? 'más tarde' : 'antes'} y las fases se quedan como
            están.{consecuencia ? ` ${consecuencia}` : ''}
          </Notice>
          {movibles > 0 && (
            <label className="checkbox-row">
              <input
                id="destino-mover-fases"
                type="checkbox"
                checked={value.moverFases}
                onChange={(e) => set({ moverFases: e.target.checked })}
              />
              <span className="t-sm">
                Mover también {movibles === 1 ? 'la fase que aún no ha empezado' : `las ${movibles} fases que aún no han empezado`}
              </span>
            </label>
          )}
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      <div className="row gap-2 row-end">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <BotonAccion type="submit" className="btn btn-primary" estado={envio.estado} disabled={busy}>
          Guardar destino
        </BotonAccion>
      </div>
    </form>
  );
};
