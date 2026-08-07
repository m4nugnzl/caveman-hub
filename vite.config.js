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