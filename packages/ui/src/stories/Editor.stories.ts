import type { Meta, StoryObj } from '@storybook/svelte-vite';
import EditorDemo from './EditorDemo.svelte';

const meta = {
  title: 'Editor/Live',
  component: EditorDemo,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof EditorDemo>;
export default meta;

export const StackAndAttributes: StoryObj<typeof meta> = {};
