import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        // El motor se divide en runtime (engine) y efectos (modifiers): el arranque carga una fase u
        // la otra (ver src/boot.ts), para que el loader vaya marcando cada chunk por separado.
        manualChunks(id) {
          if (id.includes('/packages/engine/src/modifiers/')) return 'effects';
          if (id.includes('/packages/engine')) return 'engine';
          if (id.includes('/packages/ui')) return 'ui';
        },
      },
      // La página Play tiene su propio build (vite.play.config.ts): así no comparte los trozos con el
      // editor y puede llevar solo el motor y los efectos que use la escena.
      input: { main: 'index.html' },
    },
  },
  test: { environment: 'happy-dom' },
});
