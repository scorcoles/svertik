import type { Meta, StoryObj } from '@storybook/svelte-vite';
import ColorField from '../lib/ColorField.svelte';

const meta = { title: 'Controls/ColorField', component: ColorField, args: { value: '#09fdd1', label: 'Color' } } satisfies Meta<typeof ColorField>;
export default meta;

export const Default: StoryObj<typeof meta> = {};
