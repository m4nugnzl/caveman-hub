import { HeartPulse } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useData } from '@/context/AppContext';
import { conditionsFor, conditionsHeadline } from '@/domain/conditions';
import { Fold } from '@/components/ui/primitives';

/**
 * Lo que condiciona ESTA sección, dicho donde se decide.
 *
 * ══ Por qué esto no vive solo en la ficha ═══════════════════════════════════
 *
 * Porque un condicionante que hay que ir a buscar llega tarde. La aplicación ya
 * podía guardar la anamnesis —el paso «Anamnesis» del alta, con su PDF— y el
 * problema nunca fue guardarla: es que al programar el jueves nadie te recuerda
 * la hernia, y al montar el menú nadie te recuerda la intolerancia.
 *
 * Un dato que solo se ve cuando lo buscas no cambia ninguna decisión, porque las
 * decisiones se toman sin buscarlo.
 *
 * ══ Por qué filtrado por área y no la lista entera ═════════════════════════
 *
 * Programando da igual que sea celíaco. Enseñárselo igualmente sería enseñar
 * cinco cosas para que se lean dos, y a la tercera vez ya no se lee ninguna: es
 * el mismo motivo por el que los umbrales de la cartera son laxos —una lista que
 * avisa siempre no avisa de nada—.
 *
 * ══ Por qué NO es un `Notice` de aviso ═════════════════════════════════════
 *
 * Un condicionante no es una alerta: no ha pasado nada, no hay nada que
 * despachar y va a seguir ahí los seis meses que dure la asesoría. Pintarlo en
 * rojo sobre cada pantalla convertiría el rojo en decoración justo donde hace
 * falta que signifique algo — un cobro vencido, un guardado que falló.
 *
 * Es contexto, y por eso es un `Fold`: la misma pieza con la que esta aplicación
 * dice «esto está plegado, ábrelo» en el calentamiento y en la estructura del
 * programa. El titular lleva el recuento, así que cerrado ya informa.
 *
 * @param area  `training` en la rutina, `nutrition` en la dieta. Los apuntados
 *   como «las dos cosas» entran en las dos (ver `domain/conditions.js`).
 */
export const ConditionsNote = ({ area }) => {
  const { conditions, activeClient } = useData();
  const suyos = conditionsFor(conditions, area);

  /* Sin nada que decir no se dice nada, ni siquiera «no hay condicionantes». Un
     hueco permanente con un estado vacío en la cabecera de la pantalla donde más
     se trabaja es cromo que se lee una vez y estorba mil. */
  if (suyos.length === 0) return null;

  const hayVeto = suyos.some((c) => c.severity === 'block');

  return (
    <Fold
      icon={HeartPulse}
      title="Lo que le condiciona"
      summary={conditionsHeadline(suyos)}
      /* Abierto de partida SOLO si hay algo que no se le puede poner. Lo que hay
         que tener en cuenta se consulta; lo que está vetado tiene que verse sin
         que nadie lo pida — es la diferencia entre un recordatorio y un límite. */
      defaultOpen={hayVeto}
    >
      <div className="col gap-2">
        {suyos.map((c) => (
          <div key={c.id} className="row gap-2 t-sm" style={{ alignItems: 'baseline' }}>
            {/* La chapa dice la GRAVEDAD y no el área: en esta pantalla el área
                ya la sabes, porque es la pantalla en la que estás. */}
            <span className={`badge${c.severity === 'block' ? ' badge-warn' : ''}`}>
              {c.severity === 'block' ? 'No puede' : 'Ojo'}
            </span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{c.label}</span>
              {c.detail && <span className="t-secondary"> · {c.detail}</span>}
            </span>
          </div>
        ))}
      </div>

      {/* Dicho en voz alta para que nadie dé por hecho lo contrario: la
          aplicación NO comprueba que el programa respete un veto. Enseñar el
          límite y dejar creer que además lo vigila sería peor que no enseñarlo. */}
      <p className="t-xs t-tertiary">
        Se apuntan y se resuelven en su{' '}
        <Link to={`/c/${activeClient?.id}/ficha`}>ficha</Link>.
        {hayVeto && ' Lo marcado como «no puede» no lo comprueba la aplicación: al programar sigues decidiendo tú.'}
      </p>
    </Fold>
  );
};
