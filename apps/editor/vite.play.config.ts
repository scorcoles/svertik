import { defineConfig } from 'vitest/config';

// The Play page, in its own build: it shares no chunks with the editor and carries only the engine and
// the effects the scene uses (each effect, a chunk). In the editor's build, the effects barrel is
// in the graph and dynamic imports would no longer split the chunks.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
      },
      input: { play: 'play.html' },
    },
  },
});
