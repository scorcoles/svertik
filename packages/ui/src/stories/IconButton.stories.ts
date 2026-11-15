import type { Meta, StoryObj } from '@storybook/svelte-vite';
import IconButton from '../lib/IconButton.svelte';

const meta = { title: 'Controls/IconButton', component: IconButton, args: { icon: 'spherize', label: 'Add Spherize' } } satisfies Meta<typeof IconButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
export const Active: Story = { args: { active: true } };
export const Disabled: Story = { args: { disabled: true } };
export const AriaDisabled: Story = {
  args: { icon: 'align-left', label: 'Align left · select 2+ objects (⇧-click)', 'aria-disabled': true },
  parameters: {
    docs: {
      description: {
        story: 'Looks disabled but stays focusable and hoverable, so its label (with the reason) can still be read: native tooltips never show on `disabled` buttons. The click handler must ignore it.',
      },
    },
  },
};
