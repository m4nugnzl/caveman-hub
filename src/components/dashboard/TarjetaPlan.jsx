import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';

import { directionById, targetRateKg } from '@/domain/goals';
import { WEEK_DAYS, isRestDay, trainingDayCount } from '@/domain/training';
import { fmt } from '@/lib/num';
import { MACRO_META, macroBreakdown } from '@/components/nutrition/macros';
import { useOculto } from '@/components/Client/Oculto';
import { Tarjeta } from './Tarjeta';

const kg = (v) => `${v > 0 ? '+' : ''}${Number(v).toLocaleString('es-ES', { maximumFractionDigits: 2 })}`;

/**
 * Una palanca: su rótulo, su cifra y, si se puede tocar, la puerta a donde se
 * toca.
 *
 * ══ Por qué la fila ENTERA es la puerta ════════════════════════════════════
 *
 * Antes había dos enlaces genéricos al pie de la tarjeta —«Ajustar la dieta →»
 * y «Ajustar el entreno →»—, y eso obligaba a un paso de traducción por cada
 * cambio: ves «Pasos 11.000», quieres subirlos, y tienes que bajar la vista,
 * decidir cuál de los dos enlaces contiene los pasos y buscarlos al llegar.
 *
 * Entreno y Dieta no funcionan así: cada cosa se toca donde se ve. Aquí no se
 * puede tocar en el sitio —esta tarjeta es una lectura, no un formulario— pero
 * sí se puede llevar a cada una a SU sitio, que es la mitad del gesto.
 *
 * ── La flecha se ve siempre, y no solo al pasar por encima ──────────────────
 * Una fila que solo se anuncia al pasar el ratón no existe para quien no pasa
 * el ratón —el teclado, el dedo—, y además obliga a barrer la tarjeta para
 * descubrir qué es pulsable. Apagada dice «esto lleva a algún sitio» sin pesar;
 * al enfocar o al pasar por encima se enciende.
 *
 * @param a  Destino. Una ruta la abre como enlace; una función, como botón —el
 *   objetivo no vive en otra pantalla, se edita en la ventana de las fases—. Sin
 *   destino la fila es texto, que es lo que ve el cliente en su portal.
 */
const Palanca = ({ k, valor, sub, a = null, texto = false }) => {
  const dentro = (
    <>
      <span className="palanca-k">
        {k}
        {/* Aquí colgaba la flecha de la fila. Ya no: una palanca que lleva a
            algún sitio lo dice con su rótulo en acento y encendiéndose entera
            al pasar. Ver «LO QUE SE PULSA SE ENCIENDE» en `revision.css`. */}
      </span>
      <span className={`palanca-v${texto ? ' is-texto' : ''}`}>{valor}</span>
      {sub && <span className="palanca-s">{sub}</span>}
    </>
  );

  if (typeof a === 'string') {
    return (
      <li>
        <Link className="palanca is-puerta" to={a}>
          {dentro}
        </Link>
      </li>
    );
  }
  if (typeof a === 'function') {
    return (
      <li>
        <button type="button" className="palanca is-puerta" aria-haspopup="dialog" onClick={a}>
          {dentro}
        </button>
      </li>
    );
  }
  return (
    <li>
      <div className="palanca">{dentro}</div>
    </li>
  );
};

/**
 * EL PLAN — lo que tiene puesto, en la columna de al lado.
 *
 * ══ Por qué va a la derecha y no en el mosaico ═════════════════════════════
 *
 * Entreno y Dieta ya tienen esta forma: el trabajo a lo ancho y, al lado, lo
 * que se decidió una vez y se consulta muchas —el objetivo, contra lo que se
 * cuadra cada comida—. El Resumen sigue la misma gramática: a la izquierda lo
 * que PASA (cómo va, el cuerpo, el entreno) y a la derecha lo que le has PUESTO
 * para que pase. Es la receta, y la receta no compite con el resultado.
 *
 * Una fila por palanca, sin barras: 2.300 kcal es una cifra que se pone, no
 * una que se mide. Y cada fila lleva a donde se pone (ver `Palanca`).
 */
export const TarjetaPlan = ({
  goal,
  pesoActual,
  plan,
  program,
  conDieta,
  conEntreno,
  aDieta,
  aEntreno,
  onAbrirFases,
  /* La foto del ciclo de esta persona (`cycleFoto`): con el ciclo repartido, la
     fila de calorías es su media ponderada y no el primer día del plan. */
  ciclo = null,
  isClient = false,
}) => {
  /* Su plan sin las cifras que no le vuelven: la palanca de calorías se retira
     entera —es kcal y macros y nada más— y el ritmo del objetivo también, que
     son kilos por semana con otro nombre. Lo que queda es lo que sí puede
     leer: qué busca, cuántos pasos, qué cardio y cuántos días entrena. */
  const oculto = useOculto();
  const direction = goal ? directionById(goal.direction) : null;
  const ritmo = targetRateKg(goal, pesoActual);
  /* Cero días pautados es lo mismo que no haber pautado, y por eso se cuenta
     como hueco y no como cifra: el semanal existe —el bloque se creó— pero no
     tiene un solo día con trabajo dentro, y «0 días a la semana» ocupaba con un
     dato falso el sitio donde va «Monta su rutina». Era la única de las cinco
     palancas que miraba `!== null` en vez de si hay algo; las otras cuatro ya
     dejan caer el cero al verbo (`kcal ?`, `pasos ?`, `cardio ||`). */
  const diasPautados = program?.weeklySplit ? trainingDayCount(program.weeklySplit) : 0;
  const dias = diasPautados > 0 ? diasPautados : null;
  const reparto = program?.weeklySplit
    ? [...new Set(WEEK_DAYS.map((d) => program.weeklySplit[d]).filter((v) => v && !isRestDay(v)))]
    : [];
  const cardio = String(plan?.cardioGoal || '').trim();
  const pasos = Number(plan?.stepsGoal) || null;

  /*
    ══ LAS CALORÍAS DE UN CICLADO NO SON LAS DEL PRIMER DÍA ═══════════════════

    Esta fila leía `plan.targetKcals`, que es la columna heredada, o sea el
    primer día del plan. A quien come 3.100 los días de entreno y 2.400 los de
    descanso, el Resumen le decía «3.100 kcal» a secas —una cifra que come seis
    días de cada nueve, presentada como su plan— mientras la dieta, dos clics
    más allá, decía «de media, 2.867».

    Con el ciclo repartido manda la MEDIA PONDERADA y se dice de qué días sale.
    Sin repartir no se pondera nada y se enseña lo que hay, que es lo que había.
    La regla vive una vez, en `cycleFoto`, y la usan también la foto del pesaje y
    la de la revisión: una sola cifra de calorías en toda la aplicación.
  */
  const media = ciclo?.de === 'media';
  const kcal = ciclo?.kcals ?? plan?.targetKcals ?? null;
  const macros = media
    ? { protein: ciclo.protein, carbs: ciclo.carbs, fats: ciclo.fats }
    : { protein: plan?.proteinGrams, carbs: plan?.carbsGrams, fats: plan?.fatsGrams };
  const conMacros = macros.protein || macros.carbs || macros.fats;

  /*
    ══ EL REPARTO, EN SU PROPIO RENGLÓN (frame 262:71, 17 sep) ═══════════════

    Los macros iban de pie de la fila de calorías —«De media · P 128 · C 205 ·
    G 59 g»— en tinta terciaria y a 12 px. El frame les da renglón propio, con
    su rótulo, sus tres gramajes en tinta plena y la BARRA del reparto debajo
    con su leyenda.

    Y la barra vale aquí aunque no valga en el costado de la dieta, donde está
    escrito que se quitó (ver `MacroBar`): allí competía con `MacroLista`, que
    dice los mismos tres macros dos renglones más abajo, y encima con el ámbar
    del semáforo cerca. En «El plan» no hay nada más que diga el REPARTO: la
    línea de gramos dice cuánto de cada uno, y la barra —que son tres tramos y
    ni un número— dice de qué forma es esa dieta de un solo vistazo.
  */
  const reparto3 = conMacros ? macroBreakdown({ ...macros, kcals: kcal }) : null;
  const conReparto = Boolean(reparto3) && !reparto3.empty && conDieta && !oculto.nutrition;
  const sub = kcal && !conMacros ? 'sin macros definidos' : null;

  /* En el portal las palancas son texto: el cliente mira su plan, no lo cambia,
     y una fila que se enciende al pasar por encima promete algo que al pulsar
     no pasa. */
  const puerta = (destino) => (isClient ? null : destino);

  /* ── El hueco invita, la raya constata (Q-05, 6 sep) ──────────────────────
     Un plan a medio poner era una columna de «—»: un inventario de ausencias
     que no dice dónde se arregla. Para el COACH, el hueco dice su verbo — y
     la fila, que ya era la puerta, ahora además dice a qué viene. El portal
     conserva la raya: al cliente no se le invita a editar lo que no edita. */
  const invita = (verbo) => (isClient ? '—' : <span className="palanca-invita">{verbo}</span>);

  /* El lápiz de la cabecera (frame 262:62): lo que dice es que esta caja SE
     TOCA. Lleva a donde vive la mayor parte del plan —la dieta, que es kcal,
     macros, pasos y cardio— y, a quien solo entrena, a su rutina. No sustituye
     a las filas, que siguen llevando cada una a lo suyo; es la puerta de la
     tarjeta, que antes no tenía ninguna. */
  const lapiz = isClient ? null : conDieta ? aDieta : conEntreno ? aEntreno : null;

  return (
    <Tarjeta
      rotulo={isClient ? 'Tu plan' : 'El plan'}
      span={12}
      className="plan"
      accion={
        lapiz ? (
          <Link className="cab-icono" to={lapiz} aria-label="Ajustar el plan" title="Ajustar el plan">
            <Pencil size={15} strokeWidth={2} />
          </Link>
        ) : null
      }
    >
      <ul className="palancas">
        <Palanca
          k="Objetivo"
          valor={direction?.label || (isClient ? 'Sin objetivo' : invita('Ponle objetivo'))}
          texto
          sub={ritmo !== null && !oculto.weight ? `${kg(ritmo)} kg por semana` : null}
          a={puerta(onAbrirFases)}
        />
        {conReparto && (
          <li>
            <div className="palanca is-macros">
              <span className="palanca-k">Macros{media ? <em> de media</em> : null}</span>
              <span className="palanca-macros">
                {MACRO_META.map(({ key, short }) => `${short} ${fmt(macros[key])} g`).join(' · ')}
              </span>
              <span className="macro-bar" aria-hidden="true">
                {MACRO_META.map(({ key, label, color }) => (
                  <div
                    key={key}
                    style={{ width: `${reparto3.pct[key]}%`, background: color }}
                    title={`${label}: ${reparto3.pct[key]} %`}
                  />
                ))}
              </span>
              <span className="macro-leyenda">
                {MACRO_META.map(({ key, label, color }) => (
                  <span key={key}>
                    <i style={{ background: color }} />
                    {label}
                  </span>
                ))}
              </span>
            </div>
          </li>
        )}
        {conDieta && !oculto.nutrition && (
          <Palanca
            k="Calorías"
            valor={
              kcal ? (
                <>
                  {fmt(kcal)}
                  <small> kcal</small>
                </>
              ) : (
                invita('Fija sus calorías')
              )
            }
            texto={!kcal && !isClient}
            sub={sub}
            a={puerta(aDieta)}
          />
        )}
        {conDieta && (
          <Palanca
            k="Pasos"
            valor={
              pasos ? (
                <>
                  {pasos.toLocaleString('es-ES')}
                  <small> al día</small>
                </>
              ) : (
                invita('Ponle pasos')
              )
            }
            texto={!pasos && !isClient}
            a={puerta(aDieta)}
          />
        )}
        {conDieta && <Palanca k="Cardio" valor={cardio || invita('Ponle cardio')} texto a={puerta(aDieta)} />}
        {conEntreno && (
          <Palanca
            k="Entreno"
            valor={
              dias !== null ? (
                <>
                  {dias}
                  <small> {dias === 1 ? 'día' : 'días'} a la semana</small>
                </>
              ) : (
                invita('Monta su rutina')
              )
            }
            texto={dias === null && !isClient}
            sub={reparto.length > 0 ? reparto.join(' · ') : null}
            a={puerta(aEntreno)}
          />
        )}
      </ul>
    </Tarjeta>
  );
};
