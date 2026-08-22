import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Check, Copy, RefreshCw, X } from 'lucide-react';

import { useActions } from '@/context/AppContext';
import { shortDate } from '@/lib/dates';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Notice, Panel } from '@/components/ui/primitives';

/**
 * «Mi calendario» — el portal del cliente.
 *
 * ══ Qué es y por qué no es una integración ══════════════════════════════════
 *
 * Un enlace que el cliente suscribe en su calendario —Google, Apple, Outlook, el
 * que use— y que a partir de ahí le enseña lo que tiene apuntado aquí: el
 * check-in de la semana, la cita del martes, la carrera del sábado.
 *
 * Se estudió hacerlo con la API de Google y se descartó, y el motivo está en la
 * migración 0071: pedirle permiso de calendario a CADA CLIENTE obliga a pasar la
 * verificación de Google —semanas de trámite y una pantalla de «aplicación no
 * verificada» delante de cada uno—, a guardar tokens de refresco de cientos de
 * personas, y deja fuera a quien no use Google. Un feed no necesita nada de eso.
 *
 * ── Lo que hay que decirle, y que casi nadie dice ───────────────────────────
 * Que **tarda en aparecer**. Google consulta los calendarios suscritos cada
 * varias horas, así que entre pegar el enlace y ver algo puede pasar media
 * mañana. Sin avisar, el cliente da por hecho que lo ha hecho mal y lo vuelve a
 * intentar tres veces. Por eso está escrito arriba y no en una ayuda plegada, y
 * por eso se enseña cuándo se leyó por última vez: es lo único que distingue
 * «suscrito y esperando» de «suscrito mal».
 *
 * ── Por qué va plegado ──────────────────────────────────────────────────────
 * Misma razón que `ClientPrivacy`, con la que comparte pie de pantalla: no es lo
 * que el cliente viene a hacer. Abre esto para ver su rutina.
 */
export const ClientCalendarFeed = ({ client }) => {
  const { loadCalendarFeed, createCalendarFeed, revokeCalendarFeed } = useActions();
  const confirm = useConfirm();

  const [abierto, setAbierto] = useState(false);
  const [feed, setFeed] = useState(null);
  const [cargando, setCargando] = useState(false);
  /*
    «Ya he preguntado», y NO se deduce de `feed`.

    ── El bucle infinito que esto evita ────────────────────────────────────────
    La condición del efecto era `!feed`, y no tener feed es un resultado
    perfectamente normal: es lo que devuelve el servidor para quien todavía no
    ha creado el suyo, o sea TODO cliente la primera vez. Con `!feed`, la
    respuesta dejaba el estado exactamente como estaba antes de preguntar
    —`feed` nulo, `cargando` falso—, el efecto volvía a cumplirse y se pedía otra
    vez. Sin fin. Y revocar volvía a meter en la misma rueda.

    La pregunta que gobierna el efecto no es «¿tengo feed?» sino «¿lo he
    preguntado ya?», y esa hay que guardarla aparte.
  */
  const [cargado, setCargado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState(null);

  const clientId = client?.id;

  const cargar = useCallback(async () => {
    if (!clientId) return;
    setCargando(true);
    const res = await loadCalendarFeed(clientId);
    setCargando(false);
    setCargado(true);
    if (res.ok) setFeed(res.feed);
    else setError(res.error);
  }, [clientId, loadCalendarFeed]);

  /* Solo al abrir. Es un pliegue del pie de la pantalla: consultarlo en cada
     visita al portal sería una petición por carga para algo que casi nadie
     mira. */
  useEffect(() => {
    if (abierto && !cargado && !cargando) cargar();
  }, [abierto, cargado, cargando, cargar]);

  const crear = async () => {
    setOcupado(true);
    setError(null);
    const res = await createCalendarFeed(clientId);
    setOcupado(false);
    if (!res.ok) return setError(res.error);
    setFeed({ url: res.url, lastFetchedAt: null, fetchCount: 0 });
  };

  const rotar = async () => {
    const ok = await confirm({
      title: 'Generar un enlace nuevo',
      message:
        'El enlace de ahora dejará de funcionar al momento. Si ya lo tienes suscrito en tu calendario, tendrás que quitarlo y volver a añadirlo con el nuevo.',
      confirmLabel: 'Generar otro',
    });
    if (ok) crear();
  };

  const revocar = async () => {
    const ok = await confirm({
      title: 'Dejar de compartir mi calendario',
      message:
        'El enlace dejará de funcionar. Lo que ya esté en tu calendario no se borra solo: quita también la suscripción desde tu aplicación de calendario.',
      confirmLabel: 'Dejar de compartir',
      tone: 'danger',
    });
    if (!ok) return;

    setOcupado(true);
    const res = await revokeCalendarFeed(clientId);
    setOcupado(false);
    if (!res.ok) return setError(res.error);
    setFeed(null);
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(feed.url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* Sin portapapeles —contexto no seguro, permiso denegado— el enlace sigue
         a la vista y seleccionable. Se dice, en vez de no hacer nada. */
      setError('No se ha podido copiar. Selecciona el enlace y cópialo a mano.');
    }
  };

  if (!clientId) return null;

  return (
    <Panel className="col gap-3">
      <button
        type="button"
        className="proto-toggle"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        <CalendarPlus size={16} aria-hidden="true" />
        Mi calendario
      </button>

      {abierto && (
        <div className="col gap-3">
          <p className="t-sm t-secondary">
            Añade lo que tienes apuntado aquí —tus check-ins, tus citas y tus fechas señaladas— al
            calendario que ya usas. Se actualiza solo: cuando tu entrenador cambie algo, aparece.
          </p>

          {error && <Notice tone="error">{error}</Notice>}

          {cargando && !feed ? (
            <p className="t-sm t-tertiary">Cargando…</p>
          ) : feed ? (
            <>
              <div className="col gap-2">
                <span className="section-label">Tu enlace</span>
                {/* De solo lectura y no un `<p>`: se selecciona entero de un
                    toque, que es lo que hace falta cuando el portapapeles no
                    está disponible. */}
                <input
                  type="text"
                  className="input"
                  readOnly
                  value={feed.url}
                  onFocus={(e) => e.target.select()}
                  aria-label="Enlace de tu calendario"
                />
                <div className="row gap-2 wrap">
                  <button type="button" className="btn btn-primary btn-sm" onClick={copiar}>
                    {copiado ? <Check size={14} /> : <Copy size={14} />}
                    {copiado ? 'Copiado' : 'Copiar enlace'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={rotar}
                    disabled={ocupado}
                  >
                    <RefreshCw size={14} /> Generar otro
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={revocar}
                    disabled={ocupado}
                  >
                    <X size={14} /> Dejar de compartir
                  </button>
                </div>
              </div>

              <div className="col gap-2">
                <span className="section-label">Cómo se añade</span>
                <ol className="col gap-1 t-sm t-secondary" style={{ paddingLeft: '1.2em' }}>
                  <li>
                    En Google Calendar: <strong>Otros calendarios → + → Desde URL</strong>, pega el
                    enlace y añade.
                  </li>
                  <li>
                    En iPhone o Mac: <strong>Calendario → Archivo → Nueva suscripción</strong>.
                  </li>
                  <li>
                    En Outlook: <strong>Añadir calendario → Suscribirse desde la web</strong>.
                  </li>
                </ol>
              </div>

              {/*
                Lo que evita el «no funciona». Google tarda horas en pasar a leer
                un calendario suscrito, así que sin esto el cliente da por hecho
                que lo ha pegado mal.
              */}
              <p className="t-xs t-tertiary">
                {feed.fetchCount > 0
                  ? `Tu calendario lo leyó por última vez el ${shortDate(feed.lastFetchedAt)}. Se actualiza solo cada pocas horas.`
                  : 'Todavía no lo ha leído nadie. Google puede tardar varias horas en pasar a mirarlo por primera vez, así que no te preocupes si al principio no ves nada.'}
              </p>
            </>
          ) : (
            <div className="col gap-2" style={{ alignItems: 'flex-start' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={crear}
                disabled={ocupado}
              >
                <CalendarPlus size={14} /> {ocupado ? 'Creando…' : 'Crear mi enlace'}
              </button>
              <span className="t-xs t-tertiary">
                Es un enlace privado y solo tuyo. Puedes anularlo cuando quieras.
              </span>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};
