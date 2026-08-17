import { Link } from 'react-router-dom';

import { LogoMark } from '@/components/ui/Logo';
import { useNoche } from '@/lib/useNoche';

/**
 * El escaparate del acceso: a un lado por qué estás aquí, al otro el formulario.
 *
 * ══ Por qué existe ══════════════════════════════════════════════════════════
 *
 * Porque esta pantalla venía justo detrás de la portada y no se parecía en nada
 * a ella. Se pulsaba «Empezar gratis» sobre un lienzo negro, con titulares de
 * ochenta píxeles y botones en pastilla, y lo que aparecía era una tarjeta
 * blanca de 392 px centrada en el vacío. Todo funcionaba, pero la costura se
 * veía: parecía el formulario de otra aplicación al que te habían mandado.
 *
 * Aquí hay dos cosas y las dos son deliberadas:
 *
 *   · **La misma noche.** `useNoche` pone el mismo lienzo que la portada, así
 *     que pulsar el botón no cambia de mundo, solo de pantalla.
 *
 *   · **Una columna que habla.** Un formulario de acceso a solas en mitad de la
 *     pantalla obliga a decidir sin nada delante. Al lado del campo de email va
 *     lo que se está a punto de conseguir —una frase y tres hechos— que es lo
 *     que sostiene el momento entre «me interesa» y «escribo mi correo».
 *
 * Lo que dice esa columna lo decide QUIEN LA USA, y no es un detalle: por esta
 * misma pantalla entra el cliente que acepta la invitación de su entrenador, y a
 * él no se le vende un plan —él no paga nada—. Cada llamada trae su discurso.
 *
 * En estrecho la columna de la izquierda no se esconde: se pone encima y se
 * queda en la frase y la marca. Es lo poco que hace falta para saber dónde se
 * está escribiendo la contraseña.
 *
 * ══ La marca sube a una barra, y con ella la salida ═════════════════════════
 *
 * El logotipo estaba dentro de la columna que habla, encabezándola. Ahí hacía
 * dos trabajos a la vez y ninguno bien: era el principio del discurso y era la
 * ÚNICA salida de la pantalla. Y una salida escondida en mitad de un párrafo no
 * es una salida — quien mira el formulario, se lo piensa y quiere volver a leer
 * la portada, no la busca ahí: la busca arriba, que es donde está en todas las
 * páginas del mundo.
 *
 * Arriba están las dos cosas que se le piden a una cabecera —dónde estoy y cómo
 * salgo— y la columna se queda con lo suyo: el rótulo, la frase y los hechos.
 *
 * Y abajo un pie de dos líneas con las condiciones y la privacidad. En una
 * pantalla donde se está creando una cuenta, esos dos enlaces tienen que poder
 * encontrarse sin leer la letra pequeña del botón.
 */
export const Acceso = ({ rotulo, lema, remate, puntos = [], children }) => {
  useNoche();

  return (
    <div className="acceso">
      <header className="acceso-bar">
        <div className="acceso-fila">
          <Link className="lp-brand" to="/">
            <LogoMark size={26} />
            Caveman Hub
          </Link>

          <Link className="lp-nav-link" to="/">
            Volver al inicio
          </Link>
        </div>
      </header>

      <div className="acceso-in">
        <aside className="acceso-say">
          {rotulo && <span className="lp-kicker">{rotulo}</span>}

          <h2 className="acceso-lema">
            {lema} {remate && <em>{remate}</em>}
          </h2>

          {puntos.length > 0 && (
            <ul className="acceso-puntos">
              {puntos.map((punto) => (
                <li key={punto}>{punto}</li>
              ))}
            </ul>
          )}
        </aside>

        <div className="acceso-form">{children}</div>
      </div>

      <footer className="acceso-foot">
        <div className="acceso-fila">
          <span>© Caveman Hub</span>

          <span className="acceso-foot-links">
            <a href="/condiciones">Condiciones</a>
            <a href="/privacidad">Privacidad</a>
          </span>
        </div>
      </footer>
    </div>
  );
};
