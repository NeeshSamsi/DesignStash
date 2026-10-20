import { test, expect } from './fixtures/app'

test('the built app opens straight to My Stash once onboarding is done', async ({ app }) => {
  await expect(app.window.getByText('My Stash').first()).toBeVisible()
  await expect(app.window.getByText('0 mockups')).toBeVisible()
  // Nothing is waiting, so the inboxes stay out of the sidebar.
  await expect(app.window.getByText('To sort', { exact: true })).toHaveCount(0)
})
