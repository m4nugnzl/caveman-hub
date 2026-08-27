import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { ANGLES, angleLabel, angleShort, groupByWeek, photoWeight } from '@/domain/photos';
import { shortDate } from '@/lib/dates';
import { clientPath } from '@/routes';
import { EmptyState } from '@/components/ui/primitives';
import { Mando, MandoTab, MandoTabs } from '@/components/ui/Mando';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Gallery } from '@/components/photos/Gallery';
import { PhotoUploadDialog } from '@/components/photos/PhotoUploadDialog';
import { Thumb } from '@/components/photos/Thumb';

/**
 * EL ARCHIVO DE FOTOS: todas las suyas, en carpetas por semana.
 *
 * ══ Por qué esto no existía y hacía falta ═══════════════════════════════════
 *
 * Existía a medias, y en el sitio equivocado. La biblioteca de carpetas por
 * semana estaba DENTRO del estudio de montaje (`PhotoStudio/PhotoLibrary`), y
 * allí pulsar una foto no la abre: **la asigna a un hueco del collage**. Así que
 * el único camino para ver el check-in inicial de alguien era entrar en la
 * herramienta de comparar, cargar su lienzo, su caché de imágenes y su grabador,
 * y usar el panel lateral como si fuera un explorador de archivos.
 *
 * Son dos cosas distintas y el producto solo tenía una:
 *
 *   · **El archivo** — «enséñame lo que ha subido este hombre». Se abre, se
 *     recorre por semanas, se mira una foto grande, se sube y se borra. Es esto.
 *   · **El estudio** — «pon estas cuatro al lado y grábame explicándolas». Es una
 *     herramienta COMPARATIVA, y se abre desde aquí con lo que quieras comparar.
 *
 * ── Y no cuesta lo que costaba ──────────────────────────────────────────────
 * Mirar una foto descargaba el estudio entero: lienzo, controles de encuadre y
 * grabador de pantalla, que es la pieza más pesada del producto. Esta pantalla
 * son miniaturas y un visor; el estudio sigue en carga diferida, detrás de su
 * botón, para quien de verdad vaya a comparar.
 *
 * ══ La forma: carpetas ══════════════════════════════════════════════════════
 *
 *     ▾ Semana 1 · del 2 mar · 84,2 kg                            6 fotos
 *       [frontal] [espalda] [lateral] [frontal] [espalda] [lateral]
 *     ▸ Semana 2 · del 9 mar                                      3 fotos
 *     ▸ Semana 3 · del 17 mar · 81,5 kg                           6 fotos
 *
 * El mismo modelo mental que una carpeta del ordenador, que es como el entrenador
 * las tiene en la cabeza. La más reciente arriba —es la que se mira nueve de cada
 * diez veces— y la primera abajo del todo, que es donde debe estar el check-in
 * inicial: el que se busca a propósito, no el que se encuentra por el camino.
 *
 * ── El peso viaja con la carpeta ────────────────────────────────────────────
 * Una foto de progreso sin el peso de ese día es media información. Sale del
 * histórico de pesajes (`photoWeight`), que ya está cargado.
 */
export const PhotoArchive = () => {
  const { activeClient, progressPhotos, anthropometry, uploadProgressPhoto, deleteProgressPhoto, ensurePhotoUrls } =
    useApp();
  const confirm = useConfirm();

  const [subiendo, setSubiendo] = useState(false);
  const [angulo, setAngulo] = useState('all');
  const [plegadas, setPlegadas] = useState({});
  /* Qué foto se está mirando a pantalla completa, por índice del álbum. */
  const [viendo, setViendo] = useState(null);

  /*
    Las fotos llegan de la carga inicial SIN enlace firmado: firmar las de toda la
    cartera al arrancar eran mil doscientos enlaces temporales para mirar los de
    un cliente. Se piden aquí, que es donde se van a ver.
  */
  useEffect(() => {
    if (activeClient?.id) ensurePhotoUrls(activeClient.id);
  }, [ensurePhotoUrls, activeClient?.id]);

  const suyas = useMemo(
    () => progressPhotos.filter((p) => p.clientId === activeClient?.id),
    [progressPhotos, activeClient?.id]
  );

  const history = useMemo(
    () => anthropometry[activeClient?.id]?.history || [],
    [anthropometry, activeClient?.id]
  );

  const filtradas = useMemo(
    () => (angulo === 'all' ? suyas : suyas.filter((p) => p.angle === angulo)),
    [suyas, angulo]
  );

  const carpetas = useMemo(
    () => groupByWeek(filtradas, activeClient?.startDate),
    [filtradas, activeClient?.startDate]
  );

  /*
    El álbum del visor: TODAS las fotos que se están viendo, en el mismo orden en
    que están en pantalla. Si «la siguiente» no fuera la de al lado, pasar fotos
    dejaría de tener sentido — y con el filtro de ángulo puesto, pasar de frontal
    a frontal es justamente lo que se quiere.
  */
  const album = useMemo(
    () =>
      carpetas.flatMap((g) =>
        g.photos.map((p) => ({
          id: p.id ?? p.path,
          url: p.url,
          caption: [
            g.label,
            angleLabel(p.angle),
            p.date ? shortDate(p.date) : null,
            photoWeight(p, history) ? `${photoWeight(p, history)} kg` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }))
      ),
    [carpetas, history]
  );

  const borrar = async (photo, event) => {
    event.stopPropagation();
    const ok = await confirm({
      title: '¿Eliminar esta foto?',
      message: `Se borrará la foto ${angleLabel(photo.angle).toLowerCase()} del ${photo.date}.`,
      detail: 'La imagen se elimina también del almacenamiento y no se puede recuperar.',
      confirmLabel: 'Eliminar foto',
      tone: 'danger',
    });
    if (ok) deleteProgressPhoto(photo);
  };

  if (!activeClient) return null;

  const nombre = activeClient.name.split(' ')[0];

  return (
    <div className="stack">
      {/* La fila de mando: los ángulos como pestañas —comparar frontales con
          frontales es la mitad del trabajo—, cuántas hay en voz baja, y a la
          derecha el estudio como enlace y subir como única acción principal. */}
      <Mando
        contexto={
          suyas.length > 0
            ? `${suyas.length} ${suyas.length === 1 ? 'foto' : 'fotos'} en ${carpetas.length} ${
                carpetas.length === 1 ? 'semana' : 'semanas'
              }`
            : `Todavía no hay ninguna foto de ${nombre}.`
        }
        acciones={
          <>
            {/* El estudio es la herramienta COMPARATIVA, y se abre desde aquí:
                el archivo es donde se elige qué merece la pena comparar. */}
            {suyas.length > 1 && (
              <Link className="cab-accion" to={clientPath(activeClient.id, 'revision/estudio')}>
                Comparar en el estudio →
              </Link>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setSubiendo(true)}>
              Subir fotos
            </button>
          </>
        }
      >
        {suyas.length > 0 && (
          <MandoTabs label="Filtrar por ángulo">
            <MandoTab on={angulo === 'all'} onClick={() => setAngulo('all')}>
              Todas
            </MandoTab>
            {ANGLES.map((a) => (
              <MandoTab key={a.id} on={angulo === a.id} onClick={() => setAngulo(a.id)}>
                {a.label}
              </MandoTab>
            ))}
          </MandoTabs>
        )}
      </Mando>

      {suyas.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="Sin fotos todavía"
          message={`${nombre} puede subirlas desde su portal cuando entrega la semana, y tú desde aquí. Cuando la báscula no se mueve, son lo único que distingue un estancamiento de una recomposición.`}
        />
      ) : (
        <>
          {carpetas.length === 0 ? (
            <p className="t-sm t-tertiary">Ninguna foto con ese ángulo.</p>
          ) : (
            <div className="carpetas">
              {carpetas.map((carpeta, iCarpeta) => {
                const key = carpeta.week ?? 'sin-semana';
                const plegada = plegadas[key];
                /* El peso de esa semana: sale de la primera foto que lo tenga
                   derivado del histórico de pesajes. */
                const kg = carpeta.photos.map((p) => photoWeight(p, history)).find(Boolean);
                /* Dónde empieza esta carpeta dentro del álbum del visor. */
                const desde = carpetas
                  .slice(0, iCarpeta)
                  .reduce((n, g) => n + g.photos.length, 0);

                return (
                  <section className="carpeta" key={key}>
                    <button
                      type="button"
                      className="carpeta-head"
                      aria-expanded={!plegada}
                      onClick={() => setPlegadas((prev) => ({ ...prev, [key]: !prev[key] }))}
                    >
                      {plegada ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      <span className="nombre">{carpeta.label}</span>
                      {carpeta.photos[0]?.date && (
                        <span className="fecha">del {shortDate(carpeta.photos[0].date)}</span>
                      )}
                      {kg && <span className="peso">{kg} kg</span>}
                      <span className="cuenta">
                        {carpeta.photos.length} {carpeta.photos.length === 1 ? 'foto' : 'fotos'}
                      </span>
                    </button>

                    {!plegada && (
                      <div className="carpeta-body">
                        {carpeta.photos.map((photo, i) => (
                          /* El botón de borrar va como HERMANO y no dentro del de
                             la miniatura: anidar controles interactivos es HTML
                             inválido y rompe la navegación por teclado. */
                          <div className="archivo-foto" key={photo.id ?? photo.path}>
                            <button
                              type="button"
                              className="archivo-abrir"
                              onClick={() => setViendo(desde + i)}
                              title={`${angleLabel(photo.angle)} · ${photo.date}`}
                            >
                              {photo.url ? (
                                <Thumb
                                  url={photo.url}
                                  width={280}
                                  alt={`${angleLabel(photo.angle)} del ${photo.date}`}
                                />
                              ) : (
                                <span className="archivo-hueco">sin vista previa</span>
                              )}
                              <span className="archivo-tag">{angleShort(photo.angle)}</span>
                            </button>

                            <button
                              type="button"
                              className="btn btn-icon btn-icon-compact btn-icon-danger archivo-borrar"
                              onClick={(e) => borrar(photo, e)}
                              aria-label={`Eliminar la foto ${angleLabel(photo.angle).toLowerCase()} del ${photo.date}`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* A pantalla completa, pasando con el dedo o con las flechas. */}
      {viendo !== null && album.length > 0 && (
        <Gallery
          items={album}
          index={viendo}
          onIndex={setViendo}
          onClose={() => setViendo(null)}
        />
      )}

      {subiendo && (
        <PhotoUploadDialog
          client={activeClient}
          existingPhotos={suyas}
          onUpload={uploadProgressPhoto}
          onClose={() => setSubiendo(false)}
        />
      )}
    </div>
  );
};
