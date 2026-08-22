import { useState } from 'react';
import { RotateCcw, Users } from 'lucide-react';

import { Autocomplete } from '@/components/ui/Autocomplete';
import { Panel } from '@/components/ui/primitives';

/* Hasta aquí, los chips caben en dos líneas y se ven todos de una vez; por
   encima, la fila pasa a carril que se desplaza y aparece además el buscador
   para no tener que recorrerlo. */
const MAX_CHIPS = 6;

/**
 * Quién tiene configuración propia, dicho con NOMBRES.
 *
 * «1 cliente no la tiene» es un número sin sujeto: informa de que hay trabajo
 * pendiente y esconde con quién, que es lo único accionable de la frase. A
 * partir de cuatro la lista deja de leerse de un vistazo y ahí sí gana el
 * número — los que no caben llevan su marca en el carril de arriba.
 */
const enumerar = (nombres) => {
  if (nombres.length === 1) return nombres[0];
  if (nombres.length === 2) return `${nombres[0]} y ${nombres[1]}`;
  if (nombres.length === 3) return `${nombres[0]}, ${nombres[1]} y ${nombres[2]}`;
  return `${nombres[0]}, ${nombres[1]} y ${nombres.length - 2} más`;
};

/**
 * A quién se le está escribiendo: la plantilla o un cliente concreto.
 *
 * ══ La cartera se VE, siempre ═══════════════════════════════════════════════
 *
 * El selector nació como una fila de chips, uno por cliente, y con cuarenta
 * nombres era media pantalla; se cambió por un buscador a partir de seis. Pero
 * el buscador no sustituía a la lista, la TAPABA: al pasar de seis clientes
 * desaparecían todos menos el elegido, y como el desplegable solo salía al
 * escribir, la única forma de llegar a alguien era acordarse de su nombre.
 * Quedaba una pantalla que hablaba de «tus clientes» sin enseñar ninguno.
 *
 * La respuesta no era elegir entre las dos cosas, porque no compiten: el carril
 * se ve entero (con muchos se desplaza en una línea en vez de amontonarse en
 * una pared, que era el problema real) y el buscador se queda como atajo para
 * carteras grandes, ahora ojeable sin escribir (`abreVacio`).
 *
 * La marca «propia» señala a quien NO tiene puesta la plantilla — la misma
 * cuenta que enciende «Aplicar a todos» (`clientDrifts`, lib/protocolTemplate).
 */
export const TargetPicker = ({
  clients,
  target,
  onTarget,
  client,
  esIgual,
  onIgualar,
  driftedSet,
  applying,
  onApplyAll,
}) => {
  const [busqueda, setBusqueda] = useState('');
  const conChips = clients.length <= MAX_CHIPS;
  const propios = clients.filter((c) => driftedSet.has(c.id));

  return (
    <Panel tight className="col gap-3">
      <div className="row between wrap gap-2">
        <span className="section-label">Estás configurando</span>

        {/* El atajo, solo con cartera grande: con seis nombres delante, un
            buscador encima de ellos es un mando de más. */}
        {!conChips && (
          <div style={{ flex: '1 1 190px', maxWidth: 260 }}>
            <Autocomplete
              value={busqueda}
              onChange={setBusqueda}
              items={clients}
              getLabel={(c) => c.name}
              getMeta={(c) => (driftedSet.has(c.id) ? 'propia' : null)}
              onPick={(c) => {
                onTarget(c.id);
                setBusqueda('');
              }}
              placeholder="Buscar cliente…"
              abreVacio
              maxSuggestions={8}
              inputProps={{ 'aria-label': 'Buscar cliente para configurarlo' }}
            />
          </div>
        )}
      </div>

      {/* `rail-wrap` con pocos —hay que verlos todos para elegir— y `rail` con
          muchos, que es la regla de los dos carriles del sistema. */}
      <div className={conChips ? 'rail-wrap' : 'rail'} role="group" aria-label="A quién se aplica">
        <button
          type="button"
          className="chip"
          aria-pressed={target === null}
          onClick={() => onTarget(null)}
        >
          Mi plantilla
        </button>

        {clients.map((c) => (
          <button
            key={c.id}
            type="button"
            className="chip"
            aria-pressed={target === c.id}
            onClick={() => onTarget(c.id)}
          >
            {c.name}
            {driftedSet.has(c.id) && <span className="chip-note">propia</span>}
          </button>
        ))}
      </div>

      <div className="row between wrap gap-2">
        {client ? (
          <>
            <span className="t-xs t-tertiary grow">
              Una excepción para {client.name}: no cambia tu plantilla ni al resto.{' '}
              {esIgual
                ? 'Ahora mismo es igual que tu plantilla.'
                : 'Ahora mismo tiene una configuración propia.'}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onIgualar}
              disabled={esIgual}
            >
              <RotateCcw size={14} /> Igualar a mi plantilla
            </button>
          </>
        ) : (
          <>
            <span className="t-xs t-tertiary grow">
              Tu forma de trabajar. Se usa para los clientes nuevos.{' '}
              {clients.length === 0
                ? 'Todavía no tienes clientes a los que aplicarla.'
                : propios.length === 0
                  ? 'Todos tus clientes la tienen puesta.'
                  : `${enumerar(propios.map((c) => c.name))} ${propios.length === 1 ? 'tiene' : 'tienen'} configuración propia.`}
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onApplyAll}
              disabled={propios.length === 0 || applying}
            >
              <Users size={14} /> {applying ? 'Aplicando…' : 'Aplicar a todos'}
            </button>
          </>
        )}
      </div>
    </Panel>
  );
};
