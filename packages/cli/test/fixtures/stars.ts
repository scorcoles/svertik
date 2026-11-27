// A svertikJS script for the CLI test: the default export is the scene.
import { scene, star } from '@svertik/js';

export default scene(
  { width: 200, height: 200, background: '#101010' },
  star('s', { fill: '#ff0055' }).twist({ angle: 30 }).to({ rotation: 90, duration: 1 }),
);
