import { describe, expect, it } from 'vitest';

import { estadoDelAcceso, mensajeDeInvitacion } from './acceso';

const AHORA = new Date('2026-09-26T12:00:00Z').getTime();
const MANANA = '2026-09-27T12:00:00Z';
const AYER = '2026-09-25T12:00:00Z';

describe('estadoDelAcceso', () => {
  it('con cuenta enlazada está dentro, haya la invitación que haya', () => {
    expect(estadoDelAcceso({ clientProfileId: 'u1' }, { expiresAt: AYER }, AHORA)).toEqual({ estado: 'dentro' });
  });

  it('sin ninguna invitación, sin invitar', () => {
    expect(estadoDelAcceso({}, null, AHORA)).toEqual({ estado: 'sin_invitar' });
  });

  it('un enlace vivo es una invitación enviada, con su fecha', () => {
    expect(estadoDelAcceso({}, { expiresAt: MANANA }, AHORA)).toEqual({ estado: 'enviada', caduca: MANANA });
  });

  it('un enlace sin usar que ya pasó su fecha, caducada', () => {
    expect(estadoDelAcceso({}, { expiresAt: AYER }, AHORA)).toEqual({ estado: 'caducada', caduca: AYER });
  });

  it('anulada o gastada por una cuenta que ya no está: vuelve a estar sin invitar', () => {
    expect(estadoDelAcceso({}, { expiresAt: MANANA, revokedAt: AYER }, AHORA).estado).toBe('sin_invitar');
    expect(estadoDelAcceso({}, { expiresAt: MANANA, claimedAt: AYER }, AHORA).estado).toBe('sin_invitar');
  });
});

describe('mensajeDeInvitacion', () => {
  const url = 'https://app.ejemplo/invitacion/abc';

  it('dos líneas: el enlace, y los pasos con la fecha', () => {
    const m = mensajeDeInvitacion({ nombre: 'Ana García', url, caduca: '2026-10-10T10:00:00Z' });
    const [uno, dos] = m.split('\n');
    expect(m.split('\n')).toHaveLength(2);
    expect(uno).toBe(`Ana, aquí tienes tu acceso a Caveman Hub: ${url}`);
    expect(dos).toMatch(/^Abre el enlace, crea tu cuenta y acepta\. Vale hasta el 10 oct/);
  });

  it('al reemitir dice que es un acceso nuevo y que lo suyo sigue ahí', () => {
    const m = mensajeDeInvitacion({ nombre: 'Ana', url, reemitir: true });
    expect(m).toContain('acceso nuevo');
    expect(m).toContain('todo lo tuyo sigue ahí');
  });

  it('sin nombre no deja una coma colgando', () => {
    expect(mensajeDeInvitacion({ nombre: '', url })).toMatch(/^Aquí tienes/);
  });
});
