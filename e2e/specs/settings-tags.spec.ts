import type { Locator, Page } from '@playwright/test'
import { test, expect } from '../fixtures/app'
// Real mockups from the test set when it is there, else generated ones (seedStash).
import { makeTag, seedStash, tagMockup } from '../fixtures/seed'
import { clickUndo } from '../fixtures/toast'

/**
 * Settings › Tags: two tiers (category, then tag), edited where they are. Add, rename, move, merge
 * and delete, with Undo for delete. The tags are made through the app's own channels first, and one
 * mockup carries "Zephyr Phone" so the merge has something to move.
 */

const tagRow = (dialog: Locator, label: string) =>
  dialog.locator('[data-tag]').filter({ hasText: label })

async function openTags(window: Page): Promise<Locator> {
  await window.getByRole('button', { name: 'Settings' }).click()
  const dialog = window.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Tags', exact: true }).click()
  await expect(dialog.getByRole('region', { name: 'Device' })).toBeVisible()
  return dialog
}

/** Right-click a tag; its menu opens at the pointer. */
async function openTagMenu(row: Locator): Promise<void> {
  await row.click({ button: 'right' })
}

/** Right-click a tag, then pick a row of its menu. */
async function tagMenu(window: Page, row: Locator, item: string): Promise<void> {
  await openTagMenu(row)
  await window.getByRole('menuitem', { name: item, exact: true }).click()
}

test.describe('Settings › Tags', () => {
  test.describe.configure({ timeout: 120_000 })

  test.beforeEach(async ({ app }) => {
    const [laptop] = await seedStash(app, ['laptop'])
    const iphone = await makeTag(app, 'Device', 'Zephyr Phone')
    await makeTag(app, 'Device', 'Zephyr Pad')
    await makeTag(app, 'Style', 'Zephyr Clay')
    await tagMockup(app, laptop!, [iphone])
  })

  test('shows one container per category with counts and its own Add tag row', async ({ app }) => {
    const dialog = await openTags(app.window)
    const device = dialog.getByRole('region', { name: 'Device' })
    await expect(device.getByText(/\d tags?/)).toBeVisible()
    await expect(tagRow(dialog, 'Zephyr Phone')).toContainText('1 mockup')
    await expect(tagRow(dialog, 'Zephyr Pad')).toContainText('0 mockups')
    for (const category of ['Device', 'Style']) {
      await expect(
        dialog.getByRole('region', { name: category }).getByRole('button', { name: 'Add tag' })
      ).toBeVisible()
    }
    await expect(dialog.getByRole('button', { name: 'New category' })).toBeVisible()
  })

  test('adds a tag where it will appear: Enter adds, the input stays open', async ({ app }) => {
    const dialog = await openTags(app.window)
    const device = dialog.getByRole('region', { name: 'Device' })

    await device.getByRole('button', { name: 'Add tag' }).click()
    const input = device.getByRole('textbox', { name: 'New tag in Device' })
    await input.fill('Zephyr Book')
    await input.press('Enter')

    await expect(tagRow(dialog, 'Zephyr Book')).toBeVisible()
    await expect(tagRow(dialog, 'Zephyr Book')).toContainText('0 mockups')
    // Ready for the next one, and empty.
    await expect(input).toHaveValue('')
    await input.press('Escape')
    await expect(device.getByRole('button', { name: 'Add tag' })).toBeVisible()
  })

  test('a tag that already exists elsewhere is moved, never created twice', async ({ app }) => {
    const dialog = await openTags(app.window)
    const device = dialog.getByRole('region', { name: 'Device' })

    await device.getByRole('button', { name: 'Add tag' }).click()
    await device.getByRole('textbox', { name: 'New tag in Device' }).fill('zephyr clay')
    await expect(device.getByText('Already in Style')).toBeVisible()
    await device.getByRole('textbox', { name: 'New tag in Device' }).press('Enter')
    await expect(device.locator('[data-tag]').filter({ hasText: /zephyr clay/i })).toHaveCount(0)

    await device.getByRole('button', { name: 'Move it to Device' }).click()
    await expect(device.locator('[data-tag]').filter({ hasText: 'Zephyr Clay' })).toHaveCount(1)
    await expect(
      dialog
        .getByRole('region', { name: 'Style' })
        .locator('[data-tag]')
        .filter({ hasText: 'Zephyr Clay' })
    ).toHaveCount(0)
  })

  test('pressing outside a tag menu closes only the menu, not Settings', async ({ app }) => {
    const { window } = app
    const dialog = await openTags(window)
    const menu = window.getByRole('menu')
    // An open menu hides the dialog from the accessibility tree, so it is found by its marker.
    const box = (await window.locator('[data-ds="SettingsModal"]').boundingBox())!
    // On the dialog's own header, then out on the dimmed window around it.
    for (const at of [
      { x: box.x + 300, y: box.y + 20 },
      { x: 3, y: 3 }
    ]) {
      await openTagMenu(tagRow(dialog, 'Zephyr Pad'))
      await expect(menu).toBeVisible()
      await window.mouse.click(at.x, at.y)
      await expect(menu).toHaveCount(0)
      await expect(dialog).toBeVisible()
    }
    // With no menu open, the same press outside closes Settings.
    await window.mouse.click(3, 3)
    await expect(window.getByRole('dialog')).toHaveCount(0)
  })

  test('renames a tag in place', async ({ app }) => {
    const { window } = app
    const dialog = await openTags(window)
    await tagMenu(window, tagRow(dialog, 'Zephyr Pad'), 'Rename')
    const input = dialog.getByRole('textbox', { name: 'Rename Zephyr Pad' })
    await expect(input).toHaveValue('Zephyr Pad')
    await input.fill('Zephyr Pad Pro')
    await input.press('Enter')
    await expect(tagRow(dialog, 'Zephyr Pad Pro')).toBeVisible()
    await expect(dialog.getByRole('textbox')).toHaveCount(0)
  })

  test('moves a tag to another category', async ({ app }) => {
    const { window } = app
    const dialog = await openTags(window)
    await openTagMenu(tagRow(dialog, 'Zephyr Pad'))
    await window.getByRole('menuitem', { name: 'Move to', exact: true }).hover()
    await window.getByRole('menuitem', { name: 'Style', exact: true }).click()

    await expect(
      dialog
        .getByRole('region', { name: 'Style' })
        .locator('[data-tag]')
        .filter({ hasText: 'Zephyr Pad' })
    ).toBeVisible()
    await expect(
      dialog
        .getByRole('region', { name: 'Device' })
        .locator('[data-tag]')
        .filter({ hasText: 'Zephyr Pad' })
    ).toHaveCount(0)
  })

  test('merging asks first, says how many mockups move, then joins the two names', async ({
    app
  }) => {
    const { window } = app
    const dialog = await openTags(window)
    await openTagMenu(tagRow(dialog, 'Zephyr Phone'))
    await window.getByRole('menuitem', { name: 'Merge into…', exact: true }).hover()
    await window.getByRole('menuitem', { name: 'Device · Zephyr Pad', exact: true }).click()

    const ask = window
      .getByRole('dialog')
      .filter({ hasText: 'Merge “Zephyr Phone” into “Zephyr Pad”?' })
    await expect(ask).toBeVisible()
    await expect(ask.getByText(/1 mockup will move to “Zephyr Pad”/)).toBeVisible()

    await test.step('Cancel changes nothing', async () => {
      await ask.getByRole('button', { name: 'Cancel' }).click()
      await expect(tagRow(dialog, 'Zephyr Phone')).toBeVisible()
    })

    await test.step('Merge moves the mockup and removes the source tag', async () => {
      await openTagMenu(tagRow(dialog, 'Zephyr Phone'))
      await window.getByRole('menuitem', { name: 'Merge into…', exact: true }).hover()
      await window.getByRole('menuitem', { name: 'Device · Zephyr Pad', exact: true }).click()
      await window
        .getByRole('dialog')
        .filter({ hasText: 'Merge “Zephyr Phone” into “Zephyr Pad”?' })
        .getByRole('button', { name: 'Merge', exact: true })
        .click()
      await expect(window.getByText('Merged “Zephyr Phone” into “Zephyr Pad”')).toBeVisible()
      await expect(tagRow(dialog, 'Zephyr Phone')).toHaveCount(0)
      await expect(tagRow(dialog, 'Zephyr Pad')).toContainText('1 mockup')
    })
  })

  test('deleting is instant, and Undo brings the tag back on its mockups', async ({ app }) => {
    const { window } = app
    const dialog = await openTags(window)
    await tagMenu(window, tagRow(dialog, 'Zephyr Phone'), 'Delete')

    // Reversible, so no confirm.
    await expect(window.getByText('Deleted “Zephyr Phone”')).toBeVisible()
    await expect(window.getByText('Removed from 1 mockup')).toBeVisible()
    await expect(tagRow(dialog, 'Zephyr Phone')).toHaveCount(0)

    await clickUndo(window)
    await expect(tagRow(dialog, 'Zephyr Phone')).toBeVisible()
    await expect(tagRow(dialog, 'Zephyr Phone')).toContainText('1 mockup')
  })

  test('a new category starts from the dashed row and closes the list', async ({ app }) => {
    const dialog = await openTags(app.window)
    await dialog.getByRole('button', { name: 'New category' }).click()
    const input = dialog.getByRole('textbox', { name: 'New category' })
    await input.fill('Colour')
    await input.press('Enter')
    await expect(dialog.getByRole('region', { name: 'Colour' })).toBeVisible()
    await expect(dialog.getByRole('region', { name: 'Colour' }).getByText('0 tags')).toBeVisible()
  })
})
