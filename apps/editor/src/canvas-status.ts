export interface CanvasStatus {
  percent: number;
  width: number;
  height: number;
  cost: number | null;
  slow: boolean;
  fit: () => void;
  actualSize: () => void;
  redraw: () => void;
  clearSelection: () => void;
}
