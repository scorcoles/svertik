// Staged startup: the loader (index.html#boot / play.html#boot) lists the stages and waits for
// each chunk to load before moving on. So the big JS downloads in several chunks
// (core, engine, UI, effects…) instead of one arriving all at once.
export interface BootStage<T = unknown> {
  /** Stable stage id: 'core' · 'engine' · 'ui' · 'effects'… */
  id: string;
  /** Text shown in the loader while the stage loads. */
  label: string;
  /** Loads the stage's chunk. */
  run: () => Promise<T>;
}

/** Runs the stages and then the startup action (mount the app or prepare the player). */
export async function runStages<T>(stages: BootStage<T>[], onDone: (modules: T[]) => Promise<void> | void) {
  const boot = document.getElementById('boot');
  const list = boot?.querySelector('ul');
  const rows = new Map<string, HTMLLIElement>();
  for (const stage of stages) {
    const li = document.createElement('li');
    li.className = 'stage pending';
    li.dataset.id = stage.id;
    li.innerHTML = '<span class="label"></span><span class="status"></span>';
    li.querySelector('.label')!.textContent = stage.label;
    list?.appendChild(li);
    rows.set(stage.id, li);
  }
  const setStage = (id: string, state: 'active' | 'done' | 'error') => {
    const li = rows.get(id);
    if (li) li.className = `stage ${state}`;
  };
  const modules: T[] = [];
  let failed = false;
  for (const stage of stages) {
    setStage(stage.id, 'active');
    try {
      modules.push(await stage.run());
      setStage(stage.id, 'done');
    } catch (err) {
      console.error(`svertik: stage "${stage.label}" failed to load`, err);
      setStage(stage.id, 'error');
      failed = true;
      break;
    }
  }
  if (failed) return;
  await onDone(modules);
  // Away with the loading screen (with a short fade).
  if (boot) {
    boot.style.opacity = '0';
    setTimeout(() => boot.remove(), 220);
  }
}
