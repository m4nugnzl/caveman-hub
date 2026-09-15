import { miles } from '@/lib/dates';

/**
 * EL OTRO MANDO: las dietas que tiene montadas, una tarjeta cada una.
 *
 * ══ Qué sustituye, y por qué no bastaban los chips ═════════════════════════
 *
 * A una fila de píldoras con el nombre y nada más. Y el nombre solo no contesta
 * la pregunta que trae aquí a alguien: **cuál es la mía y en qué se diferencian**.
 * «Alto» y «Bajo» son nombres que escribió su entrenador; lo que distingue a una
 * de otra es cuántos días le toca cada una y cuánto mide.
 *
 * Así que cada dieta trae lo que hay que saber para elegir cuál mirar —cuántos
 * días de su ciclo, sus kcal y sus macros— y la de hoy viene marcada, porque la
 * pregunta de verdad casi siempre es «¿esta es la mía?».
 *
 * ══ Por qué es un `tablist` y no una lista de opciones ═════════════════════
 *
 * Porque aquí no se elige nada: se elige QUÉ SE MIRA. La tarjeta de opción de la
 * casa (`OptionCard`) monta sobre un `radio`, y un lector de pantalla anunciaría
 * «botón de opción, 1 de 3» a alguien que está navegando, no rellenando. Es la
 * misma semántica que la cinta de días, que es el mando hermano.
 *
 * ── Sirve con dos y con siete ─────────────────────────────────────────────
 * Las columnas se cuentan solas (`auto-fit`): da igual que su entrenador monte
 * dos dietas o siete, la página no cambia de forma, cambia de lista. Esa es
 * justo la avería que se arregló al matar las dos dietas enteras en paralelo.
 *
 * @param reparto  `repartoDelCiclo(...)` — cada dieta con sus casillas.
 * @param activa   El `dayId` que se está mirando.
 * @param hoy      El `dayId` que le toca hoy, o `null`.
 * @param sinCifras Con las kcal ocultas se va la cifra y se quedan los días.
 * @param onDieta  Al pulsar una.
 */
export const TarjetasDeDietas = ({ reparto, activa, hoy = null, sinCifras = false, onDieta }) => (
  <div className="dietas-lista" role="tablist" aria-label="Tus dietas">
    {reparto.map((dieta) => {
      const esta = dieta.id === activa;
      const macros = [
        ['P', dieta.targets?.proteinGrams],
        ['C', dieta.targets?.carbsGrams],
        ['G', dieta.targets?.fatsGrams],
      ].filter(([, v]) => Number(v) > 0);

      return (
        <button
          key={dieta.id}
          type="button"
          role="tab"
          aria-selected={esta}
          className={`dietas-d${esta ? ' is-on' : ''}`}
          onClick={() => onDieta(dieta.id)}
        >
          {/* «Hoy», y solo cuando de verdad hay un hoy: en un ciclo rotativo no
              existe, y marcar una cualquiera sería inventarlo. */}
          {dieta.id === hoy && <span className="dietas-d-hoy">Hoy</span>}
          <span className="dietas-d-dias">{cuantosDias(dieta.dias)}</span>
          <span className="dietas-d-nm">{dieta.name}</span>
          {!sinCifras && dieta.kcal > 0 && (
            <span className="dietas-d-k">{miles(dieta.kcal)} kcal</span>
          )}
          {!sinCifras && macros.length > 0 && (
            <span className="dietas-d-m">
              {macros.map(([k, v]) => `${Math.round(Number(v))} ${k}`).join(' · ')}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

/**
 * «3 días de tu ciclo». Y sin ninguno, se dice: una dieta montada que no está
 * repartida no le toca nunca, y eso es exactamente lo que hay que saber para no
 * buscarla en la semana.
 */
const cuantosDias = (dias) => {
  if (dias === 0) return 'Sin repartir';
  return dias === 1 ? '1 día de tu ciclo' : `${dias} días de tu ciclo`;
};
