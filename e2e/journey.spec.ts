import type { Page } from '@playwright/test'
import { test, expect } from './fixtures/app'
import { SMALL_REAL_ZIPS, TEST_SET_MISSING, testSet } from './fixtures/test-set'

/**
 * The core journey: gather mockups, sort them, look them over, find them in My Stash. The imports
 * are real downloads and generated cases from the DesignStash test set, so the journey runs on
 * real PSDs, real embedded previews and real zips. The AI is the stub provider, so suggestions are
 * fast and predictable ("Stub <file name>").
 */

test.skip(!testSet.available, TEST_SET_MISSING)

/** The covers on the page that have decoded into pixels. */
const decodedCovers = (window: Page) =>
  window.evaluate(
    () =>
      [...document.querySelectorAll<HTMLImageElement>('[data-ds="CoverImage"] img')].filter(
        (img) => img.complete && img.naturalWidth > 0
      ).length
  )

test('gather, sort, look over, and find the mockups in My Stash', async ({ app }) => {
  test.setTimeout(120_000)
  const { window } = app
  const zips = [testSet.zip(SMALL_REAL_ZIPS.matteSnackBar), testSet.zip(SMALL_REAL_ZIPS.sticker)]
  const names = ['Matte Snack Bar Mockup', 'Sticker Mockup']

  await test.step('gather: the PSDs in two real zips are copied in and wait in To sort', async () => {
    // Starting a copy from the UI (Add menu, ⌘O, dropping files) is WP7.3. The queue itself is real.
    const started = await app.invoke('copy:start', { paths: zips })
    expect(started.success).toBe(true)

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
    await expect(window.getByRole('textbox', { name: /title/i }).first()).toHaveValue(/^Stub /)
    await expect(window.getByRole('group', { name: 'Cover' })).toBeVisible()

    for (let step = 1; step <= 2; step++) {
      await window.getByRole('button', { name: /^Stash( & next)?$/ }).click()
    }
  })

  await test.step('My Stash: both are there, with the AI titles and their real covers', async () => {
    await window.getByRole('button', { name: /^All/ }).click()
    await expect(window.getByText('2 mockups', { exact: true })).toBeVisible()
    for (const name of names) {
      await expect(window.getByText(`Stub ${name}`, { exact: true })).toBeVisible()
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
  const { window } = app
  // Four PSDs in two folders inside one zip, and a lone mockup from another zip.
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

test.fixme('gather from the Add menu and by dropping files (WP7.3 Gather wiring)', async () => {
  // Waiting on WP7.3: AddMenu, the Add card and ⌘O start the copy queue, and My Stash and To sort
  // accept dropped PSDs. Replace the copy:start call in the journey above with those once they land.
})
