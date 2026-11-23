import demoMetadata from './demo-metadata.json';
import { cellsProject, fireworksProject, softCellsProject, liftSinkProject, fridgeMagnetsProject, wiresProject, orreryProject, plotterProject, printLabProject, playgroundProject, shatterProject, titleSequenceProject } from './demo';

/** How a demo opens: with the timeline, on the bare canvas or presenting. */
type DemoView = 'timeline' | 'canvas' | 'presenter';

const factories = {
  title: titleSequenceProject,
  playground: playgroundProject,
  orrery: orreryProject,
  printlab: printLabProject,
  plotter: plotterProject,
  cells: cellsProject,
  fireworks: fireworksProject,
  softcells: softCellsProject,
  liftsink: liftSinkProject,
  magnets: fridgeMagnetsProject,
  wires: wiresProject,
  shatter: shatterProject,
};

export type DemoName = keyof typeof factories;

const views: Record<DemoName, DemoView> = {
  title: 'timeline',
  playground: 'presenter',
  orrery: 'canvas',
  printlab: 'canvas',
  plotter: 'canvas',
  cells: 'canvas',
  fireworks: 'canvas',
  softcells: 'canvas',
  liftsink: 'canvas',
  magnets: 'canvas',
  wires: 'canvas',
  shatter: 'timeline',
};

const isDemoName = (which: string): which is DemoName => Object.hasOwn(factories, which);
const metadata = demoMetadata.map((demo) => {
  if (!isDemoName(demo.which)) throw new Error(`Unknown demo metadata key: ${demo.which}`);
  return { ...demo, which: demo.which };
});

/** Shared by the menus and loader: metadata lives in JSON; scene factories and presentation stay in code. */
export const DEMOS = metadata.map((demo) => ({
  ...demo,
  create: factories[demo.which],
  view: views[demo.which],
}));
