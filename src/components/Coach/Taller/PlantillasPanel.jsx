import { useState } from 'react';
import {
  ClipboardCheck,
  Copy,
  FolderOpen,
  LayoutTemplate,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';

import { useActions, useApp } from '@/context/AppContext';
import { IconoEquivalencia } from '@/components/ui/IconoEquivalencia';
import {
  CAJONES,
  FORMAS,
  comoPiezaDelPortapapeles,
  guardadosDe,
  lineasDe,
  resumenDe,
} from '@/domain/cajon';
import { piecesOf } from '@/domain/pieces';
import { platoMacros, platosOf } from '@/domain/platos';
import { MAX_GRUPOS, grupoSummary, gruposOf } from '@/domain/gruposEquiv';
import { MACROS } from '@/domain/nutrition';
import { coverageSaid, microSaid, sumMicros } from '@/domain/micros';
import { dayMonthMaybeYear } from '@/lib/dates';
import { TIPO, copiar as copiarAlPortapapeles, usePortapapeles } from '@/lib/portapapeles';
import {
  EL_CAJON,
  FORMAS_CON_CAJON,
  useGuardarEnPlantillas,
} from '@/components/Coach/guardarEnPlantillas';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { Destino } from '@/components/ui/Portapapeles';
import { EmptyState, RenombrarEnSitio } from '@/components/ui/primitives';
import { Cinta } from '@/components/ui/Cinta';

/**
 * TUS PLANTILLAS: lo que has guardado con nombre, de entreno y de dieta.
 *
 * ══ Por qué hacía falta una pantalla ═══════════════════════════════════════
 *
 * El cajón guarda hasta treinta días con nombre —«mi mejor día de pierna»— y
 * hasta hoy solo se podían ver desde el cajón de un bloque abierto. Quien
 * guarda su criterio y luego no encuentra dónde está deja de guardarlo: una
 * biblioteca invisible se comporta igual que una que no existe.
 *
 * ══ Y por qué los PLATOS entran aquí y no por una sexta puerta ═════════════
 *
 * Un plato es una ración guardada con nombre —«desayuno de definición»— y es
 * exactamente la misma clase de cosa que una pieza: **tu criterio, guardado
 * para reutilizarlo**. Da igual de qué área sea.
 *
 * Tres motivos, y el tercero es el que decide:
 *
 *   · La barra del Taller mantiene sus **cinco puertas**, que es la cuenta con
 *     la que se diseñó.
 *   · Es honesto: si «plantilla» significa criterio guardado, un plato lo es.
 *   · Y esta pantalla ya **exhibe y no compone** —renombra, borra y deja leer lo
 *     que lleva dentro—, que es exactamente la regla que un plato necesita.
 *
 * ══ Y los BLOQUES, que eran el hueco ═══════════════════════════════════════
 *
 * *«Aún sigo sin poder copiar los bloques en plantilla.»* Y era el caro: un día
 * suelto se rehace en cinco minutos, y un bloque son cuatro a ocho hojas con
 * sus ejercicios y sus series —el trabajo de una tarde, y lo único que un
 * entrenador reconoce como suyo de verdad—. La biblioteca guardaba lo barato y
 * tiraba lo caro cada vez que se cambiaba de cliente.
 *
 * ══ El cuarto tramo: TUS GRUPOS de equivalencia ════════════════════════════
 *
 * «Mi proteína magra» son estos cinco alimentos y no los treinta del catálogo.
 * Es la misma clase de cosa por cuarta vez —criterio tuyo, con nombre, para
 * reutilizarlo—, así que entra por la misma puerta y con la misma regla: aquí
 * se mira, se renombra y se borra; se monta desde la ventana de equivalencias de
 * un alimento, que es donde se está viendo la lista que sobra.
 *
 * ── Aquí se MIRA; se pone donde se monta ──────────────────────────────────
 * Nada se coloca desde aquí. Una pieza entra desde el cajón del bloque, un
 * plato desde el buscador de la comida y un bloque desde la lista de bloques,
 * que es donde está el contexto —qué cliente, qué bloque, qué objetivo—.
 * Mezclarlo obligaría a elegir cliente desde una pantalla que no habla de
 * clientes. Cada tramo lo dice en su pie.
 *
 * ── …y aquí se GUARDA, que es lo que faltaba ──────────────────────────────
 * *«No veo que se pueda pegar en plantillas… entras a plantillas y debería
 * valer.»* Y era cierto: ésta era la pantalla del material guardado y la única
 * de la casa que no se registraba como DESTINO, así que llegabas con una comida
 * en la mano y la mano se quedaba en gris.
 *
 * Ahora se registra con el verbo «Guardar» (`Destino`, abajo del todo), así que
 * la mano se enciende sola al llegar: «Guardar «Comida 1» en tus plantillas».
 * Y el verbo vive TAMBIÉN donde caen las cosas, en la cinta, como en el resto
 * del producto. Guardar no rompe la ley de arriba: no elige cliente ni compone
 * nada, solo se queda con lo que ya llevabas montado.
 *
 * ══ De dónde lee: el CAJÓN, no las preferencias ════════════════════════════
 *
 * Esta pantalla bifurcaba once veces por `enDias` —cabecera, columnas, vacío,
 * resumen, lo que se ve al abrir, el rótulo de renombrar, el aviso de borrar— y
 * con el tercer tramo cada uno de esos ternarios habría pasado a tener tres
 * ramas. Ahora lo que cambia de una forma a otra lo dice `CAJONES`
 * (`domain/cajon`) y lo guardado vive en la tabla `coach_templates` del equipo
 * (migración 0112), no en `profiles.preferences`, que se lee entera al arrancar
 * y se reescribe entera en cada guardado. Ver
 * `docs/replanteamiento-lo-guardado.md`.
 *
 * **Los grupos no se mudan con ellos**: un cajón guarda piezas del portapapeles
 * —cosas que se COLOCAN en un cliente— y un grupo no se coloca en ninguna
 * parte, se aplica solo donde salga alguno de sus alimentos. Por eso se queda
 * en `preferences`, que es donde §8 de ese mismo replanteamiento deja también
 * los formularios y los protocolos. Su tramo es el único que se describe aquí
 * abajo a mano, y es a propósito.
 */

/** Lo que la PANTALLA pone de su parte: el icono del vacío. Lo demás sale del
 *  dominio. Un icono es un componente y `domain/` no importa de `lucide`. */
const DIBUJO = {
  /* El mismo que la mano le da a un bloque copiado (`ICONO` en
     `ManoDelPortapapeles`): la plantilla y la pieza en la mano son la misma
     cosa con y sin caducidad, y se dibujan igual. */
  [TIPO.BLOQUE]: { icono: FolderOpen },
  [TIPO.HOJA]: { icono: LayoutTemplate },
  [TIPO.PLATO]: { icono: UtensilsCrossed },
};

/**
 * En qué sección de `preferences` vivía cada forma antes de la 0112.
 *
 * Sirve solo para el PUENTE de `useCajon`: si la tabla no contesta —falta la
 * migración, o hay un fallo de red— el cajón se lee de las preferencias y sus
 * filas llegan marcadas con `deLasPreferencias`. Renombrar o borrar una de ésas
 * contra la tabla no fallaría: no encontraría fila, y la pantalla diría que se
 * hizo algo que no se hizo. Ver el 403 invisible de `politicas-rls-sin-grant`.
 */
const SECCION_VIEJA = {
  [TIPO.HOJA]: { seccion: 'piezas', lista: piecesOf },
  [TIPO.PLATO]: { seccion: 'platos', lista: platosOf },
};

export const PlantillasPanel = () => {
  const { coachPrefs, cajon } = useApp();
  const { updateCoachPreferences, renombrarEnCajon, borrarDelCajon } = useActions();
  const confirm = useConfirm();
  const [tramo, setTramo] = useState(TIPO.BLOQUE);
  const [abierta, setAbierta] = useState(null);
  const [renombrando, setRenombrando] = useState(null);

  const grupos = gruposOf(coachPrefs);

  /* Lo que llevas y tiene dónde caer AQUÍ. Sin filtrar por el tramo que estés
     mirando: llegar con una comida en la mano y que el verbo no salga por estar
     en «Días» sería pedirle a alguien que adivine en qué pestaña se guarda algo
     que todavía no ha guardado. Se guarda y la pantalla va al tramo donde ha
     caído. */
  const enLaMano = usePortapapeles(FORMAS_CON_CAJON);
  const guardarEnPlantillas = useGuardarEnPlantillas();

  const guardarLoQueLlevas = async (pieza) => {
    const guardado = await guardarEnPlantillas(pieza);
    if (guardado) setTramo(guardado);
  };

  /*
    Los cuatro tramos. Los tres del cajón salen de `CAJONES` —el mismo sitio del
    que sale qué se limpia al guardar y qué se puede guardar— y el de los grupos
    se describe entero aquí, porque no es una pieza del portapapeles y no tiene
    entrada allí.
  */
  const delCajon = (kind) => ({
    ...CAJONES[kind],
    ...DIBUJO[kind],
    kind,
    lista: guardadosDe(cajon, kind),
    max: CAJONES[kind].tope,
    resumen: resumenDe,
    /* Lo que se ve al abrir la fila. La lista de líneas la da el dominio; un
       plato no la trae porque enseña sus macros, y eso es una tabla. */
    dentro: (item) => {
      const lineas = lineasDe(item);
      if (!lineas) return <PlatoDentro plato={item.carga} />;
      return (
        <ul className="pieza-lista">
          {lineas.map((l) => (
            <li key={l.clave}>
              {l.nombre}
              <span className="pieza-series">{l.detalle}</span>
            </li>
          ))}
        </ul>
      );
    },
  });

  const TRAMOS = {
    ...Object.fromEntries(FORMAS.map((kind) => [kind, delCajon(kind)])),
    grupos: {
      tramo: 'Grupos',
      /* Un grupo no se copia ni se pega: es un criterio, no una pieza que se
         coloque en ningún sitio. Ver el final de la cabecera. */
      kind: null,
      alaMano: null,
      lista: grupos,
      max: MAX_GRUPOS,
      seccion: 'gruposEquiv',
      queEs: 'el grupo',
      columna: 'Grupo',
      guardado: 'Guardado',
      resumen: (item) => grupoSummary(item, MACROS.find((m) => m.key === item.macro)?.label),
      dentro: (item) => <GrupoDentro grupo={item} />,
      /* Qué pasa a partir de ahora, no qué desaparece: la lista no se pierde,
         se vuelve a la calculada. */
      alBorrar:
        'Esos alimentos vuelven a ofrecer las equivalencias que calcula el catálogo. Ninguna dieta cambia.',
      pie: 'Se montan desde la ventana de equivalencias de un alimento, en cualquier dieta.',
      icono: IconoEquivalencia,
      vacio: {
        titulo: 'Todavía no has guardado ningún grupo',
        mensaje:
          'Cuando la lista de equivalencias de un alimento se te quede larga —«Huevo entero» ofrece cinco huevos del catálogo—, marca ahí las que de verdad valen y guárdalas con nombre. A partir de entonces ese alimento ofrece las tuyas.',
      },
    },
  };

  const t = TRAMOS[tramo];
  const lista = t.lista;
  /* De lo que llevas, lo que cae en el tramo que estás mirando. */
  const deEsteTramo = t.kind ? enLaMano.filter((p) => p.tipo === t.kind) : [];

  /* El puente de arriba: dónde hay que escribir esta fila. `null` = en el
     cajón, que es el caso normal. */
  const enLasPreferencias = (item) =>
    t.seccion
      ? { seccion: t.seccion, lista }
      : item?.deLasPreferencias && SECCION_VIEJA[item.kind]
        ? {
            seccion: SECCION_VIEJA[item.kind].seccion,
            lista: SECCION_VIEJA[item.kind].lista(coachPrefs),
          }
        : null;

  const renombrar = (item, nombre) => {
    const viejo = enLasPreferencias(item);
    if (!viejo) return renombrarEnCajon(item.id, nombre);
    return updateCoachPreferences(viejo.seccion, {
      items: viejo.lista.map((x) => (x.id === item.id ? { ...x, name: nombre } : x)),
    });
  };

  /* «Borrar» y no «tirar»: lo que sale del cajón no vuelve, y ésa es la prueba
     de la regla (`docs/producto.md` §5.7). «Tirar» era un tercer verbo para el
     mismo gesto, vivo solo en esta pantalla. El género lo pone la forma —«la
     plantilla», «el plato»—, que ya lo dice `CAJONES`. */
  const borrar = async (item) => {
    const ok = await confirm({
      title: `¿Borrar «${item.name}»?`,
      message: t.alBorrar,
      confirmLabel: t.queEs.startsWith('la ') ? 'Borrarla' : 'Borrarlo',
      tone: 'danger',
    });
    if (!ok) return;
    const viejo = enLasPreferencias(item);
    if (viejo) {
      updateCoachPreferences(viejo.seccion, { items: viejo.lista.filter((x) => x.id !== item.id) });
    } else {
      await borrarDelCajon(item.id);
    }
    if (abierta === item.id) setAbierta(null);
  };

  /*
    ── LA PUERTA QUE ESTA PANTALLA NO TENÍA ──────────────────────────────────
    Arriba está escrito por qué las plantillas no se colocan desde aquí:
    «obligaría a elegir cliente desde una pantalla que no habla de clientes».
    Sigue siendo verdad, y el portapapeles es precisamente la salida que
    faltaba — copiar no es colocar. Te llevas la plantilla en la mano, vas al
    cliente que sea y la sueltas donde la pantalla lo ofrezca.

    Las dos bibliotecas se reparten así: aquí vive lo que guardas CON NOMBRE y
    para siempre; el portapapeles es lo que llevas encima ahora mismo. No
    compiten.

    Qué formas vuelven a la mano y con qué nombre lo dice `alaMano`: un bloque
    se bautiza por `name`, una hoja por `dayName`, y un plato no vuelve —es una
    ración, no una comida, y pegarlo donde va una comida sería pegar otra cosa—.
  */
  const copiarPlantilla = (item) => {
    const pieza = comoPiezaDelPortapapeles(item);
    if (!pieza) return;
    copiarAlPortapapeles(pieza);
    /* Sin aviso, a propósito: lo dice la mano del portapapeles (ley II, ver
       `ui/Portapapeles`). El aviso es de lo que CAMBIA —y copiar no le cambia
       nada a nadie—; la mano es de lo que LLEVAS, y además se queda ahí. */
  };

  /* Los cuatro tramos siempre, aunque alguno esté vacío: la banda es también
     cómo se descubre que existen los bloques, los platos y los grupos. Con la
     cifra, que es lo que dice si hay algo detrás antes de pulsar. */
  const tramos = Object.entries(TRAMOS).map(([id, def]) => ({
    id,
    label: def.tramo,
    n: def.lista.length,
  }));

  /*
    EL VERBO DE GUARDAR, con la forma que ya tiene el de pegar un bloque
    (`verboPegarBloque` en `WorkoutLogEditor`): una pieza es un botón que la
    nombra —porque el nombre ES lo que va a pasar al pulsar— y varias son una
    pregunta, que es un menú. Nombrar la primera de tres sería elegir por el
    entrenador, que es la ley VI de la mano.
  */
  const verboDeGuardar = (clase, candidatas = enLaMano) => {
    if (candidatas.length === 0) return null;
    if (candidatas.length === 1) {
      const pieza = candidatas[0];
      return (
        <button type="button" className={clase} onClick={() => guardarLoQueLlevas(pieza)}>
          <ClipboardCheck size={15} aria-hidden="true" /> Guardar «{pieza.titulo}» aquí
        </button>
      );
    }
    return (
      <MenuAcciones
        clase={clase}
        label="Guardar lo que llevas"
        ariaLabel="Guardar en tus plantillas una de las piezas que llevas"
        items={candidatas.map((pieza) => ({
          icon: ClipboardCheck,
          label: `«${pieza.titulo}»`,
          sub: [pieza.detalle, pieza.origen?.cliente].filter(Boolean).join(' · '),
          run: () => guardarLoQueLlevas(pieza),
        }))}
      />
    );
  };

  return (
    <div className="stack cascada">
      <div className="taller">
        <Cinta
          titulo="Plantillas"
          tramos={tramos}
          tramo={tramo}
          onTramo={setTramo}
          /* En el vacío el verbo baja al centro de la pantalla, que es donde
             está el ojo y donde la frase ya lo está pidiendo. Dicho en los dos
             sitios a la vez serían dos ofertas del mismo gesto. */
          accion={lista.length > 0 ? verboDeGuardar('btn btn-primary btn-sm') : null}
        />

        <div className="cartera-cuerpo">
          {lista.length === 0 ? (
            <EmptyState
              icon={t.icono}
              title={t.vacio.titulo}
              /* Un vacío es una invitación, no un aviso — y menos aún cuando lo
                 que invita a traer ya lo llevas en la mano. Con algo copiado, la
                 frase deja de explicar dónde se guarda y lo hace el botón.

                 Y aquí SÍ se filtra por el tramo, al revés que la cinta: bajo
                 «Todavía no has guardado ningún día», un botón que guarda una
                 comida contesta a otra pregunta. Lo que no sea de este tramo
                 sigue ofreciéndolo la mano, que no promete tramo ninguno. En
                 «Grupos» no hay candidatas nunca: un grupo no sale del
                 portapapeles. */
              message={
                deEsteTramo.length > 0
                  ? 'Lo que llevas copiado se queda aquí con su nombre, y lo puedes poner en cualquier cliente.'
                  : t.vacio.mensaje
              }
              action={verboDeGuardar('btn btn-primary', deEsteTramo)}
            />
          ) : (
            <>
              <div className="plantilla">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t.columna}</th>
                      <th scope="col">Qué lleva</th>
                      <th scope="col">{t.guardado}</th>
                      <th scope="col" aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {/* Renombrar EN SITIO, como en el resto del producto:
                              el nombre se pulsa y se convierte en campo. Un
                              diálogo para cambiar una palabra es un viaje. */}
                          {renombrando === item.id ? (
                            <RenombrarEnSitio
                              value={item.name}
                              onRename={(nombre) => renombrar(item, nombre)}
                              onDone={() => setRenombrando(null)}
                              label={`el nombre de ${t.queEs}`}
                            />
                          ) : (
                            <span className="p-name">
                              <button
                                type="button"
                                className="p-abrir"
                                onClick={() => setRenombrando(item.id)}
                                title="Pulsa para renombrarlo"
                              >
                                {item.name}
                              </button>
                            </span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="p-abrir"
                            onClick={() => setAbierta(abierta === item.id ? null : item.id)}
                            aria-expanded={abierta === item.id}
                          >
                            {t.resumen(item)}
                          </button>
                          {abierta === item.id && t.dentro(item)}
                        </td>
                        <td>{item.savedAt ? dayMonthMaybeYear(item.savedAt) : '—'}</td>
                        <td>
                          {t.alaMano && (
                            <button
                              type="button"
                              className="btn btn-icon"
                              aria-label={`Copiar ${item.name} al portapapeles`}
                              title="Copiar al portapapeles para ponerlo en un cliente"
                              onClick={() => copiarPlantilla(item)}
                            >
                              <Copy size={15} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-icon btn-icon-danger"
                            aria-label={`Borrar ${item.name}`}
                            onClick={() => borrar(item)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* El tope existe en el dominio («más de treinta ya no es una
                  biblioteca de piezas: es otro archivador») y hasta ahora solo
                  se veía al chocar con él. */}
              <p className="t-xs taller-pie">
                {lista.length} de {t.max}. {t.pie}
              </p>
            </>
          )}
        </div>
      </div>

      {/*
        AQUÍ CAE LO QUE LLEVAS. Con el verbo «Guardar» y no «Pegar», que es
        justo para lo que `registrarDestino` lo acepta: pegar escribe en el
        trabajo de una persona; guardar se queda una copia en tu cajón y no le
        toca nada a nadie.

        El destino es de la PANTALLA y no del tramo: llegar con una comida
        mientras miras «Días» tiene que valer igual, y guardarla lleva la vista
        a «Platos», que es donde ha caído.
      */}
      <Destino
        tipos={FORMAS_CON_CAJON}
        donde={EL_CAJON}
        verbo="Guardar"
        prioridad={0}
        pegar={guardarLoQueLlevas}
      />
    </div>
  );
};

/**
 * Lo que lleva un plato, y la tira que lo resume.
 *
 * ── Un número más, no doce ────────────────────────────────────────────────
 * Junto a las kcal y los tres macros va **la fibra**, y ninguna otra de las
 * cuatro del envase. Es la que un entrenador pauta de verdad, la que el cliente
 * nota, y —lo que la hace distinta— la única cuya contraparte ya existe: la
 * pregunta `digestion` del check-in. Componer es el momento en que decides qué
 * va con qué, y por eso está aquí y no en un panel de análisis.
 *
 * ── Y viaja con su cobertura ──────────────────────────────────────────────
 * Si dos de los tres alimentos declaran fibra, la cifra es un SUELO y no un
 * total. Decirlo cuesta una línea atenuada; callarlo convierte un suelo en una
 * medida, que es mentir con un número. Ver `micros.js`.
 */
const PlatoDentro = ({ plato }) => {
  const macros = platoMacros(plato);
  const fibra = sumMicros(plato.foods || []).fiber;
  const cobertura = coverageSaid(fibra);

  return (
    <>
      <ul className="pieza-lista">
        {(plato.foods || []).map((f, i) => (
          <li key={`${f.name}-${i}`}>
            {f.name}
            <span className="pieza-series">
              {f.showAs === 'units' && f.unitLabel
                ? `${Math.round((f.grams / f.unitGrams) * 10) / 10} ${f.unitLabel}`
                : `${f.grams} g`}
            </span>
          </li>
        ))}
      </ul>
      <p className="t-xs t-tertiary">
        {Math.round(macros.kcal)} kcal · {Math.round(macros.protein)} P ·{' '}
        {Math.round(macros.carbs)} HC · {Math.round(macros.fats)} G ·{' '}
        {microSaid('fiber', fibra)}
      </p>
      {cobertura && <p className="t-xs t-tertiary">Fibra: {cobertura}.</p>}
    </>
  );
};

/**
 * Lo que lleva un grupo: los nombres, y nada más.
 *
 * **Sin cantidades a propósito**, que es lo que lo distingue de un plato: un
 * grupo no guarda raciones, guarda qué vale por qué. La ración se calcula cada
 * vez contra el alimento que haya delante (ver `domain/gruposEquiv`), así que
 * escribir aquí unos gramos sería inventarse un caso concreto.
 */
const GrupoDentro = ({ grupo }) => {
  const macro = MACROS.find((m) => m.key === grupo.macro)?.label?.toLowerCase();
  return (
    <>
      <ul className="pieza-lista">
        {(grupo.foods || []).map((nombre) => (
          <li key={nombre}>{nombre}</li>
        ))}
      </ul>
      <p className="t-xs t-tertiary">
        Cuando alguno salga en una dieta se ofrecen los otros {grupo.foods.length - 1}, con la
        ración que iguala {macro ? `su ${macro}` : 'su macro'}.
      </p>
    </>
  );
};
