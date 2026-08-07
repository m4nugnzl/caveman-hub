import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

const ConfirmContext = createContext(null);

/**
 * Confirmación para acciones destructivas, como promesa.
 *
 *     const confirm = useConfirm();
 *     if (await confirm({ title: 'Eliminar día', tone: 'danger' })) removeDay(...);
 *
 * Antes no había ninguna: `removeDay`, `removeExercise` y `removeMeal` borraban
 * y persistían al instante, sin confirmar y sin deshacer. Y el botón que
 * destruía el programa completo tampoco preguntaba nada.
 */
export const ConfirmProvider = ({ children }) => {
  const [request, setRequest] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((options) => {
    setRequest({
      title: 'Confirmar acción',
      message: '',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
      tone: 'default',
      ...options,
    });
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {request && (
        <Modal
          title={request.title}
          onClose={() => settle(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => settle(false)}>
                {request.cancelLabel}
              </button>
              <button
                type="button"
                className={`btn ${request.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => settle(true)}
              >
                {request.confirmLabel}
              </button>
            </>
          }
        >
          <div className="row-top">
            {request.tone === 'danger' && (
              <span style={{ color: 'var(--accent-rose)', flexShrink: 0, marginTop: 2 }}>
                <AlertTriangle size={20} />
              </span>
            )}
            <div className="col gap-2">
              {request.message && <p className="text-sm text-muted">{request.message}</p>}
              {request.detail && <p className="text-xs text-dim">{request.detail}</p>}
            </div>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>.');
  return ctx.confirm;
};
