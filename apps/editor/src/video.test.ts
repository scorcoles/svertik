import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateScene, type SceneV1 } from '@svertik/engine';
import type { Engine } from '@svertik/engine/player';
import { downloadMP4 } from './video';

const encoder = vi.hoisted(() => ({
  supported: vi.fn(), add: vi.fn(), close: vi.fn(), start: vi.fn(), finalize: vi.fn(), cancel: vi.fn(),
}));
vi.mock('mediabunny', () => ({
  canEncodeVideo: encoder.supported,
  QUALITY_HIGH: {},
  BufferTarget: class { buffer = new ArrayBuffer(16); },
  Mp4OutputFormat: class {},
  CanvasSource: class { add = encoder.add; close = encoder.close; },
  Output: class {
    target: { buffer: ArrayBuffer };
    constructor(options: { target: { buffer: ArrayBuffer } }) { this.target = options.target; }
    addVideoTrack() {}
    start = encoder.start;
    finalize = encoder.finalize;
    cancel = encoder.cancel;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  encoder.supported.mockResolvedValue(true);
  encoder.cancel.mockResolvedValue(undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video-test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(), drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal('Image', class { src = ''; decode = async () => {}; });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const makeScene = (loop: boolean, autoplay: boolean): SceneV1 => ({
  version: 1,
  objects: [{ kind: 'shape', id: 'rect', name: 'Rectangle', shape: 'rectangle', params: {}, stack: [] }],
  animation: { duration: 2.05, fps: 2, loop, autoplay, tracks: [
    { id: 'rotation', node: 'rect', on: 'node', param: 'rotation', keys: [{ t: 0, value: 0 }, { t: 2.05, value: 90 }] },
  ] },
});
const render = () => vi.fn(() => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 101 99"></svg>');

describe('single-cycle MP4 export', () => {
  it.each([[true, true], [false, false]])('exports exactly one cycle (loop %s, autoplay %s)', async (loop, autoplay) => {
    const scene = makeScene(loop, autoplay);
    expect(validateScene(scene).errors).toEqual([]);
    const original = structuredClone(scene);
    const toSVG = render();
    await downloadMP4({ toSVG } as unknown as Engine, scene, { background: '#ffffff', name: 'Scene' });
    expect(encoder.add.mock.calls.map(call => call[0])).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(encoder.add.mock.calls.reduce((sum, call) => sum + call[1], 0)).toBeCloseTo(2.05, 8);
    expect(encoder.supported).toHaveBeenCalledWith('avc', expect.objectContaining({ width: 102, height: 100, frameRate: 2 }));
    expect(toSVG.mock.calls.map(call => (call as unknown as [SceneV1])[0].at)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(scene).toEqual(original);
    expect(encoder.finalize).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(encoder.close).toHaveBeenCalledOnce();
  });

  it('frames mobile video as the screen, with the scene at its visible size and position', async () => {
    await downloadMP4({ toSVG: render() } as unknown as Engine, makeScene(true, true), {
      background: '#fff', name: 'Mobile',
      viewport: { width: 390, height: 844, pixelRatio: 2, scene: { x: 15.6, y: 33.76, width: 358.8, height: 776.48 } },
    });
    expect(encoder.supported).toHaveBeenCalledWith('avc', expect.objectContaining({ width: 780, height: 1688 }));
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]![0] as Blob;
    const svg = await blob.text();
    expect(svg).toContain('viewBox="0 0 390 844"');
    expect(svg).toContain('x="15.6" y="33.76" width="358.8" height="776.48" overflow="visible"');
    expect(svg).toContain('viewBox="0 0 101 99"');
    expect(encoder.add.mock.calls.reduce((sum, call) => sum + call[1], 0)).toBeCloseTo(2.05, 8);
  });

  it('cancels without downloading a partial video', async () => {
    const controller = new AbortController();
    await expect(downloadMP4({ toSVG: render() } as unknown as Engine, makeScene(true, true), {
      background: '#fff', name: 'Scene', signal: controller.signal,
      onProgress: () => controller.abort(),
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(encoder.add).toHaveBeenCalledOnce();
    expect(encoder.cancel).toHaveBeenCalledOnce();
    expect(encoder.close).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it('reports an unsupported codec before starting an export', async () => {
    encoder.supported.mockResolvedValue(false);
    await expect(downloadMP4({ toSVG: render() } as unknown as Engine, makeScene(true, true), {
      background: '#fff', name: 'Scene',
    })).rejects.toThrow('MP4 export is not supported');
    expect(encoder.start).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });
});
