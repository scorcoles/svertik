import type { Meta, StoryObj } from '@storybook/svelte-vite';
import IconsDemo from './IconsDemo.svelte';

const meta = { title: 'Icons/Icon', component: IconsDemo } satisfies Meta<typeof IconsDemo>;
export default meta;

export const All: StoryObj<typeof meta> = {};
