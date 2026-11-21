/** A paired hypotrochoid/epitrochoid print, generated from simple circle bounds. */
export function spirographProject() {
  const gear = (id: string, name: string, x: number, mode: 'hypo' | 'epi', color: string, ring: number, wheel: number, pen: number) => ({
    kind: 'shape' as const, id, name, shape: 'ellipse',
    params: { width: 570, height: 570, fill: true, fillColor: color, stroke: false, strokeColor: color, strokeWidth: 1.6 },
    stack: [{ id: `${id}-spirograph`, type: 'spirograph', params: { mode, ring, wheel, pen, detail: 2200, phase: 0 } }],
    transform: { x, y: 0 },
  });
  return {
    svertik: 'project' as const, version: 1 as const, name: 'Spirograph · Gear studies', canvas: '#101418',
    scene: {
      version: 1 as const, document: { width: 1400, height: 1000 },
      animation: { duration: 4, loop: true, fps: 30, tracks: [] },
      notes: 'A paired gear study: the left curve rolls a wheel inside its ring (hypotrochoid); the right rolls outside (epitrochoid). Select either drawing to tune Ring teeth, Wheel teeth, Pen offset, Phase and Detail. Integer gear ratios close exactly after the required number of turns.',
      objects: [
        { kind: 'shape' as const, id: 'spirograph-title', name: 'Title', shape: 'text', params: { text: 'GEAR STUDIES', font: 'JetBrains Mono', weight: 700, size: 38, tracking: 4, fillColor: '#edf1ee' }, transform: { x: 0, y: -420 } },
        gear('spirograph-hypo', 'Hypotrochoid', -340, 'hypo', '#54d6c3', 84, 29, 0.94),
        gear('spirograph-epi', 'Epitrochoid', 340, 'epi', '#f28c55', 84, 29, 1.28),
        { kind: 'shape' as const, id: 'spirograph-hypo-label', name: 'Hypo label', shape: 'text', params: { text: 'HYPO · INSIDE', font: 'JetBrains Mono', weight: 500, size: 15, tracking: 2, fillColor: '#54d6c3' }, transform: { x: -340, y: 385 } },
        { kind: 'shape' as const, id: 'spirograph-epi-label', name: 'Epi label', shape: 'text', params: { text: 'EPI · OUTSIDE', font: 'JetBrains Mono', weight: 500, size: 15, tracking: 2, fillColor: '#f28c55' }, transform: { x: 340, y: 385 } },
      ],
    },
  };
}
