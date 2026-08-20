import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useSession } from '@/context/AppContext';
import { Notice } from '@/components/ui/primitives';

/**
 * El aviso del plan, donde el entrenador lo va a ver.
 *
 * ══ Por qué no basta con la pantalla de Plan ═══════════════════════════════
 *
 * Porque nadie entra en Ajustes. Los avisos que de verdad importan —«tu prueba
 * termina en tres días», «hay un recibo pendiente»— vivían solo ahí, así que la
 * secuencia real era: se acaba la prueba, deja de poder dar de alta clientes, no
 * entiende por qué, y se va. Una baja que se podía haber evitado con una frase.
 *
 * Aquí sale en todas las pantallas del entrenador, que es donde está.
 *
 * ══ Qué avisa y qué no ═════════════════════════════════════════════════════
 *
 * Solo lo accionable y solo cuando toca. Una franja permanente diciendo «estás en
 * el plan Solo» se deja de ver a los dos días, y entonces tampoco se ve el día que
 * dice algo importante. Por eso callan los estados normales:
 *
 *   · recibo pendiente     → siempre, y no se puede cerrar: bloquea el trabajo
 *   · prueba terminada     → siempre, misma razón
 *   · quedan ≤ 7 días      → se puede cerrar, y vuelve mañana
 *   · lleno hasta el tope  → se puede cerrar; avisa ANTES de que falle un alta
 *   · todo lo demás        → nada
 */
export const PlanNotice = () => {
  const { plan, session, view } = useSession();
  const { pathname } = useLocation();
  const [cerrado, setCerrado] = useState(() => leerCerrado(session?.user?.id));

  // En la propia pantalla de Plan sobra: lo cuenta entero y con más detalle.
  if (!plan || view !== 'coach' || pathname.startsWith('/ajustes/plan')) return null;

  const aviso = avisoDe(plan);
  if (!aviso) return null;
  if (aviso.sePuedeCerrar && cerrado) return null;

  const cerrar = () => {
    guardarCerrado(session?.user?.id);
    setCerrado(true);
  };

  return (
    <div className="layout" style={{ paddingBottom: 0 }}>
      <Notice
        tone={aviso.tono}
        action={
          <span className="row gap-2 shrink-0">
            <Link className="btn btn-secondary btn-sm" to="/ajustes/plan">
              {aviso.accion}
            </Link>
            {aviso.sePuedeCerrar && (
              <button type="button" className="btn btn-sm" onClick={cerrar}>
                Hoy no
              </button>
            )}
          </span>
        }
      >
        {/* La versión corta existe solo donde hace falta: si un aviso no la
            trae, el texto completo vale en los dos anchos. */}
        <span className="solo-escritorio">{aviso.texto}</span>
        <span className="solo-movil">{aviso.textoCorto || aviso.texto}</span>
      </Notice>
    </div>
  );
};

/**
 * Qué decir, si es que hay algo que decir.
 *
 * En orden de gravedad y con salida a la primera: si hay un recibo pendiente, que
 * queden dos días de prueba da igual. Dos franjas a la vez no son el doble de
 * aviso, son la mitad de atención en cada una.
 */
const avisoDe = ({ status, activo, clients, maxClients, trialEndsAt }) => {
  if (status === 'past_due') {
    return {
      tono: 'error',
      texto:
        'Hay un recibo pendiente. Mientras siga así no puedes dar de alta clientes nuevos; lo que ya tienes está intacto.',
      accion: 'Resolver',
      sePuedeCerrar: false,
    };
  }

  if (!activo) {
    return {
      tono: 'error',
      texto:
        status === 'trialing'
          ? 'Tu prueba ha terminado. Elige un plan para seguir dando de alta clientes.'
          : 'Tu suscripción no está activa. Elige un plan para seguir dando de alta clientes.',
      accion: 'Ver planes',
      sePuedeCerrar: false,
    };
  }

  if (status === 'trialing' && trialEndsAt) {
    const dias = Math.ceil((new Date(trialEndsAt) - Date.now()) / 86400000);
    if (dias <= 7) {
      return {
        tono: dias <= 3 ? 'warn' : 'info',
        texto: `Te ${dias === 1 ? 'queda' : 'quedan'} ${dias} ${dias === 1 ? 'día' : 'días'} de prueba.`,
        accion: 'Ver planes',
        sePuedeCerrar: true,
      };
    }
  }

  /*
    El tope, avisado ANTES de que falle nada. Sin esto, la primera noticia de que
    el plan se ha llenado es un alta rechazada a mitad de rellenar la ficha de un
    cliente nuevo, que es el peor momento posible para enterarse.
  */
  if (maxClients !== null && clients >= maxClients) {
    return {
      tono: 'warn',
      texto: `Has llegado al tope de tu plan: ${clients} de ${maxClients} clientes. Para dar de alta a otro, cambia de plan o archiva a alguien que haya terminado.`,
      /*
        En móvil la frase entera se envuelve en seis líneas y, como este aviso
        sale en todas las pantallas, se comía un tercio de cada una. La cifra es
        el aviso; el qué hacer ya lo dice el botón de al lado.
      */
      textoCorto: `Tope del plan: ${clients} de ${maxClients} clientes.`,
      accion: 'Ver planes',
      sePuedeCerrar: true,
    };
  }

  return null;
};

/*
  Cerrarlo vale POR HOY, no para siempre.

  Un aviso que se cierra definitivamente deja de avisar justo cuando más falta
  hace —el último día de la prueba—, y uno que no se puede cerrar se convierte en
  parte del decorado. Volver mañana es el punto medio: molesta lo justo para no
  olvidarse, y no impide trabajar hoy.

  Se guarda en el navegador y por usuario, igual que la bienvenida: no merece una
  columna en la base de datos.
*/
const clave = (userId) => `caveman-aviso-plan:${userId || 'anon'}`;
const hoy = () => new Date().toISOString().slice(0, 10);

const leerCerrado = (userId) => {
  try {
    return localStorage.getItem(clave(userId)) === hoy();
  } catch {
    // Almacenamiento bloqueado: el aviso se queda visible, que es el lado
    // correcto por el que equivocarse.
    return false;
  }
};

const guardarCerrado = (userId) => {
  try {
    localStorage.setItem(clave(userId), hoy());
  } catch {
    // Sin persistencia vuelve en la próxima carga. Molesto, no roto.
  }
};
