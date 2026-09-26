import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { useDismissable } from '@/lib/useDismissable';

const ToastContext = createContext(null);

/**
 * Avisos efímeros con «Deshacer», como promesa de una línea:
 *
 *     const toast = useToast();
 *     toast({ text: 'Semana de Marta cerrada.', action: { label: 'Deshacer', onClick: ... } });
 *
 * ══ Por qué existe ══════════════════════════════════════════════════════════
 *
 * El producto tiene acciones que se hacen veinte veces cada lunes —«Seguimos
 * igual», «Cobrado»— y por eso van SIN confirmación: un diálogo delante del
 * gesto más repetido de la semana sería fricción pura. Pero sin confirmación,
 * un toque en la fila equivocada cerraba la semana de otra persona sin vuelta
 * atrás y sin más señal que un botón que decía «Guardando…» un instante.
 *
 * La pareja honesta de «sin confirmación» es «con deshacer»: el aviso confirma
 * lo que acaba de pasar y ofrece el camino de vuelta durante unos segundos.
 * `ConfirmProvider` queda para lo DESTRUCTIVO sin inverso (borrar un programa);
 * esto es para lo frecuente CON inverso.
 *
 * ── Decisiones ──────────────────────────────────────────────────────────────
 * · `role="status"`: el lector de pantalla lo anuncia sin robar el foco.
 * · El reloj se PARA mientras el puntero está encima: un deshacer que caduca
 *   debajo del ratón es una trampa.
 * · Uno visible a la vez, el último gana: dos avisos apilados con dos
 *   «Deshacer» distintos es un examen; quien encadena dos gestos ya vio el
 *   resultado del primero en pantalla.
 * · Pulsar la acción cierra el aviso; si el inverso falla, el error lo enseña
 *   la pantalla que lo lanzó (la acción devuelve su resultado).
 *
 * ── Varias acciones, y una que pide una línea (26 sep 2026) ─────────────────
 * `actions: [...]` en vez de `action`, cuando el gesto tiene dos caminos
 * («Deshacer · Añadir motivo» tras arrastrar una fase). Una acción con
 * `pide: { etiqueta, placeholder, onGuardar(texto) }` no cierra el aviso: lo
 * convierte en un campo de una línea, con el reloj parado mientras se escribe.
 * `onGuardar` devuelve `{ ok, error }`; si falla, el error sale en el aviso y
 * lo escrito se queda. Sin ventana extra: el aviso es el formulario.
 */
export const ToastProvider = ({ children }) => {
  const [toast, setToast] = useState(null);
  /* La acción que pide una línea, mientras se escribe: `{ accion, valor, error, guardando }`. */
  const [campo, setCampo] = useState(null);
  const timerRef = useRef(null);
  const restanteRef = useRef(0);
  const desdeRef = useRef(0);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clear();
    setToast(null);
    setCampo(null);
  }, [clear]);

  const arm = useCallback(
    (ms) => {
      clear();
      desdeRef.current = Date.now();
      restanteRef.current = ms;
      timerRef.current = setTimeout(dismiss, ms);
    },
    [clear, dismiss]
  );

  const show = useCallback(
    ({ text, action = null, actions = null, duration = 6000 }) => {
      setToast({ text, actions: actions || (action ? [action] : []), duration });
      setCampo(null);
      arm(duration);
    },
    [arm]
  );

  /* Sin fugas: el temporizador muere con el proveedor. */
  useEffect(() => clear, [clear]);

  const pause = () => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    restanteRef.current -= Date.now() - desdeRef.current;
  };
  const resume = () => {
    if (!toast || timerRef.current || campo) return;
    arm(Math.max(1200, restanteRef.current));
  };

  const value = useMemo(() => ({ toast: show }), [show]);

  /* La salida animada. El contenido se retiene en un ref mientras se va: al
     descartar, `toast` ya es null y sin la copia el aviso se vaciaría a mitad
     de salida. «El último gana» sigue igual: un aviso nuevo en plena salida
     reabre con su texto (el ref se pisa en este mismo render). */
  const salida = useDismissable(Boolean(toast));
  const ultimoRef = useRef(null);
  if (toast) ultimoRef.current = toast;
  const visto = toast || ultimoRef.current;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {salida.mounted && visto && (
        <div
          ref={salida.ref}
          className="toast"
          data-state={salida.closing ? 'closing' : 'open'}
          role="status"
          onMouseEnter={pause}
          onMouseLeave={resume}
          onFocus={pause}
          onBlur={resume}
        >
          {campo ? (
            <form
              className="toast-campo"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!campo.valor.trim() || campo.guardando) return;
                setCampo((c) => ({ ...c, guardando: true, error: '' }));
                const r = (await campo.accion.pide.onGuardar(campo.valor.trim())) || { ok: true };
                if (r.ok) dismiss();
                else setCampo((c) => (c ? { ...c, guardando: false, error: r.error || 'No se ha podido guardar.' } : c));
              }}
            >
              <span className="toast-text">{campo.accion.pide.etiqueta}</span>
              <input
                className="input input-sm"
                autoFocus
                maxLength={280}
                aria-label={campo.accion.pide.etiqueta}
                placeholder={campo.accion.pide.placeholder}
                value={campo.valor}
                onChange={(e) => setCampo((c) => ({ ...c, valor: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    dismiss();
                  }
                }}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={!campo.valor.trim() || campo.guardando}>
                Guardar
              </button>
              {campo.error && <span className="toast-error">{campo.error}</span>}
            </form>
          ) : (
            <>
              <span className="toast-text">{visto.text}</span>
              {(visto.actions || []).map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    if (a.pide) {
                      clear();
                      setCampo({ accion: a, valor: '', error: '', guardando: false });
                      return;
                    }
                    dismiss();
                    await a.onClick();
                  }}
                >
                  {a.label}
                </button>
              ))}
            </>
          )}
          <button type="button" className="toast-x" aria-label="Cerrar el aviso" onClick={dismiss}>
            <X size={15} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>.');
  return ctx.toast;
};
