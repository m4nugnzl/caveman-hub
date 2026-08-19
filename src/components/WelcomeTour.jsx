import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Layers, Ruler, Salad } from 'lucide-react';

import { useSession } from '@/context/AppContext';
import { Modal } from '@/components/ui/Modal';
import { hasSeenTour, markTourSeen } from '@/lib/tourSeen';

/**
 * La bienvenida: tres o cuatro pasos la primera vez que alguien entra.
 *
 * ── Por qué hace falta ──────────────────────────────────────────────────────
 * Quien entra por primera vez —entrenador o cliente— se encuentra una aplicación
 * VACÍA. El entrenador no tiene clientes, así que la cartera está en blanco, «Hoy»
 * no tiene nada que contar y no hay ninguna pista de que el orden es *dar de alta →
 * programar → invitar*. Y el cliente aterriza desde un enlace de WhatsApp sin saber
 * qué se espera de él.
 *
 * Esa primera pantalla es la que decide si alguien se queda. Un panel vacío no
 * explica nada por sí solo, por bien construido que esté lo que hay detrás.
 *
 * ── Por qué un diálogo y no señales sobre la interfaz ───────────────────────
 * Los recorridos que resaltan botones reales («esto es la cartera», con flecha)
 * obligan a acertar la posición de cada elemento en las tres anchuras del
 * proyecto, y se rompen en silencio en cuanto algo se mueve —que es exactamente el
 * fallo que `verify-styles` existe para evitar en el CSS—. Un diálogo cuenta lo
 * mismo, sobrevive a cualquier cambio de maquetación y ya funciona en móvil.
 *
 * ── Lo que NO hace ──────────────────────────────────────────────────────────
 * No enseña la aplicación entera. Dice el orden en que hay que hacer las cosas y
 * termina llevando al primer sitio donde hacerlas. Lo demás se descubre usándolo.
 */

// ── Los pasos ──────────────────────────────────────────────────────────────

/**
 * El recorrido del entrenador es el ORDEN REAL de trabajo, no un índice de
 * secciones: sin cliente no hay a quién programar, y sin invitación el cliente no
 * puede entrar —que es el error más caro, porque la mitad de la aplicación queda
 * sin usar sin que nada avise—.
 */
/*
  ══ El entrenador ya no tiene recorrido ════════════════════════════════════

  Tenía uno de cuatro pasos, y contaba exactamente lo mismo que el panel de
  «Por dónde empezar» y que el estado vacío de la cartera: tres superficies
  diciendo «da de alta → programa → invita» con distintas palabras, seguidas.

  Un diálogo que se abre ANTES de haber tocado nada es un manual de una máquina
  que todavía no has visto: se cierra sin leer, y con él se va la única pista
  del orden. La guía se quedó, porque es la que sabe por dónde vas y la que
  puede llevarte con quien te falta (`domain/onboarding.js`).

  El del CLIENTE sí se queda: llega desde un enlace de WhatsApp sin saber qué es
  esto ni qué se espera de él, y no tiene ninguna otra superficie que se lo
  cuente.
*/
const CLIENT_STEPS = [
  {
    icon: Layers,
    title: 'Tu rutina, día a día',
    body: (
      <>
        En <strong>Mi rutina</strong> tienes la sesión que te toca. Apunta los kilos, las
        repeticiones y el RIR de cada serie según entrenas: tu entrenador lo ve al momento y con la
        fecha real.
      </>
    ),
  },
  {
    icon: Salad,
    title: 'Tu dieta, con opciones',
    body: (
      <>
        <strong>Mi dieta</strong> son tus comidas del día. Cada una puede tener varias opciones
        equivalentes: eliges la que te venga bien.
      </>
    ),
  },
  {
    icon: Ruler,
    title: 'Y una vez por semana, el check-in',
    body: (
      <>
        {/* La sección se llama como en la barra: las dos que nombraba este paso
            se fusionaron en «Mi evolución» y el texto se había quedado viejo. */}
        Tu peso, tus medidas y tus fotos, en <strong>Mi evolución</strong>. Es lo que convierte
        sensaciones sueltas en una evolución que se puede mirar.
      </>
    ),
  },
  {
    icon: Camera,
    title: 'Las fotos son privadas',
    body: <>Solo las ve tu entrenador, para valorar tu progreso. Nadie más tiene acceso a ellas.</>,
  },
];

// ── Estado compartido ──────────────────────────────────────────────────────

/*
  Mismo patrón que la paleta de comandos: el diálogo lo abren dos cosas —la primera
  visita y la entrada «Ver el tutorial» del menú de cuenta—, y ninguna de las dos
  es padre de la otra. Un booleano en un contexto minúsculo evita pasarlo a mano
  por la cabecera, que no pinta nada en esto.
*/
const TourContext = createContext(null);

export const TourProvider = ({ children }) => {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
};

export const useTour = () => {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour debe usarse dentro de <TourProvider>.');
  return ctx;
};

// ── El diálogo ─────────────────────────────────────────────────────────────

export const WelcomeTour = () => {
  const { session, profileRole } = useSession();
  const { open, setOpen } = useTour();
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const userId = session?.user?.id;

  /*
    El recorrido se elige por el ROL REAL, no por `view`. Un entrenador que
    previsualiza el portal de su cliente no está viendo esto por primera vez, y
    soltarle ahí la bienvenida del cliente sería ruido en mitad de una comprobación.
  */
  /* Solo el cliente. El entrenador tiene su guía viva en «Hoy». */
  const isCoach = profileRole === 'coach';
  const steps = CLIENT_STEPS;

  /* La primera visita la abre sola; el menú de cuenta la abre a mano. Al
     entrenador no se le abre sola: su guía es el panel de «Por dónde empezar»,
     que sí sabe por dónde va. */
  useEffect(() => {
    if (!userId || isCoach || hasSeenTour(userId)) return;
    setOpen(true);
  }, [userId, isCoach, setOpen]);

  /* Cada apertura empieza por el primer paso, venga de donde venga: quien vuelve a
     abrirla desde el menú quiere el recorrido, no el punto donde la dejó. */
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;

  const close = () => {
    markTourSeen(userId);
    setOpen(false);
  };

  const last = step === steps.length - 1;

  /* Termina llevando al sitio donde se hace lo primero que se ha contado. Cerrar
     y dejar a alguien en la misma pantalla vacía desaprovecha el único momento en
     que está mirando. */
  const finish = () => {
    close();
    navigate(isCoach ? '/hoy' : '/mi/rutina');
  };

  const { icon: Icon, title, body } = steps[step];

  return (
    <Modal
      title="Este es tu espacio"
      onClose={close}
      footer={
        <div className="tour-foot">
          <span className="tour-dots" role="presentation">
            {steps.map((s, i) => (
              <span key={s.title} className={`tour-dot${i === step ? ' is-on' : ''}`} />
            ))}
          </span>

          <span className="row gap-2">
            {step > 0 && (
              <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)}>
                Atrás
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => (last ? finish() : setStep(step + 1))}
            >
              {last ? 'Ver mi rutina' : 'Siguiente'}
            </button>
          </span>
        </div>
      }
    >
      <div className="empty">
        <span className="empty-icon">
          <Icon size={26} />
        </span>
        <h3>{title}</h3>
        <p>{body}</p>
        <span className="t-xs t-tertiary">
          Paso {step + 1} de {steps.length}
        </span>
      </div>
    </Modal>
  );
};
