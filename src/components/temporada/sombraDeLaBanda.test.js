import { describe, expect, it } from 'vitest';

import { trozosQueDifieren } from './sombraDeLaBanda';

/* Un tramo que baja 0,7 kg por semana desde 80 kg el 1 de octubre. */
const baja = { ancla: '2026-10-01', base: 80, ritmoKg: -0.7 };
const t = (key, a, b, tramo = baja, extra = {}) => ({ key, a, b, tramo, abre: true, cierra: true, ...extra });

describe('trozosQueDifieren', () => {
  it('la misma banda no deja sombra', () => {
    expect(trozosQueDifieren([t('x', '2026-10-01', '2026-11-01')], [t('y', '2026-10-01', '2026-11-01')])).toEqual([]);
  });

  it('una fase que acababa después: solo lo que ahora no tiene banda, con su canto de cierre', () => {
    const r = trozosQueDifieren([t('x', '2026-10-01', '2026-11-15')], [t('y', '2026-10-01', '2026-11-01')]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ a: '2026-11-01', b: '2026-11-15', abre: false, cierra: true, canto: { a: false, b: true } });
  });

  it('otro ritmo desde un día: difiere desde ese día hasta el final', () => {
    const otro = { ancla: '2026-10-15', base: 78.6, ritmoKg: -0.35 };
    const ahora = [t('y1', '2026-10-01', '2026-10-15', baja, { cierra: false }), t('y2', '2026-10-15', '2026-11-01', otro, { abre: false })];
    const r = trozosQueDifieren([t('x', '2026-10-01', '2026-11-01')], ahora);
    expect(r).toHaveLength(1);
    /* El 15 los dos esperan 78,6: el primer día que difiere es el 16. */
    expect(r[0]).toMatchObject({ a: '2026-10-16', b: '2026-11-01', abre: false, cierra: true });
  });

  it('sin nada ahora, entera', () => {
    const r = trozosQueDifieren([t('x', '2026-10-01', '2026-10-08')], []);
    expect(r).toEqual([expect.objectContaining({ a: '2026-10-01', b: '2026-10-08', abre: true, cierra: true })]);
  });
});
