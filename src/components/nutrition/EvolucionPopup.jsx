import {
  chronological,
  kcalSteps,
  lastKcalChange,
  reverseChronological,
  weightSeries,
} from '@/domain/anthropometry';
import { macroColor } from '@/domain/nutrition';
import { metricColor } from '@/domain/metrics';
import { localeNumber, shortDate } from '@/lib/dates';
import { toNum } from '@/lib/num';
import { Modal } from '@/components/ui/Modal';
import { BandChart } from '@/components/ui/charts';

/**
 * LA EVOLUCIÓN: lo que le pautaste contra lo que hizo el peso.
 *
 * ══ El dato llevaba meses guardado y no lo enseñaba nadie ══════════════════
 *
 * Cada pesaje y cada revisión guardan una foto de los macros del día, y
 * `kcalSeries` tenía pruebas y CERO llamadas en toda la interfaz. O sea que el
 * historial de la dieta existía, estaba fechado y estaba huérfano.
 *
 * Esto es leerlo, y es también lo que hace innecesario declarar «tramos» a mano:
 * el eje del tiempo de una dieta no hay que mantenerlo, se dibuja.
 *
 * ── Y son DOS fuentes, no una ─────────────────────────────────────────────
 * Esta ventana leía solo `log.nutrition` —la foto del PESAJE—, mientras la
 * pantalla de revisión leía `check_ins.snapshot` —la del plan al cerrar la
 * revisión—. Un cliente que se pesa desde el portal tiene decenas de pesajes sin
 * foto, así que aquí salía plano y allí salía la escalera entera. Lo que llega
 * ahora es `dietLog`, que junta las dos: ver `domain/timeline.js`.
 *
 * ── Tres gráficas y no una con tres ejes ──────────────────────────────────
 * Kilocalorías, kilos y gramos no comparten escala ni de lejos —2.400 contra 78
 * contra 180—, así que en una sola banda la línea del peso sería una raya plana
 * pegada al suelo. Van una encima de otra, con el mismo eje de fechas: comparar
 * es leer en vertical, que es como se compara una escalera con una pendiente.
 *
 * ── Y los macros, que llevaban aquí desde el principio sin dibujarse ──────
 * La foto de cada fecha guarda los tres, y hasta ahora solo salían como cifras
 * en la tabla de abajo. Con la escalera de kcal sola no se puede contestar la
 * pregunta que hace cualquiera que programe un ciclado: **de dónde salieron
 * esas calorías**. Bajar 300 kcal quitando hidratos y bajarlas quitando grasa
 * son dos decisiones distintas y la gráfica las dibujaba iguales.
 *
 * Los tres comparten banda porque comparten unidad —gramos— y porque la lectura
 * es justo la comparación entre ellos. Cada uno con el color que ya tiene en
 * toda la aplicación (`macroColor`), que es dato dentro de un gráfico y por
 * tanto donde el color sí trabaja.
 *
 * ── Y sigue sin recetar ───────────────────────────────────────────────────
 * «Le bajaste 250 kcal el 6 jul; desde entonces, −2,4 kg» es información. Qué
 * hacer con ella es del entrenador: aquí no aparece ningún «súbele 150».
 */
const MACROS_FOTO = [
  { key: 'protein', short: 'P', label: 'Proteína' },
  { key: 'carbs', short: 'C', label: 'Carbos' },
  { key: 'fats', short: 'G', label: 'Grasas' },
];

const signo = (n) => `${n > 0 ? '+' : '−'}${localeNumber(Math.abs(n))}`;

/**
 * «Media de 9 días: High ×6 3.100 · Low ×3 2.400», o nada.
 *
 * Sale de lo que guardó la foto de esa fecha (`cycleFoto`), no del plan de hoy:
 * el reparto de julio era el de julio y leerlo de la dieta actual sería inventar
 * un pasado con los datos del presente.
 */
const diasDe = (r) => {
  const ciclo = r?.nutrition;
  if (!Array.isArray(ciclo?.cycle) || ciclo.cycle.length < 2) return undefined;
  const dias = ciclo.cycle
    .map((d) => `${d.n}${d.x ? ` ×${d.x}` : ''}${d.kcals ? ` ${localeNumber(Math.round(d.kcals))}` : ''}`)
    .join(' · ');
  return ciclo.de === 'media' ? `Media de ${ciclo.reparto} días · ${dias}` : dias;
};

export const EvolucionPopup = ({ open, onClose, registros: raw = [] }) => {
  const registros = chronological(raw);
  const pesos = weightSeries(raw);
  const cambios = kcalSteps(raw);
  const ultimo = lastKcalChange(raw);

  /* El eje son las fechas de los pesajes: es donde hay dato de las dos series y
     es la cadencia real con la que esto se mira. */
  const labels = registros.map((r) => r.date);
  const conKcal = registros.filter((r) => toNum(r.nutrition?.kcals) !== null);

  /* De qué habla la escalera: `de` lo dice desde que la foto guarda el ciclo
     (`cycleFoto`). Una foto vieja no lo trae, y entonces era un día del plan —de
     ahí el `hayDia` cuando además hay medias con las que se mezclaría—. */
  const hayMedia = conKcal.some((r) => r.nutrition?.de === 'media');
  const hayDia = hayMedia && conKcal.some((r) => r.nutrition?.de !== 'media');

  return (
    <Modal open={open} size="lg" title="La evolución · lo pautado contra el peso" onClose={onClose}>
      <div className="col gap-4">
        <div className="bloque-cifras">
          {/* Los PESAJES, no los registros: la lista de abajo lleva además las
              fotos que dejó cada revisión cerrada, que no son pesajes. Contarlos
              todos aquí diría que esta persona se ha pesado más veces de las que
              se ha pesado. */}
          <div className="bloque-cifra">
            <span className="v">{pesos.length}</span>
            <span className="k">{pesos.length === 1 ? 'pesaje registrado' : 'pesajes registrados'}</span>
          </div>
          <div className="bloque-cifra">
            <span className="v">{cambios.length}</span>
            <span className="k">{cambios.length === 1 ? 'cambio de kcal' : 'cambios de kcal'}</span>
          </div>
          {ultimo && (
            <div className="bloque-cifra">
              <span className="v">{signo(ultimo.delta)}</span>
              <span className="k">kcal el {shortDate(ultimo.date)}</span>
            </div>
          )}
          {ultimo && ultimo.weightDelta !== null && (
            <div className="bloque-cifra">
              <span className="v">{signo(ultimo.weightDelta)}</span>
              <span className="k">kg desde entonces</span>
            </div>
          )}
        </div>

        <section className="bloque-seccion">
          <h3 className="bloque-titulo">El peso, pesaje a pesaje</h3>
          <BandChart
            labels={labels}
            series={[
              {
                id: 'peso',
                label: 'Peso',
                color: metricColor('weight'),
                unit: ' kg',
                decimals: 1,
                points: pesos.map((p) => ({ label: p.date, value: p.value })),
              },
            ]}
            height={130}
            emptyMessage="Sin pesajes todavía."
          />
        </section>

        <section className="bloque-seccion">
          <h3 className="bloque-titulo">Las kcal que tenía pautadas en cada uno</h3>
          {/*
            ══ DE QUÉ CIFRA HABLA LA ESCALERA ═══════════════════════════════

            «No tiene mucho sentido que las gráficas muestren tanto high como
            low y la media, pero le des clic a la gráfica principal de kcals y
            solo muestre high.»

            Y era verdad hasta hoy: la foto de cada fecha guardaba
            `targetKcals`, o sea el PRIMER día del plan, así que en un ciclado
            esta escalera dibujaba el alto y lo rotulaba «lo que tenía
            pautado». Ahora la foto guarda la media ponderada del ciclo con los
            días detrás (ver `cycleFoto`), que es la cifra que el costado de la
            dieta lleva dando desde siempre.

            Se dice, y se dice solo cuando hace falta: con un solo día no hay
            media que explicar. Y las fotos ANTERIORES a este cambio siguen
            siendo lo que eran —una cifra de un día— así que también se dice,
            en vez de mezclarlas en silencio con las nuevas.
          */}
          {(hayMedia || hayDia) && (
            <p className="t-xs t-tertiary">
              {hayMedia && 'De un ciclado se dibuja la media ponderada del ciclo, no un día suelto.'}
              {hayMedia && hayDia && ' '}
              {hayDia && 'Las fechas anteriores a este cambio guardaron un solo día del plan.'}
            </p>
          )}
          <BandChart
            labels={labels}
            series={[
              {
                id: 'kcal',
                label: 'Kcal pautadas',
                color: metricColor('kcals'),
                unit: ' kcal',
                points: conKcal.map((r) => ({ label: r.date, value: toNum(r.nutrition.kcals) })),
              },
            ]}
            height={130}
            showArea={false}
            emptyMessage="Ni sus pesajes ni sus revisiones cerradas guardaron todavía qué tenía pautado: en cuanto haya una, la escalera empieza a dibujarse."
          />
        </section>

        <section className="bloque-seccion">
          <h3 className="bloque-titulo">Y de dónde salían esas kcal, en gramos</h3>
          <BandChart
            labels={labels}
            series={MACROS_FOTO.map((m) => ({
              id: m.key,
              label: m.label,
              color: macroColor(m.key),
              unit: ' g',
              decimals: 0,
              points: registros
                .filter((r) => toNum(r.nutrition?.[m.key]) !== null)
                .map((r) => ({ label: r.date, value: toNum(r.nutrition[m.key]) })),
            }))}
            height={130}
            showArea={false}
            emptyMessage="Sin macros guardados todavía: llegan con el primer pesaje o la primera revisión cerrada."
          />
        </section>

        <section className="bloque-seccion">
          <h3 className="bloque-titulo">Cada fecha, con lo que estaba pautado</h3>
          <div className="evo-tabla">
            <div className="evo-fila is-cab" aria-hidden="true">
              <span>Fecha</span>
              <span className="is-num">Peso</span>
              <span className="is-num">Kcal</span>
              {MACROS_FOTO.map((m) => (
                <span key={m.key} className="is-num">
                  {m.short}
                </span>
              ))}
            </div>
            {reverseChronological(raw).map((r) => {
              const kcals = toNum(r.nutrition?.kcals);
              const cambio = cambios.find((c) => c.date === r.date);
              return (
                <div className="evo-fila" key={r.id || r.date}>
                  <span className="evo-cuando">
                    {shortDate(r.date)}
                    {/* El cambio se marca EN su fila: es la fecha en la que la
                        escalera de arriba da el escalón, y sin la marca hay que
                        cruzar las dos cosas a ojo. */}
                    {cambio && <b className="evo-cambio">{signo(cambio.delta)} kcal</b>}
                  </span>
                  <span className="is-num">{toNum(r.weight) === null ? '—' : `${localeNumber(r.weight)} kg`}</span>
                  {/* De qué días sale la media de esa fecha, al pasar por
                      encima: en la tabla no cabe una segunda línea por fila y
                      la pregunta —«¿de dónde salen esas 2.867?»— solo se hace
                      delante de una fila concreta. */}
                  <span className="is-num" title={diasDe(r)}>
                    {kcals === null ? '—' : Math.round(kcals)}
                  </span>
                  {MACROS_FOTO.map((m) => {
                    const g = toNum(r.nutrition?.[m.key]);
                    return (
                      <span key={m.key} className="is-num">
                        {g === null ? '—' : `${Math.round(g)} g`}
                      </span>
                    );
                  })}
                </div>
              );
            })}
            {registros.length === 0 && (
              <p className="t-sm t-tertiary">
                Aún no hay ninguna fecha con dato: ni pesajes, ni revisiones cerradas. En cuanto haya una, aquí queda lo que tenía pautado ese día.
              </p>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
};
