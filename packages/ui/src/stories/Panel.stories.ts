import type { Meta, StoryObj } from '@storybook/svelte-vite';
import PanelDemo from './PanelDemo.svelte';

const meta = { title: 'Editor/Panel', component: PanelDemo } satisfies Meta<typeof PanelDemo>;
export default meta;

export const Default: StoryObj<typeof meta> = {};
