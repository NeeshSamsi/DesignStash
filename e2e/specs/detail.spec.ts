import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import sharp from 'sharp'
import { test, expect } from '../fixtures/app'
// Real mockups from the test set when it is there, else generated ones (seedStash).
import { CARD_TITLE, seedStash, showMyStash } from '../fixtures/seed'

/** The details sidebar: a click opens it, Edit turns it into fields, and leaving with changes asks first. */

test.describe('Details sidebar', () => {
  test.describe.configure({ timeout: 90_000 })

  // The title, not the card's middle: the hover buttons over the cover would take the click.
  const clickCard = (window: Page, index = 0) =>
    window.locator('[data-mockup-id]').nth(index).getByText(CARD_TITLE).click()
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

  test('the cover is replaceable in edit mode only, and a change applies at once with Undo', async ({
    app
  }) => {
    const { window } = app
    await seedStash(app, ['laptop'])
    await showMyStash(app)
    await clickCard(window)
    await expect(panel(window).getByRole('button', { name: 'Replace' })).toHaveCount(0)

    await panel(window).getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(panel(window).getByRole('button', { name: 'Replace' })).toBeAttached()

    const dir = join(app.userData, 'covers-e2e')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'cover.png')
    await sharp({ create: { width: 900, height: 600, channels: 3, background: '#c97b4a' } })
      .png()
      .toFile(file)
    await panel(window).locator('input[type="file"]').setInputFiles(file)

    await expect(window.getByText('Cover replaced')).toBeVisible()
    await expect(panel(window).getByText('Uploaded')).toBeVisible()
    // Not a form edit: nothing to save.
    await expect(panel(window).getByRole('button', { name: 'Save' })).toBeDisabled()

    await window.getByRole('button', { name: 'Undo' }).click()
    await expect(panel(window).getByText('Uploaded')).toBeHidden()
  })

  test('Remove from pile takes a mockup out with Undo; a pile of two dissolves', async ({
    app
  }) => {
    const { window } = app
    await seedStash(app, ['laptop', 'imac', 'poster'])
    await showMyStash(app)
    const cards = window.locator('[data-mockup-id]')
    await clickCard(window, 0)
    await clickCard(window, 1)
    await window.keyboard.down('Meta')
    await clickCard(window, 2)
    await window.keyboard.up('Meta')
    await window.keyboard.press('Meta+a')
    await window.keyboard.press('Meta+g')
    await expect(window.getByText('Pile made')).toBeVisible()
    await expect(cards).toHaveCount(1)

    await cards.first().getByText(CARD_TITLE).dblclick()
    await expect(window.getByText('Pile · 3 mockups · Esc to go back')).toBeVisible()

    // Nothing scrolls sideways on the pile page, with the sidebar open or shut.
    const sideways = () =>
      window.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('main *')]
          .filter(
            (el) =>
              el.scrollWidth > el.clientWidth + 1 &&
              !['visible', 'hidden', 'clip'].includes(getComputedStyle(el).overflowX)
          )
          .map(
            (el) =>
              `${el.tagName}.${String(el.className).slice(0, 80)} ${el.scrollWidth}>${el.clientWidth}`
          )
      )
    await expect.poll(sideways).toEqual([])

    await cards.nth(2).click({ button: 'right' })
    await window.getByRole('menuitem', { name: 'Remove from pile' }).click()
    await expect(window.getByText('Removed from the pile')).toBeVisible()
    await expect(window.getByText('Pile · 2 mockups · Esc to go back')).toBeVisible()

    await window
      .locator('[data-sonner-toast]')
      .filter({ hasText: 'Removed from the pile' })
      .getByRole('button', { name: 'Undo' })
      .click()
    await expect(window.getByText('Pile · 3 mockups · Esc to go back')).toBeVisible()

    await cards.nth(1).click({ button: 'right' })
    await window.getByRole('menuitem', { name: 'Remove from pile' }).click()
    await cards.nth(1).click({ button: 'right' })
    await window.getByRole('menuitem', { name: 'Remove from pile' }).click()
    // One left is no pile: back in My Stash with every mockup on its own.
    await expect(window.getByText('Pile · ')).toHaveCount(0)
    await expect(cards).toHaveCount(3)
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

  test('clicking empty space in the grid, below the cards, deselects and closes it', async ({
    app
  }) => {
    const { window } = app
    await seedStash(app, ['laptop'])
    await showMyStash(app)
    await clickCard(window)
    await expect(panel(window)).toBeVisible()
    // Let the open transition finish: a click while it runs is covered by its own test below.
    await expect(window.locator('html')).not.toHaveAttribute('data-panel-motion', /.+/)
    const grid = window.locator('[data-ds="MockupGrid"]')
    const box = (await grid.boundingBox())!
    // Well below the one card row.
    await window.mouse.click(box.x + box.width / 2, box.y + box.height - 20)
    await expect(panel(window)).toHaveCount(0)
    await expect(window.locator('[data-mockup-id][data-state="selected"]')).toHaveCount(0)
    // The outline is for the keyboard: a mouse click leaves the grid without one.
    expect(await grid.evaluate((el) => el.matches(':focus-visible'))).toBe(false)
  })

  test('resizing the window re-flows the grid, with the sidebar open or closed', async ({
    app
  }) => {
    const { window } = app
    await seedStash(app, ['laptop', 'imac', 'poster'])
    await showMyStash(app)
    const resize = async (width: number, height: number) => {
      await app.app.evaluate(
        ({ BrowserWindow }, [w, h]) => {
          const win = BrowserWindow.getAllWindows()[0]
          win?.setSize(w as number, h as number)
          win?.center()
        },
        [width, height] as const
      )
      await expect
        .poll(() => window.evaluate(() => [self.innerWidth, self.innerHeight]))
        .toEqual([width, height])
    }
    // Everything fits the content panel: the toolbar and its sort control are whole, nothing scrolls sideways.
    const fits = async (what: string) => {
      // The grid fills the content panel's padding box (28px each side, a little slack for a scrollbar).
      await expect
        .poll(
          async () => {
            const m = (await window.locator('main').boundingBox())!
            const g = (await window.locator('[data-ds="MockupGrid"]').boundingBox())!
            return m.x + m.width - (g.x + g.width)
          },
          { message: `${what}: the grid fills the panel` }
        )
        .toBeLessThanOrEqual(40)
      await window.waitForTimeout(500)
      const main = (await window.locator('main').boundingBox())!
      const toolbar = (await window.locator('[data-ds="LibraryToolbar"]').boundingBox())!
      const sort = (await window
        .locator('[data-ds="LibraryToolbar"]')
        .getByText('Date added')
        .boundingBox())!
      for (const [name, box] of [
        ['toolbar', toolbar],
        ['sort control', sort]
      ] as const) {
        expect(box.x, `${what}: ${name} left edge`).toBeGreaterThanOrEqual(main.x)
        expect(box.x + box.width, `${what}: ${name} right edge`).toBeLessThanOrEqual(
          main.x + main.width + 1
        )
      }
      const overflowing = await window.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('main *')]
          .filter(
            (el) =>
              el.scrollWidth > el.clientWidth + 1 &&
              !['visible', 'hidden', 'clip'].includes(getComputedStyle(el).overflowX)
          )
          .map(
            (el) =>
              `${el.tagName}.${String(el.className).slice(0, 80)} ${el.scrollWidth}>${el.clientWidth}`
          )
      )
      expect(overflowing, `${what}: nothing scrolls sideways`).toEqual([])
      const grid = (await window.locator('[data-ds="MockupGrid"]').boundingBox())!
      expect(grid.x + grid.width, `${what}: grid right edge`).toBeLessThanOrEqual(
        main.x + main.width + 1
      )
    }

    await resize(1440, 900)
    await clickCard(window)
    await expect(panel(window)).toBeVisible()
    await fits('wide, sidebar open')
    // Shrink with the sidebar open: the grid follows the container, it does not keep its old width.
    await resize(1088, 680)
    await fits('1088×680, sidebar open')
    await panel(window).getByRole('button', { name: 'Close' }).click()
    await expect(panel(window)).toHaveCount(0)
    await fits('1088×680, sidebar closed')
    await clickCard(window)
    await expect(panel(window)).toBeVisible()
    await fits('1088×680, sidebar opened again')
    // And back wider with it open: the grid grows into the room instead of keeping its old width.
    await resize(1440, 900)
    await fits('wide again, sidebar open')
  })

  test('below the window minimum nothing is cut off: the sidebar stays whole and the grid drops to one column', async ({
    app
  }) => {
    const { window } = app
    await seedStash(app, ['laptop', 'imac', 'poster'])
    await showMyStash(app)
    // A window made before the minimum changed can be narrower than it: lift the minimum to test that.
    await app.app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win?.setMinimumSize(0, 0)
      win?.setSize(990, 680)
    })
    await expect.poll(() => window.evaluate(() => self.innerWidth)).toBe(990)
    await clickCard(window)
    await expect(panel(window)).toBeVisible()
    await window.waitForTimeout(500)
    const box = (await panel(window).boundingBox())!
    expect(box.x, 'sidebar left edge').toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, 'sidebar right edge').toBeLessThanOrEqual(990 + 1)
    expect(box.width, 'sidebar keeps its width').toBeGreaterThanOrEqual(379)
    const buttons = (await panel(window)
      .getByRole('button', { name: 'Open in Photoshop' })
      .boundingBox())!
    expect(buttons.x + buttons.width, 'its buttons are whole').toBeLessThanOrEqual(990 + 1)
    const columns = await window.evaluate(() => {
      const cards = [...document.querySelectorAll<HTMLElement>('[data-mockup-id]')]
      return new Set(cards.map((el) => Math.round(el.getBoundingClientRect().left))).size
    })
    expect(columns, 'one column of cards').toBe(1)
  })

  test('opening and closing morph the page in a view transition, and leave no names behind', async ({
    app
  }) => {
    const { window } = app
    await seedStash(app, ['laptop', 'imac'])
    await showMyStash(app)
    const settled = async () => {
      await expect(window.locator('html')).not.toHaveAttribute('data-panel-motion', /.+/)
      const left = await window.evaluate(
        () =>
          [...document.querySelectorAll<HTMLElement>('[data-mockup-id]')].filter(
            (el) => el.style.viewTransitionName !== ''
          ).length
      )
      expect(left, 'no card keeps a transition name once it has finished').toBe(0)
      // The header and toolbar are never inside a scaled group, and nothing keeps a mover's name.
      const names = await window.evaluate(() => {
        const named = (el: Element | null) => {
          for (let node = el; node; node = node.parentElement) {
            const name = (node as HTMLElement).style?.viewTransitionName
            if (name) return name
          }
          return ''
        }
        return {
          header: named(document.querySelector('[data-ds="PageHeader"] h1')),
          toolbarEnd: named(document.querySelector('[data-ds="LibraryToolbar"] > :last-child'))
        }
      })
      expect(names.header, 'the header is in no named group').toBe('')
      expect(names.toolbarEnd, 'the toolbar end is unnamed once finished').toBe('')
    }
    await clickCard(window)
    await expect(panel(window)).toBeVisible()
    await settled()
    // Clicks keep working while it morphs: the next card is picked straight away, and so is empty space.
    await clickCard(window, 1)
    await expect(panel(window).getByRole('heading', { name: CARD_TITLE })).toBeVisible()
    const grid = window.locator('[data-ds="MockupGrid"]')
    const box = (await grid.boundingBox())!
    await window.mouse.click(box.x + box.width / 2, box.y + box.height - 20)
    await expect(panel(window)).toHaveCount(0)
    await settled()
    await clickCard(window)
    await expect(panel(window)).toBeVisible()
    await window.keyboard.press('Escape')
    await expect(panel(window)).toHaveCount(0)
    await settled()
    // Opening and closing back to back ends in the closed layout.
    await clickCard(window)
    await window.keyboard.press('Escape')
    await expect(panel(window)).toHaveCount(0)
    await settled()
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
    await card.getByText(CARD_TITLE).dblclick()
    await expect(panel(window).getByRole('textbox')).toHaveCount(0)
    await card.focus()
    await window.keyboard.press('Space')
    await expect(window.getByRole('dialog')).toHaveCount(0)
  })
})
