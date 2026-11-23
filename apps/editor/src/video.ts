import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeVideo } from 'mediabunny';
import { sampleScene, type Engine, type SceneV1 } from '@svertik/engine/player';
import { sceneDuration } from '@svertik/engine/scene';

interface VideoOptions {
  background: string;
  name: string;
  /** CSS viewport and scene bounds captured at export start (mobile Play). */
  viewport?: {
    width: number; height: number; pixelRatio: number;
    scene: { x: number; y: number; width: number; height: number };
  };
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

/** Render a single timeline cycle, independently of autoplay, loop and live interactions. */
export async function downloadMP4(engine: Engine, original: SceneV1, options: VideoOptions): Promise<void> {
  const scene = structuredClone(original);
  const duration = sceneDuration(scene);
  const fps = scene.animation?.fps ?? 30;
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(fps) || fps <= 0) {
    throw new Error('The scene needs a positive duration and frame rate.');
  }
  options.signal?.throwIfAborted();
  const frameAt = (t: number) => {
    const frame = sampleScene(scene, t);
    return engine.toSVG({ ...frame, at: t });
  };
  const first = frameAt(0);
  // Keep framing fixed for the whole clip, including auto-sized documents.
  const viewBox = /viewBox="([^"]+)"/.exec(first)?.[1];
  const dimensions = viewBox?.trim().split(/\s+/).map(Number);
  if (!dimensions || dimensions.length !== 4 || !dimensions.every(Number.isFinite)) throw new Error('Invalid video bounds.');
  const viewport = options.viewport;
  if (viewport && (![viewport.width, viewport.height, viewport.pixelRatio, viewport.scene.width, viewport.scene.height].every(n => Number.isFinite(n) && n > 0) ||
    ![viewport.scene.x, viewport.scene.y].every(Number.isFinite))) throw new Error('Invalid screen bounds.');
  const width = Math.max(2, Math.ceil((viewport ? viewport.width * viewport.pixelRatio : dimensions[2]!) / 2) * 2);
  const height = Math.max(2, Math.ceil((viewport ? viewport.height * viewport.pixelRatio : dimensions[3]!) / 2) * 2);
  if (!await canEncodeVideo('avc', { width, height, frameRate: fps, quality: QUALITY_HIGH })) {
    throw new Error('MP4 export is not supported in this browser. Try Chrome, Edge or Safari.');
  }
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY_HIGH });
  // Explicit durations allow the last frame to end exactly at the scene's duration.
  output.addVideoTrack(source);
  try {
    await output.start();
    const count = Math.ceil(duration * fps);
    for (let i = 0; i < count; i++) {
      options.signal?.throwIfAborted();
      const t = i / fps;
      let svg = (i === 0 ? first : frameAt(t)).replace(/viewBox="[^"]+"/, `viewBox="${viewBox}"`);
      if (viewport) {
        const rect = viewport.scene;
        // A nested SVG preserves the player's aspect-fit placement and visible overflow.
        const nested = svg.replace('<svg ', `<svg x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" overflow="visible" `);
        svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${viewport.width} ${viewport.height}">${nested}</svg>`;
      } else {
        svg = svg.replace('<svg ', `<svg width="${width}" height="${height}" `);
      }
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        ctx.fillStyle = options.background;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
      } finally {
        URL.revokeObjectURL(url);
      }
      await source.add(t, Math.min(1 / fps, duration - t));
      options.onProgress?.((i + 1) / count);
      // Yield for progress updates and cancellation, even when encoding is very fast.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    options.signal?.throwIfAborted();
    await output.finalize();
    options.signal?.throwIfAborted();
    if (!output.target.buffer) throw new Error('Could not encode the MP4.');
    const url = URL.createObjectURL(new Blob([output.target.buffer], { type: 'video/mp4' }));
    const link = Object.assign(document.createElement('a'), {
      href: url, download: `${options.name.replace(/[\\/:*?"<>|]/g, '_') || 'svertik'}.mp4`,
    });
    document.body.append(link);
    try { link.click(); } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally {
    source.close();
  }
}
