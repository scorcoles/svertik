<script lang="ts">
  import { onMount } from 'svelte';
  import { builtins, createEngine, type Scene } from '@svertik/engine';
  import Attributes from './Attributes.svelte';
  import Canvas from './Canvas.svelte';
  import { Editor } from './editor.svelte';
  import { codeSnippet, download, sceneJSON } from './exporters';
  import StackPanel from './StackPanel.svelte';
  import Toolbar from './Toolbar.svelte';

  const editor = new Editor();
  if (import.meta.env.DEV) (window as unknown as { editor: Editor }).editor = editor;
  const engine = createEngine(builtins);
  let fileInput: HTMLInputElement;
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout>;

  const say = (text: string) => {
    toast = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 1600);
  };
  const snapshot = () => $state.snapshot(editor.scene) as Scene;

  async function openFile(file: File) {
    editor.load(await file.text(), file.name);
  }
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      say(`${what} copied`);
    } catch {
      say(`Could not copy ${what}`);
    }
  }
  function exportSVG() {
    const name = editor.name.replace(/\.svg$/i, '') + '.svertik.svg';
    download(name, engine.toSVG(snapshot()), 'image/svg+xml');
    say(`Saved ${name}`);
  }

  const typing = (e: Event) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };
  function keydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing(e)) {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
    } else if (mod && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      fileInput.click();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && editor.selected && !typing(e)) {
      e.preventDefault();
      editor.remove();
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && editor.selected && editor.scene) {
      e.preventDefault();
      const i = editor.scene.stack.findIndex((m) => m.id === editor.selected);
      editor.move(editor.selected, i + (e.key === 'ArrowUp' ? -1 : 1));
    }
  }
  function paste(e: ClipboardEvent) {
    if (typing(e)) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (/<svg[\s>]/i.test(text)) {
      e.preventDefault();
      editor.load(text, 'pasted.svg');
    }
  }

  onMount(() => {
    void editor.loadFromURL();
  });
</script>

<svelte:window onkeydown={keydown} onpaste={paste} />

<div class="app">
  <Toolbar
    {editor}
    onimport={() => fileInput.click()}
    oncopyjson={() => copy(sceneJSON(snapshot()), 'JSON')}
    oncopycode={() => copy(codeSnippet(snapshot()), 'Code')}
    onexport={exportSVG}
  />
  <main>
    <Canvas {editor} onimport={() => fileInput.click()} onfile={openFile} />
    <aside class="inspector">
      <StackPanel {editor} />
      <Attributes {editor} />
      <footer>
        <span>svertik 0.0.0</span>
        <span>engine · {builtins.length} modifiers</span>
      </footer>
    </aside>
  </main>
  <input
    bind:this={fileInput}
    type="file"
    accept=".svg,image/svg+xml"
    hidden
    onchange={(e) => {
      const f = e.currentTarget.files?.[0];
      if (f) void openFile(f);
      e.currentTarget.value = '';
    }}
  />
  {#if toast}<div class="toast" role="status">{toast}</div>{/if}
</div>

<style>
  .app { display: grid; grid-template-rows: auto 1fr; height: 100dvh; }
  main { display: grid; grid-template-columns: minmax(0, 1fr) 300px; min-height: 0; }
  .inspector {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--sv-surface-panel);
    border-left: var(--sv-border-1) solid var(--sv-rule-default);
  }
  .inspector footer {
    display: flex;
    justify-content: space-between;
    flex: none;
    height: 28px;
    align-items: center;
    padding: 0 var(--sv-space-8);
    border-top: var(--sv-border-1) solid var(--sv-rule-default);
    color: var(--sv-text-disabled);
    font-size: var(--sv-font-size-10);
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: var(--sv-space-16);
    translate: -50% 0;
    padding: var(--sv-space-6) var(--sv-space-12);
    background: var(--sv-text-primary);
    color: var(--sv-surface-app);
    font-weight: var(--sv-font-weight-bold);
  }
  @media (max-width: 760px) {
    main { grid-template-columns: 1fr; grid-template-rows: minmax(280px, 1fr) auto; }
    .inspector { border-left: 0; border-top: var(--sv-border-1) solid var(--sv-rule-default); max-height: 55dvh; }
  }
</style>
