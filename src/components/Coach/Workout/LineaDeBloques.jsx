import { useEffect, useRef, useState } from 'react';
import { Plus, Settings2, Trash2 } from 'lucide-react';

import { blockSummary, blocksOf, horizonteDeBloque, weeksOfBlock } from '@/domain/blocks';
import { executedSessions } from '@/domain/sessions';
import { findMicrocycle } from '@/domain/training';
import { shortDate, toISODate } from '@/lib/dates';
import { RenombrarEnSitio } from '@/components/ui/primitives';

/**
 * DÓNDE ESTÁS EN EL PROGRAMA: los bloques, y los microciclos del abierto.
 *
 * ══ Cuatro versiones, y por qué las tres primeras fallaban ═════════════════
 *
 * 1. TARJETAS. Cuatro recuadros del mismo peso que se leían como cuatro
 *    pestañas y no como el programa de una persona.
 * 2. CINTA CON LEYENDA. El mapa arriba y los nombres abajo: quién era quién
 *    había que deducirlo contando. Dos filas para una sola cosa.
 * 3. CARRIL DE CELDAS CON FECHAS. Un tramo por bloque y, dentro del abierto,
 *    una casilla numerada por microciclo con su día del mes debajo. Se leía
 *    mejor, pero seguía siendo un dibujo INVENTADO PARA AQUÍ: en la otra
 *    pantalla de Entreno —la hoja de series— el mismo microciclo se elige con
 *    una pastilla que dice «M2 · en curso», y en esta salía como un cuadradito
 *    de 38 px con un «21» debajo. La misma cosa, dos dibujos, en dos pantallas
 *    a un clic la una de la otra. Y con un solo microciclo el bloque entero se
 *    quedaba en un cuadradito suelto.
 *
 * ══ Lo que hay ahora: la pastilla de la casa, dos veces ════════════════════
 *
 *     [B1 Adaptación] [B2 Acumulación] [B3 Intensificación] [+ bloque]  🗑 ⚙
 *     [M1 · hecho] [M2 · en curso] [+ microciclo]
 *     desde el 14 ago · va por su último microciclo escrito
 *
 * Dos filas, un solo tipo de pieza —la misma `.hoja-semana` con la que se
 * cambia de microciclo mientras se escriben las series— y cada «+» pegado a lo
 * que añade: el de bloques con los bloques, el de microciclos con los
 * microciclos. Estuvieron separados, arriba en la fila de mando, y entonces la
 * acción de añadir un bloque no tocaba a los bloques por ningún sitio.
 *
 * Debajo, en voz baja, lo único que no dibuja ninguna pastilla: desde cuándo va
 * el bloque y cuánto le queda.
 *
 * ══ Por qué vive en su propio archivo ══════════════════════════════════════
 *
 * Nació dentro de `VistaBloque` —el plan del entrenador— y la usan los DOS
 * lados. El portal del cliente navegaba su programa con un carril plano de
 * «Semana 1 … Semana 14»: una enumeración que no dice nada de por qué el 5 es
 * distinto del 9. Su entrenador ya no programa así —programa por bloques, y les
 * pone nombre: «Adaptación», «Acumulación»—, y esa es justamente la parte que
 * al cliente le explica en qué anda metido. Copiar la línea al portal habría
 * dejado dos dibujos del mismo dato que se separan al primer cambio.
 *
 * ══ Lo que se puede hacer sale de los MANEJADORES que llegan ═══════════════
 *
 * No hay un `soloLectura`, y a propósito: cada cosa que se puede hacer aparece
 * si —y solo si— llega su manejador. Sin `onRenombrarBloque` el nombre no se
 * edita; sin `onNuevaSemana` no hay «+ microciclo»; sin `onNuevoBloque` no hay
 * «+ bloque»; sin `onAjustes` no hay engranaje; sin `onQuitarBloque` no hay
 * papelera. El portal no pasa ninguno de los cinco y la línea queda de leer y
 * navegar, que es exactamente lo que el cliente puede hacer con su programa. Un
 * booleano de más habría que acordarse de cruzarlo con cada manejador.
 *
 * `bloque` es el SELECCIONADO: es el tramo cuyos microciclos se pueden pulsar.
 * Para viajar a otro se pulsa su pastilla, y entonces pasa a ser el
 * seleccionado. Así se recorre el historial entero sin que esto tenga dos modos.
 */
export const LineaDeBloques = ({
  program,
  bloque,
  contexto,
  semanaEnCurso,
  unidad,
  unidades,
  etiqueta = 'Bloques del programa',
  /* El horizonte se enseña solo donde `semanaEnCurso` es el microciclo REAL (el
     editor del entrenador). En el portal llega el SELECCIONADO, y un «acaba
     este microciclo» calculado sobre uno de junio mentiría. */
  conHorizonte = false,
  onIrBloque,
  onIrSemana,
  onNuevaSemana,
  onNuevoBloque,
  onRenombrarBloque,
  onQuitarBloque,
  onAjustes,
}) => {
  const [renombrando, setRenombrando] = useState(false);
  const bloques = blocksOf(program);
  const microcycles = program?.microcycles || [];
  const inicial = (unidad || 'Microciclo').charAt(0).toUpperCase();
  const unidadBaja = (unidad || 'Microciclo').toLowerCase();
  const unidadesBajas = (unidades || 'microciclos').toLowerCase();
  const tramos = bloques.map((b, i) => ({
    b,
    i,
    esEste: b.id === bloque.id,
    r: blockSummary(program, b),
    semanas: weeksOfBlock(program, b),
  }));
  const abierto = tramos.find((t) => t.esEste) || null;

  /*
    ── El horizonte, en una frase ───────────────────────────────────────────
    Las pastillas enseñan dónde estás, pero cuánto le queda al bloque había que
    DEDUCIRLO contándolas. Se dice debajo, con lo que viene detrás — que es la
    mitad de la decisión de programar: «se le acaba el bloque y no hay nada
    preparado» tiene que leerse, no calcularse.
  */
  const horizonte = conHorizonte ? horizonteDeBloque(program, semanaEnCurso) : null;
  const fraseHorizonte = (() => {
    if (!horizonte) return null;
    const { restantes, siguiente, abierto: sigueAbierto } = horizonte;
    const cuanto =
      restantes === 0
        ? sigueAbierto
          ? `va por su último ${unidadBaja} escrito`
          : `acaba este ${unidadBaja}`
        : `${restantes === 1 ? `le queda 1 ${unidadBaja}` : `le quedan ${restantes} ${unidadesBajas}`}${
            sigueAbierto ? (restantes === 1 ? ' escrito' : ' escritos') : ''
          }`;
    const despues = sigueAbierto ? null : siguiente ? `después, ${siguiente.name}` : 'después, nada programado';
    return [cuanto, despues].filter(Boolean).join(' · ');
  })();

  /*
    Cuando la fila de bloques no cabe, se abre por el ABIERTO.
    En un teléfono con tres bloques, el carril arrancaba a la izquierda —o sea,
    en el de junio— y el que se está mirando quedaba cortado contra el borde
    derecho: justo el único que hacía falta ver al entrar. El tiempo sigue yendo
    de izquierda a derecha; lo que cambia es por dónde está abierto.

    Se reancla al CAMBIAR de bloque y no solo al montar: la primera vez que esto
    corre el programa puede no haber llegado todavía. Entre medias manda el
    dedo. Y la distancia se mide con los rectángulos y no con `offsetLeft`, que
    se cuenta desde el ancestro posicionado y aquí valía cero para los dos.
  */
  const carril = useRef(null);
  const abiertoRef = useRef(null);
  useEffect(() => {
    const el = carril.current;
    const suyo = abiertoRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (!suyo) {
      el.scrollLeft = el.scrollWidth;
      return;
    }
    el.scrollLeft += suyo.getBoundingClientRect().left - el.getBoundingClientRect().left;
  }, [bloque?.id]);

  /* La línea de debajo: desde cuándo va el bloque abierto y cuánto le queda. */
  const pie = abierto
    ? [
        abierto.r.desde ? `desde el ${shortDate(abierto.r.desde)}` : null,
        contexto,
        fraseHorizonte,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <nav className="linea" aria-label={etiqueta}>
      {/* ── Los bloques ─────────────────────────────────────────────────── */}
      <div className="linea-fila">
        <div className="hoja-semanas-tira" ref={carril} role="tablist" aria-label="Bloques del programa">
          {tramos.map(({ b, i, esEste, r, semanas }) => {
            const cifras = r.kg > 0 ? ` · ${Math.round(r.kg / 1000)} t levantadas` : '';
            const cuando = r.desde
              ? `${shortDate(r.desde)}${r.abierto ? ' · abierto' : r.hasta ? ` – ${shortDate(r.hasta)}` : ''}`
              : 'sin fechas';
            const aqui = semanaEnCurso != null && semanas.includes(semanaEnCurso);

            /* El bloque abierto en renombrado: el campo ocupa el sitio de su
               pastilla, para que el nombre se cambie donde se lee. */
            if (esEste && renombrando) {
              return (
                <RenombrarEnSitio
                  key={b.id}
                  value={b.name}
                  label="Nuevo nombre del bloque"
                  onRename={(nombre) => onRenombrarBloque(b.id, nombre)}
                  onDone={() => setRenombrando(false)}
                />
              );
            }

            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={esEste}
                ref={esEste ? abiertoRef : null}
                className={`hoja-semana${esEste ? ' is-on' : ''}`}
                onClick={() => (esEste ? null : onIrBloque(b))}
                onDoubleClick={() => esEste && onRenombrarBloque && setRenombrando(true)}
                title={
                  esEste
                    ? `${b.name}${onRenombrarBloque ? ' · doble clic para renombrarlo' : ''}`
                    : `Abrir ${b.name} · ${semanas.length} ${semanas.length === 1 ? unidadBaja : unidadesBajas} · ${cuando}${cifras}`
                }
              >
                <span className="hoja-semana-n">B{i + 1}</span>
                <span className="linea-nombre-texto">{b.name}</span>
                {aqui && !esEste && <span className="hoja-semana-estado">estás aquí</span>}
              </button>
            );
          })}

          {/* «+ bloque» PEGADO a los bloques. Estuvo arriba, en la fila de
              mando de la pantalla, y ahí la acción de abrir el bloque siguiente
              no tocaba a los bloques por ningún sitio. */}
          {onNuevoBloque && (
            <button type="button" className="hoja-semana is-nueva" onClick={onNuevoBloque} title="Cierra el bloque abierto y empieza el siguiente">
              <Plus size={13} aria-hidden="true" /> bloque
            </button>
          )}
        </div>

        {/* Papelera y ajustes: a la vista y no dentro de un menú, pero callados
            —tinta terciaria— y solo encendidos al tocarlos. El grupo entero
            desaparece si no llega ninguno de los dos: en el portal del cliente
            era un hueco vacío que seguía cobrando su separación. */}
        {(onAjustes || (onQuitarBloque && tramos.length > 1 && abierto)) && (
        <div className="linea-mandos">
          {onQuitarBloque && tramos.length > 1 && abierto && (
            <button
              type="button"
              className="btn btn-icon btn-icon-compact btn-icon-danger"
              aria-label={`Quitar ${abierto.b.name}`}
              title={`Quitar ${abierto.b.name}: sus ${unidadesBajas} pasan al bloque de al lado`}
              onClick={() => onQuitarBloque(abierto.b)}
            >
              <Trash2 size={14} />
            </button>
          )}
          {onAjustes && (
            <button type="button" className="btn btn-icon btn-icon-compact linea-ajustes" onClick={onAjustes} aria-label="Ajustes del programa" title="Ajustes: tipo de ciclo, patrón, fecha de inicio y protocolo">
              <Settings2 size={16} />
            </button>
          )}
        </div>
        )}
      </div>

      {/* ── Los microciclos del bloque abierto ──────────────────────────────
          La MISMA pastilla con la que se cambia de microciclo mientras se
          escriben las series (`hoja-semanas-tira`), y por eso: es la misma
          pregunta en las dos pantallas de Entreno. */}
      {abierto && (
        <div className="hoja-semanas-tira" role="tablist" aria-label={`${unidades} de ${abierto.b.name}`}>
          {abierto.semanas.map((w) => {
            const micro = findMicrocycle(microcycles, w) || {};
            const iso = toISODate(micro.date);
            const hecha = executedSessions(micro).length > 0;
            const estado = w === semanaEnCurso ? ' is-curso' : hecha ? ' is-hecha' : '';
            const n = w - abierto.b.fromWeek + 1;
            return (
              <button
                key={w}
                type="button"
                role="tab"
                aria-selected={false}
                className={`hoja-semana${estado}`}
                onClick={() => onIrSemana(w)}
                title={`Abrir ${unidad} ${n}${iso ? ` · empieza el ${shortDate(iso)}` : ''}${
                  w === semanaEnCurso ? ' · en curso' : hecha ? ' · entrenado' : ' · por hacer'
                }`}
              >
                {/*
                  La palabra, SOLO en el que está en curso.

                  Con ocho microciclos entrenados la fila decía «entrenado»
                  siete veces seguidas y saltaba a dos renglones: siete
                  repeticiones de la misma palabra no cuentan siete cosas,
                  cuentan una y la ocupan siete veces. Lo entrenado lo dice la
                  cifra en verde —el mismo verde con el que esta casa dice
                  «hecho» en la hoja de series— y la palabra se guarda para el
                  único que necesita nombrarse.
                */}
                <span className="hoja-semana-n">
                  {inicial}
                  {n}
                </span>
                {w === semanaEnCurso && <span className="hoja-semana-estado">en curso</span>}
              </button>
            );
          })}
          {abierto.r.abierto && onNuevaSemana && (
            <button
              type="button"
              className="hoja-semana is-nueva"
              onClick={onNuevaSemana}
              title={`Añadir ${unidadBaja} ${abierto.semanas.length + 1}`}
            >
              <Plus size={13} aria-hidden="true" /> {unidadBaja}
            </button>
          )}
        </div>
      )}

      {pie && <p className="linea-horizonte">{pie}</p>}
    </nav>
  );
};
