import { SERVICES, activeServices, isServiceOn, toggleService } from '@/domain/protocol';
import { Panel, Switch } from '@/components/ui/primitives';

/**
 * Qué le llevas: entrenamiento, nutrición o las dos.
 *
 * Va delante de todo lo demás, incluso del alta, porque es la decisión de la
 * que cuelgan las otras: no tiene sentido elegir qué se pregunta al terminar de
 * entrenar si a esta persona no le llevas el entrenamiento.
 *
 * ── Interruptores y no tarjetas ────────────────────────────────────────────
 * Eran `OptionCard`, y la diferencia entre los dos controles no es estética:
 * una tarjeta dice «esto entra en la operación que estás a punto de lanzar» y
 * un interruptor dice «esto queda así a partir de ahora» (ver `primitives`).
 * Esto es lo segundo, así que era el control equivocado — y se notaba: con todo
 * encendido, la pantalla del protocolo abría con ocho rectángulos de acento a
 * lo ancho de la hoja, o sea el color de lo que invita a pulsar puesto sobre lo
 * que ya está decidido y nadie va a tocar.
 */
export const ServicesSection = ({ protocol, onSave, title, sub, desnudo = false }) => (
  <Panel title={title} sub={sub} desnudo={desnudo}>
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
            <Switch
              label={servicio.label}
              hint={ultimo ? 'Tiene que quedar uno de los dos.' : servicio.hint}
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
