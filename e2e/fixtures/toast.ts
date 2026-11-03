import type { Page } from '@playwright/test'
import { expect } from './app'

/**
 * Presses a toast's Undo. Toasts slide and restack while they settle, which Playwright reads as
 * "not stable" and waits on for good. So this checks what a click needs instead: once the toast has
 * stopped sliding, the button is the topmost thing at its centre (nothing, such as a modal's layer,
 * covers it). The check is retried for a moment because mid-slide the point can still be empty.
 * Then it clicks without waiting for Playwright's own stability check.
 */
export async function clickUndo(window: Page): Promise<void> {
  const undo = window.getByRole('button', { name: 'Undo' })
  await expect(undo).toBeVisible()
  await expect
    .poll(
      () =>
        undo.evaluate((button) => {
          const box = button.getBoundingClientRect()
          const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
          if (top !== null && (top === button || button.contains(top))) return 'reachable'
          return `covered by ${top ? top.outerHTML.slice(0, 120) : 'nothing (off screen?)'}`
        }),
      { message: 'Undo can be clicked', timeout: 4000 }
    )
    .toBe('reachable')
  await undo.click({ force: true })
}
