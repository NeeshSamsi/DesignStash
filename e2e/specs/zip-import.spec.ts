import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '../fixtures/app'
import { makeMockupZip, makeZip } from '../fixtures/zips'

/**
 * Zips as downloaded from free mockup sites go straight in: the PSDs inside are copied into the
 * stash and the zip is left as it was. Started through copy:start, as the journey does; the drop
 * and the Add menu call the same channel.
 */

interface Status {
  haul: {
    state: string
    landed: number
    files: { name: string; status: string; archiveName?: string; skipReason?: string }[]
  } | null
}

test('the PSDs inside a dropped zip land in To sort, piled under the zip name', async ({ app }) => {
  const { window } = app
  const desk = join(app.userData, 'Desktop')
  const zip = await makeMockupZip(
    join(desk, 'y1PjyY3rTTWYuCfHXkQo_Qubus.zip'),
    ['Qubus/Files/Qubus (EU).psd', 'Qubus/Files/Qubus (US).psd'],
    [
      { name: '__MACOSX/Qubus/Files/._Qubus (EU).psd', data: 'apple' },
      { name: '🎁 Get 50% off.url', data: '[InternetShortcut]' }
    ]
  )
  const before = readFileSync(zip)

  await test.step('gather: both PSDs are copied in, and the zip is untouched', async () => {
    expect((await app.invoke('copy:start', { paths: [zip] })).success).toBe(true)
    await expect
      .poll(async () => (await app.invoke<Status>('copy:status')).data?.haul?.state, {
        timeout: 30_000
      })
      .toBe('done')
    const { haul } = (await app.invoke<Status>('copy:status')).data!
    expect(haul!.landed).toBe(2)
    expect(haul!.files.map((f) => [f.name, f.archiveName])).toEqual([
      ['Qubus (EU).psd', 'y1PjyY3rTTWYuCfHXkQo_Qubus.zip'],
      ['Qubus (US).psd', 'y1PjyY3rTTWYuCfHXkQo_Qubus.zip']
    ])
    expect(readFileSync(zip).equals(before)).toBe(true)

    await window.getByRole('button', { name: /^To sort/ }).click()
    await expect(window.getByText('AI suggestions ready for all 2')).toBeVisible()
  })

  await test.step('sort: the two are proposed as one pile, titled after the zip', async () => {
    await window.getByRole('button', { name: 'Sort', exact: true }).click()
    await expect(window.getByText('Qubus', { exact: true })).toBeVisible()
    await expect(window.getByText('2 mockups')).toBeVisible()
  })
})

test('archives that give no PSD are listed as skipped, each with its reason', async ({ app }) => {
  const { window } = app
  const desk = join(app.userData, 'Desktop', 'Downloads')
  await makeMockupZip(join(desk, 'Free_Cap_Mockup.zip'), ['Free_Cap_Mockup/Files/Cap.psd'])
  await makeZip(join(desk, 'Fonts.zip'), [{ name: 'Inter.otf', data: 'font' }])
  writeFileSync(join(desk, 'Pack.rar'), 'rar')

  expect((await app.invoke('copy:start', { paths: [desk] })).success).toBe(true)
  await expect
    .poll(async () => (await app.invoke<Status>('copy:status')).data?.haul?.state, {
      timeout: 30_000
    })
    .toBe('done')

  const { haul } = (await app.invoke<Status>('copy:status')).data!
  expect(haul!.files.filter((f) => f.status === 'skipped')).toEqual([
    expect.objectContaining({ name: 'Fonts.zip', skipReason: 'no-psd-in-archive' }),
    expect.objectContaining({ name: 'Pack.rar', skipReason: 'archive-unsupported' })
  ])
  await expect(window.getByText('1 copied · 2 skipped')).toBeVisible()
})

test('a zip inside a zip is read one level deep, and nothing is left in staging', async ({
  app
}) => {
  const desk = join(app.userData, 'Desktop')
  const innerSrc = await makeMockupZip(join(app.userData, 'inner-src.zip'), ['Cards/Notebook.psd'])
  await makeZip(join(desk, 'Free_3_Cards_Mockup.zip'), [
    {
      name: 'Free_3_Cards_Mockup/File/Free_3_Cards_Mockup.psd.zip',
      data: readFileSync(innerSrc),
      compress: false
    }
  ])

  expect(
    (await app.invoke('copy:start', { paths: [join(desk, 'Free_3_Cards_Mockup.zip')] })).success
  ).toBe(true)
  await expect
    .poll(async () => (await app.invoke<Status>('copy:status')).data?.haul?.state, {
      timeout: 30_000
    })
    .toBe('done')

  const { haul } = (await app.invoke<Status>('copy:status')).data!
  expect(haul!.files).toEqual([
    expect.objectContaining({
      name: 'Notebook.psd',
      status: 'done',
      archiveName: 'Free_3_Cards_Mockup.zip'
    })
  ])
  await expect.poll(() => existsSync(join(app.stash, '.staging'))).toBe(false)
})
