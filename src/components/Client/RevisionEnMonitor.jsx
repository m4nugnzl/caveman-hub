import { metricColor } from '@/domain/metrics';
import { localeNumber } from '@/lib/dates';
import { GroupHead, Panel } from '@/components/ui/primitives';
import { Sparkline } from '@/components/ui/charts';
import { PasosDeLaEntrega } from './PasosDeLaEntrega';
import { PesoDeHoy } from './PesoDeHoy';
import { TusSemanas } from './TusSemanas';

/**
 * «ENTREGA TU SEMANA» EN EL MONITOR — tres cosas que hacer y una que mirar.
 *
 * ══ Qué había, y por qué el dueño la llamó confusa ═════════════════════════
 *
 *   *«La pantalla revisión es confusa y a mi parecer mal diseñada. El objetivo
 *   es que el cliente pueda apuntar su peso cada vez que quiera y el sistema
 *   vaya haciendo la media de cara a la revisión, y cuando quiera sube su
 *   revisión con las fotos, el cuestionario, etc. El proceso ha de ser lo más
 *   sencillo y bien diseñado posible.»*
 *
 * Medido sobre la pantalla real, la avería era de bulto: **tres sitios donde
 * apuntar el mismo peso**, uno debajo de otro.
 *
 *     ┌ Tu peso de hoy ──────────── [ 61 ] kg [Apuntar] ┐   ← 1
 *     ├ Lo que te falta para entregar ──────────────────┤
 *     │  Tu peso · Tus medidas · Tus fotos              │
 *     │  [ Entregar mi semana ]                         │
 *     ├ Las semanas anteriores ─────────────────────────┤
 *     │  Check-in semanal  [L][M][X][J][V][S][D] ←──────┼── 2 (siete casillas
 *     │  Tendencia ▁▂▃▄▅  ·  Promedio de la semana      │      escribibles)
 *     │  Último peso · Media 3 · Variación · Ritmo      │
 *     │  Historial de registros …  61,0  🗑 ←───────────┼── 3 (y con papelera)
 *     └─────────────────────────────────────────────────┘
 *
 * Lo de abajo era `AnthropometryPanel audience="client"`: **el instrumento del
 * entrenador**, con sus siete casillas, su gráfica de ejes, cuatro teselas de
 * análisis y una tabla de treinta y un registros con papelera por fila. Todo
 * ello a 1.560 px de ancho y debajo del botón de entregar, que es el gesto por
 * el que existe la pantalla.
 *
 * ══ Lo que se hace y lo que se mira, en dos columnas ═══════════════════════
 *
 * Es la gramática que ya tienen Entreno y Dieta —mesa a la izquierda, costado a
 * la derecha—, que es lo que hace que el portal se lea como un producto y no
 * como seis pantallas:
 *
 *     ┌ mesa ─────────────────────────────┐ ┌ costado ──────────┐
 *     │ 1. Tu peso de hoy                 │ │ Tu media          │
 *     │ 2. Lo que te falta para entregar  │ │  60,9 kg          │
 *     │ 3. Lo que te dijo la vez pasada   │ │  la anterior 61,2 │
 *     │ 4. Tus semanas                    │ │  ▁▂▃▄▅            │
 *     └───────────────────────────────────┘ └───────────────────┘
 *
 * ── La media sube al costado, y en grande ─────────────────────────────────
 * Es «lo que el sistema va haciendo de cara a la revisión», o sea la cifra por
 * la que esta pantalla existe, y vivía en una línea de 12 px al pie de la
 * báscula. Ahora es la cifra de la pantalla y la báscula deja de decirla
 * (`conMedia={false}`): una cifra, un sitio.
 *
 * ── Y el rastro, al pie y SIN báscula (19 sep 2026) ───────────────────────
 * Estuvo detrás de una tarjeta del costado, en `/mi/evolucion/medidas`: la
 * báscula del entrenador en versión cliente, con sus casillas y su papelera.
 * El dueño la llamó «un resquicio» y pidió el historial aquí. Vuelve al pie,
 * pero no como el 14 de septiembre —cuando montarla aquí produjo las tres
 * básculas—: `TusSemanas` solo LEE. El peso se apunta arriba y en ningún otro
 * sitio; lo único que se hace en el rastro es quitar un pesaje mal apuntado.
 *
 * ── Ni una cifra que juzgue ───────────────────────────────────────────────
 * La media, la anterior y la línea. Sin flecha de color, sin «vas bien» y sin
 * ritmo semanal: eso es lectura de entrenador y aquí sería puntuarle la semana
 * a quien todavía la está entregando. Ver `la app no receta` y `la ley del
 * color`.
 */
const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const RevisionEnMonitor = ({ datos }) => {
  const { pasos, entrega, peso, media, respuesta } = datos;

  return (
    <div className="layout">
      <div className="entrega-pagina">
        <div className="entrega">
          <div className="entrega-mesa">
            {/* 1. APUNTAR, y lo primero. Con el peso oculto no existe:
                   `datos.peso` llega a null desde la ruta. */}
            {peso ? <PesoDeHoy {...peso} conMedia={false} /> : null}

            {/* 2. Lo que falta, y el verbo. */}
            <PasosDeLaEntrega
              pasos={pasos}
              onPaso={entrega.onPaso}
              onEntregar={entrega.onEntregar}
              yaEntregada={entrega.yaEntregada}
              entregadaEl={entrega.entregadaEl}
              cerrada={entrega.cerrada}
            />

            {/* 3. Lo que te contestó. Es un texto suyo, así que va en su
                   superficie y no como una fila más de una lista. Y va en la
                   mesa y no en el costado: en 300 px un párrafo de su
                   entrenador sale en columna de periódico. */}
            {respuesta ? (
              <div className="col gap-3">
                <GroupHead title="Lo que te dijo la vez pasada" sub={respuesta.cuando} />
                <Panel>
                  <p className="t-secondary">{respuesta.texto}</p>
                </Panel>
              </div>
            ) : null}

            {/* 4. Mirar atrás, cuando ya está hecho lo de arriba. */}
            <TusSemanas />
          </div>

          <aside className="entrega-lado es-panel" aria-label="Tu media">
            {media ? <TuMedia {...media} /> : null}
          </aside>
        </div>
      </div>
    </div>
  );
};

/**
 * TU MEDIA: la cifra con la que se lee la semana.
 *
 * No es el último pesaje. Un pesaje suelto se mueve un kilo por la sal de
 * anoche; la media de los de la semana es lo que de verdad dice si el peso sube
 * o baja, y es lo que su entrenador mira al abrir la revisión. Por eso es la
 * cifra grande de esta pantalla y no un apunte al pie de la báscula.
 *
 * La línea son las medias SEMANALES, no los pesajes: cuarenta puntos diarios
 * son ruido con forma de dato. La misma decisión que ya tomó «Tú».
 */
const TuMedia = ({ ahora, anterior, pesajes, pedidos, puntos }) => (
  <section className="lado-tarjeta">
    <div className="lado-cab">
      <span className="section-label">Tu media</span>
      <span className="lado-desde">
        {pesajes === 0
          ? 'sin pesajes esta semana'
          : `${pesajes} ${pesajes === 1 ? 'pesaje' : 'pesajes'}${pedidos ? ` de ${pedidos}` : ''}`}
      </span>
    </div>

    {ahora === null ? (
      /* Un vacío que INVITA y no se disculpa: dice qué hacer para que salga la
         cifra, que está justo a la izquierda. */
      <p className="t-sm t-secondary">Apunta tu peso y la media sale sola.</p>
    ) : (
      <>
        <div className="objetivo-cifra">
          <span className="v">{kg(ahora)}</span>
          <span className="u">kg</span>
        </div>
        {anterior !== null && (
          <span className="lado-desde">la semana anterior {kg(anterior)} kg</span>
        )}
      </>
    )}

    {puntos.length > 1 && (
      <Sparkline points={puntos} color={metricColor('weight')} height={34} />
    )}
  </section>
);
