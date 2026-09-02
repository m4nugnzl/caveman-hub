import { useEffect, useRef } from 'react';
import { Plus, Settings2 } from 'lucide-react';

import { blockSummary, blocksOf, horizonteDeBloque, weeksOfBlock } from '@/domain/blocks';
import { executedSessions } from '@/domain/sessions';
import { findMicrocycle } from '@/domain/training';
import { localeNumber, shortDate } from '@/lib/dates';

/**
 * LA CINTA: los bloques de esta persona como una sola línea de tiempo.
 *
 * ══ De tarjetas a cinta ════════════════════════════════════════════════════
 *
 * Cada bloque fue una tarjeta con su nombre, sus fechas y sus semanas dentro.
 * Cuatro recuadros del mismo peso se leían como cuatro pestañas, no como
 * tiempo — y el ciclo es EXACTAMENTE una cosa que pasa en el tiempo. Ahora el
 * mapa y la letra van separados:
 *
 *   · ARRIBA, la cinta: un tramo por bloque, cuyo ancho ponen sus semanas, y
 *     una celda por semana que cuenta su estado — hecha rellena, en curso en
 *     acento, por hacer hueca. Los tramos que no se están mirando bajan la
 *     voz; se entra pulsándolos.
 *   · DEBAJO, la leyenda: «B1 Adaptación · B2 Acumulación · B3 Intensificación
 *     — estás aquí, semana 2 de 4», con el horizonte del ciclo a la derecha.
 *     Las fechas y las cifras de cada bloque viven en su título al pasar por
 *     encima: son contexto, no lectura de cada día.
 *
 * ══ Por qué vive en su propio archivo ══════════════════════════════════════
 *
 * Nació dentro de `VistaBloque` —el plan del entrenador— y la usan los DOS
 * lados. El portal del cliente navegaba su programa con un carril plano de
 * «Semana 1 … Semana 14»: una enumeración que no dice nada de por qué la
 * semana 5 es distinta de la 9. Su entrenador ya no programa así —programa
 * por bloques, y les pone nombre: «Adaptación», «Acumulación»—, y esa es
 * justamente la parte que al cliente le explica en qué anda metido.
 *
 * Copiar la línea al portal habría dejado dos dibujos del mismo dato que se
 * separan al primer cambio. Es la misma cinta; lo que cambia es quién puede
 * tocarla.
 *
 * ══ Lo que se puede hacer sale de los MANEJADORES que llegan ═══════════════
 *
 * No hay un `soloLectura`, y a propósito: cada cosa que se puede hacer aparece
 * si —y solo si— llega su manejador. Sin `onRenombrarBloque` el nombre del
 * bloque abierto es texto y no un campo; sin `onNuevaSemana` no hay «+»; sin
 * `onNuevoBloque` no hay hueco de más; sin `onAjustes` no hay engranaje. El
 * portal no pasa ninguno de esos cuatro y la cinta queda de leer y navegar,
 * que es exactamente lo que el cliente puede hacer con su programa. Un
 * booleano de más habría que acordarse de cruzarlo con cada manejador.
 *
 * `bloque` es el SELECCIONADO, no el abierto: es el tramo cuyas semanas se
 * pueden pulsar. Para viajar a otro se pulsa su tramo o su nombre en la
 * leyenda, y entonces pasa a ser el seleccionado y se abren sus semanas. Así
 * se recorre el historial entero sin que la cinta tenga dos modos.
 */
export const LineaDeBloques = ({
  program,
  bloque,
  contexto,
  semanaEnCurso,
  unidad,
  unidades,
  etiqueta = 'Bloques del programa',
  /* El horizonte se enseña solo donde `semanaEnCurso` es la semana REAL (el
     editor del entrenador). En el portal llega la semana SELECCIONADA, y un
     «acaba esta semana» calculado sobre una semana de junio mentiría. */
  conHorizonte = false,
  onIrBloque,
  onIrSemana,
  onNuevaSemana,
  onNuevoBloque,
  onRenombrarBloque,
  onAjustes,
}) => {
  const bloques = blocksOf(program);
  const microcycles = program?.microcycles || [];
  const tramos = bloques.map((b, i) => ({
    b,
    i,
    esEste: b.id === bloque.id,
    r: blockSummary(program, b),
    semanas: weeksOfBlock(program, b),
  }));

  /*
    ── El horizonte, en una frase ───────────────────────────────────────────
    La cinta enseña los tramos, pero cuánto le queda al ciclo había que
    DEDUCIRLO contando celdas. Ahora se dice debajo, con lo que viene detrás —
    que es la mitad de la decisión de programar: «se le acaba el bloque y no
    hay nada preparado» tiene que leerse, no calcularse. La cuenta atrás va en
    acento —es la otra mitad de «estás aquí»— y lo de después en voz baja.
  */
  const horizonte = conHorizonte ? horizonteDeBloque(program, semanaEnCurso) : null;
  const fraseHorizonte = (() => {
    if (!horizonte) return null;
    const { bloque: bh, restantes, siguiente, abierto } = horizonte;
    const u = (unidad || 'Semana').toLowerCase();
    const us = (unidades || 'Semanas').toLowerCase();
    const cuanto =
      restantes === 0
        ? abierto
          ? `${bh.name} va por su última ${u} escrita`
          : `${bh.name} acaba esta ${u}`
        : `A ${bh.name} le ${restantes === 1 ? `queda 1 ${u}` : `quedan ${restantes} ${us}`}${
            abierto ? (restantes === 1 ? ' escrita' : ' escritas') : ''
          }`;
    const despues = abierto ? null : siguiente ? `después, ${siguiente.name}` : 'después, nada programado';
    return { cuanto, despues };
  })();

  /*
    Cuando la cinta no cabe, se abre por el FINAL.
    En un teléfono con tres bloques, el carril arrancaba a la izquierda —o sea,
    en el bloque de junio— y el que está en curso quedaba cortado contra el
    borde derecho: justo el único que hacía falta ver al entrar. El tiempo
    sigue yendo de izquierda a derecha, que es lo que hace que la cinta se lea;
    lo que cambia es por dónde está abierta.

    Solo al montar y solo si desborda: después manda el dedo, y arrastrar hacia
    atrás para mirar la historia no puede rebotar.
  */
  const carril = useRef(null);
  useEffect(() => {
    const el = carril.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  }, []);

  const celdas = ({ b, esEste, semanas }) =>
    semanas.map((w) => {
      const micro = findMicrocycle(microcycles, w) || {};
      const hecha = executedSessions(micro).length > 0;
      const estado = w === semanaEnCurso ? ' is-curso' : hecha ? ' is-hecha' : '';
      const n = w - b.fromWeek + 1;
      const titulo = `${unidad} ${n}${micro.date ? ` · ${shortDate(micro.date)}` : ''}${w === semanaEnCurso ? ' · en curso' : hecha ? ' · entrenada' : ' · por hacer'}`;
      return esEste ? (
        <button key={w} type="button" role="listitem" className={`cinta-semana${estado}`} onClick={() => onIrSemana(w)} title={`Abrir ${titulo}`}>
          {n}
        </button>
      ) : (
        <span key={w} role="listitem" className={`cinta-semana${estado}`} title={titulo}>
          {n}
        </span>
      );
    });

  return (
    <nav className="linea" aria-label={etiqueta}>
      <div className="linea-fila">
        <ol className="linea-cinta" ref={carril}>
          {tramos.map((tramo) => {
            const { b, esEste, r, semanas } = tramo;
            const cifras = [r.kg > 0 && `${localeNumber(r.kg)} kg`, r.adherencia !== null && `${r.adherencia} % de lo pautado`].filter(Boolean).join(' · ');
            const cuando = `${r.desde ? shortDate(r.desde) : 'sin fechas'}${r.abierto ? ' · abierto' : r.hasta ? ` – ${shortDate(r.hasta)}` : ''}`;

            return (
              <li key={b.id} className={`cinta-bloque${esEste ? ' is-on' : ''}`} style={{ flexGrow: Math.max(2, semanas.length) }}>
                {esEste ? (
                  <div className="cinta-semanas" role="list" aria-label={`${unidades} de ${b.name}`} title={cuando}>
                    {celdas(tramo)}
                    {r.abierto && onNuevaSemana && (
                      <button type="button" className="cinta-semana is-nueva" onClick={onNuevaSemana} aria-label={`Añadir ${unidad.toLowerCase()}`} title={`Añadir ${unidad.toLowerCase()} ${semanas.length + 1}`}>
                        <Plus size={11} />
                      </button>
                    )}
                  </div>
                ) : (
                  /* El tramo entero es la puerta a su bloque; sus celdas se ven
                     pero no se pulsan de una en una — primero se entra, luego
                     se elige. El `aria-label` habla por encima de los números. */
                  <button type="button" className="cinta-ir" onClick={() => onIrBloque(b)} aria-label={`Ir a ${b.name}`} title={`Ir a ${b.name} · ${cuando}${cifras ? ` · ${cifras}` : ''}`}>
                    <span className="cinta-semanas">{celdas(tramo)}</span>
                  </button>
                )}
              </li>
            );
          })}

          {onNuevoBloque && (
            <li className="cinta-bloque is-siguiente">
              <button type="button" className="cinta-mas" onClick={onNuevoBloque} title="Cierra el bloque abierto y empieza el siguiente">
                <Plus size={12} aria-hidden="true" /> bloque
              </button>
            </li>
          )}
        </ol>
        {onAjustes && (
          <button type="button" className="btn btn-icon btn-icon-compact linea-ajustes" onClick={onAjustes} aria-label="Ajustes del programa" title="Ajustes: tipo de ciclo, patrón, fecha de inicio y protocolo">
            <Settings2 size={16} />
          </button>
        )}
      </div>

      {/* ── La leyenda: qué es cada tramo, y dónde estás ──────────────────────
          El nombre del bloque seleccionado se escribe aquí (no hay ningún
          titular encima), y el que contiene la semana en curso lleva su nota:
          «estás aquí, semana 2 de 4». Suelen ser el mismo; cuando se está
          mirando la historia, cada uno dice lo suyo. */}
      <div className="linea-pie">
        <div className="linea-nombres">
          {tramos.map(({ b, i, esEste, semanas }) => {
            const aqui = semanaEnCurso != null && semanas.includes(semanaEnCurso);
            const nota = aqui ? `estás aquí, ${(unidad || 'Semana').toLowerCase()} ${semanaEnCurso - b.fromWeek + 1} de ${semanas.length}` : null;
            return esEste ? (
              <span key={b.id} className="linea-nombre is-on">
                <span className="linea-n">B{i + 1}</span>
                {onRenombrarBloque ? (
                  <input
                    key={b.id}
                    className="linea-campo"
                    defaultValue={b.name}
                    size={Math.max(4, b.name.length + 1)}
                    aria-label="Nombre del bloque"
                    onBlur={(e) => {
                      const nombre = e.target.value.trim();
                      if (nombre && nombre !== b.name) onRenombrarBloque(b.id, nombre);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                ) : (
                  <span className="linea-nombre-texto">{b.name}</span>
                )}
                {nota && <span className="linea-aqui"> — {nota}</span>}
                {contexto && <span className="linea-cuando">{contexto}</span>}
              </span>
            ) : (
              <button key={b.id} type="button" className="linea-nombre" onClick={() => onIrBloque(b)} title={`Ir a ${b.name}`}>
                <span className="linea-n">B{i + 1}</span>
                <span className="linea-nombre-texto">{b.name}</span>
                {nota && <span className="linea-aqui"> — {nota}</span>}
              </button>
            );
          })}
        </div>
        {fraseHorizonte && (
          <p className="linea-horizonte">
            <b>{fraseHorizonte.cuanto}</b>
            {fraseHorizonte.despues ? ` · ${fraseHorizonte.despues}` : ''}
          </p>
        )}
      </div>
    </nav>
  );
};
