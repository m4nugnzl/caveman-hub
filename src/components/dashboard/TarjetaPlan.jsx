import { Link } from 'react-router-dom';

import { directionById, targetRateKg } from '@/domain/goals';
import { WEEK_DAYS, isRestDay, trainingDayCount } from '@/domain/training';
import { fmt } from '@/lib/num';
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
  const dias = program?.weeklySplit ? trainingDayCount(program.weeklySplit) : null;
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

  const sub = conMacros
    ? `${media ? 'De media · ' : ''}P ${fmt(macros.protein)} · C ${fmt(macros.carbs)} · G ${fmt(macros.fats)} g`
    : kcal
      ? 'sin macros definidos'
      : null;

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

  return (
    <Tarjeta rotulo={isClient ? 'Tu plan' : 'El plan'} span={12}>
      <ul className="palancas">
        <Palanca
          k="Objetivo"
          valor={direction?.label || (isClient ? 'Sin objetivo' : invita('Ponle objetivo'))}
          texto
          sub={ritmo !== null && !oculto.weight ? `${kg(ritmo)} kg por semana` : null}
          a={puerta(onAbrirFases)}
        />
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
