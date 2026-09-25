import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ClipboardCheck,
  Folder,
  FolderInput,
  Layers,
  Pencil,
  Play,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';

import { BLOCK_INTENTS, blockTraits, weeksOfBlock } from '@/domain/blocks';
import { borradoresDe, sePuedeEmpezar } from '@/domain/borradores';
import { lineaDeBloques, resumenDeLaLinea } from '@/domain/lineaDeBloques';
import {
  cantosDeLaFunda,
  cascadaDeLaTemporada,
  sucesionDeBloques,
  temporadaConNombre,
  temporadasDe,
  tirasDeLasTemporadas,
} from '@/domain/temporadas';
import { shortDate, todayISO } from '@/lib/dates';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { EmptyState, RenombrarEnSitio } from '@/components/ui/primitives';
import { PaseDeBloque, rangoDeFechas } from './PaseDeBloque';

/**
 * LOS BLOQUES DE ESTA PERSONA, COMO UNA CARTERA DE PASES (25 sep 2026).
 *
 * Sustituye a la línea de tiempo del 24 sep. La metáfora es la de Wallet: cada
 * bloque es un PASE (`PaseDeBloque`) y cada temporada una FUNDA con sus pases
 * (`domain/temporadas`). Revisar un bloque exige abrirlo; aquí se reconoce.
 *
 * ══ Dos pantallas en la misma URL ══════════════════════════════════════════
 *   · La portada (`?v=lista`): lo de hoy —el pase del bloque abierto o, sin
 *     él, el primer previsto— y las fundas, de la más reciente a la más antigua.
 *   · Una temporada abierta (`?v=lista&t=clave`): sus pases en cascada, del
 *     más antiguo arriba al más reciente abajo; de cada uno asoma su cabecera
 *     y el último se ve entero. Va en la URL porque es dónde estás: «‹ Bloques»
 *     y el botón de atrás hacen lo mismo.
 *
 * ══ Editar ═════════════════════════════════════════════════════════════════
 * Un modo, como en iOS: los pases se arrastran a otra funda (y los previstos,
 * entre sí para reordenarlos), y la temporada se renombra o se quita —sus
 * bloques vuelven a la de su año—. Todo lo que se arrastra tiene también su
 * entrada en el menú del pase, que es el camino del teclado y del teléfono.
 *
 * Una temporada nueva no existe hasta que tiene un bloque (no hay lista de
 * temporadas guardada): vive en esta pantalla, en «Editar», hasta que se le
 * suelta el primero.
 */

const cuenta = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

/* Un pase cabe en una funda de nombre cualquiera, y en la de un año solo si
   es el suyo: «volver al año» es quitarle la carpeta, y eso lo lleva al SUYO. */
const cabeEn = (pase, t) => Boolean(pase) && (t.propia || String(pase.desde || '').slice(0, 4) === t.nombre);

/* Lo que viaja en un arrastre: el id del pase. */
const TIPO_ARRASTRE = 'application/x-caveman-pase';

const alSoltar = (onSoltar) => ({
  onDragOver: (e) => {
    if (!e.dataTransfer.types.includes(TIPO_ARRASTRE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('is-destino');
  },
  onDragLeave: (e) => e.currentTarget.classList.remove('is-destino'),
  onDrop: (e) => {
    e.currentTarget.classList.remove('is-destino');
    const id = e.dataTransfer.getData(TIPO_ARRASTRE);
    if (!id) return;
    e.preventDefault();
    onSoltar(id);
  },
});

const arrastreDe = (id) => ({
  onDragStart: (e) => {
    e.dataTransfer.setData(TIPO_ARRASTRE, id);
    e.dataTransfer.effectAllowed = 'move';
  },
});

/* ══ LA FUNDA ═══════════════════════════════════════════════════════════════
   Una tarjeta neutra con su carpeta, sus fechas, lo que lleva y la tira de sus
   intenciones; por detrás asoman los cantos de sus tres últimos pases. */

const Funda = ({ temporada, tira, editando, onAbrir, onRenombrar, onQuitar, onSoltar, hoy }) => {
  const [renombrando, setRenombrando] = useState(false);
  const cantos = cantosDeLaFunda(temporada);
  const bloques = temporada.pases.length;
  return (
    <li className={`funda${temporada.vacia ? ' is-vacia' : ''}`} {...(editando ? alSoltar(onSoltar) : {})}>
      <span className="funda-cantos" aria-hidden="true">
        {cantos.map((p, i) => (
          <i
            key={p.id}
            className={`funda-canto is-${i}${p.tipo === 'borrador' ? ' is-previsto' : ''}`}
            style={{ '--pase-tinta': p.color }}
          />
        ))}
      </span>
      <div className="funda-tarjeta">
        {!editando && !temporada.vacia && (
          <button
            type="button"
            className="task-hit"
            onClick={() => onAbrir(temporada)}
            aria-label={`Abrir la temporada ${temporada.nombre}`}
          />
        )}
        <div className="funda-cab">
          <Folder size={15} className="funda-icono" aria-hidden="true" />
          {renombrando ? (
            <RenombrarEnSitio
              value={temporada.nombre}
              label="Nombre de la temporada"
              seleccionado
              onRename={(nombre) => onRenombrar(temporada, nombre)}
              onDone={() => setRenombrando(false)}
            />
          ) : (
            <h3 className="funda-nombre">{temporada.nombre}</h3>
          )}
          {editando && !renombrando && (
            <span className="funda-mandos">
              <button type="button" className="btn btn-plain btn-sm" onClick={() => setRenombrando(true)}>
                Renombrar
              </button>
              {temporada.propia && !temporada.vacia && (
                <button type="button" className="btn btn-plain btn-sm pases-peligro" onClick={() => onQuitar(temporada)}>
                  Quitar
                </button>
              )}
            </span>
          )}
        </div>
        {temporada.vacia ? (
          <span className="funda-dato">Arrastra aquí un bloque, o usa «Mover a» en su menú.</span>
        ) : (
          <>
            <span className="funda-fechas">{rangoDeFechas(temporada.desde, temporada.hasta, { hoy })}</span>
            <span className="funda-dato">
              {cuenta(bloques, 'bloque', 'bloques')} · {cuenta(temporada.semanas, 'semana', 'semanas')}
            </span>
            {tira && (
              <span
                className="funda-tira"
                role="img"
                aria-label={`Intenciones de sus bloques, en ${cuenta(temporada.largo, 'microciclo', 'microciclos')}`}
              >
                <span className="funda-tira-lleno" style={{ width: `${(tira.ancho * 100).toFixed(2)}%` }}>
                  {tira.segmentos.map((s) => (
                    <i key={s.id} style={{ flexGrow: s.fraccion, '--pase-tinta': s.color }} />
                  ))}
                </span>
              </span>
            )}
          </>
        )}
      </div>
    </li>
  );
};

/* ══ LAS ACCIONES DE UN PASE ═══════════════════════════════════════════════
   El menú contextual: lo que hay que hacer con ESTE bloque sin abrirlo. */

const accionesDelPase = ({ pase, temporadas, aqui, program, sePuedeQuitar, h }) => {
  const b = pase.bloque;
  const previsto = pase.tipo === 'borrador';
  const traits = blockTraits(b);
  const otras = temporadas.filter((t) => t.clave !== aqui && cabeEn(pase, t));
  const mover = otras.map((t) => ({
    icon: FolderInput,
    label: `Mover a «${t.nombre}»`,
    run: () => h.moverA(pase.id, t),
  }));

  if (previsto) {
    const lista = borradoresDe(program);
    const i = lista.findIndex((x) => x.id === b.id);
    return [
      { icon: Pencil, label: (b.sessions || []).length ? 'Seguir rellenándolo' : 'Rellenarlo', run: () => h.onRellenarBorrador?.(b) },
      h.onMoverBorrador && i > 0 && { icon: ArrowUp, label: 'Adelantarlo', run: () => h.onMoverBorrador(b.id, i - 1) },
      h.onMoverBorrador && i < lista.length - 1 && { icon: ArrowDown, label: 'Retrasarlo', run: () => h.onMoverBorrador(b.id, i + 1) },
      mover.length > 0 && null,
      ...mover,
      h.onQuitarBorrador && null,
      h.onQuitarBorrador && { icon: Trash2, label: 'Quitar el previsto', danger: true, run: () => h.onQuitarBorrador(b) },
    ].filter((x) => x !== false && x !== undefined);
  }

  const tieneSemanas = weeksOfBlock(program, b).length > 0;
  return [
    h.onRenombrarBloque && { icon: Pencil, label: 'Renombrar', run: () => h.renombrar(b) },
    /* Mandarlo y guardarlo, solo si tiene algo escrito. */
    h.onMandarBloque && tieneSemanas && { icon: Users, label: 'Mandarlo a otros clientes…', run: () => h.onMandarBloque(b) },
    h.onGuardarBloque && tieneSemanas && { icon: ClipboardCheck, label: 'Guardarlo en tus plantillas', run: () => h.onGuardarBloque(b) },
    mover.length > 0 && null,
    ...mover,
    h.onIntent && null,
    ...(h.onIntent
      ? BLOCK_INTENTS.map((it) => ({
          label: it.label,
          on: traits.intent === it.id,
          run: () => h.onIntent(b, traits.intent === it.id ? null : it.id),
        }))
      : []),
    h.onQuitarBloque && sePuedeQuitar && null,
    h.onQuitarBloque && sePuedeQuitar && { icon: Trash2, label: `Quitar «${b.name}»`, danger: true, run: () => h.onQuitarBloque(b) },
  ].filter((x) => x !== false && x !== undefined);
};

/* ══ RENOMBRAR UN BLOQUE ═══════════════════════════════════════════════════
   El nombre se escribe en una fila encima del pase: dentro, sobre la tinta, un
   campo de la casa no se leería. */

const Renombrando = ({ bloque, onRenombrar, onDone }) => (
  <div className="pases-renombrar">
    <RenombrarEnSitio
      value={bloque.name}
      label="Nuevo nombre del bloque"
      seleccionado
      onRename={(nombre) => onRenombrar(bloque.id, nombre)}
      onDone={onDone}
    />
  </div>
);

/* ══ LA PÁGINA ═════════════════════════════════════════════════════════════ */

export const ListaDeBloques = ({
  program,
  cliente,
  semanaEnCurso = null,
  onMandarBloque,
  onGuardarBloque,
  onIrBloque,
  onNuevoBloque,
  onRenombrarBloque,
  onQuitarBloque,
  onIntent,
  /* Los previstos, si esta pantalla los deja tocar. Sin manejadores no se
     pintan: la lista de un sitio donde no se componen no los necesita. */
  onRellenarBorrador,
  onEmpezarBorrador,
  onQuitarBorrador,
  onMoverBorrador,
  /* Las temporadas: poner (o quitar, con `null`) la de una lista de ids, y
     quitar una entera con su aviso. */
  onPonerTemporada,
  onQuitarTemporada,
  /* El verbo de pegar un bloque copiado, ya montado (ver `WorkoutLogEditor`). */
  accionPegar = null,
}) => {
  const hoy = todayISO();
  const [params, setParams] = useSearchParams();
  const [editando, setEditando] = useState(false);
  /* Las temporadas nuevas que aún no tienen bloque. */
  const [nuevas, setNuevas] = useState([]);
  const [nombrando, setNombrando] = useState(false);
  const [entero, setEntero] = useState(null);
  const [renombrando, setRenombrando] = useState(null);
  const [renombrandoTemporada, setRenombrandoTemporada] = useState(false);

  const opciones = useMemo(
    () => ({ cycleType: cliente?.cycleType, cyclePattern: cliente?.cyclePattern, startDate: cliente?.startDate }),
    [cliente]
  );
  const conPrevistos = Boolean(onRellenarBorrador);
  const sucesion = useMemo(
    () => sucesionDeBloques(program, { opciones, borradores: conPrevistos, hoy }),
    [program, opciones, conPrevistos, hoy]
  );
  const guardadas = useMemo(() => temporadasDe(sucesion, { hoy }), [sucesion, hoy]);
  /* Las nuevas van delante, vacías, mientras no tengan nombre repetido. */
  const temporadas = useMemo(
    () => [
      ...nuevas
        .filter((n) => !temporadaConNombre(guardadas, n))
        .map((n) => ({ clave: `nueva:${n}`, nombre: n, propia: true, vacia: true, pases: [], largo: 0, semanas: 0 })),
      ...guardadas,
    ],
    [nuevas, guardadas]
  );
  const tiras = useMemo(() => tirasDeLasTemporadas(guardadas), [guardadas]);
  const resumen = resumenDeLaLinea(lineaDeBloques(program, { opciones }), hoy);

  const abiertaClave = params.get('t');
  const abierta = guardadas.find((t) => t.clave === abiertaClave) || null;

  const vacia = sucesion.length === 0;
  if (vacia) {
    return (
      <div className="pases-pagina">
        <EmptyState
          icon={Layers}
          title="Sin bloques"
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

  const irA = (clave) => {
    const siguiente = new URLSearchParams(params);
    if (clave) siguiente.set('t', clave);
    else siguiente.delete('t');
    setParams(siguiente);
    setEntero(null);
    setEditando(false);
    setRenombrandoTemporada(false);
  };

  /* Mover a una temporada: a la guardada por su nombre, o a la del año
     (que es quitarle la carpeta). Soltar en una nueva la hace real. */
  const moverA = (id, t) => {
    if (!onPonerTemporada || !cabeEn(sucesion.find((p) => p.id === id), t)) return;
    if (t.propia) {
      onPonerTemporada([id], t.nombre);
      setNuevas((n) => n.filter((x) => x !== t.nombre));
    } else {
      onPonerTemporada([id], null);
    }
  };
  const renombrarTemporada = (t, nombre) => {
    if (t.vacia) {
      setNuevas((n) => n.map((x) => (x === t.nombre ? nombre : x)));
      return;
    }
    onPonerTemporada?.(
      t.pases.map((p) => p.id),
      nombre
    );
    /* La clave cambia con el nombre: si estaba abierta, se sigue en ella. */
    if (abierta?.clave === t.clave) {
      const siguiente = new URLSearchParams(params);
      siguiente.set('t', `t:${nombre.trim().replace(/\s+/g, ' ').toLowerCase()}`);
      setParams(siguiente, { replace: true });
    }
  };
  const quitarTemporada = (t) => {
    if (t.vacia) {
      setNuevas((n) => n.filter((x) => x !== t.nombre));
      return;
    }
    onQuitarTemporada?.(t);
    if (abierta?.clave === t.clave) irA(null);
  };

  const sePuedeQuitar = sucesion.filter((p) => p.tipo === 'bloque').length > 1;
  const manejadores = {
    onRellenarBorrador,
    onQuitarBorrador,
    onMoverBorrador,
    onRenombrarBloque,
    onMandarBloque,
    onGuardarBloque,
    onIntent,
    onQuitarBloque,
    moverA,
    renombrar: (b) => setRenombrando(b.id),
  };
  const acciones = (pase, aqui) =>
    accionesDelPase({ pase, temporadas, aqui, program, sePuedeQuitar, h: manejadores });
  const abrir = (pase) => (pase.tipo === 'borrador' ? onRellenarBorrador?.(pase.bloque) : onIrBloque?.(pase.bloque));
  const empezar = (pase) =>
    onEmpezarBorrador && pase.tipo === 'borrador' && sePuedeEmpezar(program, pase.id) ? (
      <button type="button" className="btn btn-sm pase-empezar" onClick={() => onEmpezarBorrador(pase.bloque)}>
        <Play size={13} aria-hidden="true" /> Empezar ahora
      </button>
    ) : null;
  const bloqueRenombrando = renombrando ? sucesion.find((p) => p.id === renombrando)?.bloque : null;

  const botonEditar = (
    <button
      type="button"
      className={`cab-accion is-puerta${editando ? ' is-hecho' : ''}`}
      onClick={() => {
        setEditando((e) => !e);
        if (editando) {
          setNuevas([]);
          setNombrando(false);
        }
      }}
    >
      {editando ? 'Hecho' : 'Editar'}
    </button>
  );

  /* ── Una temporada abierta ──────────────────────────────────────────────── */
  if (abierta) {
    const cascada = cascadaDeLaTemporada(abierta, entero);
    const previstos = borradoresDe(program);
    const otras = temporadas.filter((t) => t.clave !== abierta.clave);
    return (
      <div className="pases-pagina is-temporada">
        <nav className="pases-barra">
          <button type="button" className="pases-atras" onClick={() => irA(null)}>
            <ChevronLeft size={20} aria-hidden="true" /> Bloques
          </button>
          {onPonerTemporada && botonEditar}
        </nav>

        <header className="pases-cab">
          <div className="pases-cab-texto">
            <h2 className="pases-titulo">
              <Folder size={20} className="funda-icono" aria-hidden="true" />
              {renombrandoTemporada ? (
                <RenombrarEnSitio
                  value={abierta.nombre}
                  label="Nombre de la temporada"
                  seleccionado
                  onRename={(nombre) => renombrarTemporada(abierta, nombre)}
                  onDone={() => setRenombrandoTemporada(false)}
                />
              ) : (
                abierta.nombre
              )}
            </h2>
            <span className="pases-cab-dato">
              {rangoDeFechas(abierta.desde, abierta.hasta, { hoy })} · {cuenta(abierta.pases.length, 'bloque', 'bloques')} ·{' '}
              {cuenta(abierta.semanas, 'semana', 'semanas')}
            </span>
          </div>
        </header>

        {editando && (
          <div className="pases-edicion">
            <div className="pases-edicion-mandos">
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setRenombrandoTemporada(true)}>
                <Pencil size={13} aria-hidden="true" /> Renombrar la temporada
              </button>
              {abierta.propia && (
                <button type="button" className="btn btn-sm btn-secondary pases-peligro" onClick={() => quitarTemporada(abierta)}>
                  <Trash2 size={13} aria-hidden="true" /> Quitar la temporada
                </button>
              )}
            </div>
            {otras.length > 0 && (
              <div className="pases-destinos">
                <span className="pases-destinos-rotulo">Arrastra un bloque a otra temporada</span>
                <ul className="pases-destinos-lista">
                  {otras.map((t) => (
                    <li key={t.clave} className="pases-destino" {...alSoltar((id) => moverA(id, t))}>
                      <Folder size={13} aria-hidden="true" /> {t.nombre}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {bloqueRenombrando && (
          <Renombrando bloque={bloqueRenombrando} onRenombrar={onRenombrarBloque} onDone={() => setRenombrando(null)} />
        )}

        <ol className="cascada-de-pases" aria-label={`Bloques de ${abierta.nombre}, del más antiguo al más reciente`}>
          {cascada.map((pase) => {
            const i = previstos.findIndex((x) => x.id === pase.id);
            /* Soltar un previsto sobre otro lo pone en su sitio. */
            const soltar =
              editando && pase.tipo === 'borrador' && onMoverBorrador
                ? alSoltar((id) => {
                    if (id !== pase.id && previstos.some((x) => x.id === id)) onMoverBorrador(id, i);
                  })
                : {};
            return (
              <li key={pase.id} className={`cascada-hueco${pase.entero ? ' is-entero' : ''}`} {...soltar}>
                <PaseDeBloque
                  pase={pase}
                  program={program}
                  cliente={cliente}
                  variante="temporada"
                  entero={pase.entero}
                  hoy={hoy}
                  onAbrir={() => abrir(pase)}
                  onDesplegar={() => setEntero(pase.id)}
                  acciones={acciones(pase, abierta.clave)}
                  mando={empezar(pase)}
                  arrastre={editando ? arrastreDe(pase.id) : null}
                />
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  /* ── La portada ─────────────────────────────────────────────────────────── */
  const iActual = sucesion.findIndex((p) => p.abierto);
  const actual = iActual >= 0 ? sucesion[iActual] : sucesion.find((p) => p.tipo === 'borrador');
  const iDe = sucesion.indexOf(actual);
  const siguiente = sucesion[iDe + 1] || null;
  const clave = guardadas.find((t) => t.pases.includes(actual))?.clave;

  return (
    <div className="pases-pagina">
      <header className="pases-cab">
        <div className="pases-cab-texto">
          <h2 className="pases-titulo">Bloques</h2>
          <span className="pases-cab-dato">
            {cuenta(resumen.bloques, 'bloque', 'bloques')}
            {resumen.semanas !== null ? ` · ${cuenta(resumen.semanas, 'semana', 'semanas')}` : ''}
            {resumen.desde ? ` · desde el ${shortDate(resumen.desde)}` : ''}
          </span>
        </div>
        <div className="pases-cab-mandos">
          {accionPegar}
          {onPonerTemporada && botonEditar}
          <MenuAcciones
            clase="btn btn-icon pases-mas"
            ariaLabel="Nuevo"
            items={[
              onNuevoBloque && { icon: Plus, label: 'Nuevo bloque', run: onNuevoBloque },
              onPonerTemporada && {
                icon: Folder,
                label: 'Nueva temporada',
                run: () => {
                  setEditando(true);
                  setNombrando(true);
                },
              },
            ].filter(Boolean)}
            sinFlecha
            label={<Plus size={20} aria-hidden="true" />}
          />
        </div>
      </header>

      {bloqueRenombrando && (
        <Renombrando bloque={bloqueRenombrando} onRenombrar={onRenombrarBloque} onDone={() => setRenombrando(null)} />
      )}

      <div className="pases-portada">
        <section className="pases-hoy" aria-label="El bloque de ahora">
          {actual && (
            <PaseDeBloque
              pase={actual}
              program={program}
              cliente={cliente}
              variante="portada"
              semanaEnCurso={semanaEnCurso}
              siguiente={siguiente}
              hoy={hoy}
              onAbrir={() => abrir(actual)}
              acciones={acciones(actual, clave)}
              mando={empezar(actual)}
              arrastre={editando ? arrastreDe(actual.id) : null}
            />
          )}
        </section>

        <section className="pases-temporadas" aria-labelledby="pases-temporadas-rotulo">
          <h3 id="pases-temporadas-rotulo" className="pases-rotulo">
            Temporadas
          </h3>
          <ul className="fundas">
            {temporadas.map((t) => (
              <Funda
                key={t.clave}
                temporada={t}
                tira={tiras.get(t.clave)}
                editando={editando}
                hoy={hoy}
                onAbrir={() => irA(t.clave)}
                onRenombrar={renombrarTemporada}
                onQuitar={quitarTemporada}
                onSoltar={(id) => moverA(id, t)}
              />
            ))}
          </ul>
          {onPonerTemporada &&
            (nombrando ? (
              <div className="funda-nueva is-nombrando">
                <Folder size={15} aria-hidden="true" />
                <RenombrarEnSitio
                  value=""
                  label="Nombre de la temporada nueva"
                  min={18}
                  onRename={(nombre) => setNuevas((n) => [nombre, ...n.filter((x) => x !== nombre)])}
                  onDone={() => setNombrando(false)}
                />
              </div>
            ) : (
              <button
                type="button"
                className="funda-nueva"
                onClick={() => {
                  setEditando(true);
                  setNombrando(true);
                }}
              >
                <Plus size={15} aria-hidden="true" /> Nueva temporada
              </button>
            ))}
        </section>
      </div>
    </div>
  );
};
