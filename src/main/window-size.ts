export interface Size {
  width: number
  height: number
}

/** The smallest the window can be resized to. */
export const MIN_WINDOW: Size = { width: 1024, height: 680 }

const DEFAULT_WINDOW: Size = { width: 1440, height: 900 }
const WORK_AREA_SHARE = 0.95

/**
 * The first-launch window: 1440×900, but no more than 95% of the display's work area, and never
 * below the minimum size. `workArea` is the display minus the menu bar and dock.
 */
export function initialWindowSize(workArea: Size): Size {
  const fit = (preferred: number, available: number, minimum: number): number =>
    Math.max(minimum, Math.min(preferred, Math.floor(available * WORK_AREA_SHARE)))
  return {
    width: fit(DEFAULT_WINDOW.width, workArea.width, MIN_WINDOW.width),
    height: fit(DEFAULT_WINDOW.height, workArea.height, MIN_WINDOW.height)
  }
}
