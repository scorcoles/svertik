<script lang="ts">
  import { icons, type IconName } from './icons';

  interface Props {
    name: IconName;
    /** Nombre accesible; sin él, el icono es decorativo. */
    label?: string;
    size?: number;
  }
  let { name, label, size = 16 }: Props = $props();
</script>

<svg
  class="sv-icon"
  width={size}
  height={size}
  viewBox="0 0 16 16"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : true}
>
  <path d={icons[name]} />
</svg>

<style>
  .sv-icon {
    flex: none;
    display: block;
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
    stroke-linecap: square;
    stroke-linejoin: miter;
  }
</style>
