import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dumbbell } from 'lucide-react';

import { exerciseTrend, nextPrescription } from '@/domain/week';
import { useApp } from '@/context/AppContext';
import { shortDate } from '@/lib/dates';
import { clientPath } from '@/routes';
import { Fold, Panel } from '@/components/ui/primitives';
import { ExerciseCard } from '@/components/review/ExerciseCard';
import { ExerciseSheet } from '@/components/review/ExerciseSheet';

/**
 * EL ENTRENO DE LA SEMANA: una recta por ejercicio, y el registro a un toque.
 *
 * ══ Tres intentos, y lo que fallaba en los dos primeros ═════════════════════
 *
 *   1. **Una fila de cifras derivadas** — un dibujito de 76 px, «45 → 45» y una
 *      palabra. Ni un dato del registro, y con dos semanas de historial el
 *      dibujito es un segmento recto flotando en mitad del renglón.
 *   2. **Una tabla con dos sesiones al lado** — esta semana contra la anterior,
 *      en crudo. Ya sí era el registro, pero contesta media pregunta: dice si
 *      subió respecto de la última vez y esconde la forma. Alguien que sube, baja
 *      y vuelve a subir está **estancado** aunque la última flecha diga que
 *      subió, y en dos columnas eso no se ve nunca. Además ocho ejercicios eran
 *      ochenta cifras en una rejilla de cinco columnas: un listado de texto, que
 *      es exactamente de lo que se venía huyendo.
 *
 * Lo que hacía falta era lo que se mira primero de verdad: **la recta**. Una
 * tarjeta por ejercicio con su cifra grande, su recorrido dibujado y sus series
 * debajo — y la recta se desliza, así que se recorre el bloque entero comparando
 * cualquier semana con la de al lado sin abrir nada. Ver `ExerciseCard`.
 *
 *     PUSH · 11 ago                             5 de 6 series · sube en 1
 *     ┌── Press Banca ───────┐ ┌── Press Militar ─────┐
 *     │ 45 kg × 8   ↑ vs S2  │ │ 30 kg × 3   ↓ vs S2  │
 *     │        ╭──●  45      │ │  ●───╮               │
 *     │  40 ●──╯             │ │  30   ╰──● 30        │
 *     │  S1        S3        │ │  S1        S3        │
 *     │  45×8 45×8 45×6      │ │  30×3                │
 *     └──────────────────────┘ └──────────────────────┘
 *
 * ── Y el registro completo, a un toque ─────────────────────────────────────
 * La cabecera de cada tarjeta abre el historial del ejercicio: fecha a fecha,
 * serie a serie, con la tope marcada. La tarjeta enseña la forma y la semana que
 * señales; el archivo entero es otra cosa y se consulta y se cierra. Ver
 * `ExerciseSheet`.
 *
 * ── Se DIBUJA con kilos y se CLASIFICA con 1RM estimado ────────────────────
 * La regla de esta pantalla es que el 1RM estimado no se ENSEÑA —es una cifra
 * derivada con varios kilos de margen y decidiría por el entrenador—. Usarla
 * para ordenar tres palabras es otra cosa, y hace falta: `100×3` y `100×10` son
 * el mismo peso y dos esfuerzos distintos. El porqué entero, en `exerciseTrend`.
 */

/** Cómo va el día entero. Dice si el problema es de un ejercicio o de todos. */
const reparto = (ejercicios) => {
  const cuenta = { up: 0, flat: 0, down: 0 };
  for (const e of ejercicios) if (e.done && e.trend) cuenta[e.trend] += 1;
  return [
    cuenta.up > 0 ? `sube en ${cuenta.up}` : null,
    cuenta.flat > 0 ? `igual en ${cuenta.flat}` : null,
    cuenta.down > 0 ? `baja en ${cuenta.down}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
};

export const TrainingCard = ({ dias = [], porDia, semana, microcycles = [], sesiones, client }) => {
  const [abierto, setAbierto] = useState(null);
  const { addExerciseSetSlot, removeExerciseSetSlot, updateExerciseTarget } = useApp();

  /*
    ══ DÓNDE se escribe un ajuste, y por qué no es aquí mismo ═════════════════

    La semana que se está revisando ya se entrenó: escribir en ella reescribiría
    su registro sin cambiarle nada de lo que viene. El ajuste va a la primera
    semana POSTERIOR en la que ese ejercicio siga programado, y si no hay
    ninguna no se ofrece — ver `nextPrescription` en `domain/week.js`, que es
    donde vive la regla y donde está probada.
  */
  const receta = useMemo(
    () => (abierto ? nextPrescription({ microcycles, name: abierto, afterWeek: semana }) : null),
    [abierto, microcycles, semana]
  );

  const ajustarProxima = (que, valor) => {
    if (!receta || !client?.id) return;
    const { weekNumber, dayName, id } = receta;

    if (que === 'series') {
      if (valor > 0) addExerciseSetSlot(client.id, weekNumber, dayName, id);
      else removeExerciseSetSlot(client.id, weekNumber, dayName, id);
      return;
    }
    updateExerciseTarget(client.id, weekNumber, dayName, id, valor);
  };

  /*
    El seguimiento de cada ejercicio: todas sus semanas con las series en crudo.
    Es lo que dibuja la recta de cada tarjeta y lo que llena su ficha, así que se
    calcula UNA vez aquí y se reparte — pedirlo dentro de cada tarjeta lo
    recalcularía a cada deslizamiento del dedo.

    Recorre todos los microciclos una vez por ejercicio —ocho ejercicios sobre
    veinticuatro semanas—, que es trabajo de memoria sobre datos que ya están
    cargados: ni una consulta.
  */
  const tendencias = useMemo(() => {
    const mapa = new Map();
    for (const lista of porDia?.values() || []) {
      for (const ejercicio of lista) {
        if (mapa.has(ejercicio.name)) continue;
        mapa.set(
          ejercicio.name,
          exerciseTrend({ microcycles, name: ejercicio.name, weekNumber: semana })
        );
      }
    }
    return mapa;
  }, [porDia, microcycles, semana]);

  return (
    /* El subtítulo dice lo que hay, no cómo se usa. Decía además «desliza por la
       recta para comparar; pulsa el nombre para ver el registro entero», que es
       un manual de instrucciones dentro de la pantalla: el cursor de mira, el
       punto que se mueve y la flecha de la cabecera enseñan las dos cosas en
       medio segundo, y una aplicación que explica sus propios gestos con texto
       es una que no confía en ellos. */
    <Panel
      className="bloque"
      rango="bloque"
      aria-label="Su entrenamiento"
      title="Su entreno"
      sub="La carga de cada ejercicio, semana a semana."
      action={
        <div className="row gap-2 wrap">
          {sesiones && (
            <span className={`badge ${sesiones.done >= sesiones.planned ? 'badge-ok' : 'badge-warn'}`}>
              {sesiones.done} de {sesiones.planned} sesiones
            </span>
          )}
          <Link
            className="btn btn-quiet btn-sm"
            to={clientPath(client?.id, 'rutina')}
            state={{ revisionDe: client?.id, revisionNombre: client?.name }}
          >
            <Dumbbell size={13} /> Su rutina
          </Link>
        </div>
      }
    >

      {dias.length === 0 ? (
        <p className="t-sm t-tertiary">Esta semana no tiene días montados.</p>
      ) : (
        <div className="dias">
          {dias.map((dia) => {
            const ejercicios = porDia.get(dia.dayName) || [];
            /*
              Un día puede tener sesión abierta y NINGUNA serie anotada: eso es
              haber pulsado «empezar» y no haber entrenado, y leerlo como «día
              hecho» es lo que hacía que el bloque dijera «0 de 9 series» debajo
              de un día que se daba por bueno.
            */
            const hecho = dia.done && dia.loggedSets > 0;
            const patron = hecho ? reparto(ejercicios) : '';
            /*
              ══ EL DÍA SE PLIEGA, Y LO DECIDE EL DATO ═════════════════════════

              Una semana de entreno son entre tres y seis días, y cada día son
              seis u ocho ejercicios: entre veinte y treinta tarjetas seguidas,
              cada una con su gráfica, su cifra y sus series. Eso es la mitad de
              la queja de «hay demasiada información»: la pantalla lo enseña TODO
              a la vez y con el mismo peso, así que el ojo no tiene por dónde
              entrar y hay que leerla entera para saber si algo va mal.

              Plegado, un día es una línea que ya contesta la pregunta con la que
              se abre una revisión: «Push A · lun 11 · 18 de 18 series · sube en
              3 · igual en 2». Seis líneas en lugar de treinta tarjetas, y el
              detalle a un toque.

              ── Y arranca PLEGADO siempre ─────────────────────────────────────
              La primera versión lo abría «solo si había algo que mirar»: día no
              entrenado o series a medias. Sobre el papel es la regla buena —la
              misma que usa la anamnesis de la ficha— y con datos de verdad no
              condensa nada: un cliente que registra parte de sus series deja
              TODOS los días a medias, así que se abrían los seis y la pantalla
              quedaba igual que antes con un galón de más.

              Plegado siempre. Y lo que la regla quería conseguir lo consigue
              mejor el resumen: sobre seis líneas cerradas, un «no entrenado» o
              un «12 de 18 series» se ve MÁS, no menos, porque no está enterrado
              entre treinta tarjetas.

              No esconde nada, porque el resumen va en la propia fila — que es lo
              que distingue plegar de esconder.
            */
            return (
              <Fold
                key={dia.dayName}
                title={dia.dayName}
                summary={[
                  hecho && dia.date ? shortDate(dia.date) : null,
                  hecho ? null : 'no entrenado',
                  Number.isFinite(dia.plannedSets)
                    ? `${dia.loggedSets ?? 0} de ${dia.plannedSets} series`
                    : null,
                  patron,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              >
                {/* Lo que escribió al terminar, pegado a su día. */}
                {dia.note && <p className="dia-nota">«{dia.note}»</p>}

                {ejercicios.length > 0 && (
                  <div className="ejercs">
                    {ejercicios.map((ejercicio) => (
                      <ExerciseCard
                        key={ejercicio.name}
                        ejercicio={ejercicio}
                        trend={tendencias.get(ejercicio.name)}
                        semana={semana}
                        onOpen={() => setAbierto(ejercicio.name)}
                      />
                    ))}
                  </div>
                )}
              </Fold>
            );
          })}
        </div>
      )}

      {/* El registro completo de un ejercicio, semana a semana. */}
      {/* El registro completo de un ejercicio, y la puerta a cambiarlo.

          Hasta ahora la revisión dejaba AJUSTAR la dieta en el sitio y no dejaba
          tocar el entreno: para subirle una serie había que salir a su rutina,
          buscar el día, buscar el ejercicio y volver. Esa asimetría entre las dos
          cosas que un entrenador ajusta era media queja de «saltar entre
          ventanas», y con la mitad de la pantalla ocupada por el entreno.

          El editor de series dentro del panel es la pieza que falta y es trabajo
          de verdad —el modelo de microciclos vive en `Workout/`—. Lo que sí se
          puede cerrar ya es el viaje: desde aquí se va a su rutina llevando de
          quién se venía, y `VueltaALaRevision` devuelve al mismo sitio. Antes se
          entraba a la rutina desde la cabecera del bloque, sin saber a por qué
          ejercicio ibas. */}
      <ExerciseSheet
        open={Boolean(abierto)}
        trend={abierto ? tendencias.get(abierto) : null}
        onClose={() => setAbierto(null)}
        receta={receta}
        onAjustar={ajustarProxima}
        ajustar={
          client?.id
            ? {
                to: clientPath(client.id, 'rutina'),
                state: { revisionDe: client.id, revisionNombre: client.name },
              }
            : null
        }
      />
    </Panel>
  );
};
