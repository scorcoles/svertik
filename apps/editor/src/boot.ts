// The editor's staged startup: the shell (core), the effects engine (engine), the UI (ui) and the
// effects themselves (effects)… Each its own async chunk; the loader lists them vertically and
// advances with an opacity fade-in as each chunk arrives. Adding a stage = adding an entry here
// (and its chunk, through a dynamic import).
import { t } from '@svertik/ui/i18n';
import { runStages, type BootStage } from './stages';
import { loadLocale } from './i18n';

export const BOOT_STAGES: BootStage[] = [
  { id: 'core', label: 'Loading Core', run: async () => { await import('svelte'); } },
  { id: 'engine', label: 'Loading Engine', run: async () => { await import('@svertik/engine/engine'); } },
  { id: 'ui', label: 'Loading UI', run: async () => { await import('@svertik/ui'); } },
  { id: 'effects', label: 'Loading Effects', run: async () => { await import('@svertik/engine/effects'); } },
];

/** Starts the editor in stages and drives the loading screen (index.html#boot). */
export async function startBoot() {
  // The language first: the loading screen and the notice below already speak it.
  await loadLocale(true);
  // Static texts of index.html (ours, so their markup can be translated as it is).
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.innerHTML = t(el.innerHTML.trim());
  const notice = document.getElementById('mobile-notice');
  if (notice && getComputedStyle(notice).display !== 'none') {
    await new Promise<void>((resolve) => {
      document.getElementById('mobile-notice-continue')!.addEventListener('click', () => {
        notice.hidden = true;
        resolve();
      }, { once: true });
    });
  }
  await runStages(BOOT_STAGES.map((stage) => ({ ...stage, label: t(stage.label) })), async () => {
    const { default: App } = await import('./App.svelte');
    const { mount } = await import('svelte');
    mount(App, { target: document.getElementById('app')! });
  });
}
