import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ClipboardList, Layers, Sunrise } from 'lucide-react';

import { supabase } from '@/lib/supabaseClient';
import { planPrice } from '@/lib/num';
import { LogoMark } from '@/components/ui/Logo';

/**
 * La cara pública. Lo que ve quien llega sin sesión.
 *
 * ══ Por qué esto no existía y por qué hacía falta ═══════════════════════════
 *
 * La raíz sin sesión era el formulario de acceso. Todo el posicionamiento del
 * producto eran cuatro palabras bajo el logotipo —«Entrenamiento y progreso»— y
 * los precios, que están en la base de datos desde la migración 0021, solo se
 * podían ver DESPUÉS de crearse una cuenta y entrar en Ajustes.
 *
 * O sea: para vender esto había que pedirle a alguien que se registrara para
 * enterarse de qué era y cuánto costaba.
 *
 * ══ Qué cuenta, y por qué esas tres cosas ══════════════════════════════════
 *
 * No una lista de funciones. Las tres decisiones que ningún competidor toma
 * igual, que son las que de verdad separan a este producto:
 *
 *   · El bucle de la semana —«Hoy» y la revisión—, que es lo que convierte una
 *     base de datos de entrenamientos en una forma de trabajar.
 *   · El protocolo, que deja que cada entrenador decida qué le pide a su gente
 *     en lugar de imponerlo el producto.
 *   · El estudio de fotos, que encuadra dos fotos a la misma escala — sin eso la
 *     comparación engaña, y esa es la pieza que un entrenador enseña a su cliente.
 *
 * ══ Los precios salen de la base de datos ══════════════════════════════════
 *
 * De `plan_limits`, la MISMA tabla que lee Ajustes → Plan. Escribirlos aquí a
 * mano sería tener el precio en dos sitios, que es tenerlo mal en uno de los dos
 * el día que cambie. Se leen sin sesión gracias a la migración 0049.
 *
 * Si la lectura falla —migración sin aplicar, base caída— la página sigue
 * entera y los precios no salen, en lugar de dejar un hueco roto: enterarse de
 * qué es la aplicación no puede depender de que responda una tabla.
 */

const CLAVES = [
  {
    icon: Sunrise,
    titulo: 'Tu semana, no tu base de datos',
    texto:
      '«Hoy» te dice qué ha pasado desde ayer en toda tu cartera y quién espera respuesta tuya. La revisión semanal —sus fotos, su peso y tu contestación— cabe en una pantalla y se cierra en un toque.',
  },
  {
    icon: ClipboardList,
    titulo: 'Tú decides qué le pides a tu gente',
    texto:
      'Enciendes los módulos que usas y escribes las preguntas que haces al terminar de entrenar. Lo que apagues no existe: ni al programar ni en el móvil de tu cliente. La aplicación se adapta a cómo trabajas, no al revés.',
  },
  {
    icon: Camera,
    titulo: 'Fotos que comparan de verdad',
    texto:
      'Encuadras cada foto —zoom, giro, espejo— para que dos semanas distintas queden a la misma escala y altura. Sin eso la comparación engaña. Exportas el montaje y se lo mandas.',
  },
  {
    icon: Layers,
    titulo: 'Y ellos, desde el móvil',
    texto:
      'Tu cliente abre su rutina en el gimnasio, apunta kilos y repeticiones con lo que levantó la vez anterior delante, mira su dieta y sube su check-in. Todo te llega al momento.',
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
    <div className="landing">
      <header className="landing-bar">
        <span className="row gap-3">
          <LogoMark size={30} />
          <strong className="landing-brand">Caveman Hub</strong>
        </span>
        <Link className="btn btn-secondary btn-sm" to="/entrar">
          Entrar
        </Link>
      </header>

      <section className="landing-hero">
        <h1>El entrenamiento de tus clientes, en un sitio</h1>
        <p className="landing-claim">
          Programa rutinas y dietas, sigue medidas y fotos de progreso, y contesta el check-in de
          cada semana. Tus clientes lo llevan en el móvil y apuntan lo que levantan.
        </p>
        <div className="row gap-3 wrap center">
          <Link className="btn btn-primary btn-lg" to="/entrar?alta=1">
            Empezar gratis
          </Link>
          <Link className="btn btn-secondary btn-lg" to="/entrar">
            Ya tengo cuenta
          </Link>
        </div>
        {/* La regla: la firma del producto, y aquí también la línea que separa la
            promesa de lo que la sostiene. */}
        <span className="landing-rule" aria-hidden="true" />
      </section>

      <section className="landing-keys">
        {CLAVES.map(({ icon: Icon, titulo, texto }) => (
          <article className="landing-key" key={titulo}>
            <span className="landing-key-icon" aria-hidden="true">
              <Icon size={20} />
            </span>
            <h2>{titulo}</h2>
            <p>{texto}</p>
          </article>
        ))}
      </section>

      {planes.length > 0 && (
        <section className="landing-plans">
          <h2>Planes</h2>
          <p className="landing-plans-lede">
            Lo único que cambia de uno a otro es a cuánta gente puedes llevar.
          </p>

          <div className="landing-plan-grid">
            {planes.map((p) => (
              <article className={`landing-plan${p.purchasable ? '' : ' is-free'}`} key={p.plan}>
                <span className="landing-plan-name">{p.label}</span>
                <span className="landing-plan-price">
                  {planPrice(p, { conPeriodo: false })}
                  {p.price_cents ? (
                    <span className="per">al {p.interval === 'year' ? 'año' : 'mes'}</span>
                  ) : null}
                </span>
                <span className="landing-plan-limit">
                  {p.max_clients === null
                    ? 'Clientes sin límite'
                    : `Hasta ${p.max_clients} ${p.max_clients === 1 ? 'cliente' : 'clientes'}`}
                </span>
                {p.blurb && <p>{p.blurb}</p>}
              </article>
            ))}
          </div>

          <p className="landing-plans-foot">
            Se empieza por la prueba, sin tarjeta. Cuando te quedes sin sitio, cambias de plan desde
            dentro.
          </p>
        </section>
      )}

      <footer className="landing-foot">
        <span>© Caveman Hub</span>
        <span className="row gap-4 wrap">
          <a className="link" href="/privacidad">
            Privacidad
          </a>
          <a className="link" href="/condiciones">
            Condiciones
          </a>
        </span>
      </footer>
    </div>
  );
};
