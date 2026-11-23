import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Checkbox from '../lib/Checkbox.svelte';

const meta = {
  title: 'Controls/Checkbox',
  component: Checkbox,
  args: { checked: true, label: 'Enabled' },
} satisfies Meta<typeof Checkbox>;
export default meta;
type Story = StoryObj<typeof meta>;

export const On: Story = {};
export const Off: Story = { args: { checked: false } };
export const Disabled: Story = { args: { disabled: true } };
