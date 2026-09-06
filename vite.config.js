import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const raiz = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  /* Multipágina: la pantalla de acceso y el panel son documentos independientes,
     igual que los servirá el backend de Java (dos rutas, no un SPA con router). */
  appType: 'mpa',

  server: {
    port: 5173,
    open: '/index.html',
    /* ------------------------------------------------------------------
     *  Puente hacia el backend de Java durante el desarrollo.
     *  Con API.MODO = 'real' y API.BASE = '/api/v1', el navegador llama al
     *  mismo origen (sin CORS) y Vite reenvía al Spring Boot local.
     *  Ajusta `target` a donde escuche el servicio.
     * ----------------------------------------------------------------*/
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true
      }
    }
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        acceso: raiz('./index.html'),
        panel:  raiz('./app.html')
      }
    }
  }
});
