/**
 * Qué decir por Telegram, y sobre todo CUÁNDO CALLARSE.
 *
 * ══ La regla que decide si un bot sobrevive ═════════════════════════════════
 *
 * No es qué información manda: es cuándo no manda nada.
 *
 * Un aviso que llega esté pasando algo o no se silencia en dos semanas, y con él
 * se silencia el que sí importaba. Un resumen diario es exactamente eso: el
 * noventa por ciento de los días dice lo mismo que ayer, enseña que no hace
 * falta abrirlo, y el día que trae un crítico nuevo ya nadie lo mira.
 *
 * Así que aquí **solo se habla cuando cambia el conjunto de lo que hay que
 * atender**. Ni un mensaje más. Si hoy hay las mismas seis cosas que ayer, hoy
 * no hay mensaje — y que no llegue nada ES la información: significa que nada se
 * ha movido.
 *
 * ══ Por qué «cambia» incluye lo que se ARREGLA ══════════════════════════════
 *
 * Podría hablar solo de lo que empeora, y sería más callado todavía. Pero
 * entonces el bot nunca daría una buena noticia, y un canal que solo trae malas
 * noticias se acaba silenciando por otro motivo: porque abrirlo siempre cuesta.
 *
 * Además, «ya no hay cobros vencidos» es accionable al revés: es lo que dice que
 * se puede dejar de mirar.
 *
 * ══ Y por qué esto es dominio y no parte de la función ═════════════════════
 *
 * Por lo de siempre: el bot y el panel tienen que estar de acuerdo. Un bot que
 * dijera «todo bien» mientras el panel dice «atender» destruye la confianza en
 * los dos a la vez, y eso pasa siempre que el aviso se escribe aparte del
 * análisis. Aquí no se calcula ni un umbral: se lee `informe.diagnosticos`, que
 * es el mismo que pinta la pantalla.
 */

/**
 * Escapa lo que va dentro de un mensaje en modo HTML de Telegram.
 *
 * Es obligatorio y no es una precaución genérica: el texto lleva asuntos de
 * tickets y mensajes de error, que los escriben personas y Postgres. Un `<` sin
 * escapar **no rompe una palabra: rompe el mensaje entero** —Telegram contesta
 * 400 y no llega nada—, así que el fallo se lleva por delante justo el aviso que
 * traía la novedad. Es la misma razón por la que `support-notify` escapa.
 */
export const esc = (valor) =>
  String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** Un renglón de Telegram, sin pasarse de largo. */
const recorta = (texto, tope = 160) => {
  const limpio = String(texto ?? '').trim();
  return limpio.length > tope ? `${limpio.slice(0, tope - 1)}…` : limpio;
};

/**
 * Qué mandar, si es que hay que mandar algo.
 *
 * @param {object} entrada
 * @param {object} entrada.informe      El informe ya montado por `componer`.
 * @param {string[]} [entrada.yaAvisado] Los títulos de lo que se avisó la última
 *   vez. Es la memoria del bot y vive en `platform_alerts` (migración 0075).
 * @param {boolean} [entrada.primeraVez] Si el bot no ha hablado nunca.
 * @param {string|null} [entrada.enlace] A dónde mandar a quien lo lea.
 * @returns {{ hablar: boolean, mensaje: string|null, titulos: string[], porque: string }}
 *   `titulos` es lo que hay que guardar para la próxima comparación, se hable o
 *   no: si solo se guardara al hablar, el silencio de hoy borraría la memoria.
 *   `porque` explica la decisión, para poder depurar un bot que calla.
 */
export const queDecir = ({ informe, yaAvisado = [], primeraVez = false, enlace = null }) => {
  const diagnosticos = informe?.diagnosticos || [];
  const atender = diagnosticos.filter((d) => d.gravedad === 'atender');
  const titulos = atender.map((d) => d.titulo);

  const antes = new Set(yaAvisado);
  const ahora = new Set(titulos);

  const nuevos = atender.filter((d) => !antes.has(d.titulo));
  const resueltos = yaAvisado.filter((t) => !ahora.has(t));

  /*
    Un crítico de seguridad NUEVO habla siempre, aunque el diagnóstico que lo
    resume ya estuviera en la lista de ayer. «2 hallazgos críticos» y «3
    hallazgos críticos» son el mismo título con distinta cifra, así que la
    comparación por títulos no lo vería — y una tabla que se acaba de abrir a
    internet no puede esperar a que cambie una redacción.
  */
  const criticos = (informe?.seguridad || []).filter(
    (h) => h.nivel === 'critico' && h.nuevo && !h.aceptado
  );

  /* ── La primera vez: se fija la línea base y se dice en una línea ──────── */

  if (primeraVez) {
    return {
      hablar: true,
      titulos,
      porque: 'primera vez: se fija la línea base',
      mensaje:
        `<b>Radiografía conectada.</b>\n` +
        `${atender.length} cosa(s) que atender ahora mismo. ` +
        'A partir de aquí solo aviso de lo que cambie.' +
        (enlace ? `\n\n${esc(enlace)}` : ''),
    };
  }

  if (nuevos.length === 0 && resueltos.length === 0 && criticos.length === 0) {
    return {
      hablar: false,
      mensaje: null,
      titulos,
      porque: `nada ha cambiado: las mismas ${atender.length} cosa(s) que la última vez`,
    };
  }

  /* ── El mensaje ────────────────────────────────────────────────────────── */

  const lineas = [];

  if (criticos.length > 0) {
    /* Primero y separado: es lo único de toda la lista que puede ser una
       brecha, no un problema de negocio. */
    lineas.push(`⚠️ <b>${criticos.length} hallazgo(s) crítico(s) de seguridad</b>`);
    for (const h of criticos.slice(0, 5)) {
      lineas.push(`· <code>${esc(h.objeto)}</code> — ${esc(recorta(h.detalle, 120))}`);
    }
    if (nuevos.length > 0 || resueltos.length > 0) lineas.push('');
  }

  if (nuevos.length > 0) {
    lineas.push(`<b>Nuevo desde el último aviso</b>`);
    for (const d of nuevos) {
      lineas.push(`· ${esc(d.titulo)}${d.cifra ? ` — <b>${esc(d.cifra)}</b>` : ''}`);
      /* `hacer` va con cada uno: sin él esto sería una lista de cosas que están
         mal y no de cosas que se pueden arreglar, que es la diferencia entre un
         aviso y una notificación. */
      if (d.hacer) lineas.push(`  ${esc(recorta(d.hacer))}`);
    }
  }

  if (resueltos.length > 0) {
    if (nuevos.length > 0) lineas.push('');
    lineas.push(`<b>Ya no hace falta mirar</b>`);
    for (const t of resueltos) lineas.push(`· ${esc(t)}`);
  }

  /* Cuántas quedan en total, para no dar la impresión de que lo nuevo es todo
     lo que hay. Va al final y en una línea: es contexto, no la noticia. */
  lineas.push('');
  lineas.push(
    `<i>${atender.length} para atender en total.</i>` + (enlace ? ` ${esc(enlace)}` : '')
  );

  return {
    hablar: true,
    titulos,
    porque:
      `${nuevos.length} nuevo(s), ${resueltos.length} resuelto(s), ` +
      `${criticos.length} crítico(s) nuevo(s)`,
    mensaje: lineas.join('\n'),
  };
};

/* ==========================================================================
   Lo que se contesta cuando se PREGUNTA
   --------------------------------------------------------------------------
   Preguntar es distinto de que te avisen: aquí sí se contesta siempre, aunque
   no haya cambiado nada, porque alguien lo ha pedido. Y por eso estos textos no
   filtran por novedad — enseñan el estado.
   ========================================================================== */

const MARCA = { atender: '🔴', vigilar: '🟡', sin_datos: '⚪', bien: '🟢' };

const estado = (informe) => {
  const { atender = 0, vigilar = 0 } = informe.resumen || {};
  const cabecera =
    atender === 0
      ? '🟢 <b>Nada que atender.</b>'
      : `🔴 <b>${atender} cosa(s) que atender</b>${vigilar > 0 ? `, ${vigilar} que vigilar` : ''}`;

  const lineas = [cabecera, ''];
  for (const d of (informe.diagnosticos || []).filter((x) => x.gravedad !== 'bien')) {
    lineas.push(
      `${MARCA[d.gravedad] || '·'} ${esc(d.titulo)}${d.cifra ? ` — <b>${esc(d.cifra)}</b>` : ''}`
    );
  }
  return lineas.join('\n');
};

const cuentas = (informe) => {
  const riesgo = informe.riesgo || [];
  if (riesgo.length === 0) return '🟢 Ninguna cuenta con algo que mirar.';

  const lineas = [`<b>${riesgo.length} cuenta(s) con algo que mirar</b>`, ''];
  for (const c of riesgo.slice(0, 15)) {
    lineas.push(`· <b>${esc(c.nombre)}</b>`);
    lineas.push(`  ${esc(recorta((c.motivos || []).join(' · '), 140))}`);
  }
  if (riesgo.length > 15) lineas.push(`\n<i>y ${riesgo.length - 15} más.</i>`);
  return lineas.join('\n');
};

const dinero = (informe) => {
  const c = informe.cobros || {};
  const vencidos = (c.proximos || []).filter((p) => p.faltan < 0);
  const moneda = c.moneda || '';

  const lineas = [
    `<b>Lo que te pagan a ti</b>`,
    ...(informe.planes || []).map(
      (p) => `· ${esc(p.planEtiqueta || p.plan)} — ${p.cuentas} en ${esc(p.estado)}`
    ),
    '',
    `<b>Lo que le pagan a ellos</b>`,
    `· Cobrado: ${c.importePagado ?? 0} ${esc(moneda)}`,
    `· Sin cobrar: ${c.importePendiente ?? 0} ${esc(moneda)} (${c.pendientes ?? 0})`,
  ];

  if (vencidos.length > 0) {
    lineas.push('', `<b>${vencidos.length} vencido(s)</b>`);
    for (const p of vencidos.slice(0, 10)) {
      /* De quién es. Sin eso, esta lista no se puede accionar desde el móvil,
         que es justo donde se lee un mensaje de Telegram. */
      lineas.push(
        `· ${esc(p.cuenta || 'cuenta desconocida')} — ${p.amount} ${esc(p.currency || '')}` +
          ` (${-p.faltan} d)`
      );
    }
  }
  return lineas.join('\n');
};

const seguridad = (informe) => {
  const hallazgos = (informe.seguridad || []).filter((h) => h.nivel !== 'info' && !h.aceptado);
  const criticos = hallazgos.filter((h) => h.nivel === 'critico');

  if (hallazgos.length === 0) return '🟢 Ningún hallazgo pendiente.';

  const lineas = [
    `<b>${criticos.length} crítico(s) y ${hallazgos.length - criticos.length} aviso(s) sin aceptar</b>`,
    '',
  ];
  for (const h of [...criticos, ...hallazgos.filter((h) => h.nivel !== 'critico')].slice(0, 12)) {
    lineas.push(
      `${h.nivel === 'critico' ? '🔴' : '🟡'} <code>${esc(h.objeto)}</code> — ` +
        esc(recorta(h.detalle, 110))
    );
  }
  return lineas.join('\n');
};

const producto = (informe) => {
  const sinUso = informe.pantallas?.sinUso || [];
  const censo = informe.censo;

  const lineas = [`<b>Qué se usa</b>`];
  lineas.push(
    sinUso.length === 0
      ? '· Todas las pantallas se han abierto alguna vez.'
      : `· ${sinUso.length} pantalla(s) que no ha abierto nadie: ${esc(sinUso.join(', '))}`
  );

  if (censo) {
    lineas.push(
      '',
      `<b>Qué se rellena</b>`,
      `· Con portal: ${censo.clientes.portal.pct} %`,
      `· Con sexo: ${censo.clientes.conSexo} %`,
      `· Con programa: ${censo.programas.clientesConPrograma} %`,
      `· Check-in contestado: mediana ${censo.revision.horasMediana} h`
    );
  }
  return lineas.join('\n');
};

/**
 * Las órdenes que entiende el bot.
 *
 * Cada una contesta UNA pregunta, y son las mismas cuatro secciones del panel.
 * No hay una que lo devuelva todo: un mensaje de Telegram con el informe entero
 * no se lee, se desplaza.
 */
export const ORDENES = {
  '/estado': { descripcion: 'Qué hay que atender ahora', responde: estado },
  '/cuentas': { descripcion: 'Cuentas con algo que mirar', responde: cuentas },
  '/dinero': { descripcion: 'Planes, cobros y vencidos', responde: dinero },
  '/seguridad': { descripcion: 'Hallazgos sin aceptar', responde: seguridad },
  '/producto': { descripcion: 'Qué se usa y qué se rellena', responde: producto },
};

/** La ayuda, sacada de las propias órdenes para que no puedan divergir. */
export const ayuda = () =>
  [
    '<b>Radiografía de Caveman Hub</b>',
    '',
    ...Object.entries(ORDENES).map(([orden, { descripcion }]) => `${orden} — ${descripcion}`),
    '',
    '<i>Aviso solo cuando cambia algo. Si no digo nada, nada se ha movido.</i>',
  ].join('\n');

/**
 * Qué contestar a un texto cualquiera.
 *
 * Devuelve `null` si no es una orden conocida, y **eso significa callarse**: ver
 * la cabecera de la función edge. Contestar «no te entiendo» a un desconocido le
 * confirma que hay un bot vivo detrás y a qué responde.
 */
export const responder = (texto, informe) => {
  const orden = String(texto ?? '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    /* Telegram manda `/estado@mi_bot` en los grupos. */
    .replace(/@.*$/, '');

  if (orden === '/start' || orden === '/ayuda' || orden === '/help') return ayuda();

  const conocida = ORDENES[orden];
  return conocida ? conocida.responde(informe) : null;
};
