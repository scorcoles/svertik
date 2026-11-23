import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Select from '../lib/Select.svelte';

const meta = {
  title: 'Controls/Select',
  component: Select,
  args: { value: 'horizontal', options: ['horizontal', 'vertical'], label: 'Axis' },
} satisfies Meta<typeof Select>;
export default meta;

export const Default: StoryObj<typeof meta> = {};
