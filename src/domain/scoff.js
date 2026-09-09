/**
 * El cribado de TCA: SCOFF, cinco preguntas validadas.
 *
 * ══ Qué es y qué NO es ═════════════════════════════════════════════════════
 * SCOFF es un instrumento de CRIBADO de trastornos de la conducta alimentaria
 * (Morgan, Reid & Lacey, 1999; validación española de García-Campayo, 2005):
 * cinco preguntas de sí o no, y dos o más síes son una señal para mirar con
 * cuidado. No diagnostica nada, y esta aplicación tampoco: el resultado es
 * información PARA EL ENTRENADOR — derivar es criterio suyo, y la app no
 * receta.
 *
 * ══ El resultado es solo del coach ═════════════════════════════════════════
 * El cliente contesta las preguntas (son suyas y las conoce); lo que NUNCA ve
 * es el veredicto: ni un semáforo, ni un «riesgo», ni nada que convierta su
 * portal en una consulta. El resultado se enseña únicamente en la ficha del
 * entrenador, en voz baja. Es la misma sensibilidad que «ocultar su peso».
 *
 * ══ Dónde viven las respuestas ═════════════════════════════════════════════
 * En `clients.profile.scoff` — la columna jsonb del perfil (0078), escrita por
 * `set_client_profile`, que mezcla en vez de reemplazar. Sin migración: es una
 * clave más del objeto abierto.
 */

/*
  El tuteo de la casa sobre la versión validada en español. El orden es el del
  acrónimo (Sick, Control, One stone, Fat, Food) y no se cambia: es el
  instrumento, no una lista nuestra.
*/
export const SCOFF_QUESTIONS = [
  { id: 'sick', label: '¿Te provocas el vómito porque te sientes demasiado lleno/a?' },
  { id: 'control', label: '¿Te preocupa haber perdido el control sobre la cantidad de comida que comes?' },
  { id: 'stone', label: '¿Has perdido recientemente más de 6 kg en un periodo de tres meses?' },
  { id: 'fat', label: '¿Crees que estás gordo/a aunque los demás digan que estás demasiado delgado/a?' },
  { id: 'food', label: '¿Dirías que la comida domina tu vida?' },
];

/** Dos o más síes: la señal del instrumento. */
export const SCOFF_THRESHOLD = 2;

/** «true»/«false» de un `<select>` o booleano de verdad → booleano o `null`. */
export const scoffBool = (v) =>
  v === true || v === 'true' ? true : v === false || v === 'false' ? false : null;

/**
 * El resultado del cribado de un perfil, o `null` si no se ha contestado.
 *
 * `senal` solo con el cuestionario ENTERO contestado: dos síes de dos
 * contestadas no es lo mismo que dos de cinco, y adelantar el veredicto con
 * la mitad de las respuestas sería inventárselo.
 */
export const scoffResult = (profile) => {
  const respuestas = profile?.scoff;
  if (!respuestas || typeof respuestas !== 'object') return null;

  const contestadas = SCOFF_QUESTIONS.filter((q) => scoffBool(respuestas[q.id]) !== null);
  if (contestadas.length === 0) return null;

  const yes = contestadas.filter((q) => scoffBool(respuestas[q.id]) === true).length;
  const completo = contestadas.length === SCOFF_QUESTIONS.length;
  return {
    yes,
    answered: contestadas.length,
    total: SCOFF_QUESTIONS.length,
    completo,
    senal: completo && yes >= SCOFF_THRESHOLD,
  };
};
