import type { IconName } from './icons';

export interface SegmentOption {
  value: string;
  label: string;
  /** Icon instead of the text; the text stays as the accessible name. */
  icon?: IconName;
}

/** A Select option: plain text, or a value shown with another label (an object id and its name). */
export type SelectOption = string | { value: string; label: string };

/** A titled block of options in a Select (e.g. the objects of one layer). */
export interface SelectGroup {
  group: string;
  options: readonly SelectOption[];
}

/**
 * Objects as Select options (value = id), under a heading per `group` (their layer), keeping
 * their order. Items without a group stay loose. Repeated names get "(2)", "(3)"… only within
 * the same group, where they would otherwise look identical.
 */
export function groupOptions(items: readonly { id: string; label: string; group?: string }[]): (SelectOption | SelectGroup)[] {
  const out: (SelectOption | SelectGroup)[] = [];
  const seen = new Map<string, number>();
  for (const item of items) {
    const key = `${item.group ?? ''}\u0000${item.label}`;
    const k = (seen.get(key) ?? 0) + 1;
    seen.set(key, k);
    const option = { value: item.id, label: k > 1 ? `${item.label} (${k})` : item.label };
    const last = out.at(-1);
    if (item.group === undefined) out.push(option);
    else if (typeof last === 'object' && 'group' in last && last.group === item.group) last.options = [...last.options, option];
    else out.push({ group: item.group, options: [option] });
  }
  return out;
}
