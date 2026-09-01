import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  Camera,
  Check,
  CreditCard,
  MessageSquareQuote,
  NotebookPen,
  Video,
} from 'lucide-react';

import { supabase } from '@/lib/supabaseClient';
import { guardarIntencion } from '@/lib/intencionDePlan';
import { planAhorroPct, planPrice, storageLabel } from '@/lib/num';
import { localeNumber } from '@/lib/dates';
import { useReveal } from '@/lib/useReveal';
import { useNoche } from '@/lib/useNoche';
import { LogoMark } from '@/components/ui/Logo';

/**
 * La cara pública. Lo que ve quien llega sin sesión.
 *
 * ══ A quién le habla, y en cuántas palabras ═════════════════════════════════
 *
 * A un entrenador que ya lleva gente y aguanta con una hoja de cálculo, una app
 * de entreno y una cadena de WhatsApp. No está comparando productos: está
 * decidiendo si merece la pena mover lo que ya tiene. Y lo decide MIRANDO, no
 * leyendo.
 *
 * De ahí la regla de toda la página: **un rótulo, un titular de una línea, una
 * frase, y la pantalla**. Aquí hubo párrafos de cinco líneas por sección
 * explicando el producto, y no se leían: en una portada, el párrafo largo es lo
 * que se salta el ojo para llegar a la imagen. Si algo hace falta contarlo con
 * cinco líneas, es material de las dudas o de la ayuda, no del escaparate.
 *
 * ── El orden ────────────────────────────────────────────────────────────────
 * Promesa (una pantalla) → el cliente entero, de los dos lados → el plan y el
 * progreso → lo que además trae → cuánto vale → cinco dudas → cierre.
 *
 * ══ EL PAR: la unidad de esta página ════════════════════════════════════════
 *
 * Aquí hubo un anillo: cinco pantallas girando en 3D —una rutina, un móvil, un
 * check-in, otro móvil, una semana— y cada cuatro segundos y medio aparecía la
 * siguiente. Enseñaba mucho y contaba poco, por dos motivos que no se arreglan
 * ajustando el giro:
 *
 *   · **Eran cinco cosas sueltas.** Rutina, móvil, check-in, móvil, semana. El
 *     orden era el de un catálogo, no el de un argumento, y una pantalla de
 *     escritorio seguida del móvil de otra sección no dice nada de las dos.
 *   · **Y estaban encima unas de otras.** Cinco láminas superpuestas en el
 *     hueco de una: la del centro con dos rebanadas giradas pisándole los
 *     cantos. Se atora la vista antes de leer una cifra.
 *
 * Lo que hay ahora es el PAR: la misma cosa en tu pantalla y en la suya, juntas
 * y con el discurso al lado. Dos pares y nada más —la sesión y la dieta—, que
 * son los dos únicos trabajos que se hacen todas las semanas.
 *
 * Un par dice de un vistazo lo que cinco pantallas en fila no decían: que
 * programar y entrenar son el MISMO objeto visto desde los dos extremos. Y deja
 * sitio de verdad alrededor de cada captura, que es lo que el anillo no tenía.
 *
 * ── Y la conversación vive en el par de la sesión ───────────────────────────
 * La nota que él escribe al acabar y lo que tú le contestas. Estaban flotando
 * en el héroe, encima de una pantalla de cifras con la que no tenían nada que
 * ver. Su sitio es este: entre la sesión que le mandas y la sesión que hace,
 * porque es literalmente lo que pasa entre esas dos pantallas — y es lo único
 * de toda la página que no cabe en una hoja de cálculo.
 *
 * ── Y cada sección se presenta DISTINTO ────────────────────────────────────
 * A propósito, y es lo que hace que una página larga se recorra: seis bloques
 * con la misma forma —rótulo, titular, imagen centrada— se leen como una lista,
 * por buena que sea cada imagen. Aquí no hay dos iguales:
 *
 *   · el héroe, una escena centrada y cortada por el canto de la pantalla;
 *   · el cliente, dos pares de aparatos con el discurso al lado y alternando;
 *   · el plan y el progreso, dos ventanas en escalón;
 *   · lo que además trae, una rejilla de cuatro fichas;
 *   · los precios, tres tarjetas;
 *   · las dudas, una lista numerada;
 *   · y el cierre, una losa de tiza.
 *
 * ══ Las capturas van RECORTADAS y de NOCHE ══════════════════════════════════
 *
 * Recortadas porque una captura de la pantalla entera no vende: la mitad de lo
 * que sale es cromo —la cabecera con la marca, el buscador, el avatar— y el
 * cromo es exactamente lo que tiene igual cualquier aplicación del mundo. Lo que
 * distingue a esta son la tabla de series, los anillos de calorías y las cifras
 * de la semana.
 *
 * Y de noche porque la portada lo es. Aquí estuvieron las piezas de escritorio
 * en tema CLARO y las de móvil en oscuro, en la misma escena: una ventana blanca
 * con un teléfono negro apoyado encima. Cada pieza estaba bien y el conjunto
 * estaba roto — se veía la costura sin buscarla. Ahora todo sale del mismo tema
 * que la página, así que el marco ya no está tapando un problema: está diciendo
 * «esto es una pantalla».
 *
 * `scripts/recortar-capturas.ps1` deja en `public/capturas/` una pieza por
 * sección. Es un recorte, no un montaje: los datos, la tipografía y los colores
 * son los que salen de la aplicación. Lo único que se quita es el aire, y lo
 * único que se ajusta es la ESCALA —las capturas crudas vienen con zooms
 * distintos y sin igualarlas la letra cambia de tamaño de una pieza a otra—.
 *
 * ══ La forma: escaparate de noche ═══════════════════════════════════════════
 *
 *   1. **Negro fijo.** `.lp-noche` mientras la página está montada, vía
 *      `lib/useNoche.js` —el mismo gancho que usa el acceso—.
 *   2. **Una sola tinta: la señal.** `--accent`, la misma del producto: entrar
 *      aquí y entrar en la aplicación no cambia de color. Pinta lo que SEÑALA y
 *      nada más.
 *
 *      La brasa —el rojo del disco de 25 kg del logotipo— se queda donde esta
 *      página siempre dijo que tenía que estar el color: en la LUZ de detrás
 *      (`--brasa-luz`), no en la tinta. Una cálida que rellena y una fría que
 *      manda, que es la iluminación de dos fuentes de toda la vida.
 *
 *      Y no aparece igual en todas las secciones, que es lo que la convertía en
 *      un tic: estaba la misma lumbre detrás del mismo remate en cursiva, siete
 *      veces seguidas y con la misma intensidad. Un acento que se repite idéntico
 *      deja de ser un acento a la tercera vez.
 *
 *      Ahora cada sección lo lleva de una manera y solo una:
 *
 *        · el héroe, la lumbre a plena potencia detrás del remate;
 *        · los pares, el número que los ordena —01, 02— y el icono de la chapa;
 *        · el plan y el progreso, la lumbre a media luz;
 *        · lo que además trae, los azulejos de los iconos;
 *        · los precios, las palomas y el encendido de la tarjeta gratuita;
 *        · las dudas, la cifra de la que está abierta;
 *        · y el cierre, que no lleva ninguna porque es de tiza entera.
 *
 *      La intensidad se gradúa desde `--lumbre`, una variable por sección (ver
 *      `index.css`): no hay dos secciones seguidas con la misma temperatura.
 *   3. **Franjas, no huecos.** Las secciones alternan entre el lienzo y un
 *      escalón más claro a sangre (`.is-band`).
 *   4. **Todo entra al llegar.** Cada sección aparece cuando se alcanza, y su
 *      contenido en cascada (`.lp-tanda`). Es lo que hace que una página larga
 *      se recorra en vez de leerse.
 *
 * ══ Los precios salen de la base de datos ══════════════════════════════════
 *
 * De `plan_limits`, la MISMA tabla que lee Ajustes → Plan. El «desde» se calcula
 * de esas filas: si mañana hay un plan más barato, el titular lo dice solo.
 */

/**
 * Las piezas de escritorio, cada una con las medidas de su recorte.
 *
 * Las medidas van escritas y no deducidas: sin `width` y `height` el navegador
 * no sabe cuánto sitio reservar y la página pega un salto cuando cargan las
 * imágenes, justo mientras se lee el primer titular. Y tienen que ser las
 * REALES del archivo, así que si se cambia un recorte en el script hay que
 * traer aquí las medidas que imprime.
 *
 * ══ Y `css`, que es lo que arregla la letra sucia ═══════════════════════════
 *
 * `ancho`/`alto` son los píxeles que TRAE el archivo; `css` es el ancho máximo
 * al que se PINTA. Y los dos hacen falta porque no son lo mismo:
 *
 *   · La pieza de la dieta sale de una captura de 1032 px. Antes se guardaba
 *     reducida a 770 y la ventana la estiraba hasta 858: reducir un tercio y
 *     volver a ampliar es exactamente por lo que esa sección se veía pixelada.
 *   · Ahora el archivo llega entero y **se pinta más pequeño que sus píxeles**.
 *
 * ── Y ya están sacadas al DOBLE de densidad ────────────────────────────────
 *
 * Que es lo único que arregla esto del todo. En un portátil de Windows al 125 %
 * —el ajuste de fábrica de casi cualquiera de los últimos años— un píxel de CSS
 * son 1,25 píxeles de pantalla, así que una captura pintada a su tamaño exacto
 * la AMPLÍA el sistema operativo antes de enseñarla: eso es lo que se veía
 * pixelado por mucho que el archivo estuviera intacto.
 *
 * Las capturas nuevas vienen del navegador con el DPR a 2 (`F12` → el icono de
 * móvil/tableta → «Dimensions: Responsive» → DPR 2 → «Capture screenshot»), o
 * sea con dos píxeles de archivo por cada píxel de la pantalla que se
 * fotografió. Pintadas al mismo tamaño de siempre, el navegador REDUCE cuatro
 * veces los píxeles que necesita — y reducir siempre sale limpio, al 100 % y al
 * 125 %.
 *
 * Por eso `ancho` es ahora más o menos el cuádruple que `css` y no hay que
 * asustarse: `css` no ha cambiado, y es lo que decide la maqueta.
 *
 * La única que sigue sin volver a tomarse es el check-in, y se nota si se busca.
 *
 * ── Y en el móvil se ven ENTERAS ───────────────────────────────────────────
 * Aquí las capturas se pintaban al doble del hueco y se deslizaban dentro del
 * marco, para que la letra no se fuera a un tercio de su tamaño. Lo que salía
 * en un teléfono de 390 era el 30 % de la imagen —cortada por el canto derecho
 * a media tabla— y nadie arrastra un trozo de captura en una portada: se lee
 * como una imagen mal puesta, no como que sigue.
 *
 * Así que se ven enteras, pequeñas y con su proporción. La letra pequeña no se
 * arregla estirando la imagen: se arregla sacando recortes más CERRADOS en
 * `scripts/recortar-capturas.ps1`. Ver `.lp-shot-vista` en `index.css`.
 */
/**
 * EL HÉROE: qué es esto, y una pantalla que lo enseña.
 *
 * ══ Por qué el héroe volvió a tener imagen ══════════════════════════════════
 *
 * Aquí estuvo, en este orden: una escena de dos aparatos enseñando la misma
 * pantalla dos veces, después una ventana con el resumen de UN cliente, y
 * después nada. La primera pantalla entera pasó a ser texto —rótulo, titular,
 * párrafo, dos botones y una nota—, con el argumento de que un panel de cifras
 * no dice nada.
 *
 * Y ese argumento seguía siendo bueno; lo que estaba mal era la conclusión. El
 * problema de aquella ventana no era que fuera una imagen: era QUÉ imagen. El
 * resumen de un cliente es un panel de indicadores, y un panel de indicadores lo
 * tiene igual cualquier producto del mundo. Quitarlo dejó la portada sin lo
 * único que un escaparate no puede no tener: algo que mirar antes de leer.
 *
 * Cinco bloques de texto apilados no tienen jerarquía —todos piden lo mismo, que
 * es que los leas— así que la primera pantalla no tenía nada que hacer de golpe.
 *
 * ══ Y por qué es ESTA pantalla y no otra ════════════════════════════════════
 *
 * Porque es la única de la aplicación donde salen VARIOS clientes a la vez. La
 * frase del héroe dice «toda tu asesoría en un solo sitio», y esta es la
 * pantalla donde eso se ve sin que haya que explicarlo: dos nombres distintos bajando por
 * la misma columna, cada uno con lo que hizo y cuándo —un pesaje, cuatro fotos,
 * dos sesiones registradas— y al lado la lista de los que están esperando, con
 * un check-in entregado esperando respuesta.
 *
 * Y arriba del todo, la revisión que hay pendiente: quién va en dirección
 * contraria a su objetivo, cuánto, y el botón de ajustárselo. Es lo único de la
 * captura que no es un registro de algo que ya pasó sino una DECISIÓN que hay
 * que tomar hoy — que es exactamente el trabajo que esta herramienta hace y que
 * una hoja de cálculo no hace.
 *
 * Ahí estuvo la gráfica de las dos semanas y se cambió por esto. Ver `p-hoy` en
 * `scripts/recortar-capturas.ps1`: miden casi lo mismo, así que la ventana no
 * creció y el feed no se cayó por debajo del corte.
 *
 * Las otras cinco capturas de escritorio de la página son de UNA persona. Por
 * buenas que sean, ninguna puede sostener esa frase, y además todas tienen ya su
 * sitio más abajo: repetir aquí una de ellas es gastar la primera pantalla en
 * enseñar algo que se va a volver a ver a dos pantallazos de distancia.
 *
 * ── Y el teléfono, que es la otra mitad ────────────────────────────────────
 * La ventana dice lo que ves TÚ. El teléfono dice que el cliente lo lleva
 * encima, y sin él la portada vende un panel de control. Es la misma sesión que
 * aparece en el par 01 —el aductor a 55 que se queda en seis repeticiones— y ahí
 * se lee de cerca; aquí no hay que leerla, hay que reconocer que es una
 * aplicación de entrenar en el móvil de alguien.
 *
 * Que la captura se repita a dos secciones de distancia es la única costura de
 * esta escena, y es de material, no de maqueta: hace falta una pantalla de
 * cliente más para quitarla.
 *
 * ══ Lo que dice la letra: la categoría en el rótulo, la POSTURA en el titular ═
 *
 * Esto lleva tres versiones y cada una arregló algo:
 *
 *   · «Entrena a más. Gestiona menos.» — promesa de resultado. Se la puede
 *     poner encima cualquier producto y quien llega sigue sin saber qué mira.
 *   · «Todos tus clientes, en un solo sitio» — la categoría. Correcta y muda:
 *     no dice por qué ESTA y no cualquier CRM con la palabra «fitness» encima.
 *   · Lo de ahora: la categoría baja al rótulo («Plataforma de gestión de
 *     clientes») y el titular toma partido — «La primera app para entrenadores
 *     de verdad». Es la frase del dueño del producto, y hace lo que un titular
 *     tiene que hacer: decir contra qué se planta. Las apps de entrenamiento
 *     que existen son churreras de rutinas con el cliente de adorno; esta está
 *     pensada desde el trabajo real de llevar gente. «En un solo sitio» no se
 *     pierde: se va a la frase, pegado a la pantalla que lo demuestra.
 *
 * Y el enemigo se nombra en la frase, no en el titular: el Excel y el
 * copia-pega, que es lo que de verdad se sustituye.
 *
 * ── Y la frase se quedó en UNA línea de argumento ──────────────────────────
 * Eran tres líneas que enumeraban seis funciones y tres cosas que sustituye. Con
 * la escena debajo, ese párrafo hacía dos daños a la vez: se llevaba el sitio que
 * necesita la imagen para entrar en el pliegue, y contaba con palabras lo que la
 * imagen cuenta mejor. Se queda lo que la imagen NO puede decir: qué se sustituye
 * —la hoja de cálculo y la cadena de WhatsApp—, que es lo que hace que un
 * entrenador se reconozca en la frase.
 *
 * ── Y aquí se fueron LOS BOTONES ───────────────────────────────────────────
 * «Empezar gratis» y «Ver cómo funciona». El primero está ya en la barra, que va
 * pegajosa y se ve en toda la página, y otra vez en el cierre; el segundo era un
 * botón para hacer lo que se hace igual bajando. Dos pastillas entre el titular y
 * la escena eran una barrera en mitad del único sitio de la portada donde no
 * puede haber ninguna.
 *
 * Y el precio («desde 39 €») también se fue, más tarde: una cifra de pago en la
 * primera pantalla le pone precio a la promesa antes de haberla enseñado. La
 * nota se queda con lo que NO cuesta, y el «desde» vive en la sección de
 * precios. Ver la nota junto a `lp-cta-note`.
 */
const HERO = {
  ventana: {
    src: '/capturas/p-hoy.jpg',
    ancho: 2450,
    alto: 982,
    css: 980,
    titulo: 'Hoy',
    alt: 'El inicio del entrenador: arriba, la revisión pendiente de Javier López, que va en dirección contraria a su objetivo a +0,26 kg por semana, con el botón de ajustarlo. Debajo, lo que ha hecho cada cliente día a día —Víctor Gómez con sus pesajes y dos sesiones registradas, Javier López con su pesaje y cuatro fotos de progreso— y al lado la lista de los que esperan: un check-in entregado por contestar y diez clientes por invitar.',
  },
  movil: {
    src: '/capturas/m-rutina.jpg',
    ancho: 430,
    alto: 744,
    alt: 'La sesión del día en el móvil de un cliente: los dos primeros ejercicios ya marcados con sus kilos, sus repeticiones y su RIR, y el tercero todavía en blanco.',
  },
};

/**
 * LOS DOS PARES: la misma cosa en tu pantalla y en la suya.
 *
 * ══ Qué es un par ══════════════════════════════════════════════════════════
 *
 * Una ventana de escritorio y el teléfono del cliente enseñando LO MISMO desde
 * el otro extremo, con el discurso al lado. No son dos capturas puestas juntas:
 * son las dos mitades de un trabajo, y por eso el teléfono pisa el canto de la
 * ventana en vez de estar en su propia fila.
 *
 * Son dos y no cinco a propósito. La sesión y la dieta son los dos únicos
 * trabajos que un entrenador hace TODAS las semanas con TODOS sus clientes; lo
 * demás —el check-in, el plan por fases— o se consulta o se toca de vez en
 * cuando, y tiene su sitio en la secuencia de más abajo.
 *
 * ══ Y las dos mitades son la MISMA pantalla ════════════════════════════════
 *
 * Esto costó dos intentos. El par de la sesión enseñaba un día de «Push» en la
 * ventana y uno de «Legs» en el teléfono: dos pantallas puestas juntas para
 * decir «esto es lo mismo visto desde los dos lados» y contando dos días
 * distintos. Se le ve la costura a la primera, y a quien se la ve es justo a
 * quien está comparando las dos porque está a punto de darse de alta.
 *
 * Ahora las dos son «Legs A» del mismo cliente y del MISMO momento: seis series
 * de veintiuna. En la ventana se ven las seis hechas con sus kilos; en el
 * teléfono, esas mismas seis y las que le quedan por delante en blanco. O sea la
 * misma sesión a mitad, vista desde los dos extremos — que es exactamente lo que
 * el par existe para enseñar.
 *
 * ── El número, y por qué está ──────────────────────────────────────────────
 * `01` y `02`, en la señal. Es lo único de color de esta sección y hace dos cosas a
 * la vez: dice que hay un orden —esto no es una rejilla de funciones— y le da a
 * la sección su propia manera de llevar la tinta, distinta de la lumbre de los
 * titulares y de los azulejos de las fichas.
 *
 * ── Y alternan de lado ─────────────────────────────────────────────────────
 * El primero con los aparatos a la derecha y el segundo a la izquierda, aparatos
 * incluidos. Dos pares idénticos uno debajo de otro son una lista; alternados,
 * el ojo cruza la página y sabe que ha cambiado de tema sin leer el titular.
 */
const PARES = [
  {
    id: 'sesion',
    n: '01',
    rotulo: 'Rutinas',
    titulo: 'Le montas la semana,',
    remate: 'y él la registra',
    texto:
      'Montas la sesión ejercicio a ejercicio, con series, objetivos y vídeo. Él la abre en el gimnasio y la rellena mientras entrena: sabes qué ha levantado sin pedírselo.',
    ventana: {
      src: '/capturas/p-sesion.jpg',
      ancho: 1916,
      alto: 1128,
      css: 770,
      /* El rótulo es el que lleva la sesión DENTRO de la aplicación. Traducir el
         nombre de un día de entreno en la portada y dejarlo en inglés en la
         captura de debajo es la clase de costura que quien mira de cerca ve. */
      titulo: 'Rutina · Legs A',
      alt: 'La sesión de Legs A de un cliente a mitad: seis de veintiuna series hechas, con el abdominal colgado a 40, 35 y 35 kg y el aductor a 55, 45 y 45, cada serie con sus repeticiones y su RIR.',
    },
    movil: {
      src: '/capturas/m-rutina.jpg',
      ancho: 430,
      alto: 744,
      alt: 'La misma sesión en el móvil del cliente: los dos primeros ejercicios ya marcados con sus kilos y el tercero todavía en blanco, esperando kilos, repeticiones y RIR.',
    },
    /*
      ══ LA CHAPA, y por qué es UNA ════════════════════════════════════════════

      Aquí hubo dos flotando sobre cada par: una tarjeta grande con la nota del
      cliente —avatar, nombre, hora y un filete separador— y otra con la
      respuesta del entrenador. Tres problemas, y los tres del mismo tamaño:

        · **Eran enormes.** La del cliente medía 300 px de ancho y cinco líneas
          de alto, con su avatar redondo. Una tarjeta de ese tamaño encima de una
          captura no es una nota flotando: es un cartel tapando el producto.
        · **Se comían el contenido**, y sobre todo el del teléfono: la de arriba
          caía justo en la cabecera de la aplicación del móvil.
        · **Y una de las dos no tenía sentido.** Decía «Le contestas · Press
          militar en máquina · Hasta que el hombro afloje» sobre una sesión donde
          nadie había dicho nada de un hombro, y encima el press militar no
          aparecía en ninguna de las dos pantallas.

      Queda UNA por par, pequeña, y dice algo que se puede comprobar mirando la
      captura de al lado. En la sesión, el ejercicio 2 —el aductor— empieza a 55
      y se queda en 6 repeticiones, y las dos series siguientes bajan a 45: eso
      está en la tabla, se ve, y es exactamente lo que un cliente te escribe al
      acabar.

      ── Y el rótulo es SOLO el nombre ────────────────────────────────────────
      «Javier», y no «Javier anota». El verbo lo hacen ya las comillas y la
      forma de la chapa; escrito, convertía un rótulo de dos caracteres en una
      frasecita, y encima obligaba a repetir la misma construcción en la otra
      —«Tú le dejas dicho»—, que es como dos notas pasan a leerse como una
      plantilla rellenada dos veces.

      Y alterna de dirección entre los dos pares —aquí habla él, en la dieta
      hablas tú— que es como se dice que esto va en los dos sentidos sin tener
      que poner dos tarjetas en cada sitio.
    */
    chapa: {
      icono: MessageSquareQuote,
      rotulo: 'Javier',
      dice: '«El aductor a 55 no me salía, he bajado a 45»',
    },
  },
  {
    id: 'dieta',
    n: '02',
    rotulo: 'Dietas',
    titulo: 'Le cuadras la dieta,',
    remate: 'y él elige',
    texto:
      'Montas cada comida y la pantalla te dice si cuadra con su objetivo. Y no es un único menú: le dejas varias opciones por comida y él abre la que le encaje ese día.',
    ventana: {
      src: '/capturas/p-comidas.jpg',
      ancho: 1920,
      alto: 872,
      css: 770,
      titulo: 'Nutrición · Comida 1',
      alt: 'El editor de una comida: el campo de la nota que verá el cliente, cinco opciones para elegir, el objetivo de la comida contra lo que suman los alimentos de verdad y la lista de alimentos con sus cantidades.',
    },
    movil: {
      src: '/capturas/m-dieta.jpg',
      ancho: 768,
      alto: 1328,
      alt: 'La dieta en el móvil del cliente: su objetivo del día con los macros repartidos, los pasos diarios y el menú, con las opciones de la primera comida y los alimentos de la que ha elegido.',
    },
    /*
      La del entrenador, y sale del campo que se ve en la captura: «Cómo
      cocinarlo, marcas, sustituciones… lo verá tal cual».

      ── Y es una INDICACIÓN, no una receta ───────────────────────────────────
      Aquí puso «Los copos con la leche caliente y el cacao dentro», que es una
      instrucción de cocina. Sonaba a receta de blog y contaba lo que menos
      importa: nadie contrata a un entrenador para que le diga cómo se calienta
      la leche. Lo que de verdad se escribe en ese campo es la regla que evita
      la pregunta de después —cómo se pesa, qué hacer el día que no encaja— y
      eso sí es la diferencia entre mandar una tabla de macros y mandar una
      comida.
    */
    chapa: {
      icono: NotebookPen,
      rotulo: 'Tu nota',
      dice: 'Pésalo en crudo, y cambia de opción si no encaja',
    },
  },
];

/**
 * LA SECUENCIA: las tres herramientas con las que se cierra una semana.
 *
 * ══ Qué sustituye ══════════════════════════════════════════════════════════
 *
 * A dos ventanas puestas en escalón, una un poco más abajo que la otra. El
 * escalón decía que había un orden y ahí se acababa: eran dos capturas quietas,
 * cada una con su pie, sin nada que dijera qué tiene que ver la primera con la
 * segunda. Se leían como dos funciones que resulta que van juntas.
 *
 * ══ Y qué dice cada paso, que es lo que estaba mal ═════════════════════════
 *
 * Aquí los tres textos NARRABAN la captura: «va a −0,44», «1.010 kg esta semana,
 * un 3,1 % más». O sea que se gastaban las tres líneas que tiene un paso en
 * leerle a alguien en voz alta unos números de mentira que ya está viendo, y no
 * decían en ningún momento qué herramienta es esa ni para qué sirve. Quien mira
 * esto no está siguiendo el caso de Javier: está decidiendo si esto le sirve.
 *
 * Así que cada paso nombra la HERRAMIENTA —el roadmap, el check-in, el
 * resumen—, dice qué se hace con ella y qué te ahorra. Las cifras se quedan
 * donde valen algo, que es dentro de la captura: ahí no son un argumento, son
 * la prueba de que la pantalla existe.
 *
 * ── Y por eso son tres y no dos ────────────────────────────────────────────
 * Porque medir no es el final. Con el ritmo real delante hay que DECIDIR la
 * semana siguiente, y eso se hace con la ficha entera a la vista — que es la
 * tercera pantalla y la que cierra el bucle.
 *
 * ── El raíl, y que se DIBUJA al bajar ──────────────────────────────────────
 * Una línea vertical con tres paradas numeradas. Es la misma forma que tiene el
 * roadmap DENTRO de la aplicación, y no es un guiño: en los dos sitios dice lo
 * mismo —esto va en este orden— y ya está resuelto.
 *
 * Y cada parada se enciende cuando se llega a ella, con el tramo de línea
 * creciendo desde la anterior. Ver `Paso` y `.lp-ruta` en `index.css`: es lo que
 * convierte tres capturas apiladas en algo que AVANZA mientras se baja, que es
 * justo lo que la sección dice con palabras.
 */
const SECUENCIA = [
  {
    n: '01',
    titulo: 'El roadmap',
    texto:
      'Las fases del objetivo, sus fechas y el ritmo que buscas en cada una. Se monta una vez y desde entonces sabes en qué punto está cada persona sin reconstruirlo de memoria.',
    pieza: {
      src: '/capturas/p-roadmap.jpg',
      ancho: 1920,
      alto: 419,
      css: 770,
      alt: 'El roadmap de un cliente con dos fases: Cut Phase en curso, del 14 de agosto al 10 de septiembre, cuatro semanas de definición a -0,47 kg por semana, y después Bulking Phase, doce semanas de volumen a +0,08.',
    },
  },
  {
    n: '02',
    titulo: 'El check-in',
    texto:
      'La revisión semanal que rellena el cliente: pesajes, medidas y tus preguntas. Te devuelve el ritmo real de la semana, no lo que marque la báscula el lunes.',
    pieza: {
      src: '/capturas/p-checkin.jpg',
      ancho: 1920,
      alto: 743,
      css: 770,
      alt: 'El check-in de una semana: los pesajes de cada día de lunes a domingo, el gráfico de tendencia del promedio semanal y, debajo, la media de la semana con la variación respecto a la anterior.',
    },
  },
  {
    n: '03',
    titulo: 'El resumen',
    texto:
      'Peso, check-ins, carga y calorías en una pantalla, cada uno con su tendencia. Lo que abres antes de decidir si cambias algo o lo dejas correr una semana más.',
    pieza: {
      src: '/capturas/p-ficha.jpg',
      ancho: 1920,
      alto: 912,
      css: 770,
      alt: 'El resumen de un cliente: peso con su tendencia, check-ins de la semana, kilos totales levantados y objetivo de calorías con el reparto de macros; debajo las gráficas de peso corporal y de tonelaje por semana, y la estructura de la semana día a día.',
    },
  },
];

/**
 * Y las cuatro fichas de «lo que además trae».
 *
 * ══ Por qué existe esa sección ══════════════════════════════════════════════
 *
 * Porque todo esto estaba metido en una respuesta de las dudas —«¿qué más
 * trae?»— dentro de un desplegable cerrado, al final de la página y en un solo
 * párrafo de sesenta palabras. O sea: la mitad del producto, escondida en el
 * único sitio de la portada al que hay que hacer clic para llegar.
 *
 * Aquí no se explican, se ENSEÑAN QUE EXISTEN, que es distinto: cuatro fichas
 * con su icono y una línea. Quien busca eso lo encuentra en cuatro segundos;
 * quien no, ve una rejilla y sigue bajando.
 *
 * ── Y por qué en rejilla ───────────────────────────────────────────────────
 * Porque es la única forma de la página que dice «hay MÁS»: una fila de cosas
 * pequeñas y equivalentes. Las secciones grandes dicen «esto es importante» y
 * son cuatro; si estas cuatro tuvieran su propia sección grande, la página
 * duplicaría su largo para decir lo que aquí cabe en una pantalla.
 */
const EXTRAS = [
  {
    icono: Camera,
    titulo: 'Fotos de progreso',
    texto: 'Por semana y por ángulo, con montajes de antes y después.',
  },
  {
    icono: Video,
    titulo: 'Revisiones en vídeo',
    texto: 'Grabadas desde el navegador. Ni Drive ni enlaces sueltos.',
  },
  {
    icono: CalendarDays,
    titulo: 'Calendario y equipo',
    texto: 'Tus sesiones, y la cartera repartida entre varios entrenadores.',
  },
  {
    icono: CreditCard,
    titulo: 'Quién te ha pagado',
    texto: 'Lee tu Stripe y tu Notion y te lo pone al lado de cada cliente.',
  },
];

/** Las dudas que llegan siempre, contestadas en corto. */
const DUDAS = [
  {
    q: '¿Mis clientes tienen que pagar algo?',
    a: 'No. Pagas tú por tu cuenta y ellos entran gratis con la invitación que les mandas, sin límite de cuántos accesos abras dentro de tu plan.',
  },
  {
    q: '¿Se tienen que descargar una app?',
    a: 'No. Se abre en el navegador del móvil y se añade a la pantalla de inicio, con su icono y a pantalla completa. Ni tienda ni actualizaciones.',
  },
  {
    q: '¿Qué más trae, además de lo de arriba?',
    a: 'Check-in semanal con las preguntas que tú escribas, antropometría con pliegues y sus fórmulas, roadmap del objetivo por fases, biblioteca de ejercicios con vídeo, y exportación de todo lo de un cliente cuando la pidas. Nada de esto se cobra aparte: no hay módulos.',
  },
  {
    q: '¿Qué pasa con las fotos y los datos de salud?',
    a: 'Son categoría especial del RGPD y se tratan como tal: cada consulta pasa por las políticas de la base de datos, tu cliente da su consentimiento al entrar y queda registrado con la versión exacta del texto que aceptó, y puedes exportar o borrar todo lo de una persona —fotos incluidas— cuando lo pidas.',
  },
  {
    q: '¿Hay permanencia? ¿Y si un mes no pago?',
    a: 'No hay permanencia: es mensual y la baja se da desde el portal de facturación. Y si un mes no pagas no se borra nada: la cuenta pasa a solo lectura, tus clientes siguen registrando lo suyo, y leer, exportar y borrar no se bloquean nunca.',
  },
];

/**
 * Un bloque que entra al llegar a él.
 *
 * Envuelve en lugar de repetir el gancho en cada sección: son siete, y siete
 * `useReveal()` escritos a mano es donde se olvida uno.
 *
 * Lo que entra en cascada no es esto, es `.lp-tanda`: una caja con esa clase
 * dentro de un bloque reparte el retraso entre sus hijos desde la hoja de
 * estilos, sin un solo estado más en JavaScript.
 */
/* Las opciones del observador de las piezas que entran TARDE —las tarjetas de
   plan y los dos pares—: disparan cuando la pieza ya está un cuarto de pantalla
   dentro, no cuando asoma. Con el margen de serie, una pieza alta se enciende
   pegada al canto de abajo —donde nadie está mirando— y al llegar a ella «ya
   estaba». Vive FUERA del componente porque `useReveal` lee las opciones del
   primer render: un literal escrito en el JSX sería un objeto nuevo en cada
   render sin aportar nada. */
const OBSERVA_TARDE = { rootMargin: '0px 0px -26% 0px', threshold: 0.1 };

const Entra = ({ as: Etiqueta = 'div', className = '', retraso = 0, observa, children, ...resto }) => {
  const [ref, dentro] = useReveal(observa);
  return (
    <Etiqueta
      ref={ref}
      className={`${className} lp-reveal${dentro ? ' is-in' : ''}`}
      style={retraso ? { transitionDelay: `${retraso}ms` } : undefined}
      {...resto}
    >
      {children}
    </Etiqueta>
  );
};

/**
 * Una captura de escritorio dentro de una ventana.
 *
 * ══ Por qué el marco, ahora que las capturas son de noche ═══════════════════
 *
 * El motivo original era otro: las capturas eran claras y sobre un lienzo negro
 * una imagen clara sin canto se lee como un agujero en la página. Eso ya no
 * pasa. Y el marco se queda igualmente, por lo que hace ahora:
 *
 *   · **Separa la pieza del lienzo.** Una captura oscura sobre un fondo oscuro
 *     tiene el problema contrario: se funde. El canto y la sombra son lo que
 *     dicen dónde acaba la página y empieza la pantalla.
 *   · **Explica el corte.** Todo recorte está cortado por algún sitio. Con una
 *     barra arriba, el corte deja de ser un recorte y pasa a ser el borde de una
 *     ventana, que es algo que se entiende sin pensar.
 *
 * La barra lleva el nombre de la SECCIÓN de la aplicación y no una dirección
 * inventada: una URL falsa en una portada es una promesa sobre algo que todavía
 * no existe.
 *
 * ══ Y HAY VENTANAS SIN BARRA, que es lo que pide la secuencia ═══════════════
 *
 * La barra se dibuja solo si la pieza trae `titulo`, y las tres de la secuencia
 * ya no lo traen. El motivo es que allí decía dos veces lo mismo: el paso se
 * titula «El roadmap» y quince píxeles más allá la pastilla del navegador ponía
 * «Progreso · Roadmap». Un rótulo repetido no refuerza, resta — y encima
 * enmarcar cada paso en una ventana de ordenador convertía una secuencia de tres
 * herramientas en tres pantallazos de escritorio, que es justo lo que la sección
 * NO va a contar.
 *
 * Lo que hacía falta del marco se queda: el canto y la sombra de `.lp-plana`,
 * que son los que separan una captura oscura de un lienzo oscuro. Lo que se va
 * es el cromo — los tres puntos y la pastilla—, que solo tiene sentido donde
 * está diciendo «esto es TU pantalla, y esa de al lado es la suya»: los pares.
 */
const Ventana = ({ pieza, titulo = null, prioridad = false, plana = false, className = '' }) => (
  <figure
    className={`${plana ? 'lp-plana' : 'lp-portatil'}${titulo ? '' : ' is-desnuda'} ${className}`}
    /* Hasta dónde puede crecer la captura. Ver el bloque de las piezas: es el
       ancho al que la imagen se pinta 1:1 o por debajo, nunca por encima. */
    style={{ '--nat': `${pieza.css || pieza.ancho}px` }}
  >
    <span className="lp-portatil-tapa">
      <span className="lp-shot">
        {/* La barra del navegador, cuando la pieza se presenta como ventana. Los
            tres puntos a la izquierda y el nombre de la sección en una pastilla
            centrada, que es donde va la dirección en cualquier navegador de los
            últimos quince años. Alineado a la izquierda y sin pastilla parecía el
            título de una tarjeta; centrado y en su chip se lee como lo que
            imita. */}
        {titulo && (
          <span className="lp-shot-bar" aria-hidden="true">
            <span className="lp-shot-dots">
              <i /> <i /> <i />
            </span>
            <span className="lp-shot-tab">{titulo}</span>
          </span>
        )}

        {/* ── Y la imagen va dentro de su propia caja ────────────────────────
            Aquí esta caja fue la que DESLIZABA en un móvil: la imagen se pintaba
            al doble del hueco para que la letra se leyera y se arrastraba dentro
            de ella. Se quitó —enseñaba un tercio de la captura y el corte se
            leía como un fallo, ver `.lp-shot-vista` en `index.css`—, y la caja
            se queda: es lo que separa la PANTALLA del cromo del marco, así que
            un tope de alto, un encuadre o un recorte se le ponen a ella sin que
            los tres puntos y la pastilla se enteren. */}
        <span className="lp-shot-vista">
          {/* `corte`, cuando lo trae la pieza, es hasta qué altura del ARCHIVO se
              enseña: la proporción la manda el corte y la imagen se ancla
              arriba. Es para las capturas que acaban a media tarjeta. Sin él, la
              caja sigue siendo la del archivo entero. */}
          <img
            className={`lp-shot-img${pieza.corte ? ' is-cortada' : ''}`}
            style={pieza.corte ? { '--corte': `${pieza.ancho} / ${pieza.corte}` } : undefined}
            src={pieza.src}
            alt={pieza.alt}
            width={pieza.ancho}
            height={pieza.alto}
            decoding="async"
            /* La del héroe se pide ya; las de abajo, al acercarse. */
            loading={prioridad ? 'eager' : 'lazy'}
          />
        </span>

        {/* El aviso de que esto se puede arrastrar, y SOLO en pantallas
            estrechas —la hoja de estilos lo esconde en el resto—. Va posado
            sobre la captura y no debajo de ella: debajo serían cinco pies de
            foto repetidos bajando por la página, y en los pares chocaría con la
            chapa, que cuelga justo de ese canto.

            Y va FUERA de la caja que desliza, o se iría con la imagen al
            arrastrarla: la única pieza de la escena que no puede moverse es
            precisamente la que dice que se mueve. */}
        <span className="lp-shot-desliza" aria-hidden="true">
          Desliza →
        </span>
      </span>
    </span>

    <span className="lp-portatil-base" aria-hidden="true" />
  </figure>
);

/**
 * El móvil del cliente: un teléfono de verdad, no un rectángulo redondeado.
 *
 * ══ Por qué merece la pena dibujar el aparato ═══════════════════════════════
 *
 * Aquí había un bisel genérico —siete píxeles de relleno y una esquina de 30— y
 * el resultado no se leía como un teléfono, se leía como una captura con el
 * borde redondeado. Y eso importa más de lo que parece: la promesa de esta
 * página es que el cliente lleva el plan ENCIMA, y esa promesa la hace el
 * aparato, no la pantalla.
 *
 * Lo que lo convierte en un iPhone son seis cosas, y ninguna es un adorno:
 *
 *   · **La proporción.** Un teléfono actual es el doble de alto que ancho, y
 *     aquí salía a 1,72: ancho, achatado, más tableta pequeña que teléfono. El
 *     alto lo dicta la captura, así que el arreglo empieza en el script — las
 *     dos capturas de móvil vienen ahora más altas (1,73, el tope que da el
 *     material crudo) y con la misma proporción entre ellas: dos piezas de
 *     distinta proporción dentro del mismo bisel se leen como dos teléfonos
 *     distintos. La cuenta entera está en `.lp-iphone`, en `index.css`.
 *   · **El canto metálico.** Un degradado de tres paradas en el borde. Es lo que
 *     hace que el marco tenga volumen en vez de ser una línea gris.
 *   · **El bisel negro.** Un anillo fino entre el metal y el panel encendido
 *     (`.lp-iphone-lcd`). La captura tocaba el metal directamente, y esa junta
 *     no existe en ningún teléfono.
 *   · **La ISLA y la barra de estado.** Lo que dice «esto es la pantalla de un
 *     teléfono» sin que haya que mirar dos veces. La barra va DELANTE de la
 *     captura y no encima: si la isla se pusiera sobre la cabecera de la
 *     aplicación taparía el buscador, y una pastilla negra tapando un control
 *     se lee como un fallo de maquetación.
 *
 *     Y es una isla FLOTANDO, no una muesca colgada del canto. Aquí hubo lo
 *     segundo, que es lo que llevaba un teléfono de 2019: una pestaña negra
 *     pegada al borde de arriba. La pastilla despegada es lo único que
 *     distingue de un vistazo un teléfono actual de uno viejo, y en una portada
 *     que vende una aplicación de móvil enseñar el aparato de hace seis años
 *     dice justo lo que no hay que decir.
 *   · **La zona de la rayita.** Una franja bajo la barra de pestañas de la
 *     captura, de su mismo color y con la rayita de inicio dentro. Aquí estuvo
 *     escrito que la rayita no iba —la captura llegaba cortada a ras de esa
 *     barra y dibujarla encima tapaba las etiquetas—; el recorte nuevo acaba EN
 *     la barra, así que el hueco que iOS reserva debajo por fin tiene dónde
 *     existir. Ver `.lp-iphone-inicio`.
 *   · **Los botones del canto.** Dos marcas de nada en los laterales. Se notan
 *     solo si faltan.
 *
 * Todo con CSS: ni una imagen que descargar, y se ve nítido a cualquier tamaño.
 *
 * ══ Y por qué desaparece si la captura falla ════════════════════════════════
 *
 * Porque el icono de imagen rota en una portada dice, en el peor sitio posible,
 * que esto está a medio hacer. Si no carga, se va entero y la escena se queda
 * con lo demás, que sigue funcionando. No es tragarse el error en silencio —la
 * consola del navegador registra la petición fallida igual— es no enseñárselo a
 * un visitante que no puede hacer nada con él.
 */
/**
 * Los tres iconos de la derecha de la barra de estado: cobertura, wifi y
 * batería.
 *
 * ══ Por qué un SVG y no tres cajas ══════════════════════════════════════════
 *
 * Estaban dibujados con `div`s: cuatro barritas para la cobertura, media elipse
 * con borde para el wifi y un rectángulo con un relleno dentro para la batería.
 * De cerca eran tres apaños, y el del wifi el peor de todos — una cúpula con el
 * borde del mismo grosor arriba que en los lados, que es justo lo que un arco de
 * wifi no es.
 *
 * El problema de fondo es que un icono de 10 px hecho con cajas depende de que
 * los píxeles caigan enteros, y aquí no caen: todo se mide en proporciones de
 * `--tel`, que es un `clamp()`. Medio píxel de más en un borde de uno y medio se
 * ve como suciedad.
 *
 * Un SVG con su `viewBox` se dibuja con las curvas de verdad y el navegador lo
 * escala como quiera sin romper nada. Los tres van en el MISMO dibujo para que
 * la separación entre ellos no dependa de tres cajas que se alinean a ojo.
 *
 * ── Las formas son las de iOS ──────────────────────────────────────────────
 * Cuatro barras de esquina redondeada que crecen; tres arcos concéntricos y un
 * punto; y una pila con su morro. No es un homenaje: es que son las que el ojo
 * reconoce sin mirar, y cualquier variación —barras rectas, un wifi de dos
 * arcos— se lee como que el teléfono está mal dibujado.
 */
const BarraEstado = () => (
  <svg
    className="lp-iphone-estado"
    viewBox="0 0 64 14"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    {/* Cobertura. Las cuatro llenas: un teléfono de escaparate tiene señal. */}
    <g fill="currentColor">
      <rect x="0" y="8.6" width="2.6" height="5.4" rx="0.9" />
      <rect x="4.4" y="6.4" width="2.6" height="7.6" rx="0.9" />
      <rect x="8.8" y="4.2" width="2.6" height="9.8" rx="0.9" />
      <rect x="13.2" y="2" width="2.6" height="12" rx="0.9" />
    </g>

    {/* Wifi: tres arcos y el punto. Los arcos van con `stroke` y remate
        redondo, que es lo que hace que se afinen en las puntas. */}
    <g
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      transform="translate(21.5 2)"
    >
      <path d="M0.6 3.6a10 10 0 0 1 12.8 0" />
      <path d="M3.3 6.7a6 6 0 0 1 7.4 0" />
    </g>
    <circle cx="28.5" cy="12.1" r="1.5" fill="currentColor" />

    {/* Batería: el casco, el morro y la carga. */}
    <rect
      x="41.5"
      y="2.6"
      width="20"
      height="10.4"
      rx="3.2"
      stroke="currentColor"
      strokeOpacity="0.45"
      strokeWidth="1.3"
    />
    <path
      d="M62.8 6.4v2.8a2.6 2.6 0 0 0 0-2.8Z"
      fill="currentColor"
      fillOpacity="0.45"
    />
    <rect x="43.3" y="4.4" width="12.6" height="6.8" rx="1.9" fill="currentColor" />
  </svg>
);

const Movil = ({ pieza, className = '' }) => {
  const [roto, setRoto] = useState(false);
  if (roto) return null;

  return (
    <div className={`lp-iphone ${className}`}>
      {/* Silencio, subir, bajar y encendido, en el orden y el sitio en que
          están de verdad. Cuatro marcas de nada que solo se notan si faltan. */}
      <span className="lp-iphone-botones" aria-hidden="true">
        <i /> <i /> <i /> <i />
      </span>

      {/* El bisel negro por fuera y el panel encendido por dentro. Dos cajas
          porque un borde no redondea su cara interior: con una sola, la esquina
          de la captura se quedaba sin su radio concéntrico. Ver `.lp-iphone-lcd`
          en `index.css`. */}
      <div className="lp-iphone-pantalla">
        <div className="lp-iphone-lcd">
          {/* La isla: una pastilla negra DESPEGADA del canto de arriba, con la
              cámara dentro. No es un adorno, es la diferencia entre un teléfono
              actual y uno de hace seis años. */}
          <span className="lp-iphone-isla" aria-hidden="true">
            <i />
          </span>

          {/* La barra de estado, entera: la hora a un lado y cobertura, wifi y
              batería al otro. Con la batería sola parecía una franja con la hora;
              los tres iconos juntos son lo que el ojo reconoce sin leer. */}
          <span className="lp-iphone-barra" aria-hidden="true">
            <span className="lp-iphone-hora">9:41</span>
            <BarraEstado />
          </span>

          <img
            className="lp-iphone-img"
            src={pieza.src}
            alt={pieza.alt}
            width={pieza.ancho}
            height={pieza.alto}
            decoding="async"
            loading="lazy"
            onError={() => setRoto(true)}
          />

          {/* La zona de la rayita de inicio, bajo la barra de pestañas con la
              que acaba la captura y de su mismo color. Es el hueco que iOS
              reserva de verdad, y aquí además es parte de la proporción del
              aparato. Ver `.lp-iphone-inicio` en `index.css`. */}
          <span className="lp-iphone-inicio" aria-hidden="true" />
        </div>

        {/* El cristal. Una diagonal de luz del 4 % sobre TODA la pantalla, isla
            incluida: un reflejo que se parase antes de la isla diría que la isla
            está por delante del cristal, que es justo lo que no es. */}
        <span className="lp-iphone-brillo" aria-hidden="true" />
      </div>
    </div>
  );
};

/**
 * LA CHAPA: una nota de cristal posada en el canto de la ventana.
 *
 * ══ Dónde va, que es lo que se había hecho mal ══════════════════════════════
 *
 * En el canto de ABAJO de la ventana y saliéndose por él: la mitad de la chapa
 * queda por debajo de la captura y la otra mitad pisa su esquina inferior. Es la
 * única posición que cumple las tres cosas que se le piden:
 *
 *   · Se lee como una CAPA y no como parte de la imagen — para eso hay que
 *     cruzar un borde; una tarjeta contenida dentro de la pantalla se lee como
 *     un elemento más de la aplicación.
 *   · No toca el teléfono. Aquí hubo una arriba a la derecha, sobre la cabecera
 *     de la aplicación del móvil, tapando justo lo que el móvil venía a enseñar.
 *   · Y de la ventana solo pisa la esquina de abajo a la izquierda, que en las
 *     dos capturas de esta sección es la fila menos informativa que hay.
 *
 * ── Y por eso lleva `--alto` ───────────────────────────────────────────────
 * Para saber cuánto sobresale hace falta saber cuánto mide, y una caja de texto
 * no lo dice hasta que está pintada. Se declara: dos líneas es todo lo que cabe
 * escribir aquí, y con la altura declarada el margen negativo la deja siempre
 * medio dentro y medio fuera.
 */
const Chapa = ({ chapa }) => (
  <figure className="lp-chapa">
    <figcaption className="lp-chapa-rotulo">
      <chapa.icono size={13} strokeWidth={2.5} aria-hidden="true" />
      {chapa.rotulo}
    </figcaption>
    <p className="lp-chapa-dice">{chapa.dice}</p>
  </figure>
);

/**
 * UN PAR: el discurso a un lado y los dos aparatos al otro.
 *
 * ══ La composición ═════════════════════════════════════════════════════════
 *
 * Los dos aparatos NO están en fila: el teléfono pisa el canto de la ventana y
 * cae por debajo de su base. Dos capturas separadas por un hueco son dos
 * pantallas; solapadas son la misma cosa vista dos veces.
 *
 * ── Y con aire alrededor, que es lo que faltaba ────────────────────────────
 * El anillo que había aquí ponía cinco láminas en el hueco de una y la vista se
 * atoraba: la del centro llegaba pisada por dos rebanadas giradas. Un par usa el
 * ancho entero de su columna para dos piezas, así que entre la ventana y el
 * canto de la sección hay sitio de verdad. Se enseña menos y se ve más.
 *
 * ── El teléfono se ata al ALTO de la ventana ───────────────────────────────
 * Con `--tel` en `vw` y no en un porcentaje de su hermano: son dos piezas de
 * proporción opuesta —una apaisada y una vertical— y lo que tiene que parecer
 * creíble entre ellas es la relación de TAMAÑOS, que es lo que dice cuál es la
 * pantalla grande.
 *
 * ── Y la chapa cuelga de la VENTANA, no del par ────────────────────────────
 * Va dentro de `.lp-par-desk`, que es la caja de la captura. Estuvo suelta en el
 * par, o sea posicionada contra una caja cuyo alto lo decide la pieza más alta
 * de las dos; así, un porcentaje que caía bien con la sesión caía en el vacío
 * con la comida, que es más baja. Colgada de la ventana, cae donde tiene que
 * caer en las dos sin tocar un número.
 *
 * ── Y cada par entra POR SU CUENTA ─────────────────────────────────────────
 * Con su propio `Entra` y el disparo tardío de `OBSERVA_TARDE`, igual que los
 * pasos de la secuencia y por lo mismo: los dos pares ocupan dos pantallas de
 * alto, y colgados del revelado de la sección se encendían los dos a la vez al
 * cruzar el titular — o sea que al llegar al segundo ya estaba puesto. Siendo
 * el par el `.lp-reveal`, su texto entra en cascada y sus aparatos con su
 * asentamiento cuando el par se alcanza, no antes.
 *
 * @param vuelta  Los aparatos a la izquierda y el discurso a la derecha. Lo usa
 *   el segundo par: dos idénticos uno debajo de otro se leen como una lista.
 */
const Par = ({ par, vuelta = false }) => (
  <Entra className={`lp-par${vuelta ? ' is-vuelta' : ''}`} observa={OBSERVA_TARDE}>
    <div className="lp-par-say lp-tanda">
      {/* El número es lo único de color de esta sección. Ver `PARES`. */}
      <span className="lp-par-n">
        <i aria-hidden="true">{par.n}</i>
        {par.rotulo}
      </span>

      <h3 className="lp-par-h">
        {par.titulo} <em>{par.remate}</em>
      </h3>

      <p className="lp-lede-sm">{par.texto}</p>
    </div>

    <div className="lp-par-art lp-feat-art">
      {/* La luz detrás de los aparatos: no se pinta la letra, se calienta el
          hueco donde está. Ver `.lp-fulgor` en `index.css`. */}
      <span className="lp-fulgor" aria-hidden="true" />

      <div className="lp-par-desk">
        <Ventana pieza={par.ventana} titulo={par.ventana.titulo} plana />
        {par.chapa && <Chapa chapa={par.chapa} />}
      </div>

      <Movil pieza={par.movil} className="lp-par-movil" />
    </div>
  </Entra>
);

/**
 * UN PASO DE LA SECUENCIA: la parada del raíl, su discurso y su pantalla.
 *
 * La bolita numerada va posicionada sobre la línea que dibuja el raíl (ver
 * `.lp-ruta` en `index.css`) y lleva fondo opaco: si fuera transparente, la
 * línea se vería cruzándola por dentro y dejaría de ser una parada para pasar a
 * ser un número puesto encima de una raya.
 *
 * ══ Y cada paso entra POR SU CUENTA ════════════════════════════════════════
 *
 * Con su propio `useReveal`, no con el de la sección. Aquí toda la secuencia
 * colgaba del bloque de fuera: se cruzaba el titular, se encendía la sección
 * entera y los tres pasos —que ocupan tres pantallas de alto— quedaban ya
 * puestos mucho antes de llegar a ellos. O sea que la única sección de la página
 * que habla de un ORDEN era la que se enseñaba de golpe.
 *
 * Ahora la parada se enciende, el tramo de línea crece hacia la siguiente y el
 * discurso entra en cascada, cada uno cuando le toca. Es lo que hace que bajar
 * por aquí se sienta como recorrer los tres pasos en vez de leer una lista, y no
 * cuesta nada: el mismo gancho que ya usa cada sección, aplicado un nivel más
 * abajo.
 *
 * `is-in` va en el `li` y no en un contenedor de dentro porque de él cuelgan las
 * tres cosas que se mueven —la línea, la bolita y la cascada del texto—, y con
 * la clase arriba las tres se disparan con la misma señal.
 */
const Paso = ({ paso }) => {
  const [ref, dentro] = useReveal();

  return (
    <li ref={ref} className={`lp-ruta-paso${dentro ? ' is-in' : ''}`}>
      <div className="lp-ruta-say lp-tanda">
        <span className="lp-ruta-n" aria-hidden="true">
          {paso.n}
        </span>
        <h3 className="lp-ruta-h">{paso.titulo}</h3>
        <p className="lp-lede-sm">{paso.texto}</p>
      </div>

      {/* Sin `titulo`, o sea sin barra de navegador: el paso ya se llama «El
          roadmap» y la pastilla ponía «Progreso · Roadmap» a quince píxeles.
          Ver `Ventana`. */}
      <div className="lp-ruta-art lp-feat-art">
        <Ventana pieza={paso.pieza} plana />
      </div>
    </li>
  );
};

export const LandingPage = () => {
  const [planes, setPlanes] = useState([]);
  /*
    ══ Abre en MENSUAL ════════════════════════════════════════════════════════

    Estuvo abriendo en anual una temporada, copiando a ProCoach y apoyado en que
    la cifra se enseña mensualizada con el cargo real justo debajo. El argumento
    era defendible y la posición sigue siendo mala por dos motivos:

      · El compromiso por defecto no es el que uno elige por defecto. Quien llega
        a la portada no ha decidido todavía si esto le sirve, y la primera cifra
        que ve viene atada a un cargo de 351 € que no ha pedido. Enseñar primero
        lo que se paga sin comprometerse a nada, y el descuento como una mejora
        que se puede pulsar, es el orden en el que de verdad se decide.
      · Y dentro de la aplicación, Ajustes → Plan abre en mensual
        (`PlanPanel`). Las dos pantallas de precios del producto no pueden
        arrancar en periodicidades distintas: el precio de la portada y el del
        panel parecían no cuadrar sin que nada estuviera mal.

    El interruptor sigue estando y el ahorro sigue escrito en él, así que el
    anual no se esconde: se ofrece.

    Un booleano y no el tri-estado que hubo aquí: mientras la posición de partida
    la decidía la base —anual si alguna fila tenía precio por años— hacía falta
    distinguir «no ha elegido» de «ha elegido mensual». Con una posición de
    partida fija, esa tercera opción no significa nada.
  */
  const [anual, setAnual] = useState(false);

  useNoche();

  /*
    ══ Por qué esta consulta se pide dos veces ═══════════════════════════════

    Porque **la página pública no puede depender de qué migraciones estén
    aplicadas**, y aquí ya se rompió una vez: al pedir `has_integrations` —una
    columna que crea la 0065— contra una base sin esa migración, PostgREST
    contesta 42703, `data` llega `null`, `planes` se queda vacío y **la sección
    de precios desaparece de la portada**. Sin error en pantalla y sin nada roto
    a la vista: simplemente no hay precios.

    Es el mismo fallo que la 0025 —una columna que el código daba por hecha— y
    ahí costó una tarde. La diferencia es que esto lo ve un desconocido que venía
    a ver cuánto cuesta.

    Así que se pide de más a menos: primero todo, y cada intento quita la columna
    de la migración más reciente. Se para en el primero que conteste, así que en
    una base al día son **una sola consulta** y los intentos de abajo no llegan a
    salir nunca.

    El orden de la lista es el de las migraciones, de la más nueva a la más
    vieja, y ese es el único mantenimiento que pide: una columna nueva se añade
    ARRIBA. La última fila son las columnas que la 0049 concedió a `anon`, o sea
    las que existen desde que hay precios públicos; si eso falla, es que no hay
    precios que enseñar y el problema es otro.

    Un plan sin su línea de integraciones es un desperfecto. Una tabla de precios
    en blanco es una venta perdida.
  */
  useEffect(() => {
    let vivo = true;

    const BASE =
      'plan, label, max_clients, max_seats, price_cents, currency, interval, blurb, purchasable';

    const INTENTOS = [
      `${BASE}, price_cents_year, has_integrations, has_audit_log, max_storage_mb`, // + 0066 y 0067
      `${BASE}, price_cents_year, has_integrations`, // 0062 + 0065
      `${BASE}, price_cents_year`, //                   0062
      BASE, //                                          0049
    ];

    (async () => {
      for (const columnas of INTENTOS) {
        const { data, error } = await supabase
          .from('plan_limits')
          .select(columnas)
          .order('sort');

        if (!vivo) return;
        if (!error) {
          setPlanes(data || []);
          return;
        }
      }
      if (vivo) setPlanes([]);
    })();

    return () => {
      vivo = false;
    };
  }, []);

  /* El más barato de los de pago. De aquí sale el «desde» del héroe y el de la
     sección de precios: se deduce y no se escribe, así que el precio sigue
     teniendo un solo sitio donde vivir. */
  const masBarato = planes
    .filter((p) => p.price_cents > 0)
    .sort((a, b) => a.price_cents - b.price_cents)[0];

  /* Lo mismo para el anual: existe si alguna fila lo tiene, y el ahorro sale de
     los dos precios de esa fila. Ver el interruptor, más abajo. */
  const hayAnual = planes.some((p) => p.price_cents_year);
  const ahorroPct = planAhorroPct(planes.find((p) => p.price_cents_year));

  return (
    <div className="lp">
      <header className="lp-bar">
        {/* La barra va a sangre y su contenido no: por eso hay una caja dentro
            que lleva el ancho máximo. Sin ella, el cristal se cortaría a 1200 px
            y al desplazar se vería el lienzo por los lados. */}
        <div className="lp-in lp-bar-in">
          <a className="lp-brand" href="#top">
            <LogoMark size={26} />
            Caveman Hub
          </a>

          <nav className="lp-nav" aria-label="Secciones">
            <a className="lp-nav-link" href="#producto">
              Cómo funciona
            </a>
            <a className="lp-nav-link" href="#precios">
              Precios
            </a>
            <a className="lp-nav-link" href="#preguntas">
              Dudas
            </a>
          </nav>

          <span className="lp-bar-cta">
            <Link className="lp-nav-link is-plain" to="/entrar">
              Entrar
            </Link>
            <Link className="lp-btn is-fill is-sm" to="/entrar?alta=1">
              Empezar gratis
            </Link>
          </span>
        </div>
      </header>

      {/* ══ EL HÉROE: qué es esto, el gratis, y la pantalla ═════════════════
          Cuatro cosas y en este orden: el rótulo que dice la categoría, el
          titular, la frase que dice qué sustituye y la nota del gratis. Y
          debajo, la escena — a la que se llega justo cuando se ha acabado de
          leer, y que se corta por el canto de la pantalla para que se siga
          bajando.

          Ver `HERO`, arriba: por qué esta captura y no otra, y por qué los dos
          botones que había aquí se fueron. */}
      <section className="lp-sec lp-hero" id="top">
        <div className="lp-in lp-hero-in">
          <span className="lp-eyebrow">Plataforma de gestión de clientes</span>

          {/* La POSTURA, con la categoría ya dicha en el rótulo de arriba. Ver
              el bloque «Lo que dice la letra» en `HERO`: el titular dice contra
              qué se planta esto, y el remate en cursiva —«de verdad»— es donde
              está la diferencia con una churrera de rutinas. */}
          {/* El espacio irrompible del remate evita que «verdad» se quede solo
              en su propia línea en un teléfono: si el remate no cabe entero,
              parte por «entrenadores / de verdad», que se lee. */}
          <h1 className="lp-h1">
            La primera app para
            <br />
            <em>entrenadores de&nbsp;verdad</em>
          </h1>

          {/* Una línea, y solo lo que la imagen no puede decir: que aquí está
              TODO el trabajo —no solo la rutina— y que el enemigo es el Excel.
              Un entrenador que llega a esto no está comparando productos: está
              decidiendo si merece la pena mover lo que ya tiene, que es una
              hoja de cálculo y un WhatsApp por cliente. Lo que hay dentro ya lo
              enseña la pantalla de aquí abajo. */}
          <p className="lp-lede">
            Toda tu asesoría —rutinas, dietas, check-ins, progreso y cobros— en un solo sitio.
            Se acabaron el Excel y el copia-pega.
          </p>

          {/* Aquí estuvo también el «desde 39 €», con el argumento de que el
              precio es la segunda pregunta y esconderlo manda a buscarlo. Se
              quitó a petición del dueño, y con razón: una cifra de pago en la
              primera pantalla le pone precio a la promesa antes de haberla
              enseñado. Lo que se queda es lo que NO cuesta —el gratis sin
              trampa—, y el «desde» vive en la sección de precios, que para eso
              está en la barra. */}
          <span className="lp-cta-note">Tres clientes gratis, sin límite de tiempo y sin tarjeta.</span>
        </div>

        {/* ── LA ESCENA ────────────────────────────────────────────────────
            Fuera de `.lp-hero-in` y con su propia caja, y no es un capricho de
            marcado: la de arriba es una columna de TEXTO centrada, con su tope
            de caracteres y su cascada de entrada por hijos; esta es una escena
            de dos aparatos que necesita todo el ancho y entra de una pieza.

            Y va en la caja ANCHA —1440 en vez de 1200—, que es la segunda de las
            dos excepciones de la página. Con el ancho de lectura, la ventana de
            980 px y el teléfono no cabían juntos y el aparato tenía que morder
            setenta y cinco píxeles de la ventana para entrar: o sea, tapar
            entera la columna de «Te esperan», que es la mitad de lo que esta
            captura viene a enseñar. Con sitio, el teléfono se apoya en el canto
            y no se come nada.

            Y va a pelo en la sección, sin `Entra`: es lo que se ve al llegar,
            así que aparecer «al alcanzarla» significaría no aparecer nunca. */}
        {/* La caja que CORTA. Es la que le da al héroe su alto de pantalla y la
            que recorta la escena por abajo con un canto duro, en vez de dejar
            que se vaya asomando poco a poco al desplazar. Ver `.lp-hero-corte`
            en `index.css`: el canto no es del navegador, es de la página. */}
        <div className="lp-hero-corte">
          <div className="lp-in is-ancha lp-hero-escena">
            {/* La luz de detrás: no se pinta la letra, se calienta el hueco
                donde está. La misma pieza que llevan los pares. */}
            <span className="lp-fulgor" aria-hidden="true" />

            <div className="lp-hero-desk">
              <Ventana pieza={HERO.ventana} titulo={HERO.ventana.titulo} plana prioridad />
            </div>

            <Movil pieza={HERO.movil} className="lp-hero-movil" />
          </div>
        </div>
      </section>

      {/* ══ 1. EL CLIENTE, DE LOS DOS LADOS — los dos pares ═══════════════
          Aquí hubo un anillo de cinco pantallas girando en tres dimensiones, y
          lo que enseñaba estaba bien; lo que contaba, no. Cinco capturas en
          orden de catálogo superpuestas en el hueco de una, con la del centro
          pisada por dos rebanadas giradas.

          Ahora son dos PARES: la sesión y la comida, cada una en tu pantalla y
          en la suya, con el discurso al lado y sitio de sobra alrededor. */}
      {/* La sección NO envuelve a los pares, solo a su cabecera — el mismo
          reparto que la secuencia y por lo mismo: los dos pares miden dos
          pantallas, y colgados del revelado de la sección se encendían los dos
          a la vez al cruzar el titular. Cada `Par` trae su propio `Entra`. */}
      <section className="lp-sec is-band" id="producto">
        <div className="lp-in is-ancha">
          <Entra>
            <div className="lp-sec-head is-center lp-tanda">
              <span className="lp-kicker">Cómo funciona</span>
              <h2>
                Tú lo montas aquí, él lo ve <em>en su móvil</em>
              </h2>
              {/* La frase que separa esto de una churrera de rutinas, dicha donde
                  se demuestra: en las dos herramientas de todas las semanas. */}
              <p className="lp-lede-sm">
                Esto no es un generador de rutinas: es la asesoría entera. Trabajas desde el
                ordenador, tu cliente entra a lo suyo desde el móvil, y no hay nada que exportar ni
                reenviar.
              </p>
            </div>
          </Entra>

          <div className="lp-pares">
            {PARES.map((par, i) => (
              <Par key={par.id} par={par} vuelta={i % 2 === 1} />
            ))}
          </div>
        </div>
      </section>

      {/* ══ 2. LA SECUENCIA DE LA SEMANA ══════════════════════════════════
          Tres herramientas encadenadas en un raíl: marcas el objetivo, mides lo
          que sale y decides la semana siguiente. Ver `SECUENCIA`.

          ── Y aquí la sección NO envuelve a los pasos ──────────────────────
          Solo a su cabecera. Cada paso trae su propio `useReveal` (ver `Paso`) y
          se enciende cuando se llega a él; si colgaran del bloque de fuera, los
          tres —que ocupan tres pantallas de alto— quedarían puestos de golpe al
          cruzar el titular, y la única sección de la página que habla de un
          orden sería la que se enseña entera de una vez. */}
      <section className="lp-sec" id="progreso">
        <div className="lp-in">
          <Entra>
            <div className="lp-sec-head is-center lp-tanda">
              <span className="lp-kicker">La semana se cierra</span>
              <h2>
                Tres herramientas para <em>cerrar cada semana</em>
              </h2>
              <p className="lp-lede-sm">
                Marcar a dónde va, medir lo que pasa y decidir qué toca. El trabajo de cada semana
                con cada cliente, en este orden.
              </p>
            </div>
          </Entra>

          <ol className="lp-ruta">
            {SECUENCIA.map((paso) => (
              <Paso key={paso.n} paso={paso} />
            ))}
          </ol>
        </div>
      </section>

      {/* ══ 4. Y LO QUE ADEMÁS TRAE ═══════════════════════════════════════
          Cuatro fichas, y es la única forma de la página que dice «hay MÁS».
          Todo esto vivía metido en una respuesta cerrada de las dudas: media
          aplicación escondida en el único sitio de la portada al que hay que
          hacer clic para llegar.

          El discurso a la izquierda y la rejilla a la derecha, al revés que la
          sección de la dieta —donde la pieza va a la izquierda—, para que dos
          secciones seguidas no caigan del mismo lado. */}
      <Entra as="section" className="lp-sec">
        <div className="lp-in lp-mas-in">
          <div className="lp-mas-say lp-tanda">
            <span className="lp-kicker">Y además</span>
            <h2>
              Todo lo demás también <em>vive aquí dentro</em>
            </h2>
            <p className="lp-lede-sm">
              Lo que hoy tienes repartido entre la galería del móvil, Drive, el calendario y la
              pasarela de cobro. Sin módulos aparte: viene dentro, también en el plan gratuito.
            </p>
          </div>

          <div className="lp-mas-grid lp-feat-art">
            {EXTRAS.map(({ icono: Icono, titulo, texto }) => (
              <article className="lp-ficha" key={titulo}>
                <span className="lp-ficha-ico" aria-hidden="true">
                  <Icono size={18} strokeWidth={2} />
                </span>
                <h3>{titulo}</h3>
                <p>{texto}</p>
              </article>
            ))}
          </div>
        </div>
      </Entra>

      {/* ══ PRECIOS ═══════════════════════════════════════════════════════
          La sección existe siempre aunque `plan_limits` no conteste, porque el
          enlace «Precios» de la barra apunta aquí y un ancla que no lleva a
          ninguna parte es peor que una tarjeta menos. */}
      <Entra as="section" className="lp-sec is-band" id="precios">
        <div className="lp-in">
          <div className="lp-sec-head is-center lp-tanda">
            <span className="lp-kicker">Precios</span>
            <h2>
              Un plan solo cambia <em>a cuánta gente llevas</em>
            </h2>
            {/* «Nada bajo llave en ningún plan» estuvo aquí y dejó de ser cierto
                con la 0065. La frase que la sustituye dice lo mismo de lo que de
                verdad importa y **es verdad antes y después** de capar nada: el
                bucle está entero en los cuatro planes. */}
            <p className="lp-lede-sm">
              Tres clientes gratis, para siempre y sin tarjeta.
              {masBarato && <> Para crecer, desde {planPrice(masBarato)}.</>} El bucle entero en
              todos, también en el gratuito.
            </p>
          </div>

          {/* ── Mensual o anual ──────────────────────────────────────────────
              Solo aparece cuando hay algún plan con precio anual (0062). Hasta
              que se encienda en Stripe, esta sección es exactamente la de antes.

              El ahorro se calcula del plan más barato que lo tenga en vez de
              escribirlo: si algún día un plan lleva otro descuento, la etiqueta
              no miente sola. Y va en porcentaje porque tiene que caber DENTRO
              del botón sin ensancharlo — el porqué largo, en `planAhorroPct`. */}
          {hayAnual && (
            <div
              className={`lp-switch${anual ? ' is-anual' : ''}`}
              role="group"
              aria-label="Cada cuánto pagas"
            >
              {/* La señal que se desliza. Es un elemento y no el fondo del botón
                  activo porque un color que aparece y desaparece en dos sitios
                  se lee como dos cosas encendiéndose; uno que se mueve se lee
                  como UNA elección cambiando de sitio, que es lo que es. Va
                  detrás por `z-index` y lo deja pasar `isolation: isolate`, el
                  mismo recurso que ya usa la tarjeta de plan. */}
              <span className="lp-switch-marca" aria-hidden="true" />
              <button
                type="button"
                className="lp-switch-item"
                aria-pressed={!anual}
                onClick={() => setAnual(false)}
              >
                Al mes
              </button>
              <button
                type="button"
                className="lp-switch-item"
                aria-pressed={anual}
                onClick={() => setAnual(true)}
              >
                Al año
                {/* «Ahorra 25 %» y no «−25 %»: el signo solo es más corto, pero
                    leído de pasada un «−» junto a la cifra del plan se puede
                    entender al revés. La palabra dice qué GANAS pulsando. */}
                {ahorroPct && <span className="lp-switch-ahorro">Ahorra {ahorroPct}&nbsp;%</span>}
              </button>
            </div>
          )}

          {planes.length > 0 && (
            <div className="lp-plan-grid">
              {planes.map((p, i) => (
                /*
                  El gratuito va marcado, y la etiqueta dice «empieza aquí» y no
                  «el más popular». Lo segundo es un dato que no existe —no hay
                  todavía una base de usuarios que lo sostenga— y una portada que
                  se inventa la prueba social se paga entera.

                  ── Y cada tarjeta ENTRA por su cuenta ──────────────────────
                  Con su propio `Entra` y un retraso que crece con la columna,
                  en vez de aparecer las cuatro con la sección. En una fila de
                  escritorio entran una detrás de otra —el gesto de repartir
                  cartas—; en la columna de un teléfono cada una aparece al
                  llegar a ella. El asentamiento (sube y encaja con una pizca
                  de escala) vive en `.lp-plan.lp-reveal`, en `index.css`.

                  `OBSERVA_TARDE` retrasa el disparo hasta que la tarjeta
                  está un cuarto de pantalla DENTRO: con el margen de serie la
                  entrada ocurría pegada al canto de abajo, donde nadie mira, y
                  al llegar a ellas «ya estaban».
                */
                <Entra
                  as="article"
                  className={`lp-plan${p.price_cents ? '' : ' is-primero'}`}
                  retraso={i * 110}
                  observa={OBSERVA_TARDE}
                  key={p.plan}
                >
                  {!p.price_cents && <span className="lp-plan-tag">Empieza aquí</span>}

                  <span className="lp-plan-name">{p.label}</span>
                  {p.blurb && <p className="lp-plan-blurb">{p.blurb}</p>}

                  {/*
                    El gratuito enseña «0 €» y no «Gratis», que es lo que
                    devuelve `planPrice`: tres precios en el mismo formato se
                    leen como una escalera de un vistazo —0 → 25 → 69—, mientras
                    que una palabra en medio de dos cifras rompe esa lectura y
                    obliga a comparar a mano.

                    `planPrice` no se toca: la usa también Ajustes → Plan, donde
                    «Gratis» es exactamente lo que hay que decir porque ahí no
                    hay ninguna escalera que leer.

                    La cifra va en CURSIVA, que es el remate de los titulares de
                    esta página traído al sitio donde de verdad se decide. Es lo
                    único que la separa de un número de tabla.

                    ── Y en anual, la cifra SIGUE SIENDO MENSUAL ──────────────
                    390 € al año y 39 € al mes no se comparan de cabeza; 32,50 y
                    39 sí. Así que al pulsar «Al año» lo que cambia es la misma
                    cifra —baja—, y el total del cargo va justo debajo. Enseñar
                    ahí un 390 € obligaría a dividir para saber si sale a cuenta,
                    que es exactamente el trabajo que una tabla de precios tiene
                    que ahorrar. El importe real nunca se esconde: está en la
                    línea de abajo y con la palabra «facturado».
                  */}
                  <span className="lp-plan-price">
                    <em>
                      {p.price_cents
                        ? planPrice(p, {
                            conPeriodo: false,
                            anual: anual && Boolean(p.price_cents_year),
                            mensualizado: true,
                          })
                        : localeNumber(0, {
                            style: 'currency',
                            currency: (p.currency || 'eur').toUpperCase(),
                            minimumFractionDigits: 0,
                          })}
                    </em>
                    <span className="per">/mes</span>
                  </span>

                  {/* ── La letra pequeña se fue de las tarjetas ──────────────
                      Aquí hubo tres notas bajo la cifra: «Sin permanencia ·
                      baja cuando quieras», «Sin tarjeta · sin fecha» en la
                      gratuita, y el anual como reclamo («o 32,50 € al año ·
                      −17 %»). Cada una era defendible por separado y las tres
                      juntas eran ruido justo donde se decide con el nombre y
                      la cifra — y todas repetían algo que ya está dicho: la
                      permanencia en las dudas, lo de sin tarjeta en la frase
                      de la sección, y el ahorro anual en el propio
                      interruptor.

                      La única que se queda es la del modo anual: enseñar una
                      cifra mensualizada sin el cargo real al lado sí sería
                      esconder algo. Y el plan sin precio anual lo dice en vez
                      de callarse — una tarjeta que no reacciona al interruptor
                      parece rota. */}
                  {anual && p.price_cents && (
                    <span className="lp-plan-nota">
                      {p.price_cents_year ? (
                        <>Facturado anual · {planPrice(p, { anual: true, conPeriodo: false })}</>
                      ) : (
                        'Este plan solo va al mes'
                      )}
                    </span>
                  )}

                  {/* El botón va ENCIMA de la lista, no al final de la tarjeta.
                      Quien lee una tabla de precios decide con el nombre, la
                      cifra y poco más; la lista de abajo la lee el que duda, y
                      hacerle bajar hasta el final para encontrar el botón es
                      poner el gesto al otro lado de la letra pequeña.

                      El relleno se lo lleva el gratuito, que es la acción que se
                      quiere: los de pago no se contratan desde aquí sin cuenta
                      —hay que entrar y pasar por la pasarela—, así que un botón
                      sólido en ellos prometería un atajo que no existe. */}
                  {/*
                    ══ El plan elegido viaja con el enlace ═══════════════════
                    Los cuatro botones iban al mismo `/entrar?alta=1`, así que
                    quien pulsaba «Empezar con Pro» salía con una cuenta gratis y
                    tenía que ir a buscar Ajustes → Plan y volver a elegir. La
                    intención se perdía justo en el paso donde se decide.

                    Viaja por DOS caminos, y no es redundancia:

                    · En la URL, que es lo que hace que funcione de una pieza para
                      quien ya tiene cuenta y solo tiene que entrar.
                    · En `localStorage` (`lib/intencionDePlan`), porque la URL no
                      sobrevive al montaje de la aplicación tras crear la cuenta:
                      entre que aparece la sesión y que la aplicación sabe quién
                      eres, la ruta deja de casar con el árbol y el comodín de
                      `App` la traduce a «Hoy». Comprobado, no supuesto.

                    `periodo` va también: si estás mirando la columna del año, es
                    el precio del año el que has elegido.
                  */}
                  <Link
                    className={`lp-btn is-sm ${p.price_cents ? 'is-ghost' : 'is-fill'}`}
                    onClick={() => {
                      if (p.price_cents) {
                        guardarIntencion(p.plan, anual && p.price_cents_year ? 'year' : 'month');
                      }
                    }}
                    to={
                      p.price_cents
                        ? `/ajustes/plan?alta=1&contratar=${p.plan}${
                            anual && p.price_cents_year ? '&periodo=year' : ''
                          }`
                        : '/entrar?alta=1'
                    }
                  >
                    {p.price_cents ? `Empezar con ${p.label}` : 'Crear mi cuenta'}
                  </Link>

                  {/*
                    Cada línea sale de una COLUMNA de `plan_limits`, ninguna está
                    escrita a mano por plan. Es lo que impide que esta lista y lo
                    que de verdad aplica la base de datos se separen: si mañana
                    Solo lleva integraciones, es un `UPDATE` y la portada se
                    entera sola.

                    ── La línea que había que cambiar ────────────────────────
                    Aquí ponía «la aplicación entera, sin nada bajo llave», y era
                    verdad hasta que la 0065 capó las integraciones. Se sustituye
                    por lo que SIGUE siendo cierto y además es lo que se quería
                    decir: el bucle —programar, comer, registrar, revisar— está
                    entero en los cuatro planes, también en el gratuito. Lo que
                    se capa cuelga de él, no es él.
                  */}
                  <ul className="lp-plan-list">
                    <li>
                      <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                      {p.max_clients === null
                        ? 'Clientes sin límite'
                        : `Hasta ${p.max_clients} ${p.max_clients === 1 ? 'cliente' : 'clientes'}`}
                    </li>
                    <li>
                      <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                      {p.max_seats === null
                        ? 'Entrenadores sin límite'
                        : `${p.max_seats} ${p.max_seats === 1 ? 'entrenador' : 'entrenadores'}`}
                    </li>
                    <li>
                      <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                      El bucle entero: programar, comer, registrar y revisar
                    </li>
                    {/*
                      El tope de disco se dice SIEMPRE que exista, no solo en los
                      planes grandes: anunciar «512 MB» en Gratis es lo que hace
                      que el tope no sea una sorpresa el día que se llena (0067).
                      Si la columna aún no está en la base, no sale la línea y la
                      tarjeta es la de antes.
                    */}
                    {p.max_storage_mb != null && (
                      <li>
                        <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                        {storageLabel(p.max_storage_mb)} de fotos y vídeo
                      </li>
                    )}
                    {p.has_integrations && (
                      <li>
                        <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                        Integraciones
                      </li>
                    )}
                    {p.has_audit_log && (
                      <li>
                        <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                        Registro de cambios
                      </li>
                    )}
                  </ul>
                </Entra>
              ))}
            </div>
          )}

          <p className="lp-plan-foot">
            Archivar a quien lo ha dejado no ocupa sitio en tu plan y conserva entero su historial
            para cuando vuelva. Y el día que dejes de pagar, la cuenta pasa a solo lectura: leer,
            exportar y borrar no se bloquean nunca.
          </p>

          {/* Lo que la tabla no puede contestar. El tope de entrenadores del plan
              más alto son tres (`max_seats`), y un centro con seis no cabe en
              ninguna fila: en vez de dejarle deducir que esto no es para él, se
              le dice que eso se habla. Va como texto y no como una cuarta
              tarjeta con «consultar» dentro, que es la forma de estropear una
              tabla en la que todas las demás cifras son cifras. */}
          {/* Sin correo: la aplicación NO tiene una dirección pública de contacto
              —los datos del titular siguen siendo huecos en las páginas legales—,
              así que poner un `mailto:` aquí sería inventarse una. El camino que
              sí existe hoy es la cuenta gratuita y Ajustes → Ayuda, que escribe
              en `support` y avisa por `support-notify`. */}
          <p className="lp-plan-foot">
            ¿Un centro con más de tres entrenadores? Esos no salen en la tabla:{' '}
            <Link to="/entrar?alta=1">abre una cuenta gratis</Link> y escríbenos desde Ajustes →
            Ayuda.
          </p>
        </div>
      </Entra>

      {/* ══ DUDAS ══════════════════════════════════════════════════════════
          Cinco, no doce: las que deciden una compra. El resto es material de la
          ayuda, no de la portada.

          `<details>` nativo: se abre sin JavaScript, el buscador lo indexa y el
          teclado lo recorre solo. */}
      <Entra as="section" className="lp-sec" id="preguntas">
        <div className="lp-in">
          <div className="lp-sec-head lp-tanda">
            <span className="lp-kicker">Dudas</span>
            <h2>
              Respuestas <em>rectas</em>
            </h2>
          </div>

          <div className="lp-faq-list">
            {DUDAS.map(({ q, a }, i) => (
              <details className="lp-faq-item" key={q}>
                <summary className="lp-faq-q">
                  <span className="lp-faq-n" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {q}
                </summary>
                <p className="lp-faq-a">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </Entra>

      {/* ══ CIERRE ═════════════════════════════════════════════════════════
          La losa de tiza: el único bloque con el lienzo invertido, y va al final
          a propósito. Después de cinco secciones sobre negro es imposible pasarla
          por alto. */}
      <Entra as="section" className="lp-sec">
        <div className="lp-in">
          <div className="lp-slab lp-tanda">
            <span className="lp-kicker">Empezar</span>
            <h2>
              Más clientes, <em>no más horas</em>
            </h2>
            <p>
              Da de alta al que tengas más a mano —solo hace falta su nombre—, prográmale la semana
              y mándale su acceso.
            </p>
            <Link className="lp-btn is-dark" to="/entrar?alta=1">
              Crear mi cuenta
            </Link>
            <span className="lp-slab-note">Tres clientes gratis, para siempre. Sin tarjeta.</span>
          </div>
        </div>
      </Entra>

      <footer className="lp-sec lp-foot">
        <div className="lp-in">
          <div className="lp-foot-grid">
            <div className="lp-foot-brand">
              <a className="lp-brand" href="#top">
                <LogoMark size={26} />
                Caveman Hub
              </a>
              <p>
                Rutinas, dietas, fotos, cifras y respuestas de toda tu cartera, en un solo sitio y
                en el navegador.
              </p>
            </div>

            {/* Las columnas están puestas para crecer: aquí es donde irán las
                comparativas contra herramientas concretas y las páginas por tipo
                de entrenador. Hoy solo hay enlaces que existen; un pie con una
                columna vacía es peor que un pie con tres columnas. */}
            <div className="lp-foot-col">
              <h3>Producto</h3>
              {/* Uno por sección y todos existen. Aquí hubo un «Progreso» que
                  apuntaba a un ancla que se había ido con la sección que la
                  llevaba: un enlace del pie que no baja a ninguna parte se lee
                  como una página a medio hacer. */}
              <a href="#producto">La sesión y la dieta</a>
              <a href="#progreso">Plan y progreso</a>
              <a href="#precios">Precios</a>
              <a href="#preguntas">Dudas</a>
            </div>

            <div className="lp-foot-col">
              <h3>Cuenta</h3>
              <Link to="/entrar">Entrar</Link>
              <Link to="/entrar?alta=1">Crear cuenta</Link>
            </div>

            <div className="lp-foot-col">
              <h3>Legal</h3>
              <a href="/privacidad">Privacidad</a>
              <a href="/condiciones">Condiciones</a>
            </div>
          </div>

          <span className="lp-foot-end">© Caveman Hub</span>
        </div>
      </footer>
    </div>
  );
};
