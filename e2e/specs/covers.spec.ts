import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import sharp from 'sharp'
import { buildPsdSmallComposite, buildSidecarImage } from '../../src/main/psd/__fixtures__/build'
import { launchLikeReal } from '../fixtures/dev-origin'
import { seedStash, showMyStash } from '../fixtures/seed'

/**
 * Covers in a real library (F6): the cover files sit in a folder with a space in its path
 * ("Application Support"), and the page may be served over http as it is in development.
 * Every card has to show its cover, not the placeholder.
 */

/** The covers on the page that have actually decoded into pixels. */
const decodedCovers = (window: Page) =>
  window.evaluate(
    () =>
      [...document.querySelectorAll<HTMLImageElement>('[data-ds="CoverImage"] img')].filter(
        (img) => img.complete && img.naturalWidth > 0
      ).length
  )

for (const [name, opts] of [
  ['a page served over http, like development', { http: true, awkwardPath: true }],
  ['the built files, like a packaged app', { http: false, awkwardPath: true }]
] as const) {
  test(`every card shows its cover on ${name}, in a folder with a space, # and %`, async () => {
    const app = await launchLikeReal(opts)
    try {
      await seedStash(app, ['laptop', 'phone', 'poster'])
      await showMyStash(app)
      await expect(app.window.getByText('3 mockups', { exact: true })).toBeVisible()

      await expect.poll(() => decodedCovers(app.window), { timeout: 15_000 }).toBe(3)
      // The stash really is somewhere awkward.
      expect(app.stash).toContain('Application Support #1 100%')
    } finally {
      await app.close()
    }
  })
}

/** Copies a folder in, leaves every mockup on its own and stashes them. Returns the mockups by title. */
async function stashFolder(app: Awaited<ReturnType<typeof launchLikeReal>>, folder: string) {
  await app.invoke('copy:start', { paths: [folder] })
  await expect
    .poll(async () => ((await app.invoke<{ toSort: number }>('inbox:get-counts')).data?.toSort ?? 0), { timeout: 30_000 })
    .toBeGreaterThan(0)
  await expect
    .poll(async () => ((await app.invoke<{ sniffing: number }>('inbox:get-counts')).data?.sniffing ?? 1), { timeout: 30_000 })
    .toBe(0)
  const { data } = await app.invoke<{ items: { id: number; title: string; batchId: string | null; coverSource: string }[] }>(
    'inbox:list',
    { stage: 'to_sort' }
  )
  const items = data!.items
  await app.invoke('grouping:confirm', { batchId: items[0]!.batchId, groups: [], singletonIds: items.map((i) => i.id) })
  await app.invoke('look-over:open')
  for (const item of items) await app.invoke('mockup:stash', { mockupId: item.id })
  return items
}

test('a sidecar cover, an uploaded cover and a missing cover each show what they should', async () => {
  const app = await launchLikeReal({ http: true, awkwardPath: true })
  try {
    // A PSD with no usable preview takes the image beside it as its cover (a sidecar).
    const desk = join(app.userData, 'Desktop #2')
    mkdirSync(desk, { recursive: true })
    buildPsdSmallComposite(join(desk, 'Artboard A.psd'))
    await buildSidecarImage(join(desk, 'Artboard A.jpg'))
    const [sidecar] = await stashFolder(app, desk)
    expect(sidecar!.coverSource).toBe('sidecar')

    // An embedded one, then replace its cover with an upload from somewhere outside the stash.
    const [embedded] = await seedStash(app, ['laptop'])
    const upload = join(app.userData, 'Pictures #3', 'my cover.png')
    mkdirSync(join(upload, '..'), { recursive: true })
    await sharp({ create: { width: 900, height: 600, channels: 3, background: '#c97b4a' } }).png().toFile(upload)
    const replaced = await app.invoke<{ ok: boolean; coverPath: string; coverSource: string }>('mockup:set-cover', {
      mockupId: embedded!.id,
      filePath: upload
    })
    expect(replaced.data).toMatchObject({ ok: true, coverSource: 'user-uploaded' })

    // A third whose cover file is deleted from the stash.
    const [gone] = await seedStash(app, ['poster'])
    const detail = await app.invoke<{ item: { coverPath: string } }>('mockup:detail', { mockupId: gone!.id })
    rmSync(detail.data!.item.coverPath)

    await showMyStash(app)
    await expect(app.window.getByText('3 mockups', { exact: true })).toBeVisible()
    // Sidecar and uploaded covers decode; the deleted one shows the real missing state.
    await expect.poll(() => decodedCovers(app.window), { timeout: 15_000 }).toBe(2)
    await expect(app.window.getByText('Cover file missing')).toHaveCount(1)
  } finally {
    await app.close()
  }
})
