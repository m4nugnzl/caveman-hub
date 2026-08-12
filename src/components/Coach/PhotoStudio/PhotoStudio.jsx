import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { canvasSize, isDerivedLayout } from '@/domain/photoLayout';
import { photoWeight, weekSpan, weightDelta } from '@/domain/photos';
import { EmptyState, Notice, Panel, StatCard } from '@/components/ui/primitives';
import { PhotoUploadDialog } from '@/components/photos/PhotoUploadDialog';
import { usePhotoStudio } from './usePhotoStudio';
import { useImageCache } from './useImageCache';
import { renderComposition } from './renderComposition';
import { PhotoLibrary } from './PhotoLibrary';
import { PhotoCoverage } from './PhotoCoverage';
import { StudioCanvas } from './StudioCanvas';
import { StudioToolbar } from './StudioToolbar';
import { StudioBar } from './StudioBar';
import { StudioPanel } from './StudioPanel';
import { SlotControls } from './SlotControls';
import { WeekAnglePicker } from './WeekAnglePicker';
import { ComparisonData } from './ComparisonData';
import { ReviewRecorder } from './ReviewRecorder';

/**
 * Photo Studio — comparación y montaje de fotos de progreso.
 *
 * Sustituye al antiguo comparador, que eran dos `<select>` y dos `<img>` uno al
 * lado del otro: no se podía igualar el encuadre, ni compensar la luz, ni
 * marcar nada sobre la imagen, ni exportar el resultado.
 *
 * El circuito completo: el cliente sube sus fotos desde su portal indicando
 * semana y ángulo → se guardan en el bucket privado del entrenador → aquí
 * aparecen agrupadas por semana, listas para comparar, montar y descargar.
 */
export const PhotoStudio = () => {
  const {
    activeClient,
    progressPhotos,
    anthropometry,
    uploadProgressPhoto,
    deleteProgressPhoto,
    refreshPhotoUrls,
    ensurePhotoUrls,
  } = useApp();

  /* Las fotos llegan de la carga inicial SIN enlace firmado: firmar las de toda
     la cartera al arrancar eran mil doscientos enlaces temporales para mirar los
     de un cliente. Se piden aquí, que es donde se van a ver. */
  useEffect(() => {
    ensurePhotoUrls(activeClient.id);
  }, [ensurePhotoUrls, activeClient.id]);

  const history = useMemo(
    () => anthropometry[activeClient.id]?.history || [],
    [anthropometry, activeClient.id]
  );

  /*
    Las fotos llegan con su peso ya resuelto desde el check-in de su semana.
    ------------------------------------------------------------------------
    Se calcula UNA vez aquí en lugar de en cada consumidor, para que el pie de
    foto del lienzo, la biblioteca lateral y la tarjeta de variación no puedan
    llegar a mostrar cifras distintas del mismo dato.
  */
  const photos = useMemo(
    () =>
      progressPhotos
        .filter((p) => p.clientId === activeClient.id)
        .map((p) => ({ ...p, derivedWeight: photoWeight(p, history) })),
    [progressPhotos, activeClient.id, history]
  );

  const studio = usePhotoStudio({
    photos,
    clientId: activeClient.id,
    startDate: activeClient.startDate,
  });
  const { state, photoOf } = studio;

  const canvasRef = useRef(null);
  const [pendingText, setPendingText] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  // «Ajustar» por defecto: encuadrar es lo que se hace sin parar, y las otras dos
  // pestañas se visitan una vez.
  const [panelTab, setPanelTab] = useState('adjust');

  const urls = useMemo(
    () => state.slots.map((s) => (s.photoId ? photoOf(s.photoId)?.url : null)).filter(Boolean),
    [state.slots, photoOf]
  );
  const images = useImageCache(urls);

  const size = useMemo(
    () =>
      canvasSize({
        layout: state.layout,
        count: state.slots.length,
        ratio: state.ratio,
        dims: state.dims,
      }),
    [state.layout, state.slots.length, state.ratio, state.dims]
  );

  const handleExport = useCallback(() => {
    const source = canvasRef.current;
    if (!source) return;

    // Se dibuja en un lienzo aparte para que la exportación no lleve el marco
    // del hueco activo, que es solo una ayuda visual de la vista previa.
    const output = document.createElement('canvas');
    output.width = size.width;
    output.height = size.height;

    renderComposition({
      canvas: output,
      state,
      size,
      photoOf,
      imageOf: images.get,
      preview: false,
    });

    try {
      output.toBlob((blob) => {
        if (!blob) {
          setFeedback({ tone: 'error', text: 'El navegador no pudo generar la imagen.' });
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const weeks = state.slots
          .map((s) => photoOf(s.photoId)?.week)
          .filter((w) => w != null)
          .join('-');
        link.href = url;
        link.download = `${activeClient.name.replace(/\s+/g, '-').toLowerCase()}-evolucion${weeks ? `-s${weeks}` : ''}.png`;
        link.click();
        URL.revokeObjectURL(url);
        setFeedback({ tone: 'success', text: 'Imagen descargada.' });
      }, 'image/png');
    } catch {
      // SecurityError: alguna imagen se cargó sin permiso CORS y contaminó el
      // lienzo. Se puede mirar la comparación pero no descargarla.
      setFeedback({
        tone: 'error',
        text: 'No se pudo exportar porque una de las fotos se cargó sin permisos de origen cruzado. Prueba a recargar las imágenes.',
      });
    }
  }, [activeClient.name, images.get, photoOf, size, state]);

  if (photos.length === 0) {
    return (
      <>
        <EmptyState
          icon={Camera}
          title={`${activeClient.name} no tiene fotos de progreso todavía`}
          message="Tu cliente puede subirlas desde su portal indicando la semana y el ángulo, y aparecerán aquí agrupadas por semana. También puedes subirlas tú."
          action={
            <button type="button" className="btn btn-primary btn-lg" onClick={() => setUploadOpen(true)}>
              <Camera size={17} /> Subir la primera foto
            </button>
          }
        />
        {uploadOpen && (
          <PhotoUploadDialog
            client={activeClient}
            existingPhotos={photos}
            onUpload={uploadProgressPhoto}
            onClose={() => setUploadOpen(false)}
          />
        )}
      </>
    );
  }

  /*
    Extremos de la comparación. En la matriz no son los dos primeros huecos sino
    el PRIMERO y el ÚLTIMO con foto: con seis huecos, «de la semana 1 a la 12» es
    lo que interesa, no «de la 1 a la 6».
  */
  const filled = state.slots.map((s) => photoOf(s.photoId)).filter(Boolean);
  const first = filled[0] || null;
  const second = filled.length > 1 ? filled[filled.length - 1] : null;

  const delta = weightDelta(first, second, history);
  const span = weekSpan(first, second, activeClient.startDate);

  return (
    <div className="col gap-4">
      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

      {images.failed.length > 0 && (
        <Notice
          tone="warn"
          action={
            <button type="button" className="btn btn-secondary btn-sm" onClick={refreshPhotoUrls}>
              Recargar imágenes
            </button>
          }
        >
          Algunas fotos no se han podido cargar. Puede que su enlace temporal haya caducado.
        </Notice>
      )}

      {/*
        El historial ANTES del estudio, y con sus huecos.
        --------------------------------------------------------------------
        La biblioteca lateral enseña lo que hay; esto enseña lo que falta, que es
        lo que genera trabajo: «me faltan la 5, la 7 y la 9». Una semana sin fotos
        no aparecía en ninguna parte, así que ese hueco solo se descubría al ir a
        comparar y no encontrar con qué.
      */}
      <PhotoCoverage
        photos={photos}
        startDate={activeClient.startDate}
        phone={activeClient.phone}
      />

      {/* Las decisiones sobre EL DOCUMENTO —composición, proporción, descargar—
          van arriba y en horizontal. Las que se tocan sin parar mientras trabajas
          se quedan junto al lienzo. */}
      <StudioBar
        state={state}
        onLayout={studio.setLayout}
        onRatio={studio.setRatio}
        onCaptions={studio.setShowCaptions}
        onExport={handleExport}
        exportDisabled={!images.isReady}
        exportHint={
          !images.isReady
            ? 'Esperando a que carguen las fotos…'
            : images.anyTainted
              ? 'Una foto se cargó sin permisos de origen cruzado; la descarga puede fallar.'
              : null
        }
      />

      <div className="studio">
        <div className="studio-col studio-side">
          <PhotoLibrary
            photos={photos}
            client={activeClient}
            usedPhotoIds={studio.usedPhotoIds}
            onAssign={studio.assignPhoto}
            onDelete={async (photo) => {
              const result = await deleteProgressPhoto(photo);
              if (!result.ok) setFeedback({ tone: 'error', text: result.error });
            }}
            onUpload={uploadProgressPhoto}
          />
        </div>

        <div className="studio-col">
          <StudioCanvas
            canvasRef={canvasRef}
            state={state}
            photoOf={photoOf}
            imageOf={images.get}
            imageVersion={images.version}
            onNudgeSlot={studio.nudgeSlot}
            onSliderPos={studio.setSliderPos}
            onAddAnnotation={studio.addAnnotation}
            // Al marcar dónde va un texto, el campo para escribirlo está en la
            // pestaña de anotar: se abre sola. Si no, el clic parecería no haber
            // hecho nada.
            onPickTextPosition={(point) => {
              setPendingText(point);
              setPanelTab('annotate');
            }}
          />

          {(delta !== null || span !== null) && (
            <div className="grid-auto">
              {span !== null && <StatCard label="Semanas entre fotos" value={span} color="var(--data-blue)" />}
              {delta !== null && (
                <StatCard
                  label="Variación de peso"
                  value={`${delta > 0 ? '+' : ''}${delta} kg`}
                  color={delta <= 0 ? 'var(--accent)' : 'var(--data-amber)'}
                  sub={`De ${first.derivedWeight} kg a ${second.derivedWeight} kg · según el check-in de cada semana`}
                />
              )}
              {second?.notes && (
                <Panel plain className="col gap-1">
                  <span className="stat-label">Notas</span>
                  <span className="t-sm t-secondary">{second.notes}</span>
                </Panel>
              )}
            </div>
          )}

          {/* Dos fotos lado a lado son una impresión; «cintura −5 cm» es la
              prueba. Va justo debajo del lienzo, no en la barra lateral, porque
              se lee A LA VEZ que las fotos. */}
          <ComparisonData
            before={first}
            after={second}
            history={history}
            gender={activeClient.gender}
          />
        </div>

        {/*
          Un panel, tres pestañas — no tres paneles apilados.
          --------------------------------------------------------------------
          Ver StudioPanel: los tres bloques que había aquí medían más de mil píxeles
          de alto en una columna de 272, así que el último quedaba fuera de la
          pantalla. Y no se usan a la vez: encuadrar, anotar y decidir qué fotos
          entran son tres momentos distintos del trabajo.
        */}
        <div className="studio-col studio-controls studio-side">
          <StudioPanel
            tab={panelTab}
            onTab={setPanelTab}
            layout={state.layout}
            annotationCount={state.annotations.length}
          >
            {panelTab === 'adjust' && (
              <SlotControls
                slots={state.slots}
                activeSlot={state.activeSlot}
                photoOf={photoOf}
                layout={state.layout}
                maxGridSlots={studio.maxGridSlots}
                onSelectSlot={studio.setActiveSlot}
                onUpdate={studio.updateSlot}
                onReset={studio.resetSlot}
                onRemove={studio.removeSlot}
                onAddSlot={studio.addGridSlot}
                onApplyToAll={studio.applyToAll}
                onSwap={studio.swapSlots}
              />
            )}

            {panelTab === 'annotate' && (
              <StudioToolbar
                state={state}
                onTool={studio.setTool}
                onColor={studio.setColor}
                onUndo={studio.undoAnnotation}
                onClearAnnotations={studio.clearAnnotations}
                pendingText={pendingText}
                onCommitText={(text) => {
                  studio.addAnnotation({ type: 'text', color: state.color, text, points: [pendingText] });
                  setPendingText(null);
                }}
                onCancelText={() => setPendingText(null)}
              />
            )}

            {panelTab === 'compose' &&
              // En la matriz los huecos no se eligen a mano: se marcan semanas y
              // ángulos y la cuadrícula se monta sola. En las demás composiciones
              // el montaje es asignar fotos a huecos, y eso ya lo hace la
              // biblioteca de la izquierda.
              (isDerivedLayout(state.layout) ? (
                <WeekAnglePicker
                  weeks={studio.weeks}
                  angles={studio.angles}
                  pickedWeeks={studio.pickedWeeks}
                  pickedAngles={studio.pickedAngles}
                  onToggleWeek={studio.toggleWeek}
                  onToggleAngle={studio.toggleAngle}
                  matrix={studio.matrix}
                />
              ) : (
                <p className="t-sm t-secondary">
                  En esta composición los huecos se llenan pulsando las fotos de la biblioteca. Elige
                  «Semanas × ángulos» arriba si quieres que la cuadrícula se monte sola.
                </p>
              ))}
          </StudioPanel>
        </div>
      </div>

      {/* Grabar es una tarea distinta de montar, con su propio principio y fin, y
          en una columna de 290 px no cabía ni la vista previa. A ancho completo y
          al final, que es cuando se hace: primero se prepara el montaje. */}
      <ReviewRecorder client={activeClient} canvasRef={canvasRef} />
    </div>
  );
};
