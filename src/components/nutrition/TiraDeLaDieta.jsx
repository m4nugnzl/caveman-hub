import { useState } from 'react';

import { BotonMas } from '@/components/ui/BotonMas';
import { RenombrarEnSitio } from '@/components/ui/primitives';
import { MenuAcciones } from '@/components/ui/MenuAcciones';

/**
 * LA CINTA DE LA DIETA: los días del plan, cuál se está mirando y a qué casilla
 * de su ciclo le toca cada uno.
 *
 * ══ Por qué la dieta no tenía cinta, y por qué la necesita ═════════════════
 *
 * Lo que hacía de navegación entre los dos días eran dos piezas distintas para
 * la misma pregunta: un `MandoTab` en la fila de mando del entrenador y un
 * `SegmentedControl` en el portal del cliente. Ninguna de las dos era la cinta
 * con la que se navega el resto de la casa —el programa, sus microciclos, sus
 * hojas—, así que la dieta era la única pantalla de trabajo sin cabecera de
 * navegación propia.
 *
 * Y aguantaban porque los días eran exactamente DOS. Ya no lo son.
 *
 * ══ Es el MISMO chasis, no uno parecido ════════════════════════════════════
 *
 * Las clases son las de la tira del programa (`.tira`, `.tira-fila`,
 * `.tira-lista`, `.tira-eslabon`, `.tira-mas`) y el «+» es la
 * misma pieza (`BotonMas`). Elegir un día de dieta y elegir una hoja del bloque
 * son la misma pregunta hecha en dos pantallas: dibujarlas distinto es lo que
 * hace que una aplicación se lea como dos.
 *
 *     ▌Alto   Medio   Bajo   Descanso   + día              ···   5 comidas
 *     Lun Alto  Mar Bajo  Mié Alto  Jue Bajo  Vie Alto  Sáb Desc  Dom Desc
 *
 * o, con ciclo rotativo, las casillas del microciclo con su sesión debajo:
 *
 *     D1 Empuje   D2 Tirón   D3 —        D4 Pierna   D5 —
 *        Alto        Alto       Bajo        Alto        Bajo
 *
 * ── El nombre se cambia donde se lee ──────────────────────────────────────
 * Pulsar el día que YA está abierto lo pone en renombrado, exactamente como el
 * bloque abierto en la tira del programa. No hay lápiz: la ley de los gestos de
 * la casa dice que la caja se enciende y el verbo va en azul, y un lápiz por
 * cada día sería siete lápices en un renglón de nombres.
 *
 * ── Y el «+» dice «día», a secas ──────────────────────────────────────────
 * Decía «+ día de descanso», porque lo único que sabía hacer el plan era
 * encender su segunda columna. Un día nuevo puede ser el alto en hidratos, el
 * de piernas o el domingo: el rótulo prometía menos de lo que ahora se puede
 * dar, y el nombre lo pone quien lo añade.
 *
 * @param {Array}  dias      `[{ id, name, sub }]` — el sub va en voz baja.
 * @param {string} activo    Id del día que se está mirando.
 * @param {node}   [derecha] La barra de mandos de la cinta, tras el hueco
 *                           elástico: TODOS los verbos, como en la del programa.
 * @param {Array}  [casillas] `[{ key, corto, sesion, dia, items }]` — el reparto
 *                           del ciclo. Sin él (o con un solo día) la segunda
 *                           fila no existe.
 *
 * ── Y CADA DÍA ES DONDE CAE LO QUE LLEVAS ─────────────────────────────────
 * `soltar` = `{ sobre, zona, pegar }` de `useZonasDeSoltar`, o `null` cuando no
 * viaja nada que quepa aquí. Con él, arrastrar una comida desde la mano hasta
 * la pestaña de «bajo» la copia allí sin salir del día que se está montando.
 *
 * Es lo que sustituye al ⇄ «Copiar esta comida a…» que vivía en la fila de cada
 * comida: a qué día va es ELEGIR CUÁL, y eso se arrastra —la ley del arrastre
 * de `lib/portapapeles`—, no se contesta con una lista de días repetida en cada
 * fila. La misma figura que las columnas de la rejilla del bloque.
 *
 * El día ABIERTO nunca es zona: pegar en el menú que ya se está mirando es el
 * verbo de la mano, que está a la vista. Lo filtra quien pasa `soltar`.
 */
export const TiraDeLaDieta = ({
  dias,
  activo,
  onDia,
  onMas = null,
  onRenombrar = null,
  masPalabra = 'día',
  derecha = null,
  casillas = null,
  avisoCiclo = null,
  soltar = null,
}) => {
  const [renombrando, setRenombrando] = useState(false);

  return (
    <nav className="tira dieta-tira" aria-label="Los días de esta dieta">
      <div className="tira-fila">
        <div className="tira-camino">
          <div className="tira-lista">
            {/* El `tablist` envuelve SOLO las pestañas: el «+» no es un día, y
                dentro de la lista se colaba en el árbol de accesibilidad como si
                fuera uno más. La misma corrección que ya lleva la tira del
                programa. */}
            <div className="tira-tabs" role="tablist" aria-label="Días de la dieta">
              {dias.map((dia) => {
                const esEste = dia.id === activo;

                if (esEste && renombrando && onRenombrar) {
                  return (
                    <RenombrarEnSitio
                      key={dia.id}
                      value={dia.name}
                      label="Nuevo nombre del día"
                      onRename={(nombre) => onRenombrar(dia.id, nombre)}
                      onDone={() => setRenombrando(false)}
                    />
                  );
                }

                /* Solo los días que NO son el abierto reciben: ver la cabecera.
                   En reposo `soltar` es `null` y aquí no se monta ni un
                   manejador, que es la ley del reposo del arrastre.

                   `recibe` gobierna las DOS mitades —los manejadores y la marca
                   de encendido—, para que no puedan discrepar: un día que se
                   ilumina sin aceptar nada promete algo que no va a pasar. */
                const recibe = Boolean(soltar) && !esEste;
                const cae = recibe ? soltar.zona(dia.id, (pieza) => soltar.pegar(pieza, dia.id)) : {};

                return (
                  <button
                    key={dia.id}
                    type="button"
                    role="tab"
                    aria-selected={esEste}
                    className={`tira-eslabon${esEste ? ' is-on' : ''}${
                      recibe && soltar.sobre === dia.id ? ' is-drop-target' : ''
                    }`}
                    onClick={() => (esEste ? setRenombrando(Boolean(onRenombrar)) : onDia(dia.id))}
                    title={
                      esEste
                        ? `${dia.name}${onRenombrar ? ' · púlsalo para renombrarlo' : ''}`
                        : [`Ver ${dia.name.toLowerCase()}`, dia.sub].filter(Boolean).join(' · ')
                    }
                    {...cae}
                  >
                    <span className="tira-eslabon-nombre">{dia.name}</span>
                    {dia.sub && <span className="tira-eslabon-aqui">{dia.sub}</span>}
                  </button>
                );
              })}
            </div>

            {onMas && <BotonMas palabra={masPalabra} onClick={onMas} title={`Añadir ${masPalabra}`} />}

            {/*
              ══ AQUÍ HUBO UN «···», Y ANTES DE ESO NADA ══════════════════════

              El menú del día vivía pegado a los nombres con el argumento de que
              lo que llevaba dentro actuaba sobre el día abierto. Cuando se
              deshizo en iconos, ese argumento dejó de sostener el sitio: dos
              mandos aquí y el resto en el canto derecho parten en dos una barra
              que se lee de una pasada. El dueño, con la pantalla delante:
              «creo que deberían ir todos a la derecha».

              Y es lo que ya hace la otra cinta de la casa: en `TiraDelPrograma`
              TODOS los verbos —copiar, traer, ajustes, papelera— van después
              del hueco elástico. Una sola barra de mandos por cinta, siempre en
              el mismo canto. Van en `derecha`.
            */}
          </div>
        </div>

        <span className="tira-hueco" />
        {derecha}
      </div>

      {/*
        ══ FILA 2 · A QUÉ CASILLA DEL CICLO LE TOCA CADA DÍA ════════════════

        Solo existe con más de un día: repartir el ciclo entre un único día es
        contestar una pregunta que nadie ha hecho.

        Y es lo que desbloquea las tres cosas que faltaban: la media del ciclo
        ponderada exacta —en un ciclado, ni el alto ni el bajo son «sus
        calorías»—, que el portal abra por el día que toca en vez de por
        «entreno» un domingo, y que la foto que se guarda con cada pesaje
        signifique algo.

        ── Las casillas llegan hechas ────────────────────────────────────────
        Siete con nombre de día si entrena por semanas; los días del microciclo
        —descansos incluidos— si su ciclo es rotativo. Esta pieza no distingue:
        pinta las que le den, y por eso la rejilla es de columnas automáticas y
        no de siete. Ver `cycleSlots`.
      */}
      {casillas && (
        <div className="tira-fila dieta-semana">
          {/* Qué es este renglón. Sin él, nueve casillas con dos palabras cada
              una se leen como una tira suelta debajo de las pestañas —y la
              pregunta que contestan («¿a quién le toca cada día?») había que
              deducirla del contenido—. Va en la voz de un rótulo de sección y
              no en la de un titular: manda la fila de arriba. */}
          <span className="dieta-semana-k">Le toca</span>
          <div className="tira-lista">
            {casillas.map(({ key, corto, sesion, dia, items }) => (
              <MenuAcciones
                key={key}
                clase={`tira-dia-semana${dia ? ' is-on' : ''}`}
                label={
                  <>
                    <span className="tira-dia-corto">
                      {corto}
                      {/* La sesión que cae ahí, en voz aún más baja: es lo que
                          hace reconocible un «D4», y en el ciclo semanal el
                          nombre del día ya lo dice todo. */}
                      {sesion && <em className="tira-dia-sesion">{sesion}</em>}
                    </span>
                    <span className="tira-dia-nombre">{dia ? dia.name : '—'}</span>
                  </>
                }
                ariaLabel={`${corto}${sesion ? ` (${sesion})` : ''}: ${dia ? dia.name : 'sin asignar'}`}
                items={items}
                alineado="izquierda"
                sinFlecha
              />
            ))}
          </div>
          <span className="tira-hueco" />
          {avisoCiclo}
        </div>
      )}
    </nav>
  );
};
