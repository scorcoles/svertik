<script lang="ts">
  import { t } from '@svertik/ui';
  import { tick } from 'svelte';
  import { DropdownMenu } from 'bits-ui';
  import { autonomousGenerators, builtins, effectDescriptions, shapeDescriptions, EFFECT_MENUS } from '@svertik/engine';
  import { Icon, IconButton, type IconName } from '@svertik/ui';
  import type { Editor } from './editor.svelte';
  import { buildCatalog, compile, complete, describeParam, familyColor, parse, pushRecent, recentEntries, resolve, search, tokenize, typable, type CommandEntry } from './command';
  import { completeParam, EXPORT_FORMATS, matchNames, matchVerbs, parseAssignments, parseTime, splitVerb, VERBS, type ExportFormat } from './verbs';

  // Command line, fixed in the status bar (like a CAD prompt). Type an effect and, optionally, its
  // parameters with their JSON names ("twist angle=45"), or a verb: set, key, select, goto, export.
  // Focused by "/", ⌘K and the stack's +. Results open upwards, with descriptions.
  let { editor, compact = false }: { editor: Editor; compact?: boolean } = $props();

  // Descriptions in the interface's language (searching matches their words too).
  const catalog = buildCatalog(builtins as never, autonomousGenerators as never, Object.fromEntries(Object.entries({ ...effectDescriptions, ...shapeDescriptions }).map(([type, text]) => [type, t(text)])));
  const listId = 'command-results';

  let input: HTMLInputElement;
  let list = $state<HTMLElement>();
  let value = $state('');
  let open = $state(false);
  let active = $state(0);
  let error = $state<string | null>(null);
  let announce = $state('');
  // Results at a readable width, or across the whole footer line (the corner button). Remembered in this browser.
  const WIDE_KEY = 'svertik.command.wide';
  let wide = $state(readWide());
  function readWide() {
    try {
      return localStorage.getItem(WIDE_KEY) === '1';
    } catch {
      return false;
    }
  }
  function toggleWide() {
    wide = !wide;
    try {
      localStorage.setItem(WIDE_KEY, wide ? '1' : '0');
    } catch {
      // Storage blocked: it lasts this session.
    }
  }
  // Session history: ↑ on an empty line.
  const history: string[] = [];
  // Recent effects, listed first on an empty line. Kept in this browser only (a convenience: it may be empty).
  const RECENT_KEY = 'svertik.command.recent';
  let recent = $state<string[]>(readRecent());
  function readRecent(): string[] {
    try {
      const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
      return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : [];
    } catch {
      return [];
    }
  }
  function remember(type: string) {
    recent = pushRecent(recent, type);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      // Storage blocked (private window…): the list lasts this session.
    }
  }
  let historyAt = $state<number | null>(null);

  const parsed = $derived(parse(value));
  // A verb other than "add" followed by a space: the rest of the line is its argument.
  const call = $derived(splitVerb(value));
  const browsing = $derived(!call && !parsed.pastName);
  // While typing a name, verbs that start with it are listed first (in their own "Commands" group).
  const verbEntries = $derived(browsing ? matchVerbs(parsed.name).map((v): CommandEntry => ({ type: v.verb, label: v.usage, category: 'Commands', description: v.description, params: {}, autonomous: false, verb: true })) : []);
  const matches = $derived(browsing ? [...verbEntries, ...search(catalog, parsed.name)] : []);
  // Grouped by category, with a header per group. With nothing typed, in the top bar menus' order; while
  // typing, the group holding the best match comes first (so Enter still adds the most likely effect).
  const CATEGORY_ORDER: readonly string[] = [...EFFECT_MENUS, 'Utils'];
  const groups = $derived.by(() => {
    const byCategory = new Map<string, CommandEntry[]>();
    for (const m of matches) byCategory.set(m.category, [...(byCategory.get(m.category) ?? []), m]);
    const rank = (c: string) => (c === 'Commands' ? 0 : CATEGORY_ORDER.indexOf(c) + 1 || CATEGORY_ORDER.length + 1);
    const entries = [...byCategory.entries()];
    const empty = !parsed.name.trim();
    if (empty) entries.sort(([a], [b]) => rank(a) - rank(b));
    // Nothing typed: the recent effects first (copies, so each row is its own option), Enter repeats the last.
    const recents = empty ? recentEntries(catalog, recent).map((e) => ({ ...e })) : [];
    return [...(recents.length ? [{ category: 'Recent', items: recents }] : []), ...entries.map(([category, items]) => ({ category, items }))];
  });
  // The options in display order: what ↑↓ and Enter walk through.
  const ordered = $derived(groups.flatMap((g) => g.items));
  const entry = $derived(browsing || call ? null : resolve(catalog, parsed.name));
  const highlighted = $derived(ordered[Math.min(active, ordered.length - 1)] ?? null);
  const given = $derived(new Map(parsed.args.filter((a) => a.includes('=')).map((a) => [(a.split('=')[0] ?? '').toLowerCase(), a.slice(a.indexOf('=') + 1)])));
  const typing = $derived(parsed.last.includes('=') ? '' : parsed.last.toLowerCase());
  const disabled = $derived(!editor.scene);

  // Where the command lands: the active node (its name is the prompt), or a new object for generators.
  const target = $derived(editor.activeNode);
  const pending = $derived(open && !disabled && !call ? (entry ?? (highlighted?.verb ? null : highlighted)) : null);

  // ── Verbs
  const verbInfo = $derived(call ? VERBS.find((v) => v.verb === call.verb)! : null);
  // set/key: the selected effect, or the selected object.
  const paramTarget = $derived(call && (call.verb === 'set' || call.verb === 'key') ? editor.paramTarget() : null);
  const verbTokens = $derived(call ? tokenize(call.rest) : []);
  const verbGiven = $derived(new Map(verbTokens.map((t) => [(t.split('=')[0] ?? '').toLowerCase(), t.includes('=') ? t.slice(t.indexOf('=') + 1) : ''])));
  const verbTyping = $derived(call && !/\s$/.test(value) ? (verbTokens[verbTokens.length - 1] ?? '').toLowerCase() : '');
  // select/goto/export: a list to choose from, filtered by what is typed.
  const fps = $derived(editor.animation?.fps ?? 30);
  const duration = $derived(editor.animation?.duration ?? 3);
  const markers = $derived(editor.animation?.markers ?? []);
  const choices = $derived.by((): { value: string; label: string; detail: string }[] => {
    if (!call) return [];
    const q = call.rest.trim().toLowerCase();
    if (call.verb === 'select') return matchNames(editor.namedItems(), call.rest).map((x) => ({ value: x.id, label: x.label, detail: x.detail }));
    if (call.verb === 'goto') {
      const all = [
        { value: 'start', label: t('start'), detail: '0 s' },
        { value: 'end', label: 'end', detail: `${duration} s` },
        ...markers.map((m) => ({ value: m.name, label: m.name, detail: `marker · ${m.t.toFixed(2)} s` })),
      ];
      return all.filter((c) => !q || c.label.toLowerCase().startsWith(q));
    }
    if (call.verb === 'export') return EXPORT_FORMATS.filter((f) => !q || f.format.startsWith(q)).map((f) => ({ value: f.format, label: f.format, detail: `${f.label} · ${f.detail}` }));
    return [];
  });
  const choice = $derived(choices[Math.min(active, choices.length - 1)] ?? null);

  const promptText = $derived(disabled ? '' : paramTarget ? paramTarget.label : pending?.autonomous ? t('New object') : target ? target.name : t('No selection'));
  // Tell the stack which effect is about to be added, so it marks where it will go.
  $effect(() => {
    editor.commandPreview = pending && !pending.autonomous && !blocker(pending) ? pending.type : null;
  });
  $effect(() => () => (editor.commandPreview = null));

  /** Why it can't be added here (null: it can). */
  function blocker(e: CommandEntry): string | null {
    if (e.autonomous || e.verb) return null;
    const node = editor.activeNode;
    if (!node && !(e.type === 'physics' && editor.scene)) return t('Select an object first, then run the command again.');
    if (node && editor.isLocked(node.id)) return t('The selected object is locked.');
    if (!editor.canAdd(e.type)) return t('{effect} does not work on raster images.', { effect: e.label });
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
    announce = error ?? (call ? `${call.verb}: ${verbInfo?.usage ?? ''}` : browsing ? `${matches.length} result${matches.length === 1 ? '' : 's'}` : entry ? `${entry.label}: ${Object.keys(entry.params).length} parameters` : '');
  });

  function edit(text: string) {
    value = text;
    error = null;
    active = 0;
    historyAt = null;
    open = true;
  }

  function done(command: string, message: string) {
    if (history[history.length - 1] !== command) history.push(command);
    historyAt = null;
    value = '';
    error = null;
    open = false;
    announce = message;
  }

  /** Runs set, key, select, goto or export. Errors stay on the line, with the fix. */
  function runVerb(command: string, v: NonNullable<ReturnType<typeof splitVerb>>) {
    if (v.verb === 'set' || v.verb === 'key') {
      const target = editor.paramTarget();
      if (!target) return void (error = t('Select an object or an effect first (click it, or: select <name>).'));
      if (editor.activeNode && editor.isLocked(editor.activeNode.id)) return void (error = t('The selected object is locked.'));
      const a = parseAssignments(v.verb, v.rest, target.params, target.label);
      if (!a.ok) return void (error = a.error);
      for (const [k, val] of Object.entries(a.values)) target.set(k, val);
      const names = [...Object.keys(a.values), ...a.bare];
      if (v.verb === 'key') {
        for (const k of names) editor.keyHere(target.track(k));
        editor.timelineOpen = true;
        return done(command, t('Keyed {names} at {time} s', { names: names.join(', '), time: editor.time.toFixed(2) }));
      }
      return done(command, t('Set {names} on {target}', { names: names.join(', '), target: target.label }));
    }
    if (v.verb === 'select') {
      if (!choice) return void (error = v.rest.trim() ? t('Nothing called "{name}".', { name: v.rest.trim() }) : t('Type a name, e.g. select Comet.'));
      editor.selected = choice.value;
      return done(command, t('Selected {name}', { name: choice.label }));
    }
    if (v.verb === 'goto') {
      let at = parseTime(v.rest, { fps, duration, markers });
      if (!at.ok && choice) at = parseTime(choice.value, { fps, duration, markers });
      if (!at.ok) return void (error = at.error);
      editor.playing = false;
      editor.setTime(at.t);
      return done(command, t('At {time} s', { time: at.t.toFixed(2) }));
    }
    const q = v.rest.trim().toLowerCase();
    const format = (EXPORT_FORMATS.find((f) => f.format === q)?.format ?? choice?.value) as ExportFormat | undefined;
    if (!format) return void (error = t('Export as svg, png, mp4, animsvg, lottie or json.'));
    if (!editor.exporter) return void (error = 'Export is not available here.');
    done(command, t('Exporting {format}', { format }));
    editor.exporter(format);
  }

  function run(text = value) {
    let command = text;
    const v = splitVerb(text);
    if (v) return runVerb(text, v);
    if (browsing) {
      // A verb in the list: Enter (like Tab) types it, ready for its argument.
      if (highlighted?.verb && text === value) return edit(`${highlighted.type} `);
      if (!highlighted) {
        error = parsed.name ? t('No effect matches "{name}".', { name: parsed.name }) : t('Type an effect name, e.g. twist angle=45.');
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
    remember(compiled.entry.type);
    if (history[history.length - 1] !== command) history.push(command);
    historyAt = null;
    value = '';
    error = null;
    open = false;
    announce = t('Added {effect}', { effect: compiled.entry.label });
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
      const next = call ? completeVerb() : browsing && highlighted?.verb ? `${highlighted.type} ` : complete(catalog, value, highlighted);
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
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && call && choices.length) {
      e.preventDefault();
      open = true;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
    }
  }

  /** Tab with a verb: the parameter name (set/key) or the highlighted choice (select/goto/export). */
  function completeVerb(): string | null {
    if (!call) return null;
    if (call.verb === 'set' || call.verb === 'key') return paramTarget ? completeParam(call.verb, value, paramTarget.params) : null;
    return choice ? `${call.verb} ${choice.label}` : null;
  }

  const optionId = (type: string) => `command-option-${type}`;
</script>

<div class="command" class:compact data-position={editor.commandInEffectsSlot ? 'effects' : 'footer'} data-disabled={disabled || undefined} data-error={error ? true : undefined} data-idle={!disabled && !target ? true : undefined}>
  {#if open && !disabled}
    <div class="results" role="presentation" data-wide={wide || undefined}>
      {#if browsing}
        <!-- Fixed height, list left and description right: neither hovering nor filtering moves anything
             (descriptions run from one line to several). -->
        <div class="browse">
        {#if matches.length}
          <div id={listId} class="list" bind:this={list} role="listbox" aria-label={t('Effects')}>
            {#each groups as g (g.category)}
            <div role="group" aria-labelledby="command-group-{g.category}">
            <div id="command-group-{g.category}" class="group-head">{t(g.category)}</div>
            {#each g.items as m (m.type)}
              {@const i = ordered.indexOf(m)}
              {@const why = blocker(m)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                id={optionId(String(i))}
                class="option"
                role="option"
                tabindex="-1"
                aria-selected={i === active}
                aria-disabled={why ? true : undefined}
                title={why ?? undefined}
                onpointerenter={() => (active = i)}
                onpointerdown={(e) => e.preventDefault()}
                onclick={() => (m.verb ? edit(`${m.type} `) : run(m.type))}
              >
                <span class="name">
                  {#if m.verb}<span class="family" aria-hidden="true"></span>{:else}<span class="family" style:--tone={familyColor(m.category)}><Icon name={m.type as IconName} size={14} /></span>{/if}
                  {m.type}
                </span>
                <span class="label">{m.label.toLowerCase().replace(/\s+/g, '') === m.type ? '' : m.label}</span>
              </div>
            {/each}
            </div>
            {/each}
          </div>
          {#if highlighted}
            <div class="detail side">
              <p class="head"><strong>{highlighted.label}</strong><span class="category">{t(highlighted.category)}</span></p>
              <p>{highlighted.description}</p>
            </div>
          {/if}
        {:else}
          <p class="empty">{t('No effect matches "{name}". Try part of a name: wave, round, clone…', { name: parsed.name })}</p>
        {/if}
        </div>
      {:else if call && verbInfo}
        <div class="entry">
          <div class="detail">
            <p class="head"><strong>{call.verb}</strong><span class="category">{verbInfo.usage}</span></p>
            <p>{verbInfo.description}</p>
          </div>
          {#if call.verb === 'set' || call.verb === 'key'}
            {#if paramTarget}
              <table>
                <tbody>
                  {#each Object.entries(paramTarget.params) as [name, spec] (name)}
                    {@const set = verbGiven.get(name.toLowerCase())}
                    {@const current = paramTarget.value(name)}
                    <tr data-current={verbTyping && name.toLowerCase().startsWith(verbTyping.split('=')[0] ?? '') ? true : undefined} data-set={set !== undefined || undefined} data-off={!typable(spec) || undefined}>
                      <th scope="row">{name}</th>
                      <td>{describeParam(spec)}</td>
                      <td class="value">{set ? `= ${set}` : typable(spec) && (typeof current !== 'object' || current === null) ? JSON.stringify(current) : ''}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {:else}
              <p class="empty">Select an object or an effect first (click it, or: select &lt;name&gt;).</p>
            {/if}
          {:else if choices.length}
            <div id={listId} class="list choices" bind:this={list} role="listbox" aria-label={call.verb}>
              {#each choices as c, i (c.value)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                  id={optionId(`${call.verb}-${i}`)}
                  class="option"
                  role="option"
                  tabindex="-1"
                  aria-selected={i === active}
                  onpointerenter={() => (active = i)}
                  onpointerdown={(e) => e.preventDefault()}
                  onclick={() => { active = i; run(); }}
                >
                  <span class="name">{c.label}</span>
                  <span class="label">{c.detail}</span>
                </div>
              {/each}
            </div>
          {:else if call.verb !== 'goto'}
            <p class="empty">{t('Nothing matches "{name}".', { name: call.rest.trim() })}</p>
          {/if}
        </div>
      {:else if entry}
        <div class="entry">
          <div class="detail">
            <p class="head"><strong>{entry.label}</strong><span class="category">{t(entry.category)}</span></p>
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
        <p class="empty">{t('No effect called "{name}". Tab completes names.', { name: parsed.name })}</p>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="keys">
        <span>{call ? t('⏎ run') : t('⏎ add')} · {t('Tab complete · ↑↓ choose · Esc close')}</span>
        {#if !compact}
          <!-- pointerdown kept from the input: clicking here must not blur it (that would close the results). -->
          <span class="widen">
            <IconButton icon={wide ? 'narrow-width' : 'fit-width'} label={wide ? t('Narrow the results') : t('Widen the results')} aria-pressed={wide} onpointerdown={(e: PointerEvent) => e.preventDefault()} onclick={toggleWide} />
          </span>
        {/if}
      </div>
    </div>
  {/if}
  <span class="prompt" title={target && !pending?.autonomous ? t('Adds to {name}', { name: target.name }) : undefined}>{promptText} ›</span>
  <input
    bind:this={input}
    type="text"
    role="combobox"
    aria-label={target ? t('Command line: add an effect to {name}, e.g. twist angle=45, or set, key, select, goto, export', { name: target.name }) : t('Command line: select an object to add effects, or use select, goto, export')}
    aria-expanded={open && ((browsing && matches.length > 0) || choices.length > 0)}
    aria-controls={open && ((browsing && matches.length > 0) || (call && call.verb !== 'set' && call.verb !== 'key' && choices.length > 0)) ? listId : undefined}
    aria-autocomplete="list"
    aria-activedescendant={open && browsing && highlighted ? optionId(String(ordered.indexOf(highlighted))) : open && call && choice ? optionId(`${call.verb}-${choices.indexOf(choice)}`) : undefined}
    aria-invalid={error ? true : undefined}
    autocomplete="off"
    spellcheck="false"
    {disabled}
    placeholder={disabled ? t('Open or create a scene to add effects') : target ? t('Add an effect (twist angle=45), or: set · key · select · goto · export') : t('Select an object to add effects, or: select · goto · export · randomwave')}
    {value}
    oninput={(e) => edit(e.currentTarget.value)}
    onfocus={() => (open = true)}
    onblur={() => {
      // Leaving without running: drop the text and any error (nothing stale is left behind).
      open = false;
      value = '';
      error = null;
      historyAt = null;
    }}
    onkeydown={keydown}
  />
  {#if !disabled}<span class="hint" aria-hidden="true"><kbd>/</kbd> or <kbd>⌘K</kbd></span>{/if}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger class="command-options" aria-label={t('Command bar options')} title={t('Command bar options')}>
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
  .prompt { flex: none; max-width: 18ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--sv-text-secondary); font-weight: var(--sv-font-weight-bold); }
  .command[data-idle] .prompt { color: var(--sv-text-muted); font-weight: var(--sv-font-weight-regular); }
  .command[data-idle]:not(:focus-within) { background: none; }
  .command:focus-within .prompt { color: var(--sv-accent-text); }
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
  :global(.command-options:hover), :global(.command-options[data-state='open']) { color: var(--sv-accent-text); }
  :global(.command-options .sv-icon) { width: 14px; height: 14px; }
  .box { display: inline-grid; place-items: center; flex: none; width: 12px; height: 12px; border: var(--sv-border-1) solid var(--sv-rule-strong); }
  .box[data-checked] { border-color: var(--sv-accent-fill); }
  .box svg { width: 10px; height: 10px; fill: none; stroke: var(--sv-accent-text); stroke-width: 1.5; stroke-linecap: square; }

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
  /* In the footer the line can be very wide: the results stop at a readable width, so the description
     on the right keeps lines of about 65 characters. */
  .command:not(.compact) .results { width: min(760px, calc(100% + 2px)); }
  .command:not(.compact) .results[data-wide] { width: calc(100% + 2px); }
  .browse {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    height: calc(var(--sv-size-row) * 8 + var(--sv-space-4));
  }
  .browse .empty { grid-column: 1 / -1; }
  .detail.side { overflow-y: auto; border-top: 0; border-left: var(--sv-border-1) solid var(--sv-rule-strong); }
  .list { max-height: 100%; padding: 0 0 var(--sv-space-2); overflow-y: auto; overscroll-behavior: contain; }
  .list.choices { max-height: calc(var(--sv-size-row) * 8); }
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
    grid-template-columns: 20ch minmax(0, 1fr);
    align-items: center;
    gap: var(--sv-space-12);
    height: var(--sv-size-row);
    padding: 0 var(--sv-space-8);
    cursor: pointer;
  }
  .option[aria-selected='true'] { background: var(--sv-surface-hover); }
  .option[aria-selected='true'] .name { color: var(--sv-accent-text); }
  .option[aria-disabled] { color: var(--sv-text-secondary); }
  .name { display: flex; align-items: center; gap: var(--sv-space-6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--sv-font-weight-bold); }
  /* The effect's icon in its family's colour, as in the stack. */
  .family { display: flex; flex: none; width: 14px; color: var(--tone, var(--sv-text-secondary)); }
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
  tr[data-current] th { color: var(--sv-accent-text); }
  tr[data-set] td.value { color: var(--sv-text-primary); }
  /* Not typable: same grey as the rest of the row (humo fails AA on the raised surface), name not in niebla. */
  tr[data-off] th, tr[data-off] td { color: var(--sv-text-secondary); }
  .empty { padding: var(--sv-space-6) var(--sv-space-8); color: var(--sv-text-secondary); }
  .error { padding: var(--sv-space-6) var(--sv-space-8); color: var(--sv-signal-error); border-top: var(--sv-border-1) solid var(--sv-rule-strong); }
  .keys { justify-content: space-between; gap: var(--sv-space-8); padding: 0 0 0 var(--sv-space-8); height: 20px; display: flex; align-items: center; color: var(--sv-text-secondary); font-size: var(--sv-font-size-10); border-top: var(--sv-border-1) solid var(--sv-rule-default); }
  .widen { display: flex; flex: none; }
  .widen :global(.sv-icon-button) { width: 20px; height: 20px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
