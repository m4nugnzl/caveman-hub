/**
 * La fila de mando de una pantalla del cliente.
 *
 * ══ Por qué existe ══════════════════════════════════════════════════════════
 * Dentro de un cliente, la cabecera ya dice quién y la pestaña ya dice qué. El
 * «Dieta» a titular debajo de la pestaña «Dieta» lo decía por tercera vez, y
 * cada pantalla lo acompañaba de una frase de ayuda y un par de botones de caja
 * distintos. Entreno lo resolvió primero: la pestaña ES la hoja y encima va UNA
 * línea con la misma gramática siempre —a la IZQUIERDA dónde estás (pestañas,
 * título, contexto en voz baja), a la DERECHA qué puedes hacer con ello—.
 *
 * Esto es esa línea para el resto de pantallas. Un solo tipo de botón (el
 * silencioso, `btn-secondary`), un primario como mucho, los enlaces como texto
 * (`cab-accion`) y lo que se hace poco dentro de un «···» (`MenuAcciones`).
 *
 * @param titulo    Lo que se está mirando cuando no lo dice la pestaña («Semana 4»).
 * @param contexto  La línea gris: cuántas, de cuándo, cómo va.
 * @param acciones  Lo de la derecha.
 * @param children  Lo de la izquierda que no es texto: las pestañas (`MandoTabs`).
 */
export const Mando = ({ titulo, contexto, acciones, children, className = '' }) => (
  <div className={`mando${className ? ` ${className}` : ''}`}>
    <div className="mando-izq">
      {titulo && <h2 className="mando-titulo">{titulo}</h2>}
      {children}
      {contexto && <span className="mando-contexto">{contexto}</span>}
    </div>
    {acciones && <div className="mando-acciones">{acciones}</div>}
  </div>
);

/** Las pestañas de la fila: las mismas pastillas que los días de Entreno. */
export const MandoTabs = ({ label, children }) => (
  <div className="mando-tabs" role="tablist" aria-label={label}>
    {children}
  </div>
);

export const MandoTab = ({ on = false, children, ...rest }) => (
  <button type="button" role="tab" aria-selected={on} className={`mando-tab${on ? ' is-on' : ''}`} {...rest}>
    {children}
  </button>
);
