import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  // Component interaction tests use the same client runtime as the editor.
  resolve: { conditions: ['browser'] },
  base: './',
  build: {
    rolldownOptions: {
      onwarn(warning, defaultHandler) {
        // The editor intentionally bundles every effect through modifiers/index.ts.
        // Dynamic effect imports still matter in the separate Play build.
        if (warning.code === 'INEFFECTIVE_DYNAMIC_IMPORT') return;
        defaultHandler(warning);
      },
    },
    rollupOptions: {
      output: {
        // The engine splits into runtime (engine) and effects (modifiers): startup loads one stage or
        // the other (see src/boot.ts), so the loader marks each chunk separately.
        manualChunks(id) {
          if (id.includes('/packages/engine/src/modifiers/')) return 'effects';
          if (id.includes('/packages/engine')) return 'engine';
          if (id.includes('/packages/ui')) return 'ui';
        },
      },
      // The Play page has its own build (vite.play.config.ts): so it shares no chunks with the
      // editor and carries only the engine and the effects the scene uses.
      input: { main: 'index.html' },
    },
  },
  test: { environment: 'happy-dom' },
});
