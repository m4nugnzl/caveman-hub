import { useMemo, useState } from 'react';
import { Redo2, Route, Undo2 } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { blockTraits, blocksOf, setBlockTraitsIn } from '@/domain/blocks';
import { borradorDe, cambiarBorrador } from '@/domain/borradores';
import { estirarFases, lineaDelCreador, llegadaCorta } from '@/domain/creadorDelPlan';
import { clientGoal } from '@/domain/goals';
import { cuentaAtras } from '@/domain/roadmap';
import { dayMonthMaybeYear, localeNumber, shortDate, todayISO } from '@/lib/dates';
import { useAtajoDeDeshacer } from '@/lib/useAtajoDeDeshacer';
import { useElementWidth } from '@/lib/useElementWidth';
import { BotonMas } from '@/components/ui/BotonMas';
import { EmptyState, Notice } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/ToastProvider';
import { BarraDelPlan } from './BarraDelPlan';
import { MesaDelPlan, duracionDelBloque } from './MesaDelPlan';
import { usePasosDelPlan } from './usePasosDelPlan';

/**
 * EL CREADOR DEL PLAN: la pestaña Plan de la ventana «El plan».
 *
 * ══ Qué es ═════════════════════════════════════════════════════════════════
 *
 * Donde se hace el plan de la temporada, dibujado como la temporada misma: la
 * barra segmentada de fases, bloques y hechos (`BarraDelPlan`), y encima tres
 * datos que la barra no dice —a dónde va y cuánto falta, a qué peso, y qué se
 * decide al final—. Lo que ya dice la barra (en qué fase está, la semana N de
 * M) no se repite arriba: dos cifras iguales con dos sentidos es lo que el
 * dueño tachó en la 3.ª vuelta de los bocetos.
 *
 * ══ Cómo se edita ══════════════════════════════════════════════════════════
 *
 *   · Duraciones: arrastrando el final de una barra (fase, bloque abierto o
 *     borrador). Encaja en la semana, o en la vuelta si el bloque es rotativo.
 *   · Todo lo demás: pulsando la pieza, que abre su ficha debajo
 *     (`MesaDelPlan`); o con «+ fase», «+ bloque» y «+ hecho».
 *
 * ══ Deshacer en todo ═══════════════════════════════════════════════════════
 *
 * Cada gesto se apunta con su inverso (`usePasosDelPlan`): el aviso lleva
 * «Deshacer», los mandos salen cuando hay algo que deshacer (la ley del
 * reposo), y ⌘Z / ⌘⇧Z funcionan mientras la ventana está abierta.
 */

const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/* La fecha con año solo si no es el de hoy. */
const fecha = (dia) => (dia ? dayMonthMaybeYear(`${dia}T12:00:00`) : '');

export const CreadorDelPlan = () => {
  const {
    activeClient,
    phases,
    anchors,
    hechos,
    anthropometry,
    workoutData,
    plan: suscripcion,
    estirarFase,
    setBlockTraits,
    cambiarBorradorDelBloque,
  } = useApp();
  const toast = useToast();
  const cid = activeClient?.id || null;
  const programa = workoutData?.[cid] || null;
  const history = useMemo(() => anthropometry?.[cid]?.history || [], [anthropometry, cid]);
  const hoy = todayISO();
  /* Con la suscripción caducada la base rechaza la escritura (0027): no se
     ofrece lo que va a fallar. */
  const puedeEditar = suscripcion?.activo !== false;

  const [ref, medido] = useElementWidth(820);
  const compacta = medido < 560;
  const [previa, setPrevia] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [error, setError] = useState('');
  const { pasos, apuntar, deshacer, rehacer, ocupado } = usePasosDelPlan();
  const atajos = useAtajoDeDeshacer();

  const entrada = useMemo(
    () => ({ phases, anchors, hechos, history, program: programa, client: activeClient, hoy }),
    [phases, anchors, hechos, history, programa, activeClient, hoy]
  );
  const base = useMemo(() => lineaDelCreador(entrada), [entrada]);

  /* Mientras se arrastra, se DIBUJA lo que quedaría; no se escribe nada. */
  const linea = useMemo(() => {
    if (!previa) return base;
    if (previa.tipo === 'fase') {
      return lineaDelCreador({ ...entrada, phases: estirarFases(phases, previa.id, previa.valor * 7) });
    }
    const program =
      previa.tipo === 'borrador'
        ? cambiarBorrador(programa, previa.id, { plannedWeeks: previa.valor })
        : setBlockTraitsIn(programa, previa.id, { plannedWeeks: previa.valor });
    return lineaDelCreador({ ...entrada, program });
  }, [base, previa, entrada, phases, programa]);

  /* ── Deshacer ─────────────────────────────────────────────────────────── */
  const rehacerConAviso = async () => {
    const r = await rehacer();
    if (r.ok) toast({ text: 'Rehecho.' });
    else if (!r.nada) setError(r.error || 'No se ha podido rehacer.');
  };
  const deshacerConAviso = async () => {
    const r = await deshacer();
    if (r.ok) toast({ text: 'Deshecho el último cambio del plan.', action: { label: 'Rehacer', onClick: rehacerConAviso } });
    else if (!r.nada) setError(r.error || 'No se ha podido deshacer.');
  };
  atajos.current = {
    deshacer: pasos.atras > 0 && !ocupado ? deshacerConAviso : null,
    rehacer: pasos.adelante > 0 && !ocupado ? rehacerConAviso : null,
  };

  const avisar = (texto) => toast({ text: texto, action: { label: 'Deshacer', onClick: deshacerConAviso } });

  /** Hace un gesto que se puede deshacer: lo ejecuta, lo apunta y lo dice. */
  const gesto = async ({ texto, hacer, deshacer: inverso, rehacer: otraVez }) => {
    setError('');
    let res;
    try {
      res = (await hacer()) || { ok: true };
    } catch (e) {
      res = { ok: false, error: e?.message || 'No se ha podido.' };
    }
    if (!res.ok) {
      setError(res.error || 'No se ha podido.');
      return res;
    }
    apuntar({ texto, deshacer: inverso, rehacer: otraVez || hacer });
    avisar(texto);
    return res;
  };
  /* Para los formularios que ya guardan por su cuenta (el destino): apuntan
     el paso hecho. */
  gesto.apuntado = (paso) => {
    apuntar(paso);
    avisar(paso.texto);
  };

  /* ── Soltar un arrastre: una escritura, un paso ──────────────────────── */
  const soltar = async (c) => {
    if (c.tipo === 'fase') {
      const f = base.fases.find((x) => x.fase.id === c.id);
      const dias = c.valor * 7;
      const semanas = (f ? f.b - f.a : 0) + c.valor;
      await gesto({
        texto: `${f?.fase.title || 'La fase'}: ${semanas} ${semanas === 1 ? 'semana' : 'semanas'}.`,
        hacer: () => estirarFase(cid, c.id, dias),
        deshacer: () => estirarFase(cid, c.id, -dias),
      });
      setPrevia(null);
      return;
    }
    const b = base.bloques.find((x) => x.id === c.id);
    const bloque = c.tipo === 'borrador' ? borradorDe(programa, c.id) : blocksOf(programa).find((x) => x.id === c.id);
    if (b) {
      await gesto(
        duracionDelBloque({
          b,
          valor: c.valor,
          previstas: blockTraits(bloque).plannedWeeks,
          cid,
          setBlockTraits,
          cambiarBorradorDelBloque,
        })
      );
    }
    setPrevia(null);
  };

  if (!activeClient) return null;

  const sinNada = base.fases.length === 0 && base.bloques.length === 0;

  return (
    <div className="creador" ref={ref}>
      <CabeceraDelPlan
        linea={base}
        client={activeClient}
        hoy={hoy}
        puedeEditar={puedeEditar}
        onElegir={(tipo) => setSeleccion({ tipo, id: tipo })}
      />

      {puedeEditar && (
        <div className="creador-acciones">
          <BotonMas palabra="fase" onClick={() => setSeleccion({ tipo: 'nueva-fase', id: 'nueva' })} />
          <BotonMas palabra="bloque" onClick={() => setSeleccion({ tipo: 'nuevo-bloque', id: 'nuevo' })} />
          <BotonMas palabra="hecho" onClick={() => setSeleccion({ tipo: 'nuevo-hecho', id: 'nuevo' })} />
          {(pasos.atras > 0 || pasos.adelante > 0) && (
            <span className="creador-deshacer">
              {pasos.atras > 0 && (
                <button
                  type="button"
                  className="btn btn-icon btn-icon-compact"
                  title="Deshacer el último cambio del plan (⌘Z)"
                  aria-label="Deshacer el último cambio del plan"
                  disabled={ocupado}
                  onClick={deshacerConAviso}
                >
                  <Undo2 size={15} />
                </button>
              )}
              {pasos.adelante > 0 && (
                <button
                  type="button"
                  className="btn btn-icon btn-icon-compact"
                  title="Rehacer (⌘⇧Z)"
                  aria-label="Rehacer el cambio deshecho"
                  disabled={ocupado}
                  onClick={rehacerConAviso}
                >
                  <Redo2 size={15} />
                </button>
              )}
            </span>
          )}
        </div>
      )}

      {error && (
        <Notice tone="error" onClose={() => setError('')}>
          {error}
        </Notice>
      )}

      {sinNada ? (
        <EmptyState
          icon={Route}
          title="Todavía no hay plan"
          message="Empieza por una fase —doce semanas de definición, dieciséis de volumen— y aquí verás la temporada entera, con sus bloques debajo."
        />
      ) : (
        <>
          <BarraDelPlan
            linea={linea}
            ancho={medido}
            startDate={activeClient.startDate}
            puedeEditar={puedeEditar}
            seleccion={seleccion}
            compacta={compacta}
            onSeleccionar={setSeleccion}
            onVistaPrevia={setPrevia}
            onSoltar={soltar}
          />
          {!seleccion && (
            <p className="creador-pista">
              {puedeEditar
                ? 'Pasa por una semana para ver qué tiene. Pulsa una fase, un bloque o un hecho para cambiarlo, o arrastra el final de su barra.'
                : 'Pasa por una semana para ver qué tiene.'}
            </p>
          )}
        </>
      )}

      {seleccion && (
        <MesaDelPlan
          seleccion={seleccion}
          linea={base}
          puedeEditar={puedeEditar}
          gesto={gesto}
          onCerrar={() => setSeleccion(null)}
          onElegir={setSeleccion}
        />
      )}
    </div>
  );
};

/* Un dato de la cabecera: se pulsa para cambiarlo, si se puede. */
const Dato = ({ tipo, children, etiqueta, puedeEditar, onElegir }) =>
  puedeEditar ? (
    <button type="button" className="creador-dato" aria-label={etiqueta} onClick={() => onElegir(tipo)}>
      {children}
    </button>
  ) : (
    <div className="creador-dato">{children}</div>
  );

/**
 * LO QUE LA BARRA NO DICE: a dónde va y cuánto falta, a qué peso, y qué se
 * decide al final. Cada dato abre su ficha para cambiarlo.
 */
const CabeceraDelPlan = ({ linea, client, hoy, puedeEditar, onElegir }) => {
  const destino = linea.destino;
  const cuenta = destino ? cuentaAtras(destino.evento, hoy) : null;
  const goal = clientGoal(client);
  const objetivo = goal?.targetWeightKg ?? null;
  const ultima = linea.fases[linea.fases.length - 1] || null;
  const cruce = linea.cruce;

  return (
    <div className="creador-cab">
      <Dato puedeEditar={puedeEditar} onElegir={onElegir} tipo="destino" etiqueta="Cambiar el destino">
        <span className="creador-dato-l">{destino ? `Destino · ${destino.evento.title}` : 'Destino'}</span>
        <span className="creador-dato-v tnum">
          {!destino ? (
            'Sin destino'
          ) : cuenta?.semanas ? (
            <>
              {cuenta.semanas} <small>semanas</small>
            </>
          ) : (
            cuenta?.texto || 'Ya pasó'
          )}
        </span>
        <span className="creador-dato-s">
          {destino
            ? [fecha(destino.fecha), llegadaCorta(linea.llegada, cruce?.caminos)].filter(Boolean).join(' · ')
            : 'Fija una competición o una fecha'}
        </span>
      </Dato>

      <Dato puedeEditar={puedeEditar} onElegir={onElegir} tipo="peso" etiqueta="Cambiar el peso objetivo">
        <span className="creador-dato-l">Peso objetivo</span>
        <span className="creador-dato-v tnum">
          {objetivo !== null ? (
            <>
              {kg(objetivo)} <small>kg</small>
            </>
          ) : (
            'Sin fijar'
          )}
        </span>
        <span className="creador-dato-s">
          {ultima?.salida !== null && ultima?.salida !== undefined
            ? `Esperado al acabar ${ultima.fase.title}: ${kg(ultima.salida)} kg`
            : '¿A qué peso va?'}
        </span>
      </Dato>

      <Dato puedeEditar={puedeEditar} onElegir={onElegir} tipo="cruce" etiqueta="Ver el cruce">
        <span className="creador-dato-l">{cruce ? `Se decide el ${shortDate(cruce.decide)}` : 'Después de la última fase'}</span>
        <span className="creador-dato-v is-frase">{cruce ? cruce.pregunta || 'Sin pregunta escrita' : 'Sin cruce'}</span>
        <span className="creador-dato-s">
          {cruce
            ? `${cruce.caminos.map((c) => c.titulo).join(' o ')}${cruce.caminos[0]?.semanas ? ` · ${cruce.caminos[0].semanas} sem` : ''}`
            : ultima?.fase.endsOn
              ? 'Plantea dos caminos'
              : 'La última fase no tiene final'}
        </span>
      </Dato>
    </div>
  );
};
