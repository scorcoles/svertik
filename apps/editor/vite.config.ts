import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  base: './',
  // Dos páginas: el editor y Play (solo el motor, para los enlaces compartidos).
  build: { rollupOptions: { input: { main: 'index.html', play: 'play.html' } } },
  test: { environment: 'happy-dom' },
});
