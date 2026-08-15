import { describe, expect, it } from 'vitest';

import {
  onboardingCurrent,
  onboardingPending,
  onboardingProgress,
  onboardingSteps,
} from './onboarding';

const cliente = (id, extra = {}) => ({ id, name: `Cliente ${id}`, clientProfileId: null, ...extra });

describe('onboardingSteps — sabe por dónde va', () => {
  it('sin clientes, lo único que se puede hacer es dar de alta', () => {
    const pasos = onboardingSteps({});
    expect(onboardingCurrent(pasos).id).toBe('alta');
    /* Los tres de después no se pueden saber todavía: sin clientes no hay a
       quién programar ni a quién invitar. Se dicen, no se marcan. */
    expect(pasos.find((p) => p.id === 'programar').sabido).toBe(false);
    expect(pasos.find((p) => p.id === 'invitar').sabido).toBe(false);
  });

  it('con un cliente, el alta queda hecha y toca programar', () => {
    const pasos = onboardingSteps({ clients: [cliente('a')] });
    expect(pasos.find((p) => p.id === 'alta').hecho).toBe(true);
    expect(onboardingCurrent(pasos).id).toBe('programar');
  });

  it('programado pero sin invitar, el siguiente paso es el enlace', () => {
    const pasos = onboardingSteps({
      clients: [cliente('a')],
      training: { a: { microcycleCount: 2 } },
    });
    expect(pasos.find((p) => p.id === 'programar').hecho).toBe(true);
    expect(onboardingCurrent(pasos).id).toBe('invitar');
  });

  it('invitar solo cuenta cuando el cliente ENTRÓ, no cuando se generó el enlace', () => {
    /*
      Es la diferencia que importa: un token creado y nunca mandado deja al
      cliente fuera igual que si no se hubiera generado. Lo que se sabe de verdad
      es que tiene cuenta enlazada.
    */
    const sinEntrar = onboardingSteps({ clients: [cliente('a')] });
    expect(sinEntrar.find((p) => p.id === 'invitar').hecho).toBe(false);

    const dentro = onboardingSteps({ clients: [cliente('a', { clientProfileId: 'u1' })] });
    expect(dentro.find((p) => p.id === 'invitar').hecho).toBe(true);
  });

  it('la acción apunta a QUIEN le falta, no siempre al primero de la lista', () => {
    const pasos = onboardingSteps({
      clients: [cliente('a', { clientProfileId: 'u1' }), cliente('b')],
      training: { a: { microcycleCount: 3 } },
    });
    /* Marta ya está programada e invitada; el que falta es el otro. */
    expect(pasos.find((p) => p.id === 'programar').cliente.id).toBe('b');
    expect(pasos.find((p) => p.id === 'invitar').cliente.id).toBe('b');
  });

  it('con todo hecho no queda nada pendiente', () => {
    const pasos = onboardingSteps({
      clients: [cliente('a', { clientProfileId: 'u1' })],
      training: { a: { microcycleCount: 1 } },
      protocolTocado: true,
    });
    expect(onboardingPending(pasos)).toHaveLength(0);
    expect(onboardingCurrent(pasos)).toBeNull();
  });

  it('el recuento solo cuenta lo que se puede saber', () => {
    /* Sin clientes, dos de los cuatro pasos no son comprobables: decir «0 de 4»
       contaría como pendientes cosas que ni siquiera se pueden intentar. */
    expect(onboardingProgress(onboardingSteps({}))).toEqual({ hechos: 0, total: 2 });

    const conCliente = onboardingSteps({ clients: [cliente('a')] });
    expect(onboardingProgress(conCliente)).toEqual({ hechos: 1, total: 4 });
  });

  it('un programa vacío no cuenta como programado', () => {
    const pasos = onboardingSteps({
      clients: [cliente('a')],
      training: { a: { microcycleCount: 0 } },
    });
    expect(pasos.find((p) => p.id === 'programar').hecho).toBe(false);
  });
});
