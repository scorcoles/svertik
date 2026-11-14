<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import { Button, Icon } from '@svertik/ui';
  import type { Editor } from './editor.svelte';
  import { samples, type SampleName } from './samples';

  interface Props {
    editor: Editor;
    onimport: () => void;
    ondemo: (which: 'intro' | 'shatter' | 'reel' | 'orbit' | 'pointer') => void;
    showWelcome?: boolean;
  }
  let { editor, onimport, ondemo, showWelcome = false }: Props = $props();
</script>

<div class="drop" class:without-welcome={!showWelcome}>
  {#if showWelcome}
    <div class="welcome-header">
      <img src="/assets/welcome.png" alt="svertik" />
    </div>
  {/if}
  <div class="drop-content">
    <span class="icon"><Icon name="import" /></span>
    <strong>Drop an SVG or a .svrtk project here</strong>
    <span class="muted">or paste it (⌘V), or draw with the tools on the left</span>
    <div class="start">
      <Button kind="primary" label="Choose file…" onclick={onimport} />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}<Button {...props} label="Demos ▾" />{/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="sv-menu sv-demos" sideOffset={4} collisionPadding={8}>
            <DropdownMenu.Item class="sv-menu-item" onSelect={() => ondemo('intro')}><Icon name="play" /><span class="label">Intro: the logo</span></DropdownMenu.Item>
            <DropdownMenu.Item class="sv-menu-item" onSelect={() => ondemo('shatter')}><Icon name="play" /><span class="label">Shatter: a triangle that explodes</span></DropdownMenu.Item>
            <DropdownMenu.Item class="sv-menu-item" onSelect={() => ondemo('reel')}><Icon name="play" /><span class="label">Reel: motion graphics in three acts</span></DropdownMenu.Item>
            <DropdownMenu.Item class="sv-menu-item" onSelect={() => ondemo('orbit')}><Icon name="play" /><span class="label">Orbit: the Utils working together</span></DropdownMenu.Item>
            <DropdownMenu.Item class="sv-menu-item" onSelect={() => ondemo('pointer')}><Icon name="play" /><span class="label">Pointer: it follows your mouse</span></DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
    <span class="samples muted">
      or start from a sample:
      {#each Object.keys(samples) as name, i (name)}
        {#if i > 0}<span aria-hidden="true">·</span>{/if}
        <button type="button" onclick={() => editor.load(samples[name as SampleName], `${name}.svg`)}>{name}</button>
      {/each}
    </span>
    {#if editor.error}<p class="error" role="alert">{editor.error}</p>{/if}
  </div>
</div>

<style>
  .drop {
    display: grid;
    justify-items: center;
    gap: var(--sv-space-12);
    width: min(560px, calc(100% - 32px));
    padding: 0 0 var(--sv-space-32);
    color: var(--sv-text-muted);
    text-align: center;
    background: var(--sv-surface-panel);
    border: 0;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.35);
  }
  .drop.without-welcome { padding-top: var(--sv-space-32); }
  .welcome-header {
    width: 100%;
    line-height: 0;
  }
  .welcome-header img {
    display: block;
    width: 100%;
    height: auto;
  }
  .drop-content {
    display: grid;
    justify-items: center;
    gap: var(--sv-space-12);
    padding: 0 var(--sv-space-24, 24px);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    color: var(--sv-accent-fill);
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
  strong {
    color: var(--sv-text-primary);
    font-size: var(--sv-font-size-12);
  }
  .start {
    display: flex;
    gap: var(--sv-space-8);
    margin-top: var(--sv-space-4);
  }
  .samples {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sv-space-6);
    justify-content: center;
    font-size: var(--sv-font-size-10);
  }
  .samples button {
    padding: 0;
    font: inherit;
    color: var(--sv-text-secondary);
    background: none;
    border: 0;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .samples button:hover {
    color: var(--sv-accent-fill);
  }
  .error {
    margin: 0;
    color: var(--sv-signal-error);
    font-size: var(--sv-font-size-10);
  }
</style>
