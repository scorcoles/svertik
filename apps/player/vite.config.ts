import { defineConfig } from 'vite';

// La página de demostración (para `pnpm dev`). El reproductor en sí se construye con vite.lib.config.ts.
export default defineConfig({
  build: { outDir: 'dist-demo' },
});
