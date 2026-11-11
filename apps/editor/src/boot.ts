// El arranque por etapas: el loader (index.html#boot) lista las fases y se espera a que cargue su
// chunk antes de pasar a la siguiente. Así el JS grande se descarga en varios chunks (core, engine,
// UI, efectos…) en lugar de uno solo que llega todo junto.
export interface BootStage {
  /** Id estable de la fase: 'core' · 'engine' · 'ui' · 'effects'… */
  id: string;
  /** Texto que se muestra en el loader mientras la fase carga. */
  label: string;
  /** Carga el chunk de la fase. */
  run: () => Promise<unknown>;
}

/**
 * Fases del arranque, en orden: el shell (core), el motor de efectos (engine), la UI (ui)… Cada una
 * su chunk asíncrono; el loader las muestra en una lista vertical y avanza con el fade in de opacidad
 * mientras cada chunk llega. Añadir una fase = añadir una entrada aquí (y su chunk, vía dynamic import).
 */
export const BOOT_STAGES: BootStage[] = [
  { id: 'core', label: 'Loading Core', run: async () => { await import('svelte'); } },
  { id: 'engine', label: 'Loading Engine', run: async () => { await import('@svertik/engine'); } },
  { id: 'ui', label: 'Loading UI', run: async () => { await import('@svertik/ui'); } },
];

/** Arranca la app por etapas y gestiona la pantalla de carga (index.html#boot). */
export async function startBoot() {
  const boot = document.getElementById('boot');
  const list = boot?.querySelector('ul');
  const rows = new Map<string, HTMLLIElement>();
  for (const stage of BOOT_STAGES) {
    const li = document.createElement('li');
    li.className = 'stage pending';
    li.dataset.id = stage.id;
    li.innerHTML = '<span class="label"></span><span class="status"></span>';
    li.querySelector('.label')!.textContent = stage.label;
    list?.append(li);
    rows.set(stage.id, li);
  }
  const setStage = (id: string, state: 'active' | 'done' | 'error') => {
    const li = rows.get(id);
    if (li) li.className = `stage ${state}`;
  };
  for (const stage of BOOT_STAGES) {
    setStage(stage.id, 'active');
    try {
      await stage.run();
      setStage(stage.id, 'done');
    } catch (err) {
      console.error(`svertik: la fase "${stage.label}" falló al cargar`, err);
      setStage(stage.id, 'error');
      break;
    }
  }
  const { default: App } = await import('./App.svelte');
  const { mount } = await import('svelte');
  mount(App, { target: document.getElementById('app')! });
  // Fuera la pantalla de carga (con un fundido corto).
  if (boot) {
    boot.style.opacity = '0';
    setTimeout(() => boot.remove(), 220);
  }
}
