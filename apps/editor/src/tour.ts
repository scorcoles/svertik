// The first-run tour: a few cards that point at the real editor, one area at a time.
// Steps whose area is not on screen (a hidden panel, an empty scene) are skipped.
import { t } from '@svertik/ui/i18n';

export interface TourStep {
  /** CSS selector of the area the card points at. */
  target: string;
  title: string;
  body: string;
}

export const TOUR: TourStep[] = [
  {
    target: 'section.canvas',
    title: t('The canvas'),
    body: t('Your scene. Click to select, drag to move. Wheel or pinch to zoom, ⇧1 fits the document.'),
  },
  {
    target: 'nav.rail',
    title: t('Tools and colors'),
    body: t('Draw shapes and text, and pick the fill and stroke of the selection or of what you draw next.'),
  },
  {
    target: 'nav.effects',
    title: t('Effects'),
    body: t('Deform, repeat, animate, glitch… Each menu adds an effect to the selected object. The command line (/) finds any of them by name.'),
  },
  {
    target: '#inspector-panel-stack .stack',
    title: t('The stack'),
    body: t('Every object is its source plus a stack of effects, applied top to bottom. Reorder, switch off or remove them: nothing is destructive.'),
  },
  {
    target: '#inspector-panel-stack .properties',
    title: t('Properties'),
    body: t('The parameters of the selected object or effect. Drag a number to scrub it; ƒx turns a field into a formula that can read time, the mouse or other objects.'),
  },
  {
    target: 'section.layers',
    title: t('Layers'),
    body: t('The objects of the scene. The first one is drawn in front.'),
  },
  {
    target: '#inspector-tab-document',
    title: t('Document'),
    body: t('Size, background, duration, seed and the scene’s own variables.'),
  },
  {
    target: 'footer.status [data-tour="timeline"]',
    title: t('Timeline'),
    body: t('Keyframes for any parameter. Infinite time keeps procedural and interactive scenes running.'),
  },
  {
    target: '.toolbar .play-button',
    title: t('Play'),
    body: t('Full screen and interactive: the mouse, clicks and physics come alive here.'),
  },
  {
    target: '.sv-export-trigger',
    title: t('Export and share'),
    body: t('SVG, PNG, MP4, animated SVG or Lottie. Share link gives a short link that opens the scene.'),
  },
  {
    target: '.sv-app-trigger',
    title: t('The svertik menu'),
    body: t('New, open, save, the demos, keyboard shortcuts, and this tour whenever you want it again.'),
  },
];

/**
 * The step to show when moving from `from` by `dir` (+1 next, −1 back), skipping steps whose area is missing.
 * -1 when there is none that way (the tour ends going forward; going back it stays put).
 */
export function stepFrom(steps: readonly TourStep[], from: number, dir: 1 | -1, present: (step: TourStep) => boolean): number {
  for (let i = from + dir; i >= 0 && i < steps.length; i += dir) {
    if (present(steps[i]!)) return i;
  }
  return -1;
}

const SEEN_KEY = 'svertik.tour';

/** Whether this browser has already finished or skipped the tour (no storage: say yes, never nag). */
export function tourSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === 'done';
  } catch {
    return true;
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, 'done');
  } catch {
    /* no storage: nothing to remember */
  }
}

type Box = { left: number; top: number; width: number; height: number };

/**
 * Where the card goes next to the area, always inside the viewport with `margin` around. Tall areas (panels) get
 * it beside them (right, then left), short ones (buttons, bars) below or above, each falling back to the other.
 * An area that leaves no room anywhere (the canvas) gets the card over its top-right corner.
 */
export function placeCard(area: Box, card: { width: number; height: number }, view: { width: number; height: number }, gap = 12, margin = 12): { left: number; top: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const x = (left: number) => clamp(left, margin, view.width - card.width - margin);
  const y = (top: number) => clamp(top, margin, view.height - card.height - margin);
  const right = area.left + area.width + gap, left = area.left - gap - card.width;
  const below = area.top + area.height + gap, above = area.top - gap - card.height;
  const beside = [
    right + card.width + margin <= view.width && { left: right, top: y(area.top) },
    left >= margin && { left, top: y(area.top) },
  ];
  const across = [
    below + card.height + margin <= view.height && { left: x(area.left), top: below },
    above >= margin && { left: x(area.left), top: above },
  ];
  const order = area.height >= card.height / 2 ? [...beside, ...across] : [...across, ...beside];
  return order.find((spot) => !!spot) || { left: x(area.left + area.width - card.width - gap), top: y(area.top + gap) };
}
