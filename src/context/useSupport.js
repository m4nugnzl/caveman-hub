import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { mapTicketFromDb } from '@/lib/mappers';
import { buildSupportPath, validateAttachment } from '@/domain/attachments';
import { track } from '@/lib/analytics';
import { BUCKET, SIGNED_URL_TTL_SECONDS } from '@/context/media';

/*
  ══ El soporte, fuera de AppContext ══════════════════════════════════════════

  Segundo dominio extraído del proveedor, con la convención de `useRoadmap.js`:
  un gancho que posee su estado (`isSupport`) y devuelve sus acciones, recibiendo
  solo lo que necesita (la sesión y el equipo, para etiquetar el ticket).

  Lo que NO vino con él, a propósito: `uploadIntakeFile` y `signPaths` se quedan
  en el proveedor porque no son de soporte — el primero es de los pasos del alta
  y el segundo lo comparten cuatro dominios.
*/

export const useSupport = ({ session, team }) => {
  /*
    ¿Atiendo yo la plataforma? Se pregunta a la base y no se deduce de nada del
    navegador.

    Este valor solo decide QUÉ SE PINTA —la bandeja de todos, o solo mis hilos—.
    Quién puede leer qué lo sigue decidiendo RLS, así que si esto se pusiera a
    `true` desde la consola del navegador lo único que pasaría es que se vería una
    bandeja vacía.
  */
  const [isSupport, setIsSupport] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) {
      setIsSupport(false);
      return undefined;
    }

    let cancelado = false;
    (async () => {
      const { data, error } = await supabase.rpc('is_platform_admin');
      // Sin la 0034 la función no existe: nadie es soporte, que es el lado
      // correcto por el que equivocarse.
      if (!cancelado) setIsSupport(!error && data === true);
    })();

    return () => {
      cancelado = true;
    };
  }, [session]);

  /**
   * Los tickets que puedo ver: los míos, o TODOS si atiendo la plataforma.
   *
   * La consulta es la misma en los dos casos y quien decide es RLS (migración
   * 0034). Es lo que evita el error clásico de esto: un `if (soyAdmin)` en el
   * navegador que elige entre dos consultas y que, mal puesto, enseña la bandeja
   * entera a quien no debe. Aquí la aplicación no tiene forma de pedir de más.
   */
  const loadTickets = useCallback(async () => {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*, profiles(full_name, email), support_messages(*)')
      .order('updated_at', { ascending: false });

    if (error) return { ok: false, error: error.message, tickets: [] };

    const tickets = (data || []).map(mapTicketFromDb).map((ticket) => ({
      ...ticket,
      // PostgREST no garantiza el orden de lo embebido; un hilo desordenado se
      // lee como una conversación en la que nadie contesta a lo anterior.
      messages: [...ticket.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }));

    /*
      Los adjuntos se firman TODOS DE UNA VEZ, no uno por mensaje.

      Una bandeja de soporte con veinte hilos abiertos son veinte peticiones de
      firma en cascada nada más entrar. `createSignedUrls` acepta la lista entera
      y devuelve lo que puede firmar; lo que no —un archivo borrado a mano, una
      ruta de un ticket ajeno— se queda sin URL y el mensaje lo dice, en vez de
      dejar un enlace roto.
    */
    const paths = tickets.flatMap((t) => t.messages.map((m) => m.attachmentPath).filter(Boolean));

    if (paths.length > 0) {
      const { data: firmadas } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

      const porRuta = new Map(
        (firmadas || []).filter((f) => f.signedUrl).map((f) => [f.path, f.signedUrl])
      );

      for (const ticket of tickets) {
        ticket.messages = ticket.messages.map((m) =>
          m.attachmentPath ? { ...m, attachmentUrl: porRuta.get(m.attachmentPath) || null } : m
        );
      }
    }

    return { ok: true, tickets };
  }, []);

  /**
   * Sube el adjunto de un mensaje de soporte y devuelve su ruta.
   *
   * La ruta lleva el id del ticket dentro (`support/<ticketId>/…`) y eso es lo
   * que la política de la 0039 comprueba: no hay forma de dejar un archivo en el
   * hilo de otro, ni siquiera llamando a Storage directamente.
   */
  const uploadSupportAttachment = useCallback(async ({ ticketId, file }) => {
    const invalido = validateAttachment(file);
    if (invalido) return { ok: false, error: invalido };

    const path = buildSupportPath({ ticketId, fileName: file.name });
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });

    return error ? { ok: false, error: error.message } : { ok: true, path };
  }, []);

  const createTicket = useCallback(
    async ({ subject, body, context = {}, attachment = null }) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };

      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          profile_id: userId,
          team_id: team?.id ?? null,
          subject: String(subject || '').trim(),
          context,
        })
        .select()
        .single();

      if (error) return { ok: false, error: error.message };

      /*
        La captura, si la hay, se sube DESPUÉS de crear el ticket: su ruta lleva
        el id dentro y hasta aquí no existe.

        Y si la subida falla, el mensaje se manda igual. El texto es lo que se
        puede contestar; perder el ticket entero porque la imagen pesaba de más
        —justo cuando la persona está escribiendo porque algo no le funciona— es
        la peor respuesta posible. Se avisa y se sigue.
      */
      let adjunto = null;
      let aviso = null;
      if (attachment) {
        const subida = await uploadSupportAttachment({ ticketId: data.id, file: attachment });
        if (subida.ok) adjunto = subida.path;
        else aviso = `El ticket se ha enviado, pero el archivo no: ${subida.error}`;
      }

      /*
        El primer mensaje va aparte y no en una columna del ticket. Así el hilo es
        homogéneo desde el principio: la pantalla pinta una lista de mensajes y no
        «el texto original, y además los mensajes», que es la variante que obliga
        a tratar el primero como un caso especial en cada sitio.
      */
      const primero = await supabase.from('support_messages').insert({
        ticket_id: data.id,
        author_id: userId,
        from_support: false,
        body: String(body || '').trim(),
        attachment_path: adjunto,
      });

      if (primero.error) return { ok: false, error: primero.error.message };

      /*
        El aviso por correo, y su fallo NO se propaga.

        El ticket ya está guardado y se puede leer en la bandeja: si el correo no
        sale —porque no hay clave configurada, porque Resend está caído— sería
        mentira decirle al entrenador que no se ha podido crear su ticket. Se
        traga a propósito.

        Va después del INSERT y no dentro de la función: así el ticket existe
        aunque el aviso falle, en vez de al revés.
      */
      supabase.functions
        .invoke('support-notify', { body: { ticketId: data.id } })
        .catch(() => {});

      /*
        Un ticket es fricción medida en la única unidad que no engaña: alguien se
        ha parado a escribir. Cruzado con `app_errors` de la misma semana separa
        las dos clases de problema que se confunden siempre — «esto está roto»
        (habrá fallos registrados) de «esto no se entiende» (no habrá ninguno), y
        la segunda no se arregla mirando el código.
      */
      track('soporte_abierto');

      return { ok: true, ticketId: data.id, aviso };
    },
    [session, team, uploadSupportAttachment]
  );

  const replyTicket = useCallback(
    async (ticketId, body, fromSupport = false, attachment = null) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };

      /* Aquí el ticket ya existe, así que la subida va PRIMERO: si falla, no se
         ha escrito nada y el fallo se puede contar entero. */
      let adjunto = null;
      if (attachment) {
        const subida = await uploadSupportAttachment({ ticketId, file: attachment });
        if (!subida.ok) return { ok: false, error: `No se pudo subir el archivo: ${subida.error}` };
        adjunto = subida.path;
      }

      const { error } = await supabase.from('support_messages').insert({
        ticket_id: ticketId,
        author_id: userId,
        // La política comprueba que esto coincida con si eres soporte de verdad
        // (0034), así que mentir aquí no cuela: la fila se rechaza.
        from_support: fromSupport,
        body: String(body || '').trim(),
        attachment_path: adjunto,
      });

      return error ? { ok: false, error: error.message } : { ok: true };
    },
    [session, uploadSupportAttachment]
  );

  const setTicketStatus = useCallback(async (ticketId, status) => {
    const { error } = await supabase
      .from('support_tickets')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', ticketId);

    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  return { isSupport, loadTickets, createTicket, replyTicket, setTicketStatus };
};
