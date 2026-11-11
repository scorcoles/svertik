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
      input: { main: 'index.html', play: 'play.html' },
    },
  },
  test: { environment: 'happy-dom' },
});
