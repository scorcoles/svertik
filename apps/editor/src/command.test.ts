import { describe, expect, it } from 'vitest';
import { autonomousGenerators, builtins, effectDescriptions, shapeDescriptions } from '@svertik/engine';
import { buildCatalog, compile, complete, familyColor, parse, pushRecent, RECENT_LIMIT, recentEntries, search } from './command';

const catalog = buildCatalog(builtins as never, autonomousGenerators as never, { ...effectDescriptions, ...shapeDescriptions });

describe('command line', () => {
  it('lists every built-in effect and autonomous generator, each with a description', () => {
    expect(catalog.length).toBe(builtins.length + autonomousGenerators.length);
    expect(catalog.filter((e) => !e.description)).toEqual([]);
  });

  it('finds effects by prefix, substring and loose spelling', () => {
    expect(search(catalog, 'twi')[0]?.type).toBe('twist');
    expect(search(catalog, 'Round')[0]?.type).toBe('roundcorners');
    expect(search(catalog, 'rndcrn').map((e) => e.type)).toContain('roundcorners');
    expect(search(catalog, 'zzzz')).toEqual([]);
  });

  it('finds effects by what they do, from a word of their description', () => {
    expect(search(catalog, 'duplicates').map((e) => e.type)).toContain('clone');
    expect(search(catalog, 'organic').map((e) => e.type)).toContain('noise');
    // A name match still comes before a description match.
    expect(search(catalog, 'noise')[0]?.type).toBe('noise');
    // Two letters are not enough to search descriptions.
    expect(search(catalog, 'du').map((e) => e.type)).not.toContain('clone');
  });

  it('remembers recent effects, newest first, without repeats', () => {
    let recent: string[] = [];
    for (const t of ['twist', 'clone', 'twist', 'noise']) recent = pushRecent(recent, t);
    expect(recent).toEqual(['noise', 'twist', 'clone']);
    for (let i = 0; i < 10; i++) recent = pushRecent(recent, `x${i}`);
    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(recentEntries(catalog, ['clone', 'gone', 'twist']).map((e) => e.type)).toEqual(['clone', 'twist']);
  });

  it('gives each effect family a colour token, and none to commands', () => {
    expect(familyColor('Deform')).toBe('var(--sv-family-deform)');
    expect(familyColor('Commands')).toBeUndefined();
  });

  it('accepts the effect with or without "add"', () => {
    expect(parse('add twist angle=4').name).toBe('twist');
    expect(parse('twist angle=4').name).toBe('twist');
    expect(parse('add').name).toBe('add');
    expect(parse('add ').verb).toBe(true);
  });

  it('compiles names and parameters with the JSON names', () => {
    const c = compile(catalog, 'add twist angle=45 radius=0.8');
    expect(c).toMatchObject({ ok: true, entry: { type: 'twist' }, params: { angle: 45, radius: 0.8 } });
    expect(compile(catalog, 'Round Corners')).toMatchObject({ ok: false });
    expect(compile(catalog, 'roundcorners')).toMatchObject({ ok: true, entry: { type: 'roundcorners' } });
  });

  it('names the problem and the fix', () => {
    expect(compile(catalog, 'nope')).toMatchObject({ ok: false, error: expect.stringContaining('No effect called "nope"') });
    expect(compile(catalog, 'twist spin=3')).toMatchObject({ ok: false, error: expect.stringContaining('no parameter "spin"') });
    expect(compile(catalog, 'twist angle=abc')).toMatchObject({ ok: false, error: expect.stringContaining('needs a number') });
    expect(compile(catalog, 'twist angle')).toMatchObject({ ok: false, error: expect.stringContaining('name=value') });
  });

  it('checks ranges and enum options', () => {
    const wave = catalog.find((e) => e.type === 'randomwave')!;
    expect(wave.autonomous).toBe(true);
    expect(compile(catalog, 'randomwave amplitude=2')).toMatchObject({ ok: false, error: expect.stringContaining('between 0 and 1') });
    expect(compile(catalog, 'randomwave waveform=SINE')).toMatchObject({ ok: true, params: { waveform: 'sine' } });
    expect(compile(catalog, 'randomwave waveform=blob')).toMatchObject({ ok: false, error: expect.stringContaining('one of') });
  });

  it('completes effect names, then parameter names', () => {
    expect(complete(catalog, 'twi', null)).toBe('twist ');
    expect(complete(catalog, 'add twi', null)).toBe('add twist ');
    expect(complete(catalog, 'twist ang', null)).toBe('twist angle=');
    expect(complete(catalog, 'twist angle=4', null)).toBeNull();
  });
});
