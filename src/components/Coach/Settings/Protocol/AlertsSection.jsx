import { ALERT_DAYS, ALERT_DAYS_MAX, setAlertDays } from '@/domain/protocol';
import { THRESHOLDS } from '@/domain/portfolio';
import { clampInt } from '@/lib/num';
import { Panel } from '@/components/ui/primitives';

/**
 * Cuándo avisarte de ESTA persona.
 *
 * ══ Por qué solo aparece con un cliente elegido ═════════════════════════════
 *
 * La vara es de la persona, no de la plantilla: se afina para quien entrena dos
 * días por semana o está medio de vuelta de una lesión, y «aplicar a todos» no
 * la toca (`NOT_COMPARED_KEYS`). En la plantilla no habría nada que decidir —
 * la general ya existe y se llama `THRESHOLDS`—, así que el bloque no se pinta.
 *
 * `0` —o el campo vacío— es «la vara general», no «cero días»: la misma
 * gramática que los pesajes. La pista lo dice con la cifra de serie delante,
 * que es lo que hace falta para decidir si afinar merece la pena.
 */
const GENERAL = { training: THRESHOLDS.noTraining, weight: THRESHOLDS.noWeight };

export const AlertsSection = ({ client, protocol, onSave }) => {
  if (!client) return null;

  const nombre = client.name?.split(' ')[0] || 'este cliente';

  return (
    <Panel
      title="Cuándo avisarte"
      sub={`Los días de silencio que te parecen normales en ${nombre}. Si entrena dos días por semana, la vara general avisa de semanas normales.`}
    >
      <div className="proto-blocks">
        {ALERT_DAYS.map((umbral) => {
          const suyo = protocol?.alertDays?.[umbral.id] || 0;
          return (
            <div className="proto-block" key={umbral.id}>
              <span className="col" style={{ gap: 1, minWidth: 0 }}>
                <span className="t-sm" style={{ fontWeight: 600 }}>
                  {umbral.label}
                </span>
                <span className="t-xs t-tertiary">{umbral.hint}</span>
              </span>

              <div className="row gap-2">
                <input
                  className="input input-sm input-center"
                  style={{ width: 72 }}
                  inputMode="numeric"
                  value={suyo === 0 ? '' : suyo}
                  placeholder={String(GENERAL[umbral.id])}
                  aria-label={`Días antes de avisar: ${umbral.label.toLowerCase()}`}
                  onChange={(e) => {
                    const crudo = e.target.value.trim();
                    onSave(
                      setAlertDays(
                        protocol,
                        umbral.id,
                        crudo === '' ? 0 : clampInt(crudo, 0, ALERT_DAYS_MAX, 0)
                      )
                    );
                  }}
                />
                <span className="t-xs t-tertiary" style={{ alignSelf: 'center' }}>
                  días
                </span>
              </div>

              <span className="say t-2xs t-tertiary">
                {suyo === 0
                  ? `La vara general: ${GENERAL[umbral.id]} días.`
                  : `Afinada para ${nombre}: se avisa a los ${suyo} días (la general son ${GENERAL[umbral.id]}).`}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};
