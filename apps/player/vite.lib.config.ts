import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
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

/**
 * The kernels (WebAssembly): Vite inlines every asset in a library build (as base64), but the module
 * is only needed by the scenes with Metaball. It goes as a file of its own: it is downloaded only
 * then, it is cached by the browser, and base64 weighs a third more.
 */
function wasmAssetPlugin() {
  const dataUrl = /data:application\/wasm;base64,([A-Za-z0-9+/=]+)/g;
  return {
    name: 'svertik-wasm-asset',
    generateBundle(_options: unknown, bundle: Record<string, { type: string; fileName: string; code?: string }>) {
      const emitted = new Map<string, string>();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.code) continue;
        let code = chunk.code;
        for (const [whole, base64] of code.matchAll(dataUrl).map((m) => [m[0]!, m[1]!] as const)) {
          let file = emitted.get(base64);
          if (!file) {
            const bytes = Buffer.from(base64, 'base64');
            const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
            file = `effects/svertik-kernels-${hash}.wasm`;
            emitted.set(base64, file);
            this.emitFile({ type: 'asset', fileName: file, source: bytes });
          }
          // The chunk and the module live in the same folder: a relative URL.
          code = code.replace(whole, `./${basename(file)}`);
        }
        chunk.code = code;
      }
    },
  };
}

// El reproductor: un bundle (svertik-player.js) y, aparte, un trozo por efecto. El navegador solo baja
// los efectos que usa la escena, así que el primero pesa poco.
export default defineConfig({
  plugins: [wasmAssetPlugin(), manifestPlugin()],
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
        assetFileNames: 'effects/[name]-[hash][extname]',
      },
    },
    // The kernels (WebAssembly) go as a file of their own: see `wasmAssetPlugin`.
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    minify: 'esbuild',
  },
});
