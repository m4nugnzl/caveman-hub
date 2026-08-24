import { useMemo, useRef, useState } from 'react';

import { mergeSheetReadings, parseRoutineGrid, parseRoutineSheet } from '@/domain/routineSheet';
import { asPlan, mergeDietReadings, parseDietGrid, parseDietSheet } from '@/domain/dietSheet';
import { isWorkbookFile, readWorkbook } from '@/domain/xlsx';
import { isPdfFile, readPdfText } from '@/domain/pdf';

/**
 * De dónde sale lo que se va a importar: el portapapeles o un fichero.
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
 * pinte decide qué enseña. Es lo que permite que subir el libro entero —el
 * entreno y la dieta— sea un solo gesto.
 *
 * ══ Tres formatos y una sola puerta ════════════════════════════════════════
 *
 *   · `.xlsx`  se abre como libro y cada pestaña se lee por separado.
 *   · `.csv` / `.tsv` es exactamente lo que entrega el portapapeles, así que
 *     entra por el mismo sitio que pegar.
 *   · `.pdf`  se le saca el texto y entra también por ahí: media profesión
 *     manda la dieta en un documento, no en una hoja.
 */

export const ACCEPT = '.xlsx,.csv,.tsv,.txt,.pdf,text/csv,text/tab-separated-values,application/pdf';

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

export const useSheetSource = () => {
  const ficheroRef = useRef(null);

  const [texto, setTexto] = useState('');
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

    if (isWorkbookFile(file.name)) {
      const hojas = await readWorkbook(await file.arrayBuffer());
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

    /* Un único fichero de texto —un PDF, un CSV— va al cuadro de pegar: ahí se
       ve lo que se ha leído y se puede corregir a mano, que es justo lo que hace
       falta cuando un PDF sale raro. Con varios eso no cabe, y pasan a ser
       pestañas como las demás. */
    if (crudas.length === 1 && crudas[0].texto != null) {
      setLibro(null);
      setElegidas([]);
      setTexto(crudas[0].texto);
    } else if (crudas.length) {
      const hojas = crudas.map((h) => ({ ...h, ...leerFuente(h) }));
      setLibro({
        nombre: lista.length === 1 ? lista[0].name : `${lista.length} ficheros`,
        hojas,
      });
      setTexto('');

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
    }

    setAbriendo(false);
    /* Se limpia para que elegir DOS VECES el mismo fichero vuelva a disparar el
       `change`: si no, corregir la hoja y reintentar no hace nada. */
    if (ficheroRef.current) ficheroRef.current.value = '';
  };

  const escribir = (valor) => {
    setTexto(valor);
    setLibro(null);
    olvidar();
  };

  const alternarHoja = (i) => {
    olvidar();
    setElegidas((prev) => (prev.includes(i) ? prev.filter((n) => n !== i) : [...prev, i]));
  };

  const marcadas = useMemo(() => [...elegidas].sort((a, b) => a - b), [elegidas]);

  /*
    Se relee en cada tecla y no al pulsar un botón: pegar y ver es un solo
    gesto, y con un botón de por medio la mitad de la gente cree que no ha
    funcionado. Es un `split` sobre unos cientos de líneas.
  */
  const rutina = useMemo(() => {
    if (!libro) return parseRoutineSheet(texto);
    return mergeSheetReadings(
      marcadas.map((i) => ({ name: libro.hojas[i]?.name, reading: libro.hojas[i]?.rutina }))
    );
  }, [libro, marcadas, texto]);

  const dieta = useMemo(() => {
    if (!libro) return asPlan(parseDietSheet(texto));
    return mergeDietReadings(
      marcadas.map((i) => ({ name: libro.hojas[i]?.name, reading: libro.hojas[i]?.dieta }))
    );
  }, [libro, marcadas, texto]);

  return {
    ficheroRef,
    texto,
    escribir,
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
