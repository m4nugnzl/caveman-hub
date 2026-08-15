import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Check, MessageSquare, Video, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { planSnapshot } from '@/domain/reviews';
import { VIDEO_URL_HINT, parseVideoUrl } from '@/domain/video';
import { clientPath } from '@/routes';

/**
 * Revisar como MODO, no como pantalla.
 *
 * ══ El problema que resuelve ════════════════════════════════════════════════
 *
 * «Revisar» y «Ajustar» llevaban a las fotos y a la rutina, y ahí se acababa: una
 * vez dentro no había forma de cerrar la revisión ni de contestarle. Es decir, no
 * hacían nada que no hiciera entrar al cliente por el carril de siempre — y por
 * eso no aportaban nada.
 *
 * Lo que faltaba no era otra pantalla: era que **la revisión viajara contigo**.
 * Se empieza desde la cola, se mira lo que haga falta —sus fotos, su peso, su
 * rutina, su dieta—, se toca lo que haya que tocar, y se cierra desde donde estés.
 *
 * ══ Por qué una barra fija y no un diálogo ═════════════════════════════════
 *
 * Porque revisar es mirar cosas, y un diálogo tapa justo lo que hay que mirar.
 * La barra se queda abajo, ocupa 56 px y no impide navegar: es un estado, y los
 * estados se enseñan sin robar el foco.
 *
 * ── Y por qué ajustar no necesita botón ─────────────────────────────────────
 * Porque el cambio ya viaja solo. Si mientras revisas le tocas la dieta, el sello
 * automático (`persist`) hace que al cliente le aparezca «tu dieta ha cambiado»
 * en su «Hoy». No hay nada que publicar a mano: revisar y ajustar son el mismo
 * gesto visto desde los dos lados.
 */

const ReviewSessionContext = createContext(null);

export const ReviewSessionProvider = ({ children }) => {
  /** `{ clientId, name, checkInId, weekStart }` mientras se revisa; si no, null. */
  const [session, setSession] = useState(null);

  const start = useCallback((datos) => setSession(datos), []);
  const end = useCallback(() => setSession(null), []);

  const value = useMemo(() => ({ session, start, end }), [session, start, end]);

  return <ReviewSessionContext.Provider value={value}>{children}</ReviewSessionContext.Provider>;
};

export const useReviewSession = () => useContext(ReviewSessionContext) || { session: null };

/** Lo que se guarda al cerrar sin cambios. Mismo texto que en la cola. */
const SIN_CAMBIOS = 'Sin cambios: seguimos igual.';

/**
 * La barra de la revisión en curso.
 *
 * Se pinta por encima de todo mientras hay una revisión abierta, y desde ella se
 * cierra: con el visto, o contestando. Las dos cosas escriben en la nota del
 * check-in y se lo hacen llegar al cliente a su «Hoy».
 */
export const ReviewBar = () => {
  const { session, end } = useReviewSession();
  const { reviewCheckIn, submitCheckIn, createReviewUrl, publishUpdate, nutrition, workoutData } =
    useApp();
  const navigate = useNavigate();
  const [modo, setModo] = useState(null); // null | 'texto' | 'video'
  const [texto, setTexto] = useState('');
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState('');

  if (!session) return null;

  const limpiar = () => {
    setTexto('');
    setModo(null);
    setError('');
  };

  const cerrar = async (notas) => {
    setEnCurso(true);
    setError('');

    /*
      ══ Puede que no haya fila que marcar, y ese era el fallo ═════════════════

      Sin la entrega del cliente no existe fila en `check_ins`, pero la cola sí
      lo daba por listo: con la migración 0009 sin fila se aproxima con «ha hecho
      su parte» —pesajes suficientes y foto de la semana—, y en ese caso el
      identificador viene vacío.

      Resultado: «Todo ok» no escribía nada, la barra se cerraba igual y el
      cliente seguía en la cola. Parecía que el botón no hacía nada porque
      literalmente no lo hacía.

      Ahora se crea la fila y se marca revisada en el mismo gesto. Es lo correcto
      además de lo cómodo: si has mirado su semana, esa semana existe — la haya
      entregado él o no.
    */
    let id = session.checkInId;
    if (!id) {
      const creada = await submitCheckIn(session.clientId, { weekStart: session.weekStart });
      if (!creada.ok) {
        setEnCurso(false);
        setError(creada.error);
        return;
      }
      id = creada.id;
    }

    /*
      La foto del plan tal y como queda AHORA (migración 0042). Se toma al cerrar
      y no al abrir: lo que interesa guardar es lo que decidiste, no lo que había
      cuando entraste. Comparada con la de la revisión anterior es lo que produce
      el «2400 → 2200 kcal» del histórico.
    */
    const foto = planSnapshot({
      nutrition: nutrition[session.clientId],
      program: workoutData[session.clientId],
    });

    const res = await reviewCheckIn(id, notas, foto);
    setEnCurso(false);

    /*
      Si falla NO se cierra. Antes se cerraba igual —el resultado ni se miraba—,
      así que un fallo del servidor se veía exactamente igual que un éxito: la
      barra desaparecía, la revisión seguía pendiente y no había forma de saber
      por qué.
    */
    if (!res.ok) {
      setError(res.error);
      return;
    }

    limpiar();
    end();
  };

  /** Enlazar un vídeo de YouTube o Loom a esta revisión, sin salir de aquí. */
  const enlazar = async () => {
    const video = parseVideoUrl(texto);
    if (!video) {
      setError(VIDEO_URL_HINT);
      return;
    }

    setEnCurso(true);
    const res = await createReviewUrl({
      clientId: session.clientId,
      url: video.watchUrl,
      title: `Revisión de ${session.name}`,
      /*
        La semana de la REVISIÓN, no la de hoy.

        `reviewHistory` empareja cada vídeo con su fila comparando `weekStart`
        exacto, y la fila lleva el lunes del PERIODO —que con cadencia quincenal,
        o al cerrar una atrasada, no es el lunes de esta semana—. Con la de hoy,
        el vídeo se guardaba huérfano: aparecía en la lista general del cliente
        pero no en la fila que acababa de contestar, que seguía ofreciendo
        «Enlazar vídeo» como si no se hubiera hecho nada.

        `ReviewHistory.jsx` ya lo hace así en su propio enlazado.
      */
      weekStart: session.weekStart,
    });
    setEnCurso(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    publishUpdate(session.clientId, 'review');
    /* Enlazar el vídeo ES la respuesta, así que cierra la revisión: pedir además
       un «todo ok» después de haberle grabado veinte minutos sobra. */
    await cerrar('Te lo explico en el vídeo.');
  };

  return (
    <div className="review-bar" role="region" aria-label={`Revisando a ${session.name}`}>
      <div className="review-bar-inner">
        <span className="col" style={{ gap: 1, minWidth: 0 }}>
          <span className="t-2xs t-tertiary">Revisando</span>
          <strong className="t-sm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {session.name}
          </strong>
        </span>

        {modo ? (
          <form
            className="row gap-2 grow"
            style={{ minWidth: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (modo === 'video') enlazar();
              else if (texto.trim()) cerrar(texto.trim());
            }}
          >
            <input
              autoFocus
              className="input grow"
              value={texto}
              placeholder={
                modo === 'video'
                  ? 'Pega el enlace de YouTube o Loom'
                  : 'Lo que le dirías. Lo lee en su «Hoy».'
              }
              onChange={(e) => {
                setTexto(e.target.value);
                setError('');
              }}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!texto.trim() || enCurso}>
              {enCurso ? 'Enviando…' : 'Enviar'}
            </button>

            {/* Grabarlo aquí mismo no cabe en una barra —hacen falta la fuente,
                la cámara y el micro—, así que se va al grabador con la revisión
                todavía abierta: se graba, se guarda y se cierra desde la barra,
                que sigue puesta. */}
            {modo === 'video' && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(clientPath(session.clientId, 'revision/fotos'))}
              >
                <Video size={14} /> Grabarlo
              </button>
            )}

            <button type="button" className="btn btn-icon" onClick={limpiar} aria-label="Cancelar">
              <X size={15} />
            </button>
          </form>
        ) : (
          <div className="row gap-2 wrap">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={enCurso}
              onClick={() => cerrar(SIN_CAMBIOS)}
            >
              <Check size={14} /> {enCurso ? 'Guardando…' : 'Todo ok'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModo('texto')}>
              <MessageSquare size={14} /> Contestar
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModo('video')}>
              <Video size={14} /> Vídeo
            </button>
            <button type="button" className="btn btn-icon" onClick={end} aria-label="Dejarlo para luego">
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* El fallo, donde se ha pulsado. Un error de esto no puede acabar en una
          consola: es una respuesta a un cliente que se cree enviada. */}
      {error ? (
        <span className="t-2xs review-bar-hint" style={{ color: 'var(--negative)' }}>
          {error}
        </span>
      ) : (
        <span className="t-2xs t-tertiary review-bar-hint">
          Lo que ajustes ahora —dieta o rutina— le aparecerá como cambio en su portal.
        </span>
      )}
    </div>
  );
};
