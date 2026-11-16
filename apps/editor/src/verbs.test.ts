import { describe, expect, it } from 'vitest';
import { builtins } from '@svertik/engine';
import { completeParam, matchNames, matchVerbs, parseAssignments, parseTime, splitVerb } from './verbs';

const twist = builtins.find((d) => d.type === 'twist')!.params;
const ctx = { fps: 30, duration: 6, markers: [{ name: 'Impact', t: 2.5 }] };

describe('command line verbs', () => {
  it('recognises a verb only when followed by a space', () => {
    expect(splitVerb('set angle=4')).toEqual({ verb: 'set', rest: 'angle=4' });
    expect(splitVerb('GOTO 1')).toEqual({ verb: 'goto', rest: '1' });
    expect(splitVerb('set')).toBeNull();
    expect(splitVerb('add twist')).toBeNull();
    expect(splitVerb('twist angle=4')).toBeNull();
  });

  it('suggests verbs by prefix', () => {
    expect(matchVerbs('se').map((v) => v.verb)).toEqual(['set', 'select']);
    expect(matchVerbs('')).toEqual([]);
  });

  it('reads set and key arguments with the JSON names', () => {
    expect(parseAssignments('set', 'Angle=90', twist, 'Twist')).toMatchObject({ ok: true, values: { angle: 90 } });
    expect(parseAssignments('set', 'angle', twist, 'Twist')).toMatchObject({ ok: false, error: expect.stringContaining('name=value') });
    expect(parseAssignments('key', 'angle radius=0.5', twist, 'Twist')).toMatchObject({ ok: true, values: { radius: 0.5 }, bare: ['angle'] });
    expect(parseAssignments('key', '', twist, 'Twist')).toMatchObject({ ok: false, error: expect.stringContaining('key angle') });
    expect(parseAssignments('set', 'spin=1', twist, 'Twist')).toMatchObject({ ok: false, error: expect.stringContaining('no parameter "spin"') });
  });

  it('reads times in seconds, frames, start, end and markers', () => {
    expect(parseTime('1.5', ctx)).toEqual({ ok: true, t: 1.5 });
    expect(parseTime('2s', ctx)).toEqual({ ok: true, t: 2 });
    expect(parseTime('45f', ctx)).toEqual({ ok: true, t: 1.5 });
    expect(parseTime('end', ctx)).toEqual({ ok: true, t: 6 });
    expect(parseTime('99', ctx)).toEqual({ ok: true, t: 6 });
    expect(parseTime('impact', ctx)).toEqual({ ok: true, t: 2.5 });
    expect(parseTime('nowhere', ctx)).toMatchObject({ ok: false });
  });

  it('matches names exact, then prefix, then substring', () => {
    const items = [{ label: 'Watcher instance' }, { label: 'Moon' }, { label: 'Watcher' }];
    expect(matchNames(items, 'watcher').map((x) => x.label)).toEqual(['Watcher', 'Watcher instance']);
    expect(matchNames(items, 'oo').map((x) => x.label)).toEqual(['Moon']);
  });

  it('completes parameter names', () => {
    expect(completeParam('set', 'set ang', twist)).toBe('set angle=');
    expect(completeParam('key', 'key ang', twist)).toBe('key angle');
    expect(completeParam('set', 'set angle=4', twist)).toBeNull();
  });
});
