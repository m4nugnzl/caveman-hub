import { useMemo, useRef, useState } from 'react';

import { mergeSheetReadings, parseRoutineGrid, parseRoutineSheet } from '@/domain/routineSheet';
import { mergeDietReadings, parseDietGrid, parseDietSheet } from '@/domain/dietSheet';
import { isLegacyWorkbookFile, isWorkbookFile, readWorkbook } from '@/domain/xlsx';
import { isWordFile, readDocx } from '@/domain/docx';
import { isPdfFile, readPdfText } from '@/domain/pdf';

/**
 * De dónde sale lo que se va a importar: un fichero, siempre.
 *
 * ══ Por qué esto es un gancho y no está dentro del diálogo ═════════════════
 *
 * Porque abrir la fuente y entenderla son dos problemas distintos, y el segundo
 * es DOS: la misma hoja puede traer la rutina, la dieta o las dos. Con la
 * lectura metida en el diálogo, la única forma de traer las dos era tener dos
 * diálogos que abrieran el mismo fichero dos veces y no se enteraran el uno del
 * otro.
 *
 * Aquí el fichero se abre UNA vez, cada hoja se lee de las dos maneras, y quien
 * pinte decide qué enseña. Es lo que permite que subir el plan entero —el
 * entreno y la dieta— sea un solo gesto.
 *
 * ══ Cuatro formatos y una sola puerta ══════════════════════════════════════
 *
 *   · `.xlsx`  se abre como libro y cada pestaña se lee por separado.
 *   · `.docx`  cada tabla del documento es una hoja, y el texto de fuera otra.
 *   · `.pdf`   se le saca el texto: media profesión manda la dieta en un
 *     documento, no en una hoja.
 *   · `.csv` / `.tsv` / `.txt` es texto y se lee tal cual.
 *
 * ══ Y el portapapeles ya no ════════════════════════════════════════════════
 *
 * Aquí hubo un segundo camino: pegar el plan como texto, que además era el que
 * la pantalla enseñaba primero. No lo usaba nadie —quien se muda de Excel coge
 * el fichero, no copia filas— y sostenerlo costaba tener DOS estados de fuente
 * y dos formas de leerlos. Al retirarlo, un PDF suelto pasó a ser lo que
 * siempre fue: un libro de una hoja.
 */

/*
  `.xls` y `.doc` están en la lista Y NO SE SABEN LEER, a propósito. El selector
  los enseñaba en gris y quien venía con uno —una hoja que lleva doce años
  pasando de ordenador en ordenador y nunca se volvió a guardar— no podía ni
  elegirlo: se quedaba mirando su fichero apagado sin que nada le dijera por qué.
  Ahora se eligen, y lo que sale es la frase que resuelve el problema.
*/
export const ACCEPT =
  '.xlsx,.xls,.docx,.doc,.csv,.tsv,.txt,.pdf,text/csv,text/tab-separated-values,application/pdf';

/** Lo que sí entra. */
const LEGIBLE = /\.(xlsx|docx|csv|tsv|txt|pdf)$/i;

/**
 * Por qué NO se puede abrir esto, dicho ANTES de intentarlo.
 *
 * ══ Por qué no basta con dejar que falle ═══════════════════════════════════
 *
 * Porque no fallaba. Un `.xls`, un `.numbers` o un `.doc` no reventaban: se
 * leían como texto —que es lo que hace el último caso de `hojasDe`—, salía el
 * ruido binario de dentro, no se reconocía ningún plan ahí y el aviso decía «no
 * he sabido encontrar nada ahí. Comprueba que has copiado la fila de cabecera…».
 * Un consejo que no tenía nada que ver con lo que había pasado, para un problema
 * que se arregla en diez segundos si alguien te dice cuál es.
 *
 * Y esto empeoró justo al aceptar que se arrastren ficheros: el `accept` del
 * selector filtraba parte de estos casos, y al soltar no filtra nada.
 *
 * ── Cada frase termina la del sitio de llamada ──────────────────────────────
 * Se pinta como «rutina.xls: es un Excel de antes de 2007…», así que empiezan en
 * minúscula y sin sujeto: el sujeto es el nombre del fichero. Y todas terminan
 * en algo que se puede hacer: desde que no hay cuadro de pegar, un mensaje que
 * solo diga que no se puede es un callejón sin salida.
 */
export const porQueNoSeLee = (nombre) => {
  const n = String(nombre || '');
  if (isLegacyWorkbookFile(n))
    return 'es un Excel de antes de 2007, que es otro formato. Ábrelo y usa «Guardar como» → .xlsx.';
  if (/\.doc$/i.test(n))
    return 'es un Word de antes de 2007, que es otro formato. Ábrelo y usa «Guardar como» → .docx.';
  if (/\.(numbers|pages|ods|odt)$/i.test(n))
    return 'es de Numbers, Pages o LibreOffice. Expórtalo a .xlsx, .docx o .pdf y vuelve a traerlo.';
  if (!LEGIBLE.test(n))
    return 'no sé leer este tipo de fichero. Vale un Excel, un Word, un PDF o un .csv.';
  return null;
};

/**
 * Lo que trae una fuente, leída de las dos maneras.
 *
 * Una pestaña de Excel llega ya troceada en `rows`; un PDF o un CSV llegan como
 * texto y se leen como texto —que NO es lo mismo que trocearlos: una dieta
 * escrita en párrafos solo se entiende leyendo renglones—.
 */
const leerFuente = ({ rows, texto }) =>
  texto != null
    ? { rutina: parseRoutineSheet(texto), dieta: parseDietSheet(texto) }
    : { rutina: parseRoutineGrid(rows), dieta: parseDietGrid(rows) };

/**
 * Las hojas marcadas, en la forma que esperan los dos mezcladores.
 *
 * El nombre SOLO viaja cuando es una pestaña de verdad. Los dos lectores lo usan
 * como etiqueta —de día en la rutina, de variante en la dieta: «Low» y «High»
 * suelen estar únicamente ahí—, y eso vale para una pestaña que ha nombrado el
 * entrenador. Pasarles «Tabla 1» de un Word o «Mesociclo Roberto.pdf»
 * bautizaría el día con el nombre del fichero.
 */
const entradasDe = (libro, marcadas, cual) =>
  libro
    ? marcadas.map((i) => ({
        name: libro.hojas[i]?.esPestana ? libro.hojas[i].name : null,
        reading: libro.hojas[i]?.[cual],
      }))
    : [];

export const useSheetSource = () => {
  const ficheroRef = useRef(null);

  const [libro, setLibro] = useState(null);
  const [elegidas, setElegidas] = useState([]);
  const [abriendo, setAbriendo] = useState(false);
  const [fallo, setFallo] = useState(null);
  /* Cada fuente nueva es un plan distinto: quien pinta necesita saber cuándo
     tirar lo que hubiera corregido de la anterior. */
  const [version, setVersion] = useState(0);

  const olvidar = () => setVersion((v) => v + 1);

  /** Las pestañas de un fichero, sin leer todavía. */
  const hojasDe = async (file, conPrefijo) => {
    const prefijo = conPrefijo ? `${file.name} · ` : '';

    /* Se para aquí y no más adelante para que el motivo llegue al mismo sitio
       que los demás fallos: el bucle de `abrirFicheros` ya sabe decir cuál de
       los cuatro no ha podido y seguir con el resto. */
    const pega = porQueNoSeLee(file.name);
    if (pega) throw new Error(pega);

    /* Solo la pestaña de una hoja de cálculo se la ha puesto una persona, y por
       eso es la única que vale como nombre de día: «PUSH», «PIERNA A». «Tabla 1»
       de un Word y «Mesociclo.pdf» no nombran nada. */
    if (isWorkbookFile(file.name)) {
      const hojas = await readWorkbook(await file.arrayBuffer());
      return hojas.map((h) => ({ ...h, name: `${prefijo}${h.name}`, esPestana: true }));
    }

    if (isWordFile(file.name)) {
      const hojas = await readDocx(await file.arrayBuffer());
      return hojas.map((h) => ({ ...h, name: `${prefijo}${h.name}` }));
    }

    const texto = isPdfFile(file.name) ? await readPdfText(await file.arrayBuffer()) : await file.text();
    return [{ name: file.name, texto }];
  };

  /**
   * Abre lo que se haya elegido, que puede ser MÁS DE UN FICHERO.
   *
   * ══ Por qué varios ════════════════════════════════════════════════════════
   *
   * Porque el plan completo no siempre viene en un libro con pestañas: viene en
   * el Excel de la rutina y el PDF de la dieta, que son dos ficheros y son el
   * mismo plan. Con uno solo había que importar dos veces —y desde dos sitios—
   * para hacer una cosa que se piensa como una.
   *
   * Cada fichero aporta sus pestañas a la misma lista y, cuando hay varios, cada
   * una lleva delante de qué fichero salió: dos pestañas llamadas «Hoja1» en el
   * mismo listado no se pueden distinguir.
   *
   * Un fichero que falle no se lleva a los demás por delante: se dice cuál y se
   * sigue con el resto. Abrir cuatro y perderlos todos porque uno estaba
   * protegido sería el peor momento para empezar de cero.
   */
  const abrirFicheros = async (files) => {
    const lista = [...(files || [])];
    if (!lista.length) return;

    setFallo(null);
    setAbriendo(true);
    olvidar();

    const fallos = [];
    const crudas = [];

    for (const file of lista) {
      try {
        crudas.push(...(await hojasDe(file, lista.length > 1)));
      } catch (error) {
        fallos.push(`${file.name}: ${error?.message || 'no se ha podido abrir'}`);
      }
    }

    setFallo(fallos.length ? fallos.join('\n') : null);

    /*
      TODO lo que entra es un libro, incluido un PDF suelto —que es un libro de
      una hoja—. Antes ese caso iba a un cuadro de texto aparte donde se veía lo
      leído y se podía corregir a mano; al retirarse el cuadro (nadie pegaba
      nada) tener dos caminos dejó de pagar nada y esto se quedó con uno.

      Lo que se pierde: corregir a mano un PDF que salga raro. Lo que queda en su
      lugar es mejor sitio para hacerlo — la tabla de revisión, donde se cambia
      el ejercicio, las series y el objetivo con el plan delante.
    */
    if (crudas.length) {
      const hojas = crudas.map((h) => ({ ...h, ...leerFuente(h) }));
      setLibro({
        nombre: lista.length === 1 ? lista[0].name : `${lista.length} ficheros`,
        hojas,
      });

      /* Marcadas de entrada las que traen algo Y están a la vista. En un libro
         de quince pestañas, dejarlas todas sin marcar convierte el acierto en
         trabajo; y marcar sola una que el entrenador tiene escondida sería
         traerle algo que ni sabe que existe. */
      setElegidas(
        hojas
          .map((h, i) => (!h.hidden && (h.rutina.days.length || h.dieta.format) ? i : -1))
          .filter((i) => i >= 0)
      );
    } else {
      setLibro(null);
      setElegidas([]);
    }

    setAbriendo(false);
    /* Se limpia para que elegir DOS VECES el mismo fichero vuelva a disparar el
       `change`: si no, corregir la hoja y reintentar no hace nada. */
    if (ficheroRef.current) ficheroRef.current.value = '';
  };

  const alternarHoja = (i) => {
    olvidar();
    setElegidas((prev) => (prev.includes(i) ? prev.filter((n) => n !== i) : [...prev, i]));
  };

  const marcadas = useMemo(() => [...elegidas].sort((a, b) => a - b), [elegidas]);

  const rutina = useMemo(() => mergeSheetReadings(entradasDe(libro, marcadas, 'rutina')), [libro, marcadas]);
  const dieta = useMemo(() => mergeDietReadings(entradasDe(libro, marcadas, 'dieta')), [libro, marcadas]);

  return {
    ficheroRef,
    libro,
    elegidas,
    alternarHoja,
    abrirFicheros,
    abriendo,
    fallo,
    rutina,
    dieta,
    version,
  };
};
