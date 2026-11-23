import { expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { pathPoint, type PathContour, type ShapeNode } from '@svertik/engine';
import { Editor } from './editor.svelte';
import PathEdit from './PathEdit.svelte';
import TextFxPanel from './TextFxPanel.svelte';

it('changes node modes, inserts curve handles, nudges and deletes points without removing the path object', async () => {
  const editor = new Editor();
  editor.addShape('path', { contours: [{ closed: false, points: [pathPoint(0, 0), pathPoint(100, 0), pathPoint(200, 50)] }] });
  const node = editor.currentNode as ShapeNode;
  editor.editingPath = node.id;
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(PathEdit, { target, props: { editor, node, info: { id: node.id, kind: 'shape', bounds: { x: 0, y: 0, width: 200, height: 50 }, box: { x: 0, y: 0, width: 200, height: 50 }, matrix: [1,0,0,1,0,0] }, docToStage: (x, y) => [x,y], clientToDoc: (x, y) => [x,y] } });
  flushSync();
  try {
    const point = target.querySelector<SVGElement>('.point')!;
    point.dispatchEvent(new FocusEvent('focus')); flushSync();
    const button = (text: string) => [...target.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === text)!;
    button('Symmetric point').click(); flushSync();
    expect((node.params.contours as PathContour[])[0]!.points[0]!.mode).toBe('symmetric');
    expect(target.querySelectorAll('.handle')).toHaveLength(2);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })); flushSync();
    expect((node.params.contours as PathContour[])[0]!.points[0]!.point).toEqual([10,0]);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); flushSync();
    expect(editor.currentNode?.id).toBe(node.id);
    expect((node.params.contours as PathContour[])[0]!.points).toHaveLength(2);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(editor.editingPath).toBeNull();
    editor.startPointEditing(node.id);
    target.querySelector('.background')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(editor.editingPath).toBeNull(); expect(editor.tool).toBeNull();
  } finally { await unmount(component); target.remove(); }
});

it('Text ƒx inserts a selected preset into the template and retains undo history', async () => {
  const editor = new Editor(); editor.addShape('text', { text: 'Hello world' });
  const node = editor.currentNode as ShapeNode;
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(TextFxPanel, { target, props: { editor, node } }); flushSync();
  try {
    const field = target.querySelector('textarea')!;
    field.setSelectionRange(6,11);
    [...target.querySelectorAll('button')].find(b => b.textContent === 'Time')!.click(); flushSync();
    expect(node.params.text).toBe('Hello {{fixed(scene.time, 2)}}');
    editor.flush(); editor.undo();
    expect((editor.currentNode as ShapeNode).params.text).toBe('Hello world');
  } finally { await unmount(component); target.remove(); vi.restoreAllMocks(); }
});

import Tools from './Tools.svelte';
import NodeAttributes from './NodeAttributes.svelte';
it('keeps text content out of the inspector and puts dynamic Update rate after every other property', async () => {
  const editor = new Editor(); editor.addShape('text', { text: '{{scene.time}}' });
  const node = editor.currentNode!;
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(NodeAttributes, { target, props: { editor, node, onreplace() {} } }); flushSync();
  try {
    expect(target.querySelector('textarea')).toBeNull();
    const text = target.textContent!;
    expect(text.indexOf('Text layout')).toBeGreaterThan(text.indexOf('Font'));
    expect(text.indexOf('Dynamic text')).toBeGreaterThan(text.indexOf('Text layout'));
    expect(text.lastIndexOf('Update rate')).toBeGreaterThan(text.lastIndexOf('Remove'));
    expect([...target.querySelectorAll('button')].some(b => b.textContent === 'Edit text')).toBe(false);
    [...target.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Text ƒx')!.click();
    expect(editor.textFxNode).toBe(node.id);
  } finally { await unmount(component); target.remove(); }
});


it('converts evaluated dynamic text to editable plain text and restores it with Undo', () => {
  const editor = new Editor(); editor.addShape('text', { text: 'Time {{fixed(scene.time, 2)}}', anchor: 'ink' });
  const id = editor.selected!; editor.setTime(1.5);
  expect(editor.convertTextToPlain(id)).toBe(true);
  expect((editor.currentNode as ShapeNode).params.text).toBe('Time 1.50');
  expect((editor.currentNode as ShapeNode).params.anchor).toBe('left');
  editor.undo(); expect((editor.currentNode as ShapeNode).params.text).toBe('Time {{fixed(scene.time, 2)}}');
});

it('Text ƒx exposes the Notes controls for zoom, copy, maximize and close', async () => {
  const editor = new Editor(); editor.addShape('text', { text: '{{scene.frame}}' }); editor.setTextZoom(100);
  const node = editor.currentNode as ShapeNode;
  editor.textFxNode = node.id;
  const oncopy = vi.fn(() => true), onmaximize = vi.fn(), onclose = vi.fn();
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(TextFxPanel, { target, props: { editor, node, oncopy, onmaximize, onclose } }); flushSync();
  try {
    target.querySelector<HTMLButtonElement>('[aria-label="Increase text size"]')!.click(); flushSync();
    expect(editor.textZoom).toBe(110);
    expect(target.querySelector('textarea')!.style.fontSize).toBe('12.1px');
    target.querySelector<HTMLButtonElement>('[aria-label="Copy text template"]')!.click();
    expect(oncopy).toHaveBeenCalledWith('{{scene.frame}}', 'Text template');
    target.querySelector<HTMLButtonElement>('[aria-label="Use all available space for text expressions"]')!.click();
    expect(onmaximize).toHaveBeenCalledOnce();
    target.querySelector<HTMLButtonElement>('[aria-label="Close text expressions"]')!.click();
    expect(onclose).toHaveBeenCalledOnce(); expect(editor.textFxNode).toBeNull();
  } finally { await unmount(component); target.remove(); }
});


it('places the point editing tool below Select and activates the selected Path', async () => {
  const editor = new Editor(); editor.addShape('path');
  const id = editor.selected;
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(Tools, { target, props: { editor } }); flushSync();
  try {
    const buttons = [...target.querySelectorAll('button')];
    expect(buttons[0]!.getAttribute('aria-label')).toMatch(/^Select/);
    expect(buttons[1]!.getAttribute('aria-label')).toMatch(/^Edit points/);
    buttons[1]!.click(); flushSync();
    expect(editor.tool).toBe('nodes'); expect(editor.editingPath).toBe(id);
    buttons[0]!.click(); flushSync();
    expect(editor.tool).toBeNull(); expect(editor.editingPath).toBeNull();
  } finally { await unmount(component); target.remove(); }
});

it('marquee-selects anchors, moves them together, inserts on a segment and reacts to viewport scaling', async () => {
  const editor = new Editor(); editor.addShape('path', { contours: [{ closed: false, points: [pathPoint(20,20), pathPoint(60,20), pathPoint(100,80)] }] }); editor.setTextZoom(100);
  const node = editor.currentNode as ShapeNode;
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(PathEdit, { target, props: { editor, node, info: { id: node.id, kind: 'shape', bounds: { x: 20,y:20,width:80,height:60 }, box: { x:20,y:20,width:80,height:60 }, matrix:[1,0,0,1,0,0] }, get stageMatrix(): [number,number,number,number,number,number] { const z = editor.textZoom / 100; return [z,0,0,z,0,0]; }, docToStage: (x,y) => [x,y], clientToDoc: (x,y) => [x,y] } }); flushSync();
  try {
    const svg = target.querySelector<SVGSVGElement>('.path-editor')!; svg.setPointerCapture = vi.fn();
    target.querySelector('.background')!.dispatchEvent(new PointerEvent('pointerdown', { button:0, pointerId:1, clientX:10,clientY:10,bubbles:true }));
    svg.dispatchEvent(new PointerEvent('pointermove', { pointerId:1,clientX:70,clientY:30,bubbles:true })); flushSync();
    svg.dispatchEvent(new PointerEvent('pointerup', { pointerId:1,clientX:70,clientY:30,bubbles:true })); flushSync();
    expect(target.querySelectorAll('.point[data-selected]')).toHaveLength(2);
    const point = target.querySelector<SVGElement>('.point')!; point.setPointerCapture = vi.fn();
    point.dispatchEvent(new PointerEvent('pointerdown', { button:0,pointerId:2,clientX:20,clientY:20,bubbles:true }));
    point.dispatchEvent(new PointerEvent('pointermove', { pointerId:2,clientX:30,clientY:25,bubbles:true }));
    point.dispatchEvent(new PointerEvent('pointerup', { pointerId:2,clientX:30,clientY:25,bubbles:true })); flushSync();
    expect((node.params.contours as PathContour[])[0]!.points.map(p => p.point)).toEqual([[30,25],[70,25],[100,80]]);
    const before = target.querySelector('.segment')!.getAttribute('d');
    editor.setTextZoom(150); flushSync();
    expect(target.querySelector('.point')!.getAttribute('x')).toBe('40');
    expect(target.querySelector('.segment')!.getAttribute('d')).not.toBe(before);
    target.querySelector('.segment-hit')!.dispatchEvent(new MouseEvent('dblclick', { clientX:75,clientY:37.5,bubbles:true })); flushSync();
    expect((node.params.contours as PathContour[])[0]!.points).toHaveLength(4);
    expect(editor.selected).toBe(node.id);
  } finally { await unmount(component); target.remove(); }
});

it('Alt-click adds or updates a position key and keeps it attached to its point after insertion', async () => {
  const editor = new Editor(); editor.addShape('path', { contours: [{ closed:false, points:[pathPoint(0,0),pathPoint(100,0)] }] }); editor.startPointEditing();
  const node = editor.currentNode as ShapeNode;
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(PathEdit, { target, props: { editor,node,info:{id:node.id,kind:'shape',bounds:{x:0,y:0,width:100,height:1},box:{x:0,y:0,width:100,height:1},matrix:[1,0,0,1,0,0]},docToStage:(x,y)=>[x,y],clientToDoc:(x,y)=>[x,y] } }); flushSync();
  try {
    const alt = () => { target.querySelector('.point')!.dispatchEvent(new PointerEvent('pointerdown',{button:0,altKey:true,bubbles:true})); flushSync(); };
    alt(); expect(editor.animation!.tracks).toHaveLength(1);
    const param = editor.animation!.tracks[0]!.param;
    alt(); expect(editor.animation!.tracks[0]!.keys).toHaveLength(1);
    editor.setTime(1);
    const next = JSON.parse(JSON.stringify(node.params.contours)) as PathContour[];
    next[0]!.points[0]!.point = [50,80]; editor.setShapeParam(node.id,'contours',next); flushSync();
    alt(); expect(editor.animation!.tracks[0]!.keys).toHaveLength(2);
    editor.setTime(.5);
    expect((node.params.contours as PathContour[])[0]!.points[0]!.point).toEqual([25,40]);
    expect(editor.animation!.tracks[0]!.param).toBe(param);
  } finally { await unmount(component); target.remove(); }
});
