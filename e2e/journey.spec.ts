import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { stubSuggestion } from '../src/main/ai/stub-suggestions'
import { test, expect, makePsds, type E2EApp } from './fixtures/app'
import { SMALL_REAL_ZIPS, TEST_SET_MISSING, testSet } from './fixtures/test-set'

/**
 * The core journey: gather mockups, sort them, look them over, find them in My Stash. The imports
 * are real downloads and generated cases from the DesignStash test set, so the journey runs on
 * real PSDs, real embedded previews and real zips. The AI is the stub provider, so suggestions are
 * fast and predictable: a believable title for the two real files, "Stub <file name>" for the rest.
 * The gather tests at the end make their own PSDs, so they run without the test set.
 */

/** The covers on the page that have decoded into pixels. */
const decodedCovers = (window: Page) =>
  window.evaluate(
    () =>
      [...document.querySelectorAll<HTMLImageElement>('[data-ds="CoverImage"] img')].filter(
        (img) => img.complete && img.naturalWidth > 0
      ).length
  )

interface Haul {
  haulId: string
  state: string
  files: { name: string }[]
}

/** The haul main has on show, from its own record. */
const haulOf = async (app: E2EApp) =>
  (await app.invoke<{ haul: Haul | null }>('copy:status')).data?.haul ?? null

/**
 * Answers the system file picker in main with these paths, as if a person had picked them, and
 * counts how often it is asked. Everything from the picker's answer on is the app's own.
 */
async function stubPicker(app: E2EApp, paths: string[]) {
  await app.app.evaluate(({ dialog }, picked) => {
    const asked = globalThis as { pickerAsked?: number }
    asked.pickerAsked = 0
    Object.assign(dialog, {
      showOpenDialog: async () => {
        asked.pickerAsked = (asked.pickerAsked ?? 0) + 1
        return { canceled: false, filePaths: picked }
      }
    })
  }, paths)
}

const pickerAsked = (app: E2EApp) =>
  app.app.evaluate(() => (globalThis as { pickerAsked?: number }).pickerAsked ?? 0)

/** Does `start`, waits for the new haul it begins to finish, and returns it. */
async function haulFrom(app: E2EApp, start: () => Promise<unknown>): Promise<Haul> {
  const before = (await haulOf(app))?.haulId ?? null
  await start()
  await expect
    .poll(
      async () => {
        const haul = await haulOf(app)
        return haul && haul.haulId !== before ? haul.state : 'not started'
      },
      { timeout: 30_000 }
    )
    .toBe('done')
  return (await haulOf(app))!
}

/** The Add card's menu, as on an empty My Stash or To sort: Add files…. */
async function addFromCard(window: Page) {
  await window.locator('[data-ds="AddMockupCard"]').click()
  await window.getByRole('menuitem', { name: /^Add files…/ }).click()
}

/**
 * Drags files in from outside the window and drops them, as from Finder. DevTools'
 * Input.dispatchDragEvent has Chromium build real File objects from the paths, so the drop goes
 * through the preload's webUtils.getPathForFile as a person's does. `whileOver` runs between the
 * drag-over and the drop, while the overlay is up.
 */
async function dropFiles(window: Page, files: string[], whileOver: () => Promise<void>) {
  const at = await window.evaluate(() => ({
    x: Math.round(self.innerWidth / 2),
    y: Math.round(self.innerHeight / 2)
  }))
  const cdp = await window.context().newCDPSession(window)
  const drag = (type: 'dragEnter' | 'dragOver' | 'drop') =>
    cdp.send('Input.dispatchDragEvent', {
      type,
      ...at,
      // Copy is the only operation a drop from Finder offers here.
      data: { items: [], files, dragOperationsMask: 1 }
    })
  try {
    await drag('dragEnter')
    await drag('dragOver')
    await whileOver()
    await drag('drop')
  } finally {
    await cdp.detach()
  }
}

test('gather, sort, look over, and find the mockups in My Stash', async ({ app }) => {
  test.skip(!testSet.available, TEST_SET_MISSING)
  test.setTimeout(120_000)
  const { window } = app
  const zips = [testSet.zip(SMALL_REAL_ZIPS.matteSnackBar), testSet.zip(SMALL_REAL_ZIPS.sticker)]
  const names = ['Matte Snack Bar Mockup', 'Sticker Mockup']
  const titles = names.map((name) => stubSuggestion(`${name}.psd`).title)

  await test.step('gather: the PSDs in two real zips, picked from the Add card, are copied in and wait in To sort', async () => {
    await stubPicker(app, zips)
    await addFromCard(window)

    await expect(window.getByText('To sort', { exact: true }).first()).toBeVisible()
    await window.getByText('To sort', { exact: true }).first().click()
    await expect(window.getByText('2 mockups waiting to be sorted')).toBeVisible({
      timeout: 60_000
    })
    await expect(window.getByText('AI suggestions ready for all 2')).toBeVisible({
      timeout: 30_000
    })
    for (const name of names) {
      await expect(window.getByText(name, { exact: true })).toBeVisible()
    }
    // Both covers come from the PSDs' own embedded previews.
    const { data } = await app.invoke<{ items: { coverSource: string }[] }>('inbox:list', {
      stage: 'to_sort'
    })
    expect(data!.items.map((i) => i.coverSource)).toEqual(['embedded', 'embedded'])
  })

  await test.step('sort: two different zips stay on their own; carry on', async () => {
    await window.getByRole('button', { name: 'Sort', exact: true }).click()
    await expect(window.getByText('Sort into piles').first()).toBeVisible()
    await expect(window.getByText('On its own')).toBeVisible()
    await window.getByRole('button', { name: 'Look them over' }).click()
  })

  await test.step('look it over: stash each mockup with the AI suggestion', async () => {
    await expect(window.getByText('1 of 2')).toBeVisible()
    await expect(window.getByRole('textbox', { name: /title/i }).first()).toHaveValue(
      new RegExp(`^(${titles.join('|')})$`)
    )
    await expect(window.getByRole('group', { name: 'Cover' })).toBeVisible()

    for (let step = 1; step <= 2; step++) {
      await window.getByRole('button', { name: /^Stash( & next)?$/ }).click()
    }
  })

  await test.step('My Stash: both are there, with the AI titles and their real covers', async () => {
    await window.getByRole('button', { name: /^All/ }).click()
    await expect(window.getByText('2 mockups', { exact: true })).toBeVisible()
    for (const title of titles) {
      await expect(window.getByText(title, { exact: true })).toBeVisible()
    }
    await expect.poll(() => decodedCovers(window), { timeout: 15_000 }).toBe(2)
    // Nothing is left waiting, so the inboxes leave the sidebar.
    await expect(window.getByRole('button', { name: /^To sort/ })).toHaveCount(0)
    await expect(window.getByRole('button', { name: /^To stash/ })).toHaveCount(0)
  })
})

test('a zip of variants is proposed as one pile, looked over as one and stashed whole', async ({
  app
}) => {
  test.skip(!testSet.available, TEST_SET_MISSING)
  const { window } = app
  // Four PSDs in two folders inside one zip, and a lone mockup from another zip. The journey above
  // gathers through the UI, so this one starts the copy directly and spends its time on the pile.
  await app.invoke('copy:start', {
    paths: [
      testSet.generated('edge/Pile_Of_Variants.zip'),
      testSet.generated('edge/aB3dE5fG7hI9jK1lM3nO_Random_Prefix_Mockup.zip')
    ]
  })
  await window.getByRole('button', { name: /^To sort/ }).click()
  await expect(window.getByText('AI suggestions ready for all 5')).toBeVisible({ timeout: 30_000 })

  // Sort piles the zip's four PSDs under the zip's name and leaves the other on its own.
  await window.getByRole('button', { name: 'Sort', exact: true }).click()
  await expect(window.getByText('Pile Of Variants', { exact: true })).toBeVisible()
  await expect(window.getByText('4 mockups')).toBeVisible()
  await expect(window.getByText('On its own')).toBeVisible()
  await window.getByRole('button', { name: 'Look them over' }).click()

  // Piles come first, and the pile's top (the first name) is the first step.
  await expect(window.getByText('Pile 1 of 1', { exact: true })).toBeVisible()
  await expect(window.getByRole('textbox', { name: 'Title' })).toHaveValue(/^Stub Phone Back/)
  await window
    .getByRole('button', { name: /Review/ })
    .first()
    .click()
  await window.getByRole('button', { name: /^Stash pile/ }).click()

  // The lone one is next.
  await expect(window.getByRole('textbox', { name: 'Title' })).toHaveValue(
    'Stub Random Prefix Mockup'
  )
  await window.getByRole('button', { name: /^Stash( & next)?$/ }).click()

  await window.getByRole('button', { name: /^All/ }).click()
  // One card for the pile, however many mockups are in it, and one for the lone mockup.
  await expect(window.getByText('2 mockups', { exact: true })).toBeVisible()
  await expect(window.getByText('Stub Random Prefix Mockup', { exact: true })).toBeVisible()
})

test.describe('gather: every way in starts a haul, and what it copies waits in To sort', () => {
  test('File › Add Files…, the Add card and ⌘O each ask the picker and copy what it gives', async ({
    app
  }) => {
    const { window } = app
    const [fromMenu, fromCard, fromKey] = makePsds(join(app.userData, 'Desktop'), [
      'phone_menu',
      'phone_card',
      'phone_key'
    ])

    await test.step('File › Add Files… in the menu bar', async () => {
      await stubPicker(app, [fromMenu!])
      const haul = await haulFrom(app, async () => {
        const clicked = await app.app.evaluate(({ Menu }) => {
          const file = Menu.getApplicationMenu()?.items.find((item) => item.label === 'File')
          const add = file?.submenu?.items.find((item) => item.label === 'Add Files…')
          add?.click()
          return add !== undefined
        })
        expect(clicked, 'the File menu has Add Files…').toBe(true)
      })
      expect(await pickerAsked(app)).toBe(1)
      expect(haul.files.map((f) => f.name)).toEqual(['phone_menu.psd'])
      await expect(window.getByText('1 mockup waiting to be sorted')).toBeVisible()
    })

    await test.step('the Add card on My Stash', async () => {
      await stubPicker(app, [fromCard!])
      const haul = await haulFrom(app, () => addFromCard(window))
      expect(await pickerAsked(app)).toBe(1)
      expect(haul.files.map((f) => f.name)).toEqual(['phone_card.psd'])
      await expect(window.getByText('2 mockups waiting to be sorted')).toBeVisible()
    })

    await test.step('⌘O', async () => {
      await stubPicker(app, [fromKey!])
      const haul = await haulFrom(app, () => window.keyboard.press('Meta+o'))
      expect(await pickerAsked(app)).toBe(1)
      expect(haul.files.map((f) => f.name)).toEqual(['phone_key.psd'])
      await expect(window.getByText('3 mockups waiting to be sorted')).toBeVisible()
    })

    await test.step('all three wait in To sort', async () => {
      await window.getByRole('button', { name: /^To sort/ }).click()
      await expect(window.getByText('3 mockups waiting to be sorted')).toBeVisible()
      const { data } = await app.invoke<{ items: unknown[] }>('inbox:list', { stage: 'to_sort' })
      expect(data!.items).toHaveLength(3)
    })
  })

  test('PSDs dropped on My Stash and on To sort are copied in from where they are', async ({
    app
  }) => {
    const { window } = app
    const desk = join(app.userData, 'Desktop')
    const onMyStash = makePsds(desk, ['poster_one', 'poster_two'])
    const onToSort = makePsds(desk, ['poster_three'])

    await test.step('on My Stash', async () => {
      const haul = await haulFrom(app, () =>
        dropFiles(window, onMyStash, async () => {
          await expect(window.getByText('Drop PSDs or zips to add them')).toBeVisible()
        })
      )
      expect(haul.files.map((f) => f.name).sort()).toEqual(['poster_one.psd', 'poster_two.psd'])
      await expect(window.getByText('2 mockups waiting to be sorted')).toBeVisible()
    })

    await test.step('on To sort, joining what waits there', async () => {
      await window.getByRole('button', { name: /^To sort/ }).click()
      await expect(window.getByText('2 mockups waiting to be sorted')).toBeVisible()
      const haul = await haulFrom(app, () =>
        dropFiles(window, onToSort, async () => {
          await expect(window.getByText('Drop to add them to To sort')).toBeVisible()
          await expect(
            window.getByText('They’ll join the 2 mockups already waiting.')
          ).toBeVisible()
        })
      )
      expect(haul.files.map((f) => f.name)).toEqual(['poster_three.psd'])
      await expect(window.getByText('3 mockups waiting to be sorted')).toBeVisible()
    })
  })
})
