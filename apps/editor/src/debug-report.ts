import type { SceneNode, SceneV2 } from '@svertik/engine';

export interface SvgComplexity {
  bytes: number;
  elements: number;
  paths: number;
  pathCommands: number;
  pathDataBytes: number;
  images: number;
  embeddedImages: number;
  externalImageReferences: number;
  filters: number;
  masks: number;
  clipPaths: number;
  gradients: number;
  uses: number;
  scripts: number;
  foreignObjects: number;
  analysisSkipped: boolean;
}

export interface SceneComplexity {
  nodes: number;
  byKind: Record<string, number>;
  maximumDepth: number;
  modifiers: number;
  modifiersByType: Record<string, number>;
  animationTracks: number;
  keyframes: number;
  textShapes: number;
  textCharacters: number;
  importedSvgs: number;
  importedSvgBytes: number;
  svgElements: number;
  svgPaths: number;
  svgPathCommands: number;
  svgImages: number;
}

const byteLength = (text: string) => new Blob([text]).size;
const countMatches = (source: string, pattern: RegExp) => {
  let count = 0;
  for (const _ of source.matchAll(pattern)) count++;
  return count;
};
const countTags = (source: string, tag: string) => countMatches(source, new RegExp(`<${tag}\\b`, 'gi'));

/** Fast, non-rendering SVG inspection. It records structure only, never source content or URLs. */
export function inspectSvgComplexity(source: string): SvgComplexity {
  const bytes = byteLength(source);
  // Never let the diagnostic scan compound a stall caused by an unusually large file.
  if (bytes > 20 * 1024 * 1024) return {
    bytes, elements: 0, paths: 0, pathCommands: 0, pathDataBytes: 0, images: 0,
    embeddedImages: 0, externalImageReferences: 0, filters: 0, masks: 0,
    clipPaths: 0, gradients: 0, uses: 0, scripts: 0, foreignObjects: 0, analysisSkipped: true,
  };
  const clean = source.replace(/<!--[\s\S]*?-->/g, '');
  let paths = 0, pathCommands = 0, pathDataBytes = 0;
  for (const match of clean.matchAll(/<path\b([^>]*)>/gi)) {
    const d = /\bd\s*=\s*(["'])([\s\S]*?)\1/i.exec(match[1] ?? '')?.[2];
    if (d === undefined) continue;
    paths++;
    pathDataBytes += byteLength(d);
    pathCommands += (d.match(/[MmZzLlHhVvCcSsQqTtAa]/g) ?? []).length;
  }
  const imageTags = clean.matchAll(/<(?:image|feImage)\b([^>]*)>/gi);
  let embeddedImages = 0, externalImageReferences = 0;
  let images = 0;
  for (const match of imageTags) {
    images++;
    const href = /\b(?:href|xlink:href)\s*=\s*(["'])([\s\S]*?)\1/i.exec(match[1] ?? '')?.[2]?.trim();
    if (!href) continue;
    if (/^data:/i.test(href)) embeddedImages++;
    else if (!href.startsWith('#')) externalImageReferences++;
  }
  return {
    bytes,
    elements: countMatches(clean, /<([A-Za-z_][\w:.-]*)(?=[\s/>])/g),
    paths,
    pathCommands,
    pathDataBytes,
    images,
    embeddedImages,
    externalImageReferences,
    filters: countTags(clean, 'filter'),
    masks: countTags(clean, 'mask'),
    clipPaths: countTags(clean, 'clipPath'),
    gradients: countTags(clean, 'linearGradient') + countTags(clean, 'radialGradient'),
    uses: countTags(clean, 'use'),
    scripts: countTags(clean, 'script'),
    foreignObjects: countTags(clean, 'foreignObject'),
    analysisSkipped: false,
  };
}

export function svgComplexityWarnings(svg: SvgComplexity): string[] {
  const warnings: string[] = [];
  if (svg.analysisSkipped) warnings.push(`SVG structural scan skipped above 20 MB to avoid blocking the editor (file size: ${formatBytes(svg.bytes)}).`);
  if (svg.bytes > 5 * 1024 * 1024) warnings.push(`SVG source is large (${formatBytes(svg.bytes)}; warning threshold: 5 MB).`);
  if (svg.elements > 5000) warnings.push(`SVG contains ${svg.elements.toLocaleString()} elements (warning threshold: 5,000).`);
  if (svg.pathCommands > 100_000) warnings.push(`SVG contains ${svg.pathCommands.toLocaleString()} path commands (warning threshold: 100,000).`);
  if (svg.externalImageReferences) warnings.push(`SVG references ${svg.externalImageReferences} external image${svg.externalImageReferences === 1 ? '' : 's'}; those files may be unavailable when sharing the project.`);
  if (svg.scripts || svg.foreignObjects) warnings.push(`SVG includes ${svg.scripts} script element${svg.scripts === 1 ? '' : 's'} and ${svg.foreignObjects} foreignObject element${svg.foreignObjects === 1 ? '' : 's'}; check support if its appearance differs.`);
  return warnings;
}

export function summarizeScene(scene: SceneV2 | null, includeSvgDetails = true): SceneComplexity | null {
  if (!scene) return null;
  const byKind: Record<string, number> = {};
  const modifiersByType: Record<string, number> = {};
  let nodes = 0, maximumDepth = 0, modifiers = 0, textShapes = 0, textCharacters = 0;
  let importedSvgs = 0, importedSvgBytes = 0, svgElements = 0, svgPaths = 0, svgPathCommands = 0, svgImages = 0;
  const visitStack = (stack: SceneNode['stack']) => {
    for (const modifier of stack) {
      modifiers++;
      modifiersByType[modifier.type] = (modifiersByType[modifier.type] ?? 0) + 1;
      visitStack(modifier.children ?? []);
    }
  };
  const visit = (items: SceneNode[], depth: number) => {
    for (const node of items) {
      nodes++;
      byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
      maximumDepth = Math.max(maximumDepth, depth);
      visitStack(node.stack);
      if (node.kind === 'object') {
        importedSvgs++;
        if (includeSvgDetails) {
          const svg = inspectSvgComplexity(node.source);
          importedSvgBytes += svg.bytes;
          svgElements += svg.elements;
          svgPaths += svg.paths;
          svgPathCommands += svg.pathCommands;
          svgImages += svg.images;
        } else importedSvgBytes += byteLength(node.source);
      } else if (node.kind === 'shape' && node.shape === 'text') {
        textShapes++;
        textCharacters += String(node.params.text ?? '').length;
      }
      if (node.kind === 'group') visit(node.children, depth + 1);
    }
  };
  visit(scene.objects, 1);
  const tracks = scene.animation?.tracks ?? [];
  return {
    nodes, byKind, maximumDepth, modifiers, modifiersByType,
    animationTracks: tracks.length,
    keyframes: tracks.reduce((n, track) => n + track.keys.length, 0),
    textShapes, textCharacters, importedSvgs, importedSvgBytes,
    svgElements, svgPaths, svgPathCommands, svgImages,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
