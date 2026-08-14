/**
 * Lo que está sin guardar, escrito en el navegador.
 *
 * ══ El fallo que cierra ═════════════════════════════════════════════════════
 *
 * La cola de guardado (`lib/saveQueue`) resolvía tres cosas —el orden de las
 * respuestas, la ráfaga de pulsaciones y los fallos silenciosos— y todas en
 * MEMORIA. Mientras la pestaña viva, perfecto.
 *
 * Pero el sitio donde se usa esto es un gimnasio. El cliente anota tres series,
 * la cobertura se cae, la cola retiene el payload esperando reintento, y el
 * navegador mata la pestaña por falta de memoria —o la persona la cierra, o el
 * móvil se bloquea—. Ahí no había reintento posible: lo que había escrito no
 * existía en ningún sitio.
 *
 * Escribiéndolo aquí, lo pendiente sobrevive al cierre y se reenvía al volver a
 * entrar. Es el único fallo de la aplicación que pierde datos de verdad.
 *
 * ── Por qué el navegador y no otra cosa ─────────────────────────────────────
 * Porque el destino ES el servidor y esto solo tiene que aguantar el hueco entre
 * «no hay red» y «vuelve a haberla». No es una base de datos local ni un modo
 * sin conexión: es una nota de lo que faltaba por mandar.
 *
 * ── Por qué por usuario ─────────────────────────────────────────────────────
 * Dos entrenadores en el mismo ordenador no pueden heredar los guardados a medias
 * del otro: al reenviarlos irían firmados con la sesión equivocada y el servidor
 * los rechazaría —o peor, no—.
 */

const prefijo = (userId) => `caveman-pending:${userId || 'anon'}`;

/**
 * Tope por payload.
 *
 * `localStorage` da unos 5 MB por dominio y un programa de entrenamiento entero
 * serializado ronda los 100 KB. El tope existe para que un caso raro —una dieta
 * enorme, un pegado accidental— no llene el almacenamiento y deje sin sitio a
 * TODO lo demás, incluidas las sesiones. Lo que no cabe simplemente no se
 * apunta: se pierde igual que antes, pero no se lleva por delante al resto.
 */
const MAX_BYTES = 512 * 1024;

const leerIndice = (userId) => {
  try {
    return JSON.parse(localStorage.getItem(prefijo(userId)) || '[]');
  } catch {
    return [];
  }
};

const escribirIndice = (userId, claves) => {
  try {
    localStorage.setItem(prefijo(userId), JSON.stringify(claves));
  } catch {
    /* Sin almacenamiento no hay red de seguridad, pero tampoco un error que
       merezca interrumpir un guardado que sí va a salir bien. */
  }
};

/**
 * El almacén que consume `createSaveQueue`.
 *
 * Se construye con el id del usuario y se descarta al cerrar sesión. Devuelve
 * las tres operaciones que la cola necesita y ninguna más.
 */
export const pendingStore = (userId) => ({
  save(key, payload) {
    let texto;
    try {
      texto = JSON.stringify(payload);
    } catch {
      // Un payload con referencias circulares no es guardable ni enviable; que
      // reviente al mandarlo, no aquí.
      return;
    }
    if (texto.length > MAX_BYTES) return;

    try {
      localStorage.setItem(`${prefijo(userId)}:${key}`, texto);
      const claves = leerIndice(userId);
      if (!claves.includes(key)) escribirIndice(userId, [...claves, key]);
    } catch {
      /* Almacenamiento lleno o bloqueado (modo privado). Se sigue sin red. */
    }
  },

  clear(key) {
    try {
      localStorage.removeItem(`${prefijo(userId)}:${key}`);
      escribirIndice(
        userId,
        leerIndice(userId).filter((k) => k !== key)
      );
    } catch {
      /* Igual que arriba: no poder limpiar no rompe nada, solo deja una nota
         vieja que el próximo reenvío volverá a mandar y a limpiar. */
    }
  },

  /** Lo que quedó sin confirmar la última vez. */
  list() {
    return leerIndice(userId)
      .map((key) => {
        try {
          const raw = localStorage.getItem(`${prefijo(userId)}:${key}`);
          return raw === null ? null : { key, payload: JSON.parse(raw) };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  },
});
