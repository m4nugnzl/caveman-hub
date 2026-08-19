import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { UserX } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { clientProtocol } from '@/domain/protocol';
import { CLIENT_SECTIONS, isSectionActive, sectionsFor } from '@/routes';
import { EmptyState } from '@/components/ui/primitives';
import { BottomNav } from '@/components/ui/BottomNav';
import { ClientPrivacy } from './ClientPrivacy';

/**
 * Marco del portal del cliente: saludo, pestañas y contenido.
 *
 * Antes era `ClientPortal`, un componente de 200 líneas que decidía la pestaña
 * con `useState` y montaba los seis paneles con seis condicionales. Ahora las
 * pestañas son enlaces y cada sección es su propia ruta, así que el cliente puede
 * guardar «mi rutina» en la pantalla de inicio del móvil y el gesto de volver
 * atrás no cierra la aplicación.
 */
export const ClientLayout = () => {
  const { activeClient, isCoach } = useApp();
  const { pathname } = useLocation();

  /* El saludo y la privacidad son de la PORTADA, no del marco. Ver abajo. */
  const esInicio = pathname === '/mi' || pathname.startsWith('/mi/inicio');

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
    <div className="layout layout-narrow">
      {/*
        ══ Aquí vivió la banda de «estás previsualizando» ═════════════════════

        Era un `Panel` pasivo dentro del marco, así que no aparecía cuando el
        marco no se pintaba (coach sin cliente activo) y no ofrecía la salida.
        Ahora es `PreviewBar`, montada en `App.jsx` junto a la cabecera: cuelga
        del modo, no de esta pantalla, y lleva el botón de volver.
      */}

      {/*
        ══ El consentimiento ya no se pide DOS veces ══════════════════════════

        Aquí había un segundo panel que lo pedía otra vez y lo guardaba en un
        sitio distinto —`clients.preferences.consent`— del que usa la puerta del
        portal (`ConsentGate`, que escribe en `client_consents`). Como ninguno
        miraba donde escribía el otro, quien aceptaba en la puerta se encontraba
        la misma petición al entrar.

        Se queda la puerta, que es la que deja prueba archivada y la que ya usa el
        canje de la invitación. Ver `domain/privacy.js` y la migración 0050.
      */}

      {/*
        ══ Aquí vivió el saludo, y ya no es una tarjeta ═══════════════════════

        Fue mejorando por partes y se quedó a un paso. Primero se pintaba en las
        SIETE secciones —un móvil de 390 px gastaba la pantalla entera en dar la
        bienvenida antes de la primera serie—, y se acotó al inicio. Pero seguía
        siendo una TARJETA cuyo trabajo es titular la pantalla, y encima repetía
        dos datos que estaban justo debajo: la semana activa y el peso actual, que
        es literalmente la primera cifra del resumen.

        El resultado eran cuatro planos seguidos antes del primer dato: saludo,
        pestañas, las dos fichas de «Progreso / Análisis» y la cabecera de «Tu
        resumen». El saludo se queda —es lo único cálido del portal— pero como
        TÍTULO de la pantalla de inicio, que es lo que siempre fue. Va en
        `ClientStart`, con la misma `PageHead` que abre cualquier otra pantalla
        del producto.
      */}

      {/* Igual que en el carril del entrenador: la marca de «estás aquí» sale de
          `isSectionActive` y no del prefijo de URL, porque «Mi evolución» y «Mi
          progreso» tienen dos niveles cada una y bajar al segundo dejaba las
          pestañas sin marcar. */}
      <nav className="tabs" aria-label="Secciones de mi portal">
        {secciones.map((seccion) => {
          const { path, label, icon: Icon } = seccion;
          const activa = isSectionActive(pathname, seccion, '/mi');
          return (
            <NavLink
              key={path}
              to={`/mi/${path}`}
              className={`tab${activa ? ' active' : ''}`}
              aria-current={activa ? 'page' : undefined}
            >
              <Icon size={16} /> {label}
            </NavLink>
          );
        })}
      </nav>

      <Outlet />

      {/* Sus derechos, ejercitables por él y no pidiéndolos. Al final, plegado y
          SOLO en su inicio: estaba al pie de las siete secciones, así que quien
          bajaba del todo en su rutina se encontraba con la privacidad. No es a lo
          que viene, pero tiene que estar en un sitio, y ese es su portada. */}
      {!isCoach && esInicio && <ClientPrivacy client={activeClient} />}

      {/*
        En móvil las pestañas de arriba se ocultan y navega esta barra. No son dos
        navegaciones: es la misma lista en el sitio donde se puede usar en cada
        formato —arriba con ratón, abajo con el pulgar—. Ver `ui/BottomNav.jsx`.
      */}
      <BottomNav
        label="Secciones de mi portal"
        items={secciones.map((seccion) => ({
          to: `/mi/${seccion.path}`,
          label: seccion.short || seccion.label,
          icon: seccion.icon,
          /* Sus dos niveles cuentan como la misma sección: estando en las fotos
             de «Mi evolución», el destino tiene que seguir marcado. */
          isActive: (ruta) => isSectionActive(ruta, seccion, '/mi'),
        }))}
      />
    </div>
  );
};
