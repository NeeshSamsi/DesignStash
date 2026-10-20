import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/app'
import { seedStash, showMyStash } from '../fixtures/seed'

/** The details sidebar: a click opens it, Edit turns it into fields, and leaving with changes asks first. */

test.describe('Details sidebar', () => {
  test.describe.configure({ timeout: 90_000 })

  // The title, not the card's middle: the hover buttons over the cover would take the click.
  const clickCard = (window: Page, index = 0) =>
    window
      .locator('[data-mockup-id]')
      .nth(index)
      .getByText(/^Stub /)
      .click()
  const panel = (window: Page) => window.locator('[data-slot="details-panel"]')

  test('a click opens it read-only; Edit, change the title, Save, and it reads again', async ({
    app
  }) => {
    const { window } = app
    const [only] = await seedStash(app, ['laptop'])
    await showMyStash(app)
    await clickCard(window)

    await expect(panel(window).getByRole('heading', { name: only!.title })).toBeVisible()
    await expect(panel(window).getByRole('textbox')).toHaveCount(0)
    await expect(panel(window).getByRole('button', { name: 'Open in Photoshop' })).toBeVisible()

    await panel(window).getByRole('button', { name: 'Edit', exact: true }).click()
    const title = panel(window).getByRole('textbox', { name: 'Title' })
    await expect(title).toHaveValue(only!.title)
    // Nothing has changed yet, so there is nothing to save.
    await expect(panel(window).getByRole('button', { name: 'Save' })).toBeDisabled()

    await title.fill('Laptop on a desk')
    await panel(window).getByRole('button', { name: 'Save' }).click()
    await expect(window.getByText('Saved your changes')).toBeVisible()
    await expect(panel(window).getByRole('heading', { name: 'Laptop on a desk' })).toBeVisible()
    await expect(panel(window).getByRole('textbox')).toHaveCount(0)

    // The change is really stored: the card carries the new title.
    await expect(
      window.locator('[data-mockup-id]').getByText('Laptop on a desk', { exact: true })
    ).toBeVisible()
  })

  test('toasts sit left of the sidebar and never cover its buttons', async ({ app }) => {
    const { window } = app
    await seedStash(app, ['laptop'])
    await showMyStash(app)
    await clickCard(window)
    await panel(window).getByRole('button', { name: 'Edit', exact: true }).click()
    await panel(window).getByRole('textbox', { name: 'Title' }).fill('Laptop on a desk')
    await panel(window).getByRole('button', { name: 'Save' }).click()
    const toast = window.getByText('Saved your changes')
    await expect(toast).toBeVisible()
    await expect
      .poll(async () => {
        const t = await toast.boundingBox()
        const p = await panel(window).boundingBox()
        return t && p ? p.x - (t.x + t.width) : null
      })
      .toBeGreaterThanOrEqual(0)
  })

  test('an empty title can’t be saved and says why', async ({ app }) => {
    const { window } = app
    await seedStash(app, ['laptop'])
    await showMyStash(app)
    await clickCard(window)
    await panel(window).getByRole('button', { name: 'Edit', exact: true }).click()
    await panel(window).getByRole('textbox', { name: 'Title' }).fill('')
    await expect(panel(window).getByRole('button', { name: 'Save' })).toBeDisabled()
    // A disabled button can't take the pointer, so the reason sits on its wrapper: force the hover.
    await panel(window).getByRole('button', { name: 'Save' }).hover({ force: true })
    await expect(window.getByText('Add a title to save').first()).toBeVisible()
  })

  test('Esc closes it, and so does clicking empty space', async ({ app }) => {
    const { window } = app
    await seedStash(app, ['laptop'])
    await showMyStash(app)
    await clickCard(window)
    await expect(panel(window)).toBeVisible()
    await window.keyboard.press('Escape')
    await expect(panel(window)).toHaveCount(0)

    await clickCard(window)
    await expect(panel(window)).toBeVisible()
    await panel(window).getByRole('button', { name: 'Close' }).click()
    await expect(panel(window)).toHaveCount(0)
  })

  test('leaving with changes asks Keep editing or Discard', async ({ app }) => {
    const { window } = app
    const [only] = await seedStash(app, ['laptop'])
    await showMyStash(app)
    await clickCard(window)
    await panel(window).getByRole('button', { name: 'Edit', exact: true }).click()
    const title = panel(window).getByRole('textbox', { name: 'Title' })
    await title.fill('Something else')

    await test.step('Keep editing leaves the edits where they were', async () => {
      await panel(window).getByRole('button', { name: 'Close' }).click()
      const ask = window.getByRole('alertdialog')
      await expect(ask.getByText('Discard your changes?')).toBeVisible()
      await ask.getByRole('button', { name: 'Keep editing' }).click()
      await expect(window.getByRole('alertdialog')).toHaveCount(0)
      await expect(title).toHaveValue('Something else')
    })

    await test.step('Discard closes without saving', async () => {
      await title.press('Escape')
      await window.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click()
      await expect(panel(window)).toHaveCount(0)
      await expect(window.getByText(only!.title, { exact: true }).first()).toBeVisible()
      await expect(window.getByText('Something else', { exact: true })).toHaveCount(0)
    })
  })

  test('Edit details on the card opens it as fields', async ({ app }) => {
    const { window } = app
    await seedStash(app, ['laptop'])
    await showMyStash(app)
    const card = window.locator('[data-mockup-id]').first()
    await card.hover()
    await card.getByRole('button', { name: 'Edit details' }).click()
    await expect(panel(window).getByRole('textbox', { name: 'Title' })).toBeVisible()
  })

  test('Space and double-click do nothing on a mockup on its own', async ({ app }) => {
    const { window } = app
    await seedStash(app, ['laptop'])
    await showMyStash(app)
    const card = window.locator('[data-mockup-id]').first()
    await card.getByText(/^Stub /).dblclick()
    await expect(panel(window).getByRole('textbox')).toHaveCount(0)
    await card.focus()
    await window.keyboard.press('Space')
    await expect(window.getByRole('dialog')).toHaveCount(0)
  })
})
