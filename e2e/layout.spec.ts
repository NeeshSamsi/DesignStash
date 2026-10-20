/// <reference lib="dom" />
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { test, expect, makePsds, type E2EApp } from './fixtures/app'

/**
 * Layout at the smallest and the default window: My Stash, Detail, Sort, Look it over and Settings
 * each fit the window, their footer buttons stay on screen, and nothing scrolls sideways.
 * Screenshots go to test-results/layout/ (not committed).
 */

const SIZES = [
  { width: 1024, height: 680 },
  { width: 1440, height: 900 }
] as const

async function resize(app: E2EApp, width: number, height: number): Promise<void> {
  await app.app.evaluate(
    ({ BrowserWindow }, [w, h]) => {
      const win = BrowserWindow.getAllWindows()[0]
      win?.setSize(w as number, h as number)
      win?.center()
    },
    [width, height] as const
  )
  await expect
    .poll(() => app.window.evaluate(() => [window.innerWidth, window.innerHeight]))
    .toEqual([width, height])
}

async function inside(page: Page, target: Locator, what: string): Promise<void> {
  const box = await target.boundingBox()
  expect(box, `${what} is on screen`).not.toBeNull()
  const view = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  expect(box!.x, `${what} left edge`).toBeGreaterThanOrEqual(0)
  expect(box!.y, `${what} top edge`).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, `${what} right edge`).toBeLessThanOrEqual(view.w + 1)
  expect(box!.y + box!.height, `${what} bottom edge`).toBeLessThanOrEqual(view.h + 1)
}

/** Nothing in the page or under `root` scrolls sideways. */
async function noSidewaysScroll(page: Page, root: Locator | null, what: string): Promise<void> {
  const offenders = await page.evaluate(
    (el) => {
      const out: string[] = []
      const doc = document.documentElement
      if (doc.scrollWidth > window.innerWidth + 1) out.push('the window')
      const scope: Element[] = el
        ? [el, ...el.querySelectorAll('*')]
        : [...document.querySelectorAll('main, main *')]
      for (const node of scope) {
        const style = getComputedStyle(node)
        if (
          (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
          node.scrollWidth > node.clientWidth + 1
        ) {
          out.push(
            `${node.tagName.toLowerCase()}.${String(node.getAttribute('class')).slice(0, 60)}`
          )
        }
      }
      return out
    },
    root ? await root.elementHandle() : null
  )
  expect(offenders, `${what} scrolls sideways`).toEqual([])
}

for (const { width, height } of SIZES) {
  test(`layout at ${width}×${height}`, async ({ app }) => {
    test.setTimeout(180_000)
    const { window } = app
    // Let the dialog's open animation finish so the picture shows the settled layout.
    const shot = async (name: string) => {
      await window.waitForTimeout(400)
      await window.screenshot({ path: `test-results/layout/${width}x${height}-${name}.png` })
    }
    await resize(app, width, height)

    const desk = join(app.userData, 'Desktop')
    makePsds(join(desk, 'Clay phones'), ['phone_front', 'phone_side', 'phone_back'])
    makePsds(desk, ['laptop'])
    expect((await app.invoke('copy:start', { paths: [desk] })).success).toBe(true)
    await window.getByRole('button', { name: /^To sort/ }).click()
    await expect(window.getByText('AI suggestions ready for all 4')).toBeVisible()
    // The page's actions sit in the header, on the title row, so the copy widget in the bottom corner
    // never covers them.
    const summary = window.locator('[data-ds="CopyWidget"]')
    const header = window.locator('[data-ds="PageHeader"]')
    await expect(header.getByRole('button', { name: 'Sort', exact: true })).toBeVisible()
    await expect(header.getByRole('button', { name: 'Toss this haul' })).toBeVisible()
    const title = (await header.getByRole('heading').boundingBox())!
    const sort = (await header.getByRole('button', { name: 'Sort', exact: true }).boundingBox())!
    expect(sort.y, 'Sort is on the title row').toBeLessThan(title.y + title.height)
    expect(sort.x, 'Sort is at the right').toBeGreaterThan(width / 2)
    // And it goes by itself, like a toast.
    await expect(summary).toHaveCount(0, { timeout: 12_000 })
    await shot('to-sort')
    await noSidewaysScroll(window, null, 'To sort')

    await test.step('Sort', async () => {
      await window.getByRole('button', { name: 'Sort', exact: true }).click()
      const dialog = window.getByRole('dialog')
      await expect(window.getByText('Clay phones')).toBeVisible()
      await inside(window, dialog, 'the Sort modal')
      await inside(window, window.getByRole('button', { name: 'Look them over' }), 'Look them over')
      await noSidewaysScroll(window, dialog, 'Sort')
      await shot('sort')
    })

    await test.step('Look it over', async () => {
      await window.getByRole('button', { name: 'Look them over' }).click()
      const dialog = window.getByRole('dialog')
      await expect(window.getByText('Pile 1 of 1', { exact: true })).toBeVisible()
      await inside(window, dialog, 'the Look it over modal')
      await noSidewaysScroll(window, dialog, 'Look it over (pile)')
      await shot('look-over-pile')
      await window
        .getByRole('button', { name: /Review/ })
        .first()
        .click()
      await inside(window, window.getByRole('button', { name: /^Stash pile/ }), 'Stash pile')
      await shot('look-over-review')
      await window.getByRole('button', { name: /^Stash pile/ }).click()

      await expect(window.getByRole('textbox', { name: 'Title' })).toHaveValue('Stub laptop')
      await inside(window, window.getByRole('button', { name: /^Stash( & next)?$/ }), 'Stash')
      await shot('look-over-single')
      await window.getByRole('button', { name: /^Stash( & next)?$/ }).click()
    })

    await test.step('My Stash', async () => {
      await window.getByRole('button', { name: /^All/ }).click()
      await expect(window.getByText('2 mockups', { exact: true })).toBeVisible()
      await noSidewaysScroll(window, null, 'My Stash')
      await shot('my-stash')
    })

    await test.step('Detail', async () => {
      const card = window.locator('[data-mockup-id]').filter({ hasText: 'Stub laptop' })
      await card.hover()
      await card.getByRole('button', { name: 'Edit details' }).click()
      const dialog = window.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await inside(window, dialog, 'the Detail modal')
      await inside(
        window,
        window.getByRole('button', { name: 'Open in Photoshop' }),
        'Open in Photoshop'
      )
      await noSidewaysScroll(window, dialog, 'Detail')
      await shot('detail')
      await window.keyboard.press('Escape')
      await expect(window.getByRole('dialog')).toHaveCount(0)
    })

    await test.step('Settings', async () => {
      await window.getByRole('button', { name: 'Settings' }).click()
      const dialog = window.getByRole('dialog')
      await expect(dialog).toBeVisible()
      for (const section of ['My Stash', 'AI model', 'Tags', 'Privacy', 'About']) {
        await dialog.getByRole('button', { name: section, exact: true }).click()
        await inside(window, dialog, `Settings › ${section}`)
        await noSidewaysScroll(window, dialog, `Settings › ${section}`)
        await shot(`settings-${section.toLowerCase().replace(' ', '-')}`)
      }
      await window.keyboard.press('Escape')
    })
  })
}
