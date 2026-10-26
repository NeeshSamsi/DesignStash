import type { Locator, Page } from '@playwright/test'
import { test, expect } from '../fixtures/app'
// Real mockups from the test set when it is there, else generated ones (seedStash).
import { CARD_TITLE, seedStash, showMyStash } from '../fixtures/seed'

/**
 * Every click on a card opens the details sidebar for it, wherever on the card it lands: the cover
 * (above the hover buttons too, where the scrim used to swallow it), the title, the padding and a
 * pile's stacked edges. Clicking another card switches the sidebar, every time, including right after
 * it opened while the panel is still morphing. The buttons on the card keep their own actions.
 */

const NAMES = ['can', 'pouch', 'leggings', 'laptop'] as const

const panel = (window: Page) => window.locator('[data-slot="details-panel"]')

/** Waits for the hover spring to settle, so a box measured now is where the click lands. */
async function settled(box: Locator) {
  await expect(async () => {
    const before = await box.boundingBox()
    await box.page().waitForTimeout(60)
    expect(await box.boundingBox()).toEqual(before)
  }).toPass()
  return (await box.boundingBox())!
}

type Part = (card: Locator) => Promise<void>

const PARTS: Record<string, Part> = {
  'the top of the cover': async (card) => {
    const cover = card.locator('[data-ds="CoverImage"]')
    await cover.click({ position: { x: 40, y: 16 } })
  },
  'the cover just above the hover buttons': async (card) => {
    await card.hover()
    const edit = await settled(card.getByRole('button', { name: 'Edit details' }))
    await card.page().mouse.click(edit.x + edit.width / 2, edit.y - 6)
  },
  'the title': async (card) => {
    await card.getByText(CARD_TITLE).click()
  },
  'the padding beside the cover': async (card) => {
    const face = card.locator(':scope > div').first()
    const box = (await face.boundingBox())!
    await face.click({ position: { x: 4, y: box.height / 3 } })
  }
}

test.describe('Card clicks', () => {
  test.describe.configure({ timeout: 120_000 })

  test('every part of a card opens the sidebar for it, and the next card switches it', async ({
    app
  }) => {
    const { window } = app
    await seedStash(app, [...NAMES])
    await showMyStash(app)
    const cards = window.locator('[data-mockup-id]')
    await expect(cards).toHaveCount(4)

    const titleOf = async (card: Locator) => (await card.getByText(CARD_TITLE).textContent())!
    const opensFor = async (card: Locator, how: string) =>
      await expect(
        panel(window).getByRole('heading', { name: await titleOf(card), exact: true }),
        how
      ).toBeVisible()

    for (const [name, click] of Object.entries(PARTS)) {
      await test.step(`${name}, on one card after another`, async () => {
        for (const index of [0, 2, 1, 3]) {
          const card = cards.nth(index)
          await click(card)
          await opensFor(card, `${name} of card ${index}`)
        }
      })
    }

    await test.step('a second card clicked while the sidebar is still opening', async () => {
      // Where the second card's title sits once the sidebar is open.
      const second = (await cards.nth(2).getByText(CARD_TITLE).boundingBox())!
      await window.keyboard.press('Escape')
      await expect(panel(window)).toHaveCount(0)
      await PARTS['the title']!(cards.nth(0))
      // Straight away, by coordinates: a locator click would wait for the morph to end first.
      await window.mouse.click(second.x + 10, second.y + second.height / 2)
      await opensFor(cards.nth(2), 'the second card, mid-morph')
    })

    await test.step('the hover buttons keep their own action', async () => {
      const card = cards.nth(1)
      await card.hover()
      await card.getByRole('button', { name: 'Edit details' }).click()
      await expect(panel(window).getByRole('textbox', { name: 'Title' })).toBeVisible()
    })
  })

  test('a pile opens from its cover, its title and its stacked edges', async ({ app }) => {
    const { window } = app
    await seedStash(app, [...NAMES])
    await showMyStash(app)
    const cards = window.locator('[data-mockup-id]')
    await expect(cards).toHaveCount(4)

    await cards.nth(0).getByText(CARD_TITLE).click()
    await cards
      .nth(1)
      .getByText(CARD_TITLE)
      .click({ modifiers: ['Meta'] })
    await window.keyboard.press('Meta+g')
    await expect(window.getByText('Pile made')).toBeVisible()
    await expect(cards).toHaveCount(3)

    const pile = window.locator('[data-mockup-id][data-pile]')
    const single = window.locator('[data-mockup-id]:not([data-pile])').first()
    const pileTitle = (await pile.getByText(CARD_TITLE).textContent())!
    const singleTitle = (await single.getByText(CARD_TITLE).textContent())!
    const shows = async (title: string, how: string) =>
      await expect(
        panel(window).getByRole('heading', { name: title, exact: true }),
        how
      ).toBeVisible()

    const ways: Record<string, () => Promise<void>> = {
      'its cover': () => PARTS['the top of the cover']!(pile),
      'its cover above the hover buttons': () =>
        PARTS['the cover just above the hover buttons']!(pile),
      'its title': () => PARTS['the title']!(pile),
      'its stacked edges': async () => {
        // The edges hang below the card's box; a press there used to land on the grid and close the sidebar.
        const box = (await pile.boundingBox())!
        await window.mouse.click(box.x + box.width / 2, box.y + box.height + 5)
      }
    }
    for (const [how, click] of Object.entries(ways)) {
      await single.getByText(CARD_TITLE).click()
      await shows(singleTitle, `${how}: the single first`)
      await click()
      await shows(pileTitle, how)
    }

    await test.step('a double-click still opens the pile’s page, even from a closed sidebar', async () => {
      await window.keyboard.press('Escape')
      await expect(panel(window)).toHaveCount(0)
      // The second click lands while the sidebar is still opening from the first.
      await pile.getByText(CARD_TITLE).dblclick()
      await expect(window.getByText(/Pile · .* · Esc to go back/)).toBeVisible()
    })
  })
})
