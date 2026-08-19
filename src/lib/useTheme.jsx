import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const KEY = 'caveman-theme';
const THEMES = ['light', 'dark'];

const ThemeContext = createContext(null);

const stored = () => {
  try {
    const value = localStorage.getItem(KEY);
    return THEMES.includes(value) ? value : null;
  } catch {
    // Modo privado o almacenamiento bloqueado: se ignora y se usa el sistema.
    return null;
  }
};

/**
 * Tema claro u oscuro.
 *
 * Es un proveedor y no un hook suelto por dos razones:
 *  1. La pantalla de login se pinta ANTES que la cabecera, así que el tema tiene
 *     que aplicarse por encima de las dos o el login saldría siempre en claro.
 *  2. Con dos llamadas independientes al hook habría dos estados distintos, y al
 *     pulsar el conmutador uno de los dos se quedaría desincronizado.
 *
 * `data-theme` se escribe SIEMPRE de forma explícita en el elemento raíz, nunca
 * se deja que el CSS resuelva la preferencia del sistema. Así los tokens del
 * tema oscuro viven en una sola regla en vez de duplicarse dentro de un
 * `@media (prefers-color-scheme)`.
 *
 * Orden de decisión: lo que el usuario eligió → NOCHE.
 *
 * ── Por qué la noche es el defecto y el sistema ya no decide ────────────────
 * La noche es la identidad del producto —es lo que enseña la portada y de donde
 * sale su atmósfera— y «papel» es una elección de quien prefiere trabajar en
 * claro, disponible en Ajustes → Apariencia. Seguir la preferencia del sistema
 * hacía que la primera impresión dependiera de un ajuste del sistema operativo
 * que la mayoría no ha tocado: quien llegaba desde una portada de noche podía
 * aterrizar en una aplicación blanca, que se lee como cambiar de producto.
 */
export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => stored() || 'dark');

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);

    /*
     * La barra del navegador en móvil se queda del color anterior si no se
     * actualiza junto con el atributo. Y `<meta theme-color>` no acepta
     * `var(--canvas)`, así que hay que darle un color resuelto: se lee del token
     * ya aplicado en vez de repetir el valor aquí, que es lo que haría que un
     * cambio de paleta dejara la barra descuadrada.
     */
    const canvas = getComputedStyle(root).getPropertyValue('--canvas').trim();
    if (canvas) {
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', canvas);
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (!THEMES.includes(next)) return;
    setThemeState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Sin persistencia el tema dura lo que la pestaña; no es un error.
    }
  }, []);

  const value = useMemo(
    () => ({
      theme,
      isDark: theme === 'dark',
      setTheme,
      toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    }),
    [theme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>.');
  return ctx;
};
