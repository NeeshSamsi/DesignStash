import { test, expect } from '../fixtures/app'
import { seedStash } from '../fixtures/seed'

/** Trash: Restore all (with Undo) and Empty Trash. */

test.describe('Trash', () => {
  test.describe.configure({ timeout: 120_000 })

  test('Restore all puts everything back, and Undo sends it to Trash again', async ({ app }) => {
    const { window } = app
    const seeded = await seedStash(app, ['phone_front', 'phone_side', 'laptop'])
    expect((await app.invoke('mockup:trash', { ids: seeded.map((s) => s.id) })).success).toBe(true)

    await window.getByRole('button', { name: /^Trash/ }).click()
    const cards = window.locator('[data-mockup-id]')
    await expect(cards).toHaveCount(3)

    await window.getByRole('button', { name: 'Restore all' }).click()
    await expect(window.getByText('Restored to My Stash')).toBeVisible()
    await expect(window.getByText('3 items')).toBeVisible()
    await expect(cards).toHaveCount(0)

    await window.getByRole('button', { name: 'Undo' }).click()
    await expect(cards).toHaveCount(3)

    // The change is real, not just the page: everything is back in My Stash after a restore.
    await window.getByRole('button', { name: 'Restore all' }).click()
    await window.getByRole('button', { name: /^All/ }).click()
    await expect(window.locator('[data-mockup-id]')).toHaveCount(3)
  })

  test('Empty Trash asks once, says what it frees, and deletes for good', async ({ app }) => {
    const { window } = app
    const seeded = await seedStash(app, ['phone_front', 'laptop'])
    expect((await app.invoke('mockup:trash', { ids: seeded.map((s) => s.id) })).success).toBe(true)

    await window.getByRole('button', { name: /^Trash/ }).click()
    await expect(window.locator('[data-mockup-id]')).toHaveCount(2)

    await window.getByRole('button', { name: 'Empty Trash' }).click()
    const ask = window.getByRole('alertdialog')
    await expect(ask.getByText('Empty Trash?')).toBeVisible()
    await expect(ask.getByText(/2 items will be deleted for good/)).toBeVisible()
    await expect(ask.getByText(/This can’t be undone/)).toBeVisible()

    await test.step('Cancel keeps everything', async () => {
      await ask.getByRole('button', { name: 'Cancel' }).click()
      await expect(window.getByRole('alertdialog')).toHaveCount(0)
      await expect(window.locator('[data-mockup-id]')).toHaveCount(2)
    })

    await test.step('Empty Trash deletes, and there is no Undo', async () => {
      await window.getByRole('button', { name: 'Empty Trash' }).click()
      await window.getByRole('alertdialog').getByRole('button', { name: 'Empty Trash' }).click()
      await expect(window.getByText('Trash emptied')).toBeVisible()
      await expect(window.getByRole('button', { name: 'Undo' })).toHaveCount(0)
      await expect(window.locator('[data-mockup-id]')).toHaveCount(0)
      const stats = await app.invoke<{ count: number }>('trash:stats')
      expect(stats.data?.count).toBe(0)
    })
  })
})
