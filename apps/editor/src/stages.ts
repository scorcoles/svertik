// El arranque por etapas: el loader (index.html#boot / play.html#boot) lista las fases y se espera a
// que cargue su chunk antes de pasar a la siguiente. Así el JS grande se descarga en varios chunks
// (core, engine, UI, efectos…) en lugar de uno solo que llega todo junto.
export interface BootStage<T = unknown> {
  /** Id estable de la fase: 'core' · 'engine' · 'ui' · 'effects'… */
  id: string;
  /** Texto que se muestra en el loader mientras la fase carga. */
  label: string;
  /** Carga el chunk de la fase. */
  run: () => Promise<T>;
}

/** Ejecuta las etapas y, al terminar, hace la acción de arranque (montar la app o preparar el player). */
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
      console.error(`svertik: la fase "${stage.label}" falló al cargar`, err);
      setStage(stage.id, 'error');
      failed = true;
      break;
    }
  }
  if (failed) return;
  await onDone(modules);
  // Fuera la pantalla de carga (con un fundido corto).
  if (boot) {
    boot.style.opacity = '0';
    setTimeout(() => boot.remove(), 220);
  }
}
