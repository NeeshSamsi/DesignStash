/// <reference lib="dom" />
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { test, expect, setWindowSize } from './fixtures/app'
// Real mockups from the test set when it is there, else generated ones: the screenshots should
// show real covers, tall, wide and with a kit's placeholder screen.
import { placeMockups } from './fixtures/real-mockups'

/**
 * Layout at the smallest and the default window: My Stash, the details sidebar, Sort, Look it over and Settings
 * each fit the window, their footer buttons stay on screen, and nothing scrolls sideways.
 * Screenshots go to test-results/layout/ (not committed).
 */

const SIZES = [
  { width: 1088, height: 680 },
  { width: 1440, height: 900 }
] as const

/** The smallest the window can be. */
const MINIMUM = SIZES[0]

/** Waits until `target` stops moving (a toast slides in and restacks), then returns its box. */
async function settledBox(
  target: Locator
): Promise<{ x: number; y: number; width: number; height: number }> {
  let last = ''
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await target.boundingBox())
        const still = now === last && now !== 'null'
        last = now
        return still
      },
      { message: 'the toast settles', intervals: [150] }
    )
    .toBe(true)
  return JSON.parse(last) as { x: number; y: number; width: number; height: number }
}

/**
 * A toast raised over a flow: none of the flow's footer buttons sits under it, and the toast's own
 * button is the topmost thing at its centre, above the modal's layer.
 */
async function toastClearOf(toast: Locator, buttons: Locator): Promise<void> {
  const t = await settledBox(toast)
  const covered: string[] = []
  for (const button of await buttons.all()) {
    const b = await button.boundingBox()
    if (!b) continue
    if (b.x < t.x + t.width && t.x < b.x + b.width && b.y < t.y + t.height && t.y < b.y + b.height)
      covered.push(await button.innerText())
  }
  expect(covered, 'footer buttons under the toast').toEqual([])
  const reachable = await toast
    .getByRole('button')
    .first()
    .evaluate((button) => {
      const box = button.getBoundingClientRect()
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return top !== null && (top === button || button.contains(top))
    })
  expect(reachable, 'the toast’s button can be pressed').toBe(true)
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
    await setWindowSize(app, { width, height })

    const desk = join(app.userData, 'Desktop')
    // A folder of three iMacs makes a pile; the MacBook (wide) and the can (tall) stand alone.
    const pileFolder = 'Minimal iMac'
    placeMockups(join(desk, pileFolder), ['imac', 'imac_angled', 'imac_side'])
    const [laptop, can] = placeMockups(desk, ['laptop', 'can'])
    const singleTitles = new RegExp(`^(${laptop!.title}|${can!.title})$`)
    expect((await app.invoke('copy:start', { paths: [desk] })).success).toBe(true)
    await window.getByRole('button', { name: /^To sort/ }).click()
    await expect(window.getByText('AI suggestions ready for all 5')).toBeVisible({
      timeout: 60_000
    })
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

    await test.step('Waiting strip in My Stash', async () => {
      await window.getByRole('button', { name: /^All/ }).click()
      const waiting = window.locator('[data-ds="WaitingToSortStrip"]')
      await expect(waiting).toBeVisible()
      await expect(waiting.getByText('5 mockups waiting to be sorted')).toBeVisible()
      await inside(window, waiting.getByRole('button', { name: 'Sort now' }), 'Sort now')
      const title = (await window.locator('[data-ds="PageHeader"]').boundingBox())!
      expect((await waiting.boundingBox())!.x, 'the strip lines up with the title').toBe(title.x)
      await shot('my-stash-waiting')
      await waiting.getByRole('button', { name: 'Later' }).click()
      // The strip folds shut rather than leaving the page: it stays in the DOM, out of the accessibility tree.
      await expect(window.getByRole('region', { name: 'Waiting to be sorted' })).toHaveCount(0)
      await window.getByRole('button', { name: /^To sort/ }).click()
    })

    await test.step('Sort', async () => {
      await window.getByRole('button', { name: 'Sort', exact: true }).click()
      const dialog = window.getByRole('dialog')
      await expect(window.getByText(pileFolder)).toBeVisible()
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

      // At the smallest window the flow fills almost all of it, and its Undo toast lands in the
      // bottom-right corner, where the flow keeps its main button.
      if (width === MINIMUM.width && height === MINIMUM.height) {
        await test.step('the Undo toast over the flow', async () => {
          const toast = window.locator('[data-ds="Toast"]').filter({ hasText: 'Pile stashed' })
          await expect(toast).toBeVisible()
          const footer = dialog.getByRole('button', {
            name: /^(Back|Skip for now|Finish later|Stash|Stash & next)$/
          })
          await expect(footer.first()).toBeVisible()
          await toastClearOf(toast, footer)
          await shot('look-over-toast')
        })
      }

      // The two on their own come next, in either order.
      for (const step of ['look-over-single', 'look-over-last']) {
        await expect(window.getByRole('textbox', { name: 'Title' })).toHaveValue(singleTitles)
        await inside(window, window.getByRole('button', { name: /^Stash( & next)?$/ }), 'Stash')
        await shot(step)
        await window.getByRole('button', { name: /^Stash( & next)?$/ }).click()
      }
    })

    await test.step('My Stash', async () => {
      await window.getByRole('button', { name: /^All/ }).click()
      await expect(window.getByText('3 mockups', { exact: true })).toBeVisible()
      await noSidewaysScroll(window, null, 'My Stash')
      //F4MARK
      const left = async (selector: string) =>
        (await window.locator(selector).first().boundingBox())!.x
      const titleLeft = await left('[data-ds="PageHeader"]')
      expect(await left('[data-ds="LibraryToolbar"]'), 'toolbar lines up with the title').toBe(
        titleLeft
      )
      expect(await left('[data-ds="MockupGrid"]'), 'grid lines up with the title').toBe(titleLeft)
      await shot('my-stash')
    })

    await test.step('Details sidebar', async () => {
      const card = window.locator('[data-mockup-id]').filter({ hasText: laptop!.title })
      await card.hover()
      await card.getByRole('button', { name: 'Edit details' }).click()
      const panel = window.locator('[data-slot="details-panel"]')
      await expect(panel.getByRole('textbox', { name: 'Title' })).toBeVisible()
      // Let the view transition finish so the measurement is of the settled layout.
      await expect(window.locator('html')).not.toHaveAttribute('data-panel-motion', /.+/)
      await inside(window, panel, 'the details sidebar')
      await inside(window, panel.getByRole('button', { name: 'Save' }), 'Save')
      await noSidewaysScroll(window, null, 'My Stash with the sidebar open')
      // The toolbar stays whole beside the sidebar: inside the content panel, nothing cut off or scrolling sideways.
      const toolbar = (await window.locator('[data-ds="LibraryToolbar"]').boundingBox())!
      const main = (await window.locator('main').boundingBox())!
      expect(toolbar.x, 'toolbar left edge').toBeGreaterThanOrEqual(main.x)
      expect(toolbar.x + toolbar.width, 'toolbar right edge').toBeLessThanOrEqual(
        main.x + main.width + 1
      )
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
      expect(overflowing, 'nothing scrolls sideways with the sidebar open').toEqual([])
      await shot('details-sidebar')
      await window.keyboard.press('Escape')
      await expect(panel).toHaveCount(0)
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

      await test.step('Scrollbar', async () => {
        await dialog.getByRole('button', { name: 'Tags', exact: true }).click()
        const open = window.locator('.ds-scrollbar[data-axis="vertical"][data-state="open"]')
        // Nothing is drawn while the pointer is away.
        await window.mouse.move(2, 2)
        await expect(open).toHaveCount(0)
        // Pointing at the long tag list opens the gutter over it, without moving the rows.
        const point = await window.evaluate(() => {
          const area = [...document.querySelectorAll<HTMLElement>('[role="dialog"] *')].find(
            (el) =>
              getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > el.clientHeight + 1
          )
          const r = area?.getBoundingClientRect()
          return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
        })
        expect(point, 'Settings › Tags has a scroll area').not.toBeNull()
        await window.mouse.move(point!.x, point!.y)
        await expect(open).toHaveCount(1)
        const layerZ = await window.evaluate(
          () => getComputedStyle(document.querySelector('.ds-scrollbar-layer')!).zIndex
        )
        expect(layerZ, 'the layer sits at the scrollbar z token').toBe('70')
        // Moving away hides it.
        await window.mouse.move(2, 2)
        await expect(open).toHaveCount(0)
      })
      await window.keyboard.press('Escape')
    })
  })
}
