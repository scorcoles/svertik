import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Slider from '../lib/Slider.svelte';

const meta = {
  title: 'Controls/Slider',
  component: Slider,
  args: { value: 0.45, min: 0, max: 1, step: 0.01, label: 'Radius' },
} satisfies Meta<typeof Slider>;
export default meta;

export const Default: StoryObj<typeof meta> = {};
