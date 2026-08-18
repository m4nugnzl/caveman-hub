import { describe, expect, it } from 'vitest';

import {
  BILLING_PERIODS,
  feeLabel,
  needsCollecting,
  nextPaymentAfter,
  paymentState,
} from './billing';
import { addMonths } from '@/lib/dates';

const client = (over = {}) => ({
  id: 'c1',
  name: 'Ana Pérez',
  paymentStatus: 'paid',
  nextPaymentDate: null,
  feeAmount: null,
  billingPeriod: null,
  ...over,
});

const HOY = '2026-08-17';

describe('addMonths', () => {
  it('suma meses conservando el día', () => {
    expect(addMonths('2026-08-17', 1)).toBe('2026-09-17');
    expect(addMonths('2026-08-17', 3)).toBe('2026-11-17');
  });

  it('cruza el año', () => {
    expect(addMonths('2026-11-30', 2)).toBe('2027-01-30');
    expect(addMonths('2026-08-17', 12)).toBe('2027-08-17');
  });

  /*
    El caso por el que esta función existe en vez de `setUTCMonth` a secas.

    `setUTCMonth` desborda: al 31 de enero le suma un mes y devuelve el 3 de
    marzo. Para un cobro eso es un desastre silencioso —el día se iría corriendo
    cada mes hasta perder la cuenta—, así que se recorta al último día del mes de
    destino, que es lo que hace un banco.
  */
  it('recorta al último día cuando el destino es más corto', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('2028 es bisiesto y febrero llega al 29', () => {
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('devuelve null con una fecha que no lo es', () => {
    expect(addMonths('', 1)).toBe(null);
    expect(addMonths('2026-08-17', Number.NaN)).toBe(null);
  });
});

describe('nextPaymentAfter', () => {
  it('adelanta según la periodicidad', () => {
    expect(nextPaymentAfter('2026-08-17', 'monthly')).toBe('2026-09-17');
    expect(nextPaymentAfter('2026-08-17', 'bimonthly')).toBe('2026-10-17');
    expect(nextPaymentAfter('2026-08-17', 'quarterly')).toBe('2026-11-17');
    expect(nextPaymentAfter('2026-08-17', 'biannual')).toBe('2027-02-17');
    expect(nextPaymentAfter('2026-08-17', 'annual')).toBe('2027-08-17');
  });

  /*
    Un pago único no tiene siguiente, y decirlo con `null` es lo que impide que la
    ficha se invente una fecha. Si aquí se devolviera la misma de entrada, marcar
    cobrado dejaría un cobro ya vencido pareciendo al día.
  */
  it('no inventa una fecha cuando no la hay', () => {
    expect(nextPaymentAfter('2026-08-17', 'once')).toBe(null);
    expect(nextPaymentAfter('2026-08-17', null)).toBe(null);
    expect(nextPaymentAfter('2026-08-17', 'semanal')).toBe(null);
    expect(nextPaymentAfter(null, 'monthly')).toBe(null);
  });

  it('todos los periodos del catálogo se pueden calcular o son únicos', () => {
    for (const periodo of BILLING_PERIODS) {
      const siguiente = nextPaymentAfter('2026-08-17', periodo.id);
      if (periodo.months === null) expect(siguiente).toBe(null);
      else expect(siguiente).toBe(addMonths('2026-08-17', periodo.months));
    }
  });
});

describe('feeLabel', () => {
  it('escribe importe y periodicidad', () => {
    expect(feeLabel(client({ feeAmount: 60, billingPeriod: 'monthly' }))).toBe('60 € / mes');
    expect(feeLabel(client({ feeAmount: 180, billingPeriod: 'quarterly' }))).toBe('180 € / trimestre');
    expect(feeLabel(client({ feeAmount: 250, billingPeriod: 'once' }))).toBe('250 € (único)');
  });

  it('conserva los céntimos solo cuando los hay', () => {
    expect(feeLabel(client({ feeAmount: 49.5, billingPeriod: 'monthly' }))).toBe('49.50 € / mes');
    expect(feeLabel(client({ feeAmount: 50, billingPeriod: 'monthly' }))).toBe('50 € / mes');
  });

  /* Sin periodicidad se escribe solo el importe: decir «/ mes» de quien no ha
     dicho cada cuánto sería inventárselo. */
  it('con importe y sin periodicidad da solo la cifra', () => {
    expect(feeLabel(client({ feeAmount: 60 }))).toBe('60 €');
  });

  it('sin tarifa anotada no dice nada', () => {
    expect(feeLabel(client())).toBe('');
    expect(feeLabel(client({ billingPeriod: 'monthly' }))).toBe('');
    expect(feeLabel(undefined)).toBe('');
  });
});

describe('paymentState', () => {
  /*
    ══ La regla que motivó todo esto ═════════════════════════════════════════

    `payment_status` se pone en `pending` en cuanto empieza un ciclo nuevo, así
    que por sí solo no dice si hay algo que hacer. La cabecera del cliente lo
    usaba tal cual y pintaba «Pago pendiente» en rojo desde el día 1 — hasta
    veintinueve días avisando de algo que no tocaba.
  */
  it('un cobro cuya fecha no ha llegado NO está pendiente', () => {
    const estado = paymentState(
      client({ paymentStatus: 'pending', nextPaymentDate: '2026-09-30' }),
      HOY
    );

    expect(estado.state).toBe('scheduled');
    expect(estado.tone).toBe('');
    expect(needsCollecting(estado)).toBe(false);
  });

  it('vencido es lo único que va en rojo', () => {
    const estado = paymentState(
      client({ paymentStatus: 'pending', nextPaymentDate: '2026-08-14' }),
      HOY
    );

    expect(estado.state).toBe('overdue');
    expect(estado.tone).toBe('bad');
    expect(estado.label).toBe('Pago vencido hace 3 días');
    expect(needsCollecting(estado)).toBe(true);
  });

  it('vencido ayer se dice en singular', () => {
    const estado = paymentState(
      client({ paymentStatus: 'pending', nextPaymentDate: '2026-08-16' }),
      HOY
    );
    expect(estado.label).toBe('Pago vencido hace 1 día');
  });

  it('lo que vence hoy es trabajo de hoy', () => {
    const estado = paymentState(
      client({ paymentStatus: 'pending', nextPaymentDate: HOY }),
      HOY
    );

    expect(estado.state).toBe('due');
    expect(needsCollecting(estado)).toBe(true);
  });

  /* Una renovación cercana es información, no trabajo: no puede entrar en la
     bandeja ni pintarse como una deuda. */
  it('una renovación cercana avisa sin reclamar nada', () => {
    const estado = paymentState(client({ nextPaymentDate: '2026-08-20' }), HOY);

    expect(estado.state).toBe('soon');
    expect(estado.label).toBe('Renueva en 3 días');
    expect(estado.tone).toBe('');
    expect(needsCollecting(estado)).toBe(false);
  });

  it('más allá del umbral solo dice cuándo', () => {
    const estado = paymentState(client({ nextPaymentDate: '2026-09-30' }), HOY);
    expect(estado.state).toBe('scheduled');
    expect(estado.label).toBe('Renueva el 30 sept');
  });

  it('sin fecha no se puede saber, y eso no es una deuda', () => {
    const estado = paymentState(client({ paymentStatus: 'pending' }), HOY);

    expect(estado.state).toBe('no_date');
    expect(estado.tone).toBe('');
    expect(needsCollecting(estado)).toBe(false);
  });

  /*
    Cobrado y con la fecha pasada: el cobro entró y nadie movió la fecha al ciclo
    siguiente. No es deuda, pero tampoco es una renovación futura, así que no
    puede anunciar una fecha que ya no va a pasar.
  */
  it('cobrado con la fecha ya pasada no anuncia esa fecha', () => {
    const estado = paymentState(
      client({ paymentStatus: 'paid', nextPaymentDate: '2026-08-01' }),
      HOY
    );

    expect(estado.state).toBe('scheduled');
    expect(estado.label).toBe('Cobrado');
    expect(needsCollecting(estado)).toBe(false);
  });
});
