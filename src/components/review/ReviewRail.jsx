import { NavLink } from 'react-router-dom';
import { Camera, ClipboardCheck, Columns2, Ruler } from 'lucide-react';

import { clientPath } from '@/routes';

/**
 * Los tres niveles de la revisión, en chips.
 *
 * ══ Por qué son tres y no dos ══════════════════════════════════════════════
 *
 * Eran dos —«Check-in» y «Fotos»— y colgaban de una entrada del carril llamada
 * «Revisión» que no llevaba a ninguna revisión: llevaba al formulario de pesajes
 * y al estudio de fotos, o sea a dónde se METEN los datos. La revisión de verdad
 * —el veredicto, la comparativa, qué le cambias y qué le dices— vivía en otra
 * entrada, llamada «Su semana», dos filas más arriba.
 *
 * Dos nombres compitiendo por el mismo trabajo, y el gesto natural del lunes
 * —«voy a revisar a Javier»— aterrizaba en el equivocado.
 *
 * Ahora hay una sección con tres niveles, como «Progreso» tiene resumen y
 * análisis: **Revisión** es donde se decide, y **Check-in** y **Fotos** son su
 * archivo — los pesajes y las medidas que se corrigen a mano, y el estudio con
 * su comparador de varias semanas y su grabador.
 *
 * ── Y este carril solo se pinta en los DOS de archivo ──────────────────────
 * En la revisión no: allí quedaba pegado encima del carril de semanas, dos filas
 * de chips idénticos significando cosas de naturaleza distinta —una elige
 * pantalla, la otra elige semana— y era de donde salía la sensación de collage.
 * Se entra al check-in y al estudio desde el bloque que enseña ese dato (ver
 * `Coach/WeekReview.jsx`), y este carril es lo que devuelve de allí: su primer
 * chip, «Revisión», es la vuelta.
 *
 * ── Sigue habiendo tres RUTAS, y ninguna se ha movido ────────────────────────
 * `/c/:id/semana`, `/c/:id/revision` y `/c/:id/revision/fotos`. Mantenerlas
 * separadas conserva el enlace directo, el botón atrás y la carga en diferido
 * del estudio, que es la pieza más pesada del producto. Fundir las URLs es la
 * fase 5 de `docs/producto.md` y tiene un precio que aquí no hay que pagar.
 *
 * ── Y por qué el portal del cliente solo tiene dos ──────────────────────────
 * Porque él no revisa: entrega. Su check-in y sus fotos son lo suyo, y la
 * respuesta de su entrenador le llega a su inicio.
 */
export const ReviewRail = ({ audience = 'coach', clientId }) => {
  const isClient = audience === 'client';

  /* El cliente vive en `/mi/…` y el entrenador en `/c/:id/…`. Nadie escribe
     estas cadenas a mano: salen de `clientPath`. */
  const to = (section = '') =>
    isClient
      ? `/mi/evolucion${section && `/${section}`}`
      : clientPath(clientId, `revision${section && `/${section}`}`);

  return (
    <nav className="rail" aria-label="Qué parte de la revisión">
      {!isClient && (
        <NavLink to={clientPath(clientId, 'semana')} className="chip" end>
          <ClipboardCheck size={13} />
          Revisión
        </NavLink>
      )}

      <NavLink to={to()} className="chip" end>
        <Ruler size={13} />
        Check-in
      </NavLink>

      <NavLink to={to('fotos')} className="chip" end>
        <Camera size={13} />
        Fotos
      </NavLink>

      {/*
        ══ Y el estudio, que es un CHIP y no una pantalla de fotos ═══════════

        «Fotos» fue el estudio de montaje, así que ver una foto y compararlas
        eran la misma URL — y ganaba la de comparar: para mirar el check-in
        inicial de alguien había que abrir el lienzo, la caché de imágenes y el
        grabador, y usar su panel de carpetas como explorador (donde pulsar una
        foto no la abre: la asigna a un hueco del collage).

        Ahora «Fotos» es el archivo y «Estudio» la herramienta. Y el estudio
        tiene su chip en vez de vivir solo detrás de un botón del archivo: sin
        él, estando dentro no había ningún chip marcado y la sección parecía
        haberse salido de sí misma.

        El cliente no lo tiene. Él no compara: entrega.
      */}
      {!isClient && (
        <NavLink to={to('estudio')} className="chip" end>
          <Columns2 size={13} />
          Estudio
        </NavLink>
      )}
    </nav>
  );
};
