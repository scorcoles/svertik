import type { Meta, StoryObj } from '@storybook/svelte-vite';
import PaintFieldDemo from './PaintFieldDemo.svelte';

const meta = { title: 'Controls/PaintField', component: PaintFieldDemo } satisfies Meta<typeof PaintFieldDemo>;
export default meta;

export const Default: StoryObj<typeof meta> = {};
