import { kindMeta } from '@/domain/calendar';
import { esIntervencion } from '@/domain/pautaDelDia';
import { variacionTexto } from '@/domain/rendimiento';
import { PESAJES_FIRMES } from '@/domain/tendenciaDelPeso';
import { localeNumber, shortDate } from '@/lib/dates';
import { entero, kcalsTexto, kg, nombreDeHecho, nombreDeIntervencion, pctSemana } from './lectura';
import { tintaDeIntervencion } from './series';

/**
 * LAS PIEZAS DEL INSPECTOR (24 sep 2026): la misma gramática para la ficha de
 * una semana, la de un día y el resumen del periodo, en tres franjas:
 *
 *   1. CIFRAS: tarjetas iguales — etiqueta, valor grande, UNA línea de
 *      comparación en palabras («baja 0,4 kg») y, si hace falta, otra.
 *   2. PASOS: una tarjeta por día, pulsable.
 *   3. CONTEXTO: sensaciones en barras sobre su escala y las notas.
 *
 * Dos tamaños de letra y nada más: el de los valores de la franja 1 (y el
 * pesaje de cada día) y el de todo lo demás. Sin colores de juicio.
 *
 * EL TEXTO (25 sep): una idea por línea, sin cadenas con «·» ni símbolos que
 * haya que descifrar. Lo que no cambia no se escribe; lo que cambia, en
 * palabras cortas: «sube 0,3 kg», «1 refeed».
 */

export const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

/** «sube 200», «baja 150»; `null` si no cambia. */
export const cambioEntero = (v, unidad = '') => (Math.round(v) === 0 ? null : `${v > 0 ? 'sube' : 'baja'} ${entero(Math.abs(v))}${unidad}`);
/** «sube 1», «baja 0,5»: con un decimal como mucho; `null` si no cambia. */
export const cambioCorto = (v) => {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? null : `${r > 0 ? 'sube' : 'baja'} ${localeNumber(Math.abs(r), { maximumFractionDigits: 1 })}`;
};
/** «baja 0,4 kg»; `null` si no cambia. */
export const cambioKg = (v) => {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? null : `${r > 0 ? 'sube' : 'baja'} ${kg(Math.abs(r))} kg`;
};
/** «del 24 al 30 ago», «del 28 sep al 4 oct» o «el 19 sep». */
export const delAl = (desde, hasta = null) => {
  if (!hasta || hasta === desde) return `el ${shortDate(desde)}`;
  const a = shortDate(desde);
  const b = shortDate(hasta);
  const [dia, ...mes] = a.split(' ');
  return mes.join(' ') === b.split(' ').slice(1).join(' ') ? `del ${dia} al ${b}` : `del ${a} al ${b}`;
};
/** «17 – 23 ago», «28 sep – 4 oct» si cambia el mes, o «29 dic 2025 – 10 ene 2027» si cambia el año. */
export const tramoCorto = (desde, hasta) => {
  if (desde.slice(0, 4) !== hasta.slice(0, 4)) return `${shortDate(desde)} ${desde.slice(0, 4)} – ${shortDate(hasta)} ${hasta.slice(0, 4)}`;
  const a = shortDate(desde);
  const b = shortDate(hasta);
  const [dia, ...mes] = a.split(' ');
  return mes.join(' ') === b.split(' ').slice(1).join(' ') ? `${dia} – ${b}` : `${a} – ${b}`;
};

/** «S9» o, sin número, «10 ago»: cómo se nombra la semana contra la que se compara. */
export const nombreCorto = (s) => (s.numero ? `S${s.numero}` : shortDate(s.lunes));

/** «Diet break del 24 al 30 ago»: lo apuntado, con sus fechas en palabras. */
export const hechoConFechas = (h) => `${nombreDeHecho(h)} ${delAl(h.date, h.hasta)}`;

/**
 * Lo apuntado, como notas: la intervención —que abre su tarjeta de impacto
 * con `elegir`— con sus kcal debajo y la indicación para el cliente, o el
 * hecho con sus fechas.
 */
export const notasDeHechos = (hechos, elegir) =>
  hechos.flatMap((h) => {
    const clave = h.id || `${h.kind}-${h.date}`;
    const etiqueta = hechoConFechas(h);
    if (!esIntervencion(h)) return [{ id: clave, etiqueta, punto: kindMeta(h.kind).color }];
    const kcals = kcalsTexto(h);
    return [
      {
        id: clave,
        etiqueta,
        texto: kcals ? `A ${kcals} kcal` : null,
        punto: tintaDeIntervencion(h),
        onAbrir: elegir ? () => elegir(h.id ? { tipo: 'intervencion', id: `e:${h.id}` } : { tipo: 'hechos', eventos: [h] }) : null,
      },
      ...(h.nota ? [{ id: `${clave}-indicacion`, etiqueta: 'Indicación para el cliente', texto: h.nota }] : []),
    ];
  });

/** Su nombre en una lista, donde el tipo tiene que leerse: «Bloque · Fuerza». */
export const nombreConTipo = (x) => (x.tipo === 'bloque' && x.bloque?.nombre ? `Bloque · ${x.bloque.nombre}` : nombreDeIntervencion(x));

/** «24 – 26 sep» o, si es un solo día o un cambio que se queda, «1 sep»; con
    el año si no es el de hoy. */
export const fechasDeIntervencion = (x, hoy) => {
  const texto = x.evento && x.hasta !== x.desde ? tramoCorto(x.desde, x.hasta) : shortDate(x.desde);
  const anio = x.desde.slice(0, 4);
  return anio !== hoy.slice(0, 4) && !texto.includes(anio) ? `${texto} ${anio}` : texto;
};

/* «−0,62», sin unidad; «6,5». */
const ritmoSolo = (v) => pctSemana(v).replace(' %/sem', '');
const unDecimal = (v) => localeNumber(Math.round(v * 10) / 10, { maximumFractionDigits: 1 });
const antesDespues = (a, d, texto) => `${esNumero(a) ? texto(a) : '—'} → ${esNumero(d) ? texto(d) : '—'}`;

/**
 * LA CIFRA CLAVE (`cifraClaveDe`) en palabras, para el historial y la
 * tarjeta: `[{ id, etiqueta, valor, unidad, debil, vacia }]`.
 *
 *   · peso   → «Tendencia» «−0,05 → −0,62» %/sem; atenuada si algún lado se
 *              sostiene en menos de 3 pesajes;
 *   · bloque → «Referencias» «+2 %» (la media contra antes) y, si la hay,
 *              «Fatiga» «6,5 → 5,5» /10.
 */
export const textosDeLaClave = (clave) => {
  if (!clave) return [];
  if (clave.tipo === 'peso') {
    const [a, d] = [clave.antes, clave.despues];
    return [
      {
        id: 'ritmo',
        etiqueta: 'Tendencia',
        valor: antesDespues(a?.ritmo, d?.ritmo, ritmoSolo),
        unidad: '%/sem',
        debil: [a, d].some((p) => esNumero(p?.ritmo) && p.pesajes < PESAJES_FIRMES),
        vacia: !esNumero(a?.ritmo) && !esNumero(d?.ritmo),
      },
    ];
  }
  const salida = [
    {
      id: 'referencias',
      etiqueta: 'Referencias',
      valor: esNumero(clave.rendimiento) ? variacionTexto(clave.rendimiento) : '—',
      unidad: null,
      vacia: !esNumero(clave.rendimiento),
    },
  ];
  const f = clave.fatiga;
  if (f && (esNumero(f.antes) || esNumero(f.despues)))
    salida.push({ id: 'fatiga', etiqueta: 'Fatiga', valor: antesDespues(f.antes, f.despues, unDecimal), unidad: f.max ? `/${f.max}` : null });
  return salida;
};

/**
 * LA CIFRA CLAVE como tarjetas de la franja 1 de la tarjeta de impacto: lo
 * primero que se lee.
 */
export const cifrasDeLaClave = (clave) =>
  textosDeLaClave(clave).map((t) => ({
    id: `clave-${t.id}`,
    etiqueta: t.id === 'ritmo' ? 'Tendencia del peso' : t.id === 'fatiga' ? 'Fatiga de sesión' : 'Rendimiento',
    valor: t.vacia ? null : t.valor,
    unidad: t.unidad,
    debil: t.debil,
    compara:
      t.id === 'referencias'
        ? t.vacia
          ? 'sin marcas antes y después'
          : `media de ${clave.referencias} ${clave.referencias === 1 ? 'referencia' : 'referencias'}, contra antes`
        : 'antes → después',
  }));

/** «P180 C300 G70». */
export const macrosCortas = (x) =>
  [x?.protein, x?.carbs, x?.fats].some(esNumero) ? `P${entero(x.protein ?? 0)} C${entero(x.carbs ?? 0)} G${entero(x.fats ?? 0)}` : null;

/**
 * FRANJA 1. `cifras`: `[{ id, etiqueta, valor, unidad, compara, nota, title, debil }]`.
 * `debil`, un valor que se sostiene en poco (una tendencia de dos pesajes): atenuado.
 * `compara`, la línea de comparación; `nota`, una segunda si hace falta (el
 * objetivo, los refeeds). Sin valor, una raya atenuada: la tarjeta sigue en
 * su sitio.
 */
export const Cifras = ({ cifras }) => (
  <dl className="tl-ins-cifras">
    {cifras.map((c) => (
      <div key={c.id} className="tl-ins-cifra" title={c.title || undefined}>
        <dt className="tl-ins-etq">{c.etiqueta}</dt>
        <dd className={`tl-ins-val tnum${c.valor === null ? ' is-nada' : c.debil ? ' is-debil' : ''}`}>
          {c.valor ?? '—'}
          {c.valor !== null && c.unidad && <span className="tl-ins-unidad"> {c.unidad}</span>}
        </dd>
        {[c.compara, c.nota].filter(Boolean).map((l) => (
          <dd key={l} className="tl-ins-cmp tnum">
            {l}
          </dd>
        ))}
      </div>
    ))}
  </dl>
);

/**
 * FRANJA 2. `tarjetas`: `[{ id, etiqueta, valor, lineas, pildora, tinta,
 * actual, titulo, onElegir }]`. `cabecera`, lo que cubre varias tarjetas y
 * se nombra una vez encima (un diet break, un refeed): `[{ id, texto, tinta }]`.
 */
export const Tarjetas = ({ tarjetas, rotulo, cabecera = [] }) => {
  const lista = (
    <ol className="tl-ins-pasos" aria-label={rotulo}>
      {tarjetas.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            className={`tl-ins-paso${t.tinta ? ' is-tenido' : ''}`}
            style={t.tinta ? { '--tinta': t.tinta } : undefined}
            aria-current={t.actual ? 'date' : undefined}
            title={t.titulo || undefined}
            onClick={t.onElegir}
          >
            <span className="tl-ins-etq">{t.etiqueta}</span>
            <span className={`tl-ins-val tnum${t.valor === null ? ' is-nada' : ''}`}>{t.valor ?? '—'}</span>
            {t.lineas.map((l, i) => (
              <span key={i} className="tl-ins-linea tnum">
                {l}
              </span>
            ))}
            {t.pildora && <span className={`tl-ins-sesion is-${t.pildora.forma}`}>{t.pildora.texto}</span>}
          </button>
        </li>
      ))}
    </ol>
  );
  if (cabecera.length === 0) return lista;
  return (
    <div className="tl-ins-franja">
      <ul className="tl-ins-franja-cabeza">
        {cabecera.map((c) => (
          <li key={c.id}>
            {c.tinta && <i className="tl-ins-punto" style={{ background: c.tinta }} aria-hidden="true" />}
            {c.texto}
          </li>
        ))}
      </ul>
      {lista}
    </div>
  );
};

const fraccion = (v, min, max) => Math.min(1, Math.max(0, (v - min) / (max - min)));

/**
 * FRANJA 3, las sensaciones: una fila por pregunta con una barra sobre SU
 * escala, rellena hasta el valor, una marca con la media de la fase, el valor
 * y, si cambió, cuánto respecto a la semana anterior («sube 1»). El punto delante del valor dice que está
 * en el extremo malo de su escala; no es una alarma.
 *
 * @param filas  `sensacionesDeLaSemana` o `sensacionesDeLaSesion().filas`.
 * @param conDif si se enseña el cambio con la semana anterior.
 */
export const Barras = ({ filas, conDif = true }) => (
  <ul className={`tl-ins-barras${conDif ? '' : ' sin-dif'}`}>
    {filas.map((f) => {
      const conEscala = esNumero(f.min) && esNumero(f.max) && f.max > f.min;
      const hasta = conEscala ? fraccion(f.valor, f.min, f.max) : 0;
      const media = conEscala && esNumero(f.mediaFase) ? fraccion(f.mediaFase, f.min, f.max) : null;
      return (
        <li key={f.id}>
          <span className="tl-ins-barra-nombre" title={f.etiqueta}>{f.nombre}</span>
          <span className="tl-ins-barra" aria-hidden="true">
            <span className="tl-ins-barra-relleno" style={{ width: `${hasta * 100}%` }} />
            {media !== null && <span className="tl-ins-barra-media" style={{ left: `${media * 100}%` }} />}
          </span>
          <span className={`tl-ins-barra-valor tnum${f.extremo ? ' is-extremo' : ''}`}>
            <b>{localeNumber(f.valor, { maximumFractionDigits: 1 })}</b>/{f.max}
            {f.extremo && <span className="sr-only"> (extremo de la escala)</span>}
            {media !== null && <span className="sr-only">, media de la fase {localeNumber(f.mediaFase, { maximumFractionDigits: 1 })}</span>}
          </span>
          {conDif && (
            <span className="tl-ins-barra-dif tnum">
              {f.vsAnterior !== null && f.vsAnterior !== undefined ? cambioCorto(f.vsAnterior) : null}
            </span>
          )}
        </li>
      );
    })}
  </ul>
);

/**
 * Una columna de la franja 3: rótulo, a veces su leyenda, y lo suyo. Con
 * `marca`, la leyenda empieza con la raya de la media de la fase.
 */
export const Columna = ({ titulo, leyenda = null, marca = false, children }) => (
  <section className="tl-ins-columna">
    <h4 className="tl-ins-rotulo">
      {titulo}
      {leyenda && (
        <span className="tl-ins-leyenda">
          {marca && <span className="tl-ins-leyenda-marca" aria-hidden="true" />}
          {leyenda}
        </span>
      )}
    </h4>
    {children}
  </section>
);

/**
 * Las notas: `[{ id, etiqueta, texto, punto, onAbrir }]`. Con `onAbrir`, el
 * renglón es un botón (una intervención abre lo suyo).
 */
export const Notas = ({ notas, vacio }) =>
  notas.length === 0 ? (
    <p className="tl-ins-nada">{vacio}</p>
  ) : (
    <ul className="tl-ins-notas">
      {notas.map((n) => {
        const cabeza = (
          <span className="tl-ins-etq">
            {n.punto && <span className="tl-ins-punto" style={{ background: n.punto }} aria-hidden="true" />}
            {n.etiqueta}
          </span>
        );
        return (
          <li key={n.id}>
            {n.onAbrir ? (
              <button type="button" className="tl-ins-nota-boton" onClick={n.onAbrir}>
                {cabeza}
              </button>
            ) : (
              cabeza
            )}
            {n.texto && <p className="tl-ins-texto">{n.texto}</p>}
          </li>
        );
      })}
    </ul>
  );

/** Las píldoras de contexto de la cabecera: `[{ id, texto, punto, estado }]`. */
export const Pildoras = ({ pildoras }) =>
  pildoras.length > 0 ? (
    <ul className="tl-ins-pildoras">
      {pildoras.map((p) => (
        <li key={p.id} className={`tl-ins-pildora${p.estado ? ` is-${p.estado}` : ''}`}>
          {p.estado && <span className={`tl-rango-estado is-${p.estado}`} aria-hidden="true" />}
          {p.punto && <span className="tl-ins-punto" style={{ background: p.punto }} aria-hidden="true" />}
          {p.texto}
        </li>
      ))}
    </ul>
  ) : null;
