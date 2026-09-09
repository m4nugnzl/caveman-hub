import { useMemo, useState } from 'react';
import { ArrowRight, Layers, Pencil, Plus, Trash2 } from 'lucide-react';

import {
  BLOCK_INTENTS,
  blockSummary,
  blockTraits,
  blocksOf,
  intentLabel,
  weeksOfBlock,
} from '@/domain/blocks';
import { shortDate } from '@/lib/dates';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { EmptyState, RenombrarEnSitio, SegmentedControl } from '@/components/ui/primitives';

/**
 * LOS BLOQUES DE ESTA PERSONA: la lista, y dos de ellos cara a cara.
 *
 * ══ Por qué es una página y no una ventana ═════════════════════════════════
 * Entreno abre por el bloque puesto —es donde se trabaja— y esta es la otra
 * cara de la misma pestaña: `?v=lista`. Se pensó como capa (`Modal`), y una
 * capa es para consultar un dato sin soltar el trabajo; esto no es un dato,
 * es el otro sitio donde se está. Además una capa deja debajo la mesa del
 * bloque abierto encendida, que es justo lo que aquí no importa.
 *
 * ══ La linealidad, y el agrupado ═══════════════════════════════════════════
 * Por defecto la lista va en ORDEN, del último al primero: un programa es una
 * sucesión y esa sucesión es el dato. La intención de cada bloque —adaptación,
 * acumulación, intensificación…— va como chapa en su fila, no como cabecera de
 * grupo, porque agrupar por intención rompe justamente la línea del tiempo.
 * Quien quiera comparar lo parecido con lo parecido lo agrupa con el
 * conmutador; entonces la fecha sigue estando en cada fila.
 *
 * Ninguna cuenta de lo que va a durar: la duración es una LECTURA («duró 6»),
 * nunca una promesa. El abierto dice «abierto» y punto.
 *
 * ══ El cara a cara, retirado ═══════════════════════════════════════════════
 * Aquí abajo vivían dos selectores y una mesa de tres columnas que enfrentaba
 * dos bloques: sus cifras, lo que cambió del plan de uno a otro (`sessionDiff`)
 * y el volumen por grupo de los dos. Se retiró el 9 de septiembre por orden del
 * dueño —«fuera por ahora»— mientras se rehace la pantalla del bloque: comparar
 * es una decisión que se toma DESDE esta lista, y no tiene sentido pulirla
 * antes de saber qué forma tiene lo que se compara.
 *
 * Nada del dominio se ha tocado: `sessionDiff`, `inheritedSessions` y
 * `volumeByGroup` siguen ahí con sus pruebas, y `BarrasDeVolumen` y las clases
 * `.bl-vs-*` también. Vuelve cuando se pida, sin arqueología.
 */

/** «6 microciclos» · «1 microciclo». */
const cuenta = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

const rangoDe = (r) => {
  if (!r.desde) return 'sin fechas';
  if (r.abierto) return `desde el ${shortDate(r.desde)}`;
  return r.hasta ? `${shortDate(r.desde)} – ${shortDate(r.hasta)}` : shortDate(r.desde);
};

/* ══ UNA FILA ══════════════════════════════════════════════════════════════ */

const Fila = ({ t, esEste, unidad, unidades, onIr, onRenombrar, onQuitar, onIntent, sePuedeQuitar }) => {
  const { b, r } = t;
  const [renombrando, setRenombrando] = useState(false);
  const intent = intentLabel(blockTraits(b).intent);
  const nota = blockTraits(b).note;

  if (renombrando) {
    return (
      <li className="bl-fila is-renombrando">
        <RenombrarEnSitio
          value={b.name}
          label="Nuevo nombre del bloque"
          onRename={(nombre) => onRenombrar(b.id, nombre)}
          onDone={() => setRenombrando(false)}
        />
      </li>
    );
  }

  return (
    <li className={`bl-fila${esEste ? ' is-aqui' : ''}`}>
      {/* La fila entera es la puerta: la caja se enciende y el nombre pasa a
          acento. Los mandos van por encima con `pointer-events`, así que pasar
          por el «···» no enciende la fila. */}
      <button
        type="button"
        className="task-hit"
        onClick={() => onIr(b)}
        aria-label={`Abrir ${b.name}`}
        title={`Abrir ${b.name}`}
      />
      <div className="bl-say">
        <div className="bl-nombre-fila">
          <span className="bl-nombre">{b.name}</span>
          {r.abierto && <span className="bl-chapa is-abierto">abierto</span>}
          {intent && <span className="bl-chapa">{intent}</span>}
          {esEste && <span className="bl-aqui">estás aquí</span>}
        </div>
        <span className="bl-cuando">
          {rangoDe(r)} ·{' '}
          {cuenta(r.semanas, unidad.toLowerCase(), unidades.toLowerCase())}
        </span>
        {nota && <span className="bl-nota">{nota}</span>}
      </div>

      {/* Las cifras del bloque, rotuladas y en la misma vertical en todas las
          filas: así la lista se lee hacia abajo por una columna. */}
      <div className="bl-cifras">
        <span className="bl-cifra">
          <b>{r.hechas}</b>
          <small>{r.planificadas ? `de ${r.planificadas}` : 'entrenos'}</small>
        </span>
        <span className="bl-cifra">
          <b>{r.adherencia === null ? '—' : `${r.adherencia} %`}</b>
          <small>de lo pautado</small>
        </span>
        <span className="bl-cifra">
          <b>{r.series || '—'}</b>
          <small>series</small>
        </span>
        <span className="bl-cifra">
          <b>{r.kg > 0 ? `${Math.round(r.kg / 1000)} t` : '—'}</b>
          <small>levantadas</small>
        </span>
      </div>

      <div className="bl-mandos">
        <MenuAcciones
          clase="btn btn-icon btn-icon-compact bl-menu"
          ariaLabel={`Acciones de ${b.name}`}
          items={[
            { icon: ArrowRight, label: 'Abrir este bloque', run: () => onIr(b) },
            onRenombrar && { icon: Pencil, label: 'Renombrar', run: () => setRenombrando(true) },
            onIntent && null,
            ...(onIntent
              ? BLOCK_INTENTS.map((i) => ({
                  label: i.label,
                  on: blockTraits(b).intent === i.id,
                  run: () => onIntent(b, blockTraits(b).intent === i.id ? null : i.id),
                }))
              : []),
            onQuitar && sePuedeQuitar && null,
            onQuitar &&
              sePuedeQuitar && {
                icon: Trash2,
                label: `Quitar «${b.name}»`,
                danger: true,
                run: () => onQuitar(b),
              },
          ]}
        />
      </div>
    </li>
  );
};

/* ══ LA PÁGINA ═════════════════════════════════════════════════════════════ */

export const ListaDeBloques = ({
  program,
  cliente,
  bloque,
  unidad = 'Microciclo',
  unidades = 'microciclos',
  onIrBloque,
  onVolver,
  onNuevoBloque,
  onRenombrarBloque,
  onQuitarBloque,
  onIntent,
}) => {
  const [orden, setOrden] = useState('fecha');

  const bloques = blocksOf(program);
  /* Del último al primero: un programa se lee por donde va, no por donde
     empezó. `fromWeek` y no la fecha, que un microciclo puede no tenerla. */
  const tramos = useMemo(
    () =>
      bloques
        .map((b) => ({ b, r: blockSummary(program, b), semanas: weeksOfBlock(program, b) }))
        .sort((x, y) => (y.b.fromWeek ?? 0) - (x.b.fromWeek ?? 0)),
    [program, bloques]
  );

  if (tramos.length === 0) {
    return (
      <div className="bl-pagina">
        <EmptyState
          icon={Layers}
          title="Todavía no hay bloques"
          message="Un bloque es la versión del plan que está puesta. Se abre uno y dura hasta que hay motivo para cambiarlo."
          action={
            onNuevoBloque ? (
              <button type="button" className="btn btn-primary" onClick={onNuevoBloque}>
                Abrir el primero
              </button>
            ) : null
          }
        />
      </div>
    );
  }

  const grupos =
    orden === 'fecha'
      ? [[null, tramos]]
      : [
          ...BLOCK_INTENTS.map((i) => [i.label, tramos.filter((t) => blockTraits(t.b).intent === i.id)]),
          ['Sin intención', tramos.filter((t) => !blockTraits(t.b).intent)],
        ].filter(([, suyos]) => suyos.length > 0);

  return (
    <div className="bl-pagina">
      <header className="bl-cab">
        <h2 className="bl-titulo">
          {cliente?.name ? `Los bloques de ${cliente.name.split(' ')[0]}` : 'Los bloques'}
        </h2>
        <span className="bl-cab-dato">
          {cuenta(tramos.length, 'bloque', 'bloques')} ·{' '}
          {cuenta(
            tramos.reduce((n, t) => n + t.r.semanas, 0),
            unidad.toLowerCase(),
            unidades.toLowerCase()
          )}
        </span>
        <span className="bl-hueco" />
        <SegmentedControl
          label="Cómo se ordena la lista"
          value={orden}
          onChange={setOrden}
          options={[
            { id: 'fecha', label: 'En orden', hint: 'Del último al primero' },
            { id: 'intent', label: 'Por intención', hint: 'Agrupados por a qué juega cada bloque' },
          ]}
        />
        {onNuevoBloque && (
          <button type="button" className="cab-accion is-puerta" onClick={onNuevoBloque}>
            <Plus size={13} aria-hidden="true" /> bloque
          </button>
        )}
        {onVolver && bloque && (
          <button type="button" className="cab-accion is-puerta" onClick={onVolver}>
            Volver a {bloque.name}
          </button>
        )}
      </header>

      {grupos.map(([titulo, suyos]) => (
        <section className="bl-grupo" key={titulo || 'todos'}>
          {titulo && <span className="section-label">{titulo}</span>}
          <ul className="bl-lista">
            {suyos.map((t) => (
              <Fila
                key={t.b.id}
                t={t}
                esEste={t.b.id === bloque?.id}
                unidad={unidad}
                unidades={unidades}
                onIr={onIrBloque}
                onRenombrar={onRenombrarBloque}
                onQuitar={onQuitarBloque}
                onIntent={onIntent}
                sePuedeQuitar={tramos.length > 1}
              />
            ))}
          </ul>
        </section>
      ))}

    </div>
  );
};
