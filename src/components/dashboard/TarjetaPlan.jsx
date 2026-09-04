import { Link } from 'react-router-dom';

import { directionById, targetRateKg } from '@/domain/goals';
import { WEEK_DAYS, isRestDay, trainingDayCount } from '@/domain/training';
import { fmt } from '@/lib/num';
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
  isClient = false,
}) => {
  const direction = goal ? directionById(goal.direction) : null;
  const ritmo = targetRateKg(goal, pesoActual);
  const dias = program?.weeklySplit ? trainingDayCount(program.weeklySplit) : null;
  const reparto = program?.weeklySplit
    ? [...new Set(WEEK_DAYS.map((d) => program.weeklySplit[d]).filter((v) => v && !isRestDay(v)))]
    : [];
  const cardio = String(plan?.cardioGoal || '').trim();
  const pasos = Number(plan?.stepsGoal) || null;
  const conMacros = plan?.proteinGrams || plan?.carbsGrams || plan?.fatsGrams;

  /* En el portal las palancas son texto: el cliente mira su plan, no lo cambia,
     y una fila que se enciende al pasar por encima promete algo que al pulsar
     no pasa. */
  const puerta = (destino) => (isClient ? null : destino);

  return (
    <Tarjeta rotulo={isClient ? 'Tu plan' : 'El plan'} span={12}>
      <ul className="palancas">
        <Palanca
          k="Objetivo"
          valor={direction?.label || 'Sin objetivo'}
          texto
          sub={ritmo !== null ? `${kg(ritmo)} kg por semana` : null}
          a={puerta(onAbrirFases)}
        />
        {conDieta && (
          <Palanca
            k="Calorías"
            valor={
              <>
                {fmt(plan?.targetKcals) || '—'}
                <small> kcal</small>
              </>
            }
            sub={
              conMacros
                ? `P ${fmt(plan?.proteinGrams)} · C ${fmt(plan?.carbsGrams)} · G ${fmt(plan?.fatsGrams)} g`
                : 'sin macros definidos'
            }
            a={puerta(aDieta)}
          />
        )}
        {conDieta && (
          <Palanca
            k="Pasos"
            valor={
              <>
                {pasos ? pasos.toLocaleString('es-ES') : '—'}
                {pasos && <small> al día</small>}
              </>
            }
            a={puerta(aDieta)}
          />
        )}
        {conDieta && <Palanca k="Cardio" valor={cardio || '—'} texto a={puerta(aDieta)} />}
        {conEntreno && (
          <Palanca
            k="Entreno"
            valor={
              <>
                {dias ?? '—'}
                {dias !== null && <small> {dias === 1 ? 'día' : 'días'} a la semana</small>}
              </>
            }
            sub={reparto.length > 0 ? reparto.join(' · ') : null}
            a={puerta(aEntreno)}
          />
        )}
      </ul>
    </Tarjeta>
  );
};
