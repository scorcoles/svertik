import type { Meta, StoryObj } from '@storybook/svelte-vite';
import PointField from '../lib/PointField.svelte';

const meta = {
  title: 'Controls/PointField',
  component: PointField,
  args: { value: [0.5, 0.5], label: 'Center' },
} satisfies Meta<typeof PointField>;
export default meta;

export const Default: StoryObj<typeof meta> = {};
