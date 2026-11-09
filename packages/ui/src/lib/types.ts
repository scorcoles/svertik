import type { IconName } from './icons';

export interface SegmentOption {
  value: string;
  label: string;
  /** Icono en lugar del texto; el texto queda como nombre accesible. */
  icon?: IconName;
}
