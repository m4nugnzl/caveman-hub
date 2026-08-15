/**
 * Los primeros pasos de un entrenador, y cuáles ya están dados.
 *
 * ══ Por qué esto es un cálculo y no una lista de texto ══════════════════════
 *
 * Porque la diferencia entre una guía y una lista de comprobación es exactamente
 * ésta: la guía te cuenta el orden, y la lista **sabe por dónde vas**. Sin
 * estado, un panel de «cómo funciona esto» sigue diciendo lo mismo el primer día
 * que el trigésimo, así que se cierra el primer día — y con él se va la única
 * pista que había del orden en el que hay que hacer las cosas.
 *
 * ══ El orden no es arbitrario: es el que no se puede saltar ═════════════════
 *
 *   1. Dar de alta a alguien. Sin cliente no hay nada que hacer.
 *   2. Programarle. Es el trabajo, y es lo que el cliente va a ver.
 *   3. INVITARLE. Es el paso que más se olvida y el más caro: hasta que no le
 *      llega el enlace no puede entrar, así que la mitad de la aplicación —los
 *      registros, el check-in, las fotos— se queda sin usar sin que nada avise.
 *   4. Decidir qué le pides. Se puede dejar para después, y por eso va al final:
 *      lo de arriba funciona con lo que viene puesto.
 *
 * ══ Por qué solo se comprueba lo que se sabe DE VERDAD ══════════════════════
 *
 * La rutina y la nutrición de un cliente se cargan al abrirlo, no al arrancar.
 * Un paso que dijera «sin programar» porque el dato aún no ha llegado mentiría
 * justo a quien menos puede detectarlo — y un paso marcado por error es peor que
 * ninguno, porque enseña a no fiarse de la lista.
 *
 * Así que cada paso declara qué necesita para poder opinar (`sabido`). Lo que no
 * se sabe se queda «sin comprobar», y se dice, en vez de inventarse un estado.
 */

/** @typedef {{ id: string, titulo: string, texto: string, accion: string }} Paso */

/**
 * @param {{
 *   clients?: Array<{ id: string, name: string, clientProfileId?: string|null }>,
 *   training?: Record<string, { microcycleCount?: number }>,
 *   protocolTocado?: boolean,
 * }} datos
 */
export const onboardingSteps = ({ clients = [], training = {}, protocolTocado = false } = {}) => {
  const primero = clients[0] || null;

  /* Con quién programar y a quién invitar: el primero que le falte cada cosa, y
     si no le falta a nadie, el primero de la lista. Enseñar «programar a Marta»
     cuando Marta ya está programada y Luis no manda al sitio equivocado. */
  const sinProgramar =
    clients.find((c) => (training?.[c.id]?.microcycleCount ?? 0) === 0) || primero;
  const sinInvitar = clients.find((c) => !c.clientProfileId) || primero;

  return [
    {
      id: 'alta',
      titulo: 'Da de alta a tu primer cliente',
      texto: 'Solo hace falta su nombre. Todo lo suyo —rutina, dieta, medidas y fotos— cuelga de ahí.',
      accion: 'Ir a Clientes',
      /* Los clientes SÍ se cargan al arrancar: esto se sabe siempre. */
      sabido: true,
      hecho: clients.length > 0,
      cliente: null,
    },
    {
      id: 'programar',
      titulo: 'Prográmale la semana',
      texto:
        'Dentro del cliente, en «Rutina». Montas los días, los ejercicios y las series; en «Nutrición» va su plan de comidas.',
      accion: sinProgramar ? `Programar a ${sinProgramar.name}` : 'Programar',
      /* El recuento de microciclos viene en el resumen de la cartera, que sí se
         carga al arrancar. El contenido del programa no, y no hace falta. */
      sabido: clients.length > 0,
      hecho: clients.some((c) => (training?.[c.id]?.microcycleCount ?? 0) > 0),
      cliente: sinProgramar,
    },
    {
      id: 'invitar',
      titulo: 'Mándale su enlace de acceso',
      texto:
        'Hasta que no lo tenga, tu cliente no puede entrar ni apuntar nada. Es el paso que más se olvida y el que deja la mitad de la aplicación sin usar.',
      accion: sinInvitar ? `Invitar a ${sinInvitar.name}` : 'Invitar',
      sabido: clients.length > 0,
      /* Tiene cuenta enlazada = aceptó la invitación. Que exista un token
         pendiente no cuenta: mandar el enlace y que entre no es lo mismo. */
      hecho: clients.some((c) => Boolean(c.clientProfileId)),
      cliente: sinInvitar,
    },
    {
      id: 'protocolo',
      titulo: 'Decide qué le pides a tus clientes',
      texto:
        'En Ajustes → Protocolo eliges qué módulos usas y qué preguntas al terminar de entrenar. Lo que apagues no existe, ni al programar ni en su móvil.',
      accion: 'Configurar mi protocolo',
      sabido: true,
      hecho: protocolTocado,
      cliente: null,
    },
  ];
};

/** ¿Queda algo por hacer? Con todo hecho, la guía sobra y se va sola. */
export const onboardingPending = (pasos) => pasos.filter((p) => p.sabido && !p.hecho);

/**
 * El paso en el que está: el primero que falta.
 *
 * Uno cada vez, y no los cuatro abiertos. Cuatro tareas simultáneas no son una
 * guía, son una lista de deberes — y las tres de abajo ni siquiera se pueden
 * hacer todavía.
 */
export const onboardingCurrent = (pasos) => onboardingPending(pasos)[0] || null;

/** Cuántos van, para poder decir «2 de 4» sin contar a mano en la vista. */
export const onboardingProgress = (pasos) => ({
  hechos: pasos.filter((p) => p.sabido && p.hecho).length,
  total: pasos.filter((p) => p.sabido).length,
});
