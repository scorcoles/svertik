import type { Meta, StoryObj } from '@storybook/svelte-vite';
import StackItem from '../lib/StackItem.svelte';

const meta = {
  title: 'Editor/StackItem',
  component: StackItem,
  args: { label: 'Spherize', kind: 'deformer', icon: 'spherize', selected: false, enabled: true },
  argTypes: { kind: { control: 'inline-radio', options: ['object', 'deformer', 'generator'] } },
  parameters: {
    layout: 'padded',
    docs: { description: { component: 'The enable toggle shows on hover, focus, selection, or when the modifier is off. Keyboard: the row is a tree item (only the selected one is in the tab order); F2 renames and Delete removes; hide, lock and enable use the buttons in the row (no letter shortcuts, so a stray key cannot make artwork vanish). The buttons stay out of the tab order. The accessible name carries the state: "Spherize, deformer, off".' } },
  },
} satisfies Meta<typeof StackItem>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Deformer: Story = {};
export const Removable: Story = { args: { onremove: () => {} }, parameters: { docs: { description: { story: 'Hover the row to see the trash icon.' } } } };
export const Selected: Story = { args: { selected: true } };
export const Disabled: Story = { args: { enabled: false } };
export const Generator: Story = { args: { label: 'Crack', kind: 'generator', icon: 'crack' } };
export const ObjectExpanded: Story = { args: { label: 'logo.svg', kind: 'object', icon: 'object', expanded: true } };
export const ObjectCollapsed: Story = { args: { label: 'logo.svg', kind: 'object', icon: 'object', expanded: false } };
export const KeyboardActions: Story = {
  args: { label: 'logo.svg', kind: 'object', icon: 'object', selected: true, visible: true, onvisible: () => {}, onlock: () => {}, onrename: () => {}, onremove: () => {} },
  parameters: { docs: { description: { story: 'Focus the row (Tab), then try F2. Hover the row for its hide, lock and remove buttons.' } } },
};
export const HiddenAndLocked: Story = {
  args: { label: 'logo.svg', kind: 'object', icon: 'object', visible: false, onvisible: () => {}, locked: true, onlock: () => {} },
  parameters: { docs: { description: { story: 'Accessible name: "logo.svg, hidden, locked". The crossed eye and the lock stay visible because they report state.' } } },
};
