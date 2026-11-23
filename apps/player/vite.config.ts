import { defineConfig } from 'vite';

// The demo page (for `pnpm dev`). The bundle itself is built with vite.lib.config.ts.
export default defineConfig({
  build: { outDir: 'dist-demo' },
});
