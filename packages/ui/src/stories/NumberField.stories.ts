import type { Meta, StoryObj } from '@storybook/svelte-vite';
import NumberField from '../lib/NumberField.svelte';

const meta = {
  title: 'Controls/NumberField',
  component: NumberField,
  args: { value: 0.5, step: 0.01, label: 'Value' },
  parameters: {
    docs: {
      description: {
        component:
          'Drag horizontally to change the value (Shift ×10, Alt ×0.1). Click to type, Enter to commit, Esc to cancel. Arrow keys nudge.',
      },
    },
  },
} satisfies Meta<typeof NumberField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithUnit: Story = { args: { value: 90, step: 1, unit: '°' } };
export const Clamped: Story = { args: { value: 0.5, min: 0, max: 1 } };
export const Error: Story = { args: { error: true } };
export const Disabled: Story = { args: { disabled: true } };
