import { describe, expect, it } from 'vitest';
import { Editor } from './editor.svelte';
import { commandOf } from './console-commands';
import { signatureAt } from './formula-complete';

const editor = () => {
  const e = new Editor();
  e.openProject(JSON.stringify({ version: 1, animation: { duration: 10, loop: true, fps: 30, tracks: [] }, objects: [
    { kind: 'shape', id: 'ball', name: 'Esfera', shape: 'ellipse', params: { width: 80 }, stack: [{ id: 'tw', type: 'twist', params: { angle: 10 } }] },
  ] }));
  return e;
};
const run = (e: Editor, line: string) => { const c = commandOf(line); if (!c) throw new Error(`not a command: ${line}`); return c.def.run(c.args, e); };

describe('console commands', () => {
  it('are calls the formula language does not have; formulas stay formulas', () => {
    expect(commandOf('play()')?.def.name).toBe('play');
    expect(commandOf('step(1, 2)')).toBeNull();
    expect(commandOf('scene.time')).toBeNull();
  });
  it('drive playback and the playhead', () => {
    const e = editor();
    run(e, 'play()');
    expect(e.playing).toBe(true);
    run(e, 'goto(2 * 1.5)');
    expect(e.time).toBe(3);
    run(e, 'frame(45)');
    expect(e.time).toBe(1.5);
    run(e, 'stop()');
    expect([e.playing, e.time]).toEqual([false, 0]);
  });
  it('select and set by system name, objects and effects', () => {
    const e = editor();
    expect(run(e, 'select(esfera.twist)')).toMatchObject({ message: expect.any(String) });
    expect(e.selected).toBe('tw');
    run(e, 'set(esfera.twist.angle, 45)');
    run(e, 'set(scene.object.esfera.width, 120)');
    run(e, 'set(esfera.x, 10 + 5)');
    const ball = e.scene!.objects[0] as unknown as { params: Record<string, number>; transform: Record<string, number>; stack: { params: Record<string, number> }[] };
    expect([ball.stack[0]!.params.angle, ball.params.width, ball.transform.x]).toEqual([45, 120, 15]);
    expect(run(e, 'select(nadie)').error).toMatch(/nadie/);
    expect(run(e, 'objects()').message).toBe('esfera\nesfera.twist');
  });
});

describe('parameter help', () => {
  it('shows the call the caret is in and the argument being written', () => {
    expect(signatureAt('clamp(scene.time, ')).toMatchObject({ name: 'clamp', params: ['x', 'min', 'max'], active: 1 });
    expect(signatureAt('1 + scene.countDown(')).toMatchObject({ name: 'scene.countDown', params: ['seconds'], active: 0 });
    expect(signatureAt('max(1, sin(scene.time), ')).toMatchObject({ name: 'max', active: 1 });
    expect(signatureAt('clamp(sin(1), 0, 1) + ')).toBeNull();
    expect(signatureAt('goto(', { commands: [{ label: 'goto(seconds)', insert: 'goto(', detail: 'Move' }] })).toMatchObject({ params: ['seconds'], about: 'Move' });
  });
});
