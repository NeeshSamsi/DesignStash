import { join } from 'node:path'
import { test, expect, makePsds } from './fixtures/app'

/**
 * The core journey: gather PSDs, sort them, look them over, find them in My Stash.
 * The AI is the stub provider, so suggestions are fast and predictable ("Stub <file name>").
 */

test('gather, sort, look over, and find the mockups in My Stash', async ({ app }) => {
  const { window } = app
  const desk = join(app.userData, 'Desktop')
  makePsds(desk, ['laptop', 'phone_back', 'phone_front', 'phone_side'])

  await test.step('gather: the PSDs are copied in and wait in To sort', async () => {
    // Starting a copy from the UI (Add menu, ⌘O, dropping files) is WP7.3. The queue itself is real.
    const started = await app.invoke('copy:start', { paths: [desk] })
    expect(started.success).toBe(true)

    await expect(window.getByText('To sort', { exact: true }).first()).toBeVisible()
    await window.getByText('To sort', { exact: true }).first().click()
    await expect(window.getByText('4 mockups waiting to be sorted')).toBeVisible()
    await expect(window.getByText('AI suggestions ready for all 4')).toBeVisible()
    for (const name of ['laptop', 'phone_back', 'phone_front', 'phone_side']) {
      await expect(window.getByText(name, { exact: true })).toBeVisible()
    }
  })

  await test.step('sort: leave every mockup on its own and carry on', async () => {
    await window.getByRole('button', { name: 'Sort', exact: true }).click()
    await expect(window.getByText('Sort into piles').first()).toBeVisible()
    await expect(window.getByText('On its own')).toBeVisible()
    await window.getByRole('button', { name: 'Look them over' }).click()
  })

  await test.step('look it over: stash each mockup with the AI suggestion', async () => {
    await expect(window.getByText('1 of 4')).toBeVisible()
    // The title is the suggestion for the first file in the queue.
    await expect(window.getByRole('textbox', { name: /title/i }).first()).toHaveValue(/^Stub /)
    await expect(window.getByText('Embedded preview')).toBeVisible()

    for (let step = 1; step <= 4; step++) {
      await window.getByRole('button', { name: /^Stash( & next)?$/ }).click()
    }
  })

  await test.step('My Stash: all four are there, with the titles the AI suggested', async () => {
    await window.getByRole('button', { name: /^All/ }).click()
    await expect(window.getByText('4 mockups', { exact: true })).toBeVisible()
    for (const name of ['laptop', 'phone_back', 'phone_front', 'phone_side']) {
      await expect(window.getByText(`Stub ${name}`, { exact: true })).toBeVisible()
    }
    // Nothing is left waiting, so the inboxes leave the sidebar.
    await expect(window.getByRole('button', { name: /^To sort/ })).toHaveCount(0)
    await expect(window.getByRole('button', { name: /^To stash/ })).toHaveCount(0)
  })
})

test('mockups from one folder are proposed as a pile, looked over as one and stashed whole', async ({ app }) => {
  const { window } = app
  const desk = join(app.userData, 'Desktop')
  makePsds(join(desk, 'Clay phones'), ['phone_front', 'phone_side', 'phone_back'])
  makePsds(desk, ['laptop'])
  await app.invoke('copy:start', { paths: [desk] })
  await window.getByRole('button', { name: /^To sort/ }).click()
  await expect(window.getByText('AI suggestions ready for all 4')).toBeVisible()

  // Sort proposes the three files in "Clay phones" as a pile and leaves the laptop on its own.
  await window.getByRole('button', { name: 'Sort', exact: true }).click()
  await expect(window.getByText('Clay phones')).toBeVisible()
  await expect(window.getByText('3 mockups')).toBeVisible()
  await expect(window.getByText('On its own')).toBeVisible()
  await window.getByRole('button', { name: 'Look them over' }).click()

  // Piles come first, and the pile's top is the first step.
  await expect(window.getByText('Pile 1 of 1', { exact: true })).toBeVisible()
  await expect(window.getByRole('textbox', { name: 'Title' })).toHaveValue('Stub phone_back')
  await window.getByRole('button', { name: /Review/ }).first().click()
  await window.getByRole('button', { name: /^Stash pile/ }).click()

  // The laptop is next, on its own.
  await expect(window.getByRole('textbox', { name: 'Title' })).toHaveValue('Stub laptop')
  await window.getByRole('button', { name: /^Stash( & next)?$/ }).click()

  await window.getByRole('button', { name: /^All/ }).click()
  // One card for the pile, however many mockups are in it, and one for the laptop.
  await expect(window.getByText('2 mockups', { exact: true })).toBeVisible()
  await expect(window.getByText('Stub phone_back', { exact: true })).toBeVisible()
  await expect(window.getByText('Stub laptop', { exact: true })).toBeVisible()
})

test.fixme('gather from the Add menu and by dropping files (WP7.3 Gather wiring)', async () => {
  // Waiting on WP7.3: AddMenu, the Add card and ⌘O start the copy queue, and My Stash and To sort
  // accept dropped PSDs. Replace the copy:start call in the journey above with those once they land.
})
