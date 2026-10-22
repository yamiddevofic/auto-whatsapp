import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // host: true exponía el servidor de desarrollo en todas las interfaces de red, y las
    // versiones afectadas de Vite permiten lectura arbitraria de archivos por su WebSocket.
    // Ver Docs/05-dependencias.md
    host: process.env.VITE_HOST || 'localhost',
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
