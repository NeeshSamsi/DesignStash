import { test, expect } from '../fixtures/app'
import { seedStash } from '../fixtures/seed'

/** Detail: edit the title, Save appears and saves, and closing with changes asks first. */

test.describe('Detail', () => {
  test.describe.configure({ timeout: 90_000 })

  test('Save appears once the title changes, saves, and goes away', async ({ app }) => {
    const { window } = app
    const [only] = await seedStash(app, ['laptop'])
    await window.getByRole('button', { name: /^All/ }).click()
    await window.locator('[data-mockup-id]').first().dblclick()

    const dialog = window.getByRole('dialog')
    const title = dialog.getByRole('textbox', { name: 'Title' })
    await expect(title).toHaveValue(only!.title)
    // Nothing has changed yet, so there is nothing to save.
    await expect(dialog.getByRole('button', { name: 'Save' })).toHaveCount(0)

    await title.fill('Laptop on a desk')
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(window.getByText('Saved your changes')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save' })).toHaveCount(0)

    // The change is really stored: close and the card carries the new title.
    await dialog.getByRole('button', { name: 'Close' }).first().click()
    await expect(window.getByRole('dialog')).toHaveCount(0)
    await expect(window.getByText('Laptop on a desk', { exact: true })).toBeVisible()
  })

  test('an empty title can’t be saved and says why', async ({ app }) => {
    const { window } = app
    await seedStash(app, ['laptop'])
    await window.getByRole('button', { name: /^All/ }).click()
    await window.locator('[data-mockup-id]').first().dblclick()

    const dialog = window.getByRole('dialog')
    await dialog.getByRole('textbox', { name: 'Title' }).fill('')
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Save' }).hover()
    await expect(window.getByText('Add a title to save')).toBeVisible()
  })

  test('closing with changes asks Keep editing or Discard', async ({ app }) => {
    const { window } = app
    const [only] = await seedStash(app, ['laptop'])
    await window.getByRole('button', { name: /^All/ }).click()
    await window.locator('[data-mockup-id]').first().dblclick()

    const dialog = window.getByRole('dialog')
    await dialog.getByRole('textbox', { name: 'Title' }).fill('Something else')

    await test.step('Keep editing leaves the edits where they were', async () => {
      await dialog.getByRole('button', { name: 'Close' }).first().click()
      const ask = window.getByRole('alertdialog')
      await expect(ask.getByText('Discard your changes?')).toBeVisible()
      await ask.getByRole('button', { name: 'Keep editing' }).click()
      await expect(window.getByRole('alertdialog')).toHaveCount(0)
      await expect(dialog.getByRole('textbox', { name: 'Title' })).toHaveValue('Something else')
    })

    await test.step('Discard closes without saving', async () => {
      await window.keyboard.press('Escape')
      await window.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click()
      await expect(window.getByRole('dialog')).toHaveCount(0)
      await expect(window.getByText(only!.title, { exact: true })).toBeVisible()
      await expect(window.getByText('Something else', { exact: true })).toHaveCount(0)
    })
  })

  test('closing without changes just closes', async ({ app }) => {
    const { window } = app
    await seedStash(app, ['laptop'])
    await window.getByRole('button', { name: /^All/ }).click()
    await window.locator('[data-mockup-id]').first().dblclick()
    await expect(window.getByRole('dialog')).toBeVisible()
    await window.keyboard.press('Escape')
    await expect(window.getByRole('dialog')).toHaveCount(0)
    await expect(window.getByRole('alertdialog')).toHaveCount(0)
  })
})
