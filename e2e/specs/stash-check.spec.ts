import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { test, expect, makePsds, type E2EApp } from '../fixtures/app'

/**
 * Stash check: a PSD that turns up in the stash folder can be added (it lands in To sort) or
 * ignored, and Ignore all can be undone. The stray files are dropped into the stash folder behind
 * the app's back, the way a person might.
 */

/** PSDs placed where the stash check looks: <stash>/mockups/<folder>/. */
function dropStrays(app: E2EApp, names: string[]): void {
  makePsds(join(app.stash, 'mockups', `stray-${Date.now()}`), names)
}

/** Settings › My Stash › Check now, then Review… on what it found. */
async function reviewFindings(window: Page, count: number): Promise<Locator> {
  await window.getByRole('button', { name: 'Settings' }).click()
  const settings = window.getByRole('dialog')
  await settings.getByRole('button', { name: 'My Stash', exact: true }).click()
  await settings.getByRole('button', { name: 'Check now' }).click()
  await expect(settings.getByText(`${count} to review`)).toBeVisible()
  await settings.getByRole('button', { name: 'Review…' }).click()
  const modal = window.getByRole('dialog').filter({ hasText: 'Found in your stash folder' })
  await expect(modal).toBeVisible()
  return modal
}

test.describe('Stash check', () => {
  test.describe.configure({ timeout: 90_000 })

  test('Add puts a found file in To sort, with Undo', async ({ app }) => {
    const { window } = app
    dropStrays(app, ['stray_one'])
    const modal = await reviewFindings(window, 1)

    await expect(modal.getByText('stray_one', { exact: true })).toBeVisible()
    await expect(modal.getByText('1 left')).toBeVisible()
    await modal.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(window.getByText('Added 1 file to To sort')).toBeVisible()
    await expect(modal.getByText('stray_one', { exact: true })).toHaveCount(0)
    await expect(modal.getByRole('button', { name: 'Done' })).toBeEnabled()
    await modal.getByRole('button', { name: 'Done' }).click()

    // Like anything you gather, it waits in To sort.
    const counts = await app.invoke<{ toSort: number }>('inbox:get-counts')
    expect(counts.data?.toSort).toBe(1)
    await window.keyboard.press('Escape')
    await window.getByRole('button', { name: /^To sort/ }).click()
    await expect(window.getByText('stray_one', { exact: true })).toBeVisible()
  })

  test('Ignore all clears every found file at once, and Undo brings them back', async ({ app }) => {
    const { window } = app
    dropStrays(app, ['stray_one', 'stray_two'])
    const modal = await reviewFindings(window, 2)

    await expect(modal.getByText('stray_one', { exact: true })).toBeVisible()
    await expect(modal.getByText('stray_two', { exact: true })).toBeVisible()

    await modal.getByRole('button', { name: 'Ignore all' }).click()
    await expect(window.getByText('Ignored 2 changes')).toBeVisible()
    await expect(modal.getByText('stray_one', { exact: true })).toHaveCount(0)
    await expect(modal.getByRole('button', { name: 'Done' })).toBeEnabled()

    await window.getByRole('button', { name: 'Undo' }).click()
    await expect(modal.getByText('stray_one', { exact: true })).toBeVisible()
    await expect(modal.getByText('stray_two', { exact: true })).toBeVisible()
    // Nothing was added to To sort by ignoring.
    const counts = await app.invoke<{ toSort: number }>('inbox:get-counts')
    expect(counts.data?.toSort).toBe(0)
  })
})
