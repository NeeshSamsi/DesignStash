import { test, expect } from '../fixtures/app'
import { makeTag, seedStash, tagMockup } from '../fixtures/seed'

/**
 * My Stash: selecting, making a pile, trashing with Undo, and filtering by tag.
 * Four mockups are stashed through the real pipeline before each test; the stub AI titles them
 * "Stub <file name>".
 */

const NAMES = ['phone_front', 'phone_side', 'phone_back', 'laptop']

test.describe('My Stash', () => {
  test.describe.configure({ timeout: 120_000 })

  test('selects with a click, ⌘-click and ⇧-click', async ({ app }) => {
    const { window } = app
    await seedStash(app, NAMES)
    await window.getByRole('button', { name: /^All/ }).click()
    const cards = window.locator('[data-mockup-id]')
    await expect(cards).toHaveCount(4)
    const selected = window.locator('[data-mockup-id][data-state="selected"]')

    await test.step('a click selects one card and replaces the selection', async () => {
      await cards.nth(0).click()
      await expect(selected).toHaveCount(1)
      await cards.nth(2).click()
      await expect(selected).toHaveCount(1)
      await expect(cards.nth(2)).toHaveAttribute('data-state', 'selected')
    })

    await test.step('⌘-click adds a card and takes it away again', async () => {
      await cards.nth(0).click({ modifiers: ['Meta'] })
      await expect(selected).toHaveCount(2)
      await cards.nth(2).click({ modifiers: ['Meta'] })
      await expect(selected).toHaveCount(1)
      await expect(cards.nth(0)).toHaveAttribute('data-state', 'selected')
    })

    await test.step('⇧-click selects the range from the last click', async () => {
      await cards.nth(0).click()
      await cards.nth(2).click({ modifiers: ['Shift'] })
      await expect(selected).toHaveCount(3)
      await expect(cards.nth(3)).not.toHaveAttribute('data-state', 'selected')
    })
  })

  test('⌘G makes a pile of the selection, and Undo splits it again', async ({ app }) => {
    const { window } = app
    await seedStash(app, NAMES)
    await window.getByRole('button', { name: /^All/ }).click()
    await expect(window.getByText('4 mockups', { exact: true })).toBeVisible()
    const cards = window.locator('[data-mockup-id]')

    await cards.nth(0).click()
    await cards.nth(1).click({ modifiers: ['Meta'] })
    await window.keyboard.press('Meta+g')

    // One card for the pile, however many mockups are in it.
    await expect(window.getByText('Pile made')).toBeVisible()
    await expect(window.getByText('3 mockups', { exact: true })).toBeVisible()
    await expect(cards).toHaveCount(3)

    await window.getByRole('button', { name: 'Undo' }).click()
    await expect(window.getByText('4 mockups', { exact: true })).toBeVisible()
    await expect(cards).toHaveCount(4)
  })

  test('Backspace moves the selection to Trash at once, with Undo', async ({ app }) => {
    const { window } = app
    const [front, , , laptop] = await seedStash(app, NAMES)
    await window.getByRole('button', { name: /^All/ }).click()
    const cards = window.locator('[data-mockup-id]')
    await expect(cards).toHaveCount(4)

    await cards.filter({ hasText: laptop!.title }).click()
    await window.keyboard.press('Backspace')

    // Reversible, so there is no confirm: the card goes and a toast offers Undo.
    await expect(window.getByRole('alertdialog')).toHaveCount(0)
    await expect(window.getByText('Moved to Trash')).toBeVisible()
    await expect(cards).toHaveCount(3)
    await expect(window.getByText(laptop!.title, { exact: true })).toHaveCount(0)
    await expect(window.getByText(front!.title, { exact: true })).toBeVisible()

    await window.getByRole('button', { name: 'Undo' }).click()
    await expect(cards).toHaveCount(4)
    await expect(window.getByText(laptop!.title, { exact: true })).toBeVisible()
  })

  test('filters by a tag, and by "All in <category>"', async ({ app }) => {
    const { window } = app
    const [front, side, back, laptop] = await seedStash(app, NAMES)
    const iphone = await makeTag(app, 'Device', 'iPhone')
    const macbook = await makeTag(app, 'Device', 'MacBook')
    const clay = await makeTag(app, 'Style', 'Clay')
    await tagMockup(app, front!, [iphone, clay])
    await tagMockup(app, side!, [iphone])
    await tagMockup(app, laptop!, [macbook])
    await tagMockup(app, back!, [clay])

    await window.getByRole('button', { name: /^All/ }).click()
    const cards = window.locator('[data-mockup-id]')
    await expect(cards).toHaveCount(4)

    await test.step('one tag narrows to the mockups that carry it', async () => {
      await window.getByRole('button', { name: /^Filter/ }).click()
      await window.getByText('iPhone', { exact: true }).click()
      await expect(cards).toHaveCount(2)
      await expect(window.getByText(front!.title, { exact: true })).toBeVisible()
      await expect(window.getByText(side!.title, { exact: true })).toBeVisible()
    })

    await test.step('every picked tag has to match', async () => {
      await window.getByText('Clay', { exact: true }).click()
      await expect(cards).toHaveCount(1)
      await expect(window.getByText(front!.title, { exact: true })).toBeVisible()
    })

    await test.step('Clear all brings every mockup back', async () => {
      await window.getByRole('button', { name: 'Clear all' }).click()
      await expect(cards).toHaveCount(4)
    })

    await test.step('"All in Device" includes every tag in the category', async () => {
      await window.getByText('All in Device', { exact: true }).click()
      // phone_front, phone_side and laptop have a Device tag; phone_back only has a Style one.
      await expect(cards).toHaveCount(3)
      await expect(window.getByText(back!.title, { exact: true })).toHaveCount(0)
    })
  })
})
