<script lang="ts">
  import { Popover } from 'bits-ui';
  import ColorField from './ColorField.svelte';
  import ColorPicker from './ColorPicker.svelte';
  import NumberField from './NumberField.svelte';
  import ParamRow from './ParamRow.svelte';
  import Select from './Select.svelte';
  import Segmented from './Segmented.svelte';

  type Stop = { offset: number; color: string; opacity?: number };
  type GradientValue = {
    kind: 'linear' | 'radial';
    stops: Stop[];
    x1?: number; y1?: number; x2?: number; y2?: number;
    cx?: number; cy?: number; r?: number; fx?: number; fy?: number; fr?: number;
    spreadMethod?: 'pad' | 'reflect' | 'repeat';
    gradientUnits?: 'objectBoundingBox' | 'userSpaceOnUse';
    gradientTransform?: string;
  };

  interface Props {
    value: string | GradientValue | undefined;
    label?: string;
    id?: string;
    onchange?: (value: string | GradientValue) => void;
    swatches?: string[];
    compact?: boolean;
  }
  let { value = $bindable(), label, id, onchange, swatches = [], compact = false }: Props = $props();

  const isGradient = (v: unknown): v is GradientValue => !!v && typeof v === 'object' && ((v as any).kind === 'linear' || (v as any).kind === 'radial') && Array.isArray((v as any).stops);
  const solid = $derived(typeof value === 'string' ? value : '#d9d9d9');
  const grad = $derived(isGradient(value) ? value : null);

  function emit(v: string | GradientValue) {
    value = v;
    onchange?.(v);
  }

  function toSolid() { emit(solid); }
  function toGradient(kind: 'linear' | 'radial' = 'linear') {
    const base = grad ?? { kind, stops: [{ offset: 0, color: solid }, { offset: 1, color: '#5c3cff' }] };
    if (kind === 'linear') emit({ ...base, kind: 'linear', x1: base.x1 ?? 0, y1: base.y1 ?? 0.5, x2: base.x2 ?? 1, y2: base.y2 ?? 0.5 });
    else emit({ ...base, kind: 'radial', cx: base.cx ?? 0.5, cy: base.cy ?? 0.5, r: base.r ?? 0.5, fx: base.fx ?? base.cx ?? 0.5, fy: base.fy ?? base.cy ?? 0.5 });
  }

  const cssPreview = $derived.by(() => {
    if (!grad) return solid;
    const stops = [...grad.stops].sort((a, b) => a.offset - b.offset).map((s) => {
      const c = s.color ?? '#000';
      const o = s.opacity ?? 1;
      return `${hexWithAlpha(c, o)} ${Math.round((s.offset ?? 0) * 100)}%`;
    }).join(', ');
    if (grad.kind === 'linear') {
      const a = angleOf(grad);
      return `linear-gradient(${a}deg, ${stops})`;
    }
    return `radial-gradient(circle at ${(grad.cx ?? 0.5) * 100}% ${(grad.cy ?? 0.5) * 100}%, ${stops})`;
  });

  function hexWithAlpha(color: string, opacity: number) {
    if (opacity >= 1) return color;
    const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
    if (!m) return color;
    const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0');
    return `#${m[1]}${a}`;
  }

  function angleOf(g: GradientValue) {
    const x1 = g.x1 ?? 0, y1 = g.y1 ?? 0, x2 = g.x2 ?? 1, y2 = g.y2 ?? 0;
    // CSS linear-gradient angle: 0deg = up, 90deg = right; SVG vector direction
    const deg = (Math.atan2(x2 - x1, y1 - y2) * 180) / Math.PI;
    return Math.round(((deg % 360) + 360) % 360);
  }
  function setAngle(deg: number) {
    if (!grad || grad.kind !== 'linear') return;
    const rad = ((deg - 90) * Math.PI) / 180;
    const dx = Math.cos(rad) / 2, dy = Math.sin(rad) / 2;
    const r = (n: number) => Math.round((0.5 + n) * 1000) / 1000;
    emit({ ...grad, x1: r(-dx), y1: r(-dy), x2: r(dx), y2: r(dy) });
  }

  function updateGrad(patch: Partial<GradientValue>) { if (grad) emit({ ...grad, ...patch }); }
  function setStop(i: number, patch: Partial<Stop>) {
    if (!grad) return;
    const stops = grad.stops.map((s, j) => j === i ? { ...s, ...patch } : s);
    emit({ ...grad, stops });
  }
  function addStop() {
    if (!grad) return;
    const stops = [...grad.stops].sort((a,b)=>a.offset-b.offset);
    const mid = stops.length >= 2 ? (stops[0]!.offset + stops[stops.length-1]!.offset) / 2 : 0.5;
    emit({ ...grad, stops: [...grad.stops, { offset: Math.round(mid*100)/100, color: '#ffffff' }] });
  }
  function removeStop(i: number) {
    if (!grad || grad.stops.length <= 2) return;
    emit({ ...grad, stops: grad.stops.filter((_, j) => j !== i) });
  }

  let open = $state(false);
</script>

<div class="sv-paint" data-compact={compact || undefined}>
  <Popover.Root bind:open>
    <Popover.Trigger class="swatch" style="background: {cssPreview}" aria-label={label ? `${label} paint` : 'Paint'} />
    <Popover.Portal>
      <Popover.Content class="popover" side="bottom" align="start" sideOffset={4}>
        <div class="modes">
          <Segmented value={grad ? grad.kind : 'solid'} label="Paint" options={[{value:'solid',label:'Solid'},{value:'linear',label:'Linear'},{value:'radial',label:'Radial'}]} onchange={(v) => v === 'solid' ? toSolid() : toGradient(v as 'linear'|'radial')} />
        </div>
        {#if !grad}
          <div class="solid">
            <ColorPicker value={solid} onchange={emit} />
            <ColorField value={solid} label={label} {swatches} onchange={emit} />
          </div>
        {:else}
          <div class="gedit">
            {#if grad.kind === 'linear'}
              <ParamRow label="Angle">
                <NumberField value={angleOf(grad)} step={1} unit="°" onchange={setAngle} />
              </ParamRow>
            {:else}
              <ParamRow label="Center">
                <NumberField value={grad.cx ?? 0.5} step={0.01} min={0} max={1} onchange={(v)=>updateGrad({cx:v})} />
                <NumberField value={grad.cy ?? 0.5} step={0.01} min={0} max={1} onchange={(v)=>updateGrad({cy:v})} />
              </ParamRow>
              <ParamRow label="Radius">
                <NumberField value={grad.r ?? 0.5} step={0.01} min={0} max={2} onchange={(v)=>updateGrad({r:v})} />
              </ParamRow>
              <ParamRow label="Focus">
                <NumberField value={grad.fx ?? grad.cx ?? 0.5} step={0.01} min={0} max={1} onchange={(v)=>updateGrad({fx:v})} />
                <NumberField value={grad.fy ?? grad.cy ?? 0.5} step={0.01} min={0} max={1} onchange={(v)=>updateGrad({fy:v})} />
              </ParamRow>
            {/if}
            <ParamRow label="Spread">
              <Select value={grad.spreadMethod ?? 'pad'} options={['pad','reflect','repeat']} label="Spread" onchange={(v)=>updateGrad({spreadMethod: v as any})} />
            </ParamRow>
            <div class="stops">
              <div class="stops-head"><span>Stops</span><button type="button" class="add" onclick={addStop}>+ Add</button></div>
              {#each grad.stops as stop, i (i)}
                <div class="stop">
                  <input class="off" type="number" min="0" max="1" step="0.01" value={stop.offset} aria-label="Offset" onchange={(e)=>setStop(i,{offset: Number(e.currentTarget.value)})} />
                  <ColorField value={stop.color} label="Stop color" {swatches} onchange={(v)=>setStop(i,{color:v})} />
                  <input class="op" type="number" min="0" max="1" step="0.01" value={stop.opacity ?? 1} aria-label="Opacity" onchange={(e)=>setStop(i,{opacity: Number(e.currentTarget.value)})} />
                  <button type="button" class="del" disabled={grad.stops.length<=2} onclick={()=>removeStop(i)}>×</button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
  {#if !compact}
    {#if grad}
      <span class="label">{grad.kind} gradient</span>
    {:else}
      <span class="label">{solid.toUpperCase()}</span>
    {/if}
  {/if}
</div>

<style>
  .sv-paint { display:flex; align-items:center; gap: var(--sv-space-6); width: 120px; height: 20px; padding: 0 var(--sv-space-6) 0 3px; background: var(--sv-surface-field); border: var(--sv-border-1) solid var(--sv-rule-default); }
  .sv-paint:hover { border-color: var(--sv-rule-strong); }
  .sv-paint[data-compact] { width: auto; padding: 3px; }
  :global(.sv-paint .swatch) { flex:none; width:12px; height:12px; padding:0; border:0; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.15); cursor:pointer; }
  .label { flex:1; min-width:0; font-size: var(--sv-font-size-10); color: var(--sv-text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  :global(.sv-paint .popover) { z-index:50; width: 260px; padding: var(--sv-space-6); background: var(--sv-surface-panel); border: var(--sv-border-1) solid var(--sv-rule-strong); font-size: var(--sv-font-size-10); display:grid; gap: var(--sv-space-6); }
  .modes :global(.sv-segmented) { width: 100%; }
  .solid { display:grid; gap: var(--sv-space-6); }
  .gedit { display:grid; gap: 4px; }
  .stops { display:grid; gap: 4px; margin-top: 4px; }
  .stops-head { display:flex; justify-content:space-between; align-items:center; color: var(--sv-text-muted); }
  .add, .del { font: inherit; color: var(--sv-text-secondary); background: none; border: 1px solid var(--sv-rule-default); padding: 0 6px; height: 18px; cursor:pointer; }
  .del:disabled { opacity: .4; cursor: default; }
  .stop { display:grid; grid-template-columns: 44px 1fr 40px 20px; gap: 4px; align-items:center; }
  .off, .op { width: 100%; height: 18px; padding: 0 4px; font: inherit; color: var(--sv-text-primary); background: var(--sv-surface-field); border: var(--sv-border-1) solid var(--sv-rule-default); box-sizing: border-box; }
  .stop :global(.sv-color) { width: auto; min-width: 0; }
</style>
