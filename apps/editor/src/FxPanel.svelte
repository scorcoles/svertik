<script lang="ts">
  import { expressionReference } from '@svertik/engine';
  import { IconButton, formulaTarget, insertFormula } from '@svertik/ui';
  import TextZoom from './TextZoom.svelte';
  import type { Editor } from './editor.svelte';

  let { editor, maximized, onmaximize, onclose, oncopy }: { editor: Editor; maximized: boolean; onmaximize: () => void; onclose: () => void; oncopy: (text: string, what: string) => void } = $props();

  const reference = expressionReference();
  let filter = $state('');

  const matches = (...texts: string[]) => {
    const q = filter.trim().toLowerCase();
    return !q || texts.some((t) => t.toLowerCase().includes(q));
  };
  const variable = (v: { name: string; about: string }) => ({ name: v.name, insert: v.name, caretBack: 0, about: v.about });

  const sections = $derived([
    { title: 'Scene', rows: reference.variables.filter((v) => !v.key.includes('.')).map(variable) },
    { title: 'Mouse', note: 'Live only in Play', rows: reference.variables.filter((v) => v.key.startsWith('mouse.')).map(variable) },
    { title: 'Clock', note: '0 in renders', rows: reference.variables.filter((v) => v.key.startsWith('clock.')).map(variable) },
    {
      title: 'Custom',
      note: 'Document → Variables',
      rows: Object.keys(editor.scene?.custom ?? {}).map((key) => variable({ name: `scene.custom.${key}`, about: '' })),
    },
    { title: 'Props', note: 'Incoming parent values', rows: reference.variables.filter((v) => v.key === 'props.*').map(variable) },
    { title: 'Children', note: 'Direct child values', rows: reference.variables.filter((v) => v.key === 'children["id"].property').map(variable) },
    {
      title: 'Constants',
      rows: [
        { name: 'pi', insert: 'pi', caretBack: 0, about: 'Pi (3.14159…)' },
        { name: 'e', insert: 'e', caretBack: 0, about: 'Euler’s number (2.71828…)' },
      ],
    },
    {
      title: 'Examples',
      rows: [
        { name: 'scene.progress * 100', insert: 'scene.progress * 100', caretBack: 0, about: 'Map progress to a 0–100 value.' },
        { name: 'sin(scene.time * 2) * 50', insert: 'sin(scene.time * 2) * 50', caretBack: 0, about: 'A smooth repeating motion.' },
        { name: 'random(-10, 10, scene.cycle)', insert: 'random(-10, 10, scene.cycle)', caretBack: 0, about: 'A stable value that changes each cycle.' },
      ],
    },
    {
      title: 'Functions',
      // A call goes in with its parentheses and the caret between them.
      rows: reference.functions.map((f) => ({ name: f.name, insert: `${f.name.replace(/\(.*$/, '')}()`, caretBack: 1, about: f.about })),
    },
  ].map((s) => ({ ...s, rows: s.rows.filter((r) => matches(r.name, r.about)) })));
  const hasMatches = $derived(sections.some((section) => section.rows.length > 0));

  function use(row: { name: string; insert: string; caretBack: number }) {
    if (!insertFormula(row.insert, row.caretBack)) oncopy(row.insert, row.name);
  }
</script>

<section class="fx-panel" aria-labelledby="fx-title">
  <header>
    <h2 id="fx-title">ƒx reference</h2>
    <span class="target">{formulaTarget.label ? `Click to insert into ${formulaTarget.label}` : 'Click to copy · focus a ƒx field to insert'}</span>
    <input class="filter" type="search" placeholder="Filter" aria-label="Filter variables and functions" bind:value={filter} onkeydown={(e) => e.stopPropagation()} />
    <TextZoom value={editor.textZoom} onchange={(v) => editor.setTextZoom(v)} />
    <IconButton icon={maximized ? 'restore' : 'maximize'} label={maximized ? 'Restore editor layout' : 'Use all available space for ƒx reference'} aria-pressed={maximized} onclick={onmaximize} />
    <IconButton icon="down" label="Close formula reference" onclick={onclose} />
  </header>
  <div class="columns" style:font-size={`${11 * editor.textZoom / 100}px`}>
    {#if !hasMatches}<p class="empty">No matches.</p>{/if}
    {#each sections as section (section.title)}
      {#if section.rows.length || (section.title === 'Custom' && !filter)}
        <div class="section">
          <h3>{section.title}{#if section.note}<span>{section.note}</span>{/if}</h3>
          {#if !section.rows.length}<p class="empty">No variables yet.</p>{/if}
          <ul>
            {#each section.rows as row (row.name)}
              <li>
                <!-- mousedown is cancelled so the formula field keeps its caret and selection. -->
                <button type="button" class="name" title={formulaTarget.label ? `Insert into ${formulaTarget.label}` : `Copy ${row.insert}`} onmousedown={(e) => e.preventDefault()} onclick={() => use(row)}>{row.name}</button>
                {#if row.about}<span class="about">{row.about}</span>{/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    {/each}
  </div>
  <p class="hint">Trig uses radians. Operators: + − * / % ^. No JavaScript or comparisons.</p>
</section>

<style>
  .fx-panel {
    display: flex;
    flex-direction: column;
    gap: var(--sv-space-6);
    min-height: 0;
    padding: var(--sv-space-8);
    color: var(--sv-text-primary);
    background: var(--sv-surface-panel);
    border-top: var(--sv-border-1) solid var(--sv-rule-default);
    font-family: var(--sv-font-mono);
    font-size: var(--sv-font-size-11);
  }
  header { display: flex; align-items: center; gap: var(--sv-space-8); }
  h2 { margin: 0; font-size: 1em; }
  .target { flex: 1; min-width: 0; color: var(--sv-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .filter {
    width: 160px;
    height: 20px;
    padding: 0 var(--sv-space-6);
    color: var(--sv-text-primary);
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
    font: inherit;
    outline: none;
  }
  .filter:focus { border-color: var(--sv-accent-fill); }
  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
    align-content: start;
    gap: var(--sv-space-16);
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
  }
  .section { min-width: 0; }
  h3 {
    display: flex;
    align-items: baseline;
    gap: var(--sv-space-8);
    margin: 0 0 var(--sv-space-4);
    color: var(--sv-text-muted);
    font-size: var(--sv-font-size-10);
    font-weight: normal;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  h3 span { text-transform: none; letter-spacing: 0; opacity: 0.7; }
  ul { margin: 0; padding: 0; list-style: none; }
  li {
    display: grid;
    padding: var(--sv-space-2) 0;
    break-inside: avoid;
  }
  .name {
    min-width: 0;
    padding: 0;
    color: var(--sv-accent-fill);
    background: none;
    border: 0;
    font: inherit;
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
  }
  :global([data-sv-theme='light']) .name { color: var(--sv-accent-on); }
  .name:hover { text-decoration: underline; }
  .about { min-width: 0; color: var(--sv-text-muted); line-height: 1.35; overflow-wrap: anywhere; }
  .empty, .hint { margin: 0; color: var(--sv-text-muted); line-height: 1.4; }
  .hint { flex: none; }
</style>
