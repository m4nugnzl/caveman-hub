import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { supabase } from '@/lib/supabaseClient';
import { planPrice } from '@/lib/num';
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
 * Promesa (la escena entera) → lo que programas → lo que ve tu cliente → lo que
 * te devuelve → cuánto vale → cinco dudas → cierre.
 *
 * ══ Y las capturas van RECORTADAS ═══════════════════════════════════════════
 *
 * Esto es lo que separa esta versión de la anterior. Una captura de la pantalla
 * entera no vende: la mitad de lo que sale es cromo —la cabecera con la marca,
 * el buscador, el avatar, las pestañas— y el cromo es exactamente lo que tiene
 * igual cualquier aplicación del mundo. Lo que distingue a esta son la tabla de
 * series, los anillos de calorías y las cifras de la semana.
 *
 * Así que `scripts/recortar-capturas.ps1` deja en `public/capturas/` una
 * pieza por sección con eso y solo eso. Es un recorte, no un montaje: los datos,
 * la tipografía y los colores son los que salen de la aplicación. Lo único que
 * se quita es el aire —en la rutina, la caja de indicación vacía que hay entre
 * la cabecera del día y los ejercicios— para que la pieza sea todo producto.
 *
 * ══ La forma: escaparate de noche ═══════════════════════════════════════════
 *
 *   1. **Negro fijo.** `.lp-noche` mientras la página está montada, vía
 *      `lib/useNoche.js` —el mismo gancho que usa el acceso—.
 *   2. **Sin tinta de marca.** Tiza sobre hierro. Lo que separa un titular de su
 *      remate es la CURSIVA; el único color de la página es el que traen dentro
 *      las capturas.
 *   3. **Franjas, no huecos.** Las secciones alternan entre el lienzo y un
 *      escalón más claro a sangre (`.is-band`).
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
 */
const HOY = {
  src: '/capturas/hoy.jpg',
  ancho: 2017,
  alto: 1050,
  alt: 'La pantalla «Hoy» del entrenador: diez movimientos del día —pesajes y fotos de sus clientes— y una bandeja con veintidós tareas esperando, entre ellas cuatro check-ins por responder.',
};

const RUTINA = {
  src: '/capturas/rutina.jpg',
  ancho: 2017,
  alto: 620,
  alt: 'El día «Empuje» de una rutina: seis ejercicios y veinte series, con el press de banca a 97,5 kg por 8 repeticiones y RIR 2 en cuatro series.',
};

const PROGRESO = {
  src: '/capturas/progreso.jpg',
  ancho: 2017,
  alto: 635,
  alt: 'El progreso de una clienta: 56,6 kg de peso, el check-in de la semana, 20.093 kg de tonelaje y 1.800 kcal de objetivo, con los gráficos de peso y de tonelaje por semana.',
};

/** Y los móviles del cliente, del portal de verdad. */
const MOVILES = [
  {
    src: '/capturas/m-dieta.jpg',
    ancho: 392,
    alto: 672,
    alt: 'La dieta en el móvil del cliente: objetivo de 3.100 kcal con sus macros, 10.000 pasos diarios y el menú cerrado con cinco opciones por comida y su anillo de calorías.',
  },
  {
    src: '/capturas/m-progreso.jpg',
    ancho: 392,
    alto: 730,
    alt: 'El progreso en el móvil del cliente: peso, check-in de la semana, tonelaje y calorías objetivo, con el gráfico de peso corporal debajo.',
  },
];

const MOVIL_HERO = {
  src: '/capturas/m-rutina.jpg',
  ancho: 392,
  alto: 730,
  alt: 'La sesión del día en el móvil del cliente: el calentamiento en vídeo y la tabla de series con sus casillas de kilos, repeticiones y RIR.',
};

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
    q: '¿Qué más trae?',
    a: 'Fotos de progreso por semana y por ángulo con montajes de antes y después, revisiones semanales con vídeo grabado desde el propio navegador, check-in con las preguntas que tú escribas, antropometría con pliegues, calendario, roadmap del objetivo por fases, equipos con varios entrenadores y reparto de clientes, y lectura de tu Stripe y de tu Notion para saber quién te ha pagado.',
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
 */
const Entra = ({ as: Etiqueta = 'div', className = '', retraso = 0, children, ...resto }) => {
  const [ref, dentro] = useReveal();
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
 * El recuadro que se apoya sobre una captura y señala qué se está mirando.
 *
 * Solo lo lleva el héroe, y a propósito: ahí hay DOS pantallas a la vez y hay
 * que decir en un vistazo cuál es la tuya y cuál la de tu cliente. En las
 * secciones de abajo el rótulo de encima ya lo dice, y una nota más sería
 * repetirlo tapando la pieza.
 *
 * `aria-hidden` y `pointer-events: none`: es una anotación sobre algo que el
 * texto de al lado ya cuenta, así que a un lector de pantalla solo le añade
 * ruido.
 */
const Nota = ({ donde, k, v }) => (
  <span className={`lp-nota is-${donde}`} aria-hidden="true">
    <span className="lp-nota-k">{k}</span>
    <span className="lp-nota-v">{v}</span>
  </span>
);

/**
 * Una captura de escritorio dentro de una ventana.
 *
 * ══ Por qué el marco ════════════════════════════════════════════════════════
 *
 * Porque las capturas son CLARAS y la portada es de noche. Una imagen clara
 * pegada sobre negro se lee como un agujero en la página; metida en una ventana
 * con su canto y su sombra se lee como lo que es: una pantalla encendida. El
 * marco además convierte el corte de arriba —todo recorte está cortado por algún
 * sitio— en el borde de una ventana.
 *
 * La barra lleva el nombre de la SECCIÓN de la aplicación y no una dirección
 * inventada: una URL falsa en una portada es una promesa sobre algo que todavía
 * no existe.
 */
const Ventana = ({ pieza, titulo, prioridad = false }) => (
  <figure className="lp-shot">
    <span className="lp-shot-bar" aria-hidden="true">
      <span className="lp-shot-dots">
        <i /> <i /> <i />
      </span>
      <span className="lp-shot-tab">{titulo}</span>
    </span>
    <img
      className="lp-shot-img"
      src={pieza.src}
      alt={pieza.alt}
      width={pieza.ancho}
      height={pieza.alto}
      decoding="async"
      /* La del héroe se pide ya; las de abajo, al acercarse. */
      loading={prioridad ? 'eager' : 'lazy'}
    />
  </figure>
);

/**
 * El móvil del cliente, con su captura dentro.
 *
 * ══ Por qué desaparece si la imagen falla ═══════════════════════════════════
 *
 * Porque el icono de imagen rota en una portada dice, en el peor sitio posible,
 * que esto está a medio hacer. Si no carga, se va entero y la escena se queda
 * con lo demás, que sigue funcionando. No es tragarse el error en silencio —la
 * consola del navegador registra la petición fallida igual— es no enseñárselo a
 * un visitante que no puede hacer nada con él.
 */
const Movil = ({ pieza, className = '' }) => {
  const [roto, setRoto] = useState(false);
  if (roto) return null;

  return (
    <div className={`lp-movil ${className}`}>
      <img
        className="lp-movil-img"
        src={pieza.src}
        alt={pieza.alt}
        width={pieza.ancho}
        height={pieza.alto}
        decoding="async"
        loading="lazy"
        onError={() => setRoto(true)}
      />
    </div>
  );
};

/**
 * Una sección: el rótulo, el titular, una frase y la pantalla debajo, a todo
 * lo ancho.
 *
 * ── Por qué a lo ancho y no a un lado ──────────────────────────────────────
 * Porque las piezas son RECORTES, y un recorte es apaisado: la tabla de series
 * son cuatro columnas de datos y las cifras de la semana son cuatro tarjetas en
 * fila. Metida en media columna, una pieza así se queda a 500 px y hay que
 * acercarse a la pantalla para leer un número, que es justo lo contrario de lo
 * que se le pide a la única imagen de la sección.
 */
const Bloque = ({ id, franja, rotulo, titulo, remate, texto, children }) => (
  <Entra as="section" className={`lp-sec${franja ? ' is-band' : ''}`} id={id}>
    <div className="lp-in">
      <div className="lp-sec-head is-center">
        <span className="lp-kicker">{rotulo}</span>
        <h2>
          {titulo} <em>{remate}</em>
        </h2>
        <p className="lp-lede-sm">{texto}</p>
      </div>

      <div className="lp-pieza">{children}</div>
    </div>
  </Entra>
);

export const LandingPage = () => {
  const [planes, setPlanes] = useState([]);

  useNoche();

  useEffect(() => {
    let vivo = true;
    supabase
      .from('plan_limits')
      .select('plan, label, max_clients, max_seats, price_cents, currency, interval, blurb, purchasable')
      .order('sort')
      .then(({ data }) => {
        if (vivo) setPlanes(data || []);
      });
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

      {/* ══ EL HÉROE ═══════════════════════════════════════════════════════
          Cuatro palabras de titular y la escena debajo: tu ordenador a un lado y
          el móvil de tu cliente al otro. Las dos pantallas juntas contestan de un
          vistazo la única pregunta que trae todo el mundo —«¿esto qué es
          exactamente?»— y lo hacen antes de que nadie lea una línea. */}
      <section className="lp-sec lp-hero" id="top">
        <div className="lp-in lp-hero-in">
          <span className="lp-eyebrow">Software para entrenadores online</span>

          <h1 className="lp-h1">
            Entrena a más.
            <br />
            <em>Gestiona menos.</em>
          </h1>

          {/* Una sola frase, y con los cuatro verbos del trabajo de la semana.
              Aquí hubo tres frases explicando el reparto entre tú y tu cliente y
              era una explicación, no una promesa: lo que reparte el trabajo se
              ve solo en la escena de debajo. */}
          <p className="lp-lede">
            Monta rutinas y dietas, recibe los check-ins, sigue el progreso de cada cliente y ten a
            la vista quién te ha pagado. Todo desde un sitio, y en el navegador.
          </p>

          <div className="lp-cta">
            <Link className="lp-btn is-fill" to="/entrar?alta=1">
              Empezar gratis
            </Link>
            <a className="lp-btn is-ghost" href="#producto">
              Ver cómo funciona
            </a>
          </div>

          {/* El precio, en la primera pantalla. Es la pregunta que se hace
              inmediatamente después de «¿qué es esto?», y esconderla hasta el
              final solo consigue que se busque en otra pestaña. */}
          <span className="lp-cta-note">
            Tres clientes gratis, sin límite de tiempo y sin tarjeta.
            {masBarato && <> Para crecer, desde {planPrice(masBarato)}.</>}
          </span>

          <div className="lp-hero-art">
            <div className="lp-hero-desk">
              <Ventana pieza={HOY} titulo="Hoy" prioridad />
            </div>

            <div className="lp-hero-phone">
              <Movil pieza={MOVIL_HERO} />
            </div>

            {/* Las notas cuelgan del contenedor y no de la pieza que tapan: el
                móvil lleva su sombra en `filter`, y un filtro se aplica también a
                los hijos, así que una nota metida ahí saldría con sombra doble. */}
            <Nota donde="uno" k="Tu pantalla" v="Todo lo que han hecho" />
            <Nota donde="dos" k="Su móvil" v="La sesión del día" />
          </div>
        </div>
      </section>

      {/* ══ 1. LO QUE PROGRAMAS ═══════════════════════════════════════════ */}
      <Bloque
        id="producto"
        franja
        rotulo="Programación"
        titulo="Móntale la semana"
        remate="en cinco minutos"
        texto="Duplicas el bloque anterior, ajustas kilos, series y RIR, y la tiene en el móvil al instante. Con 46 ejercicios por grupo muscular listos desde el primer día."
      >
        <Ventana pieza={RUTINA} titulo="Rutina" />
      </Bloque>

      {/* ══ 2. LO QUE VE TU CLIENTE ═══════════════════════════════════════
          Dos móviles y no uno: lo que hay que enseñar aquí no es una pantalla,
          es que el cliente lleva encima el plan ENTERO —lo que come y cómo va—
          sin haberse instalado nada. */}
      <Entra as="section" className="lp-sec lp-feat" id="cliente">
        <div className="lp-in lp-feat-in">
          <div className="lp-feat-say">
            <span className="lp-kicker">La app de tu cliente</span>
            <h2>
              Tus clientes, con todo <em>en el bolsillo</em>
            </h2>
            <p className="lp-lede-sm">
              Su rutina, su dieta con los anillos de calorías de cada comida y su progreso al día.
              Se abre en el navegador y se añade a la pantalla de inicio: ni tienda, ni
              instalación, ni una cuenta que pagar.
            </p>
          </div>

          <div className="lp-feat-art lp-duo">
            {MOVILES.map((pieza) => (
              <Movil key={pieza.src} pieza={pieza} />
            ))}
          </div>
        </div>
      </Entra>

      {/* ══ 3. LO QUE TE DEVUELVE ═════════════════════════════════════════ */}
      <Bloque
        franja
        rotulo="Progreso"
        titulo="Su semana entera,"
        remate="en cuatro cifras"
        texto="Peso, check-in, tonelaje y calorías sobre la misma línea de tiempo. Cae solo de lo que registra tu cliente: nadie copia un dato a ninguna parte."
      >
        <Ventana pieza={PROGRESO} titulo="Progreso" />
      </Bloque>

      {/* ══ PRECIOS ═══════════════════════════════════════════════════════
          La sección existe siempre aunque `plan_limits` no conteste, porque el
          enlace «Precios» de la barra apunta aquí y un ancla que no lleva a
          ninguna parte es peor que una tarjeta menos. */}
      <Entra as="section" className="lp-sec" id="precios">
        <div className="lp-in">
          <div className="lp-sec-head is-center">
            <span className="lp-kicker">Precios</span>
            <h2>
              Un plan solo cambia <em>a cuánta gente llevas</em>
            </h2>
            <p className="lp-lede-sm">
              Tres clientes gratis, para siempre y sin tarjeta.
              {masBarato && <> Para crecer, desde {planPrice(masBarato)}.</>} Nada bajo llave en
              ningún plan.
            </p>
          </div>

          {planes.length > 0 && (
            <div className="lp-plan-grid">
              {planes.map((p) => (
                /*
                  El gratuito va marcado, y la etiqueta dice «empieza aquí» y no
                  «el más popular». Lo segundo es un dato que no existe —no hay
                  todavía una base de usuarios que lo sostenga— y una portada que
                  se inventa la prueba social se paga entera.
                */
                <article className={`lp-plan${p.price_cents ? '' : ' is-primero'}`} key={p.plan}>
                  {!p.price_cents && <span className="lp-plan-tag">Empieza aquí</span>}

                  <span className="lp-plan-name">{p.label}</span>

                  {/*
                    El gratuito enseña «0 €» y no «Gratis», que es lo que
                    devuelve `planPrice`: tres precios en el mismo formato se
                    leen como una escalera de un vistazo —0 → 25 → 69—, mientras
                    que una palabra en medio de dos cifras rompe esa lectura y
                    obliga a comparar a mano.

                    `planPrice` no se toca: la usa también Ajustes → Plan, donde
                    «Gratis» es exactamente lo que hay que decir porque ahí no
                    hay ninguna escalera que leer.
                  */}
                  <span className="lp-plan-price">
                    {p.price_cents
                      ? planPrice(p, { conPeriodo: false })
                      : localeNumber(0, {
                          style: 'currency',
                          currency: (p.currency || 'eur').toUpperCase(),
                          minimumFractionDigits: 0,
                        })}
                    <span className="per">/{p.interval === 'year' ? 'año' : 'mes'}</span>
                  </span>

                  {p.blurb && <p className="lp-plan-blurb">{p.blurb}</p>}

                  {/*
                    Las dos únicas líneas que separan un plan de otro salen de las
                    dos únicas columnas que los separan en la tabla
                    (`max_clients` y `max_seats`). Escribir aquí una lista de
                    funciones por plan sería inventarse un producto: aquí no hay
                    nada bajo llave, y la tercera línea lo dice en voz alta.
                  */}
                  <ul className="lp-plan-list">
                    <li>
                      {p.max_clients === null
                        ? 'Clientes sin límite'
                        : `Hasta ${p.max_clients} ${p.max_clients === 1 ? 'cliente' : 'clientes'}`}
                    </li>
                    <li>
                      {p.max_seats === null
                        ? 'Entrenadores sin límite'
                        : `${p.max_seats} ${p.max_seats === 1 ? 'entrenador' : 'entrenadores'}`}
                    </li>
                    <li>La aplicación entera, sin nada bajo llave</li>
                  </ul>

                  {/* El relleno se lo lleva el gratuito, que es la acción que se
                      quiere: los de pago no se contratan desde aquí sin cuenta
                      —hay que entrar y pasar por la pasarela—, así que un botón
                      sólido en ellos prometería un atajo que no existe. */}
                  <Link
                    className={`lp-btn is-sm ${p.price_cents ? 'is-ghost' : 'is-fill'}`}
                    to="/entrar?alta=1"
                  >
                    {p.price_cents ? `Empezar con ${p.label}` : 'Crear mi cuenta'}
                  </Link>
                </article>
              ))}
            </div>
          )}

          <p className="lp-plan-foot">
            Archivar a quien lo ha dejado no ocupa sitio en tu plan y conserva entero su historial
            para cuando vuelva. Y el día que dejes de pagar, la cuenta pasa a solo lectura: leer,
            exportar y borrar no se bloquean nunca.
          </p>
        </div>
      </Entra>

      {/* ══ DUDAS ══════════════════════════════════════════════════════════
          Cinco, no doce: las que deciden una compra. El resto es material de la
          ayuda, no de la portada.

          `<details>` nativo: se abre sin JavaScript, el buscador lo indexa y el
          teclado lo recorre solo. */}
      <Entra as="section" className="lp-sec is-band" id="preguntas">
        <div className="lp-in">
          <div className="lp-sec-head">
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
          <div className="lp-slab">
            <span className="lp-kicker">Empezar</span>
            <h2>
              Más clientes, <em>no más horas</em>
            </h2>
            <p>
              Empieza por el que tengas más a mano: se da de alta en diez segundos —solo hace falta
              su nombre— y desde ahí le programas la semana y le mandas su acceso.
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
              <a href="#producto">Cómo funciona</a>
              <a href="#cliente">La app de tu cliente</a>
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
