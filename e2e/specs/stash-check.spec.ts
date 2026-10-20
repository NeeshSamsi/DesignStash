import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { test, expect, makePsds, type E2EApp } from '../fixtures/app'
import { clickUndo } from '../fixtures/toast'

/**
 * Stash check: a PSD that turns up in the stash folder can be added (it lands in To sort) or
 * ignored, and Ignore all can be undone. The stray files are dropped into the stash folder behind
 * the app's back, the way a person might.
 */

/** PSDs placed where the stash check looks: <stash>/mockups/<folder>/. */
function dropStrays(app: E2EApp, names: string[]): void {
  makePsds(join(app.stash, 'mockups', `stray-${Date.now()}`), names)
}

/**
 * The launch check: reloading starts the app's window again, which checks the stash folder against
 * its records. A blocking modal lists what it found.
 */
async function reviewFindings(window: Page): Promise<Locator> {
  await window.reload()
  const modal = window.getByRole('dialog', { name: 'Stash check' })
  await expect(modal.getByText('Found in your stash folder').first()).toBeVisible()
  return modal
}

test.describe('Stash check', () => {
  test.describe.configure({ timeout: 90_000 })

  test('Add puts a found file in To sort', async ({ app }) => {
    const { window } = app
    dropStrays(app, ['stray_one'])
    const modal = await reviewFindings(window)

    await expect(modal.getByText('stray_one', { exact: true })).toBeVisible()
    await modal.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(window.getByText('Added 1 file to To sort')).toBeVisible()
    await expect(modal.getByText('stray_one', { exact: true })).toHaveCount(0)
    await expect(modal.getByRole('button', { name: 'Done' })).toBeEnabled()
    await modal.getByRole('button', { name: 'Done' }).click()

    // Like anything you gather, it waits in To sort.
    const counts = await app.invoke<{ toSort: number }>('inbox:get-counts')
    expect(counts.data?.toSort).toBe(1)
    await window.getByRole('button', { name: /^To sort/ }).click()
    await expect(window.getByText('stray_one', { exact: true })).toBeVisible()
  })

  test('Ignore all clears every found file at once, and Undo brings them back', async ({ app }) => {
    const { window } = app
    dropStrays(app, ['stray_one', 'stray_two'])
    const modal = await reviewFindings(window)

    await expect(modal.getByText('stray_one', { exact: true })).toBeVisible()
    await expect(modal.getByText('stray_two', { exact: true })).toBeVisible()

    await modal.getByRole('button', { name: 'Ignore all' }).click()
    await expect(window.getByText('Ignored 2 changes')).toBeVisible()
    await expect(modal.getByText('stray_one', { exact: true })).toHaveCount(0)
    await expect(modal.getByRole('button', { name: 'Done' })).toBeEnabled()

    await clickUndo(window)
    await expect(modal.getByText('stray_one', { exact: true })).toBeVisible()
    await expect(modal.getByText('stray_two', { exact: true })).toBeVisible()
    // Nothing was added to To sort by ignoring.
    const counts = await app.invoke<{ toSort: number }>('inbox:get-counts')
    expect(counts.data?.toSort).toBe(0)
  })
})
