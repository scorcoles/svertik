import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Button from '../lib/Button.svelte';

const meta = {
  title: 'Controls/Button',
  component: Button,
  args: { label: 'Export SVG', kind: 'primary' },
  argTypes: { kind: { control: 'inline-radio', options: ['primary', 'secondary'] } },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { label: 'Copy JSON', kind: 'secondary' } };
export const Disabled: Story = { args: { label: 'Export SVG', disabled: true } };
