import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronRight, X } from 'lucide-react';

import { useApp, useData, useSession } from '@/context/AppContext';
import { Modal } from '@/components/ui/Modal';
import { Panel, SectionTitle, Switch } from '@/components/ui/primitives';
import { guiasHechas, hasSeenTour, marcarGuiaHecha, markTourSeen } from '@/lib/tourSeen';
import { prefiereMenosMovimiento } from '@/lib/motion';
import { useMediaQuery } from '@/lib/useMediaQuery';
import {
  CONSULTA_MONITOR,
  GUIA_BIENVENIDA_CLIENTE,
  alternativas,
  dondeDelPaso,
  guiaDeLaPantalla,
  guiaPorId,
  guiasDe,
  guiasDeLasPantallas,
  pantallasEncendidas,
  pasosDe,
  rutaDe,
} from '@/domain/tutoriales';

/**
 * «Aprende Caveman Hub»: las guías que se hacen sobre la app de verdad.
 *
 * Tres piezas y un estado compartido:
 *
 *   · `AprendeProvider` guarda qué guía está en marcha y si el índice está
 *     abierto. Lo abren sitios que no se conocen entre sí —el menú de cuenta,
 *     «Tú» del cliente, la guía de «Por dónde empezar»—, por eso va arriba.
 *   · `IndiceAprende`, la lista de guías de tu serie, con las hechas marcadas.
 *   · `Recorrido`, la tarjeta que acompaña a la guía: busca en la pantalla lo
 *     que señala el paso, lo rodea con un anillo y se coloca al lado.
 *
 * El catálogo —qué cuenta cada guía y qué señala— vive en `domain/tutoriales.js`.
 *
 * ── Lo que NO hace ─────────────────────────────────────────────────────────
 * No bloquea la pantalla. El anillo y el velo no reciben pulsaciones: se sigue
 * usando la app con la guía delante, que es de lo que se trata. Y si algo que
 * señalaba ya no está, la guía no se rompe: cuenta el paso sin señalar.
 *
 * Sustituye al diálogo de cuatro pasos del cliente (`WelcomeTour`), que contaba
 * con palabras dónde estaba cada cosa y dejaba a la persona buscándola.
 */

const AprendeContext = createContext(null);

export const useAprende = () => {
  const ctx = useContext(AprendeContext);
  if (!ctx) throw new Error('useAprende debe usarse dentro de <AprendeProvider>.');
  return ctx;
};

/* El cliente sobre el que se hace una guía del entrenador: el que tiene
   abierto, y si no está en ninguno, el primero de su cartera. */
const clienteDeLaRuta = (pathname) => pathname.match(/^\/c\/([^/]+)/)?.[1] || null;

export const AprendeProvider = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { clients } = useData();

  /* `{ id, paso, cliente, hasta }`. `hasta` es el paso más lejano al que se ha
     llegado: lo de antes ya se hizo, y al volver atrás se puede pasar sin
     rehacerlo. */
  const [activa, setActiva] = useState(null);
  const [indice, setIndice] = useState(false);

  const clientePorDefecto = clienteDeLaRuta(location.pathname) || clients?.[0]?.id || null;

  const empezar = useCallback(
    (id, { cliente, quedarse = false } = {}) => {
      const guia = guiaPorId(id);
      if (!guia) return;
      const clienteId = cliente || clientePorDefecto;
      const destino = rutaDe(guia.empieza, clienteId);
      if (guia.conCliente && !destino) return;
      setIndice(false);
      if (!quedarse && destino && location.pathname !== destino) navigate(destino);
      setActiva({ id, paso: 0, cliente: clienteId, hasta: 0 });
    },
    [clientePorDefecto, location.pathname, navigate]
  );

  const value = useMemo(
    () => ({
      activa,
      setActiva,
      empezar,
      indiceAbierto: indice,
      abrirIndice: () => setIndice(true),
      cerrarIndice: () => setIndice(false),
      clientePorDefecto,
    }),
    [activa, empezar, indice, clientePorDefecto]
  );

  return <AprendeContext.Provider value={value}>{children}</AprendeContext.Provider>;
};

// ── Buscar lo que señala un paso ───────────────────────────────────────────

/* Ni lo de la propia guía ni una ventana que se está cerrando: el índice,
   mientras se va, todavía contiene «registrar series» o «sus fases», y eso
   bastaba para dar por hecho el primer paso de la guía que acababa de abrir. */
const visible = (el) => {
  if (el.closest('.aprende-capa, .aprende-lista, [data-state="closing"]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const estilo = window.getComputedStyle(el);
  return estilo.visibility !== 'hidden' && estilo.display !== 'none';
};

const contiene = (el, texto) => {
  const t = `${el.innerText || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
  return t.includes(texto.toLowerCase());
};

/** Todos los elementos visibles de la primera alternativa que tenga alguno. */
const encontrarTodos = (senal) => {
  if (typeof document === 'undefined') return [];
  for (const s of alternativas(senal)) {
    let nodos;
    if (s.campo) {
      const campo = s.campo.toLowerCase();
      nodos = [...document.querySelectorAll('.field')].filter((f) =>
        (f.querySelector('.field-label')?.textContent || '').trim().toLowerCase().startsWith(campo)
      );
    } else {
      try {
        nodos = [...document.querySelectorAll(s.css)];
      } catch {
        // Un selector mal escrito en el catálogo no puede tumbar la pantalla:
        // el paso se enseña sin señalar, y la prueba del catálogo lo delata.
        nodos = [];
      }
      if (s.texto) nodos = nodos.filter((n) => contiene(n, s.texto));
    }
    const vistos = nodos.filter(visible);
    if (vistos.length > 0) return vistos;
  }
  return [];
};

/** El primer elemento visible que cumpla alguna de las alternativas. */
export const encontrar = (senal) => encontrarTodos(senal)[0] || null;

/* Las casillas donde se escribe: las de texto y número, no los interruptores. */
const CASILLAS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select';

/** Si se cumple el `listo` de un paso: alguna casilla con algo escrito. */
const cumple = (listo) =>
  encontrarTodos(listo.relleno).some((el) => {
    const casillas = el.matches(CASILLAS) ? [el] : [...el.querySelectorAll(CASILLAS)];
    return casillas.some((c) => String(c.value ?? '').trim() !== '');
  });

/** Si se está escribiendo todavía dentro de lo que pide el `listo`. */
const conElFoco = (listo) => {
  const activo = document.activeElement;
  return Boolean(activo) && encontrarTodos(listo.relleno).some((el) => el.contains(activo));
};

const mismoRect = (a, b) =>
  a && b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

const rectDe = (el) => {
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
};

// ── Dónde va la tarjeta ────────────────────────────────────────────────────

const MARGEN = 16;
const HUECO = 14;
const ANCHO = 340;

/**
 * Debajo de lo señalado si cabe, encima si no, y si no cabe por ninguno de los
 * dos lados, al costado. Sin nada señalado, abajo en el centro (arriba en el
 * teléfono, para no tapar la barra del pulgar).
 */
const colocar = (rect, alto, vw, vh) => {
  const telefono = vw < 640;
  const ancho = telefono ? vw - MARGEN * 2 : ANCHO;
  const entre = (v, min, max) => Math.max(min, Math.min(v, max));

  const dentro = (p) => ({ ...p, top: entre(p.top, MARGEN, vh - alto - MARGEN) });

  if (!rect) {
    return telefono
      ? { top: MARGEN, left: MARGEN, width: ancho }
      : { top: vh - alto - 24, left: (vw - ancho) / 2, width: ancho };
  }

  const left = telefono ? MARGEN : entre(rect.left + rect.width / 2 - ancho / 2, MARGEN, vw - ancho - MARGEN);
  /* Lo señalado todavía fuera de la vista (se está desplazando hacia ello): la
     tarjeta espera en el borde por el que va a entrar, nunca fuera. */
  if (rect.top >= vh) return { top: vh - alto - MARGEN, left, width: ancho };
  if (rect.top + rect.height <= 0) return { top: MARGEN, left, width: ancho };

  const abajo = rect.top + rect.height + HUECO;
  if (abajo + alto <= vh - MARGEN) return { top: abajo, left, width: ancho };
  const arriba = rect.top - HUECO - alto;
  if (arriba >= MARGEN) return { top: arriba, left, width: ancho };

  if (!telefono) {
    const top = entre(rect.top, MARGEN, vh - alto - MARGEN);
    if (rect.left + rect.width + HUECO + ancho <= vw - MARGEN) {
      return dentro({ top, left: rect.left + rect.width + HUECO, width: ancho });
    }
    if (rect.left - HUECO - ancho >= MARGEN) return dentro({ top, left: rect.left - HUECO - ancho, width: ancho });
  }
  /* Lo señalado ocupa casi toda la pantalla: la tarjeta en la mitad libre. */
  const enLaMitadDeArriba = rect.top + rect.height / 2 < vh / 2;
  return dentro({ top: enLaMitadDeArriba ? vh - alto - MARGEN : MARGEN, left, width: ancho });
};

// ── La tarjeta que acompaña ────────────────────────────────────────────────

const Recorrido = () => {
  const { activa, setActiva } = useAprende();
  const { session } = useSession();
  const { updateCoachPreferences } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const guia = activa ? guiaPorId(activa.id) : null;
  /* El portal del cliente es otro diseño en el monitor: cada aparato tiene sus
     pasos (ver `aparato` en el catálogo). */
  const aparato = useMediaQuery(CONSULTA_MONITOR) ? 'monitor' : 'telefono';
  const pasos = useMemo(() => pasosDe(guia, aparato), [guia, aparato]);
  const i = Math.min(activa?.paso ?? 0, Math.max(0, pasos.length - 1));
  const paso = pasos[i] || null;
  const ultimo = i === pasos.length - 1;
  /* `avanzar` lee el total desde aquí: sale de la vuelta en la que se pulsa. */
  const total = useRef(0);
  total.current = pasos.length;
  const donde = guia && paso ? dondeDelPaso(guia, paso, activa.cliente) : null;
  /* La guía de una pantalla vale para la pantalla, no para una ruta: la
     librería son dos (ejercicios y alimentos), y la ficha es la de cualquier
     cliente. */
  const enSuPantalla = guia?.pantalla
    ? guiaDeLaPantalla(location.pathname)?.id === guia.id
    : !donde || location.pathname === donde;
  /* El sondeo lo lee de aquí y no de sus dependencias: si cambiar de pantalla
     lo reiniciara, se perdería la cuenta de lo que había al llegar, y el paso
     que se hace navegando —«Empieza aquí» abre el alta— no avanzaría nunca. */
  const enPantalla = useRef(enSuPantalla);
  enPantalla.current = enSuPantalla;

  const [rect, setRect] = useState(null);
  const [perdido, setPerdido] = useState(false);
  /* Lo que el paso pide ya está en pantalla: su `hecho` o su `listo`. */
  const [cumplido, setCumplido] = useState(false);
  const [pos, setPos] = useState(null);
  const objetivo = useRef(null);
  const tarjeta = useRef(null);

  const avanzar = useCallback(
    (desde) =>
      setActiva((a) => {
        if (!a || a.paso !== desde) return a;
        if (desde >= total.current - 1) {
          marcarGuiaHecha(session?.user?.id, a.id);
          return null;
        }
        return { ...a, paso: desde + 1, hasta: Math.max(a.hasta ?? 0, desde + 1) };
      }),
    [setActiva, session?.user?.id]
  );

  const retroceder = () => setActiva((a) => (a && a.paso > 0 ? { ...a, paso: a.paso - 1 } : a));
  const cerrar = () => setActiva(null);

  /* Y se va con ella. Salir de la pantalla es haber hecho lo que pedía
     —«Poner tarifas» lleva a la cartera, «Nuevo cliente» también— o haberse
     ido a otra cosa; en los dos casos, lo que queda de la guía habla de una
     pantalla que ya no está delante. La siguiente trae la suya. */
  const fuera = Boolean(guia?.pantalla) && !enSuPantalla;
  useEffect(() => {
    if (fuera) setActiva(null);
  }, [fuera, setActiva]);

  /* Buscar lo señalado mientras dure el paso. Se sondea en vez de observar el
     DOM porque lo que se busca aparece al navegar, al abrir una ventana o al
     terminar de cargar, y cinco consultas cada 200 ms no se notan. */
  useEffect(() => {
    if (!paso) return undefined;
    const t0 = Date.now();
    /* Cuándo se pidió el último desplazamiento hasta lo señalado, y cuántos.
       Uno suave lo corta cualquier otro —el foco que devuelve una ventana al
       cerrarse, sin ir más lejos—, así que se reintenta un par de veces. */
    let desplazado = 0;
    let intentos = 0;
    /* Lo hecho que ya estaba al llegar al paso —la ficha abierta al volver
       atrás, la semana ya entregada— deja seguir, pero no empuja: saltarse el
       paso sin que se lea es lo que pasaría si avanzara solo. Lo que empuja es
       que aparezca uno MÁS mientras el paso está delante: la hoja nueva junto a
       las que ya había, la serie que se acaba de apuntar. */
    let hechosAlLlegar = null;
    /* Lo escrito al llegar tampoco empuja: el nombre que ya traía no es algo
       que se acabe de hacer. */
    let escritoAlLlegar = null;
    let enSuPantallaDesde = null;
    /* Y solo empuja lo que ha hecho la persona. Una pantalla recién abierta
       pinta primero la lista y un momento después el tic del peso que ya
       estaba apuntado: sin esto, eso contaba como recién hecho y el paso se
       saltaba solo. Lo que se toca en la propia tarjeta no cuenta. */
    let tocado = false;
    const alTocar = (e) => {
      if (!e.target?.closest?.('.aprende-capa')) tocado = true;
    };
    document.addEventListener('pointerdown', alTocar, true);
    document.addEventListener('keydown', alTocar, true);
    setRect(null);
    setPerdido(false);
    setCumplido(false);
    objetivo.current = null;

    const mirar = () => {
      const el = encontrar(paso.senal);
      /* Lo que había «al llegar» se cuenta cuando la pantalla del paso ya está,
         o sea cuando aparece lo que señala. Contado antes —la guía acaba de
         navegar y la pantalla todavía carga—, lo que ya estaba hecho parecería
         recién hecho y el paso se saltaría solo. */
      let logrado = false;
      if (paso.hecho) {
        const n = encontrarTodos(paso.hecho).length;
        if (hechosAlLlegar === null) {
          if (el) hechosAlLlegar = n;
        } else if (n > hechosAlLlegar && tocado) {
          avanzar(i);
          return;
        } else hechosAlLlegar = n;
        logrado = !paso.nuevo && n > 0;
      }
      if (paso.listo) {
        const escrito = cumple(paso.listo);
        if (escritoAlLlegar === null) {
          if (el) escritoAlLlegar = escrito;
        } else if (escrito && !escritoAlLlegar && !conElFoco(paso.listo)) {
          /* Se avanza al salir de la casilla y no al teclear, que cortaría a
             media palabra: escribir su nombre y pasar al móvil es el gesto de
             «ya está». Sin haber tocado nada, es que llegó cargado. */
          if (!tocado) escritoAlLlegar = true;
          else {
            avanzar(i);
            return;
          }
        }
        if (!escrito && escritoAlLlegar) escritoAlLlegar = false;
        logrado = logrado || escrito;
      }
      setCumplido(logrado);

      objetivo.current = el;
      if (el) {
        const r = el.getBoundingClientRect();
        const fuera = r.top < 0 || r.bottom > window.innerHeight;
        if (fuera && intentos < 3 && Date.now() - desplazado > 900) {
          intentos += 1;
          desplazado = Date.now();
          el.scrollIntoView({ block: 'center', behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth' });
        }
        const nuevo = rectDe(el);
        setRect((viejo) => (mismoRect(viejo, nuevo) ? viejo : nuevo));
        setPerdido(false);
        return;
      }
      setRect(null);
      /* El tiempo cuenta desde que se está en su pantalla: recién llegado a
         ella, lo que señala puede estar todavía cargando. */
      if (!enPantalla.current) enSuPantallaDesde = null;
      else if (enSuPantallaDesde === null) enSuPantallaDesde = Date.now();
      const tiempo = Date.now() - (enSuPantallaDesde ?? t0);
      /* Lo opcional depende del protocolo de cada cliente: si en su pantalla
         no está, es que a este no le toca, y el paso sobra. */
      if (paso.opcional && enPantalla.current && tiempo > 1200) {
        avanzar(i);
        return;
      }
      setPerdido(tiempo > 900);
    };

    mirar();
    const sondeo = window.setInterval(mirar, 200);
    const alMoverse = () => {
      if (objetivo.current) {
        const nuevo = rectDe(objetivo.current);
        setRect((viejo) => (mismoRect(viejo, nuevo) ? viejo : nuevo));
      }
    };
    window.addEventListener('scroll', alMoverse, true);
    window.addEventListener('resize', alMoverse);
    return () => {
      window.clearInterval(sondeo);
      document.removeEventListener('pointerdown', alTocar, true);
      document.removeEventListener('keydown', alTocar, true);
      window.removeEventListener('scroll', alMoverse, true);
      window.removeEventListener('resize', alMoverse);
    };
  }, [paso, i, avanzar]);

  /* Los pasos de pulsar avanzan al pulsar. Se escucha en captura para enterarse
     aunque el botón pare la propagación, y se avanza en la vuelta siguiente para
     no adelantarse a lo que el botón hace.

     Los que tienen `hecho` no: pulsar «Guardar» no es haber guardado —puede
     faltar un campo o fallar la red—, así que esos esperan a ver el resultado. */
  useEffect(() => {
    if (paso?.avanza !== 'clic' || paso.hecho) return undefined;
    const alPulsar = (e) => {
      if (objetivo.current && objetivo.current.contains(e.target)) window.setTimeout(() => avanzar(i), 0);
    };
    document.addEventListener('click', alPulsar, true);
    return () => document.removeEventListener('click', alPulsar, true);
  }, [paso, i, avanzar]);

  /* Colocar la tarjeta cuando cambia lo señalado o su propio alto. */
  useLayoutEffect(() => {
    if (!paso || !tarjeta.current) return;
    const alto = tarjeta.current.offsetHeight;
    setPos(colocar(rect, alto, window.innerWidth, window.innerHeight));
  }, [rect, paso, perdido]);

  if (!guia || !paso) return null;
  /* Un paso opcional que en su pantalla no aparece está a punto de saltarse:
     no se enseña, que asomaría un segundo diciendo algo que a este cliente no
     le toca. */
  if (paso.opcional && !rect && enSuPantalla) return null;

  /*
    ══ «Siguiente» solo sirve para LEER ══════════════════════════════════════
    Un paso que pide algo no se pasa con «Siguiente»: se pasa haciéndolo. Si
    no, la guía se recorre entera dándole al botón y al final no hay nada
    hecho. Tres salidas, y ninguna es mentir:

      · ya está hecho (`cumplido`), o se hizo antes de volver atrás (`hasta`);
      · lo que señala no está en su pantalla (`noEsta`): no hay nadie por
        revisar, por ejemplo, y ahí no hay nada que hacer;
      · cerrar la guía.
  */
  const deHacer = paso.avanza === 'clic' || Boolean(paso.hecho) || Boolean(paso.listo);
  const noEsta = perdido && enSuPantalla;
  const libre = !deHacer || cumplido || i < (activa.hasta ?? 0) || noEsta;
  const saltar = deHacer && noEsta && !cumplido && i >= (activa.hasta ?? 0);
  const pista = libre ? '' : paso.pista || (paso.avanza === 'clic' ? 'Púlsalo para seguir' : 'Hazlo para seguir');

  return createPortal(
    <div className="aprende-capa">
      {rect && (
        <div
          className="aprende-anillo"
          aria-hidden="true"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <section
        ref={tarjeta}
        className="aprende-tarjeta"
        role="dialog"
        aria-modal="false"
        aria-labelledby="aprende-titulo"
        style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { visibility: 'hidden' }}
      >
        <header className="aprende-cab">
          <span className="aprende-guia">{guia.titulo}</span>
          {/* En la guía de una pantalla la cuenta mentiría: sus pasos
              opcionales se saltan según lo que haya, y «1 de 6» acabaría en el
              tercero. Son dos o tres, y se ven. */}
          {!guia.pantalla && (
            <span className="aprende-cuenta">
              {i + 1} de {pasos.length}
            </span>
          )}
          <button type="button" className="btn btn-icon btn-icon-compact" onClick={cerrar} aria-label="Cerrar la guía">
            <X size={15} />
          </button>
        </header>
        {!guia.pantalla && (
          <div className="aprende-barra" aria-hidden="true">
            <span style={{ width: `${((i + 1) / pasos.length) * 100}%` }} />
          </div>
        )}

        <div aria-live="polite">
          <h2 className="aprende-titulo" id="aprende-titulo">
            {paso.titulo}
          </h2>
          <p className="aprende-texto">{paso.texto}</p>
        </div>

        {/* Lo que señala está en otra pantalla: se dice, y se ofrece ir. En su
            pantalla y sin encontrarlo, un paso de leer se cuenta sin más, y uno
            de hacer se deja saltar diciendo por qué. */}
        {perdido && !enSuPantalla && donde && (
          <p className="aprende-aviso">
            Esto está en otra pantalla.
            <button type="button" className="aprende-ir" onClick={() => navigate(donde)}>
              Llévame
            </button>
          </p>
        )}
        {saltar && <p className="aprende-aviso">Ahora mismo no está aquí, así que no hay nada que hacer.</p>}

        <footer className="aprende-pie">
          {/* Las de pantalla salen solas, así que la primera tarjeta ofrece
              la salida de todas: quien ya conoce la app no tiene por qué verlas.
              Se vuelven a encender desde Ajustes › Ayuda. */}
          {guia.pantalla && i === 0 && !pista ? (
            <button
              type="button"
              className="aprende-callar"
              onClick={() => {
                updateCoachPreferences?.('aprende', { sinPantallas: true });
                cerrar();
              }}
            >
              No enseñarme más
            </button>
          ) : (
            <span className="aprende-pista">{pista}</span>
          )}
          <span className="row gap-2">
            {i > 0 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={retroceder}>
                Atrás
              </button>
            )}
            {/* En los de pulsar, el botón es el que señala: aquí no hay otro.
                En los de escribir o elegir, se ve apagado hasta que se cumple. */}
            {(libre || paso.avanza !== 'clic') && (
              <button
                type="button"
                className={`btn btn-sm ${saltar ? 'btn-secondary' : 'btn-primary'}`}
                disabled={!libre}
                onClick={() => avanzar(i)}
              >
                {saltar ? 'Saltar este paso' : ultimo ? 'Terminar' : 'Siguiente'}
              </button>
            )}
          </span>
        </footer>
      </section>
    </div>,
    document.body
  );
};

// ── Una guía en una lista ──────────────────────────────────────────────────

/**
 * La fila de una guía: su número (o ✓ si ya se hizo), qué enseña y cuántos
 * pasos tiene. La misma en el índice del cliente y en Ajustes › Ayuda.
 *
 * Las de pantalla no cuentan pasos: los opcionales se saltan según lo que
 * haya, y «4 pasos» acabaría en dos.
 */
const FilaDeGuia = ({ guia, n, hecha, cliente, aparato, onClick }) => {
  const sinCliente = guia.conCliente && !cliente;
  return (
    <li>
      <button type="button" className="aprende-fila" disabled={sinCliente} onClick={onClick}>
        <span className={`aprende-disco${hecha ? ' is-hecha' : ''}`} aria-hidden="true">
          {hecha ? <Check size={13} /> : n}
        </span>
        <span className="aprende-fila-cuerpo">
          <span className="aprende-fila-titulo">{guia.titulo}</span>
          <span className="aprende-fila-texto">
            {guia.resumen}
            {guia.conCliente && (cliente ? ` Con ${cliente.name}.` : ' Cuando tengas un cliente.')}
          </span>
        </span>
        {!guia.pantalla && (
          <span className="aprende-fila-pasos">{hecha ? 'Hecha' : `${pasosDe(guia, aparato).length} pasos`}</span>
        )}
        <ChevronRight size={15} aria-hidden="true" className="aprende-fila-flecha" />
      </button>
    </li>
  );
};

// ── El índice ──────────────────────────────────────────────────────────────

/*
  Hoy solo lo abre el CLIENTE, desde «Tú». El entrenador tiene sus guías en
  Ajustes › Ayuda (`GuiasDeAyuda`): hubo un «?» fijo junto a «Buscar» que abría
  esto, y el dueño lo quitó (19 sep) porque a quien lleva años con la app le
  estorbaba en todas las pantallas.
*/
const IndiceAprende = ({ serie }) => {
  const { indiceAbierto, cerrarIndice, empezar, clientePorDefecto } = useAprende();
  const { session } = useSession();
  const { clients } = useData();
  const hechas = indiceAbierto ? guiasHechas(session?.user?.id) : [];
  const cliente = clients?.find((c) => c.id === clientePorDefecto) || null;
  const aparato = useMediaQuery(CONSULTA_MONITOR) ? 'monitor' : 'telefono';

  return (
    <Modal
      open={indiceAbierto}
      title={serie === 'entrenador' ? 'Aprende Caveman Hub' : 'Cómo funciona'}
      sub="Cada guía te señala el botón en tu propia pantalla y avanza cuando lo pulsas."
      onClose={cerrarIndice}
    >
      <ol className="aprende-lista">
        {guiasDe(serie).map((g, n) => (
          <FilaDeGuia
            key={g.id}
            guia={g}
            n={n + 1}
            hecha={hechas.includes(g.id)}
            cliente={cliente}
            aparato={aparato}
            onClick={() => empezar(g.id)}
          />
        ))}
      </ol>
    </Modal>
  );
};

// ── Ajustes › Ayuda ────────────────────────────────────────────────────────

/**
 * Las guías del entrenador, en su sitio: Ajustes › Ayuda.
 *
 * Dos tandas: lo que se aprende a hacer (dar de alta, montar una rutina…) y la
 * guía de cada pantalla, la misma que salió sola la primera vez que entró. Una
 * de pantalla lleva a su pantalla y se abre allí. Y el interruptor de las que
 * salen solas, que es un ajuste y por eso vive aquí.
 */
export const GuiasDeAyuda = () => {
  const { empezar, clientePorDefecto } = useAprende();
  const { session } = useSession();
  const { clients } = useData();
  const { coachPrefs, updateCoachPreferences } = useApp();
  const conPantallas = pantallasEncendidas(coachPrefs?.aprende, clients);
  const hechas = guiasHechas(session?.user?.id);
  const cliente = clients?.find((c) => c.id === clientePorDefecto) || null;
  const aparato = useMediaQuery(CONSULTA_MONITOR) ? 'monitor' : 'telefono';

  return (
    <Panel className="col gap-4">
      <SectionTitle>Guías</SectionTitle>
      <p className="t-sm t-secondary">
        Cada guía te señala el botón en tu propia pantalla y avanza cuando lo pulsas.
      </p>
      <div className="ayuda-guias-tanda">
        <span className="ayuda-guias-rotulo">Paso a paso</span>
        <ol className="aprende-lista">
          {guiasDe('entrenador').map((g, n) => (
            <FilaDeGuia
              key={g.id}
              guia={g}
              n={n + 1}
              hecha={hechas.includes(g.id)}
              cliente={cliente}
              aparato={aparato}
              onClick={() => empezar(g.id)}
            />
          ))}
        </ol>
      </div>
      <div className="ayuda-guias-tanda">
        <span className="ayuda-guias-rotulo">Cada pantalla</span>
        <ol className="aprende-lista">
          {guiasDeLasPantallas().map((g, n) => (
            <FilaDeGuia
              key={g.id}
              guia={g}
              n={n + 1}
              cliente={cliente}
              aparato={aparato}
              onClick={() => empezar(g.id)}
            />
          ))}
        </ol>
      </div>
      <div className="ayuda-guias-tanda">
        <Switch
          label="Enseñarme cada pantalla la primera vez que entro"
          hint="Una guía corta que cuenta qué es y te pide lo primero que se hace ahí."
          checked={conPantallas}
          onChange={() => updateCoachPreferences?.('aprende', { sinPantallas: conPantallas })}
        />
      </div>
    </Panel>
  );
};

// ── Lo que se monta en la app ──────────────────────────────────────────────

/**
 * El índice, la tarjeta y la bienvenida del cliente.
 *
 * La bienvenida solo se abre sola al CLIENTE, y la primera vez: llega desde un
 * enlace de WhatsApp sin nadie al lado. Al entrenador no: su puesta en marcha
 * es «Por dónde empezar», que sabe por dónde va y le ofrece cada guía.
 *
 * Espera a que la barra de secciones esté en pantalla antes de empezar: detrás
 * del consentimiento o mientras carga no hay nada que señalar.
 */
export const Aprende = () => {
  const { session, isCoach, view, loading } = useSession();
  const { clients } = useData();
  const { activa, empezar, indiceAbierto } = useAprende();
  const { coachPrefs, coachPrefsReady, updateCoachPreferences } = useApp();
  const location = useLocation();
  const userId = session?.user?.id;
  const serie = isCoach && view === 'coach' ? 'entrenador' : 'cliente';

  /*
    ══ CADA PANTALLA, LA PRIMERA VEZ ═══════════════════════════════════════
    Al entrar por primera vez en una pantalla del entrenador se abre sola su
    guía (`guiaDeLaPantalla`, en el catálogo). Lo visto se guarda en SU CUENTA
    —`coachPrefs.aprende.vistas`— y no en el navegador: la misma persona en el
    móvil y en el ordenador no tiene por qué verla dos veces.

    Espera a que la pantalla esté quieta: sin otra guía delante, sin el índice
    ni una ventana abierta, y con lo primero que señala ya pintado. Llegar con
    el alta de un cliente abierta no es «quieta» para una ventana, pero sí para
    la guía de Clientes: su primer paso ES esa alta.

    Y solo a quien empieza (`pantallasEncendidas`): al que ya lleva su cartera
    no se le abren. Por eso espera también a la cartera (`loading`): sin ella,
    cualquier veterano parecería nuevo durante el primer segundo.
  */
  const aprende = coachPrefs?.aprende;
  const vistas = aprende?.vistas;
  const guiaNueva =
    serie === 'entrenador' && coachPrefsReady && !loading && pantallasEncendidas(aprende, clients)
      ? guiaDeLaPantalla(location.pathname)
      : null;
  const porVer = guiaNueva && !(vistas || []).includes(guiaNueva.id) ? guiaNueva : null;

  useEffect(() => {
    if (!porVer || activa || indiceAbierto) return undefined;
    const desde = Date.now();
    const espera = window.setInterval(() => {
      if (document.querySelector('[role="dialog"]:not(.aprende-tarjeta)')) return;
      /* Quieta = medio segundo en ella y algo de lo que enseña ya en pantalla. */
      if (Date.now() - desde < 600) return;
      const algo = porVer.pasos.some((p) => encontrar(p.senal));
      if (!algo && Date.now() - desde < 4000) return;
      window.clearInterval(espera);
      if (!algo) return;
      updateCoachPreferences('aprende', { vistas: [...(vistas || []), porVer.id] });
      empezar(porVer.id, { quedarse: true });
    }, 200);
    return () => window.clearInterval(espera);
  }, [porVer, activa, indiceAbierto, vistas, updateCoachPreferences, empezar]);

  useEffect(() => {
    if (!userId || isCoach || activa || hasSeenTour(userId)) return undefined;
    const bienvenida = guiaPorId(GUIA_BIENVENIDA_CLIENTE);
    const espera = window.setInterval(() => {
      if (!encontrar(bienvenida.pasos[0].senal)) return;
      window.clearInterval(espera);
      markTourSeen(userId);
      empezar(bienvenida.id, { quedarse: true });
    }, 500);
    return () => window.clearInterval(espera);
  }, [userId, isCoach, activa, empezar]);

  return (
    <>
      <IndiceAprende serie={serie} />
      <Recorrido />
    </>
  );
};
