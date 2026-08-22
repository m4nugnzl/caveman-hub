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
 */
export const ToastProvider = ({ children }) => {
  const [toast, setToast] = useState(null);
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
    ({ text, action = null, duration = 6000 }) => {
      setToast({ text, action, duration });
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
    if (!toast || timerRef.current) return;
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
          <span className="toast-text">{visto.text}</span>
          {visto.action && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                dismiss();
                await visto.action.onClick();
              }}
            >
              {visto.action.label}
            </button>
          )}
          <button type="button" className="toast-x" aria-label="Cerrar el aviso" onClick={dismiss}>
            <X size={14} />
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
