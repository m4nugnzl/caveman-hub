import { useState } from 'react';

import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { Modal } from '@/components/ui/Modal';

/**
 * «Vista: Definición ▾»: las vistas guardadas del entrenador (24 sep 2026).
 *
 * Una vista es qué filas se ven y en qué orden. Viven en SU cuenta
 * (`profiles.preferences.temporada.vistas`) y sirven para todos sus
 * clientes. Cambiar de fase no cambia de vista: solo la cambia él.
 *
 * @param nombre  el de la vista guardada que se ve, o `null`: entonces dice
 *   solo «Vista», y el menú ofrece guardarla.
 * @param vistas  `[{ id, nombre, capas }]`.
 * @param actual  el id de la vista guardada que se ve, o `null`.
 * @param onElegir recibe la vista elegida, o `null` para la de por defecto.
 * @param onGuardar recibe el nombre con el que guardar lo que se ve.
 * @param onBorrar recibe el id de la vista que se borra.
 */
export const SelectorDeVista = ({ nombre, vistas, actual, porDefecto, onElegir, onGuardar, onBorrar }) => {
  const [guardando, setGuardando] = useState(false);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState(null);
  const elegida = vistas.find((v) => v.id === actual) || null;

  const guardar = async (e) => {
    e.preventDefault();
    const limpio = texto.trim();
    if (!limpio) return;
    const r = await onGuardar(limpio);
    if (r?.ok === false) {
      setError(r.error || 'No se ha podido guardar la vista.');
      return;
    }
    setGuardando(false);
  };

  return (
    <>
      <MenuAcciones
        label={nombre ? `Vista: ${nombre}` : 'Vista'}
        clase="btn btn-sm tl-vista"
        alineado="izquierda"
        ariaLabel={nombre ? `Vista de la gráfica: ${nombre}` : 'Vista de la gráfica'}
        items={[
          { label: 'Por defecto', on: porDefecto, run: () => onElegir(null) },
          ...vistas.map((v) => ({ label: v.nombre, on: v.id === actual, run: () => onElegir(v) })),
          null,
          {
            label: 'Guardar vista actual…',
            run: () => {
              setTexto(elegida?.nombre || '');
              setError(null);
              setGuardando(true);
            },
          },
          elegida && { label: `Borrar «${elegida.nombre}»`, danger: true, run: () => onBorrar(elegida.id) },
        ]}
      />
      {guardando && (
        <Modal
          open
          title="Guardar vista"
          onClose={() => setGuardando(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setGuardando(false)}>
                Cancelar
              </button>
              <button type="submit" form="tl-guardar-vista" className="btn btn-primary" disabled={!texto.trim()}>
                Guardar vista
              </button>
            </>
          }
        >
          <form id="tl-guardar-vista" onSubmit={guardar}>
            <label className="field">
              <span className="field-label">Nombre</span>
              <input
                className="input"
                value={texto}
                maxLength={40}
                placeholder="Definición"
                autoFocus
                onChange={(e) => {
                  setTexto(e.target.value);
                  setError(null);
                }}
              />
            </label>
            <p className="tl-vista-nota">
              {vistas.some((v) => v.nombre.toLowerCase() === texto.trim().toLowerCase())
                ? 'Ya tienes una vista con ese nombre: se cambia por lo que ves ahora.'
                : 'Guarda qué filas se ven y en qué orden. Te sirve para todos tus clientes.'}
            </p>
            {error && (
              <p className="tl-vista-nota is-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </Modal>
      )}
    </>
  );
};
