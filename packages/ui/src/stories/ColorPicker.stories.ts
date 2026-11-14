import type { Meta, StoryObj } from '@storybook/svelte-vite';
import ColorPicker from '../lib/ColorPicker.svelte';

const meta = {
  title: 'Controls/ColorPicker',
  component: ColorPicker,
  args: { value: '#09fdd1', width: 180 },
} satisfies Meta<typeof ColorPicker>;
export default meta;

export const Default: StoryObj<typeof meta> = {};

export const Warm: StoryObj<typeof meta> = {
  args: { value: '#ff6b5e', width: 180 },
};
