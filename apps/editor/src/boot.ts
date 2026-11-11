// El arranque por etapas del editor: el shell (core), el motor de efectos (engine), la UI (ui) y los
// efectos en sí (effects)… Cada una su chunk asíncrono; el loader las muestra en una lista vertical y
// avanza con el fade in de opacidad mientras cada chunk llega. Añadir una fase = añadir una entrada aquí
// (y su chunk, vía dynamic import).
import { runStages, type BootStage } from './stages';

export const BOOT_STAGES: BootStage[] = [
  { id: 'core', label: 'Loading Core', run: async () => { await import('svelte'); } },
  { id: 'engine', label: 'Loading Engine', run: async () => { await import('@svertik/engine/engine'); } },
  { id: 'ui', label: 'Loading UI', run: async () => { await import('@svertik/ui'); } },
  { id: 'effects', label: 'Loading Effects', run: async () => { await import('@svertik/engine/effects'); } },
];

/** Arranca el editor por etapas y gestiona la pantalla de carga (index.html#boot). */
export async function startBoot() {
  await runStages(BOOT_STAGES, async () => {
    const { default: App } = await import('./App.svelte');
    const { mount } = await import('svelte');
    mount(App, { target: document.getElementById('app')! });
  });
}
