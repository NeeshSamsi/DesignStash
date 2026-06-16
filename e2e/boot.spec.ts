import { test, expect, _electron as electron } from '@playwright/test'

test('app boots and shows the title', async () => {
  const app = await electron.launch({ args: ['./out/main/index.js'] })
  const window = await app.firstWindow()
  await expect(window.locator('h1')).toHaveText('DesignStash')
  await app.close()
})
