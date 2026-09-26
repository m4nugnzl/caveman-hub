import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  admin,
  anon,
  compruebaQueNoEsProduccion,
  configurado,
  limpia,
  nuevoCliente,
  nuevoEntrenador,
} from './harness';

/**
 * La puerta del cliente: leer la invitación y canjearla (0015, 0018, 0091, 0148).
 *
 * Todo con la clave anónima y sesiones de verdad, como el navegador. La cuenta
 * del cliente se crea igual que en la aplicación —registrarse y pasar por la
 * raíz, que llama a `ensure_my_team`— porque ese paso es justo el que podría
 * hacer que una cuenta recién creada pareciera la de un entrenador.
 */

const VERSION = '2026-08';

const canjea = (cuenta, token) =>
  cuenta.db.rpc('claim_client_invite', { p_token: token, p_consent_version: VERSION });

const lee = (db, token) => db.rpc('leer_invitacion', { p_token: token });

describe.skipIf(!configurado)('la invitación del cliente', () => {
  let carlos; // el entrenador que invita
  let luis; // otro entrenador, con clientes propios
  let ana; // la cuenta recién creada del cliente
  let otra; // una segunda cuenta recién creada
  let fichaDeAna;
  let fichaDeLuis;
  let fichaSuelta;
  let token;

  beforeAll(async () => {
    compruebaQueNoEsProduccion();
    carlos = await nuevoEntrenador('carlos');
    luis = await nuevoEntrenador('luis');
    await admin().from('profiles').update({ full_name: 'Carlos Pérez' }).eq('id', carlos.id);

    fichaDeAna = await nuevoCliente(carlos, 'Ana García');
    fichaSuelta = await nuevoCliente(carlos, 'Marta Ruiz');
    fichaDeLuis = await nuevoCliente(luis, 'Cliente de Luis');

    const creada = await carlos.db.rpc('create_client_invite', { target: fichaDeAna });
    if (creada.error) throw new Error(creada.error.message);
    token = creada.data;

    /* Registrarse y pasar por la raíz: `nuevoEntrenador` hace exactamente lo
       que hace la aplicación con cualquier cuenta nueva, rol 'coach' y equipo
       propio incluidos. */
    ana = await nuevoEntrenador('ana');
    otra = await nuevoEntrenador('otra');
  }, 90000);

  afterAll(async () => {
    await limpia({
      entrenadores: [carlos, luis, ana, otra],
      clientes: [fichaDeAna, fichaDeLuis, fichaSuelta],
    });
  }, 90000);

  describe('leerla antes de tener cuenta', () => {
    it('sin sesión dice que sirve, de quién es y para quién', async () => {
      const { data, error } = await lee(anon(), token);
      expect(error).toBeNull();
      expect(data.estado).toBe('valida');
      expect(data.cliente).toBe('Ana');
      expect(data.entrenador).toBe('Carlos');
      expect(data.acceso_nuevo).toBe(false);
      expect(data.bloqueo).toBeNull();
      expect(new Date(data.caduca).getTime()).toBeGreaterThan(Date.now());
    });

    it('un token que no existe no dice nada más', async () => {
      const { data } = await lee(anon(), 'f'.repeat(64));
      expect(data).toEqual({ estado: 'no_existe' });
    });

    it('la guarda interna no la puede llamar nadie de fuera', async () => {
      const { error } = await ana.db.rpc('motivo_para_no_canjear', { p_created_by: carlos.id });
      expect(error).not.toBeNull();
    });
  });

  describe('quién no puede canjear', () => {
    it('el entrenador que abre su propio enlace: aviso antes y negativa después', async () => {
      const { data } = await lee(carlos.db, token);
      expect(data.bloqueo).toBe('propia');

      const { error } = await canjea(carlos, token);
      expect(error?.hint).toBe('propia');
    });

    it('un entrenador con clientes, aunque el enlace no sea suyo', async () => {
      const { data } = await lee(luis.db, token);
      expect(data.bloqueo).toBe('entrenador');

      const { error } = await canjea(luis, token);
      expect(error?.hint).toBe('entrenador');
    });

    it('sin sesión no se canjea', async () => {
      const { error } = await anon().rpc('claim_client_invite', {
        p_token: token,
        p_consent_version: VERSION,
      });
      expect(error).not.toBeNull();
    });
  });

  describe('el camino feliz', () => {
    it('una cuenta recién creada que pasó por la raíz NO parece de entrenador', async () => {
      const { data } = await lee(ana.db, token);
      expect(data.estado).toBe('valida');
      expect(data.bloqueo).toBeNull();
    });

    it('canjea, enlaza la ficha, la vuelve cliente y deja constancia', async () => {
      const { data, error } = await canjea(ana, token);
      expect(error).toBeNull();
      expect(data).toBe('Ana García');

      const sa = admin();
      const ficha = await sa.from('clients').select('client_profile_id, email').eq('id', fichaDeAna).single();
      expect(ficha.data.client_profile_id).toBe(ana.id);
      expect(ficha.data.email).toBe(ana.email);

      const perfil = await sa.from('profiles').select('role').eq('id', ana.id).single();
      expect(perfil.data.role).toBe('client');

      const consentimiento = await sa
        .from('client_consents')
        .select('version, kind')
        .eq('client_id', fichaDeAna)
        .eq('profile_id', ana.id);
      expect(consentimiento.data).toEqual([{ version: VERSION, kind: 'granted' }]);
    });

    it('volver a abrir su propio enlace ya usado no es un error: es suyo', async () => {
      const { data } = await lee(ana.db, token);
      expect(data.estado).toBe('tuya');
      expect(data.cliente).toBe('Ana');

      const otraVez = await canjea(ana, token);
      expect(otraVez.error).toBeNull();
      expect(otraVez.data).toBe('Ana García');
    });
  });

  describe('cada error dice cuál es', () => {
    it('usada: para cualquier otra cuenta, antes y al canjear', async () => {
      expect((await lee(anon(), token)).data.estado).toBe('usada');
      expect((await lee(anon(), token)).data.cliente).toBeNull();

      const { error } = await canjea(otra, token);
      expect(error?.hint).toBe('usada');
      expect(error?.message).toMatch(/si fuiste tú, entra/i);
    });

    it('cuenta enlazada a otro cliente: no puede quedarse con una segunda ficha', async () => {
      const nueva = await carlos.db.rpc('create_client_invite', { target: fichaSuelta });
      const { error } = await canjea(ana, nueva.data);
      expect(error?.hint).toBe('cuenta_enlazada');
      /* Y la cierra: la invitación sigue viva para su dueño. */
      expect((await lee(anon(), nueva.data)).data.estado).toBe('valida');
    });

    it('caducada', async () => {
      const viva = await carlos.db.rpc('create_client_invite', { target: fichaSuelta });
      await admin()
        .from('client_invites')
        .update({ expires_at: new Date(Date.now() - 60000).toISOString() })
        .eq('token', viva.data);

      expect((await lee(anon(), viva.data)).data.estado).toBe('caducada');
      const { error } = await canjea(otra, viva.data);
      expect(error?.hint).toBe('caducada');
    });

    it('anulada', async () => {
      const viva = await carlos.db.rpc('create_client_invite', { target: fichaSuelta });
      expect((await lee(anon(), viva.data)).data.estado).toBe('valida');

      await carlos.db.rpc('revoke_client_invite', { target: fichaSuelta });
      expect((await lee(anon(), viva.data)).data.estado).toBe('anulada');

      const { error } = await canjea(otra, viva.data);
      expect(error?.hint).toBe('anulada');
    });

    it('ficha ya enlazada a otra cuenta', async () => {
      const viva = await carlos.db.rpc('create_client_invite', { target: fichaSuelta });
      /* No debería pasar —invitar se niega sobre una ficha enlazada—, pero una
         invitación viva que llega a una ficha que ya tiene dueño es el caso que
         la guarda existe para cortar. */
      await admin().from('clients').update({ client_profile_id: luis.id }).eq('id', fichaSuelta);

      expect((await lee(anon(), viva.data)).data.estado).toBe('enlazada');
      const { error } = await canjea(otra, viva.data);
      expect(error?.hint).toBe('ficha_enlazada');

      await admin().from('clients').update({ client_profile_id: null }).eq('id', fichaSuelta);
    });
  });

  describe('reemitir el acceso (0083)', () => {
    let nuevoToken;

    it('suelta la cuenta de antes y el enlace nuevo sabe que es un acceso nuevo', async () => {
      const { data, error } = await carlos.db.rpc('reissue_client_access', { target: fichaDeAna });
      expect(error).toBeNull();
      nuevoToken = data;

      const leida = await lee(anon(), nuevoToken);
      expect(leida.data.estado).toBe('valida');
      expect(leida.data.acceso_nuevo).toBe(true);

      /* El enlace viejo, que la cuenta de antes tenía en su WhatsApp, ya no la
         lleva a su portal: esa cuenta ya no es la de la ficha. */
      expect((await lee(ana.db, token)).data.estado).toBe('usada');
    });

    it('entra la cuenta nueva y la ficha es suya, con su historial', async () => {
      const { data, error } = await canjea(otra, nuevoToken);
      expect(error).toBeNull();
      expect(data).toBe('Ana García');

      const ficha = await admin().from('clients').select('client_profile_id').eq('id', fichaDeAna).single();
      expect(ficha.data.client_profile_id).toBe(otra.id);
    });
  });
});
