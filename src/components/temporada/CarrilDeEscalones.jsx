import { useId } from 'react';

import { addDays } from '@/lib/dates';
import { anchoTexto } from './escalaDeTiempo';
import { cabeEn } from './escalones';
import { entero } from './lectura';

const f1 = (n) => Math.round(n * 10) / 10;
const op = (v) => f1(v * 100) / 100;

/** El sitio del número encima del escalón más alto y lo de debajo del suelo. */
export const ARRIBA_ESCALONES = 16;
const ABAJO = 2;
export const altoDeEscalones = (area) => ARRIBA_ESCALONES + area + ABAJO;

const texto = (opciones, ancho) => opciones.find((t) => t && cabeEn(t, ancho)) ?? null;

/**
 * Los caminos de un área en escalón: la línea de borde y el relleno hasta el
 * suelo. Los tramos seguidos van en un mismo camino; donde falta un día, el
 * área se corta (no se inventa lo que no se pautó).
 *
 * @param tramos ordenados, `{ desde, hasta, valor }`.
 */
const caminos = (tramos, X, Y, suelo) => {
  const corridas = [];
  for (const t of tramos) {
    const ultima = corridas[corridas.length - 1];
    if (ultima && addDays(ultima[ultima.length - 1].hasta, 1) === t.desde) ultima.push(t);
    else corridas.push([t]);
  }
  let linea = '';
  let relleno = '';
  for (const c of corridas) {
    const x0 = f1(X(c[0].desde));
    let d = `M${x0},${Y(c[0].valor)}`;
    for (const [i, t] of c.entries()) {
      if (i > 0) d += `V${Y(t.valor)}`;
      d += `H${f1(X(addDays(t.hasta, 1)))}`;
    }
    linea += d;
    relleno += `${d}V${suelo}H${x0}Z`;
  }
  return { linea, relleno };
};

/**
 * UN CARRIL DE ESCALONES: kcal o pasos (`escalones.js`).
 *
 * Un área continua: la línea de borde y un relleno suave debajo. Dos capas que
 * se funden al acercar: los escalones de cada semana (Temporada) y los de
 * cada día (Rango y Semana). El refeed es un pico dentro de la misma área, en
 * su tinta. Lo que aún no ha llegado, más lavado.
 *
 * Los números van en cada escalón, pegados a la línea y a la izquierda del
 * tramo que empieza: los de cada día si caben; si no, el de cada semana a la
 * altura de su valor base.
 *
 * Qué es lo dice el nombre de su fila; `rotulo`, si se pasa, lo escribe
 * arriba a la derecha. El detalle de cada día lo dan el cursor y la hoja.
 *
 * @param escalaY  `escalaVertical`.
 * @param area     lo alto del área (sin el sitio del número).
 * @param capas    la opacidad de cada capa: `{ semanas, dias, numSemanas, numDias }`.
 */
export const CarrilDeEscalones = ({
  escala,
  escalaY,
  area,
  color,
  semanales = [],
  diarias = [],
  numSemanas = [],
  numDias = [],
  capas,
  hoy,
  rotulo = null,
}) => {
  const id = useId().replace(/:/g, '');
  if (!escalaY) return null;
  const W = escala.ancho;
  const alto = altoDeEscalones(area);
  const suelo = ARRIBA_ESCALONES + area;
  const Y = (v) => f1(suelo - escalaY.fraccion(v) * area);
  const X = (fecha) => Math.max(-4, Math.min(W + 4, escala.x(fecha)));
  /* Lo que viene, desde mañana: más lavado. */
  const corte = f1(Math.max(0, Math.min(W, escala.x(addDays(hoy, 1)))));

  const vistos = (xs) => xs.filter((t) => escala.toca(t.desde, t.hasta));
  /* El rótulo del carril, arriba a la derecha: los números no se le meten. */
  const anchoRotulo = rotulo ? anchoTexto(rotulo, 5.6) + 8 : 0;

  /* Un área entera: el relleno y la línea, partidos en lo pasado y lo que viene. */
  const areaDe = (tramos, clave) => {
    const { linea, relleno } = caminos(tramos, X, Y, suelo);
    if (!linea) return null;
    return (
      <g key={clave}>
        <g clipPath={`url(#${id}-antes)`}>
          <path className="tl-escalon-relleno" d={relleno} fill={color} />
          <path className="tl-escalon-linea" d={linea} stroke={color} />
        </g>
        <g clipPath={`url(#${id}-despues)`} className="is-futuro">
          <path className="tl-escalon-relleno" d={relleno} fill={color} />
          <path className="tl-escalon-linea" d={linea} stroke={color} />
        </g>
      </g>
    );
  };

  /* El pico de un refeed, del suelo a su cifra y en su tinta. */
  const pico = (desde, hasta, valor, tinta, clave) => {
    const xa = X(desde);
    const xb = Math.max(xa + 2, X(addDays(hasta, 1)));
    const y = Y(valor);
    return (
      <g key={clave} className="tl-escalon-pico">
        <rect x={f1(xa)} y={y} width={f1(xb - xa)} height={f1(suelo - y)} fill={tinta} />
        <line x1={f1(xa)} x2={f1(xb)} y1={y} y2={y} stroke={tinta} />
      </g>
    );
  };

  const semanas = capas.semanas > 0.02 ? vistos(semanales) : [];
  const dias = capas.dias > 0.02 ? vistos(diarias) : [];

  /* Los picos de la capa de semanas: cada refeed, en sus días, con su cifra
     encima y en su tinta si cabe sin pisar la de al lado. */
  const conPico = semanas.flatMap((t) =>
    (t.eventos || []).filter(() => typeof t.marca?.valor === 'number' && t.marca.valor > t.valor).map((e) => ({ t, e }))
  );
  const picosSemanales = conPico.map(({ t, e }) => pico(e.date, e.hasta || e.date, t.marca.valor, t.marca.color, `${t.clave}-${e.id ?? e.date}`));
  /* Lo ya escrito en la capa de semanas: la cifra de un pico no lo pisa. */
  const puestas = [];
  /* ── Los números, en cada escalón ── */
  const numero = (n, y, ocupa = null) => {
    const x = Math.max(0, escala.x(n.desde)) + 2;
    const y0 = y - 4;
    const hasta = Math.min(y0 < 13 ? W - anchoRotulo : W, n.siguiente ? escala.x(n.siguiente) : W);
    const t = texto(n.opciones, hasta - x - 1);
    if (!t) return null;
    if (ocupa) ocupa.push({ a: x, b: x + anchoTexto(t, 6.2), y: y0 });
    return (
      <text key={n.clave} className={`tl-escalon-numero${n.eventos ? ' is-intervencion' : ''}`} x={f1(x)} y={f1(y0)}>
        {t}
      </text>
    );
  };
  /* En la temporada, el número de la semana va sobre su media; de cerca,
     sobre su valor base. */
  const mediaDe = new Map(semanales.map((t) => [t.desde, t.valor]));
  const numerosDeSemana =
    capas.numSemanas > 0.02 && numSemanas.map((n) => numero(n, Y(capas.dias >= 0.5 ? n.valor : mediaDe.get(n.desde) ?? n.valor), puestas));
  const numerosDeDia = capas.numDias > 0.02 && numDias.map((n) => numero(n, Y(n.valor)));


  const cifrasDePicos = conPico.flatMap(({ t, e }) => {
    const texto = entero(t.marca.valor);
    const xc = (X(e.date) + Math.max(X(e.date) + 2, X(addDays(e.hasta || e.date, 1)))) / 2;
    const medio = anchoTexto(texto, 6.4) / 2;
    const y = Y(t.marca.valor) - 4;
    /* Una cifra no pisa otra: choca solo si se tocan en horizontal Y en vertical. */
    const choca = puestas.some((p) => xc - medio < p.b + 4 && xc + medio > p.a - 4 && Math.abs(y - p.y) < 14);
    if (choca || xc - medio < 0 || xc + medio > W) return [];
    puestas.push({ a: xc - medio, b: xc + medio, y });
    return [
      <text key={`c-${t.clave}-${e.id ?? e.date}`} className="tl-escalon-numero is-pico" x={f1(xc)} y={f1(y)} textAnchor="middle" style={{ fill: t.marca.color }}>
        {texto}
      </text>,
    ];
  });
  /* Los días seguidos de un mismo refeed, un solo pico: sin costura. */
  const juntos = [];
  for (const t of dias.filter((d) => d.color)) {
    const u = juntos[juntos.length - 1];
    if (u && u.valor === t.valor && u.color === t.color && addDays(u.hasta, 1) === t.desde) u.hasta = t.hasta;
    else juntos.push({ ...t });
  }
  const picosDiarios = juntos.map((t) => pico(t.desde, t.hasta, t.valor, t.color, t.clave));

  return (
    <>
      <defs>
        <clipPath id={`${id}-antes`}>
          <rect x={-4} y={0} width={corte + 4} height={alto} />
        </clipPath>
        <clipPath id={`${id}-despues`}>
          <rect x={corte} y={0} width={Math.max(0, W - corte + 4)} height={alto} />
        </clipPath>
      </defs>
      <line className="tl-escalon-suelo" x1={0} x2={W} y1={suelo + 0.5} y2={suelo + 0.5} />
      {semanas.length > 0 && (
        <g opacity={op(capas.semanas)}>
          {areaDe(semanas, 's')}
          {picosSemanales}
          {cifrasDePicos}
        </g>
      )}
      {dias.length > 0 && (
        <g opacity={op(capas.dias)}>
          {areaDe(dias, 'd')}
          {picosDiarios}
        </g>
      )}
      {numerosDeSemana && <g opacity={op(capas.numSemanas)}>{numerosDeSemana}</g>}
      {numerosDeDia && <g opacity={op(capas.numDias)}>{numerosDeDia}</g>}
      {rotulo && (
        <text className="tl-carril-rotulo" x={W - 2} y={10} textAnchor="end">
          {rotulo}
        </text>
      )}
    </>
  );
};
