import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Evita las cadenas de '../../..' que había por todo el proyecto.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  /*
    Las pruebas de `supabase/` quedan FUERA de `npm test`, y por tanto de
    `npm run check`: necesitan un proyecto de base de datos y `check` tiene que
    poder correr en cualquier máquina recién clonada y sin red. Van por su cuenta
    en `npm run test:db` (ver `vitest.db.config.js`).
  */
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'supabase/**'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // El grueso del bundle es el cliente de Supabase y los iconos, que
        // cambian mucho menos que el código de la aplicación. Separarlos deja
        // que el navegador los mantenga en caché entre despliegues.
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          icons: ['lucide-react'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});