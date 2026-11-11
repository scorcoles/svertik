import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * El tipo de cada efecto (el `type` del modificador) y el trozo del build donde está.
 * Lo usa `pnpm size` para saber qué se baja de verdad para una escena.
 */
function manifestPlugin() {
  return {
    name: 'svertik-manifest',
    generateBundle(_options: unknown, bundle: Record<string, { type: string; fileName: string; modules?: Record<string, unknown> }>) {
      const types: Record<string, string> = {};
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.modules) continue;
        for (const id of Object.keys(chunk.modules)) {
          if (!/packages\/engine\/src\/modifiers\/[^/]+\.ts$/.test(id)) continue;
          const source = readFileSync(id, 'utf8');
          // El `type` del modificador (el primero, el del efecto; los demás son los de sus parámetros).
          const m = /defineModifier\(\{\s*\n\s*type:\s*'([a-z0-9]+)'/.exec(source);
          if (m) types[m[1]!] = chunk.fileName;
        }
      }
      writeFileSync(fileURLToPath(new URL('./dist/manifest.json', import.meta.url)), JSON.stringify({ types }, null, 2));
    },
  };
}

// El reproductor: un bundle (svertik-player.js) y, aparte, un trozo por efecto. El navegador solo baja
// los efectos que usa la escena, así que el primero pesa poco.
export default defineConfig({
  plugins: [manifestPlugin()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/player.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'svertik-player.js',
    },
    rollupOptions: {
      output: {
        entryFileNames: 'svertik-player.js',
        chunkFileNames: 'effects/[name]-[hash].js',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    minify: 'esbuild',
  },
});
