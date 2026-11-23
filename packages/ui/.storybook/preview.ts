import type { Preview } from '@storybook/svelte-vite';
import '../src/lib/base.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: { disable: true },
    controls: { expanded: true },
  },
};
export default preview;
