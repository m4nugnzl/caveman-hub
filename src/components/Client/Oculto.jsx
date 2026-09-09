import { createContext, useContext, useMemo } from 'react';

import { clientProtocol, hiddenFor } from '@/domain/protocol';

/**
 * QUÉ CIFRAS NO SE LE DEVUELVEN A ESTA PERSONA, para todo el portal a la vez.
 *
 * ══ Por qué esto es un contexto y no una propiedad ══════════════════════════
 *
 * Porque es una regla de PRIVACIDAD, y una regla de privacidad que hay que
 * acordarse de pasar es una regla que un día se olvida. El peso del cliente sale
 * hoy en su portada, en su check-in, en el pie de cada foto, en el resumen de
 * cada revisión pasada y en el asistente de entrega: seis sitios, cinco niveles
 * de profundidad y tres componentes que comparte con el entrenador. Bajar un
 * `sinPeso` por esa cadena significa que la pantalla que se añada el mes que
 * viene nazca enseñándolo, y que nadie se entere hasta que lo vea el cliente.
 *
 * Con un contexto, la pregunta se hace donde se pinta la cifra —`useOculto()`,
 * una línea— y **el valor por defecto es el de siempre**: fuera del portal no
 * hay proveedor, así que el entrenador ve todo aunque use el mismo componente.
 * No hay forma de que lo del cliente se cuele en la pantalla del entrenador, que
 * es el otro lado del mismo error y el más caro de los dos.
 *
 * ── Qué NO hace ─────────────────────────────────────────────────────────────
 * No es un permiso del servidor: los datos del cliente son suyos y siguen
 * llegando a su navegador (los descarga en «Mis datos y privacidad», como manda
 * el RGPD). Esto decide qué le pone la aplicación DELANTE, que es exactamente el
 * problema que se vino a resolver. Ver `HIDDEN_INFO` en `domain/protocol.js`.
 */
const NADA_OCULTO = { weight: false, nutrition: false };

const OcultoCtx = createContext(NADA_OCULTO);

export const OcultoProvider = ({ client, children }) => {
  const valor = useMemo(
    () => hiddenFor(clientProtocol(client?.preferences)),
    [client?.preferences]
  );
  return <OcultoCtx.Provider value={valor}>{children}</OcultoCtx.Provider>;
};

/**
 * `{ weight, nutrition }`: si esta pantalla se está pintando PARA el cliente y
 * su entrenador le ha ocultado esa cifra. Fuera del portal, las dos en `false`.
 */
export const useOculto = () => useContext(OcultoCtx);
