export interface CanvasStatus {
  percent: number;
  width: number;
  height: number;
  cost: number | null;
  slow: boolean;
  /** No redraw for a moment: the cost shown is the last one's, nothing is being computed now. */
  idle: boolean;
  fit: () => void;
  actualSize: () => void;
  redraw: () => void;
  clearSelection: () => void;
}
