/**
 * Las guías de «Aprende Caveman Hub»: cada una es una tarea, contada paso a paso
 * SOBRE LA APP DE VERDAD.
 *
 * ══ Por qué recorridos y no vídeos ni un diálogo ════════════════════════════
 *
 * El diálogo de cuatro pasos contaba con palabras lo que hay que hacer y dejaba
 * a la persona buscando el botón. El vídeo se lo enseñaba, pero en otra
 * pantalla, y había que regrabarlo cada vez que algo cambiaba de sitio. Aquí la
 * guía señala el botón real en la pantalla real, y en los pasos de hacer avanza
 * cuando lo pulsas: al terminar la guía, la tarea está hecha.
 *
 * ══ Por qué esto son DATOS y no componentes ═════════════════════════════════
 *
 * Porque así se pueden probar sin navegador (`tutoriales.test.js`) y porque el
 * mismo catálogo lo leen tres sitios: el índice, la guía de «Por dónde empezar»
 * y la bienvenida del cliente. Quien pinta la guía es `components/Aprende.jsx`.
 *
 * ══ Cómo se señala algo ═════════════════════════════════════════════════════
 *
 * Una `senal` describe un elemento de la pantalla, y puede ser una lista de
 * alternativas —la primera que esté visible gana—, porque el mismo sitio es
 * otro mueble según el aparato (la barra lateral en el PC, la del pulgar en el
 * teléfono):
 *
 *   { css }           un selector.
 *   { css, texto }    …cuyo texto visible o `aria-label` contiene `texto`
 *                     (sin distinguir mayúsculas).
 *   { campo }         el `.field` cuya etiqueta empieza por `campo`: señala la
 *                     etiqueta y la casilla juntas.
 *
 * Se señala por lo que la persona VE —el texto del botón, la etiqueta del
 * campo, la ruta del enlace— y no por clases internas siempre que se puede. Si
 * algo deja de encontrarse, la guía no se rompe: enseña el paso sin señalar.
 *
 * ── Cómo avanza cada paso ──────────────────────────────────────────────────
 * Hay pasos de LEER y pasos de HACER, y «Siguiente» solo sirve en los de leer:
 * un paso que pide algo no se da por hecho hasta que la pantalla lo demuestra.
 *
 *   (por defecto)    leer: cuenta qué es eso y avanza con «Siguiente».
 *   avanza: 'clic'   pulsar eso. Sin `hecho`, pulsarlo avanza la guía.
 *   hecho            lo que aparece cuando el paso está hecho (la ficha que
 *                    abre el botón, el tic del peso apuntado, la hoja nueva…).
 *                    Cuando aparece uno MÁS de los que había al llegar, la
 *                    guía avanza sola; un clic no basta, porque guardar puede
 *                    fallar. Si ya había alguno al llegar, se puede seguir con
 *                    «Siguiente»: eso ya está hecho.
 *   nuevo            con `hecho`: lo que ya había no cuenta, hay que hacer uno
 *                    (una serie apuntada antes no es la que se enseña ahora).
 *   listo            en los pasos de escribir: `{ relleno: Senal }`, que alguna
 *                    casilla de eso tenga algo escrito. Avanza al salir de la
 *                    casilla, no al teclear, que cortaría a media palabra.
 *   pista            lo que se dice mientras falta: «Escribe su nombre».
 *   opcional         si no está en su pantalla, se salta solo: son las piezas
 *                    que dependen del protocolo de cada cliente.
 *   donde            la pantalla del paso cuando no es la de la guía.
 *   aparato          'telefono' o 'monitor': el paso solo existe ahí. El portal
 *                    del cliente es otro diseño en cada aparato (ver
 *                    `routes.jsx`), y lo que se pulsa no es lo mismo.
 *
 * Si lo que un paso de hacer señala no está en su pantalla —no hay nadie por
 * revisar, por ejemplo—, se deja saltar: no hay nada que hacer ahí.
 *
 * `:cliente` en una ruta es el cliente sobre el que se hace la guía.
 */

/** @typedef {{ css?: string, texto?: string, campo?: string }} Senal */
/**
 * @typedef {{
 *   senal?: Senal | Senal[],
 *   titulo: string,
 *   texto: string,
 *   avanza?: 'clic',
 *   hecho?: Senal | Senal[],
 *   nuevo?: boolean,
 *   listo?: { relleno: Senal | Senal[] },
 *   pista?: string,
 *   opcional?: boolean,
 *   donde?: string,
 *   aparato?: 'telefono' | 'monitor',
 * }} Paso
 */
/**
 * @typedef {{
 *   id: string,
 *   serie: 'entrenador' | 'cliente',
 *   titulo: string,
 *   resumen: string,
 *   empieza: string,
 *   conCliente?: boolean,
 *   pantalla?: string,
 *   pasos: Paso[],
 * }} Guia
 */

/* Una sección del entrenador, venga en la barra lateral o en la de abajo. */
const seccion = (ruta) => [
  { css: `.sidebar-nav a[href="${ruta}"]` },
  { css: `.bottombar a[href="${ruta}"]` },
];

/* Una sección del cliente, en la barra del pulgar o en el carril del monitor. */
const tecla = (ruta) => [
  { css: `.tel-pulgar a[href="/mi/${ruta}"]` },
  { css: `.pc-carril a[href="/mi/${ruta}"]` },
];

// ── El entrenador ──────────────────────────────────────────────────────────

/** @type {Guia[]} */
const ENTRENADOR = [
  {
    id: 'paseo',
    serie: 'entrenador',
    titulo: 'Un paseo por la app',
    resumen: 'Dónde está cada cosa y para qué sirve.',
    empieza: '/hoy',
    pasos: [
      {
        senal: seccion('/hoy'),
        titulo: 'Inicio: lo que te toca hoy',
        texto: 'Quién ha entrenado, quién espera tu revisión y qué semanas faltan por escribir.',
      },
      {
        senal: seccion('/clientes'),
        avanza: 'clic',
        titulo: 'Clientes: todos en una lista',
        texto: 'Ordenados por lo que necesitan. Al pulsar uno entras en su ficha: resumen, entreno, dieta, revisiones y protocolo.',
      },
      {
        senal: seccion('/ingresos'),
        avanza: 'clic',
        titulo: 'Cobros: quién te debe',
        texto: 'Lo que vence, lo que has cobrado y lo que falta este mes.',
      },
      {
        senal: seccion('/calendario'),
        avanza: 'clic',
        titulo: 'Agenda: lo que viene',
        texto: 'Las revisiones y las citas de todos tus clientes, por días.',
      },
      {
        senal: [{ css: '.sidebar-taller' }, { css: '.account' }],
        titulo: 'Tu taller: lo que reutilizas',
        texto: 'Protocolos, tu librería de ejercicios y alimentos, y tus plantillas. Lo haces una vez y se lo pones a quien quieras.',
      },
      {
        senal: { css: '.account' },
        titulo: 'Estas guías, en Ajustes',
        texto: 'Pulsa tu nombre y entra en Ajustes › Ayuda: ahí tienes esta y la de cada pantalla.',
      },
    ],
  },
  {
    id: 'alta',
    serie: 'entrenador',
    titulo: 'Da de alta a un cliente',
    resumen: 'Su nombre, su móvil y el enlace para que entre.',
    empieza: '/clientes',
    pasos: [
      {
        senal: { css: 'button', texto: 'Nuevo cliente' },
        avanza: 'clic',
        hecho: { campo: 'Nombre' },
        titulo: 'Pulsa «Nuevo cliente»',
        texto: 'Su ficha de alta se abre aquí mismo.',
      },
      {
        senal: { campo: 'Nombre' },
        listo: { relleno: { campo: 'Nombre' } },
        pista: 'Escribe su nombre para seguir',
        titulo: 'Escribe su nombre',
        texto: 'Es lo único obligatorio. El correo, el sexo y el plan puedes ponerlos ahora o más tarde.',
      },
      {
        senal: { campo: 'Teléfono' },
        listo: { relleno: { campo: 'Teléfono' } },
        pista: 'Escribe su móvil para seguir',
        titulo: 'Y su móvil',
        texto: 'Con él le mandas su acceso por WhatsApp en un toque.',
      },
      {
        senal: { campo: 'Protocolo' },
        opcional: true,
        titulo: 'Elige qué le vas a pedir',
        texto: 'Su protocolo: entreno, dieta y revisiones. Si todavía no tienes ninguno, se queda con el de por defecto.',
      },
      {
        senal: { css: 'button', texto: 'Guardar cliente' },
        avanza: 'clic',
        hecho: { css: 'button', texto: 'Copiar su enlace de acceso' },
        titulo: 'Guárdalo',
        texto: 'Entra en tu cartera al momento.',
      },
      {
        senal: { css: 'button', texto: 'Copiar su enlace de acceso' },
        avanza: 'clic',
        titulo: 'Mándale su enlace',
        texto: 'Se copia solo. Pégalo en WhatsApp: con él crea su cuenta y ve su plan en el móvil. Hasta que entre no puede apuntar nada.',
      },
    ],
  },
  {
    id: 'protocolo',
    serie: 'entrenador',
    titulo: 'Decide qué le pides',
    resumen: 'Tu protocolo: qué lleva, qué pasa cada semana y quién lo sigue.',
    empieza: '/protocolos',
    pasos: [
      {
        senal: { css: 'button', texto: 'Nuevo protocolo' },
        avanza: 'clic',
        hecho: { css: '.proto-nombre' },
        titulo: 'Pulsa «Nuevo protocolo»',
        texto: 'Un protocolo es lo que le pides a un cliente. Lo haces una vez y se lo pones a varios.',
      },
      {
        senal: { css: '.proto-nombre' },
        listo: { relleno: { css: '.proto-nombre' } },
        pista: 'Ponle nombre para seguir',
        titulo: 'Ponle nombre',
        texto: 'Por el objetivo, que es como lo vas a buscar: «Pérdida de grasa», «Volumen online».',
      },
      {
        senal: { css: '.proto-rejilla' },
        titulo: 'Enciende lo que lleva',
        texto: 'Entreno, dieta o los dos, y las piezas que usas. Lo que apagues no aparece ni al programar ni en su móvil.',
      },
      {
        senal: { css: '.cartera-cab-acciones .btn-primary', texto: 'Seguir' },
        avanza: 'clic',
        hecho: { css: 'button.tab[aria-selected="true"]', texto: 'Las acciones' },
        titulo: 'Pulsa «Seguir»',
        texto: 'Se guarda y pasas a lo que ocurre cada semana.',
      },
      {
        senal: { css: '.cartera-cab-acciones .btn-primary', texto: 'Seguir' },
        avanza: 'clic',
        hecho: { css: 'button.tab[aria-selected="true"]', texto: 'Quién lo lleva' },
        titulo: 'Qué pasa cada semana',
        texto: 'Qué día le pides la revisión, qué formularios le mandas y qué avisos salen solos. Cuando lo tengas, «Seguir».',
      },
      /* Sin nadie a quien ponérselo —no hay clientes, o ya lo llevan todos—
         estos dos no están en pantalla y se saltan solos. */
      {
        senal: { css: '.mandar-gente' },
        opcional: true,
        hecho: { css: '.mandar-quien[aria-pressed="true"]' },
        pista: 'Marca a alguien para seguir',
        titulo: 'Marca a tus clientes',
        texto: 'Los que vayan a llevar este protocolo.',
      },
      {
        senal: { css: '.proto-paso button.btn-primary', texto: 'Ponérselo' },
        opcional: true,
        avanza: 'clic',
        titulo: 'Pulsa «Ponérselo»',
        texto: 'Se escribe en su ficha al momento. Lo puedes cambiar cuando quieras desde la ficha de cada uno.',
      },
    ],
  },
  {
    id: 'fases',
    serie: 'entrenador',
    titulo: 'Marca sus fases',
    resumen: 'Hacia dónde va: definición, mantenimiento o volumen, con fechas y ritmo.',
    empieza: '/c/:cliente/resumen',
    conCliente: true,
    pasos: [
      {
        senal: { css: 'button.progreso-cifra', texto: 'Fase' },
        avanza: 'clic',
        hecho: { css: '.modal-title', texto: 'Sus fases' },
        titulo: 'Abre sus fases',
        texto: 'Están en su Resumen. Sus pesajes se leen contra la fase en la que está.',
      },
      {
        /* «Nueva fase» con el carril vacío; «Añadir fase» cuando ya tiene. */
        senal: [
          { css: '.modal button', texto: 'Nueva fase' },
          { css: '.modal button', texto: 'Añadir fase' },
        ],
        avanza: 'clic',
        hecho: { css: '.modal button', texto: 'Guardar fase' },
        titulo: 'Añade una fase',
        texto: 'Pulsa «Nueva fase».',
      },
      {
        senal: { campo: 'Nombre' },
        listo: { relleno: { campo: 'Nombre' } },
        pista: 'Ponle nombre para seguir',
        titulo: 'Ponle nombre',
        texto: 'Por ejemplo, «Definición de verano».',
      },
      {
        senal: { css: '[role="group"][aria-label="Dirección"]' },
        titulo: 'Elige la dirección',
        texto: 'Definición, mantenimiento o volumen.',
      },
      {
        senal: { campo: 'Duración' },
        titulo: 'Cuánto dura',
        texto: 'En semanas. Si aún no lo sabes, márcalo y lo decides después.',
      },
      {
        /* En mantenimiento no hay ritmo: el campo no sale y el paso sobra. */
        senal: { campo: 'Ritmo semanal' },
        opcional: true,
        titulo: 'Y a qué ritmo',
        texto: 'Cuánto esperas que cambie su peso cada semana. Con eso se juzgan sus pesajes.',
      },
      {
        senal: { css: 'button', texto: 'Guardar fase' },
        avanza: 'clic',
        /* Guardada, el formulario se cierra y vuelve «Añadir fase». Si falla,
           el formulario se queda con su error y la guía espera. */
        hecho: { css: '.modal button', texto: 'Añadir fase' },
        titulo: 'Guarda la fase',
        texto: 'Aparece en su línea de tiempo. Puedes encadenar las siguientes.',
      },
    ],
  },
  {
    id: 'bloque',
    serie: 'entrenador',
    titulo: 'Monta su bloque',
    resumen: 'Microciclos, bloques y una hoja por cada día de entreno.',
    empieza: '/c/:cliente/rutina',
    conCliente: true,
    pasos: [
      {
        senal: [
          { css: 'button', texto: 'Nuevo microciclo' },
          { css: '.tira-mas[aria-label^="Añadir microciclo"]' },
        ],
        /* Con un microciclo en marcha aparece dónde añadirle hojas. */
        hecho: { css: '.tira-mas[aria-label^="Añadir una hoja"]' },
        pista: 'Crea el microciclo para seguir',
        titulo: 'Cada semana es un microciclo',
        texto: 'Si su entreno está vacío, empieza con «Nuevo microciclo». Los siguientes salen copiando el anterior.',
      },
      {
        senal: { css: '.tira-mas[aria-label^="Añadir una hoja"]' },
        hecho: { css: 'button.plan-col-nombre' },
        pista: 'Crea una hoja para seguir',
        titulo: 'Una hoja por cada día de entreno',
        texto: 'Pierna, Empuje, Tirón… Pulsa «+ hoja», ponle nombre y aparece en la tira.',
      },
      {
        senal: { css: '.tira-mas[aria-label="Empezar el bloque siguiente"]' },
        opcional: true,
        titulo: 'Los bloques agrupan semanas',
        texto: 'Cuando cambie el plan, empieza otro bloque. El anterior queda en su historial.',
      },
      {
        senal: [
          { css: 'button', texto: 'Traer de otro cliente' },
          { css: '[aria-label^="Traer ejercicios a"]' },
        ],
        titulo: 'O tráelo ya hecho',
        texto: 'De otro cliente, de tus plantillas o pegado desde un Excel.',
      },
      {
        senal: { css: 'button.plan-col-nombre' },
        avanza: 'clic',
        hecho: { css: 'section[aria-label^="Series de"]' },
        titulo: 'Abre una hoja para llenarla',
        texto: 'Pulsa el nombre de un día. Lo que sigue está en «Llena la hoja».',
      },
    ],
  },
  {
    id: 'hoja',
    serie: 'entrenador',
    titulo: 'Llena la hoja',
    resumen: 'Ejercicios, series, repeticiones y RIR. Se guarda solo.',
    empieza: '/c/:cliente/rutina',
    conCliente: true,
    pasos: [
      {
        senal: { css: 'button.plan-col-nombre' },
        avanza: 'clic',
        hecho: { css: 'section[aria-label^="Series de"]' },
        titulo: 'Abre la hoja',
        texto: 'Pulsa el nombre del día que quieras llenar.',
      },
      {
        senal: [{ css: 'button.hoja-verbo', texto: 'ejercicio' }, { css: '.plan-alta-abrir' }],
        /* Un ejercicio en la hoja trae sus casillas de lo que se pide. */
        hecho: { css: 'input.hoja-celda.is-pide' },
        pista: 'Añade un ejercicio para seguir',
        titulo: 'Añade un ejercicio',
        texto: 'Escribe su nombre: si está en tu librería, sale con su músculo. Con Enter se añade y sigues con el siguiente.',
      },
      {
        senal: { css: 'input.hoja-celda.is-pide' },
        listo: { relleno: { css: 'input.hoja-celda.is-pide' } },
        pista: 'Escribe lo que le pides para seguir',
        titulo: 'Lo que pides, serie a serie',
        texto: 'Repeticiones y RIR objetivo. A la derecha, en gris, lo que él apunta al entrenar.',
      },
      {
        senal: { css: 'button.hoja-mas' },
        titulo: '¿Una serie más?',
        texto: 'Cada serie se ajusta por separado. No hay botón de guardar: se guarda solo.',
      },
      {
        senal: { css: '[aria-label="Guardarla como pieza tuya"]' },
        titulo: 'Guárdala para otros',
        texto: 'Queda en tus plantillas y se la pones a otro cliente en dos clics.',
      },
    ],
  },
  {
    id: 'dieta',
    serie: 'entrenador',
    titulo: 'Móntale la dieta',
    resumen: 'Objetivo, días, comidas con opciones y equivalencias.',
    empieza: '/c/:cliente/nutricion',
    conCliente: true,
    pasos: [
      {
        senal: [{ css: '.lado-ajustar' }, { css: 'button', texto: 'Ajustar objetivo' }],
        titulo: 'Primero, su objetivo',
        texto: 'Calorías y macros del día. Todo lo demás se mide contra esto.',
      },
      {
        senal: { css: 'button[aria-label="Ajustes del plan"]' },
        titulo: 'Por macros o con menú',
        texto: 'Por macros le das solo las cifras; con menú cerrado le montas las comidas. Se cambia aquí, junto con las equivalencias.',
      },
      {
        senal: [{ css: '.dieta-dia' }, { css: '.tira-mas', texto: 'día' }],
        titulo: 'Un tipo de día por situación',
        texto: 'Entreno y descanso, o alto y bajo, cada uno con su objetivo. Con «+ día» añades otro y eliges qué días toca.',
      },
      {
        senal: [{ css: 'button[aria-label="Añadir comida"]' }, { css: '.tira-mas', texto: 'alimento' }],
        opcional: true,
        titulo: 'Monta sus comidas',
        texto: 'Añade comidas y, en cada una, alimentos de tu librería. Al cambiar los gramos, las cifras se recalculan.',
      },
      {
        senal: { css: '.comida-opcion.is-nueva' },
        opcional: true,
        titulo: 'Dale opciones para elegir',
        texto: 'Cada alternativa es otro menú para esa comida. Él elige cuál hace ese día.',
      },
      {
        senal: { css: '.equiv-marca' },
        opcional: true,
        titulo: 'Y qué puede cambiar por qué',
        texto: 'Las equivalencias: qué alimentos valen por este sin romper las cifras. Las ve en su móvil.',
      },
      {
        senal: { css: 'section.lado-tarjeta[aria-label="El ciclo"]' },
        titulo: 'Se guarda solo',
        texto: 'Cada cambio le llega al momento. Aquí ves cómo queda su semana, día a día.',
      },
    ],
  },
  {
    id: 'revision',
    serie: 'entrenador',
    titulo: 'Revisa su semana',
    resumen: 'Lo que entregó, lo que entrenó y tu respuesta.',
    empieza: '/hoy',
    pasos: [
      {
        senal: { css: 'section[aria-labelledby="ini-revisar"]' },
        titulo: 'Cuando entrega, te espera aquí',
        texto: 'En «Por revisar», primero quien más lleva esperando. Si no hay nadie, abre cualquier cliente y ve a Revisiones.',
      },
      {
        senal: { css: 'section[aria-labelledby="ini-revisar"] button', texto: 'Revisar' },
        avanza: 'clic',
        hecho: { css: 'section.cierre' },
        titulo: 'Abre su semana',
        texto: 'Pulsa «Revisar».',
      },
      {
        senal: { css: 'h2.mando-titulo' },
        donde: '/c/:cliente/semana',
        titulo: 'Su semana, de un vistazo',
        texto: 'Peso, fotos, entrenos y respuestas. Arriba eliges contra qué semana comparar.',
      },
      {
        senal: { css: 'textarea.cierre-campo' },
        listo: { relleno: { css: 'section.cierre' } },
        pista: 'Escríbele algo para seguir',
        donde: '/c/:cliente/semana',
        titulo: 'Contéstale',
        texto: 'Por escrito, con un vídeo o con un enlace.',
      },
      {
        senal: { css: 'button.cierre-cerrar' },
        donde: '/c/:cliente/semana',
        titulo: 'Y cierra la semana',
        texto: 'Le llega tu respuesta y sale de «Por revisar». Si no hay nada que cambiar, «Seguimos igual» en Inicio la cierra sin abrirla.',
      },
    ],
  },
];

// ── El cliente ─────────────────────────────────────────────────────────────
/*
  El portal del cliente es OTRO diseño en cada aparato: la barra del pulgar y
  sus pantallas en el teléfono, el carril y sus cajas en el monitor. Cada paso
  da las dos señales como alternativas cuando es la misma cosa en otro mueble,
  y se marca `aparato` cuando lo que se hace es distinto (en el teléfono se
  pulsa «Registrar serie»; en el monitor la serie se apunta al escribirla).

  Los títulos no repiten el nombre de la pestaña —«Hoy» en el teléfono es «Mi
  inicio» en el monitor—: dicen qué hay dentro, que es lo mismo en los dos.
*/

/* Un paso de la entrega hecho: su círculo lleno en el teléfono, su renglón
   marcado en el monitor. */
const pasoDeEntrega = (ruta, textoMonitor) => ({
  senal: [{ css: `a[href="${ruta}"]` }, { css: '.paso-entrega', texto: textoMonitor }],
  hecho: [{ css: `a[href="${ruta}"] .tel-circulo.tel-hecho` }, { css: '.paso-entrega.es-hecho', texto: textoMonitor }],
});

/** @type {Guia[]} */
const CLIENTE = [
  {
    id: 'bienvenida',
    serie: 'cliente',
    titulo: 'Esta es tu app',
    resumen: 'Tus secciones y qué hay en cada una.',
    empieza: '/mi/inicio',
    pasos: [
      {
        senal: tecla('inicio'),
        titulo: 'Lo que te toca hoy',
        texto: 'Tu entreno de hoy, tu peso y lo que te falta por entregar. Es donde entras cada día.',
      },
      /* En el teléfono «Tú» es el círculo de arriba, y solo está en «Hoy»: se
         enseña ahora, antes de salir de aquí. En el monitor el carril lo lleva
         siempre, y va al final. */
      {
        senal: { css: 'a.tel-cab-perfil' },
        aparato: 'telefono',
        titulo: 'Tú y tus datos',
        texto: 'Arriba, tu perfil: tus fotos, tu calendario y tus ajustes. Ahí vuelves a estas guías cuando quieras, en «Cómo funciona».',
      },
      /* Se entra en cada sección, no se lee de lejos: cada paso es pulsarla. */
      {
        senal: tecla('rutina'),
        avanza: 'clic',
        titulo: 'Tu rutina',
        texto: 'Las hojas de tu bloque. Desde aquí empiezas cada sesión. Púlsalo.',
      },
      {
        senal: tecla('dieta'),
        avanza: 'clic',
        titulo: 'Tu dieta',
        texto: 'Lo que te toca comer, con opciones para elegir en cada comida. Púlsalo.',
      },
      {
        senal: tecla('progreso'),
        avanza: 'clic',
        aparato: 'monitor',
        titulo: 'Tu progreso',
        texto: 'Tu peso y tus marcas, semana a semana. Púlsalo.',
      },
      {
        senal: tecla('evolucion'),
        avanza: 'clic',
        titulo: 'Tu revisión',
        texto: 'Tu peso, tus fotos y el cuestionario de la semana. Tu entrenador lo lee y te contesta. Púlsalo.',
      },
      {
        senal: { css: '.pc-carril-quien' },
        aparato: 'monitor',
        avanza: 'clic',
        titulo: 'Tú y tus datos',
        texto: 'Tus fotos, tu calendario y tus ajustes. Aquí vuelves a estas guías cuando quieras, en «Cómo funciona».',
      },
    ],
  },
  {
    id: 'alta-cliente',
    serie: 'cliente',
    titulo: 'Cuéntanos de ti',
    resumen: 'Tus datos, tu forma de entrenar y tu gimnasio.',
    empieza: '/mi/inicio',
    pasos: [
      {
        senal: { css: 'a[href="/mi/alta"]' },
        avanza: 'clic',
        hecho: { css: '#quien-eres' },
        titulo: 'Empieza aquí',
        texto: 'Tu entrenador necesita unos datos antes de montarte el plan.',
      },
      {
        senal: { css: '#quien-eres' },
        donde: '/mi/alta',
        opcional: true,
        titulo: 'Quién eres',
        texto: 'Tu edad, tu altura y tu peso. Se guardan en tu perfil, y el peso cuenta como tu primer pesaje.',
      },
      {
        senal: { css: '#cuestionario' },
        donde: '/mi/alta',
        opcional: true,
        titulo: 'Cómo entrenas y cómo comes',
        texto: 'Ninguna pregunta es obligatoria. Lo que contestes se guarda al pulsar «Guardar», que baja contigo por la pantalla.',
      },
      {
        senal: { css: '#salud' },
        donde: '/mi/alta',
        opcional: true,
        titulo: 'Tu salud',
        texto: 'Lesiones, alergias o cualquier cosa que tu entrenador deba tener en cuenta. Si no tienes nada, sigue.',
      },
      {
        senal: { css: '#gimnasio' },
        donde: '/mi/alta',
        opcional: true,
        titulo: 'Tu gimnasio',
        texto: 'Fotos de las máquinas que tienes, para que tu rutina encaje con ellas.',
      },
    ],
  },
  {
    id: 'entreno',
    serie: 'cliente',
    titulo: 'Apunta tu entreno',
    resumen: 'Empezar la sesión, apuntar series y terminar.',
    empieza: '/mi/rutina',
    pasos: [
      {
        /* El verbo de hoy si lo hay; si no, cualquier día de la rutina. */
        senal: [
          { css: 'button', texto: 'Iniciar sesión' },
          { css: 'button', texto: 'Continuar sesión' },
          { css: 'button', texto: 'Empezar el entreno' },
          { css: 'button', texto: 'Seguir el entreno' },
          { css: 'section.plan-col:not(.is-ok) button.plan-col-nombre' },
          { css: 'button.plan-col-nombre' },
        ],
        avanza: 'clic',
        hecho: [{ css: 'button', texto: 'Registrar serie' }, { css: '.pc-puesto' }],
        titulo: 'Empieza la sesión',
        texto: 'Pulsa para empezar la de hoy. Si hoy no toca, cualquier día de tu rutina que tengas sin hacer.',
      },
      {
        senal: [{ css: '.tel-ses-campos' }, { css: 'input[aria-label^="Kilos de la serie"]' }],
        aparato: 'telefono',
        donde: '/mi/rutina/sesion',
        titulo: 'Apunta cada serie',
        texto: 'Kilos, repeticiones y RIR, con − y +. Viene relleno con lo que hiciste la última vez.',
      },
      {
        senal: { css: 'button', texto: 'Registrar serie' },
        aparato: 'telefono',
        avanza: 'clic',
        donde: '/mi/rutina/sesion',
        titulo: 'Registra la serie',
        texto: 'Se guarda al momento, también sin cobertura. La siguiente ya viene rellena.',
      },
      {
        /* La fila que toca. Con la sesión apuntada entera no hay ninguna, y el
           paso se deja saltar. */
        senal: { css: '.pc-puesto-fila.pc-viva' },
        aparato: 'monitor',
        hecho: { css: '.pc-puesto-fila.pc-hecha' },
        nuevo: true,
        pista: 'Apunta una serie para seguir',
        donde: '/mi/rutina/sesion',
        titulo: 'Apunta una serie',
        texto: 'Kilos y repeticiones en su fila: con las repeticiones puestas queda apuntada y se guarda sola. «La última vez» te copia lo de la vez anterior.',
      },
      {
        senal: [{ css: '.tel-terminar' }, { css: 'button', texto: 'Terminar' }],
        avanza: 'clic',
        donde: '/mi/rutina/sesion',
        titulo: 'Al acabar, «Terminar»',
        texto: 'Te pregunta cómo lo has llevado. Tu entrenador lo ve con la fecha real.',
      },
    ],
  },
  {
    id: 'comer',
    serie: 'cliente',
    titulo: 'Tu dieta y sus opciones',
    resumen: 'Dónde está, qué te toca, cómo elegir y qué puedes cambiar.',
    empieza: '/mi/inicio',
    pasos: [
      {
        senal: tecla('dieta'),
        avanza: 'clic',
        titulo: 'Tu dieta está aquí',
        texto: 'Siempre a un toque, en cualquier pantalla. Púlsalo.',
      },
      {
        senal: [{ css: '.tel-dias-dieta' }, { css: '.dieta-dias' }],
        donde: '/mi/dieta',
        opcional: true,
        titulo: 'Qué dieta toca hoy',
        texto: 'Si tu dieta cambia según el día, aquí eliges cuál mirar. Sale la de hoy.',
      },
      {
        senal: [{ css: '.tel-macros' }, { css: 'section.lado-tarjeta[aria-label="El objetivo del día"]' }],
        donde: '/mi/dieta',
        titulo: 'Tu objetivo del día',
        texto: 'Las calorías y los macros que te marca tu entrenador. Si los cambia, lo ves aquí al momento.',
      },
      {
        senal: [{ css: '.tel-opciones' }, { css: '.comida-opciones-tabs' }],
        donde: '/mi/dieta',
        opcional: true,
        avanza: 'clic',
        titulo: 'Elige una opción',
        texto: 'Una comida puede tener varios menús que valen lo mismo. Toca el que vayas a hacer.',
      },
      {
        senal: [{ css: 'button[aria-label^="Qué puedes comer en lugar de"]' }, { css: '.equiv-marca' }],
        donde: '/mi/dieta',
        opcional: true,
        avanza: 'clic',
        titulo: 'Y qué puedes cambiar',
        texto: '¿No tienes avena? Toca aquí y verás qué vale por ella, y cuánto.',
      },
    ],
  },
  {
    id: 'entrega',
    serie: 'cliente',
    titulo: 'Entrega tu semana',
    resumen: 'Peso, medidas, fotos, cuestionario y entregar.',
    empieza: '/mi/evolucion',
    pasos: [
      /* Cada paso de la entrega se marca solo en la lista cuando está hecho:
         eso es lo que la guía espera. */
      {
        senal: [{ css: 'a[href="/mi/evolucion/peso"]' }, { css: '.peso-hoy-campo' }],
        hecho: [
          { css: 'a[href="/mi/evolucion/peso"] .tel-circulo.tel-hecho' },
          { css: '.paso-entrega.es-hecho', texto: 'Tu peso' },
        ],
        pista: 'Apunta tu peso para seguir',
        titulo: 'Pésate',
        texto: 'Apunta tu peso de hoy. Varias veces por semana, mejor en ayunas: cuenta la media.',
      },
      {
        senal: [{ css: '.tel-fila', texto: 'Medidas corporales' }, { css: '.paso-entrega', texto: 'medidas' }],
        hecho: [
          { css: '.tel-fila:has(.tel-hecho)', texto: 'Medidas corporales' },
          { css: '.paso-entrega.es-hecho', texto: 'medidas' },
        ],
        opcional: true,
        pista: 'Toma tus medidas para seguir',
        titulo: 'Tus medidas',
        texto: 'Las que te pide tu entrenador, una a una y con cómo tomar cada una.',
      },
      {
        ...pasoDeEntrega('/mi/evolucion/fotos-de-la-semana', 'foto'),
        opcional: true,
        pista: 'Sube tus fotos para seguir',
        titulo: 'Tus fotos de la semana',
        texto: 'Frente, perfil y espalda, con la foto de la vez anterior de guía. Solo las ve tu entrenador.',
      },
      {
        ...pasoDeEntrega('/mi/evolucion/cuestionario', 'Cómo lo has llevado'),
        opcional: true,
        pista: 'Contesta el cuestionario para seguir',
        titulo: 'Cuéntale tu semana',
        texto: 'Unas preguntas cortas de tu entrenador.',
      },
      {
        senal: { css: 'button', texto: 'entregar' },
        avanza: 'clic',
        /* Entregada, el verbo pasa a «Volver a entregar». Si falta algo, la
           entrega lo dice y la guía espera. */
        hecho: { css: 'button', texto: 'Volver a entregar' },
        titulo: 'Y entrégala',
        texto: 'Tu entrenador la recibe y te contesta. Si te olvidaste algo, puedes volver a entregarla.',
      },
    ],
  },
  {
    id: 'progreso',
    serie: 'cliente',
    titulo: 'Mira cómo vas',
    resumen: 'Tu progreso, tus datos y dónde apuntar el peso.',
    empieza: '/mi/tu',
    pasos: [
      {
        senal: { css: 'a[href="/mi/progreso"]' },
        titulo: 'Tu progreso',
        texto: 'Tu peso, tus marcas y lo que mueves, semana a semana.',
      },
      {
        senal: { css: 'button', texto: 'Tus datos y tu privacidad' },
        titulo: 'Tus datos son tuyos',
        texto: 'Qué se guarda de ti, quién lo ve y cómo llevártelo.',
      },
      /* El peso se apunta en la revisión, que es donde vive la báscula: la
         pantalla suelta de «Tu peso y tus medidas» es el archivo, no el sitio
         de apuntar. */
      {
        senal: tecla('evolucion'),
        avanza: 'clic',
        titulo: 'Tu peso se apunta en tu revisión',
        texto: 'Púlsalo y te enseño dónde.',
      },
      {
        senal: [{ css: '.peso-hoy-campo' }, { css: 'a[href="/mi/evolucion/peso"]' }],
        donde: '/mi/evolucion',
        titulo: 'Tu peso, siempre a mano',
        texto: 'Apúntalo cada vez que te peses, aunque no toque revisión. Con los de la semana sale tu media.',
      },
    ],
  },
];

// ── Cada pantalla del entrenador, la primera vez ───────────────────────────

/*
  ══ LA GUÍA SALE SOLA, Y EN LA PANTALLA DONDE HACE FALTA ═══════════════════

  El dueño, 19 sep: «¿no le salta la guía al entrar por primera vez en las
  páginas, explicando un poco la página y mandándole hacer acciones? Eso
  debería ocurrir, más que una guía que está en ajustes y ya».

  Una guía corta por pantalla, que se abre sola la PRIMERA vez que se entra en
  ella (`components/Aprende.jsx`): dos o tres pasos que cuentan qué es eso, y
  el último pide lo que se viene a hacer allí. Luego no vuelve a salir; se
  repite desde Ajustes › Ayuda, que es donde viven todas (el dueño
  quitó el «?» fijo junto a Buscar: al veterano le estorbaba en cada pantalla).

  ── Una guía para los dos estados de la pantalla ──────────────────────────
  La misma pantalla está vacía el primer día y llena el décimo, y lo que se
  pide en cada caso no es lo mismo: «Nuevo cliente» con la cartera vacía,
  «entra en su ficha» con gente dentro. En vez de dos guías, los pasos que
  dependen del estado van `opcional`: si lo que señalan no está, se saltan
  solos. Por eso cada uno señala algo que SOLO existe en su estado (el vacío
  se reconoce por `.empty`).

  No salen en el índice de «Aprende»: son de su pantalla, no una tarea. Se
  reconocen por `pantalla`, y qué ruta es cada una lo dice
  `guiaDeLaPantalla`.
*/

/* Un botón o enlace del vacío de la pantalla, por lo que dice. */
const delVacio = (texto) => [
  { css: '.empty button', texto },
  { css: '.empty a', texto },
];

/** @type {Guia[]} */
const PANTALLAS = [
  {
    id: 'pantalla-inicio',
    serie: 'entrenador',
    pantalla: 'inicio',
    titulo: 'Inicio',
    resumen: 'Tu día, de un vistazo.',
    empieza: '/hoy',
    pasos: [
      {
        senal: { css: '.ini-cab' },
        titulo: 'Inicio: tu mañana',
        texto: 'Cada día empieza aquí: quién ha entrenado, quién espera tu revisión y qué semanas faltan por escribir.',
      },
      {
        senal: [{ css: '.sidebar-puertas' }, { css: '.bottombar' }],
        titulo: 'Tu barra',
        texto: 'Clientes, Cobros y Agenda. En el ordenador, debajo está tu taller: protocolos, librería y plantillas.',
      },
      {
        senal: { css: '.account' },
        titulo: 'Si te pierdes, Ajustes › Ayuda',
        texto: 'Cada pantalla te enseña su guía la primera vez que entras. Para repasarlas, pulsa tu nombre y entra en Ajustes › Ayuda.',
      },
      {
        senal: delVacio('Nuevo cliente'),
        opcional: true,
        avanza: 'clic',
        titulo: 'Empieza por tu primer cliente',
        texto: 'Con su nombre basta. Pulsa «Nuevo cliente».',
      },
    ],
  },
  {
    id: 'pantalla-clientes',
    serie: 'entrenador',
    pantalla: 'clientes',
    titulo: 'Clientes',
    resumen: 'Tu cartera entera.',
    empieza: '/clientes',
    pasos: [
      {
        senal: delVacio('Nuevo cliente'),
        opcional: true,
        avanza: 'clic',
        hecho: { campo: 'Nombre' },
        titulo: 'Da de alta a tu primer cliente',
        texto: 'Pulsa «Nuevo cliente»: su alta se abre aquí mismo.',
      },
      {
        senal: { campo: 'Nombre' },
        opcional: true,
        listo: { relleno: { campo: 'Nombre' } },
        pista: 'Escribe su nombre para seguir',
        titulo: 'Escribe su nombre',
        texto: 'Es lo único obligatorio. Lo demás, ahora o cuando quieras.',
      },
      {
        senal: { css: 'button', texto: 'Guardar cliente' },
        opcional: true,
        avanza: 'clic',
        hecho: { css: 'button', texto: 'Copiar su enlace de acceso' },
        titulo: 'Guárdalo',
        texto: 'Entra en tu cartera al momento.',
      },
      {
        senal: { css: 'button', texto: 'Copiar su enlace de acceso' },
        opcional: true,
        avanza: 'clic',
        titulo: 'Mándale su enlace',
        texto: 'Se copia solo: pégalo en WhatsApp. Con él crea su cuenta y ve su plan en el móvil.',
      },
      {
        senal: { css: '.cartera-cab-tabs' },
        opcional: true,
        titulo: 'Tu cartera, por tramos',
        texto: 'Activos, pendientes de empezar, en pausa y archivados. Cada tramo sale cuando tiene a alguien.',
      },
      {
        senal: { css: '.cartera-cuerpo tbody tr' },
        opcional: true,
        avanza: 'clic',
        titulo: 'Entra en su ficha',
        texto: 'Pulsa su nombre: resumen, entreno, dieta, revisiones y protocolo.',
      },
    ],
  },
  {
    id: 'pantalla-cobros',
    serie: 'entrenador',
    pantalla: 'cobros',
    titulo: 'Cobros',
    resumen: 'Quién te paga y cuándo.',
    empieza: '/ingresos',
    pasos: [
      {
        senal: [{ css: '.cobros-cuerpo' }, { css: '.cobros .empty' }],
        titulo: 'Cobros: quién te paga y cuándo',
        texto: 'Lo que vence este mes, lo cobrado y quién va tarde. Sale de la tarifa de cada cliente.',
      },
      {
        senal: { css: 'a', texto: 'Poner tarifas' },
        opcional: true,
        avanza: 'clic',
        titulo: 'Ponles su tarifa',
        texto: 'Sin tarifa no hay nada que sumar. Pulsa y pon cuánto te paga cada uno.',
      },
      {
        senal: delVacio('Nuevo cliente'),
        opcional: true,
        avanza: 'clic',
        titulo: 'Primero, un cliente',
        texto: 'Cobros cuenta sola en cuanto hay alguien con tarifa.',
      },
    ],
  },
  {
    id: 'pantalla-agenda',
    serie: 'entrenador',
    pantalla: 'agenda',
    titulo: 'Agenda',
    resumen: 'Las revisiones y citas de todos.',
    empieza: '/calendario',
    pasos: [
      {
        senal: [{ css: '.agenda-caja' }, { css: '.agenda .empty' }],
        titulo: 'Agenda: lo que viene',
        texto: 'Las revisiones y las citas de toda tu cartera, por días. El día de revisión de cada cliente sale solo.',
      },
      {
        senal: delVacio('Nuevo cliente'),
        opcional: true,
        avanza: 'clic',
        titulo: 'Primero, un cliente',
        texto: 'Da de alta a alguien y su revisión aparece aquí.',
      },
    ],
  },
  {
    id: 'pantalla-protocolos',
    serie: 'entrenador',
    pantalla: 'protocolos',
    titulo: 'Protocolos',
    resumen: 'Lo que le pides a cada cliente.',
    empieza: '/protocolos',
    pasos: [
      {
        senal: { css: '.proto-bloque' },
        titulo: 'Tu protocolo: lo que pides',
        texto: 'El alta al entrar, el parte tras entrenar, el check-in de cada semana y tus avisos. Viene uno montado, y cada cliente lleva uno.',
      },
      {
        senal: { css: '.cartera-cab-tabs a', texto: 'Formularios' },
        titulo: 'Las preguntas, en Formularios',
        texto: 'Ahí escribes qué pregunta cada formulario. El protocolo decide cuándo se lo pide.',
      },
      {
        senal: { css: 'button', texto: 'Mandar algo' },
        titulo: 'Algo suelto, a quien quieras',
        texto: 'Un cuestionario, un vídeo o un encargo a unas personas concretas, sin tocar su protocolo.',
      },
    ],
  },
  {
    id: 'pantalla-libreria',
    serie: 'entrenador',
    pantalla: 'libreria',
    titulo: 'Librería',
    resumen: 'Tus ejercicios y alimentos.',
    empieza: '/ejercicios',
    pasos: [
      {
        senal: { css: 'input[placeholder^="Buscar"]' },
        titulo: 'Tu librería',
        texto: 'Los ejercicios y alimentos con los que montas rutinas y dietas: los del catálogo y los tuyos.',
      },
      {
        senal: { css: '.cartera-cab-tabs' },
        titulo: 'Ejercicios y alimentos',
        texto: 'Cambia de uno a otro aquí.',
      },
      {
        senal: { css: '.cartera-cab button', texto: 'Nuevo' },
        titulo: 'Añade los tuyos',
        texto: 'Con tu vídeo y tus pautas. Tu cliente los ve cuando entrena.',
      },
    ],
  },
  {
    id: 'pantalla-plantillas',
    serie: 'entrenador',
    pantalla: 'plantillas',
    titulo: 'Plantillas',
    resumen: 'Lo que guardas para reutilizar.',
    empieza: '/plantillas',
    pasos: [
      {
        senal: { css: '.cartera-cab-tabs' },
        titulo: 'Lo que reutilizas',
        texto: 'Bloques, días, platos y grupos que guardas para ponérselos a otro cliente de un toque.',
      },
      {
        senal: { css: '.cartera-cuerpo' },
        titulo: 'Se guardan desde su sitio',
        texto: 'Un bloque, desde su «···» en el entreno de un cliente; un plato o un día, desde su dieta. Aquí los encuentras luego.',
      },
    ],
  },
  {
    id: 'pantalla-ficha',
    serie: 'entrenador',
    pantalla: 'ficha',
    titulo: 'La ficha de un cliente',
    resumen: 'Todo lo suyo, en cinco pestañas.',
    empieza: '/c/:cliente/resumen',
    conCliente: true,
    pasos: [
      {
        senal: { css: '.cliente-cab-tabs' },
        titulo: 'Su ficha, en cinco pestañas',
        texto: 'Resumen, entreno, dieta, revisiones y protocolo. Todo lo suyo está aquí.',
      },
      {
        senal: { css: '.resumen-arranque' },
        opcional: true,
        titulo: 'Para empezar',
        texto: 'Lo que le falta a su ficha. Cada línea te lleva a hacerlo.',
      },
      {
        senal: { css: 'a.palanca', texto: 'Monta su rutina' },
        opcional: true,
        avanza: 'clic',
        titulo: 'Móntale el entreno',
        texto: 'Empieza por aquí: su rutina es lo primero que verá cuando entre.',
      },
    ],
  },
  {
    id: 'pantalla-entreno',
    serie: 'entrenador',
    pantalla: 'entreno',
    titulo: 'Entreno',
    resumen: 'Su rutina, por bloques y hojas.',
    empieza: '/c/:cliente/rutina',
    conCliente: true,
    pasos: [
      {
        senal: delVacio('Traer de un fichero'),
        opcional: true,
        titulo: '¿Ya tienes su rutina?',
        texto: 'Tráela de tu Excel, Word o PDF: se leen los días, los ejercicios y las series. Si en el fichero va su dieta, entra también.',
      },
      {
        senal: delVacio('Nuevo microciclo'),
        opcional: true,
        avanza: 'clic',
        titulo: 'O empieza de cero',
        texto: 'Un microciclo es una semana de entreno. Pulsa y te deja su primera hoja lista.',
      },
      {
        senal: { css: '.plan-traer' },
        opcional: true,
        titulo: 'La hoja en blanco también lo acepta',
        texto: 'Mientras el bloque esté vacío, suelta aquí su fichero y se llena solo.',
      },
      {
        senal: { css: '.tira-mas[aria-label^="Añadir una hoja"]' },
        opcional: true,
        titulo: 'Una hoja por día de entreno',
        texto: 'Pierna, empuje, tirón… Añade las que entrena cada semana.',
      },
      {
        senal: { css: '.plan-alta-abrir' },
        opcional: true,
        avanza: 'clic',
        titulo: 'Escribe su primer ejercicio',
        texto: 'Pulsa «+ ejercicio» y búscalo por su nombre.',
      },
    ],
  },
  {
    id: 'pantalla-dieta',
    serie: 'entrenador',
    pantalla: 'dieta',
    titulo: 'Dieta',
    resumen: 'Lo que le pides cada día.',
    empieza: '/c/:cliente/nutricion',
    conCliente: true,
    pasos: [
      {
        senal: { css: '.dieta-prescripcion' },
        opcional: true,
        titulo: 'Primero, lo que le pides',
        texto: 'Sus kcal y sus macros de cada día. Si la pautas por comidas, se reparten después.',
      },
      {
        senal: { css: '.dieta-traer' },
        opcional: true,
        titulo: 'O trae la que ya tienes',
        texto: 'Suelta su Excel, Word o PDF: se leen las comidas y los alimentos.',
      },
      {
        senal: { css: 'button', texto: 'Poner el objetivo' },
        opcional: true,
        avanza: 'clic',
        titulo: 'Ponle su objetivo',
        texto: 'Pulsa y escribe sus kcal.',
      },
    ],
  },
  {
    id: 'pantalla-revisiones',
    serie: 'entrenador',
    pantalla: 'revisiones',
    titulo: 'Revisiones',
    resumen: 'Su semana, y tu respuesta.',
    empieza: '/c/:cliente/semana',
    conCliente: true,
    pasos: [
      {
        senal: [{ css: '.mando' }, { css: '.empty' }],
        titulo: 'Su semana, entera',
        texto: 'Lo que entrenó, lo que entregó —peso, medidas, fotos y cuestionario— y el sitio para contestarle.',
      },
      {
        senal: { css: '.cierre' },
        opcional: true,
        titulo: 'Y la cierras',
        texto: 'Cuando la has leído y le has contestado, la cierras aquí.',
      },
      {
        senal: delVacio('Montar su semana'),
        opcional: true,
        avanza: 'clic',
        titulo: 'Antes, su semana',
        texto: 'Sin rutina no hay nada que revisar. Pulsa y móntasela.',
      },
    ],
  },
  {
    id: 'pantalla-protocolo',
    serie: 'entrenador',
    pantalla: 'protocolo',
    titulo: 'Su protocolo',
    resumen: 'Lo que le pides a esta persona.',
    empieza: '/c/:cliente/protocolo',
    conCliente: true,
    pasos: [
      {
        senal: { css: '.proto-pagina-cab' },
        titulo: 'Su protocolo',
        texto: 'Lleva el tuyo. Lo que cambies aquí se queda solo para esta persona.',
      },
      {
        senal: { css: '.salidas' },
        opcional: true,
        titulo: 'Lo que le llega',
        texto: 'Lo que le sale con fecha, antes de que le llegue.',
      },
    ],
  },
];

export const GUIAS = [...ENTRENADOR, ...CLIENTE, ...PANTALLAS];

/** Las guías de una serie, en su orden. Las de cada pantalla no: son de su sitio. */
export const guiasDe = (serie) => GUIAS.filter((g) => g.serie === serie && !g.pantalla);

/** Las de cada pantalla, en el orden de la barra: se repasan desde Ajustes › Ayuda. */
export const guiasDeLasPantallas = () => GUIAS.filter((g) => g.pantalla);

/*
  Qué pantalla es una ruta, para su guía. La librería son dos rutas —ejercicios
  y alimentos— con una sola guía; y `/rutina/componer` no es Entreno.
*/
const RUTAS_DE_PANTALLA = [
  [/^\/hoy\/?$/, 'pantalla-inicio'],
  [/^\/clientes\/?$/, 'pantalla-clientes'],
  [/^\/ingresos\/?$/, 'pantalla-cobros'],
  [/^\/calendario\/?$/, 'pantalla-agenda'],
  [/^\/protocolos\/?$/, 'pantalla-protocolos'],
  [/^\/(ejercicios|alimentos)\/?$/, 'pantalla-libreria'],
  [/^\/plantillas\/?$/, 'pantalla-plantillas'],
  [/^\/c\/[^/]+\/resumen\/?$/, 'pantalla-ficha'],
  [/^\/c\/[^/]+\/rutina\/?$/, 'pantalla-entreno'],
  [/^\/c\/[^/]+\/nutricion\/?$/, 'pantalla-dieta'],
  [/^\/c\/[^/]+\/semana\/?$/, 'pantalla-revisiones'],
  [/^\/c\/[^/]+\/protocolo\/?$/, 'pantalla-protocolo'],
];

/** La guía de la pantalla de una ruta, o `null` si esa pantalla no tiene. */
export const guiaDeLaPantalla = (pathname) =>
  guiaPorId(RUTAS_DE_PANTALLA.find(([re]) => re.test(pathname || ''))?.[1]);

/**
 * Si las guías de cada pantalla se abren solas a este entrenador.
 *
 * Son para quien empieza. El 19 de septiembre de 2026, el dueño —con meses de
 * uso y su cartera en marcha—: *«me salta a mí, entrenador que ya se gestionar
 * a mis clientes, eso está mal»*. Quien ya lleva la casa no necesita que le
 * expliquen Inicio.
 *
 * Lo que diga él manda: `sinPantallas` guardado (el interruptor del índice o
 * «No enseñarme más»). Si nunca ha dicho nada, vienen encendidas solo si aún
 * no tiene rodaje, y rodaje es **algún cliente que ya entró con su enlace**: el
 * ciclo entero —alta, programar, invitar— hecho al menos una vez. Tener un
 * cliente dado de alta no basta: es justo cuando más sirven las guías de la
 * ficha, Entreno y Dieta.
 */
export const pantallasEncendidas = (aprende, clients) => {
  if (typeof aprende?.sinPantallas === 'boolean') return !aprende.sinPantallas;
  return !(clients || []).some((c) => Boolean(c.clientProfileId));
};

export const guiaPorId = (id) => GUIAS.find((g) => g.id === id) || null;

/** Lo que el portal considera monitor: la misma consulta que usan sus rutas. */
export const CONSULTA_MONITOR = '(min-width: 1024px)';

/** Los pasos de una guía en un aparato: los de los dos, y los de ese. */
export const pasosDe = (guia, aparato) =>
  (guia?.pasos || []).filter((p) => !p.aparato || p.aparato === aparato);

/** La bienvenida que se abre sola la primera vez que entra un cliente. */
export const GUIA_BIENVENIDA_CLIENTE = 'bienvenida';

/**
 * Qué guía enseña cada paso de «Por dónde empezar» (`domain/onboarding.js`).
 * Invitar no tiene guía propia: es el último paso de «Da de alta».
 */
export const GUIA_DEL_PASO = {
  alta: 'alta',
  programar: 'bloque',
  invitar: 'alta',
  protocolo: 'protocolo',
};

/**
 * La ruta real de una guía o de un paso. Sin cliente, una ruta que lo necesita
 * no tiene destino: devuelve `null` y quien la pinta dice por qué.
 */
export const rutaDe = (ruta, clienteId) => {
  if (!ruta) return null;
  if (!ruta.includes(':cliente')) return ruta;
  return clienteId ? ruta.replace(':cliente', clienteId) : null;
};

/** Dónde se hace un paso: el suyo, o el de su guía. */
export const dondeDelPaso = (guia, paso, clienteId) =>
  rutaDe(paso?.donde || guia.empieza, clienteId);

/** Una señal siempre como lista de alternativas. */
export const alternativas = (senal) => (senal ? (Array.isArray(senal) ? senal : [senal]) : []);
