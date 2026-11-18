<script lang="ts">
  import Checkbox from './Checkbox.svelte';
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';
  import type { IconName } from './icons';

  interface Props {
    label: string;
    kind?: 'object' | 'deformer' | 'generator' | 'effector' | 'style' | 'filter';
    /** Icono del efecto; por defecto, uno según el tipo. */
    icon?: IconName;
    /** Colour of the icon (a CSS value, e.g. the effect family's token); by default, the secondary text. */
    tone?: string;
    /** Optional double-click action on the icon, separate from renaming the label. */
    oniconactivate?: () => void;
    /** Nivel en el árbol: 0 para el objeto, 1 para sus modificadores… */
    depth?: number;
    /** Si tiene hijos: plegado o desplegado. Sin valor, no hay flecha. */
    expanded?: boolean;
    selected?: boolean;
    enabled?: boolean;
    /** Recibe el evento: con ⇧ o ⌘ se puede sumar a la selección. */
    onselect?: (e: MouseEvent | KeyboardEvent) => void;
    ontoggle?: (enabled: boolean) => void;
    onexpand?: (expanded: boolean) => void;
    /** Si se pasa, aparece una papelera al pasar por la fila (o con foco). */
    onremove?: () => void;
    /** Visibilidad (objetos y grupos): un ojo que aparece al pasar y se queda tachado si está oculto. */
    visible?: boolean;
    onvisible?: (visible: boolean) => void;
    /** Grupos: desagrupar de un clic (aparece al pasar, como la papelera). */
    onungroup?: () => void;
    /** Renombrar: un lápiz al pasar (o doble clic en el nombre) edita el nombre en la propia fila. */
    onrename?: (name: string) => void;
    locked?: boolean;
    onlock?: () => void;
    /** In the tab order (roving tabindex: one row per tree). Defaults to the selected row. */
    tabbable?: boolean;
  }
  let {
    label,
    kind = 'deformer',
    icon = kind === 'object' ? 'object' : kind === 'generator' ? 'crack' : 'transform',
    tone,
    oniconactivate,
    depth = kind === 'object' ? 0 : 1,
    expanded,
    selected = false,
    enabled = $bindable(true),
    onselect,
    ontoggle,
    onexpand,
    onremove,
    visible,
    onvisible,
    onungroup,
    onrename,
    locked = false,
    onlock,
    tabbable,
  }: Props = $props();

  // Accessible name: the row's label plus its state, without the names of the buttons inside it.
  const name = $derived(
    [label, kind === 'object' ? null : kind, enabled ? null : 'off', visible === false ? 'hidden' : null, locked ? 'locked' : null]
      .filter(Boolean)
      .join(', '),
  );
  // Only the shortcuts this row actually has (a locked one has no F2 or Delete).
  const shortcuts = $derived([onrename && 'F2', onremove && 'Delete'].filter(Boolean).join(' ') || undefined);
  // F2 renames from the keyboard; Delete is handled by the editor for the whole selection. Hide, lock and
  // enable have no letter shortcut on purpose (a stray key made artwork vanish): they use the row's buttons.
  function rowKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.key !== 'F2' || !onrename) return false;
    startRename();
    return true;
  }

  // The row's buttons are built only while they can show (pointer over it, focus in it, selected or
  // renaming): a stack of a thousand rows would otherwise create five thousand hidden buttons up front.
  // At rest, one empty slot keeps their width, so the label doesn't reflow when they appear.
  let hot = $state(false);
  const active = $derived(hot || selected);
  // Before the eye: rename, ungroup, remove. After it: the open lock. (Hidden eye and closed lock always show.)
  const slotsBefore = $derived([onrename, onungroup, onremove].filter(Boolean).length);
  const eyeSlot = $derived(!!onvisible && visible !== false);
  const slotsAfter = $derived(onlock && !locked ? 1 : 0);
  let editing = $state(false);
  let input = $state<HTMLInputElement>();
  function startRename() {
    if (!onrename) return;
    editing = true;
    queueMicrotask(() => {
      input?.focus();
      input?.select();
    });
  }
  function commit(value: string) {
    const name = value.trim();
    if (editing && name && name !== label) onrename?.(name);
    editing = false;
  }
</script>

<div
  class="sv-stack-item"
  role="treeitem"
  aria-label={name}
  aria-keyshortcuts={shortcuts}
  aria-selected={selected}
  aria-level={depth + 1}
  aria-expanded={expanded}
  data-kind={kind}
  data-label={label}
  data-selected={selected || undefined}
  data-disabled={!enabled || undefined}
  style:--depth={depth}
  style:--tone={tone}
  tabindex={(tabbable ?? selected) ? 0 : -1}
  onpointerenter={() => (hot = true)}
  onpointerleave={() => (hot = false)}
  onfocusin={() => (hot = true)}
  onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hot = false; }}
  onclick={onselect}
  onkeydown={(e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onselect?.(e); }
    else if (rowKey(e)) { e.preventDefault(); e.stopPropagation(); }
    else if (expanded !== undefined && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); onexpand?.(e.key === 'ArrowRight'); }
  }}
>
  {#if expanded !== undefined}
    <button
      type="button"
      class="chevron"
      tabindex="-1"
      aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
      onclick={(e) => { e.stopPropagation(); onexpand?.(!expanded); }}
    >{expanded ? '▾' : '▸'}</button>
  {:else}
    <span class="chevron" aria-hidden="true"></span>
  {/if}
  {#if oniconactivate}
    <button class="icon icon-action" type="button" tabindex="-1" aria-label={`Open ${label}`} title={`Double-click to open ${label}`} onclick={(e) => { e.stopPropagation(); onselect?.(e); }} ondblclick={(e) => { e.stopPropagation(); oniconactivate?.(); }}><Icon name={icon} /></button>
  {:else}
    <span class="icon"><Icon name={icon} /></span>
  {/if}
  {#if editing}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:this={input}
      class="rename"
      value={label}
      aria-label="Name"
      spellcheck="false"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit(e.currentTarget.value);
        else if (e.key === 'Escape') editing = false;
      }}
      onblur={(e) => commit(e.currentTarget.value)}
    />
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span class="label" ondblclick={(e) => { e.stopPropagation(); startRename(); }}>{label}</span>
  {/if}
  {#if !active && !editing && slotsBefore + (eyeSlot ? 1 : 0)}
    <span class="slots" aria-hidden="true" style:--slots={slotsBefore + (eyeSlot ? 1 : 0)}></span>
  {/if}
  {#if (active || editing) && onrename && !editing}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="remove pencil" onclick={(e) => e.stopPropagation()}>
      <IconButton icon="pencil" label={`Rename ${label} (F2)`} tabindex={-1} onclick={startRename} />
    </span>
  {/if}
  {#if (active || editing) && onungroup}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="remove ungroup" onclick={(e) => e.stopPropagation()}>
      <IconButton icon="ungroup" label={`Ungroup ${label} (⇧⌘G)`} tabindex={-1} onclick={onungroup} />
    </span>
  {/if}
  {#if (active || editing) && onremove}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="remove" onclick={(e) => e.stopPropagation()}>
      <IconButton icon="trash" label={`Remove ${label} (Delete)`} tabindex={-1} onclick={onremove} />
    </span>
  {/if}
  {#if onvisible && (active || editing || visible === false)}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="eye" data-off={visible === false || undefined} onclick={(e) => e.stopPropagation()}>
      <IconButton
        icon={visible === false ? 'eye-off' : 'eye'}
        label={visible === false ? `Show ${label}` : `Hide ${label}`}
        tabindex={-1}
        onclick={() => onvisible?.(visible === false)}
      />
    </span>
  {/if}
  {#if !active && !editing && slotsAfter}
    <span class="slots" aria-hidden="true" style:--slots={slotsAfter}></span>
  {/if}
  {#if onlock && (active || editing || locked)}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="remove lock" data-locked={locked || undefined} onclick={(e) => e.stopPropagation()}>
      <IconButton icon={locked ? 'lock' : 'unlock'} label={locked ? `Unlock ${label}` : `Lock ${label}`} tabindex={-1} onclick={onlock} />
    </span>
  {/if}
  {#if kind !== 'object'}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="toggle" onclick={(e) => e.stopPropagation()}>
      <Checkbox bind:checked={enabled} label={`Enable ${label}`} tabindex={-1} onchange={ontoggle} />
    </span>
  {/if}
</div>

<style>
  .sv-stack-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sv-space-6);
    height: var(--sv-size-row);
    padding: 0 var(--sv-space-8) 0 calc(var(--sv-space-4) + var(--depth) * var(--sv-space-12));
    background: var(--sv-surface-panel);
    cursor: default;
    user-select: none;
  }
  .sv-stack-item[data-kind='object'] { font-weight: var(--sv-font-weight-bold); }
  .sv-stack-item:hover { background: var(--sv-surface-hover); }
  .sv-stack-item[data-selected] { background: var(--sv-accent-selection); }
  .sv-stack-item[data-selected]::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 2px;
    background: var(--sv-accent-fill);
  }
  .sv-stack-item:focus-visible { outline-offset: -1px; }
  .chevron {
    flex: none;
    width: 10px;
    padding: 0;
    font: inherit;
    font-size: var(--sv-font-size-10);
    color: var(--sv-text-muted);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .icon { display: flex; color: var(--tone, var(--sv-text-secondary)); }
  .icon-action { align-items: center; justify-content: center; padding: 0; border: 0; background: transparent; cursor: pointer; }
  .icon-action:hover { color: var(--sv-accent-fill); }
  [data-selected] .icon { color: var(--sv-accent-fill); }
  .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  [data-disabled] .label { color: var(--sv-text-muted); }
  [data-disabled] .icon { color: var(--sv-text-muted); }
  /* El interruptor solo se ve al pasar, en la fila seleccionada, con foco o si está apagado. */
  .toggle { display: flex; visibility: hidden; }
  /* La papelera, solo al pasar o con foco: el resto del tiempo no hace ruido. */
  .remove { display: flex; margin-right: calc(var(--sv-space-2) * -1); visibility: hidden; }
  /* The resting buttons' width (each 20 px with a -2 px margin), as one empty slot. */
  .slots { flex: none; width: calc(var(--slots) * (20px - var(--sv-space-2) + var(--sv-space-6)) - var(--sv-space-6)); height: 20px; }
  .remove :global(.sv-icon-button) { width: 20px; height: 20px; }
  .remove :global(.sv-icon-button:hover) { color: var(--sv-signal-error); background: none; }
  .ungroup :global(.sv-icon-button:hover),
  .pencil :global(.sv-icon-button:hover),
  .lock :global(.sv-icon-button:hover) { color: var(--sv-accent-fill); }
  .lock[data-locked] { visibility: visible; }
  .rename {
    flex: 1;
    min-width: 0;
    height: 18px;
    padding: 0 var(--sv-space-4);
    font: inherit;
    color: var(--sv-text-primary);
    background: var(--sv-surface-field);
    border: 1px solid var(--sv-accent-fill);
    outline: none;
  }
  .sv-stack-item:hover .remove,
  .sv-stack-item:focus-within .remove { visibility: visible; }
  /* El ojo: al pasar o con foco; si está oculto, siempre (tachado). */
  .eye { display: flex; margin-right: calc(var(--sv-space-2) * -1); visibility: hidden; }
  .eye :global(.sv-icon-button) { width: 20px; height: 20px; }
  .eye[data-off] :global(.sv-icon-button) { color: var(--sv-text-muted); }
  .sv-stack-item:hover .eye,
  .sv-stack-item:focus-within .eye,
  .eye[data-off] { visibility: visible; }
  .sv-stack-item:hover .toggle,
  .sv-stack-item:focus-within .toggle,
  [data-selected] .toggle,
  [data-disabled] .toggle { visibility: visible; }
</style>
