import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { UserX } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { clientProtocol } from '@/domain/protocol';
import { CLIENT_SECTIONS, destinosDeBarra, isSectionActive, sectionsFor } from '@/routes';
import { EmptyState } from '@/components/ui/primitives';
import { useDeslizarEntreDestinos } from '@/lib/useDeslizarEntreDestinos';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { SesionEnCursoProvider, useSesionEnCurso } from '@/context/SesionEnCurso';
import { OcultoProvider } from './Oculto';
import { useCicloAutomatico } from './useCicloAutomatico';
import { CarrilDelPortal } from './pc/CarrilDelPortal';
import { BarraDelPulgar } from './movil/BarraDelPulgar';

/**
 * EL MARCO DEL PORTAL — y son DOS marcos, porque son dos aparatos.
 *
 * ══ Lo que cambió el 14 de septiembre de 2026 ══════════════════════════════
 *
 * Hasta aquí el portal era UNA escritura que el CSS repartía: la misma cabecera,
 * el mismo papel y las mismas piezas, con dos o tres reglas que las estrechaban
 * en el teléfono. El dueño eligió dos prototipos distintos, uno por aparato, y
 * pidió los dos exactos:
 *
 *   · MONITOR  → `docs/estudio-cajas.html`. Cinta oscura de seis destinos,
 *     lienzo frío y rejilla de cajas con canto. Traje en `styles/portal-pc.css`.
 *   · TELÉFONO → `docs/estudio-la-app-del-cliente.html`. Sin cabecera de la
 *     casa, papel cálido, tarjeta sin canto y cuatro destinos en la barra del
 *     pulgar. Traje en `styles/portal-telefono.css`.
 *
 * No es el mismo diseño estrechado: son dos, y por eso el reparto se hace AQUÍ
 * —montando una pieza u otra— y no con una consulta de medios. Cada pantalla del
 * portal tiene su pareja en `pc/` y en `movil/`.
 *
 * ══ El corte es el del chasis (1024), no uno nuevo ═════════════════════════
 *
 * El mismo con el que ya navegaba la barra del pulgar. Una tableta a 834 px es
 * teléfono a estos efectos: se toca, y arriba no hay sitio para seis destinos
 * más la marca más la cuenta sin apretarlo todo.
 *
 * ══ Lo que NO se rediseñó, y sigue entero ══════════════════════════════════
 *
 * El alta, los formularios que le mandan, el calendario, la báscula y el archivo
 * de fotos no salen en ninguno de los dos prototipos. Se quedan con el traje de
 * la casa, envueltos en `.layout-portal` como siempre — ver `Hoja`, aquí abajo.
 * Cambiarlos «para que peguen» habría sido rediseñar a ojo cinco pantallas que
 * nadie ha mirado.
 */
export const ClientLayout = () => {
  const { activeClient, isCoach } = useApp();

  /* «Que el siguiente se abra solo al cerrar este», si lo tiene pedido. Va en el
     marco y no en la portada porque el microciclo se cierra ENTRENANDO, que es
     otra pantalla. Sin la preferencia no hace nada. Ver `useCicloAutomatico`. */
  useCicloAutomatico();

  /* El corte del chasis. Se pregunta antes de cualquier retorno: los ganchos no
     pueden quedarse a un lado de un `if`. */
  const enMonitor = useMediaQuery('(min-width: 1024px)');

  // Un perfil de cliente sin ficha vinculada no tiene datos que mostrar. Antes
  // esto tumbaba la app entera al leer `activeClient.id` sobre undefined.
  if (!activeClient) {
    return (
      <div className="layout layout-narrow">
        <EmptyState
          icon={UserX}
          title={isCoach ? 'No hay ningún cliente seleccionado' : 'Tu cuenta aún no está vinculada'}
          message={
            isCoach
              ? 'Vuelve a la vista de entrenador y selecciona un cliente para previsualizar su portal.'
              : 'Tu entrenador todavía no ha enlazado tu cuenta con tu ficha. Escríbele para que la vincule.'
          }
        />
      </div>
    );
  }

  /*
    Sus secciones, no todas. A quien solo le llevas la dieta no le aparece «Mi
    rutina» —ni arriba ni en la barra del pulgar—: una pestaña que solo puede
    decir «tu entrenador no te ha puesto rutina» no informa, promete algo que no
    va a llegar. Ver `domain/protocol.js`.
  */
  const secciones = sectionsFor(CLIENT_SECTIONS, clientProtocol(activeClient.preferences));

  return (
    /*
      ══ El proveedor de la sesión envuelve el marco ENTERO ══════════════════

      Y no la ruta de la rutina, que es donde se entrena. La barra de la sesión
      tiene que seguir en pantalla al abrir la dieta o el progreso —es el camino
      de vuelta, y el descanso sigue corriendo—, así que el estado vive por
      encima de las secciones. Montado más abajo, cada navegación lo mataría.
    */
    <SesionEnCursoProvider>
      <OcultoProvider client={activeClient}>
        {enMonitor ? (
          <Monitor secciones={secciones} />
        ) : (
          <Telefono secciones={secciones} />
        )}
      </OcultoProvider>
    </SesionEnCursoProvider>
  );
};


/**
 * EL MONITOR. El carril a la izquierda, y la página al lado.
 *
 * ── «El puesto» (15 sep 2026) ─────────────────────────────────────────────
 * Hasta aquí era una cinta de seis destinos arriba y la página debajo, y la
 * cinta se callaba entrenando. El dueño eligió el escritorio del prototipo de
 * `docs/la-sesion-manda.md` tal cual: un carril lateral que navega y además
 * dice dónde estás del bloque y qué te queda de la semana, **también mientras
 * se entrena** — en un monitor no hay pulgar que resbale sobre una pestaña, y
 * lo que el carril dice es el contexto de la sesión. Ver `CarrilDelPortal`.
 */
const Monitor = ({ secciones }) => (
  <div className="pc-portal">
    <CarrilDelPortal />
    <div className="pc-principal">
      <Paginas secciones={secciones} enMonitor />
    </div>
  </div>
);

/**
 * EL TELÉFONO. Sin cabecera, con la barra del pulgar, y en sesión sin ninguna
 * de las dos.
 *
 * Es un componente aparte porque necesita preguntar por la sesión viva y el
 * proveedor envuelve al marco: la piel del aparato cambia entrenando —el fondo
 * se apaga, la barra de los cuatro destinos se retira entera— y eso no se puede
 * leer desde el cuerpo que monta el proveedor.
 *
 * ── Y por qué la barra se va del todo mientras entrenas ───────────────────
 * No es por espacio: la barra de la sesión está arriba. Es que salir tiene que
 * ser un gesto explícito y no un resbalón del pulgar en el borde. Entrar en la
 * dieta a mitad de una serie no es algo que se haga sin querer.
 */
const Telefono = ({ secciones }) => {
  const { viva } = useSesionEnCurso();
  const { pathname } = useLocation();
  const enSesion = viva || pathname.startsWith('/mi/rutina/sesion');
  /* Cuatro destinos: Hoy · Entreno · Comer · Revisión. «Progreso» y «Tú» son
     del monitor; en el teléfono se abren desde el perfil y el avatar de «Hoy».
     Ver `soloAncho` en `CLIENT_SECTIONS`. */
  const destinos = destinosDeBarra(secciones);

  return (
    <div className={`tel-portal${enSesion ? ' tel-en-sesion' : ''}`}>
      <Paginas secciones={secciones} />
      {!enSesion && <BarraDelPulgar secciones={destinos} />}
    </div>
  );
};

/**
 * LA PÁGINA, Y EL DEDO QUE LA MUEVE.
 *
 * ══ Por qué es un componente y no un `div` con un gancho ═══════════════════
 *
 * Porque necesita preguntar por la sesión viva, y el proveedor envuelve al
 * marco. Entrenando, deslizar se APAGA — con una sesión abierta, salirse de la
 * rutina tiene que ser un gesto explícito y no el arco del pulgar al bajar por
 * la hoja. Es la misma regla por la que la barra de los destinos se retira.
 *
 * ══ Qué es «el destino siguiente» ══════════════════════════════════════════
 *
 * El orden de `CLIENT_SECTIONS` ya filtrado por sus servicios, que es
 * exactamente el que se lee en la barra de abajo. Así el gesto y la barra
 * cuentan la misma historia: a quien solo le llevas la dieta, deslizar no le
 * lleva a una rutina que no tiene.
 *
 * Estando en una subpantalla —las fotos de su evolución, su calendario— el
 * índice sigue siendo el de su sección (`isSectionActive`), así que el gesto
 * lleva al destino de al lado y no a la nada.
 *
 * ══ La entrada de la pantalla nueva ════════════════════════════════════════
 *
 * `data-entra` dura lo que dura la animación y se borra sola. Sin borrarlo, la
 * siguiente navegación POR LA BARRA heredaría la dirección del último deslizado
 * y la página entraría desde el lado equivocado.
 */
const Paginas = ({ secciones: todas, enMonitor }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { viva } = useSesionEnCurso();
  /* En la pantalla de la sesión, deslizar es de la sesión: cambia de EJERCICIO
     (`movil/PantallaSesion`). Antes de apuntar la primera serie todavía no hay
     sesión viva, y sin esta línea el mismo gesto se lo quedaban los dos a la
     vez: la hoja pasaba al ejercicio siguiente y el portal, a «Comer». */
  const enSesion = pathname.startsWith('/mi/rutina/sesion');
  /* Los del TELÉFONO, que es donde el gesto existe: deslizar tiene que llevar
     exactamente a donde lleva la barra de abajo. Ver `destinosDeBarra`. */
  const secciones = destinosDeBarra(todas);
  const [entra, setEntra] = useState(null);
  const reloj = useRef(null);

  const indice = secciones.findIndex((s) => isSectionActive(pathname, s, '/mi'));

  const ref = useDeslizarEntreDestinos({
    indice,
    total: secciones.length,
    /* Sin sesión viva y con la sección localizada. Un índice de -1 —una ruta
       del portal que no es ninguno de los cuatro destinos, como el alta— no
       tiene vecinos que enseñar. */
    activo: !enMonitor && !viva && !enSesion && indice >= 0,
    alIr: (siguiente, sentido) => {
      setEntra(sentido > 0 ? 'izq' : 'der');
      navigate(`/mi/${secciones[siguiente].path}`);
    },
  });

  useEffect(() => {
    if (!entra) return undefined;
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setEntra(null), 320);
    return () => window.clearTimeout(reloj.current);
  }, [entra, pathname]);

  return (
    <div ref={ref} className="portal-paginas" data-entra={entra || undefined}>
      <Outlet />
    </div>
  );
};

/**
 * LA HOJA DE LAS PANTALLAS QUE NO SE REDISEÑARON.
 *
 * El alta, los formularios, el calendario, la báscula y el archivo de fotos no
 * salen en ninguno de los dos prototipos, así que conservan el traje de la casa
 * y necesitan el envoltorio que antes ponía el marco para todas.
 *
 * Va aquí y no copiado en cada una para que el día que una de las cinco se
 * rediseñe baste con quitarle esta línea.
 */
export const HojaDePortal = ({ children }) => (
  <div className="layout layout-narrow layout-portal">{children}</div>
);
