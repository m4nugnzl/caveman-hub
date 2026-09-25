import { useEffect, useId, useRef, useState } from 'react';
import { Pin, X } from 'lucide-react';

import { shortDate } from '@/lib/dates';

/**
 * ══ EL LOGBOOK DEL CLIENTE EN UN EJERCICIO (0139) ═══════════════════════════
 *
 * Todo lo que el cliente escribe de un ejercicio vive en UN sitio, el pie de
 * la caja, en renglones con su nombre:
 *
 *   · AJUSTES — «banco al 3», «multipower». Valen siempre, en cualquier
 *     microciclo y rutina. Son chapas con su «×» a la vista; tocar el texto lo
 *     cambia y «+ Añadir» fija otro.
 *   · LA ÚLTIMA VEZ — la nota de la sesión anterior con este ejercicio, con su
 *     «Fijar como ajuste». Sin series: esas ya salen en gris en las casillas.
 *   · NOTA DE HOY — de este entreno; no se arrastra. Se guarda al teclear.
 *
 * ── Por qué así (24 sep) ────────────────────────────────────────────────────
 * La primera versión ponía los ajustes al lado del nombre y la nota abajo,
 * con UN campo que era nota o ajuste según una chincheta. El dueño: «no es
 * cómodo eliminar, no se entiende qué es cada cosa porque hay notas arriba y
 * notas abajo». Ahora cada cosa tiene rótulo, sitio y verbo propio.
 *
 * Fijar, cambiar y quitar un ajuste necesita conexión (`useAjustesDeEjercicio`).
 * Lo usan el teléfono y el puesto del PC, cada uno con sus clases (`pre`).
 * En neutros: el azul queda para los verbos.
 */

const TOPE = 80;

/* Las clases de cada aparato, escritas enteras para que `verify-styles` y un
   grep las encuentren. */
const CLASES = {
  tel: {
    log: 'tel-log',
    fila: 'tel-log-fila',
    rot: 'tel-log-rot',
    chapas: 'tel-log-chapas',
    ajuste: 'tel-mi-ajuste',
    ajusteTexto: 'tel-mi-ajuste-texto',
    ajusteX: 'tel-mi-ajuste-x',
    campo: 'tel-log-campo',
    alta: 'tel-log-alta',
    antes: 'tel-log-antes',
    leida: 'tel-log-leida',
    mas: 'tel-nota-mas',
    pie: 'tel-nota-pie',
    aviso: 'tel-nota-aviso',
  },
  pc: {
    log: 'pc-log',
    fila: 'pc-log-fila',
    rot: 'pc-log-rot',
    chapas: 'pc-log-chapas',
    ajuste: 'pc-mi-ajuste',
    ajusteTexto: 'pc-mi-ajuste-texto',
    ajusteX: 'pc-mi-ajuste-x',
    campo: 'pc-log-campo',
    alta: 'pc-log-alta',
    antes: 'pc-log-antes',
    leida: 'pc-log-leida',
    mas: 'pc-nota-mas',
    pie: 'pc-nota-pie',
    aviso: 'pc-nota-aviso',
  },
};

const mismoTexto = (a, b) =>
  String(a || '').trim().replace(/\s+/g, ' ').toLowerCase() === String(b || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Un renglón: el rótulo a la izquierda (arriba en el teléfono) y lo suyo. */
const Fila = ({ k, rotulo, htmlFor, children }) => (
  <div className={k.fila}>
    {htmlFor ? (
      <label className={k.rot} htmlFor={htmlFor}>
        {rotulo}
      </label>
    ) : (
      <span className={k.rot}>{rotulo}</span>
    )}
    <div>{children}</div>
  </div>
);

/** Un ajuste: su texto (tocarlo lo cambia) y su «×». Sin manejadores, se lee. */
const Ajuste = ({ k, ajuste, ajustes, onAviso }) => {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(ajuste.text);
  const campo = useRef(null);
  const puedeEditar = Boolean(ajustes.onEditar);
  const puedeQuitar = Boolean(ajustes.onQuitar);

  useEffect(() => {
    if (editando) campo.current?.focus();
  }, [editando]);

  const guardar = async () => {
    const limpio = texto.trim();
    setEditando(false);
    if (limpio === ajuste.text) return;
    const r = limpio ? await ajustes.onEditar(ajuste.id, limpio) : await ajustes.onQuitar(ajuste.id);
    if (!r.ok) {
      onAviso(r.error);
      setTexto(ajuste.text);
    }
  };

  const quitar = async () => {
    onAviso('');
    const r = await ajustes.onQuitar(ajuste.id);
    if (!r.ok) onAviso(r.error);
  };

  if (editando) {
    return (
      <input
        ref={campo}
        className={k.campo}
        value={texto}
        maxLength={TOPE}
        aria-label={`Cambiar el ajuste «${ajuste.text}»`}
        enterKeyHint="done"
        onChange={(ev) => setTexto(ev.target.value)}
        onBlur={guardar}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') ev.currentTarget.blur();
          if (ev.key === 'Escape') {
            setTexto(ajuste.text);
            setEditando(false);
          }
        }}
      />
    );
  }

  return (
    <span className={k.ajuste}>
      <Pin size={13} strokeWidth={2.2} aria-hidden="true" />
      {puedeEditar ? (
        <button
          type="button"
          className={k.ajusteTexto}
          title="Cambiar"
          aria-label={`Cambiar el ajuste «${ajuste.text}»`}
          onClick={() => {
            onAviso('');
            setTexto(ajuste.text);
            setEditando(true);
          }}
        >
          {ajuste.text}
        </button>
      ) : (
        <span className={k.ajusteTexto}>{ajuste.text}</span>
      )}
      {puedeQuitar ? (
        <button type="button" className={k.ajusteX} title="Quitar" aria-label={`Quitar el ajuste «${ajuste.text}»`} onClick={quitar}>
          <X size={13} strokeWidth={2.4} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
};

/**
 * EL PIE DEL EJERCICIO: ajustes, la nota de la última vez y la de hoy.
 *
 * @param ultimaVez  `ultimaVezDeEjercicio(...)`: aquí solo se lee su fecha y
 *   su nota; las series van en gris en las casillas.
 * @param onNota     Escribe la nota de hoy. Nulo si hoy no se puede escribir.
 * @param ajustes    `{ lista, onFijar, onEditar, onQuitar }`; sin manejadores,
 *   solo se leen (su entrenador con «Ver como»).
 */
export const NotaDelLogbook = ({ pre = 'tel', nombre, nota, onNota, ultimaVez = null, ajustes = null }) => {
  const k = CLASES[pre] || CLASES.tel;
  const lista = ajustes?.lista || [];
  const onFijar = ajustes?.onFijar || null;

  const [escribiendo, setEscribiendo] = useState(false);
  const [anadiendo, setAnadiendo] = useState(false);
  const [borrador, setBorrador] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const idNota = useId();
  const idAlta = useId();

  const escrita = String(nota || '').trim().length > 0;
  const notaAntes = String(ultimaVez?.nota || '').trim();

  const fijar = async (texto) => {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    setAviso('');
    const r = await onFijar(limpio);
    setEnviando(false);
    if (!r.ok) {
      setAviso(r.error);
      return;
    }
    setBorrador('');
    setAnadiendo(false);
  };

  /* Fijar la nota de la última vez: un toque si cabe en un ajuste; si no, al
     campo de alta para recortarla. */
  const fijarLaDeAntes = () => {
    if (notaAntes.length <= TOPE) {
      fijar(notaAntes);
      return;
    }
    setBorrador(notaAntes.slice(0, TOPE));
    setAnadiendo(true);
  };

  const yaFijada = lista.some((a) => mismoTexto(a.text, notaAntes));
  const hayAjustes = lista.length > 0 || Boolean(onFijar);
  const hayNota = Boolean(onNota) || escrita;
  if (!hayAjustes && !notaAntes && !hayNota) return null;

  return (
    <div className={k.log}>
      {hayAjustes ? (
        <Fila k={k} rotulo="Ajustes" htmlFor={anadiendo ? idAlta : null}>
          <div className={k.chapas}>
            {lista.map((a) => (
              <Ajuste key={a.id} k={k} ajuste={a} ajustes={ajustes} onAviso={setAviso} />
            ))}
            {onFijar && !anadiendo ? (
              <button
                type="button"
                className={k.mas}
                onClick={() => {
                  setAviso('');
                  setAnadiendo(true);
                }}
              >
                + Añadir
              </button>
            ) : null}
          </div>
          {anadiendo ? (
            <form
              className={k.alta}
              onSubmit={(ev) => {
                ev.preventDefault();
                fijar(borrador);
              }}
            >
              <input
                id={idAlta}
                className={k.campo}
                autoFocus
                value={borrador}
                maxLength={TOPE}
                placeholder="Banco al 3, agarre ancho…"
                aria-label={`Ajuste nuevo de ${nombre}`}
                enterKeyHint="done"
                onChange={(ev) => setBorrador(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Escape') {
                    setBorrador('');
                    setAnadiendo(false);
                  }
                }}
              />
              <button type="submit" className={k.mas} disabled={!borrador.trim() || enviando}>
                {enviando ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                className={k.mas}
                data-tono="quieto"
                onClick={() => {
                  setBorrador('');
                  setAnadiendo(false);
                }}
              >
                Cancelar
              </button>
            </form>
          ) : null}
          {onFijar && lista.length === 0 && !anadiendo ? (
            <p className={k.pie}>Lo que quieras ver cada vez que hagas este ejercicio.</p>
          ) : null}
        </Fila>
      ) : null}

      {notaAntes ? (
        <Fila k={k} rotulo={`La última vez${ultimaVez.fecha ? ` · ${shortDate(ultimaVez.fecha)}` : ''}`}>
          <p className={k.antes}>
            {notaAntes}
            {onFijar && !yaFijada ? (
              <>
                {' '}
                <button type="button" className={k.mas} disabled={enviando} onClick={fijarLaDeAntes}>
                  Fijar como ajuste
                </button>
              </>
            ) : null}
          </p>
        </Fila>
      ) : null}

      {onNota ? (
        <Fila k={k} rotulo="Nota de hoy" htmlFor={escribiendo || escrita ? idNota : null}>
          {escribiendo || escrita ? (
            <>
              <textarea
                id={idNota}
                rows={2}
                autoFocus={escribiendo && !escrita}
                value={nota || ''}
                placeholder="Cómo ha ido, qué cambiarías…"
                onChange={(ev) => onNota(ev.target.value)}
              />
              <p className={k.pie}>Solo para hoy. La lee tu entrenador con tus series.</p>
            </>
          ) : (
            <button type="button" className={k.mas} onClick={() => setEscribiendo(true)}>
              + Escribir
            </button>
          )}
        </Fila>
      ) : escrita ? (
        <Fila k={k} rotulo="Nota de hoy">
          <p className={k.leida}>{nota}</p>
        </Fila>
      ) : null}

      {aviso ? (
        <p className={k.aviso} role="alert">
          {aviso}
        </p>
      ) : null}
    </div>
  );
};

/** Los ajustes para solo leer, en chapas (la hoja antes de empezar). */
export const ChapasDeAjustes = ({ pre = 'tel', textos = [] }) => {
  const k = CLASES[pre] || CLASES.tel;
  return textos.map((texto) => (
    <span key={texto} className={k.ajuste}>
      <Pin size={13} strokeWidth={2.2} aria-hidden="true" />
      <span className={k.ajusteTexto}>{texto}</span>
    </span>
  ));
};
