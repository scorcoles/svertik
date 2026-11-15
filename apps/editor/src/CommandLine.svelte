<script lang="ts">
  import { tick } from 'svelte';
  import { DropdownMenu } from 'bits-ui';
  import { autonomousGenerators, builtins, effectDescriptions, shapeDescriptions } from '@svertik/engine';
  import { Icon } from '@svertik/ui';
  import type { Editor } from './editor.svelte';
  import { buildCatalog, compile, complete, describeParam, parse, resolve, search, typable, type CommandEntry } from './command';

  // Effects command line, fixed in the status bar (like a CAD prompt): type an effect and, optionally, its
  // parameters with their JSON names ("twist angle=45"). Focused by "/", ⌘K and the stack's +. Results
  // open upwards, with each effect's description.
  let { editor, compact = false }: { editor: Editor; compact?: boolean } = $props();

  const catalog = buildCatalog(builtins as never, autonomousGenerators as never, { ...effectDescriptions, ...shapeDescriptions });
  const listId = 'command-results';

  let input: HTMLInputElement;
  let list = $state<HTMLElement>();
  let value = $state('');
  let open = $state(false);
  let active = $state(0);
  let error = $state<string | null>(null);
  let announce = $state('');
  // Session history: ↑ on an empty line.
  const history: string[] = [];
  let historyAt = $state<number | null>(null);

  const parsed = $derived(parse(value));
  const browsing = $derived(!parsed.pastName);
  const matches = $derived(browsing ? search(catalog, parsed.name) : []);
  // Grouped by category, with a header per group. With nothing typed, in the top bar menus' order; while
  // typing, the group holding the best match comes first (so Enter still adds the most likely effect).
  const CATEGORY_ORDER = ['Deform', 'Generate', 'Effect', 'Style', 'Glitch', 'Filters', 'Utils'];
  const groups = $derived.by(() => {
    const byCategory = new Map<string, CommandEntry[]>();
    for (const m of matches) byCategory.set(m.category, [...(byCategory.get(m.category) ?? []), m]);
    const rank = (c: string) => (CATEGORY_ORDER.indexOf(c) + 1 || CATEGORY_ORDER.length + 1);
    const entries = [...byCategory.entries()];
    if (!parsed.name.trim()) entries.sort(([a], [b]) => rank(a) - rank(b));
    return entries.map(([category, items]) => ({ category, items }));
  });
  // The options in display order: what ↑↓ and Enter walk through.
  const ordered = $derived(groups.flatMap((g) => g.items));
  const entry = $derived(browsing ? null : resolve(catalog, parsed.name));
  const highlighted = $derived(ordered[Math.min(active, ordered.length - 1)] ?? null);
  const given = $derived(new Map(parsed.args.filter((a) => a.includes('=')).map((a) => [(a.split('=')[0] ?? '').toLowerCase(), a.slice(a.indexOf('=') + 1)])));
  const typing = $derived(parsed.last.includes('=') ? '' : parsed.last.toLowerCase());
  const disabled = $derived(!editor.scene);

  /** Why it can't be added here (null: it can). */
  function blocker(e: CommandEntry): string | null {
    if (e.autonomous) return null;
    const node = editor.activeNode;
    if (!node) return 'Select an object first, then run the command again.';
    if (editor.isLocked(node.id)) return 'The selected object is locked.';
    if (!editor.canAdd(e.type)) return `${e.label} does not work on raster images.`;
    return null;
  }

  // Requests from outside (the stack's +, the shortcuts): focus with some text already typed.
  $effect(() => {
    const request = editor.commandRequest;
    if (!request || disabled) return;
    value = request.text;
    error = null;
    active = 0;
    open = true;
    void tick().then(() => {
      input?.focus();
      input?.setSelectionRange(value.length, value.length);
    });
  });

  // Keep the highlighted option in view.
  $effect(() => {
    void active;
    list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  });

  $effect(() => {
    if (!open) return;
    announce = error ?? (browsing ? `${matches.length} effect${matches.length === 1 ? '' : 's'}` : entry ? `${entry.label}: ${Object.keys(entry.params).length} parameters` : '');
  });

  function edit(text: string) {
    value = text;
    error = null;
    active = 0;
    historyAt = null;
    open = true;
  }

  function run(text = value) {
    let command = text;
    if (browsing) {
      if (!highlighted) {
        error = parsed.name ? `No effect matches "${parsed.name}".` : 'Type an effect name, e.g. twist angle=45.';
        return;
      }
      command = `${highlighted.type}`;
    }
    const compiled = compile(catalog, command);
    if (!compiled.ok) {
      error = compiled.error;
      return;
    }
    const why = blocker(compiled.entry);
    if (why) {
      error = why;
      return;
    }
    if (compiled.entry.autonomous) editor.addShape(compiled.entry.type, compiled.params);
    else editor.add(compiled.entry.type, compiled.params);
    if (history[history.length - 1] !== command) history.push(command);
    historyAt = null;
    value = '';
    error = null;
    open = false;
    announce = `Added ${compiled.entry.label}`;
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (open && value) open = false;
      else {
        // Second Esc: clear, and give focus back to the editor (so its shortcuts work again).
        value = '';
        error = null;
        open = false;
        input.blur();
      }
    } else if (e.key === 'Tab' && !e.shiftKey && value.trim()) {
      const next = complete(catalog, value, highlighted);
      if (next && next !== value) {
        e.preventDefault();
        edit(next);
      }
    } else if (e.key === 'ArrowUp' && (historyAt !== null || !value) && history.length) {
      e.preventDefault();
      historyAt = historyAt === null ? history.length - 1 : Math.max(0, historyAt - 1);
      value = history[historyAt] ?? '';
      open = false;
    } else if (e.key === 'ArrowDown' && historyAt !== null) {
      e.preventDefault();
      historyAt = historyAt + 1 < history.length ? historyAt + 1 : null;
      value = historyAt === null ? '' : (history[historyAt] ?? '');
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && browsing && ordered.length) {
      e.preventDefault();
      open = true;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + ordered.length) % ordered.length;
    }
  }

  const optionId = (type: string) => `command-option-${type}`;
</script>

<div class="command" class:compact data-position={editor.commandInEffectsSlot ? 'effects' : 'footer'} data-disabled={disabled || undefined} data-error={error ? true : undefined}>
  {#if open && !disabled}
    <div class="results" role="presentation">
      {#if browsing}
        <!-- Fixed height, list left and description right: neither hovering nor filtering moves anything
             (descriptions run from one line to several). -->
        <div class="browse">
        {#if matches.length}
          <div id={listId} class="list" bind:this={list} role="listbox" aria-label="Effects">
            {#each groups as g (g.category)}
            <div role="group" aria-labelledby="command-group-{g.category}">
            <div id="command-group-{g.category}" class="group-head">{g.category}</div>
            {#each g.items as m (m.type)}
              {@const i = ordered.indexOf(m)}
              {@const why = blocker(m)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                id={optionId(m.type)}
                class="option"
                role="option"
                tabindex="-1"
                aria-selected={i === active}
                aria-disabled={why ? true : undefined}
                title={why ?? undefined}
                onpointerenter={() => (active = i)}
                onpointerdown={(e) => e.preventDefault()}
                onclick={() => run(m.type)}
              >
                <span class="name">{m.type}</span>
                <span class="label">{m.label.toLowerCase().replace(/\s+/g, '') === m.type ? '' : m.label}</span>
              </div>
            {/each}
            </div>
            {/each}
          </div>
          {#if highlighted}
            <div class="detail side">
              <p class="head"><strong>{highlighted.label}</strong><span class="category">{highlighted.category}</span></p>
              <p>{highlighted.description}</p>
            </div>
          {/if}
        {:else}
          <p class="empty">No effect matches "{parsed.name}". Try part of a name: wave, round, clone…</p>
        {/if}
        </div>
      {:else if entry}
        <div class="entry">
          <div class="detail">
            <p class="head"><strong>{entry.label}</strong><span class="category">{entry.category}</span></p>
            <p>{entry.description}</p>
          </div>
          <table>
            <tbody>
              {#each Object.entries(entry.params) as [name, spec] (name)}
                {@const set = given.get(name.toLowerCase())}
                <tr data-current={typing && name.toLowerCase().startsWith(typing) ? true : undefined} data-set={set !== undefined || undefined} data-off={!typable(spec) || undefined}>
                  <th scope="row">{name}</th>
                  <td>{describeParam(spec)}</td>
                  <td class="value">{set !== undefined ? `= ${set}` : typable(spec) ? `${JSON.stringify(spec.default)}` : ''}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="empty">No effect called "{parsed.name}". Tab completes names.</p>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <p class="keys">⏎ add · Tab complete · ↑↓ choose · Esc close</p>
    </div>
  {/if}
  <span class="prompt" aria-hidden="true">&gt;</span>
  <input
    bind:this={input}
    type="text"
    role="combobox"
    aria-label="Command line: add an effect, e.g. twist angle=45"
    aria-expanded={open && browsing && matches.length > 0}
    aria-controls={listId}
    aria-autocomplete="list"
    aria-activedescendant={open && browsing && highlighted ? optionId(highlighted.type) : undefined}
    aria-invalid={error ? true : undefined}
    autocomplete="off"
    spellcheck="false"
    {disabled}
    placeholder={disabled ? 'Open or create a scene to add effects' : 'Add an effect: twist angle=45'}
    {value}
    oninput={(e) => edit(e.currentTarget.value)}
    onfocus={() => (open = true)}
    onblur={() => (open = false)}
    onkeydown={keydown}
  />
  {#if !disabled}<span class="hint" aria-hidden="true"><kbd>/</kbd> or <kbd>⌘K</kbd></span>{/if}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger class="command-options" aria-label="Command bar options" title="Command bar options">
      <Icon name="settings" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content class="sv-menu" side={compact ? 'bottom' : 'top'} align="end" sideOffset={4}>
        <DropdownMenu.CheckboxItem class="sv-menu-item" closeOnSelect={false} checked={editor.commandInEffectsSlot} onCheckedChange={(checked) => (editor.commandInEffectsSlot = checked)}>
          {#snippet children({ checked })}
            <span class="box" data-checked={checked || undefined} aria-hidden="true">
              {#if checked}<svg viewBox="0 0 10 10"><path d="M2 5.2 4.2 7.4 8 2.8" /></svg>{/if}
            </span>
            Replace Effects Menu
          {/snippet}
        </DropdownMenu.CheckboxItem>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
  <span class="sr-only" aria-live="polite">{announce}</span>
</div>

<style>
  .command {
    position: relative;
    display: flex;
    flex: 1 0 100%;
    align-items: center;
    gap: var(--sv-space-6);
    order: -1;
    height: var(--sv-size-row);
    padding: 0 var(--sv-space-6);
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
    font-size: var(--sv-font-size-11);
  }
  .command.compact { flex: 1 1 0; order: 0; min-width: 160px; height: var(--sv-size-row); }
  .command:hover:not([data-disabled]) { border-color: var(--sv-rule-strong); }
  .command:focus-within { border-color: var(--sv-accent-fill); }
  .command[data-error] { border-color: var(--sv-signal-error); }
  .prompt { color: var(--sv-text-muted); font-weight: var(--sv-font-weight-bold); }
  .command:focus-within .prompt { color: var(--sv-accent-fill); }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    font: inherit;
    color: var(--sv-text-primary);
    caret-color: var(--sv-accent-fill);
    background: none;
    border: 0;
    outline: none;
  }
  input::placeholder { color: var(--sv-text-muted); }
  input:disabled { cursor: default; }
  input:disabled::placeholder { color: var(--sv-text-secondary); }
  .hint { flex: none; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .command:focus-within .hint { visibility: hidden; }
  kbd { font: inherit; color: var(--sv-text-secondary); }
  :global(.command-options) { display: grid; place-items: center; flex: none; width: 22px; height: 22px; padding: 0; color: var(--sv-text-muted); background: none; border: 0; cursor: pointer; }
  :global(.command-options:hover), :global(.command-options[data-state='open']) { color: var(--sv-accent-fill); }
  :global(.command-options .sv-icon) { width: 14px; height: 14px; }
  .box { display: inline-grid; place-items: center; flex: none; width: 12px; height: 12px; border: var(--sv-border-1) solid var(--sv-rule-strong); }
  .box[data-checked] { border-color: var(--sv-accent-fill); }
  .box svg { width: 10px; height: 10px; fill: none; stroke: var(--sv-accent-fill); stroke-width: 1.5; stroke-linecap: square; }

  .results {
    position: absolute;
    left: -1px;
    bottom: calc(100% + 1px);
    z-index: 40;
    width: min(720px, calc(100% + 2px));
    background: var(--sv-surface-raised);
    border: var(--sv-border-1) solid var(--sv-rule-strong);
    color: var(--sv-text-primary);
  }
  .command[data-position='effects'] .results { top: calc(100% + 1px); bottom: auto; }
  .browse {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    height: calc(var(--sv-size-row) * 8 + var(--sv-space-4));
  }
  .browse .empty { grid-column: 1 / -1; }
  .detail.side { overflow-y: auto; border-top: 0; border-left: var(--sv-border-1) solid var(--sv-rule-strong); }
  .list { max-height: 100%; padding: 0 0 var(--sv-space-2); overflow-y: auto; overscroll-behavior: contain; }
  /* Group header: sticks to the top while its group scrolls under it. */
  .group-head {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    height: 20px;
    padding: 0 var(--sv-space-8);
    color: var(--sv-text-secondary);
    font-size: var(--sv-font-size-10);
    background: var(--sv-surface-raised);
    border-bottom: var(--sv-border-1) solid var(--sv-rule-strong);
  }
  [role='group'] + [role='group'] .group-head { border-top: var(--sv-border-1) solid var(--sv-rule-strong); }
  .option {
    display: grid;
    grid-template-columns: 16ch minmax(0, 1fr);
    align-items: center;
    gap: var(--sv-space-12);
    height: var(--sv-size-row);
    padding: 0 var(--sv-space-8);
    cursor: pointer;
  }
  .option[aria-selected='true'] { background: var(--sv-surface-hover); }
  .option[aria-selected='true'] .name { color: var(--sv-accent-fill); }
  .option[aria-disabled] { color: var(--sv-text-secondary); }
  .name { overflow: hidden; text-overflow: ellipsis; font-weight: var(--sv-font-weight-bold); }
  .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--sv-text-secondary); }
  .category { color: var(--sv-text-secondary); font-size: var(--sv-font-size-10); }
  p { margin: 0; }
  .detail {
    padding: var(--sv-space-6) var(--sv-space-8);
    color: var(--sv-text-secondary);
    line-height: 1.45;
    border-top: var(--sv-border-1) solid var(--sv-rule-strong);
  }
  .detail strong { color: var(--sv-text-primary); }
  .detail .head { display: flex; justify-content: space-between; gap: var(--sv-space-12); margin-bottom: var(--sv-space-2); }
  .entry .detail { border-top: 0; border-bottom: var(--sv-border-1) solid var(--sv-rule-strong); }
  table { width: 100%; border-collapse: collapse; }
  .entry { max-height: min(60vh, 420px); overflow-y: auto; overscroll-behavior: contain; }
  tr { height: 20px; }
  th, td { padding: 0 var(--sv-space-8); text-align: left; white-space: nowrap; font-weight: var(--sv-font-weight-regular); color: var(--sv-text-secondary); }
  th { width: 18ch; color: var(--sv-text-primary); }
  td.value { width: 100%; font-variant-numeric: tabular-nums; }
  tr[data-current] { background: var(--sv-surface-hover); }
  tr[data-current] th { color: var(--sv-accent-fill); }
  tr[data-set] td.value { color: var(--sv-text-primary); }
  tr[data-off] th, tr[data-off] td { color: var(--sv-text-muted); }
  .empty { padding: var(--sv-space-6) var(--sv-space-8); color: var(--sv-text-secondary); }
  .error { padding: var(--sv-space-6) var(--sv-space-8); color: var(--sv-signal-error); border-top: var(--sv-border-1) solid var(--sv-rule-strong); }
  .keys { padding: 0 var(--sv-space-8); height: 20px; display: flex; align-items: center; color: var(--sv-text-secondary); font-size: var(--sv-font-size-10); border-top: var(--sv-border-1) solid var(--sv-rule-default); }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
