import { TIPOS_DE_INTERVENCION, VALORACIONES, recuentoDeIntervenciones } from '@/domain/intervenciones';
import { kcalsDeIntervencion } from '@/domain/pautaDelDia';
import { daysBetween } from '@/lib/dates';
import { SegmentedControl } from '@/components/ui/primitives';
import { entero } from './lectura';
import { esNumero, fechasDeIntervencion, macrosCortas, nombreConTipo, textosDeLaClave } from './PiezasDelInspector';
import { tintaDe } from './series';

const miles = (v) => (esNumero(v) ? entero(v) : null);

/**
 * LA PAUTA, EN UNA LÍNEA: «2.600 → 2.660 → 2.900 kcal» en un refeed escalonado
 * (de cuatro escalones en adelante, «2.600–2.900 kcal»); en un cambio de
 * dieta, lo que cambió con lo de antes, con las kcal día a día como en su
 * tarjeta; en un bloque, su split.
 */
const pautaResumida = ({ x, kcal }) => {
  if (x.evento) {
    const ks = kcalsDeIntervencion(x.evento);
    const dias = (daysBetween(x.desde, x.hasta) ?? 0) + 1;
    const cifra =
      ks.length === 0
        ? 'sin kcal apuntadas'
        : ks.length > 3
          ? `${entero(Math.min(...ks))}–${entero(Math.max(...ks))} kcal`
          : `${ks.map(entero).join(' → ')} kcal`;
    return dias > 1 ? `${cifra}, ${dias} días` : cifra;
  }
  if (x.tipo === 'dieta') {
    const partes = [];
    for (const c of x.cambios) {
      if (c.clave === 'kcals') {
        const a = miles(kcal?.antes);
        const d = miles(kcal?.despues);
        if (a || d) partes.push(`${a ?? '—'} → ${d ?? '—'} kcal`);
      }
      if (c.clave === 'steps') partes.push(`${miles(c.antes) ?? '—'} → ${miles(c.despues) ?? '—'} pasos`);
      if (c.clave === 'cardio') partes.push(`cardio: ${c.despues || 'sin cardio'}`);
    }
    if (x.cambios.some((c) => ['protein', 'carbs', 'fats'].includes(c.clave))) partes.push(macrosCortas(x.despues));
    return partes.filter(Boolean).join(' · ');
  }
  const antes = x.anterior?.split;
  const ahora = x.bloque?.split;
  if (antes && ahora && antes !== ahora) return `${antes} → ${ahora}`;
  return ahora || 'Sin split';
};

/**
 * La cifra clave de una entrada (`textosDeLaClave`): «−0,05 → −0,62 %/sem»
 * o, en un bloque, «referencias +2 % · fatiga 6,5 → 5,5 /10». Atenuada si se
 * sostiene en poco; una raya si no hay nada.
 */
const Clave = ({ clave }) =>
  textosDeLaClave(clave).map((t) => (
    <span key={t.id} className={`tl-hist-clave${t.vacia ? ' is-nada' : t.debil ? ' is-debil' : ''}`}>
      {t.id !== 'ritmo' && <span className="tl-hist-clave-etq">{t.etiqueta.toLowerCase()} </span>}
      {t.valor}
      {t.unidad && !t.vacia && ` ${t.unidad}`}
    </span>
  ));

/** Lo de la derecha: su valoración o, sin ella, cómo está. */
const estadoTexto = (e) =>
  VALORACIONES.find((v) => v.id === e.x.capa?.valoracion)?.label ||
  (e.estado === 'prevista' ? 'Prevista' : e.estado === 'en_curso' ? 'En curso' : 'Sin valorar');

/* «1 funcionó», «3 funcionaron». */
const PALABRAS = [
  ['funciono', 'funcionó', 'funcionaron'],
  ['no_funciono', 'no funcionó', 'no funcionaron'],
  ['dudoso', 'dudoso', 'dudosos'],
  ['sinValorar', 'sin valorar', 'sin valorar'],
  ['previstas', 'prevista', 'previstas'],
];

/** «Refeeds: 4 · 3 funcionaron · 1 dudoso». */
const recuentoTexto = (r) => [
  `${r.plural}: ${r.n}`,
  ...PALABRAS.filter(([k]) => r[k] > 0).map(([k, uno, varios]) => `${r[k]} ${r[k] === 1 ? uno : varios}`),
];

/**
 * EL HISTORIAL DE INTERVENCIONES (25 sep 2026): todas, de la más reciente a
 * la más antigua, filtrables por tipo. Arriba, cuántas hay de cada tipo y
 * cómo las valoró el entrenador; cada entrada, en dos líneas: qué y cuándo;
 * su pauta y su cifra clave (26 sep): la tendencia del peso antes → después
 * o, en un bloque, sus referencias y la fatiga.
 *
 * Pulsar una lleva la gráfica a su tramo, con sus ventanas, y abre su
 * tarjeta de impacto. Solo cuenta: ninguna frase concluye nada.
 *
 * @param entradas `historialDeIntervenciones(...)`.
 * @param hoy      para poner el año a lo que no es de este.
 * @param filtro   el tipo que se ve, o 'todas'.
 */
export const HistorialDeIntervenciones = ({ entradas, hoy, filtro, onFiltro, onAbrir }) => {
  const tipos = TIPOS_DE_INTERVENCION.filter((t) => entradas.some((e) => e.x.tipo === t.id));
  const vigente = tipos.some((t) => t.id === filtro) ? filtro : 'todas';
  const vistas = vigente === 'todas' ? entradas : entradas.filter((e) => e.x.tipo === vigente);
  const recuento = recuentoDeIntervenciones(vistas);

  if (entradas.length === 0) {
    return (
      <div className="tl-ins-cuerpo">
        <p className="tl-ins-nada">
          Todavía no hay ninguna. Un refeed, un diet break, un cambio de kcal, macros, pasos o cardio, o un bloque nuevo aparecerán aquí con
          su fecha.
        </p>
      </div>
    );
  }

  return (
    <div className="tl-ins-cuerpo tl-hist">
      {tipos.length > 1 && (
        <SegmentedControl
          value={vigente}
          onChange={onFiltro}
          options={[{ id: 'todas', label: 'Todas' }, ...tipos.map((t) => ({ id: t.id, label: t.label }))]}
          label="Qué tipo de intervención se ve"
        />
      )}

      <ul className="tl-hist-recuento">
        {recuento.map((r) => (
          <li key={r.tipo} className="tnum">
            {recuentoTexto(r).map((t, i) => (
              <span key={t}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                {i === 0 ? <b>{t}</b> : t}
              </span>
            ))}
          </li>
        ))}
      </ul>

      <ol className="tl-hist-lista">
        {vistas.map((e) => {
          const pauta = pautaResumida(e);
          const conClave = e.estado !== 'prevista';
          return (
            <li key={e.x.id}>
              <button type="button" className="tl-hist-item" onClick={() => onAbrir(e.x.id)}>
                <span className="tl-hist-l1">
                  <span className="tl-hist-punto" style={{ background: tintaDe(e.x) }} aria-hidden="true" />
                  <span className="tl-hist-que">
                    <b>{nombreConTipo(e.x)}</b> <span className="tl-hist-fechas tnum">{fechasDeIntervencion(e.x, hoy)}</span>
                  </span>
                  <span className={`tl-hist-estado${e.x.capa?.valoracion ? ' is-valorada' : ''}`}>{estadoTexto(e)}</span>
                </span>
                <span className="tl-hist-l2 tnum">
                  {pauta && <span>{pauta}</span>}
                  {conClave && <Clave clave={e.clave} />}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
