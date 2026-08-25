/**
 * La plantilla de alta del entrenador: qué pasos da al empezar con alguien.
 *
 * Mismo trato que `protocolTemplate.js` y por el mismo motivo: vive en
 * `profiles.preferences.intakeTemplate` (migración 0035) y ya no en el navegador,
 * así que le sigue de un ordenador a otro. Lo que quedara guardado en local se
 * rescata una vez y se limpia.
 *
 * De la plantilla solo salen la DEFINICIÓN —qué pasos existen y en qué orden— y
 * los pasos propios. Lo hecho y los enlaces son de cada cliente y no tendría
 * sentido guardarlos aquí: el vídeo de la rutina de Marta no es el de Luis.
 */

import { clientIntake, defaultIntake } from '@/domain/intake';

const key = (userId) => `caveman-intake:${userId || 'anon'}`;

/** La plantilla de alta guardada, o `null` si el entrenador no tiene ninguna. */
export const intakeTemplateFrom = (coachPrefs) => {
  const raw = coachPrefs?.intakeTemplate;
  if (!raw || typeof raw !== 'object') return null;
  return clientIntake({ intake: raw });
};

/**
 * Lo que se guarda: solo la definición.
 *
 * Ni `done` ni `links` ni `files`: son de cada cliente. Guardarlos en la
 * plantilla haría que «aplicar a todos» repartiera el vídeo de uno a los demás.
 *
 * ══ `owners` SÍ es definición, y se quedaba fuera ══════════════════════════
 *
 * Era el fallo más silencioso de todo el alta: el reparto —«esto me lo entrega
 * él», «esto lo hago yo»— es la mitad de lo que se decide en esa pantalla, y al
 * guardar la plantilla se tiraba. El botón de cambiar de lado movía la fila
 * delante de tus ojos, la pantalla no daba ningún error, y al recargar volvía a
 * su sitio de siempre. Y a los clientes nuevos les llegaba el reparto del
 * catálogo, no el tuyo.
 *
 * Es definición y no estado: de quién es un paso lo decide el entrenador una vez
 * para todos, exactamente igual que qué pasos hay. Lo que es de cada cliente es
 * si lo ha entregado y qué tiene enlazado, y eso sigue fuera.
 */
export const intakeTemplateToPreferences = (intake) => ({
  steps: intake.steps,
  custom: intake.custom.map(({ id, label }) => ({ id, label })),
  owners: intake.owners || {},
});

/** La que quedara en el navegador, para subirla una vez. `null` si no hay. */
export const readLocalIntakeTemplate = (userId) => {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    return clientIntake({ intake: JSON.parse(raw) });
  } catch {
    return null;
  }
};

export const clearLocalIntakeTemplate = (userId) => {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* Ver `protocolTemplate.js`: una copia vieja que no se puede borrar no hace
       daño, porque el rescate solo mira si el servidor está vacío. */
  }
};

export { defaultIntake };

/**
 * Aplica la plantilla a un cliente CONSERVANDO lo suyo.
 *
 * Sin esto, «aplicar a todos» borraría los pasos ya marcados y los vídeos que el
 * entrenador ha ido enlazando cliente a cliente — que es justo el trabajo que no
 * se puede rehacer. La plantilla decide qué pasos hay; el cliente conserva por
 * cuáles va y qué tiene enlazado.
 */
export const applyIntakeTemplate = (template, preferences) => {
  const actual = clientIntake(preferences);
  return clientIntake({
    intake: {
      steps: template.steps,
      custom: template.custom,
      /* El reparto viaja CON los pasos, y por lo mismo: es una decisión de la
         plantilla, no del cliente. Sin esto, igualar a alguien le ponía tus pasos
         con el reparto del catálogo — o sea, un paso que tú te habías quedado le
         aparecía a él como tarea, o al revés. */
      owners: template.owners,
      done: actual.done,
      links: actual.links,
      /* Los archivos subidos son del cliente, igual que los enlaces: la anamnesis
         de Marta se queda en el paso de Marta. Olvidarlos aquí borraría la
         referencia y dejaría el documento en el bucket sin nada que apunte a él. */
      files: actual.files,
    },
  });
};
