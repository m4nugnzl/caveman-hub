import { HIDDEN_INFO, hidesFromClient, isServiceOn, toggleHidden } from '@/domain/protocol';
import { OptionCard, Panel } from '@/components/ui/primitives';

/**
 * QUÉ NO LE VUELVE A ESTA PERSONA: su peso, sus calorías.
 *
 * ══ Por qué solo aparece con un cliente elegido ═════════════════════════════
 *
 * Porque es de la persona y no de tu forma de trabajar. Un entrenador no oculta
 * el peso «a sus clientes»: se lo oculta a quien se pesa cuatro veces al día y
 * decide cómo va a estar la tarde según lo que ponga. En la plantilla no habría
 * nada que decidir, y empujarlo desde ella sería devolverle las cifras a quien
 * se las acabas de quitar — por eso está en `NOT_COMPARED_KEYS`.
 *
 * ── Y por qué cada interruptor se calla si no viene a cuento ────────────────
 * A quien no le llevas la nutrición, ocultarle las kcal no significa nada: no
 * tiene dieta que mirar. Es la misma regla que el resto del protocolo — lo que
 * no existe para esta persona no se configura para esta persona.
 */
export const VisibilitySection = ({ client, protocol, onSave }) => {
  if (!client) return null;

  const nombre = client.name?.split(' ')[0] || 'este cliente';
  /* El área de cada interruptor contra los servicios que le llevas: el peso
     cuelga del seguimiento —que existe siempre— y las kcal, de la nutrición. */
  const suyos = HIDDEN_INFO.filter(
    (info) => info.area !== 'nutrition' || isServiceOn(protocol, 'nutrition')
  );

  return (
    <Panel
      title={`Qué no ve ${nombre}`}
      sub={`Lo sigues midiendo y lo sigues viendo tú; ${nombre} deja de tener la cifra delante. Para quien tiene mala relación con la báscula o con la comida, ese número es el problema.`}
    >
      <ul className="proto-modules">
        {suyos.map((info) => (
          <li key={info.id}>
            <OptionCard
              label={info.label}
              hint={info.hint}
              checked={hidesFromClient(protocol, info.id)}
              onChange={() => onSave(toggleHidden(protocol, info.id))}
            />
          </li>
        ))}
      </ul>
    </Panel>
  );
};
