import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, type E2EApp } from '../fixtures/app'
import { SMALL_REAL_ZIPS, TEST_SET_MISSING, testSet } from '../fixtures/test-set'
import { makeMockupZip, makeZip } from '../fixtures/zips'

/**
 * Zips as downloaded from free mockup sites go straight in: the PSDs inside are copied into the
 * stash and the zip is left as it was. Imports come from the DesignStash test set: its generated
 * `invalid/` and `edge/` cases (outcomes from its MANIFEST.md), `folders/Mixed Drop/` and one small
 * real zip. Started through copy:start directly: the journey's gather tests cover the ways in
 * (File › Add Files…, the Add card, ⌘O and drops), which all end in that call.
 */

interface File {
  name: string
  status: string
  archiveName?: string
  skipReason?: string
}
interface Haul {
  state: string
  total: number
  landed: number
  skipped: Record<string, number>
  files: File[]
}
interface ToSortItem {
  id: number
  title: string
  coverSource: string
  batchId: string | null
}
interface Member {
  mockupId: number
  fileName: string
  folderTrail: string[]
  archiveTitle?: string
}
interface Proposal {
  groups: { reason: string; members: Member[] }[]
  singletons: Member[]
}

/** Copy these paths in and wait for the haul to finish. */
async function gather(app: E2EApp, paths: string[]): Promise<Haul> {
  expect((await app.invoke('copy:start', { paths })).success).toBe(true)
  await expect
    .poll(async () => (await app.invoke<{ haul: Haul | null }>('copy:status')).data?.haul?.state, {
      timeout: 60_000
    })
    .toBe('done')
  return (await app.invoke<{ haul: Haul }>('copy:status')).data!.haul
}

async function toSort(app: E2EApp): Promise<ToSortItem[]> {
  return (await app.invoke<{ items: ToSortItem[] }>('inbox:list', { stage: 'to_sort' })).data!.items
}

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

/** Every file under a folder, by name. */
function namesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
}

const skipped = (haul: Haul) =>
  Object.fromEntries(
    haul.files.filter((f) => f.status === 'skipped').map((f) => [f.name, f.skipReason])
  )

test.describe('zip import on the test set', () => {
  test.skip(!testSet.available, TEST_SET_MISSING)
  test.describe.configure({ timeout: 120_000 })

  test('archives that give no PSD are skipped with their reasons, and a PSB inside a zip lands', async ({
    app
  }) => {
    const invalid = testSet.generated('invalid')
    const haul = await gather(app, [invalid])

    expect(skipped(haul)).toMatchObject({
      'Encrypted_Mockup.zip': 'archive-unsupported',
      'Seven_Zip_Mockup.7z': 'archive-unsupported',
      'Rar_Mockup.rar': 'archive-unsupported',
      'No_PSD_Inside.zip': 'no-psd-in-archive',
      'Empty.zip': 'no-psd-in-archive',
      // The PSD is one zip deeper than the one level that is opened.
      'Three_Levels_Deep.zip': 'no-psd-in-archive',
      'Truncated_Download.zip': 'unreadable',
      'Not_Really_A_Zip.zip': 'unreadable'
    })
    // A PSB, Photoshop's Large Document Format, is taken like a PSD (H-12): the zip's one lands. Its
    // composite reads as a near-blank canvas and the zip has no preview image, so that is its cover.
    expect(skipped(haul)).not.toHaveProperty(['Only_PSB_Inside.zip'])
    expect(haul.files.find((f) => f.name === 'Huge Canvas Mockup.psb')).toMatchObject({ status: 'done' })
    expect((await toSort(app)).find((i) => i.title === 'Huge Canvas Mockup')).toMatchObject({
      coverSource: 'embedded'
    })

    // The corrupt PSD may land with no preview, or be skipped as unreadable. It must not stop the haul.
    const broken = haul.files.find((f) => f.name === 'Broken Mockup.psd')
    expect(broken?.status === 'done' || broken?.skipReason === 'unreadable').toBe(true)
    expect(haul.landed).toBe(broken?.status === 'done' ? 2 : 1)
    expect(haul.skipped).toMatchObject({ archiveUnsupported: 3, noPsdInArchive: 3 })

    // An unreadable file keeps the summary up until it is dismissed.
    await expect(app.window.getByText(/^(1 copied · 9|2 copied · 8) skipped$/)).toBeVisible()
    // Three_Levels_Deep was staged to look inside; nothing is left behind.
    await expect.poll(() => existsSync(join(app.stash, '.staging'))).toBe(false)
  })

  test('edge cases land with their twists, inside the stash, and the zips are untouched', async ({
    app
  }) => {
    const edge = testSet.generated('edge')
    const zips = readdirSync(edge).filter((n) => n.endsWith('.zip'))
    const before = Object.fromEntries(zips.map((z) => [z, sha256(join(edge, z))]))

    const haul = await gather(app, [edge])

    // The same PSD bytes are in Uppercase_Extension and Duplicate_Of_Uppercase: one lands, the other
    // is the duplicate. Files are copied in path order, so the one that lands is whichever comes first.
    const loud = haul.files.filter((f) => ['LOUD MOCKUP.PSD', 'Same As Loud.psd'].includes(f.name))
    expect(loud.map((f) => f.status).sort()).toEqual(['done', 'skipped'])
    expect(loud.find((f) => f.status === 'skipped')?.skipReason).toBe('duplicate')
    expect(haul).toMatchObject({ landed: 11, skipped: { duplicate: 1 } })

    const titles = (await toSort(app)).map((i) => i.title)
    expect(titles).toEqual(
      expect.arrayContaining([
        'Escaped Mockup',
        'Rooted Mockup',
        'Café Mockup été',
        'Stored Mockup',
        'Phone Front',
        'Phone Side',
        'Phone Back',
        'Phone Back Dark',
        'Real Mockup',
        'Random Prefix Mockup'
      ])
    )
    // AppleDouble look-alikes (`._Real Mockup.psd`) are packaging, never mockups.
    expect(titles.filter((t) => t.includes('Real Mockup'))).toEqual(['Real Mockup'])

    // Zip slip: nothing was written next to the zips or above them, nor at the absolute path.
    for (const dir of [edge, join(edge, '..'), join(edge, '..', '..'), app.userData]) {
      const names = dir === app.userData ? namesUnder(dir) : readdirSync(dir)
      expect(names).not.toContain('Escaped Mockup.psd')
      expect(names).not.toContain('Rooted Mockup.psd')
    }
    expect(existsSync('/absolute')).toBe(false)
    // The test set itself is untouched.
    for (const z of zips) expect(sha256(join(edge, z)), z).toBe(before[z])

    // Folder names: the dropped folder's own name first, no `..`, the random ID prefix is gone, and
    // a zip's four PSDs are one pile.
    const batchId = (await toSort(app))[0]!.batchId
    const proposal = (await app.invoke<Proposal>('grouping:propose', { batchId })).data!
    const members = [...proposal.groups.flatMap((g) => g.members), ...proposal.singletons]
    expect(members.flatMap((m) => m.folderTrail)).not.toContain('..')
    expect(members.find((m) => m.fileName === 'Random Prefix Mockup.psd')?.folderTrail).toEqual([
      'edge',
      'Random Prefix Mockup'
    ])
    const variants = proposal.groups.find((g) =>
      g.members.some((m) => m.fileName === 'Phone Front.psd')
    )
    expect(variants?.reason).toBe('archive')
    expect(variants?.members.map((m) => m.fileName).sort()).toEqual([
      'Phone Back Dark.psd',
      'Phone Back.psd',
      'Phone Front.psd',
      'Phone Side.psd'
    ])

    await app.window.getByRole('button', { name: /^To sort/ }).click()
    await app.window.getByRole('button', { name: 'Sort', exact: true }).click()
    await expect(app.window.getByText('Pile Of Variants', { exact: true })).toBeVisible()
    await expect(app.window.getByText('4 mockups')).toBeVisible()
  })

  test('a mixed folder: the zip’s PSD and the loose PSD land, the .7z and the text file do not', async ({
    app
  }) => {
    const haul = await gather(app, [testSet.folder('Mixed Drop')])

    expect(haul).toMatchObject({
      landed: 2,
      skipped: { notPsd: 1, archiveUnsupported: 1 }
    })
    expect(skipped(haul)).toEqual({ 'Also A Seven Zip.7z': 'archive-unsupported' })
    expect(haul.files.find((f) => f.name === 'Stored Mockup.psd')?.archiveName).toBe(
      'Inside A Folder.zip'
    )
    expect((await toSort(app)).map((i) => i.title).sort()).toEqual([
      'Loose Mockup',
      'Stored Mockup'
    ])
    await expect(app.window.getByText('2 copied · 2 skipped')).toBeVisible()
  })

  test('a real download lands with the cover from its PSD, and the zip is left as it was', async ({
    app
  }) => {
    const zip = testSet.zip(SMALL_REAL_ZIPS.matteSnackBar)
    const before = sha256(zip)

    const haul = await gather(app, [zip])

    expect(haul.files).toEqual([
      expect.objectContaining({
        name: 'Matte Snack Bar Mockup.psd',
        status: 'done',
        archiveName: SMALL_REAL_ZIPS.matteSnackBar
      })
    ])
    const [item] = await toSort(app)
    expect(item).toMatchObject({ title: 'Matte Snack Bar Mockup', coverSource: 'embedded' })
    expect(sha256(zip)).toBe(before)

    await app.window.getByRole('button', { name: /^To sort/ }).click()
    await expect(app.window.getByText('Matte Snack Bar Mockup', { exact: true })).toBeVisible()
  })
})

test('a zip inside a zip is read one level deep, and nothing is left in staging', async ({
  app
}) => {
  // Built here: the test set's only positive case is a 198 MB inner zip, too big for e2e.
  const desk = join(app.userData, 'Desktop')
  const innerSrc = await makeMockupZip(join(app.userData, 'inner-src.zip'), ['Cards/Notebook.psd'])
  const outer = await makeZip(join(desk, 'Free_3_Cards_Mockup.zip'), [
    {
      name: 'Free_3_Cards_Mockup/File/Free_3_Cards_Mockup.psd.zip',
      data: readFileSync(innerSrc),
      compress: false
    }
  ])

  const haul = await gather(app, [outer])

  expect(haul.files).toEqual([
    expect.objectContaining({
      name: 'Notebook.psd',
      status: 'done',
      archiveName: 'Free_3_Cards_Mockup.zip'
    })
  ])
  await expect.poll(() => existsSync(join(app.stash, '.staging'))).toBe(false)
})
