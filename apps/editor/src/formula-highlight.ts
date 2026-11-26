import { expressionReference } from '@svertik/engine';

/** A piece of a formula and what it is, for colouring it. `depth`: how nested a bracket is (from 0). */
export interface FormulaToken {
  text: string;
  kind: 'space' | 'number' | 'function' | 'variable' | 'string' | 'operator' | 'bracket' | 'unknown';
  depth?: number;
}

const FUNCTIONS = new Set(expressionReference().functions.map((f) => f.name.replace(/\(.*$/, '')));
/** Where variables start: `scene.time`, `element.index`, `props.x`, `this.radius`, `children["id"].y`. */
const ROOTS = new Set(['scene', 'element', 'props', 'this', 'children']);
const PIECE = /(\s+)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|(\*\*|[+\-*/%^,])|([()[\]])|(\.)|([\s\S])/g;

/**
 * A formula cut into coloured pieces, the way the expression language reads it: function calls, variables
 * (a whole `scene.mouse.posX` chain), numbers, operators, and brackets with their nesting depth. A name the
 * language doesn't know is `unknown`. Joining the pieces gives back the text exactly.
 */
export function tokenizeFormula(source: string): FormulaToken[] {
  const out: FormulaToken[] = [];
  let depth = 0;
  let chain = false;
  for (const m of source.matchAll(PIECE)) {
    const [text, space, string, number, name, operator, bracket, dot] = m;
    if (space) { out.push({ text, kind: 'space' }); continue; }
    if (string !== undefined) { out.push({ text, kind: 'string' }); continue; }
    if (number !== undefined) { out.push({ text, kind: 'number' }); continue; }
    if (dot) { out.push({ text, kind: chain ? 'variable' : 'operator' }); continue; }
    if (name !== undefined) {
      const rest = source.slice(m.index! + text.length).trimStart();
      let before = out.length - 1;
      while (before >= 0 && out[before]!.kind === 'space') before--;
      const afterDot = chain && out[before]?.text === '.';
      if (afterDot) {
        // A link of a chain: scene.mouse.posX, or a call at its end (scene.countDown(10)).
        out.push({ text, kind: rest.startsWith('(') ? 'function' : 'variable' });
        chain = rest.startsWith('.');
      } else if (ROOTS.has(name)) {
        out.push({ text, kind: 'variable' });
        chain = rest.startsWith('.') || rest.startsWith('[');
      } else {
        out.push({ text, kind: rest.startsWith('(') ? (FUNCTIONS.has(name) ? 'function' : 'unknown') : name === 'pi' || name === 'e' ? 'number' : 'unknown' });
        chain = false;
      }
      continue;
    }
    if (bracket) {
      const opening = bracket === '(' || bracket === '[';
      if (!opening) depth = Math.max(0, depth - 1);
      out.push({ text, kind: 'bracket', depth });
      if (opening) depth++;
      // Inside children["id"] the chain pauses; after its `]` a `.property` continues it.
      if (bracket === ']') chain = source.slice(m.index! + 1).trimStart().startsWith('.');
      continue;
    }
    out.push({ text, kind: operator ? 'operator' : 'unknown' });
    chain = false;
  }
  return out;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The formula as HTML spans (`fx-number`, `fx-bracket fx-depth-1`…), for a layer drawn under the text field. */
export function highlightFormula(source: string): string {
  const html = tokenizeFormula(source)
    .map((t) => (t.kind === 'space' ? escape(t.text) : `<span class="fx-${t.kind}${t.depth !== undefined ? ` fx-depth-${t.depth % 3}` : ''}">${escape(t.text)}</span>`))
    .join('');
  // A trailing line break needs a line after it, or the layer ends shorter than the field.
  return source.endsWith('\n') ? html + ' ' : html;
}
