import { Outlet, useParams } from 'react-router-dom';

import { ReviewRail } from './ReviewRail';

/**
 * Revisión: el check-in y las fotos, que son la misma tarea.
 *
 * ══ Por qué dejan de ser dos secciones ══════════════════════════════════════
 *
 * Revisar a alguien es mirar lo que ha subido —su peso de la semana y sus fotos—
 * y contestarle. Eso es UN trabajo, y estaba repartido en dos entradas del carril
 * porque son dos tablas distintas de la base de datos. La navegación estaba
 * dibujada desde el modelo de datos, no desde lo que se hace con él.
 *
 * La prueba de que el corte estaba mal es que hubo que inventar `ReviewSession`:
 * un MODO, con barra flotante, que te acompañaba por encima de la navegación de
 * sección en sección hasta que podías cerrar la revisión. Esa barra era una
 * costura, y existía porque la tarea no cabía en ninguna pantalla.
 *
 * ── Y esta sección ya no es donde se revisa ─────────────────────────────────
 * **La barra se ha ido** (ver `review/ReviewDecision.jsx`): la revisión entera
 * vive en «Su semana», con el veredicto, la comparativa de fotos, la pregunta de
 * qué le cambias y la respuesta. Lo que queda aquí es el ARCHIVO: meter y
 * corregir pesajes y medidas, ver todas sus fotos, y compararlas.
 *
 * ══ Y son TRES niveles, no dos ══════════════════════════════════════════════
 *
 *   · **Check-in** (`/revision`) — los pesajes y las medidas.
 *   · **Fotos** (`/revision/fotos`) — el archivo, en carpetas por semana.
 *   · **Estudio** (`/revision/estudio`) — el montaje y el grabador.
 *
 * Los dos últimos eran uno. «Fotos» era el estudio, así que ver una foto y
 * compararlas eran la misma URL — y ganaba la de comparar: para mirar el
 * check-in inicial de alguien había que abrir el lienzo, la caché de imágenes y
 * el grabador de pantalla, y usar el panel de carpetas que hay dentro como si
 * fuera un explorador (donde pulsar una foto no la abre: la asigna a un hueco
 * del collage).
 *
 * Son dos trabajos y ahora son dos sitios. Ver `photos/PhotoArchive.jsx`.
 *
 * ── Por qué el check-in va primero ──────────────────────────────────────────
 * Porque es el dato que decide. Las fotos cuentan lo que la báscula no ve, pero
 * lo primero que se mira al revisar una semana es cuánto pesa y cuántas veces se
 * ha pesado.
 *
 * ── Y por qué siguen siendo RUTAS y no pestañas de una sola ─────────────────
 * Conserva el enlace directo, el botón atrás y la carga en diferido de la pieza
 * pesada: el estudio son cuarenta y cinco kilobytes que ahora solo descarga quien
 * de verdad va a comparar. Las dos viejas —`/c/:id/checkins` y `/c/:id/fotos`—
 * redirigen, porque están en marcadores y en enlaces compartidos; `/fotos` cae en
 * el archivo, que es lo que su nombre promete.
 */
export const ReviewLayout = ({ audience = 'coach' }) => {
  const { clientId } = useParams();

  return (
    <div className="stack">
      <ReviewRail audience={audience} clientId={clientId} />
      <Outlet />
    </div>
  );
};
