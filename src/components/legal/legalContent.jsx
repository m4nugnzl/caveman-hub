/**
 * Privacidad y condiciones.
 *
 * ══ Por qué el texto vive en el código ═════════════════════════════════════
 *
 * Porque tiene que ser accesible SIN sesión —el cliente lo lee antes de aceptar,
 * y Stripe exige una dirección pública para activar la cuenta— y porque cambia
 * dos veces al año. Una tabla en la base de datos para eso añade una consulta y
 * una pantalla de administración que nadie va a usar.
 *
 * La versión del consentimiento (`ConsentNotice`) y este texto tienen que contar
 * lo mismo. Si cambias aquí lo que se guarda o quién lo ve, súbela allí.
 *
 * ══ AVISO ═════════════════════════════════════════════════════════════════
 *
 * Esto es un BORRADOR redactado sobre lo que la aplicación hace de verdad. No lo
 * ha revisado nadie con carrera de derecho, y esta aplicación trata datos de
 * salud —la categoría del artículo 9—, que es donde más caro sale equivocarse.
 * Antes de cobrarle a nadie, que lo lea un abogado.
 */

/*
  Los datos del titular. Sin rellenar, las páginas los pintan como huecos
  marcados en rojo, y eso es a propósito: una política de privacidad publicada
  con «[TU NOMBRE]» dentro es peor que no tenerla, y si el hueco no se ve, se
  publica. Aquí no se puede pasar por alto.
*/
export const TITULAR = {
  nombre: 'Manuel González Fernández',
  nif: '53521363H',
  domicilio: 'Calle Mariano Luiña 6 4A, 33710 Navia, Asturias, España',
  email: 'm4nugnzl@gmail.com',
};

export const ACTUALIZADO = 'agosto de 2026';

/** ¿Están todos los datos del titular puestos? */
export const titularCompleto = Object.values(TITULAR).every((v) => v.trim() !== '');

/**
 * Un hueco por rellenar. Se ve.
 *
 * El componente vive aquí y no en las primitivas porque no es un patrón de la
 * aplicación: es un andamio que tiene que desaparecer antes de publicar.
 */
export const Hueco = ({ children }) => <mark className="legal-hueco">Falta: {children}</mark>;

const Titular = ({ campo, children }) =>
  TITULAR[campo] ? <strong>{TITULAR[campo]}</strong> : <Hueco>{children}</Hueco>;

// ── Privacidad ─────────────────────────────────────────────────────────────

export const PRIVACIDAD = {
  slug: 'privacidad',
  titulo: 'Política de privacidad',
  entradilla:
    'Qué datos guarda Caveman Hub, para qué, quién puede verlos y qué puedes pedir en cualquier momento.',
  secciones: [
    {
      titulo: 'Quién trata tus datos',
      cuerpo: (
        <>
          <p>
            El responsable del tratamiento es <Titular campo="nombre">el nombre o razón social del titular</Titular>
            , con NIF <Titular campo="nif">el NIF</Titular> y domicilio en{' '}
            <Titular campo="domicilio">el domicilio fiscal</Titular>.
          </p>
          <p>
            Para cualquier cosa relacionada con tus datos, incluido ejercer los derechos que se
            explican más abajo, escribe a <Titular campo="email">el email de contacto</Titular>.
          </p>
          <p>
            Si eres cliente de un entrenador que usa Caveman Hub, <strong>tu entrenador</strong> es
            quien decide qué datos te pide y para qué; nosotros ponemos la herramienta.
          </p>
        </>
      ),
    },
    {
      titulo: 'Qué se guarda',
      cuerpo: (
        <>
          <ul>
            <li>
              <strong>Tu cuenta:</strong> nombre y correo electrónico. La contraseña no se guarda:
              se guarda una huella con la que no se puede reconstruir.
            </li>
            <li>
              <strong>Tu entrenamiento:</strong> rutinas, series, kilos, repeticiones, RIR y las
              notas de cada sesión.
            </li>
            <li>
              <strong>Tu alimentación:</strong> el plan que te asigna tu entrenador.
            </li>
            <li>
              <strong>Tus medidas:</strong> peso, perímetros y pliegues cutáneos.
            </li>
            <li>
              <strong>Tus fotos de progreso</strong>, si decides subirlas.
            </li>
          </ul>
          <p>
            Las medidas y las fotos son <strong>datos de salud</strong>: la categoría que el
            Reglamento General de Protección de Datos protege de forma especial. Por eso se tratan
            únicamente con tu consentimiento explícito, que se te pide al entrar y que puedes
            retirar.
          </p>
        </>
      ),
    },
    {
      titulo: 'Para qué',
      cuerpo: (
        <>
          <p>
            Para que tu entrenador pueda programarte, valorar cómo vas y ajustar lo que haga falta.
            Nada más.
          </p>
          <p>
            No se usan para publicidad, no se venden, no se ceden a terceros con fines comerciales y
            no se emplean para entrenar modelos de inteligencia artificial.
          </p>
        </>
      ),
    },
    {
      titulo: 'Quién puede verlos',
      cuerpo: (
        <>
          <p>
            Tu entrenador, y las personas de su equipo que lleven tu seguimiento. Nadie más tiene
            acceso a tu ficha: la propia base de datos aplica esa regla, no es una promesa de la
            pantalla.
          </p>
          <p>Para funcionar, la aplicación se apoya en tres proveedores:</p>
          <ul>
            <li>
              <strong>Supabase</strong> — guarda la base de datos, las cuentas y los archivos.
            </li>
            <li>
              <strong>Cloudflare</strong> — sirve la aplicación en tu navegador.
            </li>
            <li>
              <strong>Stripe</strong> — cobra la suscripción de los entrenadores. Si eres cliente de
              un entrenador, Stripe no recibe ningún dato tuyo.
            </li>
          </ul>
          <p>
            Los tres actúan como encargados del tratamiento: tratan los datos por cuenta del
            responsable y no para lo suyo.
          </p>
        </>
      ),
    },
    {
      titulo: 'Cuánto tiempo',
      cuerpo: (
        <p>
          Mientras dure tu relación con tu entrenador, y después mientras tu ficha siga en su
          cartera. Cuando pides que se borren, se borran: la ficha, el historial y los archivos.
        </p>
      ),
    },
    {
      titulo: 'Qué puedes pedir',
      cuerpo: (
        <>
          <ul>
            <li>
              <strong>Una copia de todo</strong> lo que hay sobre ti, en un archivo que puedes
              llevarte.
            </li>
            <li>
              <strong>Que se corrija</strong> lo que esté mal.
            </li>
            <li>
              <strong>Que se borre todo.</strong> Incluye las fotos.
            </li>
            <li>
              <strong>Retirar tu consentimiento</strong>, que no afecta a lo que se hizo antes de
              retirarlo.
            </li>
          </ul>
          <p>
            Las dos primeras y el borrado los hace tu entrenador desde la propia aplicación, así que
            lo más rápido es pedírselo a él. Si no obtienes respuesta, escribe a{' '}
            <Titular campo="email">el email de contacto</Titular>.
          </p>
          <p>
            Y si crees que tus datos no se están tratando como toca, puedes reclamar ante la Agencia
            Española de Protección de Datos (<span className="legal-url">aepd.es</span>).
          </p>
        </>
      ),
    },
    {
      titulo: 'Cookies',
      cuerpo: (
        <p>
          Caveman Hub no usa cookies de análisis ni de publicidad. Guarda en tu navegador lo
          imprescindible para que la sesión siga abierta y para recordar el tema claro u oscuro.
          Nada de eso sale de tu dispositivo ni sirve para seguirte por otras webs.
        </p>
      ),
    },
  ],
};

// ── Condiciones ────────────────────────────────────────────────────────────

export const CONDICIONES = {
  slug: 'condiciones',
  titulo: 'Condiciones del servicio',
  entradilla:
    'Qué es Caveman Hub, qué se paga, qué pasa si dejas de pagar y qué esperamos de cada parte.',
  secciones: [
    {
      titulo: 'Qué es esto',
      cuerpo: (
        <p>
          Caveman Hub es una herramienta para entrenadores personales: programar rutinas y planes de
          alimentación, registrar medidas y fotos, y seguir la evolución de sus clientes. Lo
          contrata el entrenador; sus clientes acceden a su portal sin coste.
        </p>
      ),
    },
    {
      titulo: 'No damos consejo médico',
      cuerpo: (
        <p>
          Esta aplicación no diagnostica, no prescribe y no sustituye a un profesional sanitario. El
          criterio de entrenamiento y de alimentación es del entrenador que la usa, y la
          responsabilidad de lo que le indique a sus clientes es suya.
        </p>
      ),
    },
    {
      titulo: 'La cuenta',
      cuerpo: (
        <>
          <p>
            Tienes que dar datos ciertos y guardar tu contraseña. Lo que pase desde tu cuenta se
            considera hecho por ti.
          </p>
          <p>
            El entrenador es responsable de tener permiso de sus clientes para meter sus datos aquí,
            y la aplicación se lo pide a cada cliente al darle acceso.
          </p>
        </>
      ),
    },
    {
      titulo: 'Pagos y renovación',
      cuerpo: (
        <>
          <p>
            La suscripción es mensual y se renueva sola hasta que la cancelas. Los precios se
            muestran con los impuestos que correspondan a tu país. Cobra Stripe; nosotros no vemos
            ni guardamos tu tarjeta.
          </p>
          <p>
            <strong>Cancelar</strong> se hace desde <em>Ajustes → Plan</em>, en cualquier momento y
            sin dar explicaciones. Sigues teniendo el plan hasta el final del periodo que ya has
            pagado.
          </p>
          <p>
            <strong>Si un recibo queda impagado</strong>, dejas de poder dar de alta clientes
            nuevos. Lo que ya tienes se sigue viendo, editando y exportando: no se borra nada por no
            pagar.
          </p>
        </>
      ),
    },
    {
      titulo: 'Tus datos son tuyos',
      cuerpo: (
        <p>
          Lo que escribes en Caveman Hub te pertenece. Puedes descargarlo entero cuando quieras
          desde <em>Ajustes → Copia de seguridad</em>, y también después de cancelar. No se usa para
          nada que no sea prestarte el servicio.
        </p>
      ),
    },
    {
      titulo: 'Disponibilidad',
      cuerpo: (
        <p>
          Se hace lo razonable para que esto funcione siempre, pero no se garantiza que no haya
          cortes ni errores. Habrá paradas por mantenimiento y fallos de los proveedores.
        </p>
      ),
    },
    {
      titulo: 'Cambios y baja',
      cuerpo: (
        <p>
          Estas condiciones pueden cambiar; si el cambio es relevante se avisa con antelación y
          siempre puedes cancelar. Una cuenta puede suspenderse si se usa para algo ilegal o para
          perjudicar el servicio.
        </p>
      ),
    },
    {
      titulo: 'Ley aplicable',
      cuerpo: (
        <p>
          Se aplica la legislación española. Para cualquier disputa, los juzgados del domicilio del
          titular, salvo que la ley de consumo diga otra cosa.
        </p>
      ),
    },
  ],
};

export const DOCUMENTOS = { privacidad: PRIVACIDAD, condiciones: CONDICIONES };
