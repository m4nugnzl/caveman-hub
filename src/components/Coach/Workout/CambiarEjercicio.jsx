import { useEffect, useRef, useState } from 'react';

import {
  avisoDeRenombrar,
  esquemaDicho,
  musculoDelNombre,
  pautaComun,
  porQueNoSeRenombra,
  tramosDeSeries,
} from '@/domain/blocks';
import { useCapaFlotante } from '@/lib/useCapaFlotante';
import { useDismissable } from '@/lib/useDismissable';
import { Autocomplete } from '@/components/ui/Autocomplete';

/**
 * CAMBIAR UN EJERCICIO POR OTRO, CON SU ESTRUCTURA.
 *
 * ══ El gesto ════════════════════════════════════════════════════════════════
 * Se pulsa el nombre y sale una capa pegada a él: el buscador de la biblioteca
 * —el mismo del alta, con el músculo y el material al canto— o un nombre nuevo.
 * Elegir NO cambia nada todavía: la capa dice qué va a pasar y pide el sí.
 *
 * ── Por qué se confirma ─────────────────────────────────────────────────────
 * Es otro ejercicio (ver `renameBlockExerciseIn`): estrena identificador y su
 * progreso empieza de cero. Eso no se ve en la hoja —la fila queda igual, con
 * otro nombre— y el dueño lo pidió así: «cambiar es fácil, pero deberías
 * confirmar». La frase de la confirmación cuenta las dos mitades: qué se queda
 * (la pauta) y qué no (el historial).
 *
 * ── Por qué es una capa y no un campo en la fila ────────────────────────────
 * Fue un campo en sitio con un subrayado, y en la rejilla del bloque —276 px
 * por hoja— el buscador no tenía dónde enseñar una sola sugerencia. La capa
 * sube al top layer (`useCapaFlotante`), no la recorta ninguna caja y no mueve
 * la fila.
 *
 * ── Teclado ─────────────────────────────────────────────────────────────────
 * Se abre con el foco en el buscador. Flechas y Enter eligen una sugerencia;
 * Enter sin sugerencia elige lo escrito. Tras elegir, el foco va a «Cambiar
 * ejercicio», así que Enter otra vez confirma. Escape cierra la lista y, con
 * la lista cerrada, la capa; pulsar fuera también cancela.
 *
 * @param ejercicio  el de la fila: `name`, `muscle` y sus `sets`.
 * @param vecinos    con los que el nombre nuevo no puede coincidir (la hoja, y
 *                   en el bloque también lo que entra por excepción).
 * @param onCambiar  `(nombre, { muscle })`.
 * @param className  la clase del texto al que sustituye el botón, para que lea
 *                   exactamente igual (`escribir-nombre`…).
 */

/*
  El foco, de una fila a la que la sustituye: el ejercicio nuevo lleva otro id,
  la fila se vuelve a montar y el botón que había que enfocar ya no existe. Se
  apunta el nombre recién puesto y lo recoge el que nace con él.
*/
let focoPendiente = null;

const clave = (n) => String(n || '').trim().toLowerCase();

/** «4×6-8 · RIR 2», o lo que haya de eso. */
const pautaDicha = (ex) => {
  const tramos = tramosDeSeries(ex).filter((t) => t.reps);
  const esquema = tramos.length > 0 ? esquemaDicho(tramos) : ex?.sets?.length ? `${ex.sets.length} series` : '';
  const rir = pautaComun(ex, 'targetRir');
  return [esquema, rir ? `RIR ${rir}` : ''].filter(Boolean).join(' · ');
};

export const CambiarEjercicio = ({ ejercicio, vecinos = [], library = [], onCambiar, className = '', title }) => {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  /* Lo elegido y pendiente del sí: `{ name, muscle }`. Teclear lo suelta. */
  const [elegido, setElegido] = useState(null);
  const wrapRef = useRef(null);
  const botonRef = useRef(null);
  const confirmarRef = useRef(null);
  const capa = useDismissable(abierto);
  const flota = useCapaFlotante(capa.mounted, wrapRef, capa.ref, { alineado: 'izquierda' });
  const nombre = ejercicio.name;

  const cerrar = ({ foco = false } = {}) => {
    setAbierto(false);
    setElegido(null);
    if (foco) botonRef.current?.focus();
  };
  /*
    Pulsar fuera cancela. Es la mitad de `useClickOutside` y no el hook entero
    a propósito: aquel cierra también con Escape desde el documento, y aquí el
    primer Escape es de la lista de sugerencias —la cierra— y solo el segundo
    es de la capa (ver su `onKeyDown`).
  */
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setAbierto(false);
        setElegido(null);
      }
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
    };
  }, [abierto]);

  /* Nace con el nombre que se acaba de poner en otra fila: el foco es suyo. */
  useEffect(() => {
    if (!focoPendiente || Date.now() > focoPendiente.hasta || focoPendiente.nombre !== nombre) return;
    focoPendiente = null;
    botonRef.current?.focus();
    // Solo al nacer: es la fila que sustituye a la de antes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (elegido) confirmarRef.current?.focus();
  }, [elegido]);

  const elegir = (item) => {
    const n = String(item?.name || '').trim();
    if (!n) return;
    setTexto(n);
    setElegido({ name: n, muscle: item.muscle || musculoDelNombre(library, n) || null });
  };

  /* Lo que se va a hacer, o por qué no. */
  const motivo = elegido ? porQueNoSeRenombra(vecinos, ejercicio.id, elegido.name) : null;
  const igual = elegido && elegido.name === nombre;
  const soloMayusculas = elegido && !igual && clave(elegido.name) === clave(nombre);
  const musculoNuevo = elegido?.muscle && elegido.muscle !== ejercicio.muscle ? elegido.muscle : null;
  const pauta = pautaDicha(ejercicio);
  /* La biblioteca sin lo que ya está en la hoja: ofrecerlo sería ofrecer un
     rechazo. */
  const ocupados = new Set(vecinos.filter((v) => v.id !== ejercicio.id).map((v) => clave(v.name)));
  const ofrecibles = (library || []).filter((item) => !ocupados.has(clave(item.name)));
  const sePuede = Boolean(elegido) && !motivo && !igual;

  const confirmar = () => {
    if (!sePuede) return;
    focoPendiente = { nombre: elegido.name, hasta: Date.now() + 1500 };
    onCambiar(elegido.name, { muscle: musculoNuevo });
    cerrar({ foco: true });
  };

  return (
    <span ref={wrapRef} className="ej-cambiar">
      <button
        ref={botonRef}
        type="button"
        className={`ej-cambiar-nombre ${className}`.trim()}
        title={title ?? 'Cambiar el ejercicio'}
        aria-label={`${nombre}. Cambiar el ejercicio`}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => {
          if (abierto) {
            cerrar();
            return;
          }
          setTexto('');
          setElegido(null);
          setAbierto(true);
        }}
      >
        {nombre}
      </button>

      {capa.mounted && (
        <div
          ref={capa.ref}
          className="popover ej-cambiar-capa"
          style={flota.estilo}
          {...flota.atributos}
          data-state={capa.closing ? 'closing' : 'open'}
          role="dialog"
          aria-label={`Cambiar ${nombre} por otro ejercicio`}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            /* Con la lista de sugerencias abierta, Escape es suyo: la cierra. */
            if (e.target.getAttribute?.('aria-expanded') === 'true') return;
            e.stopPropagation();
            cerrar({ foco: true });
          }}
        >
          <p className="ej-cambiar-titulo">
            Cambiar <strong>{nombre}</strong> por
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              elegir({ name: texto });
            }}
          >
            <Autocomplete
              value={texto}
              onChange={(v) => {
                setTexto(v);
                setElegido(null);
              }}
              items={ofrecibles}
              getMeta={(item) =>
                [item.muscle, item.equipment, item.fromCatalog ? 'del catálogo' : null].filter(Boolean).join(' · ')
              }
              onPick={elegir}
              onCreate={() => elegir({ name: texto })}
              queEs="ejercicio"
              placeholder="Buscar en tu biblioteca"
              inputProps={{ autoFocus: true, spellCheck: false, 'aria-label': `Ejercicio que sustituye a ${nombre}` }}
            />
          </form>

          {elegido && (motivo || igual) && (
            <p className="ej-cambiar-aviso" role="status">
              {igual ? 'Ya se llama así.' : avisoDeRenombrar(motivo, elegido.name)}
            </p>
          )}

          {sePuede && (
            <>
              <p className="ej-cambiar-resumen" role="status">
                {soloMayusculas ? (
                  <>Mismo ejercicio, bien escrito: conserva su historial.</>
                ) : (
                  <>
                    {pauta ? <>Se queda la pauta: {pauta}. </> : null}
                    {musculoNuevo ? <>Pasa a {musculoNuevo}. </> : null}
                    <strong>{elegido.name}</strong> empieza sin historial; lo hecho en {nombre} se queda en el suyo.
                  </>
                )}
              </p>
              <div className="ej-cambiar-acciones">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => cerrar({ foco: true })}>
                  Cancelar
                </button>
                <button ref={confirmarRef} type="button" className="btn btn-primary btn-sm" onClick={confirmar}>
                  Cambiar ejercicio
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
};
