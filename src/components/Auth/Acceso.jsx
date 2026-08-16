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
 */
export const Acceso = ({ lema, remate, puntos = [], children }) => {
  useNoche();

  return (
    <div className="acceso">
      <div className="acceso-in">
        <aside className="acceso-say">
          {/* La marca es un enlace a la portada, y es la única salida de esta
              pantalla: quien llega desde un anuncio, mira el formulario y decide
              que quiere leer más, no tiene otra forma de volver que el botón del
              navegador. */}
          <Link className="lp-brand" to="/">
            <LogoMark size={28} />
            Caveman Hub
          </Link>

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
    </div>
  );
};
