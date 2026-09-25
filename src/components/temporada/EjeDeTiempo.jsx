import { addDays, shortDate, weekStart } from "@/lib/dates";
import { anchoDelEje, marcasDelEje, mesesDeLaVista, nivelDelEje } from "./escalaDeTiempo";

const ALTO_SEMANAS = 26;
const ALTO_FECHAS = 16;
/** Lo alto que es el eje: las píldoras y, debajo, las fechas. */
export const ALTO_EJE = ALTO_SEMANAS + ALTO_FECHAS;

const ALTO_PILDORA = 20;
const Y_PILDORA = 4;
/* Esquinas suaves: una píldora rectangular, nunca un círculo. */
const RADIO = 5;
/* Lo que se come la marca de la revisión dentro de la píldora (✓ o punto). */
const MARCA = 9;
/* El aire mínimo a cada lado del texto dentro de la píldora, y entre píldoras. */
const AIRE = 2;
const ENTRE = 2;

const f1 = (n) => Math.round(n * 10) / 10;

/* Lo que dice el estado de cada semana, en palabras: el mismo vocabulario que
   las casillas de la portada de Revisiones. */
const DICHO = {
  revisada: "revisada",
  pendiente: "te toca revisarla",
  curso: "en curso",
  sin: "sin check-in",
  futura: "prevista",
};

const estadoDe = (s) =>
  s.revision5 || (s.estado === "futura" ? "futura" : "sin");
const conMarca = (estado) => estado === "revisada" || estado === "pendiente";

/**
 * EL EJE, al pie (25 sep 2026): píldoras rectangulares de esquinas suaves y,
 * debajo, las fechas. Elige su detalle por el ancho de una semana
 * (`nivelDelEje`):
 *
 *   · semanas (≥ 34 px) — «S12» en cada píldora; debajo, el lunes de cada
 *     semana con el mes en negrita cuando cambia.
 *   · numeros (18–34 px) — «12» en cada píldora; debajo, solo los meses.
 *   · meses (< 18 px) — una píldora por mes, del ancho del mes: «sep», o
 *     «ene 2027» cuando cambia el año. La semana de hoy es una muesca azul
 *     dentro de su mes; el estado de revisión no está (sigue en la ficha y en
 *     el cursor).
 *
 * En los dos primeros niveles la píldora lleva el estado de su revisión:
 * ✓ revisada, punto azul si te toca revisarla (si no cabe la marca, la píldora
 * se tiñe), borde a trazos sin check-in. La de hoy, con borde y texto azules;
 * las futuras, más atenuadas.
 *
 * Nunca hay texto pisado: lo que no cabe se acorta o no se escribe
 * (`marcasDelEje` salta la fecha que no cabe detrás de la anterior).
 *
 * Pulsar una píldora abre su semana (`data-eje`, lo lee quien la monta).
 */
export const EjeDeTiempo = ({ escala, semanas, hoy }) => {
  const W = escala.ancho;
  const pxSemana = escala.pxPorDia * 7;
  const nivel = nivelDelEje(pxSemana);
  const lunesDeHoy = weekStart(hoy);
  const yFechas = ALTO_SEMANAS + 11;
  const ym = Y_PILDORA + ALTO_PILDORA / 2;

  /* La píldora entre dos fechas, recortada a lo que se ve. */
  const caja = (desde, hasta) => {
    const xa = Math.max(0, escala.x(desde) + ENTRE / 2);
    const xb = Math.min(W, escala.x(addDays(hasta, 1)) - ENTRE / 2);
    return xb - xa >= 4 ? { x: xa, w: xb - xa } : null;
  };

  let pildoras;
  /* Los meses cuya píldora no pudo llevar el año: el año va debajo. */
  const anioDebajo = new Set();

  if (nivel === "meses") {
    const xHoy = escala.x(hoy) + escala.pxPorDia / 2;
    pildoras = mesesDeLaVista(escala).map((m) => {
      const c = caja(m.desde, m.hasta);
      if (!c) return null;
      const opciones = [
        m.cambiaAnio && `${m.nombre} ${m.anio}`,
        m.nombre,
        m.nombre.charAt(0),
      ].filter(Boolean);
      /* La inicial sola se conforma con menos aire. */
      const texto = opciones.find((t) => anchoDelEje(t) + (t.length > 1 ? AIRE * 2 + 2 : 2) <= c.w) || null;
      /* Un trozo de mes en un borde donde no cabe ni su inicial: fuera. En
         medio, la píldora sigue aunque vaya vacía: el mes está ahí. */
      if (!texto && (c.x <= 1 || c.x + c.w >= W - 1)) return null;
      if (m.cambiaAnio && texto !== opciones[0]) anioDebajo.add(m.desde);
      const conHoy = hoy >= m.desde && hoy <= m.hasta && xHoy >= c.x && xHoy <= c.x + c.w;
      const suyas = semanas.filter((s) => s.lunes >= m.desde && s.lunes <= m.hasta);
      return {
        id: m.mes,
        clase: [m.desde > hoy && "is-futura", "is-mes"],
        titulo: `${m.nombre} ${m.anio}${suyas.length ? ` · ${suyas.length} ${suyas.length === 1 ? "semana" : "semanas"}` : ""}`,
        c,
        dentro: (
          <>
            {texto && (
              <text x={f1(c.x + c.w / 2)} y={ym + 3.8} textAnchor="middle">
                {texto}
              </text>
            )}
            {/* La semana de hoy: una muesca azul en el canto de arriba de su mes. */}
            {conHoy && (
              <rect
                className="tl-sem-muesca"
                x={f1(Math.min(c.x + c.w - 6, Math.max(c.x + 2, xHoy - 4)))}
                y={Y_PILDORA + 1.5}
                width={Math.min(8, c.w - 4)}
                height={2.5}
                rx={1.25}
              />
            )}
          </>
        ),
      };
    });
  } else {
    pildoras = semanas
      .filter((s) => escala.toca(s.lunes, s.domingo))
      .map((s) => {
        const c = caja(s.lunes, s.domingo);
        if (!c) return null;
        const estado = estadoDe(s);
        const texto = s.numero
          ? nivel === "semanas"
            ? `S${s.numero}`
            : String(s.numero)
          : "";
        const cabe = (w) => w + AIRE * 2 <= c.w;
        const marca = conMarca(estado) && cabe(anchoDelEje(texto) + MARCA);
        const ancho = anchoDelEje(texto) + (marca ? MARCA : 0);
        const x0 = c.x + c.w / 2 - ancho / 2;
        return {
          id: s.lunes,
          clase: [
            `is-${estado}`,
            /* Sin sitio para la marca, lo que toca revisar se tiñe entero. */
            !marca && conMarca(estado) && "is-estrecha",
            s.lunes === lunesDeHoy && "is-hoy",
          ],
          titulo: `${s.numero ? `S${s.numero} · ` : ""}del ${shortDate(s.lunes)} · ${DICHO[estado]}`,
          c,
          dentro: texto && cabe(anchoDelEje(texto)) && (
            <>
              {marca &&
                (estado === "revisada" ? (
                  <path
                    className="tl-sem-tic"
                    d={`M${f1(x0 + 0.5)} ${ym} l2 2.2 l3.8 -4.6`}
                  />
                ) : (
                  <circle
                    className="tl-sem-punto"
                    cx={f1(x0 + 3)}
                    cy={ym}
                    r={2.75}
                  />
                ))}
              {marca ? (
                <text x={f1(x0 + MARCA)} y={ym + 3.8}>
                  {texto}
                </text>
              ) : (
                <text x={f1(c.x + c.w / 2)} y={ym + 3.8} textAnchor="middle">
                  {texto}
                </text>
              )}
            </>
          ),
        };
      });
  }

  /* Debajo: los lunes (semanas), los meses (números) o el año que no cupo en
     su mes (meses). */
  const fechas = marcasDelEje(escala, nivel).filter(
    (m) => nivel !== "meses" || anioDebajo.has(m.dia),
  );

  return (
    <svg
      className={`tl-eje is-${nivel}`}
      width={W}
      height={ALTO_EJE}
      viewBox={`0 0 ${W} ${ALTO_EJE}`}
      data-eje=""
    >
      {pildoras.filter(Boolean).map((p) => (
        <g
          key={p.id}
          className={["tl-sem", ...p.clase].filter(Boolean).join(" ")}
        >
          <title>{p.titulo}</title>
          <rect
            x={f1(p.c.x)}
            y={Y_PILDORA}
            width={f1(p.c.w)}
            height={ALTO_PILDORA}
            rx={Math.min(RADIO, p.c.w / 3)}
          />
          {p.dentro}
        </g>
      ))}
      {fechas.map((m) => (
        <text
          key={m.dia}
          className="tl-eje-marca"
          x={f1(m.x + 2)}
          y={yFechas}
          aria-hidden="true"
        >
          {m.numero}
          {m.numero && m.mes ? " " : ""}
          {m.mes && (
            <tspan className={m.fuerte ? "is-fuerte" : undefined}>
              {m.mes}
            </tspan>
          )}
        </text>
      ))}
    </svg>
  );
};
