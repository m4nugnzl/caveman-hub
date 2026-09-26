import { useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { MAX_BLOCK_SPLIT, blockTraits } from '@/domain/blocks';
import { MAX_MICROCICLOS } from '@/domain/fasesDeLaTemporada';
import { addDays, shortDate } from '@/lib/dates';
import { clientPath } from '@/routes';
import { Modal } from '@/components/ui/Modal';
import { BotonAccion, Notice, useAccionDeBoton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/ToastProvider';

/** Dónde se monta un borrador: el Compositor de Entreno, abierto en él. */
export const rutaDeMontar = (clientId, borradorId) => `${clientPath(clientId, 'rutina')}/componer?borrador=${borradorId}`;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * «BLOQUE PREVISTO» (letra c): planificar un bloque desde la Temporada.
 *
 * Aquí solo se decide lo que se planifica —nombre, cuánto dura, el split
 * previsto y por qué—; las hojas se montan en Entreno, con el editor de
 * siempre («Montarlo en Entreno»). Se guarda como borrador (`draft_blocks`,
 * 0133): no empieza solo y el cliente no lo ve.
 *
 * Un borrador no tiene fecha propia: va detrás de lo que hay delante (el
 * abierto con su duración prevista, y los otros previstos). Por eso la ventana
 * no pide «empieza»: lo dice.
 *
 * El motivo va a la capa de la intervención del bloque (0143, `bloque_id`),
 * como el de cualquier otra. Son dos escrituras y la segunda espera a que el
 * borrador esté en la base (la validación de la 0143 lo busca allí): si no
 * llega, se dice y lo escrito se queda en la ventana.
 *
 * @param borrador el que se edita, o `null` para uno nuevo.
 * @param tramo    sus fechas (`{ desde, hasta }`), si se edita.
 * @param inicio   dónde empezaría uno nuevo.
 * @param detras   el nombre de lo que tiene delante, para decirlo.
 */
export const VentanaDeBloquePrevisto = ({ borrador = null, tramo = null, inicio, detras = null, cuenta = 1, onCerrar }) => {
  const {
    activeClient,
    anadirBorradorDelBloque,
    cambiarBorradorDelBloque,
    quitarBorradorDelBloque,
    devolverBorradorDelBloque,
    guardarIntervencion,
    notasDeIntervencion,
    saveStatus,
  } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const cid = activeClient?.id;
  const envio = useAccionDeBoton();
  /* Cómo va el guardado del programa, leído en cada render: el motivo de un
     bloque recién creado espera a que el borrador esté en la base. */
  const programa = useRef(null);
  programa.current = saveStatus('workout', cid);
  const nota = borrador ? (notasDeIntervencion || []).find((c) => c.clientId === cid && c.bloqueId === borrador.id) : null;

  const [nombre, setNombre] = useState(borrador?.name || '');
  const [semanas, setSemanas] = useState(() => blockTraits(borrador).plannedWeeks || 4);
  const [split, setSplit] = useState(borrador?.split || '');
  const [motivo, setMotivo] = useState(nota?.motivo || '');
  const [error, setError] = useState('');
  /* Si el bloque ya se creó y lo que falló fue el motivo, «Guardar» solo
     vuelve a intentar el motivo. */
  const [creado, setCreado] = useState(null);

  const desde = tramo?.desde || inicio;
  const hasta = addDays(desde, semanas * 7 - 1);
  const porDefecto = `Bloque ${cuenta}`;

  const anotar = async (id, recienCreado) => {
    const texto = motivo.trim();
    if (texto === (nota?.motivo || '').trim()) return { ok: true };
    if (recienCreado) {
      await espera(300);
      for (let i = 0; i < 40 && ['saving', 'pending'].includes(programa.current?.status); i += 1) await espera(200);
    }
    /* Y si aun así no ha llegado (sin red, una cola lenta), unos reintentos. */
    for (let i = 0; i < 8; i += 1) {
      const r = await guardarIntervencion(cid, { bloqueId: id }, { motivo: texto });
      if (r.ok || !/no existe/i.test(r.error || '')) return r;
      await espera(700);
    }
    return { ok: false, error: 'El bloque aún no ha llegado a guardarse.' };
  };

  const guardar = async () => {
    const datos = { name: nombre.trim() || porDefecto, plannedWeeks: semanas, split: split.trim() || null };
    let id = borrador?.id || creado;
    if (!id) {
      const nuevo = anadirBorradorDelBloque(cid, datos);
      if (!nuevo) {
        setError('Un bloque previsto necesita su duración.');
        return false;
      }
      id = nuevo.id;
      setCreado(id);
    } else if (borrador) {
      cambiarBorradorDelBloque(cid, id, datos);
    }
    const r = await anotar(id, !borrador);
    if (!r.ok) {
      setError(`El bloque está guardado; el motivo no: ${r.error} Vuelve a pulsar Guardar.`);
      return false;
    }
    onCerrar();
    if (!borrador) {
      toast({
        text: `«${datos.name}» previsto del ${shortDate(desde)} al ${shortDate(hasta)}.`,
        action: { label: 'Montarlo en Entreno', onClick: () => navigate(rutaDeMontar(cid, id)) },
      });
    }
    return true;
  };

  const quitar = () => {
    const fuera = quitarBorradorDelBloque(cid, borrador.id);
    onCerrar();
    if (!fuera?.quitado) return;
    toast({
      text: `Quitado «${borrador.name}».`,
      /* Vuelve con su motivo: la capa viaja con el Deshacer. */
      action: {
        label: 'Deshacer',
        onClick: async () => {
          const r = await devolverBorradorDelBloque(cid, fuera.quitado, fuera.posicion, fuera.capa);
          if (!r.ok) toast({ text: `«${borrador.name}» ha vuelto, pero sin su motivo: ${r.error}` });
        },
      },
    });
  };

  return (
    <Modal
      open
      title={borrador ? `«${borrador.name}»` : 'Bloque previsto'}
      sub="Se planifica aquí; las hojas se montan en Entreno. No empieza solo y el cliente no lo ve."
      onClose={onCerrar}
      footer={
        <div className="var-pie">
          {borrador && (
            <button type="button" className="btn btn-danger" onClick={quitar}>
              Quitar
            </button>
          )}
          <span className="grow" />
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>
            Cancelar
          </button>
          <BotonAccion type="submit" form="ventana-bloque-previsto" className="btn btn-primary" estado={envio.estado}>
            {borrador ? 'Guardar cambios' : 'Añadir'}
          </BotonAccion>
        </div>
      }
    >
      <form
        id="ventana-bloque-previsto"
        className="var-form"
        onSubmit={(e) => {
          e.preventDefault();
          envio.lanzar(guardar);
        }}
      >
        <p className="var-nada tnum">
          Del {shortDate(desde)} al {shortDate(hasta)}
          {detras ? `, al acabar «${detras}»` : ''}.
        </p>
        <div className="var-fechas">
          <label className="var-fecha">
            <span className="var-cifra-k">Nombre</span>
            <input className="input" value={nombre} placeholder={porDefecto} maxLength={80} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <div className="var-fecha">
            <span className="var-cifra-k">Dura</span>
            <div className="bp-dura" role="group" aria-label="Microciclos previstos">
              <button
                type="button"
                className="btn btn-icon btn-icon-compact"
                aria-label="Un microciclo menos"
                disabled={semanas <= 1}
                onClick={() => setSemanas((n) => Math.max(1, n - 1))}
              >
                <Minus size={15} />
              </button>
              <span className="tnum bp-dura-n">{semanas}</span>
              <button
                type="button"
                className="btn btn-icon btn-icon-compact"
                aria-label="Un microciclo más"
                disabled={semanas >= MAX_MICROCICLOS}
                onClick={() => setSemanas((n) => Math.min(MAX_MICROCICLOS, n + 1))}
              >
                <Plus size={15} />
              </button>
              <span className="t-xs t-secondary">{semanas === 1 ? 'microciclo' : 'microciclos'}</span>
            </div>
          </div>
        </div>
        <label className="var-fecha">
          <span className="var-cifra-k">Split previsto</span>
          <input
            className="input"
            value={split}
            maxLength={MAX_BLOCK_SPLIT}
            placeholder="Torso / Pierna, PPL…"
            onChange={(e) => setSplit(e.target.value)}
          />
        </label>
        <label className="var-fecha is-porque">
          <span className="var-cifra-k">¿Por qué?</span>
          <input
            className="input"
            maxLength={280}
            value={motivo}
            placeholder="Opcional · solo lo ves tú"
            onChange={(e) => setMotivo(e.target.value)}
          />
        </label>
        {borrador && (
          <p className="var-nada">
            {borrador.sessions?.length
              ? `${borrador.sessions.length} ${borrador.sessions.length === 1 ? 'hoja montada' : 'hojas montadas'}. `
              : 'Sin hojas todavía. '}
            <button type="button" className="tl-ins-enlace" onClick={() => navigate(rutaDeMontar(cid, borrador.id))}>
              Montarlo en Entreno
            </button>
          </p>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Modal>
  );
};
