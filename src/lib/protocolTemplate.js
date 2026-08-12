/**
 * La plantilla de protocolo del entrenador.
 *
 * ── Por qué el navegador y no la base de datos ──────────────────────────────
 * Porque no hay dónde. El esquema tiene `profiles` con tres columnas y ninguna
 * tabla de ajustes del entrenador: guardar esto en el servidor significaría una
 * migración más, y la decisión fue no pedirla para esta pieza.
 *
 * El compromiso es explícito y hay que conocerlo: **la plantilla no sigue al
 * entrenador si cambia de ordenador o borra los datos del navegador**. Lo que sí
 * le sigue es el protocolo YA APLICADO a cada cliente, que vive en la base de
 * datos (`clients.preferences.protocol`). O sea: se puede perder la plantilla,
 * nunca lo que sus clientes tienen configurado.
 *
 * Por eso la plantilla es exactamente eso —una plantilla— y no la fuente de
 * verdad: lo que manda en cada cliente es su propia configuración.
 *
 * Se guarda por identificador de usuario para que dos entrenadores que usen el
 * mismo ordenador no se pisen la suya.
 */

import { clientProtocol, defaultProtocol } from '@/domain/protocol';

const key = (userId) => `caveman-protocol:${userId || 'anon'}`;

export const readTemplate = (userId) => {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return defaultProtocol();
    // Se sanea con la misma función que lo guardado en el servidor: el
    // almacenamiento local es tan poco de fiar como cualquier otra entrada.
    return clientProtocol({ protocol: JSON.parse(raw) });
  } catch {
    // Modo privado, almacenamiento bloqueado o JSON corrupto: se usa el defecto.
    return defaultProtocol();
  }
};

export const writeTemplate = (userId, protocol) => {
  try {
    localStorage.setItem(key(userId), JSON.stringify(protocol));
    return true;
  } catch {
    // Sin persistencia la plantilla dura lo que la pestaña. No es un error que
    // deba interrumpir nada, pero quien llama puede querer avisar.
    return false;
  }
};

/** ¿El protocolo de este cliente coincide con la plantilla? */
export const matchesTemplate = (template, protocol) =>
  template.modules.join() === protocol.modules.join() &&
  template.questions.join() === protocol.questions.join() &&
  JSON.stringify(template.custom) === JSON.stringify(protocol.custom);
