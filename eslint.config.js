import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  /* `.wrangler/` son artefactos temporales de `wrangler dev` (ya en el
     gitignore): lintear bundles generados solo produce ruido ajeno. */
  { ignores: ['dist/**', 'node_modules/**', '.wrangler/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // Vite + React 18: no hace falta importar React para usar JSX, pero el
      // proyecto lo importa por consistencia. Ninguna de las dos reglas aporta.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      // Los efectos con dependencias incompletas fueron la causa de dos bugs
      // reales (selector de semana que no se reseteaba al cambiar de cliente,
      // feedback de vídeo que no se refrescaba). Esto debe romper el lint.
      'react-hooks/exhaustive-deps': 'error',

      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },

  /*
   * Los scripts de `scripts/` corren en Node, no en el navegador: usan `process`,
   * `fs` y consola libremente. Sin este bloque, el bloque anterior los evalúa con
   * los globales del navegador y `process` sale como no definido.
   */
  {
    /*
     * `supabase/tests/` va con los de Node y no con los del navegador por el
     * mismo motivo: las pruebas contra la base de datos leen sus credenciales de
     * `process.env` y corren fuera de un navegador.
     */
    files: [
      'scripts/**/*.mjs',
      'scripts/**/*.js',
      '*.config.js',
      /* El worker de Cloudflare no corre en el navegador pero comparte sus
         globales de plataforma (`URL`, `fetch`, `Request`): los de Node valen. */
      'worker.mjs',
      'supabase/tests/**/*.js',
      'supabase/tests/**/*.mjs',
    ],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },

  /*
   * Pruebas. `describe`, `it` y `expect` se inyectan… no: en este proyecto se
   * importan explícitamente de `vitest`, así que no hacen falta globales. Lo que sí
   * hace falta es relajar dos reglas:
   *
   *   · las aserciones de una prueba a veces piden comparaciones flojas;
   *   · un `expect` con mensaje incluye datos que solo existen si falla.
   */
  {
    files: ['**/*.test.js', '**/*.test.jsx'],
    rules: { 'no-console': 'off' },
  },
];