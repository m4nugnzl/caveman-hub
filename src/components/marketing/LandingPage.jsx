import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { supabase } from '@/lib/supabaseClient';
import { planPrice } from '@/lib/num';
import { LogoMark } from '@/components/ui/Logo';

/**
 * La cara pública. Lo que ve quien llega sin sesión.
 *
 * ══ Por qué esto no existía y por qué hacía falta ═══════════════════════════
 *
 * La raíz sin sesión era el formulario de acceso. Todo el posicionamiento del
 * producto eran cuatro palabras bajo el logotipo, y los precios —que están en la
 * base de datos desde la migración 0021— solo se veían DESPUÉS de crearse una
 * cuenta. Para vender esto había que pedirle a alguien que se registrara para
 * enterarse de qué era y cuánto costaba.
 *
 * ══ La decisión de diseño: enseñar el producto, no describirlo ══════════════
 *
 * Una página de captación de una herramienta de entrenadores es, casi siempre,
 * un titular grande sobre un degradado y tres tarjetas con iconos. Eso se puede
 * escribir sin haber visto el producto, y se nota.
 *
 * Aquí el héroe es **una pieza real de la aplicación**: la tabla de series que
 * el cliente rellena en el gimnasio, con la tipografía de verdad, las cifras
 * tabulares de verdad y —lo que de verdad la distingue— lo que levantó la vez
 * anterior en gris dentro de cada casilla. No es una captura ni una ilustración:
 * es el mismo lenguaje visual que hay dentro, así que lo que se promete aquí es
 * exactamente lo que se entrega al entrar.
 *
 * ── La regla, de verdad ─────────────────────────────────────────────────────
 * Las marcas de cinta métrica son la firma del producto y solo aparecen donde se
 * mide algo. Aquí miden LA SEMANA: separan el titular de su prueba, y en «el
 * circuito» los cuatro pasos van sobre una cinta porque el bucle es semanal y el
 * orden es información, no adorno.
 *
 * ── Y ninguna tinta de marca ────────────────────────────────────────────────
 * El cromo no tiene color, aquí tampoco. Lo único con color de toda la página es
 * el disco de 25 del logotipo y las cifras de la tabla del héroe, que son datos.
 * Es la misma regla que sostiene el producto entero (`styles/tokens.css`).
 *
 * ══ Los precios salen de la base de datos ══════════════════════════════════
 *
 * De `plan_limits`, la MISMA tabla que lee Ajustes → Plan. Escribirlos aquí a
 * mano sería tener el precio en dos sitios, que es tenerlo mal en uno de los dos
 * el día que cambie. Se leen sin sesión gracias a la migración 0049, y si la
 * lectura falla la página sigue entera sin ellos: enterarse de qué es esto no
 * puede depender de que conteste una tabla.
 */

/** Las tres series del héroe. Cifras creíbles: una progresión de verdad. */
const SERIES = [
  { n: 1, obj: '6-8', kg: '102.5', reps: '8', rir: '2', antes: '100' },
  { n: 2, obj: '6-8', kg: '102.5', reps: '7', rir: '1', antes: '100' },
  { n: 3, obj: '6-8', kg: '', reps: '', rir: '', antes: '97.5' },
];

/**
 * El circuito de la semana. Es una SECUENCIA de verdad —cada paso necesita el
 * anterior—, así que va numerado: aquí el orden es información.
 */
const CIRCUITO = [
  {
    quien: 'Tu cliente',
    que: 'Apunta lo que levanta',
    detalle: 'En el gimnasio, con lo de la vez anterior delante. Y se pesa y se hace sus fotos.',
  },
  {
    quien: 'Tú',
    que: 'Lo ves sin perseguirlo',
    detalle: '«Hoy» te cuenta qué ha pasado desde ayer en toda tu cartera y quién te espera.',
  },
  {
    quien: 'Tú',
    que: 'Contestas en un toque',
    detalle: 'Sus fotos contra las de la vez anterior, su peso al lado, y tu respuesta. O un vídeo.',
  },
  {
    quien: 'Tu cliente',
    que: 'Lee lo que le dices',
    detalle: 'Dentro de la aplicación, no en un WhatsApp enterrado entre audios.',
  },
];

/** Lo que ningún competidor hace igual. Tres, no una lista de funciones. */
const CLAVES = [
  {
    titulo: 'Se adapta a cómo trabajas tú',
    texto:
      'Enciendes los módulos que usas y escribes las preguntas que haces al terminar de entrenar. Lo que apagues no existe: ni al programar ni en el móvil de tu cliente. Nadie te impone un método.',
  },
  {
    titulo: 'Fotos que comparan de verdad',
    texto:
      'Encuadras cada foto —zoom, giro, espejo— para que dos semanas queden a la misma escala y altura. Sin eso la comparación engaña. Exportas el montaje y se lo mandas.',
  },
  {
    titulo: 'Todo de alguien, dentro de él',
    texto:
      'Su rutina, su dieta, sus medidas, sus fotos y su ficha cuelgan del mismo sitio. No hay que recordar en qué pantalla vivía cada cosa.',
  },
];

export const LandingPage = () => {
  const [planes, setPlanes] = useState([]);

  useEffect(() => {
    let vivo = true;
    supabase
      .from('plan_limits')
      .select('plan, label, max_clients, price_cents, currency, interval, blurb, purchasable')
      .order('sort')
      .then(({ data }) => {
        if (vivo) setPlanes(data || []);
      });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div className="lp">
      <header className="lp-bar">
        <span className="row gap-3">
          <LogoMark size={28} />
          <strong className="lp-brand">Caveman Hub</strong>
        </span>
        <Link className="btn btn-secondary btn-sm" to="/entrar">
          Entrar
        </Link>
      </header>

      {/* ══ EL HÉROE ═══════════════════════════════════════════════════════
          El titular a la izquierda y su prueba a la derecha. La prueba no es una
          captura: es la pieza, con la misma tipografía y las mismas cifras
          tabulares que dentro. */}
      <section className="lp-hero">
        <div className="lp-hero-say">
          <h1>
            Tus clientes entrenan.
            <br />
            Tú lo ves todo.
          </h1>
          <p className="lp-lede">
            Programa rutinas y dietas, sigue medidas y fotos de progreso, y contesta el check-in de
            cada semana. Ellos lo llevan en el móvil y apuntan lo que levantan.
          </p>
          <div className="lp-cta">
            <Link className="btn btn-primary btn-lg" to="/entrar?alta=1">
              Empezar gratis
            </Link>
            <span className="lp-cta-note">Sin tarjeta. Tres clientes para probarlo.</span>
          </div>
        </div>

        <figure className="lp-proof">
          <figcaption className="lp-proof-head">
            <span className="lp-proof-name">Press banca</span>
            <span className="lp-proof-hint">la vez anterior · semana 3</span>
          </figcaption>

          <div className="lp-sets">
            <div className="lp-set is-head" aria-hidden="true">
              <span>#</span>
              <span>obj</span>
              <span>kg</span>
              <span>reps</span>
              <span>rir</span>
            </div>

            {SERIES.map((s) => (
              <div className={`lp-set${s.kg ? ' is-done' : ''}`} key={s.n}>
                <span className="tag">{s.kg ? '✓' : s.n}</span>
                <span className="obj">{s.obj}</span>
                {/* Vacía: lo de la vez anterior en gris, que es lo que convierte
                    tres casillas en una progresión. */}
                <span className={`v${s.kg ? '' : ' is-ghost'}`}>{s.kg || s.antes}</span>
                <span className={`v${s.reps ? '' : ' is-ghost'}`}>{s.reps || '8'}</span>
                <span className={`v${s.rir ? '' : ' is-ghost'}`}>{s.rir || '2'}</span>
              </div>
            ))}
          </div>

          <p className="lp-proof-foot">
            Lo que levantó la última vez, dentro de la casilla. Es la pregunta que se hace delante
            de cada barra, y hasta ahora había que ir a buscarla.
          </p>
        </figure>
      </section>

      {/* LA REGLA: separa la promesa de lo que la sostiene. */}
      <span className="lp-rule" aria-hidden="true" />

      {/* ══ EL CIRCUITO ════════════════════════════════════════════════════ */}
      <section className="lp-loop">
        <h2>Una semana, cerrada</h2>
        <p className="lp-sec-lede">
          El trabajo de un entrenador online no son cuarenta pantallas: son cuatro pasos que se
          repiten. Si uno se rompe, se rompen todos.
        </p>

        <ol className="lp-steps">
          {CIRCUITO.map((paso, i) => (
            <li className="lp-step" key={paso.que}>
              <span className="n" aria-hidden="true">
                {i + 1}
              </span>
              <span className="who">{paso.quien}</span>
              <span className="what">{paso.que}</span>
              <span className="how">{paso.detalle}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* ══ LO QUE NADIE MÁS HACE IGUAL ════════════════════════════════════ */}
      <section className="lp-keys">
        {CLAVES.map((clave) => (
          <article className="lp-key" key={clave.titulo}>
            <h3>{clave.titulo}</h3>
            <p>{clave.texto}</p>
          </article>
        ))}
      </section>

      {/* ══ PLANES ═════════════════════════════════════════════════════════ */}
      {planes.length > 0 && (
        <section className="lp-plans">
          <h2>Un plan solo cambia a cuánta gente llevas</h2>

          <div className="lp-plan-grid">
            {planes.map((p) => (
              <article className="lp-plan" key={p.plan}>
                <span className="lp-plan-name">{p.label}</span>
                <span className="lp-plan-price">
                  {planPrice(p, { conPeriodo: false })}
                  {p.price_cents ? (
                    <span className="per">/{p.interval === 'year' ? 'año' : 'mes'}</span>
                  ) : null}
                </span>
                <span className="lp-plan-limit">
                  {p.max_clients === null
                    ? 'Clientes sin límite'
                    : `Hasta ${p.max_clients} ${p.max_clients === 1 ? 'cliente' : 'clientes'}`}
                </span>
                {p.blurb && <p>{p.blurb}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ══ CIERRE ═════════════════════════════════════════════════════════ */}
      <section className="lp-end">
        <h2>Empieza con el cliente que tengas más a mano</h2>
        <p>
          Se da de alta en diez segundos —solo hace falta su nombre— y desde ahí puedes programarle
          la semana y mandarle su acceso.
        </p>
        <Link className="btn btn-primary btn-lg" to="/entrar?alta=1">
          Crear mi cuenta
        </Link>
      </section>

      <footer className="lp-foot">
        <span>© Caveman Hub</span>
        <span className="row gap-4 wrap">
          <a className="link" href="/privacidad">
            Privacidad
          </a>
          <a className="link" href="/condiciones">
            Condiciones
          </a>
          <Link className="link" to="/entrar">
            Entrar
          </Link>
        </span>
      </footer>
    </div>
  );
};
