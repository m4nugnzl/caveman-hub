import { SERVICES, activeServices, isServiceOn, toggleService } from '@/domain/protocol';
import { OptionCard, Panel } from '@/components/ui/primitives';

/**
 * Qué le llevas: entrenamiento, nutrición o las dos.
 *
 * Va delante de todo lo demás, incluso del alta, porque es la decisión de la
 * que cuelgan las otras: no tiene sentido elegir qué se pregunta al terminar de
 * entrenar si a esta persona no le llevas el entrenamiento.
 *
 * Sin cabecera propia: la pone el `GroupHead` del apartado, que es quien dice
 * también a quién afecta. Aquí dentro solo van los dos mandos.
 */
export const ServicesSection = ({ protocol, onSave }) => (
  <Panel>
    <ul className="proto-modules">
      {SERVICES.map((servicio) => {
        const puesto = isServiceOn(protocol, servicio.id);
        /*
          El último encendido no se puede apagar: sin ninguno de los dos no
          queda aplicación que enseñar. `toggleService` ya lo impide, pero un
          control que se puede pulsar y no hace nada se lee como un fallo —así
          que aquí se desactiva y se DICE por qué.
        */
        const ultimo = puesto && activeServices(protocol).length === 1;
        return (
          <li key={servicio.id}>
            <OptionCard
              label={servicio.label}
              hint={
                ultimo
                  ? 'Tiene que quedar al menos uno: sin entrenamiento y sin nutrición no queda nada que enseñarle.'
                  : servicio.hint
              }
              checked={puesto}
              disabled={ultimo}
              onChange={() => onSave(toggleService(protocol, servicio.id))}
            />
          </li>
        );
      })}
    </ul>
  </Panel>
);
