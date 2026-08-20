import { useMemo } from 'react';
import { Camera } from 'lucide-react';

import { ANGLES, angleLabel, groupByWeek, photoWeight, suggestPair, weightDelta } from '@/domain/photos';
import { metricColor } from '@/domain/metrics';
import { EmptyState, Notice, Panel, SectionTitle, StatCard } from '@/components/ui/primitives';
import { Thumb } from '@/components/photos/Thumb';

/**
 * Las fotos del cliente: SU GALERÍA, no un formulario.
 *
 * ══ Por qué aquí ya no se sube ══════════════════════════════════════════════
 *
 * Se podía subir una foto desde CUATRO sitios: aquí, en el check-in semanal, en
 * el panel del entrenador y en la biblioteca del estudio. El mismo diálogo, cuatro
 * puertas, y ninguna razón para elegir una u otra — que es la forma más segura de
 * que alguien se pregunte cuál es la buena.
 *
 * La que se queda es la del check-in, y no por descarte: el propio check-in ya
 * argumentaba que las fotos van dentro porque «tenerlas en otra pestaña hacía que
 * fueran dos tareas que se recuerdan por separado, y la segunda se olvida». Si eso
 * es cierto —y lo es—, esta pantalla no podía ser una segunda puerta.
 *
 * Lo que queda aquí es lo que el cliente de verdad no tenía: **verse**. Su
 * evolución lado a lado, sus semanas, y qué ángulos le faltan. Subir está a un
 * toque, en el nivel de al lado de esta misma sección.
 *
 * Borrar sigue sin poder hacerlo: eso es del entrenador.
 */
export const ClientPhotos = ({ client, photos: rawPhotos, history = [], onGoToCheckIn }) => {

  /*
    El peso de cada foto sale del check-in de su semana, no de un campo que el
    cliente rellenase al subirla: el mismo dato escrito dos veces acaba sin
    coincidir, y casi nunca se rellenaba.
  */
  const photos = useMemo(
    () => rawPhotos.map((p) => ({ ...p, derivedWeight: photoWeight(p, history) })),
    [rawPhotos, history]
  );

  const groups = useMemo(() => groupByWeek(photos, client.startDate), [photos, client.startDate]);
  const pair = useMemo(() => suggestPair(photos), [photos]);
  const delta = weightDelta(pair.before, pair.after, history);

  /* Lleva al sitio donde SÍ se sube, que es el check-in de al lado. Un botón que
     abriera aquí otro diálogo sería volver a tener dos puertas. */
  const irASubir = (
    <button type="button" className="btn btn-primary" onClick={onGoToCheckIn}>
      <Camera size={16} /> Hacer mi check-in
    </button>
  );

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={Camera}
        title="Todavía no tienes fotos de progreso"
        message="Se suben con tu check-in de la semana, junto al peso: así van siempre juntos y con la misma fecha. Tu entrenador las usa para ver la evolución que la báscula no cuenta."
        action={irASubir}
      />
    );
  }

  return (
    <div className="stack">
      <Panel tight className="row between wrap gap-3">
        <div>
          <h3 className="section-title">
            <Camera size={18} /> Mis fotos de progreso
          </h3>
          <p className="t-sm t-secondary">
            {photos.length} {photos.length === 1 ? 'foto' : 'fotos'} en {groups.length}{' '}
            {groups.length === 1 ? 'semana' : 'semanas'}
          </p>
        </div>
        {irASubir}
      </Panel>

      <Notice tone="info">
        Consejo: misma luz, misma distancia, misma hora del día y misma pose. Así la comparación
        refleja cambios reales y no diferencias de la foto.
      </Notice>

      {pair.before && pair.after && (
        <Panel tight className="col gap-4">
          <SectionTitle>Tu evolución</SectionTitle>

          <div className="comparison-grid">
            {[pair.before, pair.after].map((photo, index) => (
              <figure className="photo-card" key={photo.id}>
                {photo.url && <img src={photo.url} alt={`${angleLabel(photo.angle)} del ${photo.date}`} />}
                <figcaption
                  className="photo-label"
                  style={
                    index === 1
                      ? { background: 'var(--accent)', color: 'var(--accent-on)' }
                      : undefined
                  }
                >
                  {photo.week != null ? `Semana ${photo.week}` : photo.date}
                  {photo.derivedWeight != null ? ` · ${photo.derivedWeight} kg` : ''}
                </figcaption>
              </figure>
            ))}
          </div>

          {delta !== null && (
            <div className="grid-auto">
              <StatCard
                label="Variación de peso"
                value={`${delta > 0 ? '+' : ''}${delta} kg`}
                color={metricColor('weight')}
              />
              <StatCard label="Ángulo comparado" value={angleLabel(pair.after.angle)} />
            </div>
          )}
        </Panel>
      )}

      {groups.map((group) => (
        <Panel tight className="col gap-3" key={group.week ?? 'sin-semana'}>
          <div className="row between wrap gap-2">
            <strong className="t-sm">{group.label}</strong>
            <span className="t-xs t-secondary">
              {group.dateRange?.from === group.dateRange?.to
                ? group.dateRange?.from
                : `${group.dateRange?.from} – ${group.dateRange?.to}`}
            </span>
          </div>

          {/* Rejilla por clase: escrita en línea se saltaba el idioma
              `minmax(min(...))` de la hoja de estilos y nadie que la buscara
              allí la encontraba. */}
          <div className="client-photo-grid">
            {group.photos.map((photo) => (
              <figure className="photo-card" key={photo.id}>
                {photo.url ? (
                  <Thumb url={photo.url} width={320} alt={`${angleLabel(photo.angle)} del ${photo.date}`} />
                ) : (
                  <span className="row center t-xs t-tertiary" style={{ height: '100%' }}>
                    sin vista previa
                  </span>
                )}
                {/* `--fs-xs` y no 0.68rem: por debajo de 11 px el gris deja de
                    leerse en un móvil con el brillo bajo. */}
                <figcaption className="photo-label" style={{ fontSize: 'var(--fs-xs)', padding: '4px 8px' }}>
                  {angleLabel(photo.angle)}
                  {photo.derivedWeight != null ? ` · ${photo.derivedWeight} kg` : ''}
                </figcaption>
              </figure>
            ))}
          </div>
        </Panel>
      ))}

      {ANGLES.some((angle) => !photos.some((p) => p.angle === angle.id)) && (
        <Notice tone="warn">
          Te faltan ángulos por cubrir:{' '}
          {ANGLES.filter((angle) => !photos.some((p) => p.angle === angle.id))
            .map((a) => a.label.toLowerCase())
            .join(', ')}
          . Con los tres ángulos tu entrenador ve mucho mejor los cambios.
        </Notice>
      )}
    </div>
  );
};
