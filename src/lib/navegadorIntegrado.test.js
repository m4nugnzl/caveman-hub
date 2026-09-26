import { describe, expect, it } from 'vitest';

import { navegadorDeFuera, navegadorIntegrado } from './navegadorIntegrado';

/* User agents reales, recortados a lo que decide. */
const UA = {
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1',
  instagramIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85',
  facebookIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/520.0]',
  vistaIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36',
  vistaAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0 Mobile Safari/537.36',
  whatsappAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36 WhatsApp/2.25',
  escritorio:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36',
};

describe('navegadorIntegrado', () => {
  it('Safari, Chrome y el escritorio no son vistas integradas: Google funciona', () => {
    for (const ua of [UA.safariIphone, UA.chromeIphone, UA.chromeAndroid, UA.escritorio]) {
      expect(navegadorIntegrado(ua)).toEqual({ integrado: false, app: null });
    }
  });

  it('las apps que se anuncian, con su nombre', () => {
    expect(navegadorIntegrado(UA.instagramIphone)).toEqual({ integrado: true, app: 'Instagram' });
    expect(navegadorIntegrado(UA.facebookIphone)).toEqual({ integrado: true, app: 'Facebook' });
    expect(navegadorIntegrado(UA.whatsappAndroid)).toEqual({ integrado: true, app: 'WhatsApp' });
  });

  it('las que no se anuncian, por la forma de la vista web', () => {
    expect(navegadorIntegrado(UA.vistaAndroid)).toEqual({ integrado: true, app: null });
    expect(navegadorIntegrado(UA.vistaIphone)).toEqual({ integrado: true, app: null });
  });

  it('sin user agent no se inventa nada', () => {
    expect(navegadorIntegrado('')).toEqual({ integrado: false, app: null });
  });
});

describe('navegadorDeFuera', () => {
  it('Safari en iPhone, Chrome en el resto', () => {
    expect(navegadorDeFuera(UA.instagramIphone)).toBe('Safari');
    expect(navegadorDeFuera(UA.vistaAndroid)).toBe('Chrome');
  });
});
