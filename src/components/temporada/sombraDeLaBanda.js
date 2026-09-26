import { valorDelTramo } from '@/domain/roadmap';
import { addDays } from '@/lib/dates';

/* Por debajo de esto, dos bandas son la misma: la cuenta es idéntica con las
   mismas fases, y un gramo no se ve en ninguna escala. */
const IGUAL_KG = 0.01;

/**
 * Los trozos de la banda de una versión que NO coinciden con la de ahora
 * (letra f): la sombra solo se dibuja donde dice algo.
 *
 * Día a día, un día de un tramo de la sombra difiere si ese día no hay banda
 * ahora, o si la de ahora espera otro peso. Los días seguidos que difieren son
 * un trozo, con sus extremos en días (`a` incluido, `b` excluido, como los
 * tramos). `abre`/`cierra` solo si el trozo empieza o acaba donde su tramo:
 * ahí la banda de la versión tiene canto de verdad; en un corte por coincidir,
 * no.
 *
 * @param sombra Tramos de la versión (`tramosVisibles`).
 * @param ahora  Tramos de ahora, recortados a la misma vista.
 */
export const trozosQueDifieren = (sombra, ahora) => {
  const valorAhora = (dia) => {
    const t = ahora.find((x) => x.a <= dia && dia < x.b);
    return t ? valorDelTramo(t.tramo, dia) : null;
  };
  const out = [];
  for (const t of sombra) {
    let inicio = null;
    const cerrar = (fin) => {
      out.push({
        ...t,
        key: `${t.key}-${inicio}`,
        a: inicio,
        b: fin,
        abre: t.abre && inicio === t.a,
        cierra: t.cierra && fin === t.b,
        canto: { a: inicio === t.a, b: fin === t.b },
      });
      inicio = null;
    };
    for (let d = t.a; d < t.b; d = addDays(d, 1)) {
      const suyo = valorDelTramo(t.tramo, d);
      const hoy = valorAhora(d);
      const difiere = suyo !== null && (hoy === null || Math.abs(suyo - hoy) > IGUAL_KG);
      if (difiere && inicio === null) inicio = d;
      if (!difiere && inicio !== null) cerrar(d);
    }
    if (inicio !== null) cerrar(t.b);
  }
  return out;
};
