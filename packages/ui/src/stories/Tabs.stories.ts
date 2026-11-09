import type { Meta, StoryObj } from '@storybook/svelte-vite';
import TabsDemo from './TabsDemo.svelte';

const meta = { title: 'Controls/Tabs', component: TabsDemo } satisfies Meta<typeof TabsDemo>;
export default meta;

export const Default: StoryObj<typeof meta> = {};
