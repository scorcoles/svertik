// svertikJS: svertik scenes in JavaScript. Objects chain their effects (`ellipse('dots').clone({…}).twist({…})`)
// and tweens (`.to({ rotation: 360, duration: 2 })`); `scene(…)` builds the SceneV1.
export { Effect, Group, Instance, Node, RawNode, SceneBuild, Shape, SvgObject, effect } from './core';
export type { BuildResult, EffectRest, KeysOptions, SceneOptions, SetVars, TweenTiming, TweenVars } from './core';
export { Expr, Var, custom, expose, fx, type Operand, type VarOptions } from './values';
export { toEase, type EaseInput } from './ease';
export * from './generated';
export * from './objects';
export { toCode } from './print';
export { runCode, type RunResult } from './run';
