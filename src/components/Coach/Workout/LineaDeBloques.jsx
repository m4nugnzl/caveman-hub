import { useState } from 'react';
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react';

import { blockSummary, blocksOf, fraseDeHorizonte, weeksOfBlock } from '@/domain/blocks';
import { executedSessions } from '@/domain/sessions';
import { findMicrocycle } from '@/domain/training';
import { shortDate, toISODate } from '@/lib/dates';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { RenombrarEnSitio } from '@/components/ui/primitives';

/**
 * DÓNDE ESTÁS EN EL PROGRAMA: los bloques, y los microciclos del abierto.
 *
 * ══ Cinco versiones, y por qué las cuatro primeras fallaban ════════════════
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
 * 4. LA PASTILLA DE LA CASA, DOS VECES. Bloques y microciclos como dos filas
 *    de `.hoja-semana`, más la fecha debajo: TRES alturas de piezas del mismo
 *    peso antes del contenido, donde nada mandaba —un inventario, no una
 *    jerarquía— y la pastilla más fuerte (el bloque abierto, rellena) era
 *    justo la única que no hacía nada al pulsarla.
 *
 * 5. DOS FILAS: carril de bloques arriba, regla de microciclos debajo. Mejor,
 *    pero seguían siendo dos alturas de navegación de un solo objeto, y
 *    encima de una mesa sin cajas el carril de pastillas pesaba más que las
 *    hojas. Ver la nota «UNA SOLA LÍNEA», abajo.
 *
 * ══ Lo que hay ahora: la gramática de la cabecera ══════════════════════════
 *
 *     Acumulación ▾   M8 · en curso ▾   desde el 6 jul · 26 de 36 · 72 %
 *      (el titular)     (la unidad)       (voz baja)
 *                                       Cómo va el bloque   🗑 ⚙
 *
 * UN renglón: el nombre de DONDE ESTÁS es el titular y a la vez la puerta al
 * resto del programa; a su lado, el microciclo; detrás, en voz baja, desde
 * cuándo va y cómo lo lleva; al canto, lo que se puede hacer.
 *
 * Los dos navegadores son `MenuAcciones` —el menú de toda la casa— y no un
 * dibujo propio: es la lección de la versión 3, que se saltó dibujando aquí
 * un carril que no existía en ninguna otra pantalla.
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
  /* El conmutador Conjunto | Hojas, ya montado: lo arma el editor, que es
     quien sabe en qué vista está y quien la cambia. Llega como pieza y no
     como par valor/manejador para no tener dos definiciones del mismo
     control —la cabecera del bloque y la de la hoja pintan la misma—. */
  conmutador,
  /* La puerta a la lista de bloques: existe en el editor del entrenador y no
     en el portal, que no tiene esa página. Con ella, el título deja de ser un
     desplegable y pasa a ser un enlace. */
  onVerLista,
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
  /* La frase la arma el dominio (`fraseDeHorizonte`): la dicen también la
     cabecera del entrenador y ésta, y escrita dos veces se separa a la primera
     corrección. */
  const fraseHorizonte = conHorizonte
    ? fraseDeHorizonte(program, bloque, semanaEnCurso, { unidad: unidadBaja, unidades: unidadesBajas })
    : null;
  /*
    ── UNA SOLA LÍNEA ─────────────────────────────────────────────────────────
    Esto fueron dos filas: el carril de bloques arriba (B1 · B2 · B3 · + bloque)
    y la regla de microciclos debajo con el pie de datos. Sumadas a la cabecera
    del cliente y a la franja de días, la pantalla gastaba cuatro alturas de
    navegación —unos 250 px— antes del primer ejercicio, y las tres últimas
    navegaban el MISMO objeto: el bloque, su microciclo y su día.

    Ahora es un renglón: dónde estás, desde cuándo, cómo va y qué se puede
    hacer. Lo que se navega baja a dos menús —el mismo `MenuAcciones` de toda
    la casa, no un dibujo nuevo—, y ahí cada bloque y cada microciclo pueden
    decir MÁS de lo que decían como pastilla: fechas, duración, tonelaje,
    entrenamientos. El mapa no se pierde; deja de ocupar una fila para
    contarse a sí mismo.

    Y pesa que la mesa de abajo perdió sus cajas: una fila de pastillas encima
    de una rejilla sin bordes se convierte en lo más pesado de la pantalla, y
    la mirada se va al índice en vez de a las hojas.

    Si algún día hiciera falta el carril otra vez, se recupera pintando
    `tramos` en la fila en lugar de en `itemsBloques`: los datos ya están
    calculados arriba y no dependen de esto.
  */

  /* El bloque por el que va la persona, que no siempre es el que se mira: sin
     esta vuelta, entrar en uno cerrado del historial es un callejón. */
  const dondeVa = tramos.find((t) => semanaEnCurso != null && t.semanas.includes(semanaEnCurso)) || null;

  const cuandoDe = (r) =>
    r.desde
      ? `${shortDate(r.desde)}${r.abierto ? ' · abierto' : r.hasta ? ` – ${shortDate(r.hasta)}` : ''}`
      : 'sin fechas';

  const itemsBloques = [
    ...tramos.map(({ b, r, semanas, esEste }) => ({
      label: b.name,
      /* Lo que antes había que sobrevolar para saberlo, o directamente no se
         decía: cuándo fue, cuánto duró y cuánto se levantó dentro. */
      sub: [
        cuandoDe(r),
        `${semanas.length} ${semanas.length === 1 ? unidadBaja : unidadesBajas}`,
        r.kg > 0 ? `${Math.round(r.kg / 1000)} t` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      on: esEste,
      run: () => (esEste ? null : onIrBloque(b)),
    })),
    (onRenombrarBloque || onNuevoBloque) && null,
    onRenombrarBloque && { icon: Pencil, label: 'Renombrar este bloque', run: () => setRenombrando(true) },
    onNuevoBloque && { icon: Plus, label: 'Abrir un bloque nuevo', run: onNuevoBloque },
  ];

  /* Los microciclos del bloque que se mira. Cada uno dice lo que la muesca
     medía —los entrenamientos— más la fecha, que la muesca no podía llevar. */
  const itemsMicros = abierto
    ? [
        ...abierto.semanas.map((w) => {
          const micro = findMicrocycle(microcycles, w) || {};
          const iso = toISODate(micro.date);
          const hechas = executedSessions(micro).length;
          const n = w - abierto.b.fromWeek + 1;
          return {
            label: `${inicial}${n}`,
            sub: [iso ? shortDate(iso) : null, hechas === 1 ? '1 entrenamiento' : `${hechas} entrenamientos`]
              .filter(Boolean)
              .join(' · '),
            on: w === semanaEnCurso,
            run: () => onIrSemana(w),
          };
        }),
        abierto.r.abierto && onNuevaSemana && null,
        abierto.r.abierto &&
          onNuevaSemana && {
            icon: Plus,
            label: `Añadir ${unidadBaja} ${abierto.semanas.length + 1}`,
            run: onNuevaSemana,
          },
      ]
    : [];

  const aqui = abierto && semanaEnCurso != null && abierto.semanas.includes(semanaEnCurso);
  const nAqui = aqui ? semanaEnCurso - abierto.b.fromWeek + 1 : null;
  /* «en curso» solo donde `semanaEnCurso` es el microciclo REAL: en el portal
     llega el que se está mirando, y uno de junio no está en curso. */
  const rotuloMicro = !abierto
    ? null
    : aqui
      ? `${inicial}${nAqui}${conHorizonte ? ' · en curso' : ''}`
      : `${abierto.semanas.length} ${abierto.semanas.length === 1 ? unidadBaja : unidadesBajas}`;

  /* ── El dato de la línea ───────────────────────────────────────────────────
     Desde cuándo va el bloque, qué le queda, y las dos cifras que SÍ acompañan
     una decisión del día: cuántos entrenamientos de los pautados lleva y qué
     porcentaje cumple. Las otras dos del antiguo costado —tonelaje y series por
     microciclo— se consultan una vez por bloque y viven en «Cómo va el bloque». */
  const marcha =
    abierto && abierto.r.planificadas
      ? [
          `${abierto.r.hechas} de ${abierto.r.planificadas} entrenamientos`,
          abierto.r.adherencia === null ? null : `${abierto.r.adherencia} % de lo pautado`,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

  const pie = abierto
    ? [
        abierto.r.desde ? `desde el ${shortDate(abierto.r.desde)}` : null,
        contexto,
        fraseHorizonte,
        marcha,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <nav className="linea" aria-label={etiqueta}>
      <div className="linea-fila">
        {/* ── Dónde estás: el titular, y la puerta al resto del programa ── */}
        {renombrando ? (
          <RenombrarEnSitio
            value={bloque.name}
            label="Nuevo nombre del bloque"
            onRename={(nombre) => onRenombrarBloque(bloque.id, nombre)}
            onDone={() => setRenombrando(false)}
          />
        ) : onVerLista ? (
          /* ── El título es la puerta a la LISTA ────────────────────────────
             El menú desplegable servía para saltar de bloque, pero un
             desplegable no enseña el programa: no caben las cifras de cada
             uno, ni se pueden enfrentar dos. Con la lista construida, el
             título va a ella y el menú sobra. El portal del cliente no tiene
             esa página, así que ahí se queda el menú. */
          <button
            type="button"
            className="linea-titulo is-puerta"
            onClick={onVerLista}
            title="Ver todos los bloques y compararlos"
          >
            {bloque.name}
          </button>
        ) : (
          <MenuAcciones
            clase="linea-titulo"
            label={bloque.name}
            ariaLabel={`${bloque.name} · ir a otro bloque`}
            alineado="izquierda"
            items={itemsBloques}
          />
        )}

        {rotuloMicro && (
          <MenuAcciones
            clase="linea-micro"
            label={rotuloMicro}
            ariaLabel={`${rotuloMicro} · ir a otro ${unidadBaja}`}
            alineado="izquierda"
            items={itemsMicros}
          />
        )}

        {/* Desde cuándo va, qué le queda y cómo lo lleva: los datos que sí
            acompañan una decisión, en voz baja y en el mismo renglón. */}
        {pie && <span className="linea-dato">{pie}</span>}

        {/* El camino de vuelta. Era un «estás aquí» colgado de la pastilla del
            bloque abierto; sin carril, es el verbo que lo dice. */}
        {dondeVa && !dondeVa.esEste && onIrBloque && (
          <button type="button" className="cab-accion is-puerta" onClick={() => onIrBloque(dondeVa.b)}>
            Volver a {dondeVa.b.name}
          </button>
        )}

        <span className="linea-hueco" />

        {/* Papelera y ajustes: a la vista y no dentro de un menú, pero callados
            —tinta terciaria— y solo encendidos al tocarlos. El grupo entero
            desaparece si no llega ninguno de los dos: en el portal del cliente
            era un hueco vacío que seguía cobrando su separación. */}
        {(conmutador || onAjustes || (onQuitarBloque && tramos.length > 1 && abierto)) && (
          <div className="linea-mandos">
            {/* Conjunto | Hojas. Es el único mando de la cabecera que no
                depende del bloque sino de qué se está haciendo con él: leerlo
                entero para decidir, o escribir una de sus hojas. */}
            {conmutador}
            {onQuitarBloque && tramos.length > 1 && abierto && (
              <button
                type="button"
                className="btn btn-icon btn-icon-compact btn-icon-danger"
                aria-label={`Quitar ${abierto.b.name}`}
                title={`Quitar ${abierto.b.name}: sus ${unidadesBajas} pasan al bloque de al lado`}
                onClick={() => onQuitarBloque(abierto.b)}
              >
                <Trash2 size={15} />
              </button>
            )}
            {onAjustes && (
              <button
                type="button"
                className="btn btn-icon btn-icon-compact linea-ajustes"
                onClick={onAjustes}
                aria-label="Ajustes del programa"
                title="Ajustes: tipo de ciclo, patrón, fecha de inicio y protocolo"
              >
                <Settings2 size={15} />
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};
