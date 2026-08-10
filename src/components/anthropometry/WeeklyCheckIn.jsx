import { useMemo, useState } from 'react';
import { Camera, Check, Trash2 } from 'lucide-react';

import { buildWeightLog, weekDates, weeklyCheckIn } from '@/domain/anthropometry';
import { ANGLE_IDS, angleLabel, photoWeek, weekFromStart } from '@/domain/photos';
import { todayISO, weekStart } from '@/lib/dates';
import { fmt, toNum } from '@/lib/num';
import { Delta } from '@/components/ui/metrics';
import { Panel } from '@/components/ui/primitives';
import { PhotoUploadDialog } from '@/components/photos/PhotoUploadDialog';

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Check-in semanal de peso.
 *
 * ── Por qué así ─────────────────────────────────────────────────────────────
 * El seguimiento de un cliente no es un pesaje suelto: es un check-in semanal.
 * Se pesa varios días, se promedia —lo que filtra la variación diaria de agua y
 * glucógeno, que puede pasar del kilo entre dos días seguidos— y ese promedio es
 * lo que se compara con la semana anterior.
 *
 * Antes había que introducir un registro completo cada vez, y el promedio no
 * existía como concepto. Aquí el cliente ve los siete días de su semana, anota
 * el peso el día que se pesa, y el promedio se calcula solo.
 *
 * Cada pesaje se guarda como un registro normal del historial, así que la
 * analítica lo ve inmediatamente: el check-in es una forma de LEER y RELLENAR la
 * semana, no un tipo de dato aparte.
 */
export const WeeklyCheckIn = ({
  history,
  onAddWeight,
  onRemoveEntry,
  audience = 'client',
  // Fotos de la semana. Opcionales: si el panel no las pasa, el bloque de fotos
  // no aparece y el check-in sigue siendo solo de peso.
  client = null,
  photos = null,
  onUpload = null,
}) => {
  const [reference, setReference] = useState(() => weekStart(todayISO()));
  const [drafts, setDrafts] = useState({});
  const [uploadOpen, setUploadOpen] = useState(false);

  const checkIn = useMemo(() => weeklyCheckIn(history, reference), [history, reference]);
  const days = useMemo(() => weekDates(checkIn.weekStart), [checkIn.weekStart]);

  const byDate = useMemo(
    () => new Map(checkIn.entries.map((entry) => [entry.date, entry])),
    [checkIn.entries]
  );

  const today = todayISO();
  const isClient = audience === 'client';

  const photoBlock = Boolean(client && photos && onUpload);

  /*
    Semana de PROGRAMA que corresponde a la semana natural que se está viendo.
    Son dos ejes distintos —las fotos se archivan por semana de programa y el
    check-in va por semana natural— y esta es la única conversión entre ellos.
  */
  const programWeek = useMemo(
    () => (client ? weekFromStart(client.startDate, checkIn.weekStart) : null),
    [client, checkIn.weekStart]
  );

  const weekPhotos = useMemo(
    () =>
      photoBlock
        ? (photos || []).filter((p) => photoWeek(p, client.startDate) === programWeek)
        : [],
    [photoBlock, photos, client, programWeek]
  );

  const missingAngles = useMemo(
    () => ANGLE_IDS.filter((id) => !weekPhotos.some((p) => p.angle === id)),
    [weekPhotos]
  );

  const shift = (weeks) => {
    const base = Date.parse(`${checkIn.weekStart}T00:00:00Z`);
    setReference(new Date(base + weeks * 7 * 86400000).toISOString().slice(0, 10));
    setDrafts({});
  };

  const commit = (date) => {
    const value = toNum(drafts[date]);
    if (value === null) return;
    onAddWeight(buildWeightLog({ date, weight: value }));
    setDrafts((d) => ({ ...d, [date]: '' }));
  };

  return (
    <Panel className="col gap-5">
      <div className="row between wrap gap-3">
        <div>
          <span className="section-label">Check-in semanal</span>
          <h3 className="section-title">Semana del {checkIn.weekStart}</h3>
        </div>

        <div className="row gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => shift(-1)}>
            Anterior
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => shift(1)}
            disabled={checkIn.weekStart >= weekStart(today)}
          >
            Siguiente
          </button>
        </div>
      </div>

      {/* Los siete días. Se anota el peso el día que toque; el resto quedan
          disponibles pero sin exigir nada. */}
      <div className="grid-auto">
        {days.map((date, index) => {
          const entry = byDate.get(date);
          const future = date > today;

          return (
            <div className="card-inset col gap-2" key={date} style={{ opacity: future ? 0.5 : 1 }}>
              <div className="row between gap-2">
                <span className="section-label">{DAY_NAMES[index]}</span>
                {date === today && <span className="badge badge-info">Hoy</span>}
              </div>

              {entry ? (
                <div className="row between gap-2">
                  <span className="metric-value" style={{ fontSize: 'var(--fs-md)' }}>
                    {fmt(entry.weight, { decimals: 1, unit: ' kg' })}
                  </span>
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-danger"
                    style={{ width: 24, height: 24 }}
                    onClick={() => onRemoveEntry(entry.id)}
                    aria-label={`Borrar el pesaje del ${date}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ) : (
                <div className="row gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input input-sm input-center"
                    placeholder="—"
                    disabled={future}
                    value={drafts[date] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [date]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && commit(date)}
                    onBlur={() => commit(date)}
                    aria-label={`Peso del ${date}`}
                  />
                  {toNum(drafts[date]) !== null && (
                    <button
                      type="button"
                      className="btn btn-icon"
                      style={{ width: 26, height: 26, color: 'var(--accent)' }}
                      onClick={() => commit(date)}
                      aria-label="Guardar"
                    >
                      <Check size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/*
        Las fotos, dentro del check-in.
        --------------------------------------------------------------------
        Un check-in no es solo pesarse: es pesarse y hacerse las fotos en las
        mismas condiciones. Tenerlas en otra pestaña hacía que fueran dos tareas
        que se recuerdan por separado, y la segunda se olvida.

        La semana que se propone es la de programa que corresponde a la semana
        natural que se está viendo, así que si el cliente navega a una semana
        anterior para completarla, las fotos van a esa y no a la de hoy.
      */}
      {photoBlock && (
        <div className="card-inset row between wrap gap-3">
          <div className="col gap-1">
            <span className="section-label">Fotos de esta semana</span>
            <span className="t-sm">
              {weekPhotos.length === 0 ? (
                <span className="t-secondary">Ninguna todavía</span>
              ) : (
                <>
                  <strong>{weekPhotos.length}</strong>{' '}
                  {weekPhotos.length === 1 ? 'foto' : 'fotos'}
                  <span className="t-tertiary">
                    {' · '}
                    {ANGLE_IDS.filter((id) => weekPhotos.some((p) => p.angle === id))
                      .map(angleLabel)
                      .join(', ')}
                  </span>
                </>
              )}
            </span>
            {missingAngles.length > 0 && weekPhotos.length > 0 && (
              <span className="t-xs" style={{ color: 'var(--warning)' }}>
                Falta {missingAngles.map(angleLabel).join(' y ').toLowerCase()}
              </span>
            )}
          </div>

          <button
            type="button"
            className={weekPhotos.length === 0 ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setUploadOpen(true)}
          >
            <Camera size={14} />
            {weekPhotos.length === 0 ? 'Subir las fotos' : 'Añadir más'}
          </button>
        </div>
      )}

      {/* Resultado del check-in: el promedio y su variación contra la semana
          anterior, que es la cifra con la que de verdad se decide. */}
      <div className="row between wrap gap-4" style={{ paddingTop: 'var(--s3)', borderTop: '1px solid var(--hairline)' }}>
        <div className="col gap-1">
          <span className="section-label">Promedio de la semana</span>
          <div className="metric-figure">
            <span className="metric-value">{checkIn.average === null ? '—' : checkIn.average}</span>
            <span className="metric-unit">kg</span>
            <Delta value={checkIn.delta} unit=" kg" lowerIsBetter />
          </div>
          <span className="metric-foot">
            {checkIn.count === 0
              ? 'Sin pesajes esta semana.'
              : `${checkIn.count} ${checkIn.count === 1 ? 'pesaje' : 'pesajes'}` +
                (checkIn.complete
                  ? ' · media fiable'
                  : ` · con ${checkIn.target - checkIn.count} más la media es más fiable`)}
          </span>
        </div>

        {checkIn.previousAverage !== null && (
          <div className="col gap-1" style={{ alignItems: 'flex-end' }}>
            <span className="section-label">Semana anterior</span>
            <span className="row-value">{checkIn.previousAverage} kg</span>
          </div>
        )}
      </div>

      <p className="t-xs t-tertiary">
        {isClient
          ? 'Pésate por la mañana, en ayunas y después de ir al baño. Lo ideal son 3 días alternos: el promedio filtra la variación diaria de agua y es lo que de verdad indica si tu peso sube o baja.'
          : 'El promedio semanal filtra el ruido diario. Es la cifra que conviene mirar para decidir ajustes, no un pesaje suelto.'}
      </p>

      {uploadOpen && (
        <PhotoUploadDialog
          client={client}
          existingPhotos={photos || []}
          defaultWeek={programWeek}
          onUpload={onUpload}
          onClose={() => setUploadOpen(false)}
        />
      )}
    </Panel>
  );
};
