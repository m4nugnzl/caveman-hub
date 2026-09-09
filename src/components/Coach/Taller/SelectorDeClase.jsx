import { MenuAcciones } from '@/components/ui/MenuAcciones';

/**
 * CÓMO SE CLASIFICA ESTO: el músculo de un ejercicio, la categoría de un
 * alimento. Una chapa con menú debajo del nombre, en la cabecera de la ficha.
 *
 * ══ Por qué no es un `<select>` ════════════════════════════════════════════
 *
 * Lo era, y ése fue el motivo de que la ficha se leyera como un formulario: un
 * control de 40 px de alto con su rótulo encima («Qué músculo trabaja»,
 * «Dónde lo pones») ocupaba 85 px para decir una palabra que además ya estaba
 * impresa dos líneas más arriba. Dos objetos para el mismo dato.
 *
 * Como chapa **es** el dato: se lee «Abdominales» y, si es tuyo, se pulsa y se
 * cambia. La misma pieza que filtra la lista tres dedos más arriba
 * (`SelectorDeGrupo`), así que la pantalla no aprende un control nuevo — y la
 * misma ley de siempre: la caja se enciende, no hay lápiz.
 *
 * ── Cuando no se puede cambiar, no es un control ──────────────────────────
 * Un menú con una sola opción que además no se puede elegir es un botón que al
 * pulsarlo no hace nada. Lo del catálogo se imprime y ya.
 *
 * @param valor      Lo que dice hoy, o `null`.
 * @param vacio      Cómo se llama el «sin clasificar» de este eje.
 * @param opciones   El vocabulario cerrado.
 * @param editable   Si no, se imprime en vez de ofrecerse.
 * @param conVacio   Si el eje admite «sin clasificar» como elección (los
 *   alimentos sí: hay comida que no cae en ninguna categoría y forzarla a una
 *   no es clasificarla. Un ejercicio siempre trabaja algo).
 */
export const SelectorDeClase = ({
  valor,
  vacio = 'Sin clasificar',
  opciones = [],
  editable = false,
  conVacio = false,
  onElegir,
  ariaLabel,
}) => {
  if (!editable) return <p className="ficha-ej-meta">{valor || vacio}</p>;

  return (
    <MenuAcciones
      clase={`chip${valor ? ' is-on' : ''}`}
      alineado="izquierda"
      ariaLabel={ariaLabel}
      label={valor || vacio}
      items={[
        ...(conVacio ? [{ label: vacio, on: !valor, run: () => onElegir(null) }, null] : []),
        ...opciones.map((op) => ({ label: op, on: valor === op, run: () => onElegir(op) })),
      ]}
    />
  );
};
