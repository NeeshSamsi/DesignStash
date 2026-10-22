import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from './fixtures/app'

test('first run: welcome, stash folder, skip AI, say no to usage data, open My Stash', async ({
  firstRun: app
}) => {
  const { window } = app

  await expect(window.getByText('Welcome to DesignStash')).toBeVisible()
  await window.getByRole('button', { name: 'Get started' }).click()

  await expect(window.getByText('Where should your stash live?')).toBeVisible()
  await window.getByRole('button', { name: 'Continue' }).click()

  await expect(window.getByText('Set up on-device AI')).toBeVisible()
  // Meaning search is its own card, on by default. This tester switches it off too, so skipping AI
  // downloads nothing.
  const meaning = window.getByRole('group', { name: 'Meaning search' })
  await expect(meaning).toBeVisible()
  await expect(meaning.getByText('146 MB')).toBeVisible()
  await window.getByRole('switch', { name: 'Download meaning search' }).click()
  await expect(meaning.getByText('Off · search matches the words you type')).toBeVisible()
  await window.getByRole('button', { name: 'Skip AI' }).first().click()

  await expect(window.getByText('Your privacy')).toBeVisible()
  // Sharing is on by default; this tester switches it off before continuing.
  await window.getByRole('switch', { name: 'Share anonymous usage data' }).click()
  await window.getByRole('button', { name: 'Continue' }).click()

  await expect(window.getByText('Your stash is ready!')).toBeVisible()
  await window.getByRole('button', { name: 'Open My Stash' }).click()

  await expect(window.getByText('0 mockups')).toBeVisible()

  // The choices stuck: onboarding is done and usage data is off.
  const saved = JSON.parse(readFileSync(join(app.userData, 'settings.json'), 'utf8')) as {
    onboarded: boolean
    telemetryEnabled: boolean
  }
  expect(saved).toMatchObject({ onboarded: true, telemetryEnabled: false })
})
