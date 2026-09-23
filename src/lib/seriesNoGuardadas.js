/**
 * LAS SERIES QUE EL SERVIDOR NO QUISO GUARDAR, escritas en el navegador.
 *
 * ══ El fallo que cierra ═════════════════════════════════════════════════════
 *
 * `log_session_set` rechaza una serie cuando su día o su ejercicio ya no están
 * en el plan de esa semana: el entrenador renombró o quitó la hoja con el
 * teléfono del cliente abierto desde antes. La cola (`lib/saveQueue`) trata eso
 * como un rechazo definitivo y borra su nota del navegador —reenviarla en cada
 * arranque no la haría válida—, así que la serie vivía solo en la memoria de la
 * pestaña: al recargar no quedaba en ningún sitio, y nadie se enteraba.
 *
 * Aquí se apunta aparte, con el error y la hora. No se reenvía sola al arrancar
 * (se rechazaría igual): la recoloca quien sabe dónde va ahora
 * (`domain/seriesSinConfirmar`), la reintenta el cliente a mano, o se queda a la
 * vista como «no guardada» hasta que caduca.
 *
 * Por usuario, por lo mismo que `lib/pendingSaves`: dos personas en el mismo
 * aparato no heredan lo de la otra.
 */

import { diaDeLaSerie } from '@/domain/seriesSinConfirmar';

const prefijo = (userId) => `caveman-noguardadas:${userId || 'anon'}`;

/** Dos semanas: pasado eso la sesión es historia y la serie ya no la va a recolocar nadie. */
export const CADUCA_MS = 14 * 24 * 60 * 60 * 1000;

/** El texto del servidor, sin el objeto de error alrededor. */
const mensajeDe = (error) => (typeof error === 'string' ? error : error?.message || 'Rechazada');

export const almacenNoGuardadas = (userId) => {
  const leer = () => {
    try {
      const lista = JSON.parse(localStorage.getItem(prefijo(userId)) || '[]');
      return Array.isArray(lista) ? lista.filter((e) => e && typeof e.key === 'string') : [];
    } catch {
      return [];
    }
  };

  const escribir = (lista) => {
    try {
      if (lista.length > 0) localStorage.setItem(prefijo(userId), JSON.stringify(lista));
      else localStorage.removeItem(prefijo(userId));
    } catch {
      /* Almacenamiento lleno o bloqueado: la serie sigue en la memoria de la
         pestaña y a la vista; solo se pierde si además se recarga. */
    }
    return lista;
  };

  const vigentes = (ahora) => leer().filter((e) => ahora - (Number(e.at) || 0) < CADUCA_MS);

  return {
    /** Las que siguen sin guardar. Las caducadas se dejan de contar (y de guardar). */
    list(ahora = Date.now()) {
      const todas = leer();
      const vivas = vigentes(ahora);
      if (vivas.length !== todas.length) escribir(vivas);
      return vivas;
    },

    /** Apunta una rechazada. La misma clave sustituye a la anterior: es el mismo campo. */
    put(key, payload, error, ahora = Date.now()) {
      return escribir([
        ...vigentes(ahora).filter((e) => e.key !== key),
        { key, payload, error: mensajeDe(error), at: ahora },
      ]);
    },

    /** Añade datos a una que ya está (por ejemplo, que ya se le ha contado al entrenador). */
    marcar(key, cambios) {
      return escribir(leer().map((e) => (e.key === key ? { ...e, ...cambios } : e)));
    },

    /** Ya se guardó, o ya no hay nada que hacer con ella. */
    quitar(key) {
      const lista = leer();
      return lista.some((e) => e.key === key) ? escribir(lista.filter((e) => e.key !== key)) : lista;
    },
  };
};

/** ¿Es de este cliente? La clave es `set:<cliente>:<sesión>:<ejercicio>:<serie>:<campo>`. */
export const esDelCliente = (entrada, clientId) => entrada.key.startsWith(`set:${clientId}:`);

/**
 * Lo que no se guardó, contado como lo cuenta quien lo escribió: una serie es
 * una, aunque se rechacen sus kilos y sus repeticiones por separado (cada campo
 * es una clave de la cola). Sin esto la franja decía «2 cambios» encima de una
 * tarjeta que decía «la serie que anotaste».
 */
export const contarFallos = (claves) => {
  const series = new Set();
  let otros = 0;
  for (const key of new Set(claves)) {
    if (key.startsWith('set:')) series.add(key.slice(0, key.lastIndexOf(':')));
    else otros += 1;
  }
  return { series: series.size, otros, total: series.size + otros };
};

/** ¿La rechazó porque su día o su ejercicio ya no están en el plan de esa semana? */
export const esRechazoDelPlan = (error) =>
  /no está en el plan|no está programado|no existe la semana/i.test(mensajeDe(error));

/**
 * QUÉ SE HACE CON UNA SERIE RECHAZADA. Lo monta `AppContext` con sus piezas;
 * vive aquí para poder probarlo entero sin la aplicación alrededor.
 *
 *   · Se apunta entre las no guardadas: desde aquí ya no puede desaparecer.
 *   · Si la rechazó un cambio del plan, se pide el programa al día y se busca
 *     dónde va ahora (`diaDeLaSerie`). Si su hoja se renombró, sale con el
 *     nombre nuevo; al guardarse, quien la apuntó la quita de la lista.
 *   · Se intenta UNA vez sola (`recolocada`): si vuelve rechazada, se queda
 *     como no guardada. «Reintentar» del cliente vuelve a intentarlo.
 *   · La que se queda sin sitio se le cuenta al entrenador (`contar`, la
 *     función `report_unsaved_set` de la 0132) y se marca `avisado`. Si no
 *     llega —sin red, o sin la migración—, se vuelve a contar al arrancar
 *     (`contarPendientes`).
 *
 * @param {object} piezas
 * @param {ReturnType<typeof almacenNoGuardadas>} piezas.almacen
 * @param {(clientId: string) => Promise<object|null>} piezas.programaAlDia
 * @param {(key: string, clientId: string, payload: object) => void} piezas.reenviar
 * @param {(lista: object[]) => void} [piezas.avisar]  la lista nueva, para pintarla
 * @param {(key: string, datos: object) => Promise<{ error?: unknown }>} [piezas.contar]
 */
export const crearRecolocador = ({ almacen, programaAlDia, reenviar, avisar = () => {}, contar = null }) => {
  /* Lo que el entrenador necesita para decirlo en una línea, y nada más: el
     payload lleva el ejercicio entero con su pauta. */
  const contarAlEntrenador = async (key, payload, error) => {
    if (!contar) return;
    const datos = {
      weekNumber: payload?.weekNumber ?? null,
      dayName: payload?.dayName ?? '',
      exercise: { name: payload?.exercise?.name ?? '' },
      setIndex: payload?.setIndex ?? null,
      field: payload?.field ?? '',
      value: String(payload?.value ?? ''),
      date: payload?.date ?? null,
      motivo: mensajeDe(error),
    };
    try {
      const res = await contar(key, datos);
      if (!res?.error) avisar(almacen.marcar(key, { avisado: true }));
    } catch {
      /* Sin red: sigue sin `avisado` y se vuelve a contar al arrancar. */
    }
  };

  const recolocar = async (key, payload, { aMano = false } = {}) => {
    const clientId = key.split(':')[1];
    const programa = await programaAlDia(clientId);
    const dia = diaDeLaSerie(programa, payload);
    if (!dia || (dia === payload.dayName && !aMano)) return false;
    reenviar(key, clientId, { ...payload, dayName: dia, recolocada: true });
    return true;
  };

  return {
    /** Lo llama la cola con cada rechazo definitivo. Resuelve si la ha recolocado. */
    async alRechazar(key, payload, error) {
      if (!key.startsWith('set:')) return false;
      avisar(almacen.put(key, payload, error));
      const movida = esRechazoDelPlan(error) && !payload?.recolocada ? await recolocar(key, payload) : false;
      if (!movida) await contarAlEntrenador(key, payload, error);
      return movida;
    },
    /** Las que se quedaron sin contar (sin red, sin la 0132). */
    contarPendientes: () =>
      Promise.all(
        almacen
          .list()
          .filter((e) => !e.avisado)
          .map((e) => contarAlEntrenador(e.key, e.payload, e.error))
      ),
    /** «Reintentar»: vuelve a buscarle sitio, y si sigue siendo el mismo, la manda igual. */
    reintentar: (key, payload) => recolocar(key, payload, { aMano: true }),
  };
};
