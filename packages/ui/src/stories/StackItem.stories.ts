import type { Meta, StoryObj } from '@storybook/svelte-vite';
import StackItem from '../lib/StackItem.svelte';

const meta = {
  title: 'Editor/StackItem',
  component: StackItem,
  args: { label: 'Spherize', kind: 'deformer', selected: false, enabled: true },
  argTypes: { kind: { control: 'inline-radio', options: ['object', 'deformer', 'generator'] } },
  parameters: {
    layout: 'padded',
    docs: { description: { component: 'The enable toggle shows on hover, focus, selection, or when the modifier is off.' } },
  },
} satisfies Meta<typeof StackItem>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Deformer: Story = {};
export const Selected: Story = { args: { selected: true } };
export const Disabled: Story = { args: { enabled: false } };
export const Generator: Story = { args: { label: 'Crack', kind: 'generator' } };
export const ObjectExpanded: Story = { args: { label: 'logo.svg', kind: 'object', expanded: true } };
export const ObjectCollapsed: Story = { args: { label: 'logo.svg', kind: 'object', expanded: false } };
