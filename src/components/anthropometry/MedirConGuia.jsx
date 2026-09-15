import { useState } from 'react';

import { LaminaDeMedidas, guiaById } from '@/components/Coach/Taller/GuiaDeMedidas';

/**
 * MEDIRSE: la lámina y las casillas, que son la misma cosa.
 *
 * ══ Lo que había ═══════════════════════════════════════════════════════════
 *
 * Un paso llamado «Las medidas» con todo dentro: el aviso de la fórmula, un
 * enlace «Cómo se mide» que desplegaba una lámina de 290 × 276 con seis sitios
 * numerados, y **debajo** una rejilla de `auto-fit` que a la anchura del diálogo
 * daba cinco columnas de casillas idénticas. Seis pliegues, nueve perímetros y
 * las medidas de aparato, seguidos.
 *
 * Los dos trozos no se conocían. La lámina explicaba seis sitios con sus números
 * y al lado había quince cajas sin número: para saber que el «③ Abdominal» del
 * dibujo era la tercera casilla de la primera fila había que emparejarlos por el
 * nombre, que es el trabajo que la aplicación tenía que estar haciendo. De ahí
 * que la guía se leyera como algo pegado encima del formulario y no como parte
 * de él.
 *
 * ══ Lo que es ahora ════════════════════════════════════════════════════════
 *
 * Un paso por técnica —el pellizco y la cinta son dos gestos, dos aparatos y dos
 * láminas— y dentro, dos columnas: la figura a la izquierda, fija, y a la
 * derecha un renglón por SITIO con su número, su nombre y su casilla.
 *
 * El número es el mismo que el del dibujo, así que la pareja no hay que
 * deducirla. Y al entrar en una casilla se enciende su marca en la figura y baja
 * al pie el cómo se toma y qué se falsea sin querer — la guía deja de ser algo
 * que se abre ANTES de medir para ser lo que se lee MIENTRAS se mide, que es
 * cuando hace falta.
 *
 * ══ UN RENGLÓN ES UN SITIO, aunque sean dos medidas ════════════════════════
 *
 * Los perímetros son nueve casillas en seis sitios: el brazo, el muslo y el
 * gemelo se piden derecho e izquierdo. Enseñados como nueve casillas iguales,
 * «Brazo Dcho.» y «Brazo Izq.» parecen dos sitios distintos y la guía parece
 * incompleta —seis puntos para nueve cajas—. Aquí el sitio es el renglón y las
 * dos medidas son sus dos casillas, que es exactamente lo que dice la lámina.
 *
 * El reparto sale de `campos` (ver `GuiaDeMedidas`), así que si mañana se añade
 * un perímetro sin ponerlo en su sitio, la lista se queda corta y se ve —en vez
 * de aparecer una casilla huérfana en una rejilla.
 */

/** El rótulo corto de una casilla dentro de su sitio: «Dcho.», «Izq.». */
const lado = (etiqueta, sitio) => {
  const resto = etiqueta.replace(sitio, '').trim();
  return resto || etiqueta;
};

export const MedirConGuia = ({ que, labels, values, unit, unidad, onChange }) => {
  const guia = guiaById(que);
  /* Qué sitio se está midiendo. `null` en reposo: sin nada enfocado, la lámina
     enseña los seis por igual —que es lo que es— y el pie dice el lema. */
  const [activo, setActivo] = useState(null);
  const sitio = activo === null ? null : guia.sitios[activo];

  /*
    ══ NO HAY DERECHA NI IZQUIERDA EN EL PECHO ═══════════════════════════════

    Las casillas se pintaban en fila pegadas al canto derecho, así que la única
    del pecho, la del ombligo y la del glúteo caían EXACTAMENTE bajo la columna
    del «Izq.» del brazo. Alineadas ahí dicen algo que es falso: que esa medida
    es la del lado izquierdo de un sitio que no tiene lados.

    Las casillas son una rejilla de tantas columnas como medidas tiene el sitio
    que más pide —dos en la cinta, una en el pliegue— y la medida única OCUPA
    TODAS. Es la celda combinada de toda la vida.

    ── Y ocupa el renglón entero, no su centro ─────────────────────────────
    Primer intento: la única, centrada sobre las dos columnas. Sale peor de lo
    que suena, y en cuanto se mira la columna de arriba abajo se ve por qué:
    centrada sobre DOS columnas, la casilla cae en el hueco que las separa. No
    cuadraba ni con la del «Dcho.» ni con la del «Izq.», así que las tres filas
    de una medida quedaban descolocadas respecto de las tres de dos, que es
    exactamente lo que se venía a arreglar.

    Estirada, los dos cantos cuadran con los de las filas de dos y lo que
    distingue a un sitio con lados de uno sin ellos es la FORMA de su renglón:
    dos casillas o una. No hay nada que leer para saberlo, y ninguna casilla se
    queda debajo de un rótulo que dice «Izq.».
  */
  const columnas = Math.max(...guia.sitios.map((s) => s.campos.length));

  return (
    <div
      className={`medir${guia.figuras.length > 1 ? ' es-doble' : ''}`}
      style={{ '--medir-cols': columnas }}
    >
      <div className="medir-lamina">
        <LaminaDeMedidas que={que} activo={activo} />
        {/*
          El pie: en reposo el lema de la técnica —lo que hay que saber antes de
          empezar— y con una casilla enfocada, su sitio. Es el mismo hueco en los
          dos casos a propósito: si apareciera y desapareciera, cada vez que se
          pasa de una casilla a otra saltaría toda la columna de la derecha.
        */}
        <p className="medir-dice">
          {sitio ? (
            <>
              <b>{sitio.sitio}</b> {sitio.como}
              <em>{sitio.ojo}</em>
            </>
          ) : (
            guia.lema
          )}
        </p>
      </div>

      <ol className="medir-campos">
        {guia.sitios.map((s, i) => (
          <li className="medir-campo" key={s.sitio} data-on={i === activo ? '1' : undefined}>
            {/* El mismo disco que la lámina: es lo que empareja el renglón con
                el punto sin escribir «el número 3 es éste». */}
            <span className="guia-n" aria-hidden="true">
              {i + 1}
            </span>
            <span className="medir-sitio">{s.sitio}</span>
            <span className="medir-cajas">
              {s.campos.map((campo) => (
                <label
                  className={`medir-caja${s.campos.length < columnas ? ' es-sola' : ''}`}
                  key={campo}
                >
                  {/* El lado solo cuando hay dos: con una sola casilla, repetir
                      «Pecho» al lado de «Pecho» es ruido. */}
                  {s.campos.length > 1 && (
                    <span className="medir-lado">{lado(labels[campo] || campo, s.sitio)}</span>
                  )}
                  <span className="input-suffix">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="input input-center input-medida"
                      value={values[campo] ?? ''}
                      onChange={(e) => onChange(campo, e.target.value)}
                      onFocus={() => setActivo(i)}
                      onBlur={() => setActivo((a) => (a === i ? null : a))}
                      aria-label={`${labels[campo] || campo} en ${unit}`}
                    />
                    <span aria-hidden="true">{unidad}</span>
                  </span>
                </label>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};
