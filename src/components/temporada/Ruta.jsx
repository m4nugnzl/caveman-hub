import { useId } from 'react';

import { kindMeta } from '@/domain/calendar';
import { directionById } from '@/domain/goals';
import { addDays, daysBetween, shortDate } from '@/lib/dates';
import { rotuloQueCabe } from './escalaDeTiempo';
import { nombreCortoDeIntervencion, nombreDeFase, nombreDeHecho, nombreDeIntervencion, ritmoDeFase } from './lectura';
import { agruparHechos, etiquetaDeGrupo, tintaDe } from './series';

const BARRA_Y = 6;
const BARRA_H = 20;
/* Las intervenciones, en su renglón bajo las fases: una marca por cada una. */
const MARCA_Y = BARRA_Y + BARRA_H + 5;
const MARCA_H = 14;
/* Los hechos cuelgan de la ruta: una marca fina y su nombre debajo. */
const HECHO_H = 4;
const hechoY = (conMarcas) => (conMarcas ? MARCA_Y + MARCA_H + 4 : BARRA_Y + BARRA_H + 5);

/** Lo alto de la ruta: la franja y, si hay a la vista, las intervenciones y los hechos. */
export const altoDeLaRuta = (conHechos, conMarcas = false) =>
  conHechos ? hechoY(conMarcas) + HECHO_H + 16 : conMarcas ? MARCA_Y + MARCA_H + 3 : BARRA_Y + BARRA_H + 4;

const f1 = (n) => Math.round(n * 10) / 10;
const colorDe = (direccion) => directionById(direccion)?.color || 'var(--text-tertiary)';

/**
 * Los huecos del plan: entre dos fases seguidas y entre la última y el
 * destino. Se enseñan como lo que son —días sin fase— y nada más: ni aviso ni
 * color de alarma. Que haya un hueco puede ser justo lo que el entrenador
 * quiere.
 */
export const huecosDelPlan = (fases, destino) => {
  const huecos = [];
  for (let i = 1; i < fases.length; i += 1) {
    const fin = fases[i - 1].endsOn;
    if (!fin) continue;
    const desde = addDays(fin, 1);
    const hasta = addDays(fases[i].startsOn, -1);
    if (hasta >= desde) huecos.push({ desde, hasta });
  }
  const ultima = fases[fases.length - 1];
  if (ultima?.endsOn && destino?.date) {
    /* Solo si el destino cae DESPUÉS de todo lo planificado. */
    const desde = addDays(ultima.endsOn, 1);
    if (destino.date >= desde) huecos.push({ desde, hasta: destino.date });
  }
  return huecos;
};

/** Los hechos de contexto que tocan la vista, juntos si se pisan en pantalla. */
export const hechosDeLaRuta = (hechos, escala) =>
  agruparHechos(hechos, escala.pxPorDia, 14).filter((h) => escala.toca(h.date, h.hasta));

/**
 * Las intervenciones que tocan la vista, juntas si se pisan en pantalla: a la
 * escala de la temporada, un refeed y un cambio de dieta de la misma semana
 * son UNA marca con un «2», y pulsarla acerca la vista a ellas.
 */
export const marcasDeLaRuta = (intervenciones, escala) =>
  agruparHechos(
    intervenciones.map((x) => ({ ...x, date: x.desde, kind: x.tipo })),
    escala.pxPorDia,
    12
  ).filter((m) => escala.toca(m.date, m.hasta));

/**
 * LA RUTA: el plan de la temporada en una franja (24 sep 2026).
 *
 *     ▓▓ Volumen · +0,25 %/sem ▓▓▓▓▓▓▓│░░ Definición · −0,5 %/sem ░░(?)┊┊ 3 sem ┊┊⚑
 *        ▬ Vacaciones                ▬ Boda
 *
 * Las fases son tramos seguidos sobre el calendario con su nombre y su ritmo:
 * lo vivido, relleno; lo que falta, lavado y con el canto a trazos. Al final
 * de la última, el punto de decisión si tiene caminos (sin proyectar ninguno:
 * es una pregunta abierta). La bandera del destino, en su fecha. Los hechos
 * —vacaciones, enfermedad, competiciones— cuelgan debajo como marcas con su
 * nombre; los que se pisan en pantalla van juntos.
 *
 * Todo se pulsa y abre su hoja (`onPieza`): la fase, el hecho, el destino y
 * la decisión. Ahí vivirá la edición de la fase 6.
 *
 * LAS INTERVENCIONES (25 sep) van en su renglón, entre las fases y los
 * hechos: una marca con su tinta —rellena si ya empezó, a contorno si está
 * prevista—, alargada a sus días cuando caben, y su nombre corto al lado si
 * hay sitio. Pulsarla abre su tarjeta de impacto; pulsar un grupo acerca la
 * vista a él (`onGrupo`).
 *
 * @param hechos `hechosDeLaRuta`.
 * @param marcas `marcasDeLaRuta`.
 * @param elegida el id de la intervención abierta, o `null`.
 * @param onPieza recibe `{ tipo: 'fase' | 'hechos' | 'destino' | 'decision' | 'intervencion', … }`.
 * @param onGrupo recibe `{ desde, hasta }` de un grupo de intervenciones.
 */
export const Ruta = ({ escala, fases, hoy, destino, cruce, hechos = [], marcas = [], elegida = null, onPieza, onGrupo }) => {
  const id = useId().replace(/:/g, '');
  const W = escala.ancho;
  const xHoy = escala.x(hoy) + escala.pxPorDia / 2;
  const recorte = (x) => Math.max(-2, Math.min(W + 2, x));
  const pulsable = (pieza) => ({
    className: 'is-pulsable',
    onClick: (e) => {
      /* Pulsar una pieza no es pulsar la semana que hay detrás. */
      e.stopPropagation();
      onPieza?.(pieza);
    },
  });

  const barras = fases
    .filter((f) => f.startsOn && escala.toca(f.startsOn, f.endsOn || escala.ultimoDia))
    .map((f, i) => {
      const xa = recorte(escala.x(f.startsOn));
      const xb = recorte(escala.x(addDays(f.endsOn || escala.ultimoDia, 1)));
      /* El rótulo se pega al canto izquierdo de lo que se ve: una fase que
         empezó fuera de la vista sigue diciendo cómo se llama. */
      const x0 = Math.max(xa, 0) + 8;
      const titulo = nombreDeFase(f);
      const ritmo = ritmoDeFase(f, f.endsOn && f.endsOn < hoy ? f.endsOn : hoy);
      const rotulo = rotuloQueCabe([ritmo ? `${titulo} · ${ritmo}` : titulo, titulo, titulo.slice(0, 1)], Math.min(xb, W) - x0 - 4, 6.4, 2);
      const color = colorDe(f.direction);
      const corte = Math.max(xa, Math.min(xb, xHoy));
      const { className, onClick } = pulsable({ tipo: 'fase', fase: f });
      return (
        <g key={f.id || i} className={`tl-fase ${className}`} onClick={onClick}>
          <title>{`${titulo}, ${shortDate(f.startsOn)}${f.endsOn ? ` – ${shortDate(f.endsOn)}` : ''}${ritmo ? `, ${ritmo}` : ''}`}</title>
          <clipPath id={`${id}-f${i}`}>
            <rect x={f1(xa)} y={BARRA_Y} width={f1(Math.max(0, xb - xa - 1))} height={BARRA_H} rx={6} />
          </clipPath>
          <g clipPath={`url(#${id}-f${i})`}>
            <rect className="tl-fase-plan" x={f1(xa)} y={BARRA_Y} width={f1(Math.max(0, xb - xa))} height={BARRA_H} fill={color} />
            {corte > xa && <rect className="tl-fase-hecha" x={f1(xa)} y={BARRA_Y} width={f1(corte - xa)} height={BARRA_H} fill={color} />}
          </g>
          {xb > xHoy && (
            <rect
              className="tl-fase-canto"
              x={f1(Math.max(xa, xHoy) + 0.5)}
              y={BARRA_Y + 0.5}
              width={f1(Math.max(0, xb - Math.max(xa, xHoy) - 2))}
              height={BARRA_H - 1}
              rx={5.5}
              stroke={color}
            />
          )}
          {rotulo && (
            <text className="tl-fase-rotulo" x={f1(x0)} y={BARRA_Y + 14}>
              {rotulo}
            </text>
          )}
        </g>
      );
    });

  let decision = null;
  /* Si la pregunta del punto de decisión se escribe, el hueco que sale de él
     no escribe el suyo: iban los dos en el mismo sitio. */
  let conPregunta = false;
  if (cruce?.decide) {
    const x = escala.x(addDays(cruce.decide, 1));
    if (x >= -10 && x <= W + 10) {
      const pregunta = cruce.pregunta || cruce.caminos.map((c) => c.titulo).join(' / ');
      const siguiente = fases.find((f) => f.startsOn > cruce.decide);
      const tope = Math.min(siguiente ? escala.x(siguiente.startsOn) : W, destino?.date ? escala.x(destino.date) - 6 : W);
      const rotulo = pregunta ? rotuloQueCabe([pregunta, '¿Y después?'], Math.min(tope, W) - x - 16, 6.4, 2) : null;
      conPregunta = Boolean(rotulo);
      const { className, onClick } = pulsable({ tipo: 'decision' });
      decision = (
        <g className={`tl-decision ${className}`} onClick={onClick}>
          <title>{`Decisión al acabar ${cruce.fase?.title || 'la fase'}${pregunta ? `: ${pregunta}` : ''}`}</title>
          <circle cx={f1(x)} cy={BARRA_Y + BARRA_H / 2} r={8} />
          <text className="tl-decision-signo" x={f1(x)} y={BARRA_Y + 14} textAnchor="middle">
            ?
          </text>
          {rotulo && (
            <text className="tl-decision-rotulo" x={f1(x + 13)} y={BARRA_Y + 14}>
              {rotulo}
            </text>
          )}
        </g>
      );
    }
  }

  const huecos = huecosDelPlan(fases, destino)
    .filter((h) => escala.toca(h.desde, h.hasta))
    .map((h) => {
      const xa = recorte(escala.x(h.desde));
      const xb = recorte(escala.x(addDays(h.hasta, 1)));
      const dias = (daysBetween(h.desde, h.hasta) ?? 0) + 1;
      const cuanto = dias >= 7 ? `${Math.round(dias / 7)} sem` : `${dias} ${dias === 1 ? 'día' : 'días'}`;
      /* Si el hueco sale del punto de decisión, su rótulo empieza detrás del círculo. */
      const tras = cruce?.decide && addDays(cruce.decide, 1) === h.desde ? 14 : 0;
      const rotulo = tras && conPregunta ? null : rotuloQueCabe([`${cuanto} sin fase`, cuanto], Math.min(xb, W) - Math.max(xa, 0) - 12 - tras, 6.2, 2);
      return (
        <g key={`h-${h.desde}`} className="tl-hueco">
          <title>{`${cuanto} sin fase, ${shortDate(h.desde)} – ${shortDate(h.hasta)}`}</title>
          <rect x={f1(xa + 1)} y={BARRA_Y + 0.5} width={f1(Math.max(0, xb - xa - 3))} height={BARRA_H - 1} rx={5.5} />
          {rotulo && (
            <text x={f1(Math.max(xa, 0) + 8 + tras)} y={BARRA_Y + 14}>
              {rotulo}
            </text>
          )}
        </g>
      );
    });

  /* La bandera del destino, en su día. Su nombre lo dice la cabecera. */
  let bandera = null;
  if (destino?.date && escala.toca(destino.date, destino.date)) {
    const x = f1(escala.x(destino.date) + escala.pxPorDia / 2);
    const { className, onClick } = pulsable({ tipo: 'destino' });
    bandera = (
      <g className={`tl-bandera ${className}`} onClick={onClick}>
        <title>{`${destino.title || 'Destino'}, ${shortDate(destino.date)}`}</title>
        {/* La diana del dedo: más ancha que el asta. */}
        <rect className="tl-diana" x={x - 8} y={0} width={20} height={BARRA_Y + BARRA_H + 2} />
        <line className="tl-bandera-asta" x1={x} x2={x} y1={BARRA_Y - 3} y2={BARRA_Y + BARRA_H + 2} />
        <path className="tl-bandera-tela" d={`M${x} ${BARRA_Y - 3} h10 l-2.5 3.75 l2.5 3.75 h-10 z`} />
      </g>
    );
  }

  /* Las intervenciones: una marca por cada una (o por grupo). */
  const cy = MARCA_Y + MARCA_H / 2;
  const deIntervencion = marcas.map((m, i) => {
    const grupo = m.grupo || [m];
    const sola = grupo.length === 1;
    const a = escala.x(m.date);
    const b = escala.x(addDays(m.hasta, 1));
    const larga = sola && b - a >= 12;
    const centro = (a + b) / 2;
    const tinta = !sola && m.mezcla ? 'var(--text-tertiary)' : tintaDe(grupo[0]);
    const prevista = grupo.every((x) => x.prevista);
    const abierta = grupo.some((x) => x.id === elegida);
    const x0 = larga ? Math.max(0, a) + 2 : centro + (sola ? 6 : 9);
    const tope = Math.min(W, marcas[i + 1] ? escala.x(marcas[i + 1].date) : W) - 4;
    /* Un grupo ya dice cuántas son en su círculo: su detalle, al pasar por encima o al acercar. */
    const rotulo = sola ? rotuloQueCabe([nombreCortoDeIntervencion(m)], tope - (larga ? Math.max(b, 0) + 4 : x0 + 1), 6, 0) : null;
    const alPulsar = (e) => {
      e.stopPropagation();
      if (sola) onPieza?.({ tipo: 'intervencion', id: m.id });
      else onGrupo?.({ desde: m.date, hasta: m.hasta });
    };
    return (
      <g
        key={m.id}
        className={`tl-marca is-pulsable${prevista ? ' is-prevista' : ''}${abierta ? ' is-abierta' : ''}`}
        style={{ '--tinta': tinta }}
        onClick={alPulsar}
      >
        <title>
          {grupo
            .map((x) => `${nombreDeIntervencion(x)}, ${shortDate(x.desde)}${x.evento && x.hasta !== x.desde ? ` – ${shortDate(x.hasta)}` : ''}${x.prevista ? ', prevista' : ''}`)
            .join('\n')}
        </title>
        <rect className="tl-diana" x={f1(Math.min(a, centro - 8))} y={MARCA_Y - 2} width={f1(Math.max(b - a, 16, rotulo ? rotulo.length * 6 + 20 : 0))} height={MARCA_H + 4} />
        {larga ? (
          <rect className="tl-marca-forma" x={f1(a + 1)} y={cy - 4} width={f1(b - a - 2)} height={8} rx={4} />
        ) : (
          <circle className="tl-marca-forma" cx={f1(centro)} cy={cy} r={sola ? 4.5 : 6.5} />
        )}
        {!sola && (
          <text className="tl-marca-cuenta" x={f1(centro)} y={cy + 3.5} textAnchor="middle">
            {grupo.length}
          </text>
        )}
        {rotulo && (
          <text className="tl-marca-rotulo" x={f1(larga ? Math.max(b, 0) + 4 : x0)} y={cy + 4}>
            {rotulo}
          </text>
        )}
      </g>
    );
  });

  /* Los hechos: una marca del primer al último día y su nombre, si cabe
     antes del siguiente. */
  const HECHO_Y = hechoY(marcas.length > 0);
  const HECHO_TEXTO = HECHO_Y + HECHO_H + 11;
  const deContexto = hechos.map((h, i) => {
    const grupo = h.grupo || [h];
    const color = h.mezcla ? 'var(--text-tertiary)' : kindMeta(h.kind).color;
    const a = escala.x(h.date);
    const b = escala.x(addDays(h.hasta, 1));
    const ancho = Math.max(4, b - a - 1);
    const x = b - a - 1 < 4 ? (a + b) / 2 - 2 : a;
    const siguiente = hechos[i + 1];
    const tope = Math.min(W, siguiente ? escala.x(siguiente.date) : W) - 6;
    const x0 = Math.max(0, x);
    const opciones = grupo.length > 1 ? [etiquetaDeGrupo(grupo), String(grupo.length)] : [nombreDeHecho(h), kindMeta(h.kind).label];
    const rotulo = rotuloQueCabe(opciones, tope - x0, 6, 0);
    const { className, onClick } = pulsable({ tipo: 'hechos', eventos: grupo });
    return (
      <g key={h.id || `${h.kind}-${h.date}`} className={`tl-hecho${h.date > hoy ? ' is-plan' : ''} ${className}`} onClick={onClick}>
        <title>{grupo.map((e) => `${nombreDeHecho(e)}, ${shortDate(e.date)}${e.hasta && e.hasta !== e.date ? ` – ${shortDate(e.hasta)}` : ''}`).join('\n')}</title>
        <rect className="tl-diana" x={f1(x0)} y={HECHO_Y - 3} width={f1(Math.max(ancho, rotulo ? rotulo.length * 6 : 0, 16))} height={HECHO_TEXTO - HECHO_Y + 7} />
        <rect x={f1(x)} y={HECHO_Y} width={f1(ancho)} height={HECHO_H} rx={2} fill={color} />
        {rotulo && (
          <text className="tl-hecho-rotulo" x={f1(x0)} y={HECHO_TEXTO}>
            {rotulo}
          </text>
        )}
      </g>
    );
  });

  return (
    <>
      {huecos}
      {barras}
      {decision}
      {bandera}
      {deIntervencion}
      {deContexto}
    </>
  );
};
