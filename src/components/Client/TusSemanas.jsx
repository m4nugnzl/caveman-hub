import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { History, MessageSquare, Play, Scale, Send } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { MEDIDAS_FIJAS } from '@/domain/medidas';
import { etiquetaDeLaFoto } from '@/domain/photos';
import { clientProtocol } from '@/domain/protocol';
import { estadoDeRevision, puedeTocarLaSemana, revisionesPasadas } from '@/domain/revisionesPasadas';
import { semanasDelRastro } from '@/domain/tusSemanas';
import { localeNumber, shortDate, todayISO, weekdayName } from '@/lib/dates';
import { Fila, Grupo } from '@/components/ui/Grupo';
import { Modal } from '@/components/ui/Modal';
import { useReviewRows } from '@/components/review/useReviewRows';
import { useOculto } from './Oculto';

/**
 * «TUS SEMANAS»: lo que apuntaste, lo que entregaste y lo que te contestó,
 * semana a semana. Qué se lee y por qué, en `domain/tusSemanas.js`.
 *
 * ══ Dónde se monta ═════════════════════════════════════════════════════════
 *
 *   · En el MONITOR, al pie de la Revisión (`RevisionEnMonitor`): las cuatro
 *     últimas y «Ver todas», debajo de lo que hay que hacer.
 *   · En el TELÉFONO, en su propia pantalla (`ClientCheckInsRoute`), detrás de
 *     la fila «Semanas anteriores», con todas (`todas`).
 *
 * ── Una fila por semana, y el detalle en una ventana ──────────────────────
 * Fue una lista que se desplegaba en su sitio, con la semana abierta de salida:
 * con once semanas la Revisión se alargaba hasta perderse, filas a todo lo
 * ancho y el detalle empujando a las de debajo. El dueño pidió «reducida, con
 * popup, y con la lógica visual del resto de la página».
 *
 * Así que es la gramática de «Tu entrega», que tiene justo encima: `Grupo` con
 * filas de tesela gris, título y una línea. La tesela dice cómo quedó la
 * semana —te contestó, la entregaste o solo apuntaste— y la fila abre la
 * semana en la ventana lateral (`size="side"`, una hoja en el teléfono), con
 * «La anterior» / «La siguiente» para recorrerlas sin volver a la lista.
 *
 * ── Ni una cifra que juzgue ───────────────────────────────────────────────
 * «La anterior 61,1» y no una flecha de color: bajar no es «bien» para quien
 * gana masa, y aquí no hay nadie que lo sepa. Ver `la app no receta`.
 */

const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const cifra = (v) => (typeof v === 'number' ? localeNumber(v, { maximumFractionDigits: 1 }) : String(v));
/* Cuántas caben al pie de la Revisión antes de «Ver todas». */
const EN_LA_REVISION = 4;

const ESTADO = {
  revisada: 'revisada',
  entregada: 'entregada',
  'sin entregar': 'sin entregar',
  'por entregar': 'por entregar',
};

/*
  ══ LA ETIQUETA DE LA FILA, y el motivo en una línea (23 sep 2026) ══════════

  Una revisión que todavía se puede completar se distingue de las cerradas y
  de las que se pasaron de plazo: lleva el punto de «esto espera» —el mismo
  que la cola del entrenador— y dice «Completar». Las que ya no, dicen por
  qué en una línea: «Revisada por tu entrenador», «Cerrada por tu
  entrenador», «Fuera de plazo». Ningún color: azul invita, y aquí lo único
  que invita es el punto. Ver `la ley del color`.
*/
const etiqueta = (s) => {
  const r = s.revision;
  if (r?.completable && s.estado === 'sin entregar') return 'Completar';
  if (r && !r.editable && r.motivo && s.estado !== 'revisada') return r.motivo;
  if (s.estado === 'revisada' && r?.motivo === 'Cerrada por tu entrenador') return 'cerrada';
  if (s.estado === 'entregada' && r?.tarde?.tipo === 'recuperada') return 'entregada tarde';
  return s.estado ? ESTADO[s.estado] : null;
};

/* La línea que dice en qué punto está, dentro de la ventana. */
const lineaDeEstado = (s) => {
  const r = s.revision;
  if (r?.completable) {
    const hasta = r.hasta ? ` hasta el ${shortDate(r.hasta)}` : '';
    return s.estado === 'entregada' ? `Entregada · puedes corregirla${hasta}` : `Sin entregar · puedes completarla${hasta}`;
  }
  if (r?.motivo) return r.motivo;
  return s.estado ? ESTADO[s.estado] : null;
};
/* La tesela: gris siempre, el dibujo dice cómo quedó. Ver `la ley del color`. */
const ICONO = { revisada: MessageSquare, entregada: Send };

const titulo = (s) => (s.esta ? 'Esta semana' : `Semana del ${shortDate(s.semana)}`);

export const TusSemanas = ({ conCabecera = true, todas = false }) => {
  const {
    activeClient,
    anthropometry,
    progressPhotos,
    removeAnthropometryLog,
    updateAnthropometryLog,
    ensurePhotoUrls,
  } = useApp();
  const oculto = useOculto();
  const { rows: revisiones, checkIns } = useReviewRows(activeClient?.id);
  const navigate = useNavigate();
  /* La ventana: `null` cerrada, `{ semana: null }` la lista entera,
     `{ semana, desdeLista }` una semana. */
  const [capa, setCapa] = useState(null);

  useEffect(() => {
    if (activeClient?.id) ensurePhotoUrls(activeClient.id);
  }, [ensurePhotoUrls, activeClient?.id]);

  /* Quien llega por `#tus-semanas` —desde «Tú» o la dirección vieja— viene a
     esto: se baja hasta aquí una vez, cuando ya hay algo que enseñar. */
  const { hash } = useLocation();
  const bajado = useRef(false);
  const cabecera = useRef(null);

  const semanas = useMemo(() => {
    if (!activeClient) return [];
    const protocolo = clientProtocol(activeClient.preferences);
    const pauta = {
      entregas: checkIns,
      preferences: activeClient.preferences,
      startDate: activeClient.startDate,
      hoy: todayISO(),
    };
    return semanasDelRastro({
      history: anthropometry?.[activeClient.id]?.history || [],
      checkIns,
      revisiones,
      fotos: progressPhotos.filter((p) => p.clientId === activeClient.id),
      startDate: activeClient.startDate,
      catalogo: [...(protocolo?.medidas || []), ...MEDIDAS_FIJAS],
      hoy: todayISO(),
      revisionDe: (lunes) => estadoDeRevision({ lunes, ...pauta }),
      extras: revisionesPasadas(pauta)
        .filter((r) => r.completable)
        .map((r) => r.lunes),
    });
  }, [activeClient, anthropometry, checkIns, revisiones, progressPhotos]);

  useEffect(() => {
    if (hash !== '#tus-semanas' || bajado.current || !cabecera.current) return;
    bajado.current = true;
    cabecera.current.scrollIntoView({ block: 'start' });
  }, [hash, semanas.length]);

  if (!activeClient) return null;

  /* Lo que su entrenador le ha ocultado no sale tampoco aquí: ni el peso ni la
     medida concreta. Ver `Oculto`. */
  const visibles = (lista) => lista.filter((m) => !(m.id.startsWith('m-') && oculto.medidas?.[m.id.slice(2)]));

  /* Quitar un pesaje. Si el registro trae medidas de ese día, se vacía su peso
     y las medidas se quedan; si no, el registro se va entero. */
  const quitar = (pesaje) =>
    pesaje.conMedidas
      ? updateAnthropometryLog(activeClient.id, pesaje.id, { weight: null })
      : removeAnthropometryLog(activeClient.id, pesaje.id);

  /* La línea de la fila: lo que se viene a buscar sin abrirla. */
  const linea = (s) =>
    [
      !oculto.weight && s.media !== null ? `Media ${kg(s.media)} kg` : null,
      !oculto.weight && s.pesajes.length > 0
        ? `${s.pesajes.length} ${s.pesajes.length === 1 ? 'pesaje' : 'pesajes'}`
        : null,
      s.medidas && visibles(s.medidas.lista).length > 0 ? 'medidas' : null,
      s.fotos.length > 0 ? `${s.fotos.length} ${s.fotos.length === 1 ? 'foto' : 'fotos'}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || null;

  const filas = (lista, desdeLista) =>
    lista.map((s) => {
      const invita = Boolean(s.revision?.completable && s.estado === 'sin entregar');
      return (
        <Fila
          key={s.semana}
          icono={ICONO[s.estado] || Scale}
          title={titulo(s)}
          sub={linea(s) || (invita ? 'Sin nada apuntado' : null)}
          valor={etiqueta(s)}
          avisa={invita}
          onClick={() => setCapa({ semana: s.semana, desdeLista })}
        />
      );
    });

  /* Abrir la revisión de esa semana para completarla o corregirla: la misma
     pantalla de siempre, contra ESA semana (`useSemanaDeEntrega`). */
  const completar = (s) => navigate(`/mi/evolucion?semana=${s.revision.lunes}`);

  /* Quitar un pesaje solo donde la base lo aceptaría (0134). */
  const puedeQuitarEn = (s) =>
    puedeTocarLaSemana({
      fecha: s.semana,
      entregas: checkIns,
      preferences: activeClient.preferences,
      startDate: activeClient.startDate,
      hoy: todayISO(),
    });

  const aLaVista = todas ? semanas : semanas.slice(0, EN_LA_REVISION);
  const quedan = semanas.length - aLaVista.length;

  const i = capa?.semana ? semanas.findIndex((s) => s.semana === capa.semana) : -1;
  const abierta = i >= 0 ? semanas[i] : null;

  return (
    <section className="rastro" aria-label="Tus semanas">
      {conCabecera ? (
        <span id="tus-semanas" ref={cabecera} className="rastro-ancla" aria-hidden="true" />
      ) : null}

      {semanas.length === 0 ? (
        <Grupo title={conCabecera ? 'Tus semanas' : null}>
          <p className="rastro-nada">Cuando apuntes tu peso o entregues tu primera semana, aparecerá aquí.</p>
        </Grupo>
      ) : (
        <Grupo title={conCabecera ? 'Tus semanas' : null}>
          {filas(aLaVista, false)}
          {quedan > 0 ? (
            <Fila
              icono={History}
              title="Ver todas tus semanas"
              valor={String(semanas.length)}
              onClick={() => setCapa({ semana: null })}
            />
          ) : null}
        </Grupo>
      )}

      <Modal
        open={capa !== null}
        size="side"
        onClose={() => setCapa(null)}
        title={abierta ? titulo(abierta) : 'Tus semanas'}
        sub={abierta ? lineaDeEstado(abierta) : 'Lo que apuntaste, lo que entregaste y lo que te contestó'}
        footer={
          abierta ? (
            <div className="rastro-pie">
              {capa.desdeLista ? (
                <button type="button" className="btn btn-plain btn-sm" onClick={() => setCapa({ semana: null })}>
                  Todas tus semanas
                </button>
              ) : null}
              <span className="rastro-pie-pasos">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={i >= semanas.length - 1}
                  onClick={() => setCapa({ ...capa, semana: semanas[i + 1].semana })}
                >
                  La anterior
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={i <= 0}
                  onClick={() => setCapa({ ...capa, semana: semanas[i - 1].semana })}
                >
                  La siguiente
                </button>
              </span>
            </div>
          ) : null
        }
      >
        {abierta ? (
          <Semana
            s={abierta}
            medidas={abierta.medidas ? visibles(abierta.medidas.lista) : []}
            conPeso={!oculto.weight}
            onQuitar={puedeQuitarEn(abierta) ? quitar : null}
            onCompletar={abierta.revision?.completable && !abierta.esta ? () => completar(abierta) : null}
          />
        ) : capa ? (
          <div className="list rastro-todas">{filas(semanas, true)}</div>
        ) : null}
      </Modal>
    </section>
  );
};

/** Una semana entera, dentro de la ventana. */
const Semana = ({ s, medidas, conPeso, onQuitar, onCompletar }) => {
  const nada = !(conPeso && s.pesajes.length) && !medidas.length && !s.fotos.length && !s.respuesta;
  return (
    <div className="rastro-cuerpo">
      {/* COMPLETARLA, lo primero: es lo único que se puede HACER con una semana
          pasada. Entregada y sin revisar, el mismo gesto la corrige. */}
      {onCompletar ? (
        <div className="rastro-completar">
          <button type="button" className="btn btn-primary" onClick={onCompletar}>
            {s.estado === 'entregada' ? 'Corregir esta semana' : 'Completar esta semana'}
          </button>
          <p>
            {s.estado === 'entregada'
              ? 'Tu entrenador aún no la ha revisado. Lo que cambies le llega marcado.'
              : 'Apunta lo que te faltó: pesos de esos días, medidas, fotos. Cuenta para esta semana y no toca la de hoy.'}
          </p>
        </div>
      ) : null}

      {conPeso && s.media !== null ? (
        <div className="rastro-media">
          <span className="rastro-media-cifra tnum">
            {kg(s.media)} <small>kg de media</small>
          </span>
          {s.mediaAnterior !== null ? (
            <span className="rastro-media-antes">la semana anterior {kg(s.mediaAnterior)} kg</span>
          ) : null}
        </div>
      ) : null}

      {conPeso && s.pesajes.length > 0 ? (
        <div className="rastro-parte">
          <h4 className="rastro-rotulo">Tus pesajes</h4>
          <ul className="rastro-pesajes">
            {s.pesajes.map((p) => (
              <Pesaje key={p.id} pesaje={p} onQuitar={onQuitar ? () => onQuitar(p) : null} />
            ))}
          </ul>
        </div>
      ) : null}

      {medidas.length > 0 ? (
        <div className="rastro-parte">
          <h4 className="rastro-rotulo">Tus medidas · {shortDate(s.medidas.fecha)}</h4>
          <dl className="rastro-medidas">
            {medidas.map((m) => (
              <div key={m.id}>
                <dt>{m.etiqueta}</dt>
                <dd>
                  {cifra(m.valor)}
                  {m.unidad ? ` ${m.unidad}` : ''}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {s.fotos.length > 0 ? (
        <div className="rastro-parte">
          <h4 className="rastro-rotulo">Tus fotos</h4>
          <ul className="rastro-fotos">
            {s.fotos.map((f) => (
              <li key={f.id}>
                {f.url ? (
                  <img src={f.url} alt={`Tu foto ${etiquetaDeLaFoto(f).toLowerCase()}`} loading="lazy" />
                ) : (
                  <span className="rastro-foto-vacia" aria-hidden="true" />
                )}
                {/* `etiquetaDeLaFoto` y no un mapa propio de `ANGLES`: aquí salen
                    fotos del archivo entero, incluidas las de un ángulo que ya no
                    se pide (se quedaban rotuladas «Foto») y las laterales antiguas
                    con su lado ya declarado. */}
                <span>{etiquetaDeLaFoto(f)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {s.respuesta ? (
        <div className="rastro-parte">
          <h4 className="rastro-rotulo">
            Lo que te contestó{s.respuesta.cuando ? ` · ${shortDate(s.respuesta.cuando)}` : ''}
          </h4>
          {s.respuesta.texto ? <p className="rastro-respuesta">{s.respuesta.texto}</p> : null}
          {s.respuesta.video ? (
            <a className="btn btn-secondary btn-sm rastro-video" href={s.respuesta.video}>
              <Play size={15} aria-hidden="true" /> Ver el vídeo de tu revisión
            </a>
          ) : null}
        </div>
      ) : null}

      {nada && !onCompletar ? <p className="rastro-nada">Esta semana no apuntaste nada.</p> : null}
    </div>
  );
};

/**
 * Un pesaje, con su «Quitar». Quitar se confirma en el mismo sitio: es borrar
 * un dato suyo y un toque suelto al desplazar no puede llevárselo.
 */
const Pesaje = ({ pesaje, onQuitar }) => {
  const [seguro, setSeguro] = useState(false);
  const dia = weekdayName(pesaje.fecha);
  return (
    <li className="rastro-pesaje">
      <span className="rastro-dia">
        {dia.charAt(0).toUpperCase() + dia.slice(1)} {Number(pesaje.fecha.slice(8, 10))}
      </span>
      <span className="rastro-peso tnum">{kg(pesaje.peso)} kg</span>
      {/* Una semana revisada o fuera de plazo ya no se toca: el pesaje se lee. */}
      {!onQuitar ? null : seguro ? (
        <span className="rastro-quitar-si">
          <button type="button" className="btn btn-sm btn-plain" onClick={() => setSeguro(false)}>
            Dejarlo
          </button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={onQuitar}>
            Quitar este pesaje
          </button>
        </span>
      ) : (
        <button type="button" className="btn btn-sm btn-plain" onClick={() => setSeguro(true)}>
          Quitar
        </button>
      )}
    </li>
  );
};
