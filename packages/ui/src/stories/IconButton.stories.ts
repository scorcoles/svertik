import type { Meta, StoryObj } from '@storybook/svelte-vite';
import IconButton from '../lib/IconButton.svelte';

const meta = { title: 'Controls/IconButton', component: IconButton, args: { icon: 'spherize', label: 'Add Spherize' } } satisfies Meta<typeof IconButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
export const Active: Story = { args: { active: true } };
export const Disabled: Story = { args: { disabled: true } };
