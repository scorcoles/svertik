<script lang="ts">
  import { t } from '@svertik/ui';
  // The tour: a spotlight on one area of the editor and a card beside it. It does not block the editor:
  // everything stays usable while it is open. Esc skips it; ← and → move between steps.
  import { onMount, tick } from 'svelte';
  import { Button } from '@svertik/ui';
  import { markTourSeen, placeCard, stepFrom, TOUR, type TourStep } from './tour';

  let { onclose }: { onclose: () => void } = $props();

  const PAD = 4;
  const present = (step: TourStep) => {
    const el = document.querySelector(step.target);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  let index = $state(-1);
  let area = $state<{ left: number; top: number; width: number; height: number } | null>(null);
  let cardWidth = $state(0);
  let cardHeight = $state(0);
  let view = $state({ width: 0, height: 0 });
  let card = $state<HTMLElement | null>(null);
  const focusNext = () => card?.querySelector<HTMLElement>('[data-tour-next]')?.focus();

  const step = $derived(index >= 0 ? TOUR[index] : undefined);
  const spot = $derived(area && cardWidth ? placeCard(area, { width: cardWidth, height: cardHeight }, view) : null);
  // Position among the steps on screen now (some panels may be hidden).
  const shown = $derived(index >= 0 ? TOUR.filter((s) => present(s)) : []);
  const position = $derived(step ? shown.indexOf(step) + 1 : 0);
  const last = $derived(index >= 0 && stepFrom(TOUR, index, 1, present) < 0);

  function finish() {
    markTourSeen();
    onclose();
  }
  async function go(dir: 1 | -1) {
    const next = stepFrom(TOUR, index, dir, present);
    if (next < 0) {
      if (dir === 1) finish();
      return;
    }
    index = next;
    await tick();
    focusNext();
  }

  onMount(() => {
    index = stepFrom(TOUR, -1, 1, present);
    if (index < 0) return finish();
    void tick().then(focusNext);
    // Follow the area as panels resize, scroll or open: measuring one element per frame is cheap.
    let raf = 0;
    const measure = () => {
      const el = step && document.querySelector(step.target);
      const r = el?.getBoundingClientRect();
      const now = r && r.width > 0 && r.height > 0
        ? { left: r.left - PAD, top: r.top - PAD, width: r.width + 2 * PAD, height: r.height + 2 * PAD }
        : null;
      if (JSON.stringify(now) !== JSON.stringify(area)) area = now;
      if (view.width !== innerWidth || view.height !== innerHeight) view = { width: innerWidth, height: innerHeight };
      raf = requestAnimationFrame(measure);
    };
    measure();
    // Capture phase: the editor's own shortcuts (Esc deselects, arrows nudge) must not see these keys.
    const keydown = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if (e.key === 'Escape') finish();
      else if (!typing && e.key === 'ArrowRight') void go(1);
      else if (!typing && e.key === 'ArrowLeft') void go(-1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    addEventListener('keydown', keydown, true);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('keydown', keydown, true);
    };
  });
</script>

{#if step}
  {#if area}
    <div class="spotlight" aria-hidden="true" style:left="{area.left}px" style:top="{area.top}px" style:width="{area.width}px" style:height="{area.height}px"></div>
  {/if}
  <div
    class="card"
    bind:this={card}
    role="dialog"
    aria-modal="false"
    aria-labelledby="tour-title"
    aria-describedby="tour-body"
    bind:clientWidth={cardWidth}
    bind:clientHeight={cardHeight}
    style:left={spot ? `${spot.left}px` : '50%'}
    style:top={spot ? `${spot.top}px` : '50%'}
    style:translate={spot ? null : '-50% -50%'}
  >
    <p class="count">{position} / {shown.length}</p>
    <h2 id="tour-title">{step.title}</h2>
    <p id="tour-body">{step.body}</p>
    <div class="actions">
      <button type="button" class="skip" onclick={finish}>{last ? t('Close') : t('Skip tour')}</button>
      <span class="spacer"></span>
      {#if position > 1}<Button label={t('Back')} onclick={() => go(-1)} />{/if}
      <Button kind="primary" label={last ? t('Done') : t('Next')} data-tour-next onclick={() => go(1)} />
    </div>
  </div>
{/if}

<style>
  .spotlight {
    position: fixed;
    z-index: 900;
    pointer-events: none;
    outline: 1px solid var(--sv-accent-fill);
    box-shadow: 0 0 0 100vmax var(--sv-overlay-ink-soft);
    transition: left 160ms ease, top 160ms ease, width 160ms ease, height 160ms ease;
  }
  .card {
    position: fixed;
    z-index: 901;
    display: grid;
    gap: var(--sv-space-8, 8px);
    width: min(300px, calc(100vw - 24px));
    box-sizing: border-box;
    padding: var(--sv-space-16, 16px);
    color: var(--sv-text-secondary);
    background: var(--sv-surface-panel);
    border: 1px solid var(--sv-rule-strong);
    box-shadow: 0 8px 24px var(--sv-overlay-ink);
    font-family: var(--sv-font-mono);
    font-size: 12px;
    line-height: 1.5;
    transition: left 160ms ease, top 160ms ease;
  }
  .count { margin: 0; color: var(--sv-text-muted); font-size: 11px; }
  h2 { margin: 0; color: var(--sv-text-primary); font-size: 14px; font-weight: var(--sv-font-weight-bold); }
  #tour-body { margin: 0; }
  .actions { display: flex; align-items: center; gap: var(--sv-space-8, 8px); margin-top: var(--sv-space-4, 4px); }
  .spacer { flex: 1; }
  .skip {
    padding: 0;
    color: var(--sv-text-muted);
    background: none;
    border: 0;
    font: inherit;
    cursor: pointer;
  }
  .skip:hover, .skip:focus-visible { color: var(--sv-text-primary); text-decoration: underline; }
  @media (prefers-reduced-motion: reduce) {
    .spotlight, .card { transition: none; }
  }
</style>
