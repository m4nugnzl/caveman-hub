import { Logo } from './Logo';

/**
 * El esqueleto de arranque: lo que se ve mientras llegan la sesión y los datos.
 *
 * ══ Por qué existe ══════════════════════════════════════════════════════════
 *
 * Era un «Cargando…» en texto plano sobre el lienzo vacío — y es lo primero que
 * ve TODO usuario, en TODAS las sesiones. Una herramienta que arranca enseñando
 * una línea gris se siente frágil antes de haber hecho nada.
 *
 * El esqueleto enseña la promesa de la estructura: la marca real arriba —que es
 * lo único que ya se sabe seguro—, y debajo huesos con las proporciones de una
 * pantalla (título, subtítulo, tarjetas). No imita a NINGUNA pantalla concreta a
 * propósito: mientras carga no se sabe si quien entra es entrenador o cliente,
 * y un esqueleto de barra lateral seguido del portal del cliente sería un salto
 * peor que el texto que sustituye.
 *
 * ── El pulso respeta `prefers-reduced-motion` ───────────────────────────────
 * Quien pide menos movimiento ve los huesos quietos, que siguen contando lo
 * mismo. Y el lector de pantalla no recibe huesos: recibe un `role="status"`
 * que dice que se está cargando.
 */
export const AppSkeleton = () => (
  <div className="boot" role="status" aria-label="Cargando la aplicación">
    <div className="boot-top">
      <Logo subtitle={null} />
      <span className="bone boot-search" aria-hidden="true" />
      <span className="bone boot-avatar" aria-hidden="true" />
    </div>

    <div className="boot-main" aria-hidden="true">
      <span className="bone boot-title" />
      <span className="bone boot-sub" />
      <div className="boot-cards">
        <span className="bone boot-card" />
        <span className="bone boot-card" />
        <span className="bone boot-card" />
      </div>
      <span className="bone boot-panel" />
    </div>
  </div>
);
