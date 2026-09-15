import { localeNumber } from '@/lib/dates';

/**
 * EL FOCO DE LA SESIÓN: lo que te pide hoy, lo que llevas y el único verbo.
 *
 * ══ Lo que había, y por qué era una avería ═════════════════════════════════
 *
 * La pantalla del entreno en el escritorio se montaba con DOS anchos: el
 * encabezado de la sesión era medio texto suelto sobre el fondo, y al lado
 * colgaba una caja blanca de 300 px con las lecturas del bloque. Eso es una
 * pieza de COSTADO, y esta pantalla no tiene costado del que colgarla — de ahí
 * *«con la box esa en un sitio raro»*.
 *
 * Aquí las dos mitades son una sola tarjeta, que es lo que las ata: a la
 * izquierda lo que te pide, a la derecha lo que llevas y el verbo, y cruzándola
 * entera por abajo, una muesca por serie.
 *
 * ══ Lo que NO lleva ════════════════════════════════════════════════════════
 *
 * Veredictos. «5 de 18 series» es un hecho; «vas flojo» sería una nota, y las
 * notas las pone su entrenador (ver `la app no receta`). Y tampoco lecturas del
 * bloque: enfocar es quitar, y lo que se consulta con calma vive en «Mi
 * progreso», que es la pantalla que sí es de instrumentos.
 */
export const FocoDeLaSesion = ({
  dayName,
  ejercicios,
  series,
  hechas,
  /* Lo que ha movido hoy, en kilos. Se retira si no ha empezado: un «0 kg
     movidos» antes de la primera serie es un reproche. */
  kg = 0,
  /* La línea de abajo: lo que su entrenador dejó dicho para este día. Puede no
     existir, y entonces no hay renglón. */
  pauta = null,
  /* El único botón de la pantalla. Llega solo cuando hay algo anotado: cerrar
     una sesión en blanco no es una oferta, es un botón que no se puede aceptar
     (la ley del reposo). */
  verbo = null,
  onVerbo = null,
}) => (
  <section className="foco-sesion" aria-label="Lo que te toca hoy">
    <div className="foco-sesion-cab">
      <div className="foco-sesion-dice">
        <span className="section-label">Hoy te pide</span>
        <h3 className="foco-sesion-titulo">
          {dayName}
          {ejercicios > 0 && (
            <span className="foco-sesion-de">
              {' · '}
              {ejercicios} {ejercicios === 1 ? 'ejercicio' : 'ejercicios'}, {series} series
            </span>
          )}
        </h3>
        {pauta && <p className="t-xs t-tertiary">{pauta}</p>}
      </div>

      <div className="foco-sesion-llevas">
        <p className="foco-sesion-cifra">
          {hechas}
          <span className="foco-sesion-u"> de {series}</span>
        </p>
        <p className="t-xs t-tertiary">
          series{kg > 0 && ` · ${localeNumber(Math.round(kg))} kg movidos`}
        </p>
      </div>

      {verbo && onVerbo && (
        <button type="button" className="btn btn-primary foco-sesion-verbo" onClick={onVerbo}>
          {verbo}
        </button>
      )}
    </div>

    {/* Una muesca por serie, cruzando la tarjeta entera. No es una barra de
        progreso con su porcentaje: son dieciocho cosas que hacer y cinco
        hechas, y eso se cuenta contando. */}
    {series > 0 && (
      <div className="foco-sesion-tiras" aria-hidden="true">
        {Array.from({ length: series }, (_, i) => (
          <span key={i} className={i < hechas ? 'es-hecha' : undefined} />
        ))}
      </div>
    )}
  </section>
);
