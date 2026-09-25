import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';

import {
  WEEK_DAYS,
  anadirDiaDespues,
  arrastrarDia,
  cadenaDe,
  cambiarTipo,
  conTandas,
  diasDeLaHoja,
  entrenosDe,
  hojasSinDia,
  ponerDia,
  quitarDia,
  vecesDeCadaHoja,
} from '@/domain/training';
import { MAX_BLOCK_SPLIT } from '@/domain/blocks';
import { useArrastreOrden } from '@/lib/useArrastreOrden';
import { useCapaFlotante } from '@/lib/useCapaFlotante';
import { useEsTelefono } from '@/lib/useMediaQuery';
import { Hoja } from '@/components/ui/Hoja';
import { SegmentedControl } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';

const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Escribir la secuencia, con su Deshacer, y COLOCAR una hoja en un día.
 *
 * Colocar vive aquí y no en cada pantalla porque es una regla del dueño y va en
 * un solo sitio: si el día ya tiene otra hoja, se pregunta nombrándola —«El
 * jueves ya tiene Push A»— y se dice qué le pasa a la que sale (sigue en sus
 * otros días o se queda sin día). La usan el editor del microciclo y el rótulo
 * del día de cada columna de la vista de bloque.
 *
 * `cambiar(nuevo, texto)` escribe y ofrece Deshacer con la secuencia de antes;
 * devuelve si escribió. `colocar(hoja, i, { cancelar })` devuelve `false` si se
 * canceló la pregunta.
 */
export const useCambiosDelMicrociclo = (microciclo, onCambiar) => {
  const toast = useToast();
  const confirm = useConfirm();
  const rotativo = microciclo?.tipo === 'rotativo';

  const nombreDia = (i, { largo = false } = {}) =>
    rotativo ? (largo ? `el día ${i + 1}` : `Día ${i + 1}`) : largo ? `el ${WEEK_DAYS[i].toLowerCase()}` : WEEK_DAYS[i];

  const cambiar = (nuevo, texto) => {
    if (!nuevo || nuevo === microciclo) return false;
    const antes = microciclo;
    onCambiar(nuevo);
    toast({
      text: texto,
      action: { label: 'Deshacer', onClick: () => onCambiar(antes) },
    });
    return true;
  };

  const colocar = async (hoja, i, { cancelar = 'Cancelar' } = {}) => {
    const actual = microciclo.dias[i];
    const ocupante = actual?.hoja && actual.hoja !== hoja ? actual.hoja : null;
    if (ocupante) {
      const seQueda = diasDeLaHoja(microciclo, ocupante).length > 1;
      const ok = await confirm({
        title: `${mayuscula(nombreDia(i, { largo: true }))} ya tiene ${ocupante}`,
        message: seQueda
          ? `¿Pones ${hoja} en su lugar? ${ocupante} sigue en sus otros días.`
          : `¿Pones ${hoja} en su lugar? ${ocupante} se queda sin día.`,
        confirmLabel: `Poner ${hoja}`,
        cancelLabel: cancelar,
      });
      if (!ok) return false;
    }
    cambiar(ponerDia(microciclo, i, hoja), `${hoja}, ${nombreDia(i, { largo: true })}.`);
    return true;
  };

  return { cambiar, colocar, nombreDia };
};

/**
 * EL EDITOR DEL MICROCICLO: qué hoja cae cada día, y cuándo se descansa.
 *
 * ══ Lo que sustituye ════════════════════════════════════════════════════════
 * El tipo y el patrón del ciclo vivían en los ajustes del cliente, lejos del
 * bloque que ordenan. Ahora el microciclo es una SECUENCIA del bloque
 * (`block.microciclo`) y se edita aquí, de una pieza: el tipo, las tandas y los
 * días, en ese orden. Ver `docs/estudio-microciclo-secuencia.md`.
 *
 * ══ Dónde vive ══════════════════════════════════════════════════════════════
 * No en la página. Estuvo como banda encima de la rejilla y se comía la vista
 * del bloque: repetía los días que ya dicen las columnas, las empujaba hacia
 * abajo y las estrechaba. Se abre desde el ritmo de la barra de arriba
 * (`RitmoDelMicrociclo`): popover en el escritorio, hoja inferior en el
 * teléfono. Para cambiar el día de UNA hoja basta su rótulo en la columna.
 *
 * ══ Los gestos ══════════════════════════════════════════════════════════════
 *  · Tocar un día abre sus opciones: las hojas (con cuántos días lleva ya cada
 *    una), «Descanso» y, en rotativo, añadir un día detrás o quitarlo. En el
 *    escritorio es un menú pegado a la casilla; en el teléfono, otra hoja. Ahí
 *    se lee entero el nombre que en la casilla no cupo.
 *  · Mantener y arrastrar: en semanal se intercambian los dos días —son del
 *    calendario y no se corren—; en rotativo el día se mueve y la vuelta se
 *    reordena. Alt + flechas con teclado.
 *  · «+ día», al final de la última tanda, es la única acción siempre a la
 *    vista. Es más pequeño que un día: añade uno de descanso al final de la
 *    vuelta, no abre una vuelta nueva.
 *  · Una hoja del plan que no cae en ningún día sale en «Sin día»: tocarla
 *    pregunta el día (y avisa si está ocupado), y también se arrastra a uno.
 *  · Todo cambia sin preguntar y ofrece Deshacer.
 *
 * El descanso casi no se dibuja: en rotativo es una RANURA estrecha y sin
 * rótulo —el número de un día que no se entrena no le sirve a nadie—, y en
 * semanal conserva su día, porque es calendario, pero muy apagado.
 *
 * @param microciclo  `{ tipo, dias }` ya leído (`microcicloDelBloque`).
 * @param hojas       Nombres de las hojas del plan, en su orden.
 * @param onCambiar   `(nuevo) => void`: escribe la secuencia entera.
 * @param onQuitarHoja  Quita una hoja del plan (desde «Sin día»). Opcional.
 * @param diaEnCurso  Qué día de la vuelta es hoy (`diaEnCursoDe`), o `null`.
 *                    Solo en rotativo: en semanal el día de hoy ya lo dice el
 *                    calendario, y aquí no hay nada que no se pueda deducir.
 * @param nombre      El nombre del split que escribió el entrenador, o `null`.
 * @param deducido    El que sale de sus hojas (`nombreDelSplit`): es el ejemplo
 *                    del campo, y lo que se ve mientras esté vacío.
 * @param onNombrar   `(nuevo | null) => void`. Sin él no hay campo de nombre.
 */
export const EditorDelMicrociclo = ({
  microciclo,
  hojas,
  onCambiar,
  onQuitarHoja = null,
  diaEnCurso = null,
  nombre = null,
  deducido = null,
  onNombrar = null,
}) => {
  const esTelefono = useEsTelefono();
  const rotativo = microciclo.tipo === 'rotativo';
  const dias = microciclo.dias;
  const veces = vecesDeCadaHoja(microciclo);
  const sinDia = hojasSinDia(microciclo, hojas);
  const { cambiar: escribir, colocar: colocarEnDia, nombreDia } = useCambiosDelMicrociclo(microciclo, onCambiar);

  /* Qué hay abierto: el menú de un día, la elección de día de una hoja sin
     día, o nada. */
  const [abierto, setAbierto] = useState(null); // { tipo: 'dia', i } | { tipo: 'colocar', hoja }
  const anclaRef = useRef(null);
  const raizRef = useRef(null);
  /* El día recién tocado, para que se note dónde ha ido a parar el gesto. */
  const [recien, setRecien] = useState(null);

  const cortoDia = (i) => (rotativo ? `D${i + 1}` : WEEK_DAYS[i].slice(0, 3));
  const cerrar = () => setAbierto(null);

  const cambiar = (nuevo, texto, dia = null) => {
    if (escribir(nuevo, texto)) setRecien(dia);
  };

  /* ── El tipo ──────────────────────────────────────────────────────────── */
  const alCambiarTipo = (tipo) => {
    const { microciclo: nuevo, quitados } = cambiarTipo(microciclo, tipo);
    if (tipo === 'semanal') {
      const lista = Array.from({ length: quitados }, (_, k) => k + 8);
      const cuales = lista.length > 1 ? `${lista.slice(0, -1).join(', ')} y ${lista.at(-1)}` : `${lista[0]}`;
      cambiar(
        nuevo,
        quitados > 0
          ? `Ahora es semanal. Se ${quitados === 1 ? 'quita el día' : 'quitan los días'} ${cuales}.`
          : 'Ahora es semanal.',
      );
    } else {
      cambiar(nuevo, `Ahora es rotativo de ${nuevo.dias.length} días.`);
    }
  };

  /* ── Las tandas ───────────────────────────────────────────────────────── */
  const [tandas, setTandas] = useState(null); // el texto que se escribe, o null
  const [tandasMal, setTandasMal] = useState(false);
  const aplicarTandas = () => {
    if (tandas === null) return;
    if (tandas.trim() === cadenaDe(dias)) {
      setTandas(null);
      return;
    }
    const nuevo = conTandas(microciclo, tandas, hojas);
    if (!nuevo) {
      setTandasMal(true);
      return;
    }
    setTandas(null);
    setTandasMal(false);
    cambiar(nuevo, `Tandas ${cadenaDe(nuevo.dias)}: ${nuevo.dias.length} días.`);
  };

  /* ── Un día ───────────────────────────────────────────────────────────── */
  const ponerEn = (i, hoja) => {
    cerrar();
    cambiar(
      ponerDia(microciclo, i, hoja),
      hoja ? `${hoja}, ${nombreDia(i, { largo: true })}.` : `Descanso ${nombreDia(i, { largo: true })}.`,
      i,
    );
  };

  /* Colocar una hoja de «Sin día». Si el día está ocupado y se elige otro, la
     elección vuelve, colgada del día que se había tocado: si llegó
     arrastrando, no hay ficha pulsada a la que pegarse. */
  const colocar = async (hoja, i) => {
    cerrar();
    if (await colocarEnDia(hoja, i, { cancelar: 'Elegir otro día' })) {
      setRecien(i);
      return;
    }
    anclaRef.current = raizRef.current?.querySelector(`[data-dia="${i}"]`) || anclaRef.current;
    setAbierto({ tipo: 'colocar', hoja });
  };

  /* ── Arrastrar los días ───────────────────────────────────────────────── */
  const orden = useArrastreOrden({
    eje: esTelefono ? 'y' : 'x',
    onMove: (de, a) => {
      const quien = dias[de]?.hoja || 'Descanso';
      cambiar(arrastrarDia(microciclo, de, a), `${quien}, ${nombreDia(a, { largo: true })}.`, a);
    },
  });
  const propsDelDia = (i) => {
    const p = orden.props(i);
    /* En semanal se intercambian: los de en medio no se apartan, solo se
       enciende el destino. El que viaja sigue al dedo igual. */
    if (!rotativo && orden.arrastrando !== null && i !== orden.arrastrando) return { ...p, style: undefined };
    /* El que viaja va alzado y un poco torcido: se nota cogido y deja ver
       debajo el día que se enciende. */
    if (i === orden.arrastrando && p.style?.transform) {
      return { ...p, style: { ...p.style, transform: `${p.style.transform} translateY(-6px) scale(1.03) rotate(-1.5deg)` } };
    }
    return p;
  };
  const alTeclaDelDia = (i) => (e) => {
    if (!e.altKey) return;
    const atras = esTelefono ? 'ArrowUp' : 'ArrowLeft';
    const alante = esTelefono ? 'ArrowDown' : 'ArrowRight';
    if (e.key !== atras && e.key !== alante) return;
    e.preventDefault();
    const a = i + (e.key === alante ? 1 : -1);
    if (a < 0 || a >= dias.length) return;
    const quien = dias[i]?.hoja || 'Descanso';
    cambiar(arrastrarDia(microciclo, i, a), `${quien}, ${nombreDia(a, { largo: true })}.`, a);
  };

  /* ── Arrastrar una hoja sin día hasta un día ─────────────────────────── */
  const ficha = useArrastreDeFicha((hoja, i) => colocar(hoja, i));

  useEffect(() => {
    if (recien === null) return undefined;
    const t = setTimeout(() => setRecien(null), 600);
    return () => clearTimeout(t);
  }, [recien]);

  /* ── Lo que sale al tocar ─────────────────────────────────────────────── */
  const opciones = (() => {
    if (!abierto) return null;
    if (abierto.tipo === 'dia') {
      const i = abierto.i;
      const actual = dias[i];
      if (!actual) return null;
      return {
        titulo: mayuscula(nombreDia(i)),
        items: [
          ...hojas.map((h) => ({
            label: h,
            on: actual.hoja === h,
            sub: actual.hoja !== h && veces.get(h) ? `${veces.get(h)} ${veces.get(h) === 1 ? 'día' : 'días'}` : null,
            run: () => (actual.hoja === h ? cerrar() : ponerEn(i, h)),
          })),
          {
            label: 'Descanso',
            on: Boolean(actual.descanso),
            run: () => (actual.descanso ? cerrar() : ponerEn(i, null)),
          },
          ...(rotativo
            ? [
                null,
                {
                  label: 'Añadir un día después',
                  run: () => {
                    cerrar();
                    cambiar(anadirDiaDespues(microciclo, i), `Día ${i + 2} añadido, de descanso.`, i + 1);
                  },
                },
                dias.length > 1 && {
                  label: 'Quitar este día',
                  danger: true,
                  run: () => {
                    cerrar();
                    cambiar(quitarDia(microciclo, i), `Día ${i + 1} quitado.`);
                  },
                },
              ]
            : []),
        ].filter((x) => x !== false),
      };
    }
    const { hoja } = abierto;
    return {
      titulo: `¿Qué día cae ${hoja}?`,
      items: [
        ...dias.map((d, i) => ({
          label: mayuscula(nombreDia(i)),
          sub: d.hoja || 'Descanso',
          run: () => colocar(hoja, i),
        })),
        ...(onQuitarHoja
          ? [
              null,
              {
                label: 'Quitar la hoja',
                danger: true,
                run: () => (cerrar(), onQuitarHoja(hoja)),
              },
            ]
          : []),
      ],
    };
  })();

  const abrir = (que, e) => {
    anclaRef.current = e.currentTarget;
    setAbierto((a) => (a && a.tipo === que.tipo && a.i === que.i && a.hoja === que.hoja ? null : que));
  };

  /* ── Lo que se pinta ──────────────────────────────────────────────────── */
  /*
    UNA FILA POR TANDA, en rotativo: sus entrenos y, al final, su descanso. La
    tanda empieza cuando se vuelve a entrenar tras descansar, así que el corte
    cae donde de verdad termina una vuelta y no donde se acaba el ancho. Se ven
    todas las vueltas, sin «×3» ni filas plegadas: si son iguales se nota
    porque las filas salen idénticas. En semanal hay una sola fila de siete.
  */
  const corte = (i) => rotativo && i > 0 && i < dias.length && !dias[i].descanso && dias[i - 1].descanso;
  const tandasDeLaTira = dias.reduce((grupos, _, i) => {
    if (i === 0 || corte(i)) grupos.push([]);
    grupos[grupos.length - 1].push(i);
    return grupos;
  }, []);

  const dia = (d, i) => {
    const descanso = Boolean(d.descanso);
    /* Hoy, solo en rotativo: es el único dato de la vuelta que no se deduce
       mirándola. En semanal lo dice el calendario. */
    const hoy = rotativo && i === diaEnCurso;
    const clases = [
      'micro-dia',
      descanso ? 'is-descanso' : '',
      hoy ? 'is-hoy' : '',
      abierto?.tipo === 'dia' && abierto.i === i ? 'is-abierto' : '',
      orden.arrastrando === i ? 'is-alzado' : '',
      orden.destino === i && orden.arrastrando !== i ? 'is-destino' : '',
      ficha.sobre === i ? 'is-destino' : '',
      ficha.viajando ? 'is-elegible' : '',
      recien === i ? 'is-recien' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <button
        key={i}
        type="button"
        className={clases}
        data-dia={i}
        aria-haspopup="menu"
        aria-expanded={abierto?.tipo === 'dia' && abierto.i === i}
        aria-label={`${mayuscula(nombreDia(i))}${hoy ? ' (hoy)' : ''}: ${
          d.hoja || (descanso ? 'descanso' : 'entreno sin hoja')
        }`}
        /* El nombre entero, para el que la casilla recorta con puntos. */
        title={d.hoja || (descanso ? 'Descanso' : 'Entreno sin hoja')}
        {...propsDelDia(i)}
        onKeyDown={alTeclaDelDia(i)}
        onClick={(e) => abrir({ tipo: 'dia', i }, e)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="micro-dia-dia">
          {/* El descanso del rotativo no lleva rótulo: es una ranura, y «D3»
              en un día que no se entrena no le sirve a nadie. */}
          {rotativo && descanso && !esTelefono ? '' : esTelefono ? nombreDia(i) : cortoDia(i)}
          {hoy && <span className="micro-dia-hoy" aria-hidden="true" />}
        </span>
        {/* En el teléfono la fila dice «Descanso»: una fila vacía se lee rota.
            En la tira del escritorio el hueco ya lo dice. */}
        <span className="micro-dia-hoja">{d.hoja || (descanso ? (esTelefono ? 'Descanso' : '') : '—')}</span>
        {esTelefono && <ChevronRight size={15} className="micro-dia-flecha" aria-hidden="true" />}
      </button>
    );
  };

  /* «+ día»: la única acción siempre a la vista. Al final de la última tanda,
     del alto de una casilla —para que la fila no se descuadre— y estrecho y
     callado: añade un día de descanso al final de la vuelta, no abre una
     vuelta nueva. */
  const mas = (
    <button
      type="button"
      className="micro-mas"
      aria-label="Añadir un día al final"
      title="Añadir un día al final"
      onClick={() =>
        cambiar(anadirDiaDespues(microciclo, dias.length - 1), `Día ${dias.length + 1} añadido, de descanso.`, dias.length)
      }
    >
      <Plus size={15} aria-hidden="true" />
      {esTelefono && <span>Añadir un día</span>}
    </button>
  );

  const capa =
    opciones &&
    (esTelefono ? (
      <Hoja abierta onCerrar={cerrar} etiqueta={opciones.titulo}>
        <ListaDeOpciones {...opciones} grande />
      </Hoja>
    ) : (
      <MenuDelDia anclaRef={anclaRef} onCerrar={cerrar}>
        <ListaDeOpciones {...opciones} />
      </MenuDelDia>
    ));

  return (
    <section className={`micro${rotativo ? ' is-rotativo' : ''}`} aria-label="Microciclo" ref={raizRef}>
      {/* El nombre del split, lo primero: es lo que se lee en la cabecera del
          bloque. Vacío, se ve el deducido, que va de ejemplo. */}
      {onNombrar && <NombreDelSplit nombre={nombre} deducido={deducido} onNombrar={onNombrar} />}

      {/* UNA SOLA CABECERA: «Semanal | Rotativo   Tandas 2-1 ›   9 días · 6
          entrenos». Las tandas tenían su propio renglón debajo, y un renglón
          con una etiqueta y un valor, encima de otro con otra etiqueta y otro
          valor, se lee como dos secciones cuando son la misma cosa: cómo es
          este microciclo. Lo que se escribe queda entre el tipo y la cuenta,
          que es el orden en que se decide. */}
      <div className="micro-cab">
        <SegmentedControl
          value={microciclo.tipo}
          onChange={(tipo) => tipo !== microciclo.tipo && alCambiarTipo(tipo)}
          options={[
            { id: 'semanal', label: 'Semanal', hint: 'De lunes a domingo' },
            {
              id: 'rotativo',
              label: 'Rotativo',
              hint: 'Una vuelta que se repite, sin atarse al calendario',
            },
          ]}
          label="Tipo de microciclo"
        />

        {rotativo && (
          <div className={`micro-tandas${tandas !== null ? ' is-editando' : ''}`}>
            <span className="micro-tandas-k" id="micro-tandas-k">
              Tandas
            </span>
            {tandas === null ? (
              <button
                type="button"
                className="micro-tandas-v"
                aria-labelledby="micro-tandas-k"
                aria-describedby="micro-tandas-valor"
                onClick={() => {
                  setTandas(cadenaDe(dias));
                  setTandasMal(false);
                }}
              >
                <span id="micro-tandas-valor">{cadenaDe(dias)}</span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ) : (
              <input
                autoFocus
                className={`micro-tandas-campo${tandasMal ? ' is-mal' : ''}`}
                value={tandas}
                aria-labelledby="micro-tandas-k"
                aria-invalid={tandasMal || undefined}
                spellCheck={false}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  setTandas(e.target.value);
                  setTandasMal(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') aplicarTandas();
                  if (e.key === 'Escape') {
                    /* Escape deshace lo tecleado, no cierra la capa de fuera. */
                    e.stopPropagation();
                    setTandas(null);
                    setTandasMal(false);
                  }
                }}
                onBlur={() => (tandasMal ? setTandas(null) : aplicarTandas())}
              />
            )}
          </div>
        )}

        <span className="micro-cuenta">
          {dias.length} días · {entrenosDe(microciclo)} {entrenosDe(microciclo) === 1 ? 'entreno' : 'entrenos'}
        </span>
      </div>

      {/* El aviso, en su propio renglón: dentro de la cabecera ensancharía el
          popover de golpe mientras se teclea. */}
      {tandasMal && <span className="micro-tandas-mal">Escríbelas como 2-1 3-1</span>}

      <div className={`micro-dias${esTelefono ? ' is-lista' : ''}`} ref={orden.carrilRef}>
        {/* Una fila por tanda. El «+ día» cierra la última —en el escritorio,
            donde la fila es una vuelta; en el teléfono la lista es de días y
            va debajo, como la fila «Añadir» de los Ajustes. */}
        {tandasDeLaTira.map((grupo, k) => (
          <div key={grupo[0]} className="micro-tanda">
            {grupo.map((i) => dia(dias[i], i))}
            {rotativo && !esTelefono && k === tandasDeLaTira.length - 1 && mas}
          </div>
        ))}
        {rotativo && esTelefono && mas}
      </div>

      {sinDia.length > 0 && (
        <div className="micro-sin">
          <span className="micro-sin-k">Sin día</span>
          {sinDia.map((h) => (
            <button
              key={h}
              type="button"
              className={`micro-ficha${abierto?.tipo === 'colocar' && abierto.hoja === h ? ' is-abierta' : ''}${
                ficha.viajando?.hoja === h ? ' is-viajando' : ''
              }`}
              aria-haspopup="menu"
              {...ficha.props(h)}
              onClick={(e) => abrir({ tipo: 'colocar', hoja: h }, e)}
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {ficha.fantasma}
      {capa}
    </section>
  );
};

/**
 * El nombre del split. Se guarda al salir del campo o con Intro; Escape
 * devuelve lo que había sin cerrar la capa de fuera. Vacío vuelve al deducido.
 */
const NombreDelSplit = ({ nombre, deducido, onNombrar }) => {
  const [texto, setTexto] = useState(nombre || '');
  /* Si el nombre cambia desde fuera (Deshacer), el campo lo sigue. */
  const [previo, setPrevio] = useState(nombre);
  if (previo !== nombre) {
    setPrevio(nombre);
    setTexto(nombre || '');
  }
  const guardar = () => {
    const nuevo = texto.trim().slice(0, MAX_BLOCK_SPLIT) || null;
    if (nuevo !== (nombre || null)) onNombrar(nuevo);
  };
  return (
    <label className="micro-nombre">
      <span className="micro-nombre-k">Nombre</span>
      <input
        className="input input-sm micro-nombre-campo"
        value={texto}
        maxLength={MAX_BLOCK_SPLIT}
        placeholder={deducido || 'Torso / Pierna'}
        spellCheck={false}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setTexto(nombre || '');
          }
        }}
      />
    </label>
  );
};

/** Las opciones, igual en el menú del escritorio y en la hoja del teléfono. */
const ListaDeOpciones = ({ titulo, items, grande = false }) => (
  <div className={`micro-opciones${grande ? ' is-grande' : ''}`} role="menu" aria-label={titulo}>
    <span className="micro-opciones-titulo">{titulo}</span>
    {items.map((it, k) =>
      it === null ? (
        <hr key={`sep-${k}`} className="menu-sep" />
      ) : (
        <button
          key={it.label}
          type="button"
          role={it.on === undefined ? 'menuitem' : 'menuitemradio'}
          aria-checked={it.on === undefined ? undefined : it.on}
          className={`menu-item${it.danger ? ' menu-item-danger' : ''}${it.on ? ' is-on' : ''}`}
          onClick={it.run}
        >
          <span className="menu-item-nombre">{it.label}</span>
          {it.on ? (
            <span className="micro-opciones-tic" aria-hidden="true">
              ✓
            </span>
          ) : (
            it.sub && <span className="menu-sub">{it.sub}</span>
          )}
        </button>
      ),
    )}
  </div>
);

/**
 * El menú del escritorio, pegado a la casilla que lo abre. Se cierra al pulsar
 * fuera o con Escape; pulsar la MISMA casilla lo cierra por su propio clic (si
 * también lo cerrara esto, el clic lo volvería a abrir). Escape corta ahí: con
 * el editor dentro de un popover, cierra el menú y no el popover.
 */
const MenuDelDia = ({ anclaRef, onCerrar, children }) => {
  const ref = useRef(null);
  const capa = useCapaFlotante(true, anclaRef, ref, { alineado: 'izquierda' });
  useEffect(() => {
    const fuera = (e) => {
      if (ref.current?.contains(e.target) || anclaRef.current?.contains(e.target)) return;
      onCerrar();
    };
    const tecla = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCerrar();
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla, true);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla, true);
    };
  }, [anclaRef, onCerrar]);
  return (
    <div ref={ref} className="popover micro-menu" style={capa.estilo} {...capa.atributos}>
      {children}
    </div>
  );
};

/**
 * Arrastrar una ficha de «Sin día» hasta un día.
 *
 * Con ratón, a los 4 px; con el dedo, tras mantenerla quieta un momento, que es
 * lo que la distingue de desplazar la página. El destino se decide por lo que
 * hay bajo el puntero (`[data-dia]`), igual que en `useArrastreOrden`.
 */
const useArrastreDeFicha = (alSoltar) => {
  const [viajando, setViajando] = useState(null); // { hoja, x, y }
  const [sobre, setSobre] = useState(null);
  const gesto = useRef(null);
  const soltado = useRef(false);

  const fin = (e) => {
    const g = gesto.current;
    gesto.current = null;
    if (!g) return;
    clearTimeout(g.reloj);
    if (g.activo) {
      soltado.current = true;
      const bajo = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-dia]');
      setViajando(null);
      setSobre(null);
      if (bajo) alSoltar(g.hoja, Number(bajo.dataset.dia));
    }
  };

  useEffect(() => {
    if (!viajando) return undefined;
    const frenar = (e) => e.preventDefault();
    document.addEventListener('touchmove', frenar, { passive: false });
    return () => document.removeEventListener('touchmove', frenar);
  }, [viajando]);

  const props = (hoja) => ({
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      soltado.current = false;
      const g = {
        hoja,
        x: e.clientX,
        y: e.clientY,
        activo: false,
        tactil: e.pointerType === 'touch',
        el: e.currentTarget,
        id: e.pointerId,
      };
      const activar = () => {
        g.activo = true;
        try {
          g.el.setPointerCapture(g.id);
        } catch {
          /* Sin captura el gesto sigue mientras el puntero no salga de la ficha. */
        }
        if (g.tactil) navigator.vibrate?.(8);
        setViajando({ hoja, x: g.x, y: g.y });
      };
      g.activar = activar;
      if (g.tactil) g.reloj = setTimeout(activar, 240);
      gesto.current = g;
    },
    onPointerMove: (e) => {
      const g = gesto.current;
      if (!g) return;
      const d = Math.hypot(e.clientX - g.x, e.clientY - g.y);
      if (!g.activo) {
        if (g.tactil) {
          if (d > 8) {
            clearTimeout(g.reloj);
            gesto.current = null;
          }
          return;
        }
        if (d < 4) return;
        g.activar();
      }
      setViajando({ hoja: g.hoja, x: e.clientX, y: e.clientY });
      const bajo = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-dia]');
      setSobre(bajo ? Number(bajo.dataset.dia) : null);
    },
    onPointerUp: fin,
    onPointerCancel: () => {
      clearTimeout(gesto.current?.reloj);
      gesto.current = null;
      setViajando(null);
      setSobre(null);
    },
    onClickCapture: (e) => {
      if (!soltado.current) return;
      soltado.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    onContextMenu: (e) => e.preventDefault(),
  });

  const fantasma = viajando && (
    <span className="micro-ficha is-fantasma" aria-hidden="true" style={{ left: viajando.x, top: viajando.y }}>
      {viajando.hoja}
    </span>
  );

  return { viajando, sobre, props, fantasma };
};
