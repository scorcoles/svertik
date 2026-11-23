import { expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Attributes from './Attributes.svelte';
import { Editor } from './editor.svelte';
import { PARTICLE_PRESETS } from './particle-presets';
import { builtins, createEngine } from '@svertik/engine';
it('presets produce distinct deterministic motion without replacing source artwork', () => {
  const engine = createEngine(builtins);
  const source = '<svg viewBox="0 0 20 10"><rect width="20" height="10" fill="#123456"/></svg>';
  const results = PARTICLE_PRESETS.map(p => engine.evaluateStack({ source, stack: [{ id:'p',type:'particles',params:{...p.params,time:2} }] }));
  expect(new Set(results.map(r=>JSON.stringify(r))).size).toBe(PARTICLE_PRESETS.length);
  expect(results.every(r=>r.shapes.length>0 && r.shapes.every(s=>s.style.fill==='#123456'))).toBe(true);
});
it('applying presets resets previous motion and preserves time, seed and emitter position in one undo step', async () => {
  const editor=new Editor();vi.spyOn(editor, 'saveToURL').mockResolvedValue();editor.addShape('rectangle',{width:20,height:10,fillColor:'#123456'});
  editor.add('particles',{time:{$expr:'scene.time * 2',fallback:0},seed:73,center:[.3,.7]});
  const before=JSON.stringify(editor.current!.params);
  const target=document.createElement('div');document.body.append(target);
  const component=mount(Attributes,{target,props:{editor,onreplace(){}}});flushSync();
  const click=(name:string)=>{[...target.querySelectorAll('button')].find(b=>b.textContent?.trim()===name)!.click();flushSync();};
  try {
    click('Swirl');expect(editor.current!.params!.swirl).toBe(150);
    click('Dust');expect(editor.current!.params!.swirl).toBe(0);
    expect(editor.current!.params!.time).toEqual({$expr:'scene.time * 2',fallback:0});
    expect(editor.current!.params!.seed).toBe(73);expect(editor.current!.params!.center).toEqual([.3,.7]);
    editor.undo();expect(editor.current!.params!.swirl).toBe(150);
    editor.undo();expect(JSON.stringify(editor.current!.params)).toBe(before);
  } finally {await unmount(component);target.remove();}
});
