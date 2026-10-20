import type { Page } from '@playwright/test'
import { expect } from './app'

/**
 * Presses a toast's Undo. Toasts slide and restack while they settle, which Playwright reads as
 * "not stable" and waits on for good. So this checks what a click needs instead: the button is
 * on screen and is the topmost thing at its centre (nothing, such as a modal's layer, covers it),
 * then clicks without waiting for the slide to end.
 */
export async function clickUndo(window: Page): Promise<void> {
  const undo = window.getByRole('button', { name: 'Undo' })
  await expect(undo).toBeVisible()
  const reachable = await undo.evaluate((button) => {
    const box = button.getBoundingClientRect()
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return top !== null && (top === button || button.contains(top))
  })
  expect(reachable, 'Undo is not covered by anything').toBe(true)
  await undo.click({ force: true })
}
