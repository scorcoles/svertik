import { describe, expect, it } from 'vitest';
import { validateScene } from '../src';

const base = () => ({
  version: 2,
  objects: [
    {
      kind: 'shape', id: 'a', name: 'A', shape: 'ellipse', params: { width: 10 },
      stack: [{ id: 'm', type: 'morph', params: { target: 'b', amount: 0 } }],
    },
    { kind: 'shape', id: 'b', name: 'B', shape: 'star', params: {}, stack: [] },
  ],
  animation: { duration: 1, tracks: [{ id: 't', node: 'a', on: 'modifier', modifier: 'm', param: 'amount', keys: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }] },
}) as any;

describe('validateScene', () => {
  it('una escena correcta: ni errores ni avisos', () => {
    expect(validateScene(base())).toEqual({ errors: [], warnings: [] });
  });

  it('errores: lo que impide usarla', () => {
    expect(validateScene(null).errors).toHaveLength(1);
    expect(validateScene({ version: 1, objects: [] }).errors).toEqual(['version must be 2']);
    const s = base();
    s.objects[0].stack[0].type = 'nope';
    s.objects[1].shape = 'blob';
    expect(validateScene(s).errors).toEqual(['"A": unknown modifier "nope"', '"B": unknown shape "blob"']);
  });

  it('avisos: parámetros mal escritos y referencias a nada', () => {
    const s = base();
    s.objects[0].params.widht = 3;
    s.objects[0].stack[0].params.amout = 1;
    s.objects[0].stack[0].params.target = 'zzz';
    const w = validateScene(s).warnings;
    expect(w).toContain('"A": unknown parameter "widht"');
    expect(w).toContain('"A" › Morph (m): unknown parameter "amout"');
    expect(w).toContain('"A" › Morph (m): "target" points to "zzz", which does not exist');
  });

  it('avisos: pistas que no apuntan a nada', () => {
    const s = base();
    s.animation.tracks.push(
      { id: 'x1', node: 'ghost', on: 'node', param: 'x', keys: [{ t: 0, value: 0 }] },
      { id: 'x2', node: 'a', on: 'modifier', modifier: 'nope', param: 'amount', keys: [{ t: 0, value: 0 }] },
      { id: 'x3', node: 'a', on: 'modifier', modifier: 'm', param: 'amout', keys: [{ t: 0, value: 0 }] },
      { id: 'x4', node: 'b', on: 'modifier', modifier: 'm', param: 'amount', keys: [{ t: 0, value: 0 }] },
      { id: 'x5', node: 'a', on: 'node', param: 'skew', keys: [{ t: 0, value: 0 }] },
      { id: 'x6', node: 'b', on: 'shape', param: 'points', keys: [{ t: 0, value: 5 }] },
    );
    const w = validateScene(s).warnings;
    expect(w).toHaveLength(5);
    expect(w[0]).toContain('object "ghost" does not exist');
    expect(w[1]).toContain('modifier "nope" does not exist');
    expect(w[2]).toContain('Morph has no parameter "amout"');
    expect(w[3]).toContain('belongs to "A", not to "B"');
    expect(w[4]).toContain('cannot animate "skew"');
  });

  it('avisos: ids repetidos', () => {
    const s = base();
    s.objects[1].id = 'a';
    expect(validateScene(s).warnings).toContain('Object id "a" is used more than once');
  });
});
