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
 * Lo que dice el pie cuando se está mirando la plantilla.
 *
 * ══ Por qué son dos frases y no un recuento ═════════════════════════════════
 *
 * Porque hay dos grupos que no significan lo mismo y el botón trata a cada uno
 * de una forma: a los pendientes los escribe y a las excepciones las deja. Un
 * «3 clientes no la tienen» que en realidad va a tocar a uno es la clase de
 * mensaje que hace que nadie pulse el botón dos veces.
 */
const pieDePlantilla = (clients, pendientes, excepciones) => {
  if (clients.length === 0) return 'Todavía no tienes clientes a los que aplicarla.';

  const nombresExc = excepciones.map((c) => c.name);
  const respetadas =
    excepciones.length === 0
      ? ''
      : ` ${enumerar(nombresExc)} ${excepciones.length === 1 ? 'tiene una excepción y no se toca' : 'tienen una excepción y no se tocan'}.`;

  if (pendientes.length === 0) {
    return excepciones.length === 0
      ? 'Todos tus clientes la tienen puesta.'
      : `El resto la tiene puesta.${respetadas}`;
  }

  const nombresPend = pendientes.map((c) => c.name);
  return `${enumerar(nombresPend)} ${pendientes.length === 1 ? 'se ha' : 'se han'} quedado atrás.${respetadas}`;
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
 * ══ Las dos marcas ══════════════════════════════════════════════════════════
 *
 * Antes había una, «propia», para todo el que no coincidía con la plantilla.
 * Ahora son dos porque el botón hace cosas distintas con cada grupo:
 *
 *   · `excepción` — se lo montaste tú aposta y el botón NO le toca.
 *   · `atrasado` — se quedó con una plantilla vieja y el botón se lo arregla.
 *
 * Sin la distinción, la marca decía «este es distinto» y el entrenador no tenía
 * forma de saber cuál de sus clientes iba a perder el trabajo hecho a mano al
 * pulsar. Ver `isException` en lib/protocolTemplate.
 */
export const TargetPicker = ({
  clients,
  target,
  onTarget,
  client,
  esIgual,
  esExcepcion,
  onIgualar,
  pendientesSet,
  excepcionesSet,
  pendientes,
  excepciones,
  applying,
  onApplyAll,
}) => {
  const [busqueda, setBusqueda] = useState('');
  const conChips = clients.length <= MAX_CHIPS;

  const marca = (id) =>
    excepcionesSet.has(id) ? 'excepción' : pendientesSet.has(id) ? 'atrasado' : null;

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
              getMeta={(c) => marca(c.id)}
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
            {marca(c.id) && <span className="chip-note">{marca(c.id)}</span>}
          </button>
        ))}
      </div>

      <div className="row between wrap gap-2">
        {client ? (
          <>
            <span className="t-xs t-tertiary grow">
              Lo que cambies aquí es solo para {client.name}: no toca tu plantilla ni al resto.{' '}
              {esExcepcion
                ? `Es una excepción, así que poner al día a los demás no ${
                    esIgual ? 'le devolverá nada' : 'le quitará lo suyo'
                  }.`
                : esIgual
                  ? 'Ahora mismo tiene tu plantilla, y en cuanto toques algo pasará a ser una excepción.'
                  : 'Se ha quedado atrás: recibirá tu plantilla la próxima vez que pongas al día.'}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onIgualar}
              /* Con la excepción puesta el botón sigue vivo aunque el protocolo
                 coincida: es la única forma de soltarla, y sin eso un cliente que
                 acabara igualado a mano se quedaba fuera de la plantilla para
                 siempre sin ningún mando que lo devolviera. */
              disabled={applying || (esIgual && !esExcepcion)}
            >
              <RotateCcw size={14} /> Igualar a mi plantilla
            </button>
          </>
        ) : (
          <>
            <span className="t-xs t-tertiary grow">
              Tu forma de trabajar. Se usa para los clientes nuevos.{' '}
              {pieDePlantilla(clients, pendientes, excepciones)}
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onApplyAll}
              disabled={pendientes.length === 0 || applying}
            >
              <Users size={14} /> {applying ? 'Poniendo al día…' : 'Poner al día'}
            </button>
          </>
        )}
      </div>
    </Panel>
  );
};
