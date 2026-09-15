import { useMemo, useState } from 'react';
import { ArrowLeft, ClipboardList } from 'lucide-react';

import { useActions, useApp } from '@/context/AppContext';
import { notaDe, pendientesDeCliente } from '@/domain/envios';
import { aterrizar, faltanObligatorias } from '@/domain/formulario';
import { buildAnthropometryLog } from '@/domain/anthropometry';
import { todayISO } from '@/lib/dates';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { BotonAccion, EmptyState, Notice } from '@/components/ui/primitives';
import { CuerpoDeFormulario } from './CuerpoDeFormulario';

/**
 * LO QUE TU ENTRENADOR TE HA MANDADO.
 *
 * ══ Por qué es una pantalla y no un aviso ══════════════════════════════════
 *
 * Porque hasta ahora el portal solo sabía pedir tres cosas —el alta, el parte y
 * el check-in—, y las tres estaban cosidas a su momento. Un cuestionario suelto
 * no tenía dónde aparecer, así que mandarlo no habría servido de nada: el
 * trabajo del cliente entra en el mismo bloque que el del entrenador, no
 * después.
 *
 * ══ Y ahora son cuatro cosas, no una ═══════════════════════════════════════
 *
 * Un formulario, un vídeo, un documento y lo que él te pida. Los tres últimos
 * vivían como pasos de SU ALTA, y eso tenía dos consecuencias que se veían desde
 * aquí: un vídeo mandado en el mes ocho le reabría el onboarding —«lo que te
 * falta para empezar», con su barra de progreso—, y lo que le pedías no lo veía
 * nadie, porque un paso propio nace del lado del entrenador y esta pantalla solo
 * pinta lo suyo. Ahora los cuatro llegan por el mismo sitio y su alta vuelve a
 * ser su alta.
 *
 * ── Sin reproches ─────────────────────────────────────────────────────────
 * Nada aquí cuenta cuánto lleva sin contestar ni dice que llegue tarde. Dice
 * qué le han mandado y le deja hacerlo. Es la misma ley que sostiene el resto
 * del portal.
 */
export const FormulariosDelCliente = () => {
  const { activeClient, envioRows, enviosReady } = useApp();
  const { marcarAccion, addAnthropometryLog } = useActions();

  const [abierto, setAbierto] = useState(null);
  const [borrador, setBorrador] = useState({});
  const [aviso, setAviso] = useState(null);

  const mios = useMemo(
    () => (envioRows || []).filter((f) => f.client_id === activeClient?.id),
    [envioRows, activeClient]
  );

  const pendientes = useMemo(() => pendientesDeCliente(mios, todayISO()), [mios]);
  const hechos = useMemo(() => mios.filter((f) => f.submitted_at), [mios]);

  const fila = mios.find((f) => f.id === abierto) || null;
  const elementos = fila?.schema?.elementos || [];
  const recado = notaDe(fila);
  const faltan = faltanObligatorias(elementos, borrador);

  /* Darla por hecha sin abrir nada: el vídeo que se abre, lo que él ya te ha
     mandado por otro sitio. Sin respuestas, que es lo que `marcar_accion`
     entiende como «ya está». */
  const marcar = (f) => marcarAccion(f.id);

  const abrir = (f) => {
    setAbierto(f.id);
    /* Se abre con lo ya contestado: volver a la pantalla tiene que enseñar lo
       que puso, no un formulario en blanco que invita a repetirlo. */
    setBorrador(f.answers || {});
    setAviso(null);
  };

  const entregar = async () => {
    if (faltan.length > 0) {
      setAviso(`Te falta ${faltan.length === 1 ? 'una respuesta' : `${faltan.length} respuestas`}.`);
      return { ok: false };
    }
    setAviso(null);

    const res = await marcarAccion(fila.id, borrador);
    if (!res?.ok) {
      setAviso(res?.error || 'No se ha podido enviar.');
      return res;
    }

    /*
      Y aquí LO DEL OFICIO aterriza.

      Se escribe después de la entrega y no antes: si la entrega falla, no puede
      quedarse una medición suelta en su antropometría de un formulario que él
      cree que no ha mandado.
    */
    const medidas = aterrizar(elementos, borrador, todayISO());
    if (medidas) {
      addAnthropometryLog(
        activeClient.id,
        buildAnthropometryLog({
          date: medidas.date,
          weight: medidas.weight,
          perimeters: medidas.perimeters,
          folds: medidas.folds,
        })
      );
    }

    /* Se vuelve a la lista con un respiro, para que el tic del botón se llegue a
       ver: entregar y que la pantalla cambie a la vez parece que se ha perdido. */
    setTimeout(() => setAbierto(null), 900);
    return res;
  };

  if (!enviosReady) return null;

  // ── Uno abierto ─────────────────────────────────────────────────────────
  if (fila) {
    return (
      <div className="hoja-libre">
        <header className="libre-cab">
          <button
            type="button"
            className="cab-volver"
            onClick={() => setAbierto(null)}
            aria-label="Volver a lo que te han pedido"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="libre-tit">{fila.title}</h1>
        </header>

        {/*
          El cuerpo del formulario, que es el MISMO que ensaya el entrenador
          antes de mandarlo (ver `CuerpoDeFormulario`). El recado se lee con
          `notaDe` porque desde la 0105 vive en su columna y lo mandado antes lo
          lleva dentro del esquema; las dos formas dicen lo que decían el día que
          se mandó.
        */}
        <CuerpoDeFormulario
          elementos={elementos}
          borrador={borrador}
          recado={recado}
          onChange={(id, v) => setBorrador((prev) => ({ ...prev, [id]: v }))}
        />

        {aviso && <Notice tone="warn">{aviso}</Notice>}

        <div className="libre-pie">
          <BotonAccion className="btn btn-primary" onClick={entregar} disabled={faltan.length > 0}>
            {fila.submitted_at ? 'Guardar los cambios' : 'Enviárselo'}
          </BotonAccion>
          {fila.submitted_at && <span className="libre-nota">Ya se lo mandaste. Puedes corregirlo.</span>}
        </div>
      </div>
    );
  }

  // ── La lista ────────────────────────────────────────────────────────────
  return (
    <div className="hoja-libre">
      <header className="libre-cab">
        <h1 className="libre-tit">Lo que te ha mandado</h1>
      </header>

      {pendientes.length === 0 && hechos.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No te ha mandado nada"
          message="Cuando tu entrenador te mande un cuestionario, un vídeo o te pida algo, aparecerá aquí."
        />
      ) : (
        <>
          {pendientes.length > 0 && (
            <ul className="libre-lista">
              {pendientes.map((f) => (
                <li key={f.id}>
                  <Renglon fila={f} onAbrir={abrir} onMarcar={marcar} />
                </li>
              ))}
            </ul>
          )}

          {hechos.length > 0 && (
            <>
              <p className="libre-rot">Ya está</p>
              <ul className="libre-lista">
                {hechos.map((f) => (
                  <li key={f.id}>
                    <Renglon fila={f} hecho onAbrir={abrir} onMarcar={marcar} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
};

/**
 * Un renglón de la lista, y cada tipo se comporta como lo que es.
 *
 * ══ Por qué no son todos un botón que abre una pantalla ════════════════════
 *
 * Porque solo el formulario TIENE pantalla. Un vídeo se abre donde está y con
 * eso ya está visto; algo que su entrenador le ha pedido —una analítica, una
 * foto por WhatsApp— se hace fuera de aquí y lo único que falta es decir que ya
 * está. Meterlos a los tres en una pantalla intermedia sería un clic de más para
 * llegar a un enlace y una pantalla en blanco para llegar a un botón.
 *
 * ── Y por eso la entrega se marca sola al abrirla ─────────────────────────
 * Un vídeo que hubiera que marcar aparte de verlo es un vídeo que se queda sin
 * marcar, y entonces su entrenador reclama algo que ya está hecho. Lo que sí
 * pide confirmación es lo que él tiene que hacer fuera: ahí un clic sin querer
 * SÍ dice algo falso, y encima le quita de en medio lo que tenía pendiente.
 */
const Renglon = ({ fila, hecho = false, onAbrir, onMarcar }) => {
  const confirm = useConfirm();
  const tipo = fila.tipo || 'form';
  const recado = notaDe(fila);

  if (tipo === 'documento' || tipo === 'video') {
    return (
      <a
        className={`libre-fila${hecho ? ' es-hecho' : ''}`}
        href={fila.link}
        target="_blank"
        rel="noreferrer noopener"
        onClick={() => !hecho && onMarcar(fila)}
      >
        <span className="libre-fila-nom">{fila.title}</span>
        <span className="libre-fila-dice">
          {recado || (hecho ? 'Ya lo abriste. Sigue aquí.' : 'Se abre en otra pestaña.')}
        </span>
      </a>
    );
  }

  if (tipo === 'pide') {
    return (
      <button
        type="button"
        className={`libre-fila${hecho ? ' es-hecho' : ''}`}
        disabled={hecho}
        onClick={async () => {
          const ok = await confirm({
            title: '¿Ya lo has hecho?',
            message: `Le vas a decir a tu entrenador que «${fila.title}» ya está.`,
            confirmLabel: 'Sí, ya está',
          });
          if (ok) onMarcar(fila);
        }}
      >
        <span className="libre-fila-nom">{fila.title}</span>
        <span className="libre-fila-dice">
          {hecho ? 'Le dijiste que ya está.' : recado || 'Cuando lo tengas, márcalo aquí.'}
        </span>
      </button>
    );
  }

  const cuantas = (fila.schema?.elementos || []).filter(
    (e) => e.tipo !== 'apartado' && e.tipo !== 'nota'
  ).length;

  return (
    <button
      type="button"
      className={`libre-fila${hecho ? ' es-hecho' : ''}`}
      onClick={() => onAbrir(fila)}
    >
      <span className="libre-fila-nom">{fila.title}</span>
      <span className="libre-fila-dice">
        {hecho ? 'Se lo mandaste. Puedes corregirlo.' : `${cuantas} cosas que contestar`}
      </span>
    </button>
  );
};
