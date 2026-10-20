import { join } from 'node:path'
import { expect, makePsds, type E2EApp } from './app'

/** What the specs need to know about a seeded mockup. */
export interface Seeded {
  /** The PSD's file name without extension, as it shows in To sort. */
  name: string
  id: number
  /** The title the stub AI suggests and the mockup is stashed with. */
  title: string
}

interface Result {
  success: boolean
  data?: unknown
}

/** Calls a channel and fails the test with its name when it is refused. */
async function ok<T>(app: E2EApp, channel: string, args?: unknown): Promise<T> {
  const res = (await app.invoke<T>(channel, args)) as Result & { data?: T }
  expect(res.success, `${channel} succeeds`).toBe(true)
  return res.data as T
}

/**
 * Puts real mockups in My Stash through the app's own pipeline, with no clicking: copy the PSDs in,
 * wait for the AI suggestions, leave every one on its own, then stash them. Specs that are about
 * something else (trash, tags, Detail) start from here.
 */
export async function seedStash(app: E2EApp, names: string[]): Promise<Seeded[]> {
  const desk = join(app.userData, 'Desktop', `haul-${Date.now()}`)
  makePsds(desk, names)
  await ok(app, 'copy:start', { paths: [desk] })

  await expect
    .poll(async () => await ok<{ toSort: number; sniffing: number }>(app, 'inbox:get-counts'), {
      timeout: 45_000
    })
    .toMatchObject({ toSort: names.length, sniffing: 0 })

  const { items } = await ok<{ items: { id: number; title: string; batchId: string | null }[] }>(
    app,
    'inbox:list',
    { stage: 'to_sort' }
  )
  const batchId = items[0]?.batchId
  expect(batchId, 'the haul has a batch').toBeTruthy()
  await ok(app, 'grouping:confirm', {
    batchId,
    groups: [],
    singletonIds: items.map((i) => i.id)
  })
  await ok(app, 'look-over:open')

  const seeded: Seeded[] = []
  for (const item of items) {
    const stashed = await ok<{ ok: boolean }>(app, 'mockup:stash', { mockupId: item.id })
    expect(stashed.ok, `${item.title} is stashed`).toBe(true)
    seeded.push({ name: item.title, id: item.id, title: `Stub ${item.title}` })
  }
  return seeded
}

/**
 * Opens My Stash > All on what is stored now. Specs that seed through channels call this after
 * the last change: the page loads its list when it opens, so a reload is how it sees them.
 */
export async function showMyStash(app: E2EApp): Promise<void> {
  const { window } = app
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await expect(window.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await window.getByRole('button', { name: /^All/ }).click()
}

/** The id of a tag category, made if the fresh stash doesn't have it. */
export async function categoryId(app: E2EApp, label: string): Promise<number> {
  const { categories } = await ok<{ categories: { categoryId: number; categoryLabel: string }[] }>(
    app,
    'tag:list-by-category'
  )
  const found = categories.find((c) => c.categoryLabel.toLowerCase() === label.toLowerCase())
  if (found) return found.categoryId
  return (await ok<{ categoryId: number }>(app, 'category:create', { label })).categoryId
}

/** Makes a tag in a category (the category too, if it is new) and returns the tag's id. */
export async function makeTag(app: E2EApp, category: string, label: string): Promise<number> {
  const id = await categoryId(app, category)
  return (await ok<{ tagId: number }>(app, 'tag:create', { label, categoryId: id })).tagId
}

/** Puts tags on a stashed mockup, keeping its title. */
export async function tagMockup(app: E2EApp, mockup: Seeded, tagIds: number[]): Promise<void> {
  await ok(app, 'mockup:update', {
    mockupId: mockup.id,
    title: mockup.title,
    description: '',
    tagIds
  })
}
