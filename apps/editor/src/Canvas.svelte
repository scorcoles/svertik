<script lang="ts">
  import { untrack } from 'svelte';
  import { apply, builtins, buildShape, createEngine, invert, pivotPoint, placementOf, renderInto, toPathData, type NodeInfo, type SceneNode, type SceneV2, type Vec2 } from '@svertik/engine';
  import { Button, Icon, IconButton, type IconName } from '@svertik/ui';
  import { locateNode, registry, type Editor } from './editor.svelte';
  import { samples, type SampleName } from './samples';
  import { align, distribute, type Align, type Move } from './arrange';
  import { CORNER_BOX, CORNER_SIZE, cornerTypes, gizmoFor, type Drag } from './gizmos';
  import Tools from './Tools.svelte';
  import { actualSize, FIT, fitScale, wheelFactor, wheelIntent, zoomAt, type View } from './viewport';

  interface Props {
    editor: Editor;
    onimport: () => void;
    onfile: (file: File) => void;
  }
  let { editor, onimport, onfile }: Props = $props();

  const engine = createEngine(builtins);
  let result = $state<SVGSVGElement>();
  let ghost = $state<SVGSVGElement>();
  let stage = $state<HTMLDivElement>();
  let renderError = $state<string | null>(null);
  /** Lo que tarda en recalcular y pintar (ms, suavizado). Pasado SLOW, aviso. */
  let cost = $state<number | null>(null);
  const SLOW = 50;
  let dropping = $state(false);
  /**
   * Encuadre del lienzo, en coordenadas del documento. Se fija al abrir y con Fit (⇧1);
   * mover o deformar no lo cambia, para que el lienzo no salte mientras se edita.
   */
  let viewBox = $state<[number, number, number, number]>([0, 0, 1, 1]);
  /** El viewBox que tendría el documento ahora (se ajusta al contenido): el que usa Fit. */
  let docViewBox: [number, number, number, number] = [0, 0, 1, 1];
  let framed = false;
  /** Información de cada nodo tras evaluar: caja de referencia, matriz al documento y caja final. */
  let nodes = $state.raw<Map<string, NodeInfo>>(new Map());

  // ── Pintar

  $effect(() => {
    if (!editor.scene || !result) return;
    const scene = $state.snapshot(editor.scene) as SceneV2;
    // Mientras el script anima, se pintan sus objetos (sin tocar la escena guardada).
    if (editor.preview) scene.objects = $state.snapshot(editor.preview) as SceneNode[];
    try {
      const t0 = performance.now();
      const doc = engine.evaluateDocument(scene);
      docViewBox = doc.geometry.viewBox;
      if (!framed) {
        viewBox = docViewBox;
        framed = true;
      }
      renderInto(result, doc.geometry);
      result.setAttribute('viewBox', viewBox.join(' '));
      if (ghost) {
        renderInto(ghost, doc.sources);
        ghost.setAttribute('viewBox', viewBox.join(' '));
      }
      nodes = doc.nodes;
      editor.infos = doc.nodes;
      renderError = null;
      // Tiempo de recálculo, suavizado (para el aviso de rendimiento).
      const ms = performance.now() - t0;
      const prev = untrack(() => cost);
      cost = prev === null ? ms : prev * 0.7 + ms * 0.3;
    } catch (e) {
      renderError = e instanceof Error ? e.message : String(e);
    }
  });

  // ── Vista: zoom y desplazamiento

  let view = $state<View>(FIT);
  let stageSize = $state<[number, number]>([1, 1]);
  $effect(() => {
    if (!stage) return;
    const ro = new ResizeObserver(([e]) => (stageSize = [e!.contentRect.width, e!.contentRect.height]));
    ro.observe(stage);
    return () => ro.disconnect();
  });
  // Margen alrededor del dibujo (igual que en el CSS de .view): el encaje se mide dentro.
  const INSET = { left: 48, top: 48, right: 48, bottom: 56 };
  const box = $derived([stageSize[0] - INSET.left - INSET.right, stageSize[1] - INSET.top - INSET.bottom] as const);
  const fit = $derived(fitScale(box[0], box[1], viewBox[2], viewBox[3]));
  const percent = $derived(Math.round(fit * view.zoom * 100));

  /** Encajar: el encuadre pasa a ser el del contenido actual, sin zoom ni desplazamiento. */
  function refit() {
    viewBox = docViewBox;
    view = FIT;
  }

  // Al empezar una escena (o cambiar de documento), se vuelve a encajar.
  let lastFirst = '';
  $effect(() => {
    const first = editor.scene?.objects[0]?.id ?? '';
    if (first !== lastFirst) {
      lastFirst = first;
      framed = false;
      view = FIT;
    }
  });

  /** Coordenadas del puntero respecto al origen de la capa que se escala. */
  const local = (e: { clientX: number; clientY: number }) => {
    const r = stage!.getBoundingClientRect();
    return [e.clientX - r.left - INSET.left, e.clientY - r.top - INSET.top] as const;
  };

  function wheel(e: WheelEvent) {
    if (!stage || !editor.scene) return;
    e.preventDefault();
    if (wheelIntent(e) === 'zoom') {
      const [x, y] = local(e);
      view = zoomAt(view, wheelFactor(e.deltaY, e.ctrlKey || e.metaKey), x, y);
    } else {
      view = { zoom: view.zoom, pan: { x: view.pan.x - e.deltaX, y: view.pan.y - e.deltaY } };
    }
  }
  // La rueda necesita un listener no pasivo para poder cancelar el scroll de la página.
  $effect(() => {
    if (!stage) return;
    stage.addEventListener('wheel', wheel, { passive: false });
    return () => stage?.removeEventListener('wheel', wheel);
  });

  // Espacio + arrastrar, o botón central: mover el lienzo.
  let space = $state(false);
  let panning = $state(false);
  const typing = (e: Event) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };
  function keydown(e: KeyboardEvent) {
    if (typing(e) || !editor.scene) return;
    if (e.key === 'Escape' && editor.tool) { editor.tool = null; e.preventDefault(); }
    else if (e.code === 'Space' && !e.repeat) { space = true; e.preventDefault(); }
    else if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); refit(); }
    else if (e.shiftKey && e.code === 'Digit0') { e.preventDefault(); view = actualSize(view, fit, box[0], box[1]); }
  }
  function keyup(e: KeyboardEvent) {
    if (e.code === 'Space') space = false;
  }
  function pointerdown(e: PointerEvent) {
    if (!(space || e.button === 1)) return pick(e);
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    panning = true;
    const x0 = e.clientX, y0 = e.clientY, p0 = view.pan;
    const move = (ev: PointerEvent) => (view = { zoom: view.zoom, pan: { x: p0.x + ev.clientX - x0, y: p0.y + ev.clientY - y0 } });
    const up = () => { panning = false; el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  // ── Tiradores: los puntos del efecto seleccionado se arrastran sobre el dibujo

  interface Handle { name: string; label: string; x: number; y: number }
  let hover = $state<string | null>(null);
  let grabbing = $state<string | null>(null);

  const handleParams = $derived.by(() => {
    const m = editor.current;
    // Dentro de Step cada copia tiene su propio centro: no hay un único sitio que arrastrar.
    if (!m || editor.currentParent) return [];
    const def = registry.get(m.type);
    return Object.entries(def?.params ?? {})
      .filter(([, s]) => s.type === 'point' && s.handle !== false)
      .map(([name, s]) => ({ name, label: s.label ?? name }));
  });

  /** El nodo dueño del efecto seleccionado: su caja de referencia y su matriz al documento. */
  const ownerInfo = () => (editor.activeNode ? nodes.get(editor.activeNode.id) : undefined);

  /** Documento → píxeles del escenario (con el zoom y el encaje que haya). */
  const docToStage = (x: number, y: number): [number, number] | null => {
    const ctm = result?.getScreenCTM();
    if (!ctm || !stage) return null;
    const p = new DOMPoint(x, y).matrixTransform(ctm);
    const r = stage.getBoundingClientRect();
    return [p.x - r.left, p.y - r.top];
  };
  const clientToDoc = (clientX: number, clientY: number): [number, number] | null => {
    const ctm = result?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  };

  const toScreen = (fx: number, fy: number): [number, number] | null => {
    const info = ownerInfo();
    if (!info) return null;
    const b = info.bounds;
    const [x, y] = apply(info.matrix, [b.x + fx * b.width, b.y + fy * b.height]);
    return docToStage(x, y);
  };
  const toFraction = (clientX: number, clientY: number): [number, number] | null => {
    const info = ownerInfo();
    const d = clientToDoc(clientX, clientY);
    if (!info || !d || info.bounds.width === 0 || info.bounds.height === 0) return null;
    const [x, y] = apply(invert(info.matrix), d);
    const b = info.bounds;
    const r = (n: number) => Math.round(n * 1000) / 1000;
    return [r((x - b.x) / b.width), r((y - b.y) / b.height)];
  };

  // ── Selección: recuadro del nodo seleccionado; clic para seleccionar y arrastrar para mover

  type Rect = { x: number; y: number; w: number; h: number };
  let selection = $state<Rect | null>(null);
  /** Los demás nodos seleccionados (⇧ + clic): solo su recuadro. */
  let others = $state<Rect[]>([]);
  const rectOf = (id: string): Rect | null => {
    const info = nodes.get(id);
    if (!info || info.box.width + info.box.height === 0) return null;
    const a = docToStage(info.box.x, info.box.y);
    const b = docToStage(info.box.x + info.box.width, info.box.y + info.box.height);
    return a && b ? { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] } : null;
  };
  $effect(() => {
    void view; void stageSize; void viewBox; void nodes;
    const node = editor.currentNode;
    const rest = editor.selectedNodes.filter((n) => n.id !== node?.id).map((n) => n.id);
    const frame = requestAnimationFrame(() => {
      selection = node ? rectOf(node.id) : null;
      others = rest.map(rectOf).filter((r): r is Rect => !!r);
    });
    return () => cancelAnimationFrame(frame);
  });

  // ── Organizar: alinear y distribuir la selección (en el documento), voltear

  function arrange(moves: Move[]) {
    if (!editor.scene) return;
    // Del documento a las coordenadas del grupo de cada uno.
    editor.moveNodes(
      moves.map(({ id, dx, dy }) => {
        const at = locateNode(editor.scene!.objects, id);
        const parentInfo = at?.parent ? nodes.get(at.parent.id) : undefined;
        if (!parentInfo) return { id, dx, dy };
        const m = invert(parentInfo.matrix);
        return { id, dx: m[0] * dx + m[2] * dy, dy: m[1] * dx + m[3] * dy };
      }),
    );
  }
  const items = () => editor.selectedNodes.flatMap((n) => {
    const info = nodes.get(n.id);
    return info ? [{ id: n.id, box: info.box }] : [];
  });
  const alignments: { how: Align; icon: string; label: string }[] = [
    { how: 'left', icon: 'align-left', label: 'Align left' },
    { how: 'hcenter', icon: 'align-hcenter', label: 'Align centers horizontally' },
    { how: 'right', icon: 'align-right', label: 'Align right' },
    { how: 'top', icon: 'align-top', label: 'Align top' },
    { how: 'vcenter', icon: 'align-vcenter', label: 'Align centers vertically' },
    { how: 'bottom', icon: 'align-bottom', label: 'Align bottom' },
  ];

  // ── Escalar y rotar desde el recuadro: esquinas para escalar (uniforme), justo fuera de ellas para rotar.
  // Todo gira y escala alrededor del centro del nodo (su pivote), como en sus atributos.

  type Corner = 'nw' | 'ne' | 'se' | 'sw';
  const corners: Corner[] = ['nw', 'ne', 'se', 'sw'];
  const cornerAt = (c: Corner, b: { x: number; y: number; w: number; h: number }) => ({
    x: c === 'nw' || c === 'sw' ? b.x : b.x + b.w,
    y: c === 'nw' || c === 'ne' ? b.y : b.y + b.h,
  });
  /** Lo que se está haciendo con el recuadro, para el rótulo junto al puntero. */
  let gesture = $state<{ text: string; x: number; y: number } | null>(null);

  function transformFrom(e: PointerEvent, mode: 'scale' | 'rotate') {
    const node = editor.currentNode;
    const info = node ? nodes.get(node.id) : undefined;
    if (!node || !info || !stage || space) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const pivot = docToStage(...apply(info.matrix, pivotPoint(info.bounds, placementOf(node).pivot)));
    if (!pivot) return;
    const r = stage.getBoundingClientRect();
    const at = (ev: PointerEvent) => [ev.clientX - r.left - pivot[0], ev.clientY - r.top - pivot[1]] as const;
    const [x0, y0] = at(e);
    const p0 = placementOf(node);
    const d0 = Math.hypot(x0, y0) || 1;
    const a0 = Math.atan2(y0, x0);
    const move = (ev: PointerEvent) => {
      const [x, y] = at(ev);
      const label = { x: ev.clientX - r.left + 14, y: ev.clientY - r.top + 14 };
      if (mode === 'scale') {
        const k = Math.round(Math.max(0.01, (p0.scale * Math.hypot(x, y)) / d0) * 100) / 100;
        editor.setNode(node.id, 'scale', k);
        gesture = { text: `× ${k.toFixed(2)}`, ...label };
      } else {
        let deg = p0.rotation + ((Math.atan2(y, x) - a0) * 180) / Math.PI;
        deg = ev.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg);
        deg = ((((deg + 180) % 360) + 360) % 360) - 180;
        editor.setNode(node.id, 'rotation', deg);
        gesture = { text: `${deg}°`, ...label };
      }
    };
    const up = () => {
      gesture = null;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  // ── Centro de transformación: una cruz con círculo que se arrastra (⇧ = esquinas, bordes y centro)

  let pivotAt = $state<[number, number] | null>(null);
  $effect(() => {
    void view; void stageSize; void viewBox; void nodes;
    const node = editor.currentNode;
    const pv = node ? $state.snapshot(placementOf(node).pivot) : undefined;
    const frame = requestAnimationFrame(() => {
      const info = node ? nodes.get(node.id) : undefined;
      pivotAt = info ? docToStage(...apply(info.matrix, pivotPoint(info.bounds, pv as [number, number] | undefined))) : null;
    });
    return () => cancelAnimationFrame(frame);
  });

  function dragPivot(e: PointerEvent) {
    const node = editor.currentNode;
    const info = node ? nodes.get(node.id) : undefined;
    if (!node || !info || space) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const b = info.bounds;
    // La matriz del principio: mientras se arrastra, el objeto no se mueve.
    const inv = invert(info.matrix);
    const r = stage!.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const d = clientToDoc(ev.clientX, ev.clientY);
      if (!d || !b.width || !b.height) return;
      const [lx, ly] = apply(inv, d);
      let f: [number, number] = [(lx - b.x) / b.width, (ly - b.y) / b.height];
      if (ev.shiftKey) f = [Math.round(f[0] * 2) / 2, Math.round(f[1] * 2) / 2];
      editor.setPivot(node.id, f);
      gesture = { text: `pivot ${f[0].toFixed(2)}, ${f[1].toFixed(2)}`, x: ev.clientX - r.left + 14, y: ev.clientY - r.top + 14 };
    };
    const up = () => {
      gesture = null;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  // ── Dibujar primitivas: con una herramienta armada, arrastrar define tamaño y sitio.
  // Mientras se arrastra se ve la forma real (con su estilo por defecto), no un rectángulo.

  /** Parámetros y centro (en el documento) de una primitiva dibujada de `a` a `b`. */
  function sized(type: string, a: [number, number], b: [number, number], square: boolean) {
    let dx = b[0] - a[0], dy = b[1] - a[1];
    if (square && type !== 'line') dx = dy = Math.max(Math.abs(dx), Math.abs(dy)) * Math.sign(dx || 1);
    const center = { x: a[0] + dx / 2, y: a[1] + dy / 2 };
    const r2 = (n: number) => Math.max(1, Math.round(n));
    const params: Record<string, unknown> =
      type === 'rectangle' || type === 'ellipse'
        ? { width: r2(Math.abs(dx)), height: r2(Math.abs(dy)) }
        : type === 'line'
          ? { length: r2(Math.hypot(dx, dy)), angle: Math.round((Math.atan2(dy, dx) * 180) / Math.PI) }
          : { radius: r2(Math.max(Math.abs(dx), Math.abs(dy)) / 2) };
    return { params, center };
  }

  /** La forma que se está dibujando: trazado y estilo, ya colocada en el documento. */
  let draft = $state<{ d: string; fill: string; stroke?: string; width?: string; x: number; y: number } | null>(null);
  function drawShape(e: PointerEvent) {
    const type = editor.tool;
    if (!type || !stage) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY;
    const start = clientToDoc(sx, sy);
    const move = (ev: PointerEvent) => {
      const now = clientToDoc(ev.clientX, ev.clientY);
      if (!start || !now || Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return (draft = null);
      const { params, center } = sized(type, start, now, ev.shiftKey);
      const shape = buildShape(type, params).shapes[0]!;
      const st = shape.style;
      draft = { d: toPathData(shape), fill: st.fill ?? 'none', stroke: st.stroke, width: st['stroke-width'], x: center.x, y: center.y };
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      draft = null;
      const end = clientToDoc(ev.clientX, ev.clientY);
      if (!start || !end) return;
      // Un clic: a su tamaño por defecto, centrada donde se hizo clic.
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return editor.addShape(type, {}, { x: start[0], y: start[1] });
      const { params, center } = sized(type, start, end, ev.shiftKey);
      editor.addShape(type, params, center);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  /** Doble clic en la herramienta: la primitiva, a su tamaño por defecto, en el centro de lo que se ve. */
  function placeAtCenter(type: string) {
    const r = stage?.getBoundingClientRect();
    const c = r && clientToDoc(r.left + r.width / 2, r.top + r.height / 2);
    editor.addShape(type, {}, c ? { x: c[0], y: c[1] } : undefined);
  }

  function pick(e: PointerEvent) {
    if (space || e.button !== 0 || !editor.scene) return;
    if (editor.tool) return drawShape(e);
    const id = (e.target as Element).closest?.('path[data-node]')?.getAttribute('data-node');
    if (!id) {
      if (!e.shiftKey) editor.selected = null;
      return;
    }
    e.preventDefault();
    // ⇧ + clic: sumar o quitar de la selección (sin mover).
    if (e.shiftKey) return editor.toggleSelect(id);
    // Clic en algo ya seleccionado: se mueve toda la selección; si no, se selecciona solo él.
    if (!editor.isSelected(id)) editor.selected = id;
    const ids = editor.selectedNodes.map((n) => n.id);
    // Cada uno se mueve en las coordenadas de su grupo (si lo tiene).
    const parts = ids.flatMap((nid) => {
      const at = locateNode(editor.scene!.objects, nid);
      if (!at) return [];
      const parentInfo = at.parent ? nodes.get(at.parent.id) : undefined;
      return [{ id: nid, toParent: parentInfo ? invert(parentInfo.matrix) : null, t0: { x: at.node.transform?.x ?? 0, y: at.node.transform?.y ?? 0 } }];
    });
    const start = clientToDoc(e.clientX, e.clientY);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const now = clientToDoc(ev.clientX, ev.clientY);
      if (!start || !now || !editor.scene) return;
      const r = (n: number) => Math.round(n * 100) / 100;
      for (const p of parts) {
        let dx = now[0] - start[0];
        let dy = now[1] - start[1];
        if (p.toParent) [dx, dy] = [p.toParent[0] * dx + p.toParent[2] * dy, p.toParent[1] * dx + p.toParent[3] * dy];
        const n = locateNode(editor.scene.objects, p.id)?.node;
        if (n) n.transform = { ...n.transform, x: r(p.t0.x + dx), y: r(p.t0.y + dy) };
      }
      editor.record();
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  // Se calculan después de pintar (con el zoom ya aplicado en el DOM), no antes.
  let handles = $state<Handle[]>([]);
  $effect(() => {
    void view; void stageSize; void viewBox; void nodes;
    const m = editor.current;
    const values = handleParams.map(({ name }) => $state.snapshot(m?.params?.[name]) as [number, number] | undefined);
    const frame = requestAnimationFrame(() => {
      handles = handleParams.flatMap(({ name, label }, i) => {
        const v = values[i];
        const at = v && toScreen(v[0], v[1]);
        return at ? [{ name, label, x: at[0], y: at[1] }] : [];
      });
    });
    return () => cancelAnimationFrame(frame);
  });

  // ── Actuadores del efecto seleccionado: su wire y sus tiradores (ver gizmos.ts)

  const gizmo = $derived.by(() => {
    const m = editor.current;
    const info = ownerInfo();
    // Dentro de Step cada copia usa su propio centro; el actuador se dibuja sobre el objeto entero
    // y sirve igual para cambiar los valores (los de la primera copia; las demás los multiplican).
    if (!m || !info || cornerTypes.has(m.type)) return null;
    return gizmoFor(m.type, $state.snapshot(m.params ?? {}) as Record<string, unknown>, info.bounds);
  });
  /** El actuador en el recuadro de la esquina (Rotate 3D), en sus propios píxeles. */
  const cornerGizmo = $derived.by(() => {
    const m = editor.current;
    if (!m || !cornerTypes.has(m.type)) return null;
    const g = gizmoFor(m.type, $state.snapshot(m.params ?? {}) as Record<string, unknown>, CORNER_BOX);
    if (!g) return null;
    const d = (pts: readonly (readonly [number, number])[], closed?: boolean) =>
      pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('') + (closed ? 'Z' : '');
    return {
      label: registry.get(m.type)?.label ?? m.type,
      lines: g.lines.map((l) => ({ d: d(l.pts, l.closed), tone: l.tone ?? 'accent', dashed: !!l.dashed, ribbon: !!l.ribbon, drag: l.drag, label: l.label })),
      handles: g.handles.map((h) => ({ x: h.at[0], y: h.at[1], label: h.label, drag: h.drag, tone: h.tone ?? 'accent' })),
    };
  });
  let cornerEl = $state<HTMLDivElement>();
  /** Del puntero a píxeles del recuadro de la esquina. */
  const toCorner = (clientX: number, clientY: number): Vec2 | null => {
    const r = cornerEl?.querySelector('svg')?.getBoundingClientRect();
    return r ? [clientX - r.left, clientY - r.top] : null;
  };
  /** El gizmo ya en píxeles del escenario (se recalcula tras pintar, como los tiradores). */
  let gizmoScreen = $state<{ lines: { d: string; tone: string; dashed: boolean; ribbon: boolean; drag?: Drag; label?: string }[]; handles: { x: number; y: number; label: string; drag: Drag; tone: string }[] } | null>(null);
  $effect(() => {
    void view; void stageSize; void viewBox;
    const g = gizmo;
    const frame = requestAnimationFrame(() => {
      const info = ownerInfo();
      if (!g || !info) return (gizmoScreen = null);
      const s = (pt: Vec2) => docToStage(...apply(info.matrix, pt));
      gizmoScreen = {
        lines: g.lines.map((l) => {
          const pts = l.pts.map(s).filter((q): q is [number, number] => !!q);
          const d = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('') + (l.closed ? 'Z' : '');
          return { d, tone: l.tone ?? 'accent', dashed: !!l.dashed, ribbon: !!l.ribbon, drag: l.drag, label: l.label };
        }),
        handles: g.handles.flatMap((h) => {
          const q = s(h.at);
          return q ? [{ x: q[0], y: q[1], label: h.label, drag: h.drag, tone: h.tone ?? 'accent' }] : [];
        }),
      };
    });
    return () => cancelAnimationFrame(frame);
  });
  let gizmoActive = $state(false);
  let gizmoHover = $state(false);

  /** Del puntero a coordenadas locales del nodo dueño del efecto. */
  const toLocalNode = (clientX: number, clientY: number): Vec2 | null => {
    const info = ownerInfo();
    const d = clientToDoc(clientX, clientY);
    return info && d ? apply(invert(info.matrix), d) : null;
  };

  function dragGizmo(e: PointerEvent, drag: Drag, label: string, toLocal = toLocalNode) {
    const m = editor.current;
    if (space || !m) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const from = toLocal(e.clientX, e.clientY);
    const p0 = $state.snapshot(m.params ?? {}) as Record<string, unknown>;
    const r = stage!.getBoundingClientRect();
    gizmoActive = true;
    const move = (ev: PointerEvent) => {
      const to = toLocal(ev.clientX, ev.clientY);
      if (!from || !to) return;
      const changed = drag(p0, from, to, ev.shiftKey);
      for (const [k, v] of Object.entries(changed)) editor.setParam(k, v);
      const v = Object.values(changed)[0];
      gesture = { text: `${label} ${typeof v === 'number' ? v : ''}`, x: ev.clientX - r.left + 14, y: ev.clientY - r.top + 14 };
    };
    const up = () => {
      gizmoActive = false;
      gesture = null;
      el.removeEventListener('pointermove', move as EventListener);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move as EventListener);
    el.addEventListener('pointerup', up);
  }

  function grab(e: PointerEvent, h: Handle) {
    if (space) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    grabbing = h.name;
    const move = (ev: PointerEvent) => {
      const f = toFraction(ev.clientX, ev.clientY);
      if (f) editor.setParam(h.name, f);
    };
    const up = () => { grabbing = null; el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }
  function nudgeHandle(e: KeyboardEvent, h: Handle) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    const v = editor.current?.params?.[h.name] as [number, number] | undefined;
    if (!d || !v) return;
    e.preventDefault();
    e.stopPropagation();
    const k = e.shiftKey ? 0.1 : 0.01;
    const r = (n: number) => Math.round(n * 1000) / 1000;
    editor.setParam(h.name, [r(v[0] + d[0]! * k), r(v[1] + d[1]! * k)]);
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    dropping = false;
    // Varios archivos a la vez: un objeto por cada uno.
    for (const file of Array.from(e.dataTransfer?.files ?? [])) if (/svg/i.test(file.type) || file.name.endsWith('.svg')) onfile(file);
  }
</script>

<svelte:window onkeydown={keydown} onkeyup={keyup} onblur={() => (space = false)} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
  class="canvas"
  aria-label="Canvas"
  style:--canvas={editor.canvas || undefined}
  data-dragging={dropping || undefined}
  ondragover={(e) => { e.preventDefault(); dropping = true; }}
  ondragleave={() => (dropping = false)}
  ondrop={drop}
>
  <Tools {editor} oncenter={placeAtCenter} />
  {#if editor.scene}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="stage" bind:this={stage} data-space={space || undefined} data-panning={panning || undefined} data-tool={editor.tool || undefined} onpointerdown={pointerdown}>
      <div class="view" style:transform="translate({view.pan.x}px, {view.pan.y}px) scale({view.zoom})">
        {#if editor.showOriginal}<svg class="ghost" bind:this={ghost} aria-hidden="true"></svg>{/if}
        <svg class="result" class:wire={editor.showWire} bind:this={result} role="img" aria-label="Result"></svg>
        {#if draft}
          <svg class="draft" viewBox={viewBox.join(' ')} aria-hidden="true">
            <path d={draft.d} transform="translate({draft.x} {draft.y})" fill={draft.fill} stroke={draft.stroke} stroke-width={draft.width} stroke-linejoin="round" stroke-linecap="round" />
            <path class="outline" d={draft.d} transform="translate({draft.x} {draft.y})" />
          </svg>
        {/if}
      </div>
      {#if selection && !editor.tool}
        <span class="selection" style:left="{selection.x}px" style:top="{selection.y}px" style:width="{selection.w}px" style:height="{selection.h}px" aria-hidden="true"></span>
        {#each corners as c (c)}
          {@const p = cornerAt(c, selection)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class="rotate" data-corner={c} style:left="{p.x}px" style:top="{p.y}px" title="Rotate (⇧ snaps to 15°)" onpointerdown={(e) => transformFrom(e, 'rotate')}></span>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class="corner" data-corner={c} style:left="{p.x}px" style:top="{p.y}px" title="Scale" onpointerdown={(e) => transformFrom(e, 'scale')}></span>
        {/each}
      {/if}
      {#if pivotAt && selection && !editor.tool && !editor.current}
        <button
          type="button"
          class="pivot"
          style:left="{pivotAt[0]}px"
          style:top="{pivotAt[1]}px"
          title="Transform center: drag to move it (⇧ snaps to corners, edges and center)"
          aria-label="Transform center"
          onpointerdown={dragPivot}
        ></button>
      {/if}
      {#each others as o, i (i)}
        <span class="selection other" style:left="{o.x}px" style:top="{o.y}px" style:width="{o.w}px" style:height="{o.h}px" aria-hidden="true"></span>
      {/each}
      {#if gesture}<span class="gesture" style:left="{gesture.x}px" style:top="{gesture.y}px">{gesture.text}</span>{/if}
      {#if gizmoScreen && !editor.tool}
        <svg class="gizmo" data-active={gizmoActive || gizmoHover || editor.busy || undefined} aria-hidden="true">
          {#each gizmoScreen.lines as l, i (i)}
            <path class="halo" d={l.d} data-ribbon={l.ribbon || undefined} />
            <path class="line" d={l.d} data-tone={l.tone} data-dashed={l.dashed || undefined} data-ribbon={l.ribbon || undefined} />
            {#if l.drag}
              {@const drag = l.drag}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <path
                class="hit"
                data-ribbon={l.ribbon || undefined}
                d={l.d}
                onpointerdown={(e) => dragGizmo(e, drag, l.label ?? '')}
                onpointerenter={() => (gizmoHover = true)}
                onpointerleave={() => (gizmoHover = false)}
              ><title>{l.label}</title></path>
            {/if}
          {/each}
        </svg>
        {#each gizmoScreen.handles as h (h.label)}
          <button
            type="button"
            class="gizmo-handle"
            data-tone={h.tone}
            style:left="{h.x}px"
            style:top="{h.y}px"
            title={h.label}
            aria-label={h.label}
            onpointerdown={(e) => dragGizmo(e, h.drag, h.label)}
            onpointerenter={() => (gizmoHover = true)}
            onpointerleave={() => (gizmoHover = false)}
          ></button>
        {/each}
      {/if}
      {#each handles as h (h.name)}
        <button
          type="button"
          class="handle"
          style:left="{h.x}px"
          style:top="{h.y}px"
          data-active={editor.marker || hover === h.name || grabbing === h.name ? '' : undefined}
          aria-label={`Move ${h.label} (arrow keys nudge)`}
          title={h.label}
          onpointerdown={(e) => grab(e, h)}
          onpointerenter={() => (hover = h.name)}
          onpointerleave={() => (hover = null)}
          onkeydown={(e) => nudgeHandle(e, h)}
        ></button>
      {/each}
    </div>
    {#if cornerGizmo && !editor.tool}
      <div class="corner-gizmo" bind:this={cornerEl} data-active={gizmoActive || gizmoHover || editor.busy || undefined}>
        <span class="corner-label">{cornerGizmo.label}</span>
        <svg class="gizmo" width={CORNER_SIZE} height={CORNER_SIZE} viewBox="0 0 {CORNER_SIZE} {CORNER_SIZE}" aria-hidden="true">
          {#each cornerGizmo.lines as l, i (i)}
            <path class="halo" d={l.d} data-ribbon={l.ribbon || undefined} />
            <path class="line" d={l.d} data-tone={l.tone} data-dashed={l.dashed || undefined} data-ribbon={l.ribbon || undefined} />
            {#if l.drag}
              {@const drag = l.drag}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <path
                class="hit"
                data-ribbon={l.ribbon || undefined}
                d={l.d}
                onpointerdown={(e) => dragGizmo(e, drag, l.label ?? '', toCorner)}
                onpointerenter={() => (gizmoHover = true)}
                onpointerleave={() => (gizmoHover = false)}
              ><title>{l.label}</title></path>
            {/if}
          {/each}
        </svg>
        {#each cornerGizmo.handles as h (h.label)}
          <button
            type="button"
            class="gizmo-handle"
            data-tone={h.tone}
            style:left="{h.x + 8}px"
            style:top="{h.y + 24}px"
            title={h.label}
            aria-label={h.label}
            onpointerdown={(e) => dragGizmo(e, h.drag, h.label, toCorner)}
          ></button>
        {/each}
      </div>
    {/if}
    {#if editor.selectedNodes.length && !editor.tool}
      {@const n = editor.selectedNodes.length}
      <div class="arrange" role="toolbar" aria-label="Arrange">
        {#each alignments as a (a.how)}
          <IconButton icon={a.icon as IconName} label={`${a.label}${n < 2 ? ' (select 2+ with ⇧)' : ''}`} disabled={n < 2} onclick={() => arrange(align(items(), a.how))} />
        {/each}
        <span class="rule" aria-hidden="true"></span>
        <IconButton icon="distribute-h" label={`Distribute horizontally${n < 3 ? ' (select 3+)' : ''}`} disabled={n < 3} onclick={() => arrange(distribute(items(), 'x'))} />
        <IconButton icon="distribute-v" label={`Distribute vertically${n < 3 ? ' (select 3+)' : ''}`} disabled={n < 3} onclick={() => arrange(distribute(items(), 'y'))} />
        <span class="rule" aria-hidden="true"></span>
        <IconButton icon="flip-h" label="Flip horizontally" onclick={() => editor.flip('x')} />
        <IconButton icon="flip-v" label="Flip vertically" onclick={() => editor.flip('y')} />
      </div>
    {/if}
    {#if renderError}<p class="error" role="alert">{renderError}</p>{/if}
    <footer>
      <span class="pct" title="Zoom (wheel or pinch)">{percent}%</span>
      <span class="zoom">
        <button type="button" onclick={refit} title="Fit (⇧1)">Fit</button>
        <button type="button" onclick={() => (view = actualSize(view, fit, box[0], box[1]))} title="100% (⇧0)">100%</button>
      </span>
      <span class="muted">{Math.round(viewBox[2])} × {Math.round(viewBox[3])}</span>
      {#if cost !== null}
        <span
          class="cost"
          data-slow={cost > SLOW || undefined}
          title={cost > SLOW ? 'Slow: try fewer copies, a coarser resolution, or turning off heavy effects (eye or checkbox) while you edit' : 'Time to evaluate and draw'}
        >{cost > SLOW ? '⚠ ' : ''}{Math.round(cost)} ms</span>
      {/if}
    </footer>
  {:else}
    <div class="drop">
      <Icon name="import" />
      <strong>Drop an SVG here</strong>
      <span class="muted">or paste it (⌘V)</span>
      <Button label="Choose file…" onclick={onimport} />
      <span class="samples muted">
        or start from a sample:
        {#each Object.keys(samples) as name, i (name)}
          {#if i > 0}<span aria-hidden="true">·</span>{/if}
          <button type="button" onclick={() => editor.load(samples[name as SampleName], `${name}.svg`)}>{name}</button>
        {/each}
      </span>
      {#if editor.error}<p class="error" role="alert">{editor.error}</p>{/if}
    </div>
  {/if}
</section>

<style>
  .canvas {
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--canvas, var(--sv-surface-field));
  }
  .canvas[data-dragging] { outline: 1px dashed var(--sv-accent-fill); outline-offset: -8px; }
  .stage { position: absolute; inset: 0; overflow: hidden; }
  .stage[data-space] { cursor: grab; }
  .stage[data-tool] { cursor: crosshair; }
  .stage[data-tool] :global(path[data-node]) { cursor: crosshair; }
  .draft { pointer-events: none; }
  .draft .outline { fill: none; stroke: var(--sv-accent-fill); stroke-width: 1px; vector-effect: non-scaling-stroke; }
  .stage[data-panning] { cursor: grabbing; }
  .view { position: absolute; inset: 48px 48px 56px; transform-origin: 0 0; }
  .view svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  /* Tirador: cuadradito en reposo; con la cruz al pasar, al arrastrar o al cambiar el punto desde el campo. */
  .handle {
    position: absolute;
    width: 7px;
    height: 7px;
    padding: 0;
    translate: -50% -50%;
    background: var(--sv-surface-field);
    border: 1px solid var(--sv-signal-error);
    border-radius: 0;
    cursor: move;
  }
  .handle::before,
  .handle::after { content: ''; position: absolute; display: none; background: var(--sv-signal-error); pointer-events: none; }
  .handle::before { left: 50%; top: -5px; width: 1px; height: 15px; translate: -50% 0; }
  .handle::after { top: 50%; left: -5px; height: 1px; width: 15px; translate: 0 -50%; }
  .handle[data-active]::before,
  .handle[data-active]::after { display: block; }
  .handle:focus-visible { outline: 1px solid var(--sv-accent-fill); outline-offset: 2px; }
  .stage[data-space] .handle { pointer-events: none; }
  .result :global(path[data-node]) { cursor: default; }
  /* Recuadro del objeto o grupo seleccionado. */
  .selection { position: absolute; pointer-events: none; outline: 1px solid var(--sv-accent-fill); }
  .selection.other { outline-style: dashed; }
  /* Centro de transformación: círculo con cruz. */
  .pivot {
    position: absolute;
    width: 11px;
    height: 11px;
    padding: 0;
    translate: -50% -50%;
    background: none;
    border: 1px solid var(--sv-accent-fill);
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.4);
    cursor: move;
  }
  .pivot::before,
  .pivot::after { content: ''; position: absolute; background: var(--sv-accent-fill); }
  .pivot::before { left: 50%; top: -4px; bottom: -4px; width: 1px; translate: -50% 0; }
  .pivot::after { top: 50%; left: -4px; right: -4px; height: 1px; translate: 0 -50%; }
  .stage[data-space] .pivot { pointer-events: none; }
  /* Actuador en una esquina (Rotate 3D): recuadro fijo abajo a la derecha, sobre el pie del lienzo. */
  .corner-gizmo {
    position: absolute;
    right: var(--sv-space-12);
    bottom: 40px;
    z-index: 2;
    padding: 24px 8px 8px;
    background: var(--sv-surface-panel);
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
  .corner-gizmo .gizmo { position: static; display: block; width: auto; height: auto; opacity: 1; }
  .corner-label { position: absolute; top: 6px; left: 8px; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  /* Organizar: arriba, en el centro del lienzo, mientras haya algo seleccionado. */
  .arrange {
    position: absolute;
    top: var(--sv-space-12);
    left: 50%;
    translate: -50% 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: var(--sv-space-2);
    padding: var(--sv-space-4);
    background: var(--sv-surface-panel);
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
  .arrange .rule { width: 1px; height: 16px; margin: 0 var(--sv-space-4); background: var(--sv-rule-default); }
  /* Esquinas: escalar. Un poco más allá de cada una (la zona grande, debajo): rotar. */
  .corner,
  .rotate { position: absolute; translate: -50% -50%; }
  .corner { width: 7px; height: 7px; background: var(--sv-accent-fill); }
  .corner::before { content: ''; position: absolute; inset: -4px; }
  .corner[data-corner='nw'],
  .corner[data-corner='se'] { cursor: nwse-resize; }
  .corner[data-corner='ne'],
  .corner[data-corner='sw'] { cursor: nesw-resize; }
  .rotate {
    width: 28px;
    height: 28px;
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Cpath d='M4 11a6 6 0 1 0 2-5' fill='none' stroke='%23000' stroke-width='3'/%3E%3Cpath d='M4 11a6 6 0 1 0 2-5' fill='none' stroke='%23fff' stroke-width='1.2'/%3E%3Cpath d='M3 3v5h5' fill='none' stroke='%23000' stroke-width='3'/%3E%3Cpath d='M3 3v5h5' fill='none' stroke='%23fff' stroke-width='1.2'/%3E%3C/svg%3E") 10 10, alias;
  }
  /* La zona de rotar asoma hacia fuera del recuadro, no hacia dentro. */
  .rotate[data-corner='nw'] { translate: -80% -80%; }
  .rotate[data-corner='ne'] { translate: -20% -80%; }
  .rotate[data-corner='se'] { translate: -20% -20%; }
  .rotate[data-corner='sw'] { translate: -80% -20%; }
  .stage[data-space] .corner,
  .stage[data-space] .rotate { pointer-events: none; }
  .gesture {
    position: absolute;
    z-index: 2;
    padding: 1px var(--sv-space-4);
    pointer-events: none;
    background: var(--sv-surface-panel);
    color: var(--sv-text-primary);
    font-size: var(--sv-font-size-10);
    white-space: nowrap;
  }
  /* Wire del efecto: tenue en reposo; encendido al pasar, al arrastrar o al cambiar sus valores. */
  .gizmo { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; opacity: 0.8; transition: opacity 120ms; }
  .gizmo[data-active] { opacity: 1; }
  .gizmo .halo { fill: none; stroke: rgb(0 0 0 / 0.55); stroke-width: 3.5; }
  .gizmo .line { fill: none; stroke: var(--sv-accent-fill); stroke-width: 1.25; }
  .gizmo .line[data-tone='x'], .gizmo .line[data-tone='y'], .gizmo .line[data-tone='z'] { stroke-width: 1.75; }
  .gizmo .line[data-dashed] { stroke-dasharray: 4 3; }
  .gizmo .line[data-tone='x'] { stroke: #ff5c5c; }
  .gizmo .line[data-tone='y'] { stroke: #6bdc6b; }
  .gizmo .line[data-tone='z'] { stroke: #5c8cff; }
  /* Cintas: banda ancha y translúcida de su color, con un borde oscuro debajo. */
  .gizmo .halo[data-ribbon] { stroke: rgb(0 0 0 / 0.45); stroke-width: 11; }
  .gizmo .line[data-ribbon] { stroke-width: 8; stroke-opacity: 0.8; }
  .gizmo .hit[data-ribbon] { stroke-width: 12; }
  .gizmo .hit { fill: none; stroke: transparent; stroke-width: 10; pointer-events: stroke; cursor: grab; }
  .gizmo-handle {
    position: absolute;
    width: 7px;
    height: 7px;
    padding: 0;
    translate: -50% -50%;
    background: var(--sv-accent-fill);
    border: 0;
    border-radius: 0;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.5);
    cursor: move;
  }
  .gizmo-handle::before { content: ''; position: absolute; inset: -4px; }
  .gizmo-handle[data-tone='x'],
  .gizmo-handle[data-tone='y'],
  .gizmo-handle[data-tone='z'] { width: 9px; height: 9px; border-radius: 50%; }
  .gizmo-handle[data-tone='x'] { background: #ff5c5c; }
  .gizmo-handle[data-tone='y'] { background: #6bdc6b; }
  .gizmo-handle[data-tone='z'] { background: #5c8cff; }
  .stage[data-space] .gizmo-handle,
  .stage[data-space] .gizmo .hit { pointer-events: none; }
  .ghost { opacity: 0.2; }
  .wire :global(path) {
    fill: none !important;
    stroke: var(--sv-text-secondary) !important;
    stroke-width: 1px !important;
    vector-effect: non-scaling-stroke;
  }
  .pct { min-width: 4ch; }
  .zoom { display: flex; gap: var(--sv-space-4); }
  .zoom button {
    height: 18px;
    padding: 0 var(--sv-space-6);
    font: inherit;
    color: var(--sv-text-secondary);
    background: none;
    border: 1px solid var(--sv-rule-strong);
    cursor: pointer;
  }
  .zoom button:hover { color: var(--sv-text-primary); border-color: var(--sv-text-muted); }
  footer {
    position: absolute;
    left: 0;
    bottom: 0;
    z-index: 1;
    background: var(--canvas, var(--sv-surface-field));
    display: flex;
    align-items: center;
    gap: var(--sv-space-16);
    height: 28px;
    padding: 0 var(--sv-space-12);
    font-size: var(--sv-font-size-10);
    color: var(--sv-text-secondary);
  }
  .muted { color: var(--sv-text-muted); }
  .cost { color: var(--sv-text-disabled); font-variant-numeric: tabular-nums; }
  .cost[data-slow] { color: var(--sv-signal-error); }
  .drop {
    display: grid;
    justify-items: center;
    gap: var(--sv-space-12);
    width: min(480px, 100% - 32px);
    padding: 64px var(--sv-space-16);
    border: 1px dashed var(--sv-rule-strong);
    color: var(--sv-text-muted);
    text-align: center;
  }
  .drop strong { color: var(--sv-text-primary); font-size: var(--sv-font-size-12); }
  .samples { font-size: var(--sv-font-size-10); display: flex; gap: var(--sv-space-6); flex-wrap: wrap; justify-content: center; }
  .samples button { padding: 0; font: inherit; color: var(--sv-text-secondary); background: none; border: 0; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .samples button:hover { color: var(--sv-accent-fill); }
  .error { margin: 0; color: var(--sv-signal-error); font-size: var(--sv-font-size-10); }
  .canvas > .error { position: absolute; top: var(--sv-space-12); left: var(--sv-space-12); }
</style>
