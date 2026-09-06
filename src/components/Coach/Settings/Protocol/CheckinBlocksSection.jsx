import {
  CHECKIN_BLOCKS,
  CHECKIN_MODES,
  WEIGH_INS_MAX,
  checkinMode,
  setCheckinMode,
  setWeighIns,
  weighInsTarget,
} from '@/domain/protocol';
import { Panel, SegmentedControl } from '@/components/ui/primitives';

/**
 * Qué mide cada check-in. Es lo mismo que los módulos —qué existe para este
 * cliente— con una posición más: aquí se puede además EXIGIR.
 *
 * ══ Y cuántas veces se pesa, que hasta ahora lo decidía el código ═══════════
 *
 * El panel decía «el peso siempre se pide» y era verdad a medias: se pedían
 * TRES pesajes a la semana, escritos a mano en el dominio, y contra ese número
 * la aplicación reclamaba en ocho pantallas —«te faltan 2 pesajes» en el portal
 * del cliente, «check-in a medias» en la cartera del entrenador—.
 *
 * Reclamar el incumplimiento de una norma que nadie ha puesto es ruido con
 * aspecto de exigencia. La norma se pone aquí, y mientras no se ponga, nadie
 * dice nada. Ver `WEIGH_INS_MAX` en `domain/protocol`.
 */

/** Qué cambia para el cliente con el número elegido, en una línea. */
const diceElNumero = (n) => {
  if (n === 0) return 'No se cuentan: ni él ve pesajes pendientes ni tú su check-in a medias.';
  if (n === 1) return 'Uno a la semana. La media de la semana será ese día, con el ruido de ese día.';
  if (n === WEIGH_INS_MAX) return 'Uno cada día. Los que falten se los recuerda su portal.';
  return `${n} a la semana. Los que falten se los recuerda su portal, y tú los ves en su ficha.`;
};

/* «Ninguno» y no «0»: lo que se elige no es una cantidad de cero, es no pedirlo.
   El resto son cifras porque una cifra se lee de un vistazo en ocho posiciones. */
const OPCIONES = [
  { id: 0, label: 'Ninguno' },
  ...Array.from({ length: WEIGH_INS_MAX }, (_, i) => ({ id: i + 1, label: String(i + 1) })),
];

export const CheckinBlocksSection = ({ protocol, onSave }) => {
  const pesajes = weighInsTarget(protocol);

  return (
    <Panel
      title="Qué se mide"
      sub="El peso siempre se pide; cuántas veces, lo decides tú. Los otros dos, si los pides."
    >
      <div className="proto-blocks">
        <div className="proto-block">
          <span className="col" style={{ gap: 1, minWidth: 0 }}>
            <span className="t-sm" style={{ fontWeight: 600 }}>
              Pesajes a la semana
            </span>
            <span className="t-xs t-tertiary">
              Cuántas veces le pides que se suba a la báscula. Es lo que hace fiable la media.
            </span>
          </span>

          <SegmentedControl
            value={pesajes}
            onChange={(n) => onSave(setWeighIns(protocol, n))}
            options={OPCIONES}
            label="Pesajes que le pides a la semana"
          />

          <span className="say t-2xs t-tertiary">{diceElNumero(pesajes)}</span>
        </div>

        {CHECKIN_BLOCKS.map((bloque) => {
          const modo = checkinMode(protocol, bloque.id);
          return (
            <div className="proto-block" key={bloque.id}>
              <span className="col" style={{ gap: 1, minWidth: 0 }}>
                <span className="t-sm" style={{ fontWeight: 600 }}>
                  {bloque.label}
                </span>
                <span className="t-xs t-tertiary">{bloque.hint}</span>
              </span>

              <SegmentedControl
                value={modo}
                onChange={(siguiente) => onSave(setCheckinMode(protocol, bloque.id, siguiente))}
                options={CHECKIN_MODES.map((m) => ({ id: m.id, label: m.label }))}
                label={`Cómo se pide: ${bloque.label}`}
              />

              {/* Lo que significa el estado elegido, debajo y en una línea. Tres
                  palabras sueltas —«Obligatorio · Opcional · Apagado»— no dicen qué
                  cambia para el cliente, que es lo único que se está decidiendo. */}
              <span className="say t-2xs t-tertiary">
                {CHECKIN_MODES.find((m) => m.id === modo)?.hint}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};
