import type { Meta, StoryObj } from '@storybook/svelte-vite';
import SectionDemo from './SectionDemo.svelte';

const meta = { title: 'Editor/Section', component: SectionDemo } satisfies Meta<typeof SectionDemo>;
export default meta;

export const Default: StoryObj<typeof meta> = {};
