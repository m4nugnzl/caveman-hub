import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ChevronDown, ChevronRight, Download, Trash2 } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  ANGLES,
  angleLabel,
  angleShort,
  groupByWeek,
  photoFileName,
  photoWeight,
  slug,
} from '@/domain/photos';
import { shortDate } from '@/lib/dates';
import { clientPath } from '@/routes';
import { descargarComoZip, descargarFoto } from '@/lib/descargas';
import { EmptyState } from '@/components/ui/primitives';
import { Mando, MandoTab, MandoTabs } from '@/components/ui/Mando';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { fmt } from '@/lib/num';
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
 *
 * ══ Y se puede sacar de aquí, que es la mitad del trabajo ═══════════════════
 *
 * Una foto de progreso no se mira solo dentro de la aplicación: se manda por
 * WhatsApp, se mete en un documento, se guarda cuando se cierra una asesoría.
 * Hasta ahora lo único descargable era el montaje del estudio, así que para
 * quedarse una foto había que hacer una captura de pantalla — con su marco, su
 * pie y la resolución del monitor.
 *
 * Tres alcances, que son las tres veces que se pide:
 *
 *   · **una** — la que estás mirando, desde el visor o desde su miniatura.
 *   · **una semana** — el check-in entero, seis fotos, en un ZIP.
 *   · **todo** — las de toda su historia, en carpetas por semana.
 *
 * Lo hace `lib/descargas.js` y el ZIP lo escribe `lib/zip.js`, sin librerías:
 * una foto ya viene comprimida y lo que hace falta es empaquetar, no comprimir.
 */
export const PhotoArchive = () => {
  const { activeClient, progressPhotos, anthropometry, uploadProgressPhoto, deleteProgressPhoto, ensurePhotoUrls } =
    useApp();
  const confirm = useConfirm();
  const toast = useToast();

  const [subiendo, setSubiendo] = useState(false);
  const [angulo, setAngulo] = useState('all');
  const [plegadas, setPlegadas] = useState({});
  /* Qué foto se está mirando a pantalla completa, por índice del álbum. */
  const [viendo, setViendo] = useState(null);
  /*
    La descarga en curso: `{ clave, hechas, total }`. La clave dice QUIÉN la pidió
    —una semana o el archivo entero— para que la cuenta salga en ese botón y no
    en todos. Una sola a la vez: dos ZIP montándose en paralelo son el doble de
    memoria para algo que se pide una vez al mes.
  */
  const [bajando, setBajando] = useState(null);

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
          /* La foto entera viaja con su renglón del álbum: el visor solo sabe de
             URLs y pies, y para descargar hace falta el ángulo, la semana y la
             fecha con los que se le pone nombre al archivo. */
          foto: p,
          caption: [
            g.label,
            angleLabel(p.angle),
            p.date ? shortDate(p.date) : null,
            photoWeight(p, history) ? `${fmt(photoWeight(p, history), { decimals: 1 })} kg` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }))
      ),
    [carpetas, history]
  );

  /*
    LA PRIMERA CARPETA ES EL CHECK-IN INICIAL, y estaba al fondo del todo.

    Las carpetas van de la más reciente a la primera, que es el orden correcto:
    nueve de cada diez veces se viene a ver lo último. Pero la vez que no, se
    viene a por ESTA —«enséñame cómo estaba cuando empezó»—, y con un año de
    asesoría eso son cincuenta carpetas de desplazamiento.

    Así que tiene su propia puerta en la fila de mando y abre el visor
    directamente en su primera foto. No es una carpeta destacada ni un filtro
    más: es el atajo a un sitio concreto del archivo que ya existe.
  */
  const inicial = carpetas.length > 1 ? carpetas[carpetas.length - 1] : null;
  const desdeInicial = album.length - (inicial?.photos.length ?? 0);

  const nombreDe = useCallback(
    (photo) => photoFileName(photo, { clientName: activeClient?.name }),
    [activeClient?.name]
  );

  const bajarUna = async (photo, event) => {
    event?.stopPropagation();
    const res = await descargarFoto({ url: photo.url, nombre: nombreDe(photo) });
    if (!res.ok) toast({ text: res.error });
  };

  /**
   * Varias, en un ZIP.
   *
   * @param porSemana  Mete cada foto en su carpeta `semana-03/`. Para el archivo
   *   entero es lo que lo hace utilizable; para una sola semana sería una
   *   carpeta dentro de un ZIP que ya es esa semana.
   */
  const bajarVarias = async ({ clave, fotos, nombre, porSemana = false }) => {
    if (bajando) return;

    const archivos = fotos
      .filter((p) => p.url)
      .map((p) => ({
        url: p.url,
        /* La fecha del ZIP es la de la foto: así la carpeta de descargas se
           puede ordenar por fecha y sale la historia en orden. Mediodía para
           que ninguna zona horaria la mueva de día. */
        fecha: p.date ? new Date(`${p.date}T12:00:00`) : null,
        nombre:
          porSemana && p.week != null
            ? `semana-${String(p.week).padStart(2, '0')}/${nombreDe(p)}`
            : nombreDe(p),
      }));

    setBajando({ clave, hechas: 0, total: archivos.length });

    const res = await descargarComoZip({
      archivos,
      nombre,
      onProgreso: (hechas, total) => setBajando({ clave, hechas, total }),
    });

    setBajando(null);

    if (!res.ok) toast({ text: res.error });
    else if (res.fallos?.length) {
      /* El ZIP se entregó, pero incompleto: se dice cuántas faltan. Callarlo
         sería entregar un archivo con agujeros y dejar que se descubra al
         abrirlo. */
      toast({
        text: `Descargadas ${archivos.length - res.fallos.length} de ${archivos.length}. ${
          res.fallos.length === 1 ? 'Una foto no se pudo bajar' : `${res.fallos.length} no se pudieron bajar`
        }; recarga la página y prueba otra vez.`,
      });
    }
  };

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
            {/* La puerta al principio de su historia. Ver el comentario de
                `inicial`: es un atajo a un sitio del archivo, no otra vista. */}
            {inicial && (
              <button type="button" className="cab-accion" onClick={() => setViendo(desdeInicial)}>
                Check-in inicial
              </button>
            )}

            {/* El estudio es la herramienta COMPARATIVA, y se abre desde aquí:
                el archivo es donde se elige qué merece la pena comparar. */}
            {suyas.length > 1 && (
              <Link className="cab-accion is-puerta" to={clientPath(activeClient.id, 'revision/estudio')}>
                Comparar en el estudio
              </Link>
            )}

            {/* Llevarse el archivo entero se hace una vez —cuando se cierra una
                asesoría, o cuando se hace copia— así que vive en el «···». */}
            {suyas.length > 0 && (
              <MenuAcciones
                ariaLabel="Más cosas con sus fotos"
                items={[
                  {
                    label:
                      bajando?.clave === 'todo'
                        ? `Descargando ${bajando.hechas} de ${bajando.total}…`
                        : `Descargar sus ${suyas.length} fotos en un ZIP`,
                    icon: Download,
                    run: () =>
                      bajarVarias({
                        clave: 'todo',
                        /* TODAS, no las del filtro de ángulo: esto es «llévate su
                           archivo», y un archivo al que le faltan los perfiles
                           porque había un filtro puesto no es su archivo. */
                        fotos: suyas,
                        nombre: `${slug(activeClient.name)}-fotos.zip`,
                        porSemana: true,
                      }),
                  },
                ]}
              />
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

                const bajandoEsta = bajando?.clave === key;

                return (
                  <section className="carpeta" key={key}>
                    {/* El rótulo de la carpeta es DOS controles, no uno: plegar y
                        llevarse la semana. Hermanos y no anidados — un botón
                        dentro de otro es HTML inválido y el clic se va al de
                        fuera. */}
                    <div className="carpeta-fila">
                      <button
                        type="button"
                        className="carpeta-head"
                        aria-expanded={!plegada}
                        onClick={() => setPlegadas((prev) => ({ ...prev, [key]: !prev[key] }))}
                      >
                        {plegada ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                        <span className="nombre">{carpeta.label}</span>
                        {carpeta.photos[0]?.date && (
                          <span className="fecha">del {shortDate(carpeta.photos[0].date)}</span>
                        )}
                        {kg && <span className="peso">{kg} kg</span>}
                        <span className="cuenta">
                          {carpeta.photos.length} {carpeta.photos.length === 1 ? 'foto' : 'fotos'}
                        </span>
                      </button>

                      {/* Un check-in son seis fotos y se quieren las seis: por eso
                          la descarga está en la CARPETA y no solo en cada foto. */}
                      <button
                        type="button"
                        className="btn btn-icon btn-icon-compact carpeta-bajar"
                        disabled={Boolean(bajando)}
                        aria-busy={bajandoEsta || undefined}
                        aria-label={`Descargar ${carpeta.label} en un ZIP`}
                        title={bajandoEsta ? `Descargando ${bajando.hechas} de ${bajando.total}…` : 'Descargar la semana'}
                        onClick={() =>
                          bajarVarias({
                            clave: key,
                            fotos: carpeta.photos,
                            nombre: `${slug(activeClient.name)}-${slug(carpeta.label)}.zip`,
                          })
                        }
                      >
                        {bajandoEsta ? (
                          <span className="tnum t-2xs">
                            {bajando.hechas}/{bajando.total}
                          </span>
                        ) : (
                          <Download size={13} />
                        )}
                      </button>
                    </div>

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

                            {/* Los dos verbos de una foto, en el mismo canto y en
                                orden de frecuencia: bajarla se hace cada semana,
                                borrarla casi nunca — por eso la papelera queda la
                                última y en rojo, y la descarga es silenciosa. */}
                            <div className="archivo-verbos">
                              {photo.url && (
                                <button
                                  type="button"
                                  className="btn btn-icon btn-icon-compact"
                                  onClick={(e) => bajarUna(photo, e)}
                                  aria-label={`Descargar la foto ${angleLabel(photo.angle).toLowerCase()} del ${photo.date}`}
                                >
                                  <Download size={13} />
                                </button>
                              )}

                              <button
                                type="button"
                                className="btn btn-icon btn-icon-compact btn-icon-danger"
                                onClick={(e) => borrar(photo, e)}
                                aria-label={`Eliminar la foto ${angleLabel(photo.angle).toLowerCase()} del ${photo.date}`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
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
          onDescargar={(item) => bajarUna(item.foto)}
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
