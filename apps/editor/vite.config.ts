import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        // El motor y la UI van en chunks aparte: el arranque los carga por etapas (ver src/boot.ts),
        // así el bundle grande se descarga en varios archivos en lugar de uno solo.
        manualChunks(id) {
          if (id.includes('/packages/engine')) return 'engine';
          if (id.includes('/packages/ui')) return 'ui';
        },
      },
      input: { main: 'index.html', play: 'play.html' },
    },
  },
  test: { environment: 'happy-dom' },
});
