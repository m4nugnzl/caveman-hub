import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { diaCorto, estadoDeLaProgramada } from '@/domain/dietaProgramada';
import { Notice } from '@/components/ui/primitives';
import { VentanaDeCambioDeDieta } from './VentanaDeCambioDeDieta';

/**
 * LO QUE EL EDITOR DICE DE LA DIETA PROGRAMADA (letra e, 0146), arriba del todo.
 *
 *   · Editando la copia: «Cambio programado para el 1 oct · el cliente no lo
 *     ve», su motivo, «Día y motivo» y la vuelta a la dieta de ahora.
 *   · Editando la de ahora con una pendiente: «Hay un cambio programado para
 *     el 1 oct que sustituirá esta dieta», con el enlace para abrirla. Lo que
 *     se toque aquí dura hasta ese día.
 *   · Una copia que ya no está pendiente: cómo quedó, y la vuelta.
 *   · Sin pendiente, una que no se aplicó hace poco: por qué, y verla.
 *
 * No es un modo escondido: la dirección lo lleva (`?programada=`), y volver es
 * quitarlo.
 */
export const AvisoDeProgramada = ({ enCopia, programada, proxima, noAplicada = null }) => {
  const [, setParams] = useSearchParams();
  const [ventana, setVentana] = useState(false);
  const irA = (id) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (id) n.set('programada', id);
      else n.delete('programada');
      return n;
    });
  const volver = (
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => irA(null)}>
      Ver la dieta actual
    </button>
  );

  if (enCopia && !programada) {
    return (
      <Notice tone="info" icon={CalendarClock} action={volver}>
        Este cambio de dieta ya no existe: se quitó, o todavía se está leyendo.
      </Notice>
    );
  }

  if (enCopia && programada.estado !== 'pendiente') {
    return (
      <Notice tone="info" icon={CalendarClock} action={volver}>
        {estadoDeLaProgramada(programada)}. Lo que ves es cómo quedó preparada; ya no se edita.
      </Notice>
    );
  }

  if (enCopia) {
    return (
      <>
        <Notice
          tone="info"
          icon={CalendarClock}
          action={
            <span className="row gap-2 shrink-0">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVentana(true)}>
                Día y motivo
              </button>
              {volver}
            </span>
          }
        >
          <strong>{estadoDeLaProgramada(programada)}</strong>
          {programada.motivo && <span style={{ color: 'var(--text-secondary)' }}> · {programada.motivo}</span>}
        </Notice>
        {ventana && <VentanaDeCambioDeDieta programada={programada} onCerrar={() => setVentana(false)} onQuitada={() => irA(null)} />}
      </>
    );
  }

  if (!proxima && noAplicada) {
    return (
      <Notice
        tone="info"
        icon={CalendarClock}
        action={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => irA(noAplicada.id)}>
            Verlo
          </button>
        }
      >
        El cambio programado para el {diaCorto(noAplicada.empieza)}: {estadoDeLaProgramada(noAplicada).charAt(0).toLowerCase()}
        {estadoDeLaProgramada(noAplicada).slice(1)}
      </Notice>
    );
  }

  if (!proxima) return null;
  return (
    <Notice
      tone="info"
      icon={CalendarClock}
      action={
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => irA(proxima.id)}>
          Abrirlo
        </button>
      }
    >
      Hay un cambio programado para el {diaCorto(proxima.empieza)} que sustituirá esta dieta.
    </Notice>
  );
};
