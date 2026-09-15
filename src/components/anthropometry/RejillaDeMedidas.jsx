/**
 * LO QUE SE MIDE CON UN APARATO: la rejilla de campos con su unidad.
 *
 * ══ Por qué está extraída ══════════════════════════════════════════════════
 *
 * La rellena el cliente en su revisión (`ReviewWizard`) y la ensaya su
 * entrenador antes de encenderle nada (`VistaPreviaFormulario`). Escribirla dos
 * veces sería tener dos respuestas a la misma pregunta —«¿cómo le pido una
 * glucosa?»— y la que se quedaría vieja es justo la que él mira para decidir si
 * se la pide.
 *
 * Cada campo dice SU unidad al lado, que es lo que una pregunta de escala no
 * podía hacer y toda la razón de que las medidas existan. Lo que no dice es si
 * el número está bien: la ley está en `domain/medidas.js` y esto no la rompe.
 *
 * Se escribe como TEXTO y se convierte a número al guardar: un campo numérico
 * que se pelea con la coma decimal mientras se teclea es peor que uno que
 * acepta lo que sea y lo sanea después.
 *
 * @param medidas  `{ id, label, unit, hint?, grupo?, obligatoria? }`. El `grupo`
 *   junta bajo un rótulo lo que es una sola toma y dos series —la sistólica y la
 *   diastólica—.
 * @param valores  Lo escrito, por id.
 * @param onChange `(id, texto)`.
 */
export const RejillaDeMedidas = ({ medidas = [], valores = {}, onChange, titulo = 'Lo que se mide con un aparato' }) => {
  if (medidas.length === 0) return null;

  return (
    <div className="col gap-3">
      {/* Sin rótulo cuando la pantalla ya lo dice: en el asistente de la
          revisión esto ocupa un paso entero llamado «Los aparatos», y encima
          pintaba su propia troquelada — dos rótulos seguidos diciendo lo mismo
          con distintas palabras. Es la misma regla que `title={false}` en
          `SessionFeedback`. */}
      {titulo && <h4 className="section-label">{titulo}</h4>}
      <div className="medidas-rejilla">
        {medidas.map((medida) => (
          <label className="col gap-1" key={medida.id}>
            <span className="t-xs t-secondary">
              {medida.grupo ? `${medida.grupo} · ` : ''}
              {medida.label}
              {medida.obligatoria && <span className="badge badge-warn wiz-badge">Obligatorio</span>}
            </span>
            <span className="input-suffix">
              <input
                type="text"
                inputMode="decimal"
                className="input input-sm"
                value={valores[medida.id] ?? ''}
                onChange={(e) => onChange(medida.id, e.target.value)}
                aria-label={`${medida.label} en ${medida.unit}`}
              />
              <span aria-hidden="true">{medida.unit}</span>
            </span>
            {medida.hint && <span className="t-2xs t-tertiary">{medida.hint}</span>}
          </label>
        ))}
      </div>
    </div>
  );
};
