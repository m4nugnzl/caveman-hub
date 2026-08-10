import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
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
    files: ['scripts/**/*.mjs', 'scripts/**/*.js', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
];