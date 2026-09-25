import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { BLOCK_INTENTS, MAX_BLOCK_SPLIT, blockTraits, blocksOf, splitDelBloque } from '@/domain/blocks';
import { borradorDe, borradoresDe } from '@/domain/borradores';
import { kindMeta } from '@/domain/calendar';
import { MAX_MICROCICLOS, ritmoParaSalida } from '@/domain/creadorDelPlan';
import { latestWeight } from '@/domain/anthropometry';
import { forkDraft, forkState, hasFork, validateFork } from '@/domain/fork';
import { clientGoal, directionById, targetRateKg } from '@/domain/goals';
import { kcalDeMacros } from '@/domain/pautaDelDia';
import { nextPhaseDraft, replanteosDe, validatePhase } from '@/domain/roadmap';
import { ritmoTexto, tramoDeFechas } from '@/domain/semanasDelPlan';
import { localeNumber, shortDate } from '@/lib/dates';
import { toNum } from '@/lib/num';
import { clientPath } from '@/routes';
import { BotonAccion, Field, Notice, useAccionDeBoton } from '@/components/ui/primitives';
import { AnclaDelPlan } from './AnclaDelPlan';
import { Destino, ForkForm, ForkRow, PhaseForm } from './RoadmapPanel';

/**
 * LA MESA DEL CREADOR: lo que se edita de lo que has elegido en la barra.
 *
 * ══ Por qué debajo y no en un globo ════════════════════════════════════════
 *
 * El globo es una LECTURA (`ui/Globo`, `aria-hidden`): sale al pasar y se va.
 * Editar necesita campos que se puedan enfocar y un sitio que no se mueva con
 * el ratón, así que al PULSAR una fase, un bloque o un hecho se abre aquí, a
 * todo el ancho, debajo de la barra. Sin caja: un filete arriba y ya.
 *
 * ══ Todo lo que se hace aquí se puede deshacer ═════════════════════════════
 *
 * Cada gesto pasa por `gesto` (lo da `CreadorDelPlan`): se hace, se apunta en
 * la pila con su inverso y se anuncia con «Deshacer». Los formularios que ya
 * existían —fase, cruce, peso objetivo, destino— se reutilizan tal cual
 * (`RoadmapPanel`, `AnclaDelPlan`); lo nuevo es el atajo del peso de salida y
 * la duración de los bloques.
 */

const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signo = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${localeNumber(Math.abs(v), { maximumFractionDigits: 2 })}`;

/* Los campos de una fase que se guardan: para devolverla tal cual al deshacer
   un «Quitar». */
const camposDeFase = (f) => ({
  title: f.title,
  direction: f.direction,
  ratePct: f.ratePct,
  startsOn: f.startsOn,
  endsOn: f.endsOn,
  note: f.note || '',
  nextOptions: f.nextOptions || null,
  nextQuestion: f.nextQuestion || '',
  replanteos: f.replanteos || null,
});

export const MesaDelPlan = ({ seleccion, linea, puedeEditar, gesto, onCerrar, onElegir }) => {
  const app = useApp();
  const { activeClient, phases, workoutData } = app;
  const cid = activeClient?.id;
  const programa = workoutData?.[cid] || null;
  const hoy = linea.hoy;

  const { tipo, id } = seleccion;
  let titulo = '';
  let cuerpo = null;

  if (tipo === 'fase') {
    const f = linea.fases.find((x) => x.fase.id === id);
    if (!f) return null;
    titulo = f.fase.title;
    cuerpo = <FichaDeFase key={id} f={f} puedeEditar={puedeEditar} gesto={gesto} onCerrar={onCerrar} />;
  } else if (tipo === 'bloque') {
    const b = linea.bloques.find((x) => x.id === id);
    if (!b) return null;
    titulo = b.nombre;
    cuerpo = <FichaDeBloque key={id} b={b} programa={programa} puedeEditar={puedeEditar} gesto={gesto} onCerrar={onCerrar} />;
  } else if (tipo === 'hecho') {
    const h = linea.hechos.find((x) => x.evento.id === id);
    if (!h) return null;
    titulo = h.evento.title || kindMeta(h.evento.kind).label;
    cuerpo = <FichaDeHecho key={id} evento={h.evento} puedeEditar={puedeEditar} gesto={gesto} onCerrar={onCerrar} />;
  } else if (tipo === 'cruce') {
    titulo = 'El cruce';
    cuerpo = <FichaDelCruce puedeEditar={puedeEditar} gesto={gesto} onCerrar={onCerrar} hoy={hoy} />;
  } else if (tipo === 'nueva-fase') {
    titulo = 'Nueva fase';
    cuerpo = <NuevaFase phases={phases} hoy={hoy} gesto={gesto} onCerrar={onCerrar} onElegir={onElegir} />;
  } else if (tipo === 'nuevo-bloque') {
    titulo = 'Nuevo bloque en borrador';
    cuerpo = <NuevoBorrador programa={programa} gesto={gesto} onCerrar={onCerrar} onElegir={onElegir} />;
  } else if (tipo === 'nuevo-hecho') {
    titulo = 'Nuevo hecho';
    cuerpo = <NuevoHecho hoy={hoy} gesto={gesto} onCerrar={onCerrar} onElegir={onElegir} />;
  } else if (tipo === 'destino') {
    titulo = 'Destino';
    cuerpo = <AnclaDelPlan puedeEditar={puedeEditar} hoy={hoy} onPaso={(paso) => gesto.apuntado(paso)} />;
  } else if (tipo === 'peso') {
    titulo = 'Peso objetivo';
    cuerpo = <PesoObjetivo gesto={gesto} onCerrar={onCerrar} />;
  }

  return (
    <section className="creador-mesa" aria-label={titulo}>
      <header className="creador-mesa-cab">
        <h3>{titulo}</h3>
        <button type="button" className="btn btn-icon btn-icon-compact" aria-label="Cerrar" title="Cerrar" onClick={onCerrar}>
          <X size={15} />
        </button>
      </header>
      {cuerpo}
    </section>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   LA FASE
   ══════════════════════════════════════════════════════════════════════════ */

const FichaDeFase = ({ f, puedeEditar, gesto, onCerrar }) => {
  const { activeClient, phases, updatePhase, removePhase, addPhase } = useApp();
  const cid = activeClient?.id;
  const fase = f.fase;
  const meta = directionById(fase.direction);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [salida, setSalida] = useState('');
  const semanas = f.b - f.a;
  const kgSemana = f.entrada !== null ? targetRateKg(fase, f.entrada) : null;
  const igualada = replanteosDe(fase).length > 0;

  const propuesta =
    salida.trim() === ''
      ? null
      : ritmoParaSalida({ direction: fase.direction, entrada: f.entrada, salida, dias: f.dias });

  if (form) {
    return (
      <PhaseForm
        value={form}
        onChange={setForm}
        onCancel={() => {
          setForm(null);
          setError('');
        }}
        onSubmit={async () => {
          const problema = validatePhase(phases, form, fase.id);
          if (problema) {
            setError(problema);
            return false;
          }
          if (!form.endsOn && hasFork(form)) {
            setError('Esta fase tiene un cruce planteado y sin fecha de fin no habría día en el que decidir.');
            return false;
          }
          const antes = camposDeFase(fase);
          const despues = camposDeFase(form);
          const res = await gesto({
            texto: `${form.title}: cambiada.`,
            hacer: () => updatePhase(fase.id, despues),
            deshacer: () => updatePhase(fase.id, antes),
          });
          if (!res.ok) {
            setError(res.error);
            return false;
          }
          setForm(null);
          return true;
        }}
        error={error}
      />
    );
  }

  const quitar = async () => {
    const campos = camposDeFase(fase);
    let vivo = fase.id;
    const res = await gesto({
      texto: `Quitada «${fase.title}».`,
      hacer: () => removePhase(vivo),
      deshacer: async () => {
        const r = await addPhase(cid, campos);
        if (r.ok) vivo = r.phase.id;
        return r;
      },
    });
    if (res.ok) onCerrar();
  };

  const ponerRitmo = async () => {
    if (!propuesta || propuesta.error) return;
    const viejo = fase.ratePct;
    const res = await gesto({
      texto: `${fase.title}: ${ritmoTexto(fase.direction, propuesta.ratePct)}.`,
      hacer: () => updatePhase(fase.id, { ratePct: propuesta.ratePct }),
      deshacer: () => updatePhase(fase.id, { ratePct: viejo }),
    });
    if (res.ok) setSalida('');
  };

  return (
    <div className="creador-ficha">
      <p className="creador-ficha-linea tnum">
        {tramoDeFechas(fase.startsOn, fase.endsOn)} · {semanas} {semanas === 1 ? 'semana' : 'semanas'}
        {' · '}
        <span style={{ color: meta?.color }}>{meta?.label}</span>
        {meta?.sign !== 0 && (
          <>
            {' · '}
            {ritmoTexto(fase.direction, fase.ratePct)}
            {kgSemana !== null ? ` (${signo(kgSemana)} kg/sem)` : ''}
          </>
        )}
      </p>

      <dl className="creador-pesos">
        <div>
          <dt>Entra con</dt>
          <dd className="tnum">{f.entrada !== null ? `${kg(f.entrada)} kg` : '—'}</dd>
          <dd className="creador-pesos-nota">
            {f.entrada === null ? 'Sin pesajes todavía' : f.real ? 'Lo que pesaba al empezar' : 'Lo esperado al acabar la anterior'}
          </dd>
        </div>
        <div>
          <dt>Sale con</dt>
          <dd className="tnum">{f.salida !== null ? `${kg(f.salida)} kg` : '—'}</dd>
          <dd className="creador-pesos-nota">
            {f.salida === null
              ? 'Sin final no hay salida'
              : f.salidaOriginal !== null
                ? `Igualada. El plan original: ${kg(f.salidaOriginal)} kg`
                : 'Entrada, ritmo y semanas'}
          </dd>
        </div>
      </dl>

      {/* ── El atajo: se escribe la salida y se enseña el ritmo que sale ── */}
      {puedeEditar && meta?.sign !== 0 && f.entrada !== null && fase.endsOn && (
        igualada ? (
          <p className="t-xs t-tertiary">
            Tiene semanas igualadas, así que su ritmo de ahora sale del último igualado. Se cambia igualando otra
            semana en su revisión.
          </p>
        ) : (
          <div className="creador-atajo">
            <Field label="¿Con qué peso quieres que salga?">
              <input
                className="input input-sm"
                inputMode="decimal"
                style={{ width: 96 }}
                value={salida}
                placeholder={f.salida !== null ? kg(f.salida) : ''}
                aria-label="Peso de salida en kilos"
                onChange={(e) => setSalida(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') ponerRitmo();
                }}
              />
            </Field>
            {propuesta && (
              <p className={`creador-atajo-dice${propuesta.error ? ' is-error' : ''}`} role="status">
                {propuesta.error ||
                  `Sale a ${ritmoTexto(fase.direction, propuesta.ratePct)}${
                    propuesta.kgSemana !== null ? ` · ${signo(propuesta.kgSemana)} kg/sem` : ''
                  }, antes ${ritmoTexto(fase.direction, fase.ratePct)}`}
              </p>
            )}
            {propuesta && !propuesta.error && (
              <button type="button" className="btn btn-primary btn-sm" onClick={ponerRitmo}>
                Poner ese ritmo
              </button>
            )}
          </div>
        )
      )}

      {fase.note && <p className="t-xs t-secondary">{fase.note}</p>}
      {error && <Notice tone="error">{error}</Notice>}

      {puedeEditar && (
        <div className="row gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ ...fase })}>
            Cambiar
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={quitar}>
            Quitar
          </button>
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   EL BLOQUE
   ══════════════════════════════════════════════════════════════════════════ */

const FichaDeBloque = ({ b, programa, puedeEditar, gesto, onCerrar }) => {
  const navigate = useNavigate();
  const {
    activeClient,
    setBlockTraits,
    cambiarBorradorDelBloque,
    quitarBorradorDelBloque,
    devolverBorradorDelBloque,
  } = useApp();
  const cid = activeClient?.id;
  const esBorrador = b.tipo === 'borrador';
  const bloque = esBorrador ? borradorDe(programa, b.id) : blocksOf(programa).find((x) => x.id === b.id);
  const previstas = blockTraits(bloque).plannedWeeks;
  const intent = BLOCK_INTENTS.find((i) => i.id === b.intent)?.label || null;
  /* El split: el nombre que le pone el entrenador. Vacío, la línea de tiempo
     enseña lo que dicen sus datos, que es lo que va de ejemplo en el campo. */
  const split = !esBorrador && bloque ? splitDelBloque(programa, bloque, activeClient) : null;
  const [nombreSplit, setNombreSplit] = useState(split?.nombre || '');
  const guardarSplit = async () => {
    const nuevo = nombreSplit.trim().slice(0, MAX_BLOCK_SPLIT) || null;
    const antes = split?.nombre || null;
    if (nuevo === antes) return;
    await gesto({
      texto: nuevo ? `${b.nombre}: «${nuevo}».` : `${b.nombre}: sin nombre de split.`,
      hacer: async () => {
        setBlockTraits(cid, b.id, { split: nuevo });
        return { ok: true };
      },
      deshacer: async () => {
        setBlockTraits(cid, b.id, { split: antes });
        setNombreSplit(antes || '');
        return { ok: true };
      },
    });
  };

  const duracion = async (n) => {
    const valor = Math.max(b.minimo, Math.min(MAX_MICROCICLOS, n));
    if (valor === b.microciclos) return;
    await gesto(duracionDelBloque({ b, valor, previstas, cid, setBlockTraits, cambiarBorradorDelBloque }));
  };

  const quitar = async () => {
    let fuera = null;
    const res = await gesto({
      texto: `Quitado el borrador «${b.nombre}».`,
      hacer: async () => {
        fuera = quitarBorradorDelBloque(cid, b.id);
        return { ok: Boolean(fuera?.quitado) };
      },
      deshacer: async () => {
        devolverBorradorDelBloque(cid, fuera.quitado, fuera.posicion);
        return { ok: true };
      },
    });
    if (res.ok) onCerrar();
  };

  const estado = esBorrador ? 'En borrador' : b.tipo === 'abierto' ? 'En curso' : 'Hecho';

  return (
    <div className="creador-ficha">
      <p className="creador-ficha-linea tnum">
        {estado}
        {intent && intent !== b.nombre ? ` · ${intent}` : ''} · {tramoDeFechas(b.desde, b.hasta)}
        {b.estimado ? ' · fechas estimadas' : ''}
      </p>
      <p className="t-xs t-secondary tnum">
        {esBorrador
          ? `${b.microciclos} ${b.microciclos === 1 ? 'microciclo' : 'microciclos'} previstos${bloque?.sessions?.length ? ` · ${bloque.sessions.length} hojas` : ' · sin hojas todavía'}`
          : b.tipo === 'abierto'
            ? `${b.escritos} ${b.escritos === 1 ? 'microciclo montado' : 'microciclos montados'}${previstas ? ` de ${previstas} previstos` : ' · sin duración prevista'}`
            : `${b.escritos} ${b.escritos === 1 ? 'microciclo' : 'microciclos'}`}
        {b.rotativo && b.vuelta !== 7 ? ` · microciclo de ${b.vuelta} días` : ''}
      </p>

      {puedeEditar && b.asa && (
        <div className="creador-duracion" role="group" aria-label="Microciclos previstos">
          <span className="t-xs t-secondary">Dura</span>
          <button
            type="button"
            className="btn btn-icon btn-icon-compact"
            aria-label="Un microciclo menos"
            disabled={b.microciclos <= b.minimo}
            onClick={() => duracion(b.microciclos - 1)}
          >
            <Minus size={15} />
          </button>
          <span className="tnum creador-duracion-n">{b.microciclos}</span>
          <button
            type="button"
            className="btn btn-icon btn-icon-compact"
            aria-label="Un microciclo más"
            disabled={b.microciclos >= MAX_MICROCICLOS}
            onClick={() => duracion(b.microciclos + 1)}
          >
            <Plus size={15} />
          </button>
          <span className="t-xs t-tertiary">
            {b.microciclos === 1 ? 'microciclo' : 'microciclos'}
            {b.tipo === 'abierto' ? '. Los microciclos se montan en Entreno.' : ''}
          </span>
        </div>
      )}

      {split && (puedeEditar || split.nombre) && (
        <Field label="Split" hint={split.deducido ? 'Vacío, se usa el que dicen sus hojas.' : undefined}>
          {puedeEditar ? (
            <input
              className="input"
              maxLength={MAX_BLOCK_SPLIT}
              placeholder={split?.deducido || 'Torso / Pierna, PPL…'}
              value={nombreSplit}
              onChange={(e) => setNombreSplit(e.target.value)}
              onBlur={guardarSplit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
          ) : (
            <span className="t-sm">{split.nombre}</span>
          )}
        </Field>
      )}

      <div className="row gap-2">
        {esBorrador ? (
          <>
            {puedeEditar && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`${clientPath(cid, 'rutina')}/componer?borrador=${b.id}`)}
              >
                Rellenar en Entreno
              </button>
            )}
            {puedeEditar && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={quitar}>
                Quitar
              </button>
            )}
          </>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(clientPath(cid, 'rutina'))}>
            Ver en Entreno
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * El gesto de cambiar lo que dura un bloque: `plannedWeeks` del abierto o del
 * borrador. Lo comparten el arrastre y los botones ±, así que vive fuera.
 */
export const duracionDelBloque = ({ b, valor, previstas, cid, setBlockTraits, cambiarBorradorDelBloque }) => {
  const poner = (n) => {
    if (b.tipo === 'borrador') cambiarBorradorDelBloque(cid, b.id, { plannedWeeks: n });
    else setBlockTraits(cid, b.id, { plannedWeeks: n });
    return { ok: true };
  };
  return {
    texto: `${b.nombre}: ${valor} ${valor === 1 ? 'microciclo' : 'microciclos'}.`,
    hacer: async () => poner(valor),
    /* Un abierto sin duración prevista vuelve a no tenerla. */
    deshacer: async () => poner(previstas ?? null),
  };
};

/* ══════════════════════════════════════════════════════════════════════════
   LOS HECHOS
   ══════════════════════════════════════════════════════════════════════════ */

const FichaDeHecho = ({ evento, puedeEditar, gesto, onCerrar }) => {
  const { activeClient, anadirHecho, quitarHecho } = useApp();
  const cid = activeClient?.id;
  const meta = kindMeta(evento.kind);

  const quitar = async () => {
    let vivo = evento.id;
    const res = await gesto({
      texto: `Quitado «${evento.title}».`,
      hacer: () => quitarHecho(vivo),
      deshacer: async () => {
        const r = await anadirHecho(cid, evento);
        if (r.ok) vivo = r.hecho.id;
        return r;
      },
    });
    if (res.ok) onCerrar();
  };

  return (
    <div className="creador-ficha">
      <p className="creador-ficha-linea tnum">
        {meta.label} ·{' '}
        {evento.hasta && evento.hasta !== evento.date
          ? `del ${shortDate(evento.date)} al ${shortDate(evento.hasta)}`
          : shortDate(evento.date)}
        {evento.kcal ? ` · ${evento.kcal} kcal` : ''}
        {evento.proteina !== null && evento.proteina !== undefined
          ? ` · P ${evento.proteina} · C ${evento.carbohidratos} · G ${evento.grasa} g`
          : ''}
      </p>
      {evento.nota && <p className="t-sm t-secondary">{evento.nota}</p>}
      <p className="t-xs t-tertiary">Es un evento de su calendario: se cambia allí, con sus fechas.</p>
      {puedeEditar && (
        <div className="row gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={quitar}>
            Quitar
          </button>
        </div>
      )}
    </div>
  );
};

const TIPOS_DE_HECHO = [
  { kind: 'refeed', label: 'Refeed', conKcal: true },
  { kind: 'diet_break', label: 'Diet break', conKcal: true },
  { kind: 'rest', label: 'Vacaciones', conKcal: false },
  { kind: 'race', label: 'Competición', conKcal: false },
];

const NuevoHecho = ({ hoy, gesto, onCerrar, onElegir }) => {
  const { activeClient, anadirHecho, quitarHecho } = useApp();
  const cid = activeClient?.id;
  const envio = useAccionDeBoton();
  const [v, setV] = useState({
    kind: 'refeed',
    title: 'Refeed',
    date: hoy,
    hasta: '',
    kcal: '',
    proteina: '',
    carbohidratos: '',
    grasa: '',
    nota: '',
  });
  const [error, setError] = useState('');
  const tipo = TIPOS_DE_HECHO.find((t) => t.kind === v.kind);
  const set = (p) => setV((x) => ({ ...x, ...p }));
  /* Con las tres macros, las kcal salen de ellas y no se escriben: nunca
     pueden contradecirse (0142). */
  const kcalCalculadas = tipo.conKcal ? kcalDeMacros({ protein: v.proteina, carbs: v.carbohidratos, fats: v.grasa }) : null;
  const algunaMacro = [v.proteina, v.carbohidratos, v.grasa].some((x) => String(x).trim() !== '');

  const guardar = async () => {
    if (!v.date) {
      setError('Falta el día.');
      return false;
    }
    if (v.hasta && v.hasta < v.date) {
      setError('El último día va después del primero.');
      return false;
    }
    if (tipo.conKcal && algunaMacro && kcalCalculadas === null) {
      setError('Faltan macros: van las tres o ninguna.');
      return false;
    }
    const conMacros = tipo.conKcal && kcalCalculadas !== null;
    const datos = {
      kind: v.kind,
      title: v.title.trim() || tipo.label,
      date: v.date,
      hasta: v.hasta || null,
      kcal: conMacros ? kcalCalculadas : tipo.conKcal ? toNum(v.kcal) : null,
      proteina: conMacros ? toNum(v.proteina) : null,
      carbohidratos: conMacros ? toNum(v.carbohidratos) : null,
      grasa: conMacros ? toNum(v.grasa) : null,
      nota: v.nota.trim() || null,
    };
    let vivo = null;
    const res = await gesto({
      texto: `Apuntado «${datos.title}».`,
      hacer: async () => {
        const r = await anadirHecho(cid, datos);
        if (r.ok) vivo = r.hecho.id;
        return r;
      },
      deshacer: () => quitarHecho(vivo),
    });
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    onElegir({ tipo: 'hecho', id: vivo });
    return true;
  };

  return (
    <form
      className="creador-ficha"
      onSubmit={(e) => {
        e.preventDefault();
        envio.lanzar(guardar);
      }}
    >
      <div className="rail-wrap" role="group" aria-label="Qué es">
        {TIPOS_DE_HECHO.map((t) => (
          <button
            key={t.kind}
            type="button"
            className="chip"
            aria-pressed={v.kind === t.kind}
            onClick={() => set({ kind: t.kind, title: TIPOS_DE_HECHO.some((x) => x.label === v.title) || !v.title ? t.label : v.title })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="creador-campos">
        <Field label="Nombre">
          <input className="input" value={v.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Desde">
          <input type="date" className="input" value={v.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="Hasta" hint="Vacío si es un solo día.">
          <input
            type="date"
            className="input"
            value={v.hasta}
            min={v.date || undefined}
            onChange={(e) => set({ hasta: e.target.value })}
          />
        </Field>
        {tipo.conKcal && (
          <>
            <Field label="Proteína" hint="Opcional, en gramos.">
              <input className="input" inputMode="numeric" value={v.proteina} onChange={(e) => set({ proteina: e.target.value })} />
            </Field>
            <Field label="Carbohidratos" hint="Opcional, en gramos.">
              <input
                className="input"
                inputMode="numeric"
                value={v.carbohidratos}
                onChange={(e) => set({ carbohidratos: e.target.value })}
              />
            </Field>
            <Field label="Grasa" hint="Opcional, en gramos.">
              <input className="input" inputMode="numeric" value={v.grasa} onChange={(e) => set({ grasa: e.target.value })} />
            </Field>
            <Field
              label="Kcal"
              hint={kcalCalculadas !== null ? 'Salen de las macros.' : algunaMacro ? 'Con las tres macros, salen solas.' : 'Las de esos días, si cambian.'}
            >
              {kcalCalculadas !== null ? (
                <input className="input" value={kcalCalculadas} readOnly aria-readonly="true" />
              ) : (
                <input className="input" inputMode="numeric" value={v.kcal} onChange={(e) => set({ kcal: e.target.value })} />
              )}
            </Field>
          </>
        )}
        {/* La ve el cliente: el porqué va en el «Motivo» de su tarjeta de impacto, que es solo del entrenador. */}
        <Field label="Indicación para el cliente" hint="Opcional. La ve el cliente en su dieta de ese día.">
          <input className="input" maxLength={280} value={v.nota} onChange={(e) => set({ nota: e.target.value })} />
        </Field>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="row gap-2 row-end">
        <button type="button" className="btn btn-secondary" onClick={onCerrar}>
          Cancelar
        </button>
        <BotonAccion type="submit" className="btn btn-primary" estado={envio.estado}>
          Añadir
        </BotonAccion>
      </div>
    </form>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   LAS ALTAS: fase y borrador
   ══════════════════════════════════════════════════════════════════════════ */

const NuevaFase = ({ phases, hoy, gesto, onCerrar, onElegir }) => {
  const { activeClient, addPhase, removePhase } = useApp();
  const cid = activeClient?.id;
  const [form, setForm] = useState(() => nextPhaseDraft(phases, 'cut', 8, hoy));
  const [error, setError] = useState('');

  if (!form) {
    return (
      <Notice tone="info">
        La última fase no tiene fecha de fin, así que no se puede encadenar otra detrás. Ponle un final primero.
      </Notice>
    );
  }

  return (
    <PhaseForm
      value={form}
      onChange={setForm}
      onCancel={onCerrar}
      error={error}
      onSubmit={async () => {
        const problema = validatePhase(phases, form, null);
        if (problema) {
          setError(problema);
          return false;
        }
        const campos = camposDeFase(form);
        let vivo = null;
        const res = await gesto({
          texto: `Añadida «${form.title}».`,
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
        onElegir({ tipo: 'fase', id: vivo });
        return true;
      }}
    />
  );
};

const NuevoBorrador = ({ programa, gesto, onCerrar, onElegir }) => {
  const { activeClient, anadirBorradorDelBloque, quitarBorradorDelBloque, devolverBorradorDelBloque } = useApp();
  const cid = activeClient?.id;
  const envio = useAccionDeBoton();
  const cuenta = blocksOf(programa).length + borradoresDe(programa).length + 1;
  const [v, setV] = useState({ name: '', intent: null, plannedWeeks: 4 });

  const guardar = async () => {
    let hecho = null;
    let fuera = null;
    const datos = { name: v.name.trim() || `Bloque ${cuenta}`, intent: v.intent, plannedWeeks: v.plannedWeeks };
    const res = await gesto({
      texto: `Añadido «${datos.name}» en borrador.`,
      hacer: async () => {
        if (fuera?.quitado) {
          devolverBorradorDelBloque(cid, fuera.quitado, fuera.posicion);
          return { ok: true };
        }
        hecho = anadirBorradorDelBloque(cid, datos);
        return hecho ? { ok: true } : { ok: false, error: 'Un borrador necesita su duración.' };
      },
      deshacer: async () => {
        fuera = quitarBorradorDelBloque(cid, hecho.id);
        return { ok: true };
      },
    });
    if (res.ok && hecho) onElegir({ tipo: 'bloque', id: hecho.id });
    return res.ok;
  };

  return (
    <form
      className="creador-ficha"
      onSubmit={(e) => {
        e.preventDefault();
        envio.lanzar(guardar);
      }}
    >
      <p className="t-xs t-secondary">
        Va detrás de lo previsto. No empieza solo: se rellena y se empieza en Entreno.
      </p>
      <div className="creador-campos">
        <Field label="Nombre">
          <input
            className="input"
            value={v.name}
            placeholder={`Bloque ${cuenta}`}
            onChange={(e) => setV((x) => ({ ...x, name: e.target.value }))}
          />
        </Field>
        <Field label="Microciclos">
          <input
            className="input"
            type="number"
            min={1}
            max={MAX_MICROCICLOS}
            value={v.plannedWeeks}
            onChange={(e) =>
              setV((x) => ({ ...x, plannedWeeks: Math.max(1, Math.min(MAX_MICROCICLOS, Math.trunc(Number(e.target.value)) || 1)) }))
            }
          />
        </Field>
      </div>
      <div className="rail-wrap" role="group" aria-label="A qué juega">
        {BLOCK_INTENTS.map((i) => (
          <button
            key={i.id}
            type="button"
            className="chip"
            aria-pressed={v.intent === i.id}
            onClick={() => setV((x) => ({ ...x, intent: x.intent === i.id ? null : i.id }))}
          >
            {i.label}
          </button>
        ))}
      </div>
      <div className="row gap-2 row-end">
        <button type="button" className="btn btn-secondary" onClick={onCerrar}>
          Cancelar
        </button>
        <BotonAccion type="submit" className="btn btn-primary" estado={envio.estado}>
          Añadir
        </BotonAccion>
      </div>
    </form>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   EL CRUCE Y EL PESO OBJETIVO: los formularios de siempre, con Deshacer
   ══════════════════════════════════════════════════════════════════════════ */

const FichaDelCruce = ({ puedeEditar, gesto, onCerrar, hoy }) => {
  const { phases, anthropometry, activeClient, setPhaseFork, chooseFork, removePhase } = useApp();
  const [editar, setEditar] = useState(null);
  const [error, setError] = useState('');
  const peso = latestWeight(anthropometry?.[activeClient?.id]?.history);
  const ordenadas = [...phases].sort((a, b) => String(a.startsOn).localeCompare(String(b.startsOn)));
  const ultima = ordenadas[ordenadas.length - 1] || null;
  const cruce = forkState(phases, hoy);
  const opciones = cruce ? cruce.options : null;

  const plantear = async (options, pregunta) => {
    const problema = validateFork(phases, ultima.id, options, pregunta);
    if (problema) {
      setError(problema);
      return false;
    }
    const antes = { options: opciones, pregunta: ultima.nextQuestion || '' };
    const res = await gesto({
      texto: opciones ? 'Cruce cambiado.' : 'Cruce planteado.',
      hacer: () => setPhaseFork(ultima.id, options, pregunta.trim()),
      deshacer: () => setPhaseFork(ultima.id, antes.options, antes.pregunta),
    });
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setEditar(null);
    setError('');
    return true;
  };

  if (!ultima || !ultima.endsOn) {
    return <Notice tone="info">El cruce cuelga del final de la última fase, y la última no tiene final.</Notice>;
  }

  if (editar || !cruce) {
    const valor = editar || { phaseId: ultima.id, options: forkDraft(), pregunta: '' };
    return (
      <ForkForm
        value={valor}
        onChange={setEditar}
        onCancel={() => {
          setEditar(null);
          if (!cruce) onCerrar();
        }}
        onSubmit={() => plantear(valor.options, valor.pregunta || '')}
        error={error}
      />
    );
  }

  return (
    <div className="creador-ficha">
      <ForkRow
        fork={cruce}
        weight={peso}
        onChoose={
          puedeEditar
            ? async (option) => {
                let nueva = null;
                const res = await gesto({
                  texto: `Elegido «${option.title}».`,
                  hacer: async () => {
                    const r = await chooseFork(ultima, option);
                    if (r.ok) nueva = r.phase.id;
                    return r;
                  },
                  deshacer: async () => {
                    const r = await removePhase(nueva);
                    if (!r.ok) return r;
                    return setPhaseFork(ultima.id, opciones, ultima.nextQuestion || '');
                  },
                });
                if (res.ok) onCerrar();
                else setError(res.error);
              }
            : null
        }
        onEdit={puedeEditar ? () => setEditar({ phaseId: ultima.id, options: opciones, pregunta: cruce.pregunta }) : null}
        onDiscard={
          puedeEditar
            ? async () => {
                const res = await gesto({
                  texto: 'Cruce descartado.',
                  hacer: () => setPhaseFork(ultima.id, null),
                  deshacer: () => setPhaseFork(ultima.id, opciones, ultima.nextQuestion || ''),
                });
                if (res.ok) onCerrar();
              }
            : null
        }
        onPregunta={puedeEditar ? (p) => plantear(opciones, p) : null}
      />
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
};

const PesoObjetivo = ({ gesto, onCerrar }) => {
  const { activeClient, updateClientPreferences } = useApp();
  const goal = clientGoal(activeClient);
  if (!goal) {
    return (
      <Notice tone="info">
        El peso objetivo va con una dirección: fíjala en su ficha (definición, mantenimiento o volumen) y vuelve.
      </Notice>
    );
  }
  const antes = goal.targetWeightKg ?? null;
  return (
    <Destino
      key={`meta-${antes ?? 'sin'}`}
      goal={goal}
      onSet={async (valor) => {
        const res = await gesto({
          texto: valor === null ? 'Peso objetivo quitado.' : `Peso objetivo: ${kg(valor)} kg.`,
          hacer: async () => {
            updateClientPreferences(activeClient.id, 'goal', { targetWeightKg: valor });
            return { ok: true };
          },
          deshacer: async () => {
            updateClientPreferences(activeClient.id, 'goal', { targetWeightKg: antes });
            return { ok: true };
          },
        });
        if (res.ok) onCerrar();
      }}
    />
  );
};
