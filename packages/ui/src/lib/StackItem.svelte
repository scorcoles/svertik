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
  }
  let {
    label,
    kind = 'deformer',
    icon = kind === 'object' ? 'object' : kind === 'generator' ? 'crack' : 'transform',
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
  }: Props = $props();

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
  aria-selected={selected}
  aria-level={depth + 1}
  aria-expanded={expanded}
  data-kind={kind}
  data-selected={selected || undefined}
  data-disabled={!enabled || undefined}
  style:--depth={depth}
  tabindex="0"
  onclick={onselect}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onselect?.(e); }
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
  <span class="icon"><Icon name={icon} /></span>
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
  {#if onrename && !editing}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="remove pencil" onclick={(e) => e.stopPropagation()}>
      <IconButton icon="pencil" label={`Rename ${label}`} onclick={startRename} />
    </span>
  {/if}
  {#if onungroup}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="remove ungroup" onclick={(e) => e.stopPropagation()}>
      <IconButton icon="ungroup" label={`Ungroup ${label} (⇧⌘G)`} onclick={onungroup} />
    </span>
  {/if}
  {#if onremove}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="remove" onclick={(e) => e.stopPropagation()}>
      <IconButton icon="trash" label={`Remove ${label}`} onclick={onremove} />
    </span>
  {/if}
  {#if onvisible}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="eye" data-off={visible === false || undefined} onclick={(e) => e.stopPropagation()}>
      <IconButton
        icon={visible === false ? 'eye-off' : 'eye'}
        label={visible === false ? `Show ${label}` : `Hide ${label}`}
        onclick={() => onvisible?.(visible === false)}
      />
    </span>
  {/if}
  {#if kind !== 'object'}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="toggle" onclick={(e) => e.stopPropagation()}>
      <Checkbox bind:checked={enabled} label={`Enable ${label}`} onchange={ontoggle} />
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
  .icon { display: flex; color: var(--sv-text-secondary); }
  [data-selected] .icon { color: var(--sv-accent-fill); }
  .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  [data-disabled] .label { color: var(--sv-text-disabled); }
  [data-disabled] .icon { color: var(--sv-text-disabled); }
  /* El interruptor solo se ve al pasar, en la fila seleccionada, con foco o si está apagado. */
  .toggle { display: flex; visibility: hidden; }
  /* La papelera, solo al pasar o con foco: el resto del tiempo no hace ruido. */
  .remove { display: flex; margin-right: calc(var(--sv-space-2) * -1); visibility: hidden; }
  .remove :global(.sv-icon-button) { width: 20px; height: 20px; }
  .remove :global(.sv-icon-button:hover) { color: var(--sv-signal-error); background: none; }
  .ungroup :global(.sv-icon-button:hover),
  .pencil :global(.sv-icon-button:hover) { color: var(--sv-accent-fill); }
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
  .eye[data-off] :global(.sv-icon-button) { color: var(--sv-text-disabled); }
  .sv-stack-item:hover .eye,
  .sv-stack-item:focus-within .eye,
  .eye[data-off] { visibility: visible; }
  .sv-stack-item:hover .toggle,
  .sv-stack-item:focus-within .toggle,
  [data-selected] .toggle,
  [data-disabled] .toggle { visibility: visible; }
</style>
