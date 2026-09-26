import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { celdasDeGrupo, conCampoDelGrupo, conSeriesDelGrupo } from '@/domain/pautas';

/**
 * LA PAUTA DE CADA MICROCICLO, EN LA TARJETA DEL BLOQUE: UNA TABLA.
 *
 * ══ Qué sustituye (26 sep) ═════════════════════════════════════════════════
 *
 * La fila con carga o RIR era una línea comprimida («3 × 115–140 (6-12) RIR
 * 1–2») que al pulsarla abría DEBAJO un despliegue con una línea por grupo.
 * Tres averías, las tres de construcción:
 *
 *   · Líneas duplicadas: el resumen se quedaba pintado y el despliegue lo
 *     repetía debajo; con un solo grupo, la misma línea dos veces.
 *   · Iconos encima: el «···» medía 26 px en un carril de 20, y el despliegue
 *     ocupaba `1 / -1` —el carril incluido—; el asa, a media fila, bajaba con
 *     ella al crecer.
 *   · Nada a plomo: cada casilla medía su propio texto y ninguna compartía
 *     columna con la de al lado, y las filas sin carga eran otra pieza con
 *     otra geometría.
 *
 * ══ Qué es ahora ═══════════════════════════════════════════════════════════
 *
 * La tarjeta es una rejilla con columnas fijas —Nombre · Series · Carga ·
 * RIR— y cada fila la hereda (`subgrid`), así que una cifra
 * cae en la misma vertical en toda la tarjeta, cabecera incluida. Un grupo
 * (series seguidas con el mismo rango y la misma carga) es una línea; varios
 * grupos, varias líneas en las MISMAS columnas. Nada se comprime.
 *
 * Editar no cambia nada de sitio: las cifras son el mismo texto, que pasa a
 * escribirse donde está (`Cifra`). No hay casillas, ni despliegue, ni otra
 * línea.
 */

/* Un guion, una coma, la barra entre rangos o el «·» del RIR miden media
   cifra: contarlos enteros dejaba aire detrás. Lo usa la fila de siempre
   (`PautaEnLinea`). */
export const anchoDe = (texto, minimo = 2) => {
  const t = String(texto ?? '');
  const estrechos = (t.match(/[-.,·/\s]/g) || []).length;
  return `calc(${Math.max(minimo, t.length - estrechos * 0.45).toFixed(2)}ch + 6px)`;
};

/** El punto de «esto cambia respecto al anterior». Mudo: lo dice el texto oculto de su fila. */
const Cambio = () => <span className="pauta-cambio" aria-hidden="true" />;

/* Todo el texto de una cifra seleccionado al entrar: se escribe encima. */
const seleccionarTodo = (el) => {
  const rango = document.createRange();
  rango.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(rango);
};

/**
 * UNA CIFRA DE LA FILA. Sin `onGuardar` es texto. Con él es el MISMO texto,
 * que se escribe en su sitio (`contentEditable`): mide lo que mide lo escrito,
 * así que editar no mueve la columna ni la fila. Nada de cajas: la fila en
 * edición la subraya a trazos, y la que tiene el foco, entera.
 *
 * Guarda al salir o con Enter; Escape devuelve lo que había. La cifra va en
 * la llave: cuando cambia, la pieza se monta de nuevo con ella, y React no
 * tiene que casar su texto con el que dejó el teclado.
 */
const Cifra = ({ valor, label, teclado = 'decimal', onGuardar = null }) => {
  if (!onGuardar) return <span className="plan-t-cifra">{valor}</span>;
  return (
    <span
      key={valor}
      className="plan-t-cifra is-escribible"
      role="textbox"
      aria-label={label}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      inputMode={teclado}
      tabIndex={0}
      onFocus={(e) => {
        const el = e.currentTarget;
        requestAnimationFrame(() => document.activeElement === el && seleccionarTodo(el));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          e.stopPropagation();
          e.currentTarget.textContent = valor;
          e.currentTarget.blur();
        }
      }}
      /* Pegar trae texto, nunca formato. */
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s+/g, ' ').trim());
      }}
      onBlur={(e) => {
        const escrito = e.currentTarget.textContent.trim();
        /* Lo que se ve vuelve a ser lo guardado: si el cambio vale, la cifra
           nueva llega por arriba y remonta la pieza. */
        e.currentTarget.textContent = valor;
        if (escrito !== valor) onGuardar(escrito);
      }}
    >
      {valor}
    </span>
  );
};

/**
 * DÓNDE CAE CADA COSA en la rejilla de la tarjeta.
 *
 *   en línea   Nombre ·········· │ 3 │×│ 8-10 │ Carga │ RIR │
 *   apilada    Nombre ·································· ···
 *              (hueco) ········· │ 3 │×│ 8-10 │ Carga │ RIR │
 *
 * Series son TRES columnas —número, «×», rango— para que todos los «×» de la
 * tarjeta caigan en la misma vertical. La última cifra termina en el borde
 * de la tarjeta en los dos repartos: no hay carril para el «···», que solo
 * existe en la fila que se edita y se pone al final del nombre.
 */
export const posicionesDeTabla = (columnas, apilada, lineas = 1) => ({
  n: 2,
  por: 3,
  reps: 4,
  carga: columnas.carga ? 5 : null,
  rir: columnas.rir ? 5 + Number(columnas.carga) : null,
  fila: (gi) => gi + (apilada ? 2 : 1),
  nombre: apilada ? { gridColumn: '1 / -1', gridRow: 1 } : { gridColumn: 1, gridRow: `1 / span ${lineas}` },
  menu: apilada ? { gridColumn: '1 / -1', gridRow: 1 } : { gridColumn: 1, gridRow: 1 },
  aviso: { gridColumn: '1 / -1', gridRow: lineas + (apilada ? 2 : 1) },
});

/**
 * La cabecera, una vez por tarjeta: «Series» centrada sobre sus tres
 * columnas, «Carga» y «RIR» a la derecha de la suya. Callada para el lector
 * de pantalla: cada cifra ya dice qué es.
 */
export const CabeceraDeTabla = ({ columnas, apilada }) => {
  const pos = posicionesDeTabla(columnas, apilada);
  return (
    <li className="plan-tabla-cab" aria-hidden="true">
      <span className="plan-t-n" style={{ gridColumn: `${pos.n} / span 3` }}>
        Series
      </span>
      {columnas.carga && (
        <span className="plan-t-sec" style={{ gridColumn: pos.carga }}>
          Carga
        </span>
      )}
      {columnas.rir && (
        <span className="plan-t-sec" style={{ gridColumn: pos.rir }}>
          RIR
        </span>
      )}
    </li>
  );
};

/**
 * LAS LÍNEAS DE UN EJERCICIO, en las columnas de su tarjeta.
 *
 * Cada grupo es una línea: «3 × 6-8» · «120» · «2 1 1». Con `apilada` el
 * nombre ocupa el primer renglón entero y las líneas van debajo (ver
 * `useTablasApiladas`). `marcas` dice qué cifra cambia respecto al microciclo
 * anterior (`marcasDeGrupos`). Con `onEscribir(series)` cada cifra se escribe
 * en su sitio y emite las series enteras del ejercicio; sin él, se lee.
 */
export const LineasDePauta = ({ sets, grupos, marcas, columnas, apilada, nombre, onEscribir = null }) => {
  const pos = posicionesDeTabla(columnas, apilada, grupos.length);
  /* Lo escrito se traduce a series enteras; `null` es «eso no cambia nada»
     o «eso no vale», y no se guarda. */
  const guardar = (hacer) =>
    onEscribir
      ? (escrito) => {
          const nuevas = hacer(escrito);
          if (nuevas) onEscribir(nuevas);
        }
      : null;

  return grupos.map((g, gi) => {
    const c = celdasDeGrupo(g);
    const m = marcas[gi];
    const fila = pos.fila(gi);
    const de = grupos.length > 1 ? ` de la línea ${gi + 1}` : '';
    const campo = (cual, opciones) => guardar((v) => conCampoDelGrupo(sets, grupos, gi, cual, v, opciones));
    return [
      <span className="plan-t-series plan-t-n" key={`n${g.desde}`} style={{ gridRow: fila, gridColumn: pos.n }}>
        <Cifra
          valor={String(c.n)}
          teclado="numeric"
          label={`Series${de} de ${nombre}`}
          onGuardar={guardar((v) => conSeriesDelGrupo(sets, grupos, gi, v))}
        />
        {m?.n && <Cambio />}
      </span>,
      <span className="plan-t-por" key={`x${g.desde}`} aria-hidden="true" style={{ gridRow: fila, gridColumn: pos.por }}>
        ×
      </span>,
      <span className="plan-t-series plan-t-reps" key={`s${g.desde}`} style={{ gridRow: fila, gridColumn: pos.reps }}>
        <Cifra
          valor={c.reps || (onEscribir ? '' : '–')}
          label={`Repeticiones${de} de ${nombre}`}
          onGuardar={campo('targetReps')}
        />
        {m?.reps && <Cambio />}
      </span>,
      columnas.carga && (
        <span className="plan-t-sec" key={`k${g.desde}`} style={{ gridRow: fila, gridColumn: pos.carga }}>
          <Cifra valor={c.kg} label={`Carga${de} de ${nombre}, en kilos`} onGuardar={campo('targetKg')} />
          {m?.kg && <Cambio />}
        </span>
      ),
      columnas.rir && (
        <span className="plan-t-sec is-rir" key={`r${g.desde}`} style={{ gridRow: fila, gridColumn: pos.rir }}>
          {c.rir.map((r, j) => (
            <span className="plan-t-rir" key={j}>
              <Cifra
                valor={r || (c.rir.length > 1 ? '–' : '')}
                label={
                  c.rir.length > 1
                    ? `RIR de la serie ${j + 1}${de} de ${nombre}`
                    : `RIR${de} de ${nombre}. Uno para todas o uno por serie, separados por espacios.`
                }
                onGuardar={campo('targetRir', c.rir.length > 1 ? { serie: j } : undefined)}
              />
              {(c.rir.length > 1 ? m?.rir?.[j] : m?.rir?.some(Boolean)) && <Cambio />}
            </span>
          ))}
        </span>
      ),
    ];
  });
};

/* ══ ¿CABE EL NOMBRE AL LADO? ══════════════════════════════════════════════
   En la tarjeta, el nombre se queda con lo que dejan las cifras y nunca menos
   del 45 %, y no se parte por letras. Si no cabe —tarjetas estrechas, o una
   palabra más larga que su hueco—, la tarjeta pasa ENTERA a «apilada»: el
   nombre arriba, con el ancho entero, y las líneas debajo, en las mismas
   columnas. Entera, para que las cifras sigan a plomo de fila a fila.

   Se mide y no se adivina con un umbral: lo que ocupan las cifras depende de
   lo que digan («3 × 10-12 · 117,5 · 2 1 1» no mide lo que «3 × 8 · 60»).
   Las columnas de cifras miden lo mismo en los dos repartos —son `auto` en
   los dos, con sus calles dentro—, así que la medida no oscila. */

let pincel = null;
const anchoDeTexto = (texto, estilo) => {
  if (!pincel) pincel = document.createElement('canvas').getContext?.('2d') ?? null;
  if (!pincel) return 0;
  pincel.font = `${estilo.fontStyle} ${estilo.fontWeight} ${estilo.fontSize} ${estilo.fontFamily}`;
  return pincel.measureText(texto).width;
};

/** La palabra más larga de los nombres de la tarjeta: lo mínimo que necesitan sin partirse. */
const palabraMasLarga = (tabla) => {
  let mayor = 0;
  tabla.querySelectorAll('.plan-ej-nombre').forEach((el) => {
    const estilo = getComputedStyle(el);
    for (const palabra of (el.textContent || '').split(/\s+/)) {
      if (palabra) mayor = Math.max(mayor, anchoDeTexto(palabra, estilo));
    }
  });
  return Math.ceil(mayor) + 1;
};

/* En los dos repartos las pistas son [nombre, …cifras]: la primera es la del
   nombre y el resto, con sus calles dentro (van de relleno), las cifras. */
const cabeEnLinea = (tabla) => {
  const pistas = getComputedStyle(tabla).gridTemplateColumns.split(/\s+/).map(parseFloat).filter(Number.isFinite);
  if (pistas.length < 2) return true;
  const ancho = tabla.clientWidth;
  const cifras = pistas.slice(1).reduce((a, b) => a + b, 0);
  return ancho - cifras >= Math.max(ancho * 0.45, palabraMasLarga(tabla));
};

/**
 * Qué tarjetas van apiladas. Una sola observación para todas: `refDe(clave)`
 * es la referencia de la lista de cada tarjeta y `apilada(clave)` su reparto.
 */
export const useTablasApiladas = () => {
  const tablas = useRef(new Map());
  const refs = useRef(new Map());
  const observador = useRef(null);
  const [apiladas, setApiladas] = useState(() => new Set());

  const medir = useCallback(() => {
    const nuevas = new Set();
    tablas.current.forEach((el, clave) => {
      if (!cabeEnLinea(el)) nuevas.add(clave);
    });
    setApiladas((antes) => (antes.size === nuevas.size && [...nuevas].every((c) => antes.has(c)) ? antes : nuevas));
  }, []);

  /* Tras cada pintado: lo escrito cambia lo que miden las cifras. Solo
     vuelve a pintar si el reparto de alguna tarjeta cambia. */
  useLayoutEffect(() => {
    medir();
  });

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => medir());
    observador.current = ro;
    tablas.current.forEach((el) => ro.observe(el));
    /* Con la fuente de verdad cargada, las palabras miden otra cosa. */
    document.fonts?.ready?.then(medir);
    return () => {
      ro.disconnect();
      observador.current = null;
    };
  }, [medir]);

  const refDe = (clave) => {
    if (!refs.current.has(clave)) {
      refs.current.set(clave, (el) => {
        const antes = tablas.current.get(clave);
        if (antes && antes !== el) observador.current?.unobserve(antes);
        if (el) {
          tablas.current.set(clave, el);
          observador.current?.observe(el);
        } else {
          tablas.current.delete(clave);
        }
      });
    }
    return refs.current.get(clave);
  };

  return { refDe, apilada: (clave) => apiladas.has(clave) };
};

/** «M3», «M3 y M4», «M3, M4 y M5»; de cuatro seguidos en adelante, «de M3 a M6». */
const listaDeMicrociclos = (semanas, etiqueta) => {
  const seguidas = semanas.every((w, i) => i === 0 || w === semanas[i - 1] + 1);
  if (semanas.length >= 4 && seguidas) return `de ${etiqueta(semanas[0])} a ${etiqueta(semanas[semanas.length - 1])}`;
  if (semanas.length === 1) return `en ${etiqueta(semanas[0])}`;
  return `en ${semanas.slice(0, -1).map(etiqueta).join(', ')} y ${etiqueta(semanas[semanas.length - 1])}`;
};

/**
 * LO QUE ACABA DE HACER EL CAMBIO, debajo de la fila y sin ventana.
 *
 *   Aplicado en M3 y M4 · Solo en M3 · Deshacer
 *   Aplicado en M3 · M4 tiene su propio valor · Deshacer
 *
 * «Solo en M3» solo sale si el cambio llegó a más de un microciclo.
 */
export const AvisoDePauta = ({ aviso, semana, etiqueta, onSolo, onDeshacer, style }) => (
  <p className="plan-ej-aviso" role="status" style={style}>
    <span>Aplicado {listaDeMicrociclos(aviso.aplicadas, etiqueta)}</span>
    {aviso.propia !== null && (
      <>
        <span aria-hidden="true">·</span>
        <span>{etiqueta(aviso.propia)} tiene su propio valor</span>
      </>
    )}
    {aviso.aplicadas.length > 1 && (
      <button type="button" className="plan-ej-aviso-accion" onClick={onSolo}>
        Solo en {etiqueta(semana)}
      </button>
    )}
    <button type="button" className="plan-ej-aviso-accion" onClick={onDeshacer}>
      Deshacer
    </button>
  </p>
);
