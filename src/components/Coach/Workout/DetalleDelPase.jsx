import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { intentLabel, weekLabel } from '@/domain/blocks';
import { variacionDelCambio, variacionTexto } from '@/domain/rendimiento';
import { unitInitial } from '@/domain/training';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { rangoDeFechas, microcicloEnCurso, ResumenDelPase, semanasDelPase, trazoSuave, useCifrasDelPase } from './PaseDeBloque';
import { RendimientoDelBloque } from './RendimientoDelBloque';
import { BarraDeVolumen } from './VolumenPopup';

/**
 * EL PASE DESPLEGADO, al lado de la cascada (25 sep 2026).
 *
 * La temporada abierta es una vista dividida, como Mail o Notas en el iPad: a
 * la izquierda los pases en cascada compacta, a la derecha el elegido,
 * abierto, como un pase de Wallet dado la vuelta: arriba su cara —el fondo
 * del pase (`.fondo-de-pase`), con el nombre y las tres cifras— y debajo el
 * reverso, en la superficie de la app, con lo que no le cabe delante: la
 * semana del split, la curva del rendimiento y el reparto por grupo. El color
 * se queda en la cara para no competir con la cascada.
 *
 * Todo sale de ESE bloque (`cifrasDelPase`): un bloque viejo enseña sus
 * hojas y su split, no los de ahora.
 *
 * La cara se queda montada al cambiar de elegido, así que su tinta pasa de un
 * color a otro con un fundido; el reverso no cambia de aspecto, solo de datos.
 * Lo de dentro se vuelve a montar y aparece. Al llegar a la página no: la
 * pantalla ya tiene su entrada.
 */

/* ══ LA CURVA DEL RENDIMIENTO ══════════════════════════════════════════════
   El índice medio por microciclo con su área tenue y la raya de 100 a trazos.
   El eje va del M1 al último microciclo del bloque: lo que falta por hacer se
   queda vacío, con su sitio. La escala siempre incluye el 100, para que se lea
   contra dónde empezó. */

const ANCHO = 320;
const ALTO = 128;
const ARRIBA = 10;
const ABAJO = 22;
const IZQUIERDA = 4;
const DERECHA = 34;

const CurvaDelRendimiento = ({ puntos, microciclos }) => {
  const con = puntos.map((p, i) => ({ ...p, i })).filter((p) => p.indice !== null && p.indice !== undefined);
  const valores = [100, ...con.map((p) => p.indice)];
  const bruto = Math.max(...valores) - Math.min(...valores);
  const margen = Math.max(bruto * 0.18, 3);
  const min = Math.min(...valores) - margen;
  const max = Math.max(...valores) + margen;
  const total = Math.max(microciclos, puntos.length);
  const ultimo = Math.max(1, total - 1);
  const x = (i) => IZQUIERDA + (i / ultimo) * (ANCHO - IZQUIERDA - DERECHA);
  const y = (v) => ARRIBA + (1 - (v - min) / (max - min)) * (ALTO - ARRIBA - ABAJO);
  const xy = con.map((p) => [Math.round(x(p.i) * 10) / 10, y(p.indice)]);
  const linea = xy.length > 1 ? trazoSuave(xy) : null;
  const fin = con.at(-1);
  const base = ALTO - ABAJO;
  return (
    <svg
      className="detalle-curva"
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      role="img"
      aria-label={`Índice medio del rendimiento por microciclo: ${con.map((p) => Math.round(p.indice)).join(', ')}`}
    >
      <line className="detalle-curva-cien" x1={IZQUIERDA} x2={ANCHO - DERECHA} y1={y(100)} y2={y(100)} />
      <text className="detalle-curva-rotulo" x={ANCHO - DERECHA + 6} y={y(100) + 4}>
        100
      </text>
      {linea && (
        <>
          <path className="detalle-curva-area" d={`${linea} L${xy.at(-1)[0]},${base} L${xy[0][0]},${base} Z`} />
          <path className="detalle-curva-linea" d={linea} />
        </>
      )}
      <circle className="detalle-curva-punto" cx={xy.at(-1)[0]} cy={xy.at(-1)[1]} r="3.5" />
      {Math.round(fin.indice) !== 100 && (
        <text className="detalle-curva-fin" x={xy.at(-1)[0] + 8} y={xy.at(-1)[1] - 6}>
          {Math.round(fin.indice)}
        </text>
      )}
      <text className="detalle-curva-rotulo" x={IZQUIERDA} y={ALTO - 4}>
        M1
      </text>
      {total > 1 && (
        <text className="detalle-curva-rotulo" x={ANCHO - DERECHA} y={ALTO - 4} textAnchor="end">
          M{total}
        </text>
      )}
    </svg>
  );
};

/* ══ EL REPARTO POR GRUPO ══════════════════════════════════════════════════
   La barra de la tabla del volumen, con una escala común: el MRV cae en la
   misma vertical en todas las filas, así que una fila se compara con otra sin
   leer cifras. Lo que pasa del MRV llega hasta el canto. La barra va entera
   del color de su zona (`.detalle-pase .volumen-barra.is-…`). */

const MRV_EN = 0.8;

const Grupos = ({ grupos }) => {
  const tope = Math.max(1, ...grupos.map((g) => g.series));
  return (
    <>
      <ul className="detalle-grupos">
        {grupos.map((g) => (
          <li key={g.nombre} className="detalle-grupo" title={g.mev && g.mrv ? `MEV ${g.mev} · MRV ${g.mrv}` : undefined}>
            <span className="detalle-grupo-nombre">{g.nombre}</span>
            <BarraDeVolumen
              total={g.series}
              mev={g.mev}
              mrv={g.mrv}
              escala={g.mrv ? g.mrv / MRV_EN : tope / MRV_EN}
              conMrv
              pintada={false}
            />
            <span className="detalle-grupo-cifra">{String(g.series).replace('.', ',')}</span>
          </li>
        ))}
      </ul>
      <ul className="detalle-tintas" aria-label="Tintas de las barras">
        <li>
          <i className="is-bajo" aria-hidden="true" /> bajo el MEV
        </li>
        <li>
          <i className="is-en-rango" aria-hidden="true" /> en rango
        </li>
        <li>
          <i className="is-sobre" aria-hidden="true" /> sobre el MRV
        </li>
      </ul>
    </>
  );
};

/* ══ LAS TRES CIFRAS ═══════════════════════════════════════════════════════
   Por dónde va (el abierto: «3 de 10» microciclos; los demás, sus semanas),
   el rendimiento y lo que se hizo de lo pautado. En un previsto, las dos
   últimas no han pasado: «—». */

const Cifra = ({ valor, de = null, rotulo }) => (
  <div className="detalle-cifra">
    <dt>{rotulo}</dt>
    <dd>
      {valor}
      {de ? <small> de {de}</small> : null}
    </dd>
  </div>
);

/* ══ EL PASE ════════════════════════════════════════════════════════════════ */

const estadoDe = (pase) => (pase.tipo === 'borrador' ? 'Previsto' : pase.abierto ? 'Ahora' : 'Cerrado');

export const DetalleDelPase = ({ pase, volver = null, program, cliente, hoy, semanaEnCurso, onAbrir, acciones = [], mando = null }) => {
  const [primero] = useState(pase.id);
  const [cambiado, setCambiado] = useState(false);
  if (!cambiado && pase.id !== primero) setCambiado(true);
  const [rendimiento, setRendimiento] = useState(false);
  const cifras = useCifrasDelPase(pase, program, cliente);
  const b = pase.bloque;
  const previsto = pase.tipo === 'borrador';
  const intencion = intentLabel(pase.intent);
  const semanas = semanasDelPase(pase);
  const linea = [rangoDeFechas(pase.desde, pase.hasta, { hoy }), cifras.split].filter(Boolean).join(' · ');
  const pct = cifras.pct === null ? null : variacionTexto(cifras.pct / 100);
  const conCurva = cifras.curva.some((p) => p.indice !== null && p.indice !== undefined);
  const va = pase.abierto ? microcicloEnCurso(program, b, semanaEnCurso) : null;
  const etiqueta = (w) => weekLabel(program, w, unitInitial(cliente?.cycleType || 'weekly'));

  const entra = cambiado ? ' is-entrando' : '';

  return (
    <>
      {volver}
      <article className="detalle-pase" style={{ '--detalle-tinta': pase.color }} aria-label={b.name}>
        <div
          className={`detalle-cara fondo-de-pase${previsto ? ' is-previsto' : ''}`}
          style={{ '--pase-tinta': pase.color }}
          data-intent={pase.intent || undefined}
        >
          <div key={pase.id} className={`detalle-contenido${entra}`}>
            <header className="detalle-cab">
              <div className="detalle-quien">
                <span className="detalle-ante">{[intencion, estadoDe(pase)].filter(Boolean).join(' · ')}</span>
                <h3 className="detalle-nombre">{b.name}</h3>
                {linea && <span className="detalle-linea">{linea}</span>}
              </div>
              <ResumenDelPase pase={pase} series={cifras.series}>
                <div className="detalle-mandos">
                  {mando}
                  <button type="button" className="detalle-abrir" onClick={() => onAbrir(b)}>
                    Abrir bloque <ChevronRight size={15} aria-hidden="true" />
                  </button>
                  {acciones.length > 0 && (
                    <MenuAcciones clase="btn btn-icon btn-icon-compact pase-menu" ariaLabel={`Acciones de ${b.name}`} items={acciones} />
                  )}
                </div>
              </ResumenDelPase>
            </header>

            <dl className="detalle-cifras">
              {va ? (
                <Cifra valor={va} de={pase.largo > 0 && b.plannedWeeks ? pase.largo : null} rotulo="microciclos" />
              ) : (
                <Cifra valor={semanas || '—'} rotulo={semanas === 1 ? 'semana' : 'semanas'} />
              )}
              <Cifra valor={pct || '—'} rotulo="rendimiento" />
              <Cifra valor={cifras.adherencia === null ? '—' : `${cifras.adherencia} %`} rotulo="de lo pautado" />
            </dl>
          </div>
        </div>

        <div key={pase.id} className={`detalle-reverso detalle-contenido${entra}`}>
          {cifras.semana.length > 0 && (
            <section className="detalle-seccion" aria-labelledby={`split-${b.id}`}>
              <h4 id={`split-${b.id}`} className="detalle-rotulo">
                Split
              </h4>
              <ol className={`detalle-semana${cifras.semana.length === 7 ? '' : ' is-vuelta'}`} style={{ '--dias': cifras.semana.length }}>
                {cifras.semana.map((d) => (
                  <li key={d.dia} className={`detalle-dia${d.hoja ? '' : ' is-descanso'}`} aria-label={`${d.dia}: ${d.hoja || 'descanso'}`}>
                    <span className="detalle-dia-rotulo" aria-hidden="true">
                      {d.rotulo}
                    </span>
                    <span className="detalle-dia-hoja" aria-hidden="true" title={d.hoja || undefined}>
                      {d.hoja || 'Descanso'}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <div className="detalle-seccion detalle-columnas">
            <section className="detalle-columna" aria-labelledby={`rend-${b.id}`}>
              <h4 id={`rend-${b.id}`} className="detalle-rotulo">
                Rendimiento por microciclo
              </h4>
              {conCurva ? (
                <CurvaDelRendimiento puntos={cifras.curva} microciclos={pase.largo || 0} />
              ) : (
                <p className="detalle-vacio">Sin registros todavía.</p>
              )}
              {!previsto && (
                <ul className="detalle-extremos">
                  {cifras.sube && (
                    <li>
                      <span className="detalle-extremo-que">Más sube</span>
                      <span className="detalle-ejercicio">{cifras.sube.nombre}</span>
                      <b>{variacionDelCambio(cifras.sube.cambio)}</b>
                    </li>
                  )}
                  {cifras.baja && (
                    <li>
                      <span className="detalle-extremo-que">Menos</span>
                      <span className="detalle-ejercicio">{cifras.baja.nombre}</span>
                      <b>{variacionDelCambio(cifras.baja.cambio)}</b>
                    </li>
                  )}
                  <li className="detalle-ver">
                    <button type="button" className="detalle-ver-boton" onClick={() => setRendimiento(true)}>
                      Ver rendimiento del bloque <ChevronRight size={15} aria-hidden="true" />
                    </button>
                  </li>
                </ul>
              )}
            </section>

            <section className="detalle-columna" aria-labelledby={`grupos-${b.id}`}>
              <h4 id={`grupos-${b.id}`} className="detalle-rotulo">
                Series por semana
                <span className="detalle-leyenda" aria-hidden="true">
                  <span>
                    <i className="is-mev" />
                    MEV
                  </span>
                  <span>
                    <i className="is-mrv" />
                    MRV
                  </span>
                </span>
              </h4>
              {cifras.grupos.length > 0 ? <Grupos grupos={cifras.grupos} /> : <p className="detalle-vacio">Sin ejercicios todavía.</p>}
            </section>
          </div>
        </div>
      </article>
      {rendimiento && <RendimientoDelBloque open onClose={() => setRendimiento(false)} program={program} bloque={b} etiqueta={etiqueta} />}
    </>
  );
};
