import { beforeEach, describe, expect, it } from 'vitest';

import { invitacionPendiente, olvidarInvitacion, recordarInvitacion } from './invitacionPendiente';

/* En Node no hay `localStorage`: uno en memoria, que es lo que el navegador hace. */
const memoria = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => memoria.set(k, String(v)),
  removeItem: (k) => memoria.delete(k),
};

const TOKEN = 'a'.repeat(64);
const OTRO = 'b'.repeat(64);

describe('la invitación pendiente', () => {
  beforeEach(() => memoria.clear());

  it('se recuerda y se lee', () => {
    recordarInvitacion(TOKEN);
    expect(invitacionPendiente()).toBe(TOKEN);
  });

  it('lo que no tiene forma de token no se guarda', () => {
    recordarInvitacion('../../ajustes');
    expect(invitacionPendiente()).toBeNull();
  });

  it('caduca a los 14 días, como el enlace', () => {
    recordarInvitacion(TOKEN);
    const quinceDias = Date.now() + 15 * 24 * 60 * 60 * 1000;
    expect(invitacionPendiente(quinceDias)).toBeNull();
  });

  it('olvidar otra no borra la apuntada', () => {
    recordarInvitacion(TOKEN);
    olvidarInvitacion(OTRO);
    expect(invitacionPendiente()).toBe(TOKEN);
    olvidarInvitacion(TOKEN);
    expect(invitacionPendiente()).toBeNull();
  });

  it('con el almacenamiento bloqueado no hay red, y nada falla', () => {
    const original = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(() => recordarInvitacion(TOKEN)).not.toThrow();
    expect(invitacionPendiente()).toBeNull();
    expect(() => olvidarInvitacion()).not.toThrow();
    globalThis.localStorage = original;
  });
});
