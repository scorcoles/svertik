import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Segmented from '../lib/Segmented.svelte';

const meta = {
  title: 'Controls/Segmented',
  component: Segmented,
  args: {
    value: 'horizontal',
    label: 'Axis',
    options: [
      { value: 'horizontal', label: 'Horizontal', icon: 'axis-h' },
      { value: 'vertical', label: 'Vertical', icon: 'axis-v' },
    ],
  },
} satisfies Meta<typeof Segmented>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Icons: Story = {};
export const Text: Story = {
  args: { value: 'in', label: 'Direction', options: [{ value: 'in', label: 'in' }, { value: 'out', label: 'out' }, { value: 'both', label: 'both' }] },
};
