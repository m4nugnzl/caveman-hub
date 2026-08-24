import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';

/**
 * El informe de plataforma, pedido a la función edge.
 *
 * ══ Las DOS comprobaciones, y por qué no son la misma ═══════════════════════
 *
 * Aquí hay una que decide si se PINTA el enlace (`esAdmin`) y otra, en el
 * servidor, que decide si se ENTREGAN los datos. Parece duplicado y no lo es:
 *
 *   · La de aquí es **cosmética**. Corre en el navegador, o sea en una máquina
 *     que no controlamos, y cualquiera puede saltársela con la consola abierta.
 *     Su único trabajo es no enseñarle a un entrenador un enlace que le va a dar
 *     403. No protege nada y no pretende hacerlo.
 *
 *   · La de verdad está en `supabase/functions/radiografia`, que lee
 *     `platform_admins` con la clave de servicio antes de tocar un solo dato.
 *     Saltarse la de aquí no adelanta nada: la respuesta sigue siendo 403.
 *
 * Confundir las dos es como se acaba protegiendo una pantalla con un `if` del
 * cliente y creyendo que está cerrada. Aquí queda escrito para que nadie retire
 * la del servidor pensando que ésta ya lo cubre.
 *
 * ══ Por qué no se pide solo ════════════════════════════════════════════════
 *
 * El informe lee dieciocho tablas enteras y llama a dos funciones de catálogo.
 * Es la petición más cara de toda la aplicación, y esto no es una pantalla que
 * se abra sin querer: se abre para mirar. Pedirlo al montar significaría que
 * cambiar de ventana o volver atrás lo repite entero.
 */

/** Las ventanas que se pueden mirar. Acotan SOLO las tablas de telemetría. */
export const VENTANAS = [
  { id: 7, label: '7 días' },
  { id: 30, label: '30 días' },
  { id: 90, label: '90 días' },
];

/*
  La respuesta se guarda para toda la carga de página, no por componente.

  Lo pregunta el menú de cuenta —que se monta en cada pantalla— y la propia
  radiografía. Sin esto, cambiar de sección dispara la consulta otra vez para
  contestar algo que no cambia mientras dure la sesión.

  Se cachea LA PROMESA y no el resultado: si dos componentes montan a la vez
  antes de que conteste la primera, las dos esperan a la misma en vez de lanzar
  dos. Se borra al fallar, para que un corte de red no deje «no eres admin»
  grabado hasta que se recargue la página.
*/
let promesaAdmin = null;

const esAdminPlataforma = () => {
  if (!promesaAdmin) {
    promesaAdmin = supabase
      .rpc('is_platform_admin')
      .then(({ data, error }) => {
        if (error) {
          promesaAdmin = null;
          return false;
        }
        return data === true;
      })
      .catch(() => {
        promesaAdmin = null;
        return false;
      });
  }
  return promesaAdmin;
};

/**
 * Solo si esta cuenta administra la plataforma. `null` mientras no se sabe.
 *
 * Lo usa el menú de cuenta para decidir si pinta el enlace, y por eso está
 * separado del informe: no tiene sentido montar el estado de una petición de
 * varios segundos para contestar un sí o un no.
 */
export const useEsAdminPlataforma = () => {
  const [esAdmin, setEsAdmin] = useState(null);

  useEffect(() => {
    let cancelado = false;
    esAdminPlataforma().then((v) => {
      if (!cancelado) setEsAdmin(v);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  return esAdmin;
};

export const useRadiografia = () => {
  const esAdmin = useEsAdminPlataforma();
  const [informe, setInforme] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  /* Para no escribir sobre un componente desmontado: el informe tarda varios
     segundos y salirse de la pantalla mientras llega es lo normal. */
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const pedir = useCallback(async ({ dias = 30, programas = true } = {}) => {
    setCargando(true);
    setError(null);

    const { data, error: err } = await supabase.functions.invoke('radiografia', {
      body: { dias, programas },
    });

    if (!vivo.current) return;
    setCargando(false);

    if (err) {
      /*
        El mensaje del cliente de Supabase para un 4xx es «Edge Function returned
        a non-2xx status code», que no dice nada. El cuerpo sí trae el motivo
        —«Esto no es para tu cuenta»—, así que se intenta leer antes de rendirse.
      */
      let detalle = err.message;
      try {
        const cuerpo = await err.context?.json?.();
        if (cuerpo?.error) detalle = cuerpo.error;
      } catch {
        /* El cuerpo no era JSON: nos quedamos con el mensaje de arriba, que es
           peor pero es algo. No se traga el error, solo no se mejora. */
      }
      setError(detalle);
      return;
    }

    setInforme(data);
  }, []);

  /**
   * Da por buenos unos hallazgos, con su motivo.
   *
   * ── Por qué NO retoca el informe que ya está en pantalla ────────────────
   * Sería lo barato: marcar esas claves como aceptadas en memoria y ya. Pero
   * entonces la pantalla enseñaría el resultado que ESPERA en vez del que hay,
   * y las dos cosas se separan en cuanto algo falla a medias —una clave que ya
   * no existe, por ejemplo—. Se vuelve a pedir: cuesta unos segundos y lo que
   * se ve es lo que quedó guardado.
   */
  const aceptar = useCallback(
    async ({ claves, motivo, dias = 30 }) => {
      setError(null);

      const { data, error: err } = await supabase.functions.invoke('radiografia', {
        body: { accion: 'aceptar', claves, motivo },
      });

      if (!vivo.current) return null;

      if (err) {
        let detalle = err.message;
        try {
          const cuerpo = await err.context?.json?.();
          if (cuerpo?.error) detalle = cuerpo.error;
        } catch {
          /* El cuerpo no era JSON: queda el mensaje de arriba, que es peor pero
             es algo. No se traga el error, solo no se mejora. */
        }
        setError(detalle);
        return null;
      }

      await pedir({ dias });
      return data;
    },
    [pedir]
  );

  return { esAdmin, informe, cargando, error, pedir, aceptar };
};
