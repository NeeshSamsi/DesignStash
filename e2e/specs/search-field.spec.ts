import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/app'

/**
 * The title-bar search takes a click anywhere it shows its hover: its border, its padding and the ⌘F
 * hint all focus the field. Playwright's clicks reach the page below the window's own drag handling,
 * so a click alone can't show that the window would not drag there. The drag region is read from the
 * styles instead: at every one of those points the nearest element with an app region says no-drag.
 */

/** The app region that decides what a press at (x, y) does: the nearest element that sets one. */
const regionAt = (window: Page, x: number, y: number) =>
  window.evaluate(
    ([x, y]) => {
      let el = document.elementFromPoint(x!, y!)
      while (el) {
        const region = getComputedStyle(el).getPropertyValue('-webkit-app-region')
        if (region && region !== 'none') return region
        el = el.parentElement
      }
      return 'none'
    },
    [x, y]
  )

test('the search field focuses from its border, padding and hint, and none of it drags the window', async ({
  app
}) => {
  const { window } = app
  const input = window.getByRole('textbox', { name: 'Search' })
  await expect(input).toBeVisible()
  const field = window.locator('[data-ds="GlobalSearch"] [data-slot="input-group"]')
  const box = (await field.boundingBox())!
  const hint = (await field.locator('[data-ds="KeyboardShortcut"]').boundingBox())!
  const middle = box.y + box.height / 2

  // The check can see a drag region: the title bar beside the field is one.
  expect(await regionAt(window, box.x - 40, middle), 'the bar beside the field').toBe('drag')

  const points: Record<string, [number, number]> = {
    'top border': [box.x + box.width / 2, box.y + 0.5],
    'bottom border': [box.x + box.width / 2, box.y + box.height - 0.5],
    'left border': [box.x + 0.5, middle],
    'right border': [box.x + box.width - 0.5, middle],
    'left padding': [box.x + 6, middle],
    'top padding': [box.x + box.width / 3, box.y + 4],
    'the ⌘F hint': [hint.x + hint.width / 2, hint.y + hint.height / 2]
  }
  for (const [name, [x, y]] of Object.entries(points)) {
    expect(await regionAt(window, x, y), `${name}: the window does not drag`).toBe('no-drag')
    await window.mouse.click(x, y)
    await expect(input, `${name}: focuses the field`).toBeFocused()
    // Esc on an empty field leaves it, ready for the next point.
    await window.keyboard.press('Escape')
    await expect(input).not.toBeFocused()
  }
})
