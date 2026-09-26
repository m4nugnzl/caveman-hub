import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { diaCorto, pendientes, primerDiaProgramable, problemaDelDia } from '@/domain/dietaProgramada';
import { hoyLocal } from '@/domain/planDeSesiones';
import { Modal } from '@/components/ui/Modal';
import { BotonAccion, Notice, useAccionDeBoton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/ToastProvider';

/**
 * «CAMBIO DE DIETA» (letra e, 0146): el día en que empieza una dieta nueva y
 * por qué. La dieta en sí se prepara después con el editor de siempre, sobre
 * una copia de la de ahora: «Prepararla en Dieta» crea la copia y abre el
 * editor en ella (`?programada=<id>`).
 *
 * Con `programada`, la misma ventana cambia su día o su motivo, o la quita
 * (`onQuitada`: el editor abierto en esa copia vuelve a la dieta de ahora).
 *
 * Se abre desde la Temporada (el inspector de la semana o del día, y la
 * tarjeta de la marca) y desde el aviso del editor. Lo mismo en el teléfono:
 * el `Modal` es hoja desde abajo.
 *
 * @param desde el día sugerido (el elegido en la temporada); si ya pasó, mañana.
 */
export const VentanaDeCambioDeDieta = ({ programada = null, desde = null, onCerrar, onQuitada = null, abrirAlCrear = true }) => {
  const { activeClient, programadas, programarDieta, cambiarProgramada, quitarProgramada } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const hoy = hoyLocal();
  const manana = primerDiaProgramable(hoy);
  const [empieza, setEmpieza] = useState(() => programada?.empieza || (desde && desde > hoy ? desde : manana));
  const [motivo, setMotivo] = useState(programada?.motivo || '');
  const [error, setError] = useState('');
  const envio = useAccionDeBoton();
  const ocupados = pendientes(programadas)
    .filter((p) => p.id !== programada?.id)
    .map((p) => p.empieza);
  const problema = problemaDelDia(empieza, { hoy, ocupados });

  const guardar = async () => {
    if (problema) {
      setError(problema);
      return false;
    }
    const r = programada
      ? await cambiarProgramada(programada.id, { empieza, motivo })
      : await programarDieta(activeClient.id, { empieza, motivo });
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    onCerrar();
    if (!programada && abrirAlCrear) navigate(`/c/${activeClient.id}/nutricion?programada=${r.programada.id}`);
    return true;
  };

  const quitar = async () => {
    const r = await quitarProgramada(programada.id);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onCerrar();
    onQuitada?.();
    toast({ text: `Cambio de dieta del ${diaCorto(programada.empieza)} quitado.` });
  };

  return (
    <Modal
      open
      title={programada ? `Cambio de dieta del ${diaCorto(programada.empieza)}` : 'Cambio de dieta'}
      sub="Una dieta nueva que empieza otro día. El cliente no la ve hasta entonces."
      onClose={onCerrar}
      footer={
        <div className="var-pie">
          {programada && (
            <button type="button" className="btn btn-danger" onClick={quitar}>
              Quitar
            </button>
          )}
          <span className="grow" />
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>
            Cancelar
          </button>
          <BotonAccion type="submit" form="ventana-cambio-de-dieta" className="btn btn-primary" estado={envio.estado}>
            {programada ? 'Guardar cambios' : 'Prepararla en Dieta'}
          </BotonAccion>
        </div>
      }
    >
      <form
        id="ventana-cambio-de-dieta"
        className="var-form"
        onSubmit={(e) => {
          e.preventDefault();
          envio.lanzar(guardar);
        }}
      >
        <div className="var-fechas">
          <label className="var-fecha">
            <span className="var-cifra-k">Empieza</span>
            <input
              type="date"
              className="input"
              min={manana}
              value={empieza}
              onChange={(e) => {
                setEmpieza(e.target.value);
                setError('');
              }}
            />
          </label>
        </div>
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
        {!programada && (
          <p className="var-nada">
            Se prepara sobre una copia de la dieta de ahora, con el editor de siempre. Ese día sustituye a la que
            tenga.
          </p>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Modal>
  );
};
