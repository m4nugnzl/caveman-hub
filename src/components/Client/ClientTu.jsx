import { useEffect, useMemo, useState } from 'react';

import { useActions, useApp, useSession } from '@/context/AppContext';
import { useTheme } from '@/lib/useTheme';
import { useTour } from '@/components/WelcomeTour';
import { weightSeries } from '@/domain/anthropometry';
import { resolvedMicrocycles } from '@/domain/blocks';
import { estadoDeLaEntrega } from '@/domain/calendar';
import { weekFromStart } from '@/domain/photos';
import { pendientesDeCliente } from '@/domain/envios';
import { allSessions } from '@/domain/sessions';
import { localeNumber, shortDate, todayISO } from '@/lib/dates';
import { initials } from '@/lib/initials';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { Modal } from '@/components/ui/Modal';
import { useReviewRows } from '@/components/review/useReviewRows';
import { ClientFolder } from './ClientFolder';
import { ClientPrivacy } from './ClientPrivacy';
import { useOculto } from './Oculto';
import { PantallaTu as TuEnMonitor } from './pc/PantallaTu';
import { PantallaTu as TuEnTelefono } from './movil/PantallaTu';

/**
 * «TÚ» — la persona y su rastro. El único destino que no habla del plan.
 *
 * ══ De dónde sale ══════════════════════════════════════════════════════════
 *
 * De juntar lo que estaba en tres sitios y en ninguno: su calendario (una
 * pestaña que se abre dos veces al mes), su privacidad y su carpeta (tiradas al
 * pie de la portada, donde quien bajaba del todo se encontraba el ejercicio de
 * sus derechos debajo de su peso) y su cuenta, que vivía en una cabecera que en
 * el teléfono ya no baja.
 *
 * ══ Qué cambió el 14 de septiembre de 2026 ═════════════════════════════════
 *
 * Que en el teléfono recoge además **«Cerrar la semana»**, con su estado al
 * lado. La revisión sale de la barra del pulgar —que pasa a cuatro destinos, los
 * del prototipo— y baja aquí. En el monitor sigue arriba, en la cinta, porque
 * allí no hay presupuesto de destinos que gastar.
 *
 * ══ Las capas ══════════════════════════════════════════════════════════════
 *
 * La carpeta y la privacidad abren capa y no ruta: son dos pantallas a las que
 * se entra, se mira y se sale, y una URL propia para eso son dos direcciones que
 * nadie guarda en marcadores. Ver `la app es panel, no documento`.
 */
export const ClientTu = () => {
  const { activeClient, anthropometry, workoutData, progressPhotos, checkIns, envioRows } =
    useApp();
  const { loadClientFolder, ensurePhotoUrls, signOut } = useActions();
  /* Los tres mandos que antes vivían escondidos dentro de `AccountMenu`: el
     tema, el tutorial y la salida. Ahora son filas de esta pantalla, así que
     los engancha quien la monta. Ver `pc/PantallaTu`. */
  const { session, profileName } = useSession();
  const { isDark, setTheme } = useTheme();
  const tour = useTour();
  const oculto = useOculto();
  const enMonitor = useMediaQuery('(min-width: 1024px)');
  /* La carpeta se consulta AQUÍ y no dentro de `ClientFolder`: la fila no se
     puede pintar sin saber si existe —«Tus documentos» abriendo una capa vacía
     es prometer algo que no hay— y consultarla dos veces sería pagar dos
     peticiones por el mismo dato. */
  const [carpeta, setCarpeta] = useState(null);
  /* Qué capa está abierta, o `null`. Una sola variable y no dos booleanos: son
     puertas excluyentes, y con banderas sueltas el día que se abran dos a la vez
     nadie se entera. */
  const [capa, setCapa] = useState(null);

  const { checkIns: historial } = useReviewRows(activeClient?.id);

  useEffect(() => {
    if (!activeClient?.id) return undefined;
    let vivo = true;
    loadClientFolder(activeClient.id).then((res) => {
      if (vivo && res.ok) setCarpeta(res.folder);
    });
    return () => {
      vivo = false;
    };
  }, [activeClient?.id, loadClientFolder]);

  /* Las fotos se cargan sin enlace firmado y se firman en la pantalla que las
     va a enseñar. */
  useEffect(() => {
    if (activeClient?.id) ensurePhotoUrls(activeClient.id);
  }, [ensurePhotoUrls, activeClient?.id]);

  const micros = useMemo(
    () => (workoutData?.[activeClient?.id] ? resolvedMicrocycles(workoutData[activeClient.id]) : []),
    [workoutData, activeClient?.id]
  );

  if (!activeClient) return null;

  const historialPeso = anthropometry?.[activeClient.id]?.history || [];
  const pesajes = weightSeries(historialPeso);
  const verPeso = !oculto.weight && pesajes.length > 0;
  const ultimo = pesajes[pesajes.length - 1]?.value ?? null;

  const entregadas = historial.filter((c) => c.submittedAt || c.reviewedAt).length;
  const sesiones = allSessions(micros).length;
  const fotos = (progressPhotos || []).filter((p) => p.clientId === activeClient.id);

  /* Si le toca entregar, para el estado de la fila del teléfono. */
  const { periodo, sinEntregar } = estadoDeLaEntrega({
    preferences: activeClient.preferences,
    startDate: activeClient.startDate,
    entrega: checkIns?.[activeClient.id],
    today: todayISO(),
  });

  /*
    CUÁNTAS COSAS LE ESPERAN de las que le mandó su entrenador.

    La fila llevaba el rótulo y nada más, así que no distinguía entre tener cero
    y tener cinco — y era la única puerta del portal a todo lo que reparten las
    automatizaciones. La cuenta la hace el dominio, la misma que lee su portada
    y la que sale en la cartera del entrenador (`pendientesDeCliente`).
  */
  const esperando = pendientesDeCliente(
    (envioRows || []).filter((f) => f.client_id === activeClient.id),
    todayISO()
  ).length;
  const cuantasEsperan = esperando === 1 ? '1 pendiente' : `${esperando} pendientes`;

  const ultimoPeso = verPeso ? `${kg(ultimo)} kg` : null;
  const desde = activeClient.startDate ? `Cliente desde el ${shortDate(activeClient.startDate)}` : null;
  const correo = session?.user?.email || '';

  /* ── El monitor ───────────────────────────────────────────────────────── */
  const datosPC = {
    nombre: 'Tú',
    desde,
    teselas: [
      verPeso
        ? { rot: 'Tu peso', icono: undefined, val: kg(ultimo), uni: 'kg', pie: pesajes.length > 0 ? `apuntado el ${shortDate(pesajes[pesajes.length - 1].date)}` : null }
        : null,
      { rot: 'Revisiones entregadas', val: String(entregadas), pie: `${historial.length} semanas abiertas` },
      fotos.length > 0 ? { rot: 'Fotos', val: String(fotos.length), pie: 'de tu evolución' } : null,
    ].filter(Boolean),
    rastro: [
      {
        icono: 'regla',
        rotulo: 'Tu peso y tus medidas',
        frase: 'lo que anotas cada semana',
        cifra: ultimoPeso,
        to: '/mi/evolucion/medidas',
      },
      {
        icono: 'entrega',
        rotulo: 'Tus revisiones',
        frase: 'lo que le fuiste entregando',
        cifra: entregadas > 0 ? String(entregadas) : null,
        to: '/mi/evolucion',
      },
      {
        icono: 'camara',
        rotulo: 'Tus fotos',
        frase: 'todas, por semana',
        cifra: fotos.length > 0 ? String(fotos.length) : null,
        to: '/mi/evolucion/fotos',
      },
      {
        icono: 'calendario',
        rotulo: 'Tu calendario',
        frase: 'lo que tienes por delante',
        to: '/mi/calendario',
      },
      {
        icono: 'bandeja',
        rotulo: 'Lo que te ha mandado',
        frase: 'formularios y protocolos',
        pildora: esperando > 0 ? { tono: 'espera', texto: cuantasEsperan } : null,
        to: '/mi/formularios',
      },
    ],
    /*
      ── LOS AJUSTES, que es la columna que no existía ──────────────────────
      *«Tiene modo noche pero no tiene ajustes donde ponerlo, ni ajustes donde
      hacer cosas.»* El tema estaba a dos clics dentro del desplegable de la
      cuenta; la privacidad y la carpeta eran las únicas dos filas de una caja
      rotulada «Tu cuenta», que es otra cosa. Aquí va lo que se CAMBIA, y la
      cuenta se queda con quién eres.
    */
    ajustes: {
      oscuro: isDark,
      onTema: setTheme,
      filas: [
        {
          icono: 'escudo',
          rotulo: 'Tus datos y tu privacidad',
          frase: 'qué se guarda de ti, y cómo llevártelo',
          onClick: () => setCapa('privacidad'),
        },
        carpeta
          ? {
              icono: 'carpeta',
              rotulo: 'Tus documentos',
              frase: 'la carpeta que compartís',
              onClick: () => setCapa('carpeta'),
            }
          : null,
      ].filter(Boolean),
    },
    cuenta: {
      /* Tu nombre si lo hay y, si no, el correo: la misma regla que `AccountMenu`
         —es la identidad que sí tenemos—. */
      quien: profileName || correo || activeClient.name,
      correo: profileName ? correo : null,
      /*
        SIN el nombre de su entrenador, y no por olvido: el cliente no puede
        leer su perfil. `profiles` solo deja ver el propio, así que aquí no hay
        nada que enseñar sin abrir una lectura nueva en la base. Ver
        `domain/intakeForm.js`, que ya tropezó con esto.
      */
      entrenador: null,
      onTutorial: () => tour.setOpen(true),
      onSalir: signOut,
    },
  };

  /* ── Y el teléfono: el perfil del frame `328:7` (18 sep 2026) ─────────── */
  const semanasDesdeAlta = activeClient.startDate ? weekFromStart(activeClient.startDate, todayISO()) : null;
  const datosMovil = {
    nombre: activeClient.name,
    iniciales: initials(activeClient.name),
    desde: activeClient.startDate ? `Cliente activo desde el ${shortDate(activeClient.startDate)}` : null,
    record: [
      { v: String(sesiones), k: sesiones === 1 ? 'entreno' : 'entrenos' },
      semanasDesdeAlta ? { v: String(semanasDesdeAlta), k: semanasDesdeAlta === 1 ? 'semana' : 'semanas' } : null,
      { v: String(entregadas), k: entregadas === 1 ? 'entrega' : 'entregas' },
    ].filter(Boolean),
    filas: [
      !oculto.weight
        ? {
            icono: 'peso',
            titulo: 'Apuntar el peso',
            sub: ultimoPeso ? `El último: ${ultimoPeso}` : 'Tu báscula, cada mañana',
            to: '/mi/evolucion/peso',
          }
        : null,
      {
        icono: 'medidas',
        titulo: 'Tus medidas',
        sub: ultimaMedida(historialPeso) ? `Las últimas, el ${ultimaMedida(historialPeso)}` : 'Perímetros y pliegues',
        to: '/mi/evolucion/medidas',
      },
      {
        icono: 'semana',
        titulo: 'Cerrar la semana',
        sub: sinEntregar ? (periodo?.isDue ? 'Te toca hoy' : 'Cuando la tengas') : 'Entregada',
        to: '/mi/evolucion',
      },
      {
        icono: 'progreso',
        titulo: 'Tu progreso',
        sub: 'Tu peso, tus marcas y lo que mueves',
        to: '/mi/progreso',
      },
      {
        icono: 'mandado',
        titulo: 'Lo que te ha mandado',
        sub: 'Formularios y documentos',
        espera: esperando > 0 ? cuantasEsperan : null,
        to: '/mi/formularios',
      },
      { icono: 'calendario', titulo: 'Tu calendario', sub: 'Lo que tienes por delante', to: '/mi/calendario' },
    ].filter(Boolean),
    cuenta: [
      carpeta
        ? { icono: 'documentos', titulo: 'Tus documentos', sub: 'La carpeta que compartís', onClick: () => setCapa('carpeta') }
        : null,
      {
        icono: 'privacidad',
        titulo: 'Tus datos y tu privacidad',
        sub: 'Qué se guarda de ti, y cómo llevártelo',
        onClick: () => setCapa('privacidad'),
      },
    ].filter(Boolean),
  };

  return (
    <>
      {enMonitor ? <TuEnMonitor datos={datosPC} /> : <TuEnTelefono datos={datosMovil} />}

      {capa === 'carpeta' && (
        <Modal open title="Tus documentos" onClose={() => setCapa(null)}>
          <ClientFolder client={activeClient} carpeta={carpeta} desnudo />
        </Modal>
      )}

      {capa === 'privacidad' && (
        <Modal open title="Tus datos y tu privacidad" size="lg" onClose={() => setCapa(null)}>
          <ClientPrivacy client={activeClient} desnudo />
        </Modal>
      )}
    </>
  );
};

const kg = (v) =>
  localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Cuándo se tomó la última medida, para el valor de su fila. */
const ultimaMedida = (history) => {
  const conMedida = (history || [])
    .filter((h) => Object.values(h.perimeters || {}).some((v) => Number(v) > 0))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  return conMedida ? shortDate(conMedida.date) : null;
};
