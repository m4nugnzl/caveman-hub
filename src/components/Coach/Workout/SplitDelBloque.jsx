import { RitmoDelMicrociclo } from './RitmoDelMicrociclo';

/**
 * EL SPLIT DEL BLOQUE, en la barra de Entreno (24 sep 2026).
 *
 *     Bloques › Bloque 1 ⌄ ABIERTO │ M1 M2 [M3] + microciclo   Push Pull Legs · 4 días ⌄   + hoja
 *
 * Solo el NOMBRE del split. Fue primero un renglón propio bajo la barra, con
 * una casilla por día; el dueño lo quiso de vuelta en una línea: las hojas ya
 * dicen su día en el rótulo de su columna y los descansos se sobrentienden.
 * Qué hoja cae en cada día se ve al pulsar: abre el editor del microciclo
 * (`RitmoDelMicrociclo`), con el campo del nombre arriba.
 *
 * Ocupa el sitio de los puntos del ritmo, que abrían la misma capa. Cuando la
 * fila no cabe (`data-aprieta`), el nombre largo cede al corto («PPL 2-1»).
 *
 * @param split  `splitDelBloque(...)`: `{ texto, corto, nombre, deducido }`.
 * @param microciclo `{ tipo, dias }` ya leído.
 * @param editor Lo que necesita el editor (`hojas`, `onCambiar`,
 *               `onQuitarHoja`, `diaEnCurso`, `onNombrar`); sin él —bloque
 *               cerrado— el nombre solo se lee.
 */
export const SplitDelBloque = ({ split, microciclo, editor = null }) => {
  if (!microciclo) return null;
  const texto = split?.texto || null;
  if (!texto) return null;
  const corto = split?.corto || texto;

  const cara = (
    <>
      <span className="split-largo">{texto}</span>
      <span className="split-corto" aria-hidden="true">
        {corto}
      </span>
    </>
  );

  if (!editor) {
    return (
      <span className="tira-mas split-pastilla is-lectura" title={`Split: ${texto}`}>
        {cara}
      </span>
    );
  }

  return (
    <RitmoDelMicrociclo
      {...editor}
      microciclo={microciclo}
      nombre={split?.nombre || null}
      deducido={split?.deducido || null}
      clase="tira-mas split-pastilla"
      etiqueta={`Split: ${texto}. Editar el microciclo`}
      titulo="Qué hoja va cada día, y el nombre del split"
    >
      {cara}
    </RitmoDelMicrociclo>
  );
};
