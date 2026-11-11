import { defineConfig } from 'vitest/config';

// La página Play, en su propio build: así no comparte trozos con el editor y se lleva solo el motor y
// los efectos que la escena use (cada efecto, un trozo). En el build del editor, el barril de efectos
// está en el gráfico y las importaciones al vuelo dejarían de separar los trozos.
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
