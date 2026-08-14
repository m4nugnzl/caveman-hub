/**
 * La plantilla de alta del entrenador: qué pasos da al empezar con alguien.
 *
 * Mismo trato y mismo compromiso que `protocolTemplate.js`, por el mismo motivo:
 * no hay tabla de ajustes del entrenador en el esquema. La plantilla vive en el
 * navegador y **no le sigue si cambia de ordenador**; lo que sí le sigue es lo
 * que cada cliente tiene aplicado, que está en `clients.preferences.intake`.
 *
 * De la plantilla solo salen la DEFINICIÓN —qué pasos existen y en qué orden— y
 * los pasos propios. Lo hecho y los enlaces son de cada cliente y no tendría
 * sentido guardarlos aquí: el vídeo de la rutina de Marta no es el de Luis.
 */

import { clientIntake, defaultIntake } from '@/domain/intake';

const key = (userId) => `caveman-intake:${userId || 'anon'}`;

export const readIntakeTemplate = (userId) => {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return defaultIntake();
    // Se sanea con la misma función que lo guardado en el servidor: el
    // almacenamiento local es tan poco de fiar como cualquier otra entrada.
    return clientIntake({ intake: JSON.parse(raw) });
  } catch {
    // Modo privado, almacenamiento bloqueado o JSON corrupto: se usa el defecto.
    return defaultIntake();
  }
};

export const writeIntakeTemplate = (userId, intake) => {
  try {
    localStorage.setItem(key(userId), JSON.stringify({ steps: intake.steps, custom: intake.custom }));
    return true;
  } catch {
    return false;
  }
};

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
      done: actual.done,
      links: actual.links,
    },
  });
};
