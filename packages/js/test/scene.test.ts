import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { builtins, createEngine, validateScene } from '@svertik/engine';
import { describe, expect, it } from 'vitest';
import { generate } from '../src/generate-source';
import { custom, ellipse, expose, fx, group, instance, layer, oscillate, rectangle, scene, spherize, star, transform } from '../src';

const engine = createEngine(builtins);

describe('svertikJS', () => {
  it('builds the example scene into a valid SceneV1', () => {
    const radius = expose('radius', 12, { label: 'Circle radius', min: 2, max: 40, step: 1 });
    const dots = ellipse('dots', { width: radius.times(2), height: radius.times(2), fill: '#ffffff' })
      .clone({ mode: 'grid', columns: 15, rows: 15, spacing: [3.3, 3.3] })
      .spherize({ radius: 0.6, strength: 0 }, (s) => s.to({ strength: 1, duration: 1, ease: 'power2.inOut', repeat: -1, yoyo: true }))
      .rigidPieces();
    const orbit = ellipse('orbit', { width: 8, height: 8, fill: '#ffcc00' })
      .clone({ mode: 'radial', count: 24, radius: 40 })
      .each({ width: fx`8 + sin(element.index / element.count * 2*pi * 3) * 4` })
      .to({ rotation: 360, duration: 12, ease: 'none', repeat: -1 });
    const { scene: s, warnings } = scene({ width: 800, height: 800, background: '#111111' }, dots, orbit).build();

    expect(warnings).toEqual([]);
    expect(validateScene(s, builtins).errors).toEqual([]);
    expect(s.document).toEqual({ width: 800, height: 800 });
    expect(s.background).toBe('#111111');
    expect(s.custom).toEqual({ radius: { value: 12, min: 2, max: 40, step: 1, label: 'Circle radius' } });

    const d = s.objects[0]!;
    expect(d).toMatchObject({ kind: 'shape', id: 'dots', name: 'dots', shape: 'ellipse' });
    expect((d as { params: Record<string, unknown> }).params).toMatchObject({
      width: { $expr: 'scene.custom.radius * 2', fallback: 24 }, fill: true, fillColor: '#ffffff',
    });
    expect(d.stack.map((m) => [m.id, m.type])).toEqual([['dots_clone', 'clone'], ['dots_spherize', 'spherize'], ['dots_rigidpieces', 'rigidpieces']]);

    // Each's values become a Shape for every copy.
    const each = s.objects[1]!.stack[1]!;
    expect(each).toMatchObject({ type: 'each', children: [{ type: 'shapevalues', params: { width: { $expr: '8 + sin(element.index / element.count * 2*pi * 3) * 4', fallback: 8 } } }] });

    // Yoyo forever: there and back, the way back mirrored, repeating; the scene loops.
    const strength = s.animation!.tracks.find((t) => t.param === 'strength')!;
    expect(strength).toMatchObject({ node: 'dots', on: 'modifier', modifier: 'dots_spherize', repeat: 0 });
    expect(strength.keys).toEqual([{ t: 0, value: 0, ease: 'ease-in-out' }, { t: 1, value: 1, ease: 'ease-in-out' }, { t: 2, value: 0 }]);
    const rotation = s.animation!.tracks.find((t) => t.param === 'rotation')!;
    expect(rotation).toMatchObject({ node: 'orbit', on: 'node', repeat: 0, keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 12, value: 360 }] });
    expect(s.animation).toMatchObject({ duration: 12, loop: true });

    expect(engine.toSVG(s)).toContain('<path');
  });

  it('gives readable ids, unique across objects and effects', () => {
    const { scene: s } = scene({}, star().twist().twist(), star({ fill: 'none', stroke: '#000' }), group('g', rectangle())).build();
    expect(s.objects.map((o) => o.id)).toEqual(['star', 'star_2', 'g']);
    expect(s.objects[0]!.stack.map((m) => m.id)).toEqual(['star_twist', 'star_twist_2']);
    expect((s.objects[1] as { params: Record<string, unknown> }).params).toMatchObject({ fill: false, stroke: true, strokeColor: '#000' });
    expect((s.objects[2] as { children: { id: string }[] }).children[0]!.id).toBe('rectangle');
  });

  it('turns references into ids and declares the variables formulas read', () => {
    const speed = custom('speed', 40);
    const spin = custom('spin', fx`${speed} * 2`);
    const src = star('src').set({ visible: false });
    const copy = instance('copy', { of: src }).set({ rotation: fx`scene.time * ${spin}` });
    const { scene: s } = scene({}, copy, src).build();
    expect(s.objects[0]).toMatchObject({ kind: 'instance', of: 'src', transform: { rotation: { $expr: 'scene.time * scene.custom.spin', fallback: 0 } } });
    expect(s.custom).toEqual({ spin: { $expr: 'scene.custom.speed * 2', fallback: 80 }, speed: 40 });
    expect(validateScene(s, builtins).errors).toEqual([]);
  });

  it('tweens: from, fromTo, delays, repeats and ease names', () => {
    const box = rectangle('box', { fill: '#ff0000' })
      .from({ opacity: 0, scale: 0.5, duration: 0.6 })
      .fromTo({ fill: '#ff0000' }, { fill: '#0000ff', duration: 1, delay: 1, ease: 'back.out', repeat: 2, repeatDelay: 0.5 });
    const { scene: s, warnings } = scene({}, box).build();
    const track = (p: string) => s.animation!.tracks.find((t) => t.param === p)!;
    expect(track('opacity').keys).toEqual([{ t: 0, value: 0, ease: 'cubic-bezier(0.5, 1, 0.89, 1)' }, { t: 0.6, value: 1 }]);
    expect(track('scale').keys[1]).toEqual({ t: 0.6, value: 1 });
    expect(track('fillColor')).toMatchObject({ on: 'shape', repeat: 3, every: 1.5, keys: [{ t: 1, value: '#ff0000', ease: 'back-out' }, { t: 2, value: '#0000ff' }] });
    expect(s.animation!.duration).toBe(5);
    expect(s.animation!.loop).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it('chains tweens on one property into one track', () => {
    const { scene: s } = scene({}, star('s').to({ x: 100, duration: 1 }).to({ x: 0, duration: 1, delay: 1 })).build();
    const x = s.animation!.tracks[0]!;
    expect(x.keys.map((k) => [k.t, k.value])).toEqual([[0, 0], [1, 100], [2, 0]]);
  });

  it('nests effects in effectors, and refuses an effector inside another', () => {
    const { scene: s } = scene({}, star('s').stagger({ stagger: 0.2 }, transform({ y: -20 }))).build();
    expect(s.objects[0]!.stack[0]).toMatchObject({ type: 'stagger', children: [{ id: 's_transform', type: 'transform', params: { y: -20 } }] });
    expect(() => star().stagger({}, oscillate())).toThrow(/effector/);
    expect(() => star().twist({}, spherize())).toThrow(/nested/);
  });

  it('layers: all or none at the top', () => {
    expect(() => scene({}, layer('A', star()), star()).build()).toThrow(/layer/);
    const { scene: s } = scene({}, layer('Front', star()), layer('Back', rectangle())).build();
    expect(s.objects[0]).toMatchObject({ kind: 'group', layer: true, name: 'Front', id: 'front' });
  });

  it('generated.ts matches the engine (run `pnpm --filter @svertik/js generate`)', () => {
    expect(readFileSync(join(import.meta.dirname, '../src/generated.ts'), 'utf8')).toBe(generate());
  });
});
