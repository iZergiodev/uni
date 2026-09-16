import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: la carpeta dist/ funciona en cualquier subcarpeta de un servidor web.
  base: './',
  server: { open: true },
  // Three.js ocupa por sí solo más de los 500 kB con los que Vite avisa por defecto.
  build: { chunkSizeWarningLimit: 900 },
});
