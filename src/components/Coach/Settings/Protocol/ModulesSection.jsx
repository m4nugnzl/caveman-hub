import { MODULES, isModuleOn, isServiceOn, toggleModule } from '@/domain/protocol';
import { Panel, Switch } from '@/components/ui/primitives';

/**
 * Los módulos: lo que esté apagado no existe, ni al programar ni al entrenar.
 *
 * ── Solo las piezas de lo que le llevas ────────────────────────────────────
 * Un módulo cuelga de una sección (`area`), y a quien no le llevas nutrición no
 * se le puede encender «Equivalencias en la dieta»: es una pieza de una parte
 * del producto que esa persona no tiene. Se enseñaba igual, y encenderla no
 * hacía nada en ningún sitio. Lo guardado no se toca —vuelve a aparecer tal
 * cual si se recupera el servicio—, solo deja de ofrecerse.
 *
 * ── Y aquí hubo un modo PLEGADO, que ya no hace falta ──────────────────────
 * Existía para caber en el carril de la pantalla de protocolos, donde estos
 * interruptores eran el contexto y no el trabajo. Ese carril ya no los lleva:
 * lo que un protocolo incluye se abre en su propia capa desde la cabecera, y el
 * banco se queda solo con lo que es —las acciones y su premisa—. Un resumen
 * plegado dentro de una capa que se abre a propósito sería un pliegue de más.
 *
 * (De paso se fue su peor renglón: el resumen NOMBRABA lo apagado —«Apagado:
 * Calentamiento y movilidad, RIR objetivo por serie…»—, así que para saber qué
 * llevaba el protocolo había que restar.)
 */
/**
 * ── Y SIN SUBTÍTULO DE DEFINICIÓN ──────────────────────────────────────────
 * Debajo del rótulo iba «Enciende solo lo que vayas a usar. Se puede cambiar
 * después.», y en el alta una segunda variante más larga. Las dos decían lo
 * que hace un interruptor, que es lo que ya sabe cualquiera que vea uno. Un
 * rótulo que necesita una frase para explicarse sobra él o sobra la frase.
 *
 * Lo mismo vale para las líneas de cada módulo: son una frase corta que dice
 * QUÉ ES la pieza, no un párrafo que explique cómo funciona por dentro ni a
 * quién le llega. Máximo un renglón, sin «tu cliente ve», sin «puedes».
 *
 * @param desnudo Sin la caja. Dentro de una ventana el envoltorio sobra: la
 *   ventana YA es la tarjeta, y dos tarjetas apiladas dentro de ella se leen
 *   como dos pantallas metidas en una. Lo mismo que ya hacía `ServicesSection`.
 */
export const ModulesSection = ({ protocol, onSave, sub = null, desnudo = false }) => (
  <Panel title="Las piezas" sub={sub} desnudo={desnudo}>
    <ul className="proto-modules">
      {MODULES.filter((mod) => isServiceOn(protocol, mod.area)).map((mod) => (
        <li key={mod.id}>
          <Switch
            label={mod.label}
            hint={mod.hint}
            checked={isModuleOn(protocol, mod.id)}
            onChange={() => onSave(toggleModule(protocol, mod.id))}
          />
        </li>
      ))}
    </ul>
  </Panel>
);
