import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { WEEKDAYS, kindMeta } from '@/domain/calendar';
import { mergeCatalog } from '@/domain/catalog';
import { menu, parcheDeAlimento } from '@/domain/menu';
import { buildMeal, planDays } from '@/domain/nutrition';
import {
  MAX_DIAS_POR_DIA,
  NOMBRE_DE_VARIACION,
  cambioDeLaBase,
  choqueDeVariacion,
  conFechas,
  conMenuCambiado,
  conMenuDeLaBase,
  conMismoMenu,
  cuantosDias,
  escalonar,
  filaDelFormulario,
  finDeVariacion,
  formularioDe,
  formularioNuevo,
  fotoDelDia,
  kcalDeFila,
  partiendoDe,
  problemaDelFormulario,
} from '@/domain/variaciones';
import { addDays, localeNumber, shortDate } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { BotonAccion, Notice, SegmentedControl, useAccionDeBoton } from '@/components/ui/primitives';
import { BotonMas } from '@/components/ui/BotonMas';
import { useToast } from '@/components/ui/ToastProvider';
import { MealCard } from './MealCard';

/** «sáb 10». */
const diaCorto = (fecha) =>
  `${WEEKDAYS[(new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7].toLowerCase()} ${Number(fecha.slice(8, 10))}`;

/** «10 – 12 oct» o «10 oct». */
export const tramoDeVariacion = (desde, hasta) =>
  !hasta || hasta === desde
    ? shortDate(desde)
    : desde.slice(0, 7) === hasta.slice(0, 7)
      ? `${Number(desde.slice(8, 10))} – ${shortDate(hasta)}`
      : `${shortDate(desde)} – ${shortDate(hasta)}`;

/** «Refeed del 10 – 12 oct». */
const nombreConFechas = (e) => `${NOMBRE_DE_VARIACION[e.kind] || e.title} del ${tramoDeVariacion(e.date, finDeVariacion(e))}`;

/** «La dieta base cambió el 2 oct; revisa si la pauta sigue teniendo sentido». */
export const avisoDeLaBase = (cambio, parteDe) =>
  cambio
    ? `La dieta base cambió el ${shortDate(cambio.fecha)}${
        cambio.sinElDia && parteDe?.nombre ? ` (ya no tiene «${parteDe.nombre}»)` : ''
      }; revisa si la pauta sigue teniendo sentido.`
    : null;

const MACROS_DE_FILA = [
  { k: 'proteina', label: 'Proteína', corto: 'P' },
  { k: 'carbohidratos', label: 'Carbos', corto: 'C' },
  { k: 'grasa', label: 'Grasas', corto: 'G' },
];

/** Una casilla de gramos o kcal. */
const Cifra = ({ valor, onCambio, etiqueta, sufijo }) => (
  <label className="var-cifra">
    <span className="var-cifra-k">{etiqueta}</span>
    <span className="var-cifra-caja">
      <input className="input tnum" inputMode="numeric" value={valor} onChange={(e) => onCambio(e.target.value.replace(/[^\d]/g, ''))} />
      <span className="var-cifra-u">{sufijo}</span>
    </span>
  </label>
);

/** Las cifras de un día: tres macros y sus kcal, o las kcal a secas. */
const FilaDeCifras = ({ fila, unidad, onCambio }) => {
  const kcal = kcalDeFila(fila, unidad);
  return unidad === 'macros' ? (
    <div className="var-cifras">
      {MACROS_DE_FILA.map((m) => (
        <Cifra key={m.k} etiqueta={m.label} sufijo="g" valor={fila[m.k]} onCambio={(v) => onCambio({ ...fila, [m.k]: v })} />
      ))}
      <p className="var-cifra is-cuenta">
        <span className="var-cifra-k">Kcal</span>
        <b className="tnum">{kcal ? localeNumber(kcal) : '—'}</b>
      </p>
    </div>
  ) : (
    <div className="var-cifras">
      <Cifra etiqueta="Kcal" sufijo="kcal" valor={fila.kcal} onCambio={(v) => onCambio({ ...fila, kcal: v })} />
    </div>
  );
};

/** «Por día»: una fila por día, cada una editable. */
const TablaPorDia = ({ f, onCambio }) => (
  <div className={`var-tabla${f.unidad === 'kcal' ? ' is-kcal' : ''}`} role="table" aria-label="La pauta de cada día">
    <div className="var-tabla-fila is-cab" role="row">
      <span role="columnheader">Día</span>
      {f.unidad === 'macros' ? (
        <>
          {MACROS_DE_FILA.map((m) => (
            <span key={m.k} role="columnheader" title={m.label}>
              {m.corto}, g
            </span>
          ))}
          <span role="columnheader">Kcal</span>
        </>
      ) : (
        <span role="columnheader">Kcal</span>
      )}
    </div>
    {f.dias.map((fila, i) => {
      const fecha = addDays(f.desde, i);
      const cambia = (campo) => (e) => {
        const dias = f.dias.map((d, j) => (j === i ? { ...d, [campo]: e.target.value.replace(/[^\d]/g, '') } : d));
        onCambio({ ...f, dias });
      };
      const kcal = kcalDeFila(fila, f.unidad);
      return (
        <div key={fecha} className="var-tabla-fila" role="row">
          <span role="rowheader" className="var-tabla-dia">
            {diaCorto(fecha)}
          </span>
          {f.unidad === 'macros' ? (
            <>
              {MACROS_DE_FILA.map((m) => (
                <input
                  key={m.k}
                  role="cell"
                  className="input tnum"
                  inputMode="numeric"
                  aria-label={`${m.label}, ${diaCorto(fecha)}`}
                  value={fila[m.k]}
                  onChange={cambia(m.k)}
                />
              ))}
              <span role="cell" className="var-tabla-kcal tnum">
                {kcal ? localeNumber(kcal) : '—'}
              </span>
            </>
          ) : (
            <input role="cell" className="input tnum" inputMode="numeric" aria-label={`Kcal, ${diaCorto(fecha)}`} value={fila.kcal} onChange={cambia('kcal')} />
          )}
        </div>
      );
    })}
  </div>
);

/**
 * EL MENÚ DE LA VARIACIÓN: uno por día. Con «el mismo menú todos los días»,
 * se edita uno y vale para todos; sin él, una pestaña por día. Las comidas son
 * las de la dieta (`MealCard`), editadas en memoria hasta «Guardar».
 */
const MenuDeLaVariacion = ({ f, onCambio, alimentos, catalogFoods, coachId, onAlimentoNuevo }) => {
  const [diaVisto, setDiaVisto] = useState(0);
  const n = f.menus.length;
  const i = Math.min(diaVisto, Math.max(0, n - 1));
  const meals = f.menus[i] || [];
  const cambia = (cambio) => onCambio(conMenuCambiado(f, i, cambio));
  const variosDias = n > 1;

  return (
    <div className="var-menu">
      {variosDias && (
        <label className="var-check">
          <input type="checkbox" checked={f.mismoMenu} onChange={(e) => onCambio(conMismoMenu(f, e.target.checked, i))} />
          Usar el mismo menú todos los días
        </label>
      )}
      {variosDias && !f.mismoMenu && (
        <div className="var-menu-dias rail-wrap" role="group" aria-label="El menú de qué día">
          {f.menus.map((m, j) => {
            const fecha = addDays(f.desde, j);
            return (
              <button key={fecha} type="button" className="chip" aria-pressed={j === i} onClick={() => setDiaVisto(j)}>
                {diaCorto(fecha)}
                {!m?.length && <span className="var-menu-sin"> · sin menú</span>}
              </button>
            );
          })}
        </div>
      )}
      {meals.length === 0 ? (
        <p className="var-nada">Sin menú este día: verá sus cifras y la indicación.</p>
      ) : (
        <div className="var-menu-comidas">
          {meals.map((meal, mi) => (
            <MealCard
              key={meal.id}
              meal={meal}
              editable
              firstMeal={mi === 0}
              lastMeal={mi === meals.length - 1}
              foodLibrary={alimentos}
              catalogFoods={catalogFoods}
              coachId={coachId}
              onRenameMeal={(name) => cambia((ms) => menu.renombrarComida(ms, mi, name))}
              onNote={(note) => cambia((ms) => menu.notaDeComida(ms, mi, note))}
              onRemoveMeal={() => cambia((ms) => menu.quitarComida(ms, mi))}
              onMoveMeal={(delta) => cambia((ms) => menu.moverComida(ms, mi, mi + delta))}
              onAddOption={() => cambia((ms) => menu.anadirOpcion(ms, mi))}
              onRemoveOption={(oi) => cambia((ms) => menu.quitarOpcion(ms, mi, oi))}
              onRenameOption={(oi, name) => cambia((ms) => menu.renombrarOpcion(ms, mi, oi, name))}
              onAddFood={(oi, food) => {
                onAlimentoNuevo(food);
                cambia((ms) => menu.anadirAlimento(ms, mi, oi, food));
              }}
              onRemoveFood={(oi, foodId) => cambia((ms) => menu.quitarAlimento(ms, mi, oi, foodId))}
              onGrams={(oi, foodId, grams) => cambia((ms) => menu.cambiarAlimento(ms, mi, oi, foodId, parcheDeAlimento.gramos(grams)))}
              onSetDisplay={(oi, foodId, mode) => cambia((ms) => menu.cambiarAlimento(ms, mi, oi, foodId, parcheDeAlimento.mostrarComo(mode)))}
              onMoveFood={(oi, de, a) => cambia((ms) => menu.moverAlimento(ms, mi, oi, de, a))}
            />
          ))}
        </div>
      )}
      <div className="var-menu-pie">
        <BotonMas palabra="comida" onClick={() => cambia((ms) => menu.anadirComida(ms, { ...buildMeal(), name: `Comida ${ms.length + 1}` }))} />
        <button type="button" className="tl-ins-enlace" onClick={() => onCambio({ ...f, conMenu: false, menus: [] })}>
          Quitar el menú
        </button>
      </div>
    </div>
  );
};

/** Un plegable: se abre con su título y enseña lo escrito si lo hay. */
export const Plegable = ({ titulo, pista, abierto, onAbrir, children }) => (
  <div className={`var-pliegue${abierto ? ' is-abierto' : ''}`}>
    <button type="button" className="var-pliegue-cab" aria-expanded={abierto} onClick={onAbrir}>
      <ChevronRight size={14} aria-hidden="true" className="var-pliegue-flecha" />
      <span>{titulo}</span>
      {!abierto && pista && <span className="var-pliegue-pista">{pista}</span>}
    </button>
    {abierto && <div className="var-pliegue-cuerpo">{children}</div>}
  </div>
);

/**
 * EL FORMULARIO DE UNA VARIACIÓN (26 sep 2026). UNA pieza, se abra desde la
 * Dieta, el Calendario, la ruta, la ficha de una semana o la tarjeta de
 * impacto: lo que cambia es con qué llega puesto.
 */
const FormularioDeVariacion = ({ f, onCambio, plan, choque, aviso, alimentos, catalogFoods, coachId, onAlimentoNuevo }) => {
  const [plegados, setPlegados] = useState({ nota: Boolean(f.nota), motivo: Boolean(f.motivo) });
  const n = cuantosDias(f.desde, f.hasta);
  const tipos = planDays(plan);
  const porDiaPosible = n >= 2 && n <= MAX_DIAS_POR_DIA;

  return (
    <div className="var-form">
      {aviso && <Notice tone="info">{aviso}</Notice>}

      <SegmentedControl
        label="Qué es"
        value={f.kind}
        onChange={(kind) => onCambio({ ...f, kind })}
        options={[
          { id: 'refeed', label: 'Refeed' },
          { id: 'diet_break', label: 'Diet break' },
        ]}
      />

      <fieldset className="var-seccion">
        <legend className="section-label">Días</legend>
        <div className="var-fechas">
          <label className="var-fecha">
            <span className="var-cifra-k">Desde</span>
            <input type="date" className="input" value={f.desde} onChange={(e) => onCambio(conFechas(f, { desde: e.target.value, hasta: f.hasta < e.target.value ? e.target.value : f.hasta }))} />
          </label>
          <label className="var-fecha">
            <span className="var-cifra-k">Hasta</span>
            <input type="date" className="input" value={f.hasta} min={f.desde || undefined} onChange={(e) => onCambio(conFechas(f, { hasta: e.target.value }))} />
          </label>
          <p className="var-fechas-dice tnum">{n > 0 ? (n === 1 ? 'Un día' : `${n} días`) : ''}</p>
        </div>
        {choque && (
          <p className="var-choque" role="alert">
            Choca con el {nombreConFechas(choque).replace(/^./, (c) => c.toLowerCase())}. Dos variaciones no pueden cubrir el mismo día.
          </p>
        )}
      </fieldset>

      {tipos.length > 0 && (
        <fieldset className="var-seccion">
          <legend className="section-label">Parte de</legend>
          <div className="rail-wrap" role="group" aria-label="El tipo de día del que copia las cifras">
            {tipos.map((d) => {
              const k = fotoDelDia(plan, d.id)?.kcal;
              return (
                <button key={d.id} type="button" className="chip" aria-pressed={f.parteDe?.diaId === d.id} onClick={() => onCambio(partiendoDe(f, plan, d.id))}>
                  {d.name}
                  {k ? <span className="var-chip-k tnum"> {localeNumber(k)}</span> : null}
                </button>
              );
            })}
          </div>
          <p className="var-nada">Copia sus cifras ahora. Si la dieta base cambia después, esta variación se queda como está.</p>
        </fieldset>
      )}

      <fieldset className="var-seccion">
        <legend className="section-label">Pauta</legend>
        <div className="var-mandos">
          <SegmentedControl
            label="Cómo se reparte"
            value={f.modo}
            onChange={(modo) => onCambio({ ...f, modo })}
            options={[
              { id: 'igual', label: 'Igual cada día' },
              { id: 'dias', label: 'Por día', disabled: !porDiaPosible, hint: porDiaPosible ? undefined : `De 2 a ${MAX_DIAS_POR_DIA} días` },
            ]}
          />
          <SegmentedControl
            label="En qué se pauta"
            value={f.unidad}
            onChange={(unidad) => onCambio({ ...f, unidad })}
            options={[
              { id: 'macros', label: 'Macros' },
              { id: 'kcal', label: 'Kcal' },
            ]}
          />
        </div>
        {f.modo === 'dias' && porDiaPosible ? (
          <>
            <TablaPorDia f={f} onCambio={onCambio} />
            {n >= 3 && (
              <button type="button" className="tl-ins-enlace var-escalonar" onClick={() => onCambio(escalonar(f))}>
                Escalonar del primer día al último
              </button>
            )}
          </>
        ) : (
          <FilaDeCifras fila={f.igual} unidad={f.unidad} onCambio={(igual) => onCambio({ ...f, igual, dias: f.dias.map(() => ({ ...igual })) })} />
        )}
      </fieldset>

      <fieldset className="var-seccion">
        <legend className="section-label">Menú</legend>
        {f.conMenu ? (
          <MenuDeLaVariacion
            f={f}
            onCambio={onCambio}
            alimentos={alimentos}
            catalogFoods={catalogFoods}
            coachId={coachId}
            onAlimentoNuevo={onAlimentoNuevo}
          />
        ) : (
          <div className="var-sin-menu">
            <p className="var-nada">Sin menú: verá las cifras de cada día y la indicación.</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={n > MAX_DIAS_POR_DIA}
              title={n > MAX_DIAS_POR_DIA ? `Con menú llega hasta ${MAX_DIAS_POR_DIA} días` : undefined}
              onClick={() => onCambio({ ...conMenuDeLaBase(f, plan), mismoMenu: f.modo !== 'dias' })}
            >
              Añadir menú
            </button>
          </div>
        )}
      </fieldset>

      <Plegable
        titulo="Indicación para el cliente"
        pista={f.nota || 'La ve en su dieta esos días'}
        abierto={plegados.nota}
        onAbrir={() => setPlegados((p) => ({ ...p, nota: !p.nota }))}
      >
        <textarea
          className="input textarea"
          rows={2}
          maxLength={280}
          placeholder="Mete los carbos alrededor del entreno."
          aria-label="Indicación para el cliente"
          value={f.nota}
          onChange={(e) => onCambio({ ...f, nota: e.target.value })}
        />
      </Plegable>
      <Plegable
        titulo="Motivo (solo tú)"
        pista={f.motivo || 'Por qué lo haces'}
        abierto={plegados.motivo}
        onAbrir={() => setPlegados((p) => ({ ...p, motivo: !p.motivo }))}
      >
        <textarea
          className="input textarea"
          rows={2}
          maxLength={280}
          placeholder="Por qué lo haces. Solo lo ves tú."
          aria-label="Motivo, solo lo ves tú"
          value={f.motivo}
          onChange={(e) => onCambio({ ...f, motivo: e.target.value })}
        />
      </Plegable>
    </div>
  );
};

/**
 * LA VENTANA DE UNA VARIACIÓN: nueva o para cambiarla, con guardar, borrar y
 * su «Deshacer». Es lo único que escribe variaciones desde la Dieta y la
 * Temporada.
 *
 * @param inicial `{ evento }` para cambiar una, o `{ kind, desde, hasta,
 *                diaId }` para una nueva con las fechas puestas.
 */
export const VentanaDeVariacion = ({ inicial, onCerrar }) => {
  const {
    session,
    activeClient,
    nutrition,
    hechos,
    dietVersions,
    notasDeIntervencion,
    foodLibrary,
    catalogFoods,
    upsertLibraryFood,
    anadirHecho,
    editarHecho,
    quitarHecho,
    devolverHecho,
    guardarIntervencion,
  } = useApp();
  const toast = useToast();
  const cid = activeClient?.id;
  const plan = nutrition?.[cid];
  const evento = inicial?.evento || null;
  const motivoAntes = evento ? notasDeIntervencion.find((c) => c.eventId === evento.id)?.motivo || '' : '';
  const [f, setF] = useState(() =>
    evento
      ? formularioDe(evento, motivoAntes)
      : formularioNuevo({ plan, kind: inicial?.kind || 'refeed', desde: inicial?.desde, hasta: inicial?.hasta, diaId: inicial?.diaId })
  );
  const [error, setError] = useState('');
  const envio = useAccionDeBoton();
  const alimentos = useMemo(() => mergeCatalog(foodLibrary, catalogFoods), [foodLibrary, catalogFoods]);

  const choque = choqueDeVariacion(hechos, { desde: f.desde, hasta: f.hasta, id: f.id });
  const aviso = evento ? avisoDeLaBase(cambioDeLaBase(evento, dietVersions), evento.parteDe) : null;
  const nombre = NOMBRE_DE_VARIACION[f.kind];

  const guardar = async () => {
    setError('');
    const problema = problemaDelFormulario(f);
    if (problema || choque) {
      setError(problema || '');
      return false;
    }
    const fila = filaDelFormulario(f);
    const tramo = tramoDeVariacion(fila.date, fila.hasta || fila.date);
    const motivo = f.motivo.trim();
    if (evento) {
      const r = await editarHecho(evento.id, fila);
      if (!r.ok) {
        setError(r.error);
        return false;
      }
      const otroMotivo = motivo !== motivoAntes.trim();
      if (otroMotivo) await guardarIntervencion(cid, { eventId: evento.id }, { motivo });
      onCerrar();
      toast({
        text: `${nombre} del ${tramo} guardado.`,
        action: {
          label: 'Deshacer',
          onClick: async () => {
            await editarHecho(evento.id, r.antes || evento);
            if (otroMotivo) await guardarIntervencion(cid, { eventId: evento.id }, { motivo: motivoAntes });
          },
        },
      });
      return true;
    }
    const r = await anadirHecho(cid, fila);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    if (motivo) await guardarIntervencion(cid, { eventId: r.hecho.id }, { motivo });
    onCerrar();
    toast({
      text: `${nombre} del ${tramo} añadido.`,
      action: { label: 'Deshacer', onClick: () => quitarHecho(r.hecho.id) },
    });
    return true;
  };

  const borrar = async () => {
    const r = await quitarHecho(evento.id);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onCerrar();
    toast({
      text: `${nombreConFechas(evento)} borrado.`,
      action: { label: 'Deshacer', onClick: () => devolverHecho(r.copia) },
    });
  };

  return (
    <Modal
      open
      size="lg"
      title={evento ? `${nombre} del ${tramoDeVariacion(evento.date, finDeVariacion(evento))}` : `Nuevo ${nombre.toLowerCase()}`}
      sub="Una variación de su dieta en unos días concretos. La dieta base no cambia y vuelve sola después."
      onClose={onCerrar}
      footer={
        <div className="var-pie">
          {evento && (
            <button type="button" className="btn btn-danger" onClick={borrar}>
              Borrar
            </button>
          )}
          <span className="grow" />
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>
            Cancelar
          </button>
          <BotonAccion
            className="btn btn-primary"
            estado={envio.estado}
            disabled={Boolean(choque)}
            onClick={() => envio.lanzar(guardar)}
          >
            {evento ? 'Guardar cambios' : `Añadir ${nombre.toLowerCase()}`}
          </BotonAccion>
        </div>
      }
    >
      <div className="var-ventana" style={{ '--tinta': kindMeta(f.kind).color }}>
        <FormularioDeVariacion
          f={f}
          onCambio={(x) => {
            setError('');
            setF(x);
          }}
          plan={plan}
          choque={choque}
          aviso={aviso}
          alimentos={alimentos}
          catalogFoods={catalogFoods}
          coachId={session?.user?.id || null}
          onAlimentoNuevo={(food) => upsertLibraryFood?.(food)}
        />
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
};
