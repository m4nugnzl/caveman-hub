import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useActions, useData } from '@/context/AppContext';
import { estadoDeLaEntrega } from '@/domain/calendar';
import { clientProtocol } from '@/domain/protocol';
import { dismissUpdate, lastSeen, pendingTasks, unseenUpdates } from '@/domain/updates';
import { pendientesDeCliente } from '@/domain/envios';
import { todayISO } from '@/lib/dates';

/**
 * LO QUE ESPERA A ESTA PERSONA: lo que ha cambiado y lo que le falta.
 *
 * ══ Por qué es un gancho y no el cuerpo de una pantalla ════════════════════
 *
 * Porque desde el 12 de septiembre esto lo preguntan varios sitios:
 *
 *   · «Hoy», que es donde se LEE la lista (`ClientStart`, con `sellar`).
 *   · La barra del pulgar, que pinta un punto en «Hoy» cuando hay algo.
 *   · La cinta del monitor, que pinta su chapa por el mismo motivo.
 *
 * ══ Y la revisión, que es otra cosa y por eso va aparte ════════════════════
 *
 * `todo` es LA LISTA: lo que ha cambiado y lo que le falta, que se lee en «Hoy».
 * `revisionEspera` es un hecho con fecha —hoy le toca entregarla y no lo ha
 * hecho— y su sitio es su propio destino. No se meten en el mismo saco: si la
 * revisión entrara en `todo`, el punto se encendería en «Hoy» y llevaría a una
 * lista para mandarte a otra pestaña, que es el viaje que la barra evita.
 *
 * Dos puntos son los que hay, y solo porque son dos cosas distintas que se
 * atienden en dos sitios distintos. Repartir por destinos lo demás —el pesaje
 * en «Tú», la dieta en «Dieta»— sería más preciso y peor: cuatro puntos
 * encendidos dejan de decir «mira aquí» y pasan a ser el aspecto de la barra.
 *
 * Y el segundo existe precisamente porque en el teléfono la cabecera ya no baja
 * (ver `piezas.css`, A-01): la campana vivía ahí, así que el aviso se quedaba sin
 * ningún sitio donde verse antes de entrar. Copiar el cálculo en el marco del
 * portal sería tener dos cuentas que pueden decir cosas distintas de lo mismo.
 *
 * ══ `sellar`: el modo de QUIEN LA PINTA ════════════════════════════════════
 *
 * Contar es barato y lo hacen tres sitios; **sellarla la sella uno solo**, y es
 * el que la enseña. Por eso el modo es un parámetro y no un gancho aparte: si
 * la barra del pulgar sellara —y se monta en todas las pantallas— las novedades
 * se darían por vistas sin que nadie las llegara a ver.
 *
 * Con `sellar` pasan tres cosas, y las tres son de quien pinta:
 *
 *   1. **La lista se congela al entrar.** `unseenUpdates` compara contra
 *      `feed.seen`, así que el propio sello la vacía: sin congelarla, la lista
 *      desaparecería de la pantalla dos segundos después de aparecer, delante
 *      de quien la estaba leyendo.
 *   2. **Se sella `feed.seen`** dos segundos después de entrar. Con retraso a
 *      propósito, y también cuando NO hay novedades: `unseenUpdates` devuelve
 *      vacío mientras no haya un sello —para que quien estrena el portal no vea
 *      de golpe tres avisos de cosas que llevan ahí desde marzo—, así que sin
 *      esa primera escritura no hay novedades jamás. Esa fue exactamente la
 *      avería del 14 de septiembre: el único sitio que escribía el sello
 *      (`ClientUpdates`) se quedó sin montar en el rediseño y el canal entero
 *      se apagó en silencio.
 *   3. **`quitar`** descarta una novedad sin tocar las demás.
 */
export const useAvisos = ({ sellar = false } = {}) => {
  const { clients, anthropometry, activeClient, envioRows, checkIns } = useData();
  const { updateClientPreferences } = useActions();

  const preferences = activeClient?.preferences;
  const history = useMemo(
    () => anthropometry?.[activeClient?.id]?.history || [],
    [anthropometry, activeClient?.id]
  );

  const vivas = useMemo(() => unseenUpdates(preferences), [preferences]);

  const pendientes = useMemo(
    () =>
      activeClient
        ? pendingTasks({
            history,
            protocol: clientProtocol(preferences),
            today: todayISO(),
            formularios: pendientesDeCliente(
              (envioRows || []).filter((f) => f.client_id === activeClient.id),
              todayISO()
            ),
          })
        : [],
    [activeClient, history, preferences, envioRows]
  );

  /* Su revisión: la misma cuenta que hace su propia pantalla, en el dominio
     (`estadoDeLaEntrega`). Aquí solo interesa `espera`. */
  const revisionEspera = useMemo(
    () =>
      activeClient
        ? estadoDeLaEntrega({
            preferences,
            startDate: activeClient.startDate,
            entrega: checkIns?.[activeClient.id],
            today: todayISO(),
          }).espera
        : false,
    [activeClient, preferences, checkIns]
  );

  /* Sin cliente vinculado —o sin cartera cargada todavía— no hay nada que
     contar. La comprobación es la misma que hacía la campana. */
  const hay = Boolean(activeClient) && clients.length > 0;
  const clientId = activeClient?.id || null;

  /*
    LA FOTO de las novedades, hecha la primera vez que hay cliente y guardada
    con su nombre: si se cambia de persona —«Ver como», del entrenador— hay que
    hacerla otra vez, y comparar el id es más barato que un efecto que la borre.
  */
  const foto = useRef({ id: null, lista: [] });
  if (sellar && hay && foto.current.id !== clientId) {
    foto.current = { id: clientId, lista: vivas };
  }

  /* Las descartadas en esta visita. Por cliente, para que la foto y su poda
     cambien a la vez y no haya que acordarse de vaciar una de las dos. */
  const [quitadas, setQuitadas] = useState({});

  const quitar = useCallback(
    (novedad) => {
      if (!clientId || !novedad?.id) return;
      updateClientPreferences(clientId, 'feed', {
        dismissed: dismissUpdate(preferences, novedad.id, novedad.at),
      });
      setQuitadas((previo) => ({
        ...previo,
        [clientId]: [...(previo[clientId] || []), novedad.id],
      }));
    },
    [clientId, preferences, updateClientPreferences]
  );

  const estrena = !lastSeen(preferences);
  const hayVivas = vivas.length > 0;

  useEffect(() => {
    if (!sellar || !clientId || (!hayVivas && !estrena)) return undefined;
    /* Dos segundos: si se sellara al montar, el propio guardado volvería a
       pintar sin novedades antes de que diera tiempo a leerlas. */
    const id = setTimeout(() => {
      updateClientPreferences(clientId, 'feed', { seen: new Date().toISOString() });
    }, 2000);
    return () => clearTimeout(id);
  }, [sellar, clientId, hayVivas, estrena, updateClientPreferences]);

  const novedades = useMemo(() => {
    if (!hay) return [];
    if (!sellar) return vivas;
    const fuera = quitadas[clientId] || [];
    return foto.current.lista.filter((n) => !fuera.includes(n.id));
    /* `foto` es una referencia y no entra en las dependencias a propósito: lo
       que la cambia es el cliente, y ese sí está. */
  }, [hay, sellar, vivas, quitadas, clientId]);

  return useMemo(
    () => ({
      novedades,
      pendientes: hay ? pendientes : [],
      todo: hay ? [...novedades, ...pendientes] : [],
      revisionEspera: hay && revisionEspera,
      quitar,
    }),
    [hay, novedades, pendientes, revisionEspera, quitar]
  );
};
