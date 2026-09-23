import { useMemo, useState } from 'react';

import { Field, Notice } from '@/components/ui/primitives';
import { useApp } from '@/context/AppContext';
import { directionById, targetRateKg } from '@/domain/goals';
import { conReplanteo, replanteoVigente, validarReplanteo } from '@/domain/roadmap';
import { localeNumber, shortDate } from '@/lib/dates';
import { useElementWidth } from '@/lib/useElementWidth';
import { ventanaDe } from './geometria';
import { LineaDelPlan } from './LineaDelPlan';
import { usePlanDelRoadmap } from './usePlanDelRoadmap';

/**
 * «IGUALAR AQUÍ»: la base nueva de lo esperado, decidida al cerrar la semana.
 *
 * ══ Vive en la decisión, y en ningún otro sitio ════════════════════════════
 *
 * Igualar es una decisión sobre el plan, como bajar las kcal: se toma al
 * cerrar la semana, al lado de los cambios de pauta (`ReviewDecision`). Desde
 * esta semana, lo esperado parte de la base que pongas y sigue al ritmo que
 * elijas; la recta de antes se queda como fantasma.
 *
 * Antes de confirmar se ve la línea con el antes y el después: el plan tal y
 * como quedaría (`usePlanDelRoadmap` con la fase igualada), en el zoom de su
 * fase. Nada se guarda hasta pulsar.
 *
 * Nadie lo anuncia: ninguna semana se destaca por ir lejos de su recta. El
 * sistema enseña la desviación; no sugiere replanteos, no reajusta solo, no
 * avisa.
 */

const kg = (v, d = 1) => localeNumber(v, { minimumFractionDigits: d, maximumFractionDigits: d });
const numero = (v) => Number(String(v).replace(',', '.'));

export const IgualarAqui = ({ semana: s, reviews, onCerrar }) => {
  const { phases, igualar } = useApp();
  const dir = directionById(s.fase.direction);
  const vigente = replanteoVigente(s.fase, s.lunes);
  const [form, setForm] = useState(() => ({
    pesoBase: String(Math.round(s.media * 10) / 10).replace('.', ','),
    ratePct: String(vigente ? vigente.ratePct : s.fase.ratePct).replace('.', ','),
    nota: '',
  }));
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [ref, ancho] = useElementWidth(720);

  const pesoBase = numero(form.pesoBase);
  const ratePct = dir?.sign === 0 ? 0 : numero(form.ratePct);
  /* Sin la nota: escribirla no cambia la línea. */
  const cifras = useMemo(() => ({ semana: s.lunes, pesoBase, ratePct }), [s.lunes, pesoBase, ratePct]);
  const replanteo = { ...cifras, nota: form.nota };
  const problema = validarReplanteo(s.fase, cifras);

  /* El plan como quedaría. Con cifras que todavía no valen, el de ahora. */
  const fases = useMemo(
    () => (problema ? null : phases.map((f) => (f.id === s.fase.id ? { ...f, replanteos: conReplanteo(f, cifras) } : f))),
    [phases, s.fase.id, problema, cifras]
  );
  const { plan } = usePlanDelRoadmap({ reviews, phases: fases });

  const kgSemana = (base, rate) => targetRateKg({ direction: s.fase.direction, ratePct: rate }, base);

  const guardar = async (event) => {
    event.preventDefault();
    if (problema) {
      setError(problema);
      return;
    }
    setOcupado(true);
    const res = await igualar(s.fase, replanteo);
    setOcupado(false);
    if (!res?.ok) setError(res?.error || 'No se ha podido igualar.');
    else onCerrar();
  };

  return (
    <form className="igualar" onSubmit={guardar} aria-label={`Igualar la semana del ${shortDate(s.lunes)}`}>
      <p className="igualar-que">
        Desde la semana del {shortDate(s.lunes)}, lo esperado parte de la base que pongas y sigue al ritmo que elijas.
        Su media es {kg(s.media)} kg{s.esperado !== null ? `, y se esperaban ${kg(s.esperado)}` : ''}.
      </p>

      <div className="igualar-campos">
        <Field label="Base, en kg">
          <input
            className="input semana-campo"
            inputMode="decimal"
            value={form.pesoBase}
            onChange={(e) => setForm({ ...form, pesoBase: e.target.value })}
          />
        </Field>
        {dir?.sign !== 0 && (
          <Field
            label="Ritmo, % por semana"
            hint={
              Number.isFinite(replanteo.ratePct) && Number.isFinite(replanteo.pesoBase)
                ? `${kg(kgSemana(replanteo.pesoBase, replanteo.ratePct) ?? 0, 2)} kg/sem`
                : null
            }
          >
            <input
              className="input semana-campo"
              inputMode="decimal"
              value={form.ratePct}
              onChange={(e) => setForm({ ...form, ratePct: e.target.value })}
            />
          </Field>
        )}
        <Field label="Nota" className="grow">
          <input
            className="input"
            maxLength={120}
            value={form.nota}
            onChange={(e) => setForm({ ...form, nota: e.target.value })}
            placeholder="Tras las vacaciones"
          />
        </Field>
      </div>

      {/* El antes y el después, en la misma línea: la punteada es lo esperado
          de antes, la continua lo esperado desde esta semana. */}
      <figure className="igualar-previa">
        <div ref={ref}>
          {plan && (
            <LineaDelPlan
              plan={plan}
              ventana={ventanaDe({ zoom: 'fase', plan, lunes: s.lunes })}
              ancho={ancho}
              elegida={s.lunes}
              oculto={{ nutrition: true }}
            />
          )}
        </div>
        <figcaption className="igualar-pie">
          {problema
            ? problema
            : s.fase.replanteos?.length
              ? 'La punteada es lo esperado original; la continua, lo esperado si igualas aquí.'
              : 'La punteada es lo esperado hasta ahora; la continua, lo esperado si igualas aquí.'}
        </figcaption>
      </figure>

      {error && <Notice tone="error">{error}</Notice>}
      <div className="igualar-botones">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCerrar} disabled={ocupado}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={ocupado || Boolean(problema)}>
          Igualar aquí
        </button>
      </div>
    </form>
  );
};
