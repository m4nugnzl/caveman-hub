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
 * Orden de decisión: lo que el usuario eligió → PAPEL.
 *
 * ── Por qué el papel es el defecto, y por qué el sistema sigue sin decidir ──
 * Esto dijo lo contrario hasta el 11 sep 2026: «la noche es la identidad del
 * producto». El argumento no era malo; la consecuencia sí. Todo el trabajo de
 * acabado —el papel templado, las sombras teñidas con la tinta del papel, el
 * secundario subido a 7,8:1— se hizo en el tema claro, o sea en el que casi
 * nadie veía, mientras el hierro se quedaba en un negro azulado con acento
 * cobalto: el default estético que `CLAUDE.md` §25.2 manda evitar.
 *
 * Y hay un argumento de uso por encima del de identidad: esto es una
 * herramienta de jornada completa. El entrenador la tiene abierta a media
 * mañana con luz de ventana, programando bloques y leyendo cifras pequeñas.
 * Linear, Stripe y Notion arrancan en claro por lo mismo, y ninguno pierde el
 * carácter por ello: el carácter lo lleva la estructura y la letra.
 *
 * La noche no se retira, cambia de sitio: pasa a ser una preferencia bien
 * hecha en Ajustes → Apariencia, que se recuerda. Lo que se acaba es que el
 * producto fuera dos productos distintos según la hora.
 *
 * El sistema sigue sin decidir, y por la razón de siempre: haría que la
 * primera impresión dependiera de un ajuste del sistema operativo que la
 * mayoría no ha tocado.
 */
export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => stored() || 'light');

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
