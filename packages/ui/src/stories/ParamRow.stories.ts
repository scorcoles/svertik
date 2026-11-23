import type { Meta, StoryObj } from '@storybook/svelte-vite';
import ParamRowDemo from './ParamRowDemo.svelte';

const meta = { title: 'Editor/ParamRow', component: ParamRowDemo } satisfies Meta<typeof ParamRowDemo>;
export default meta;

export const Default: StoryObj<typeof meta> = {};
