import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SLOT_MASK_FILE, SLOT_MASK_NONE, SLOT_MASK_VERSION } from './design-slot'
import { ensureSlotMask } from './design-slot-worker'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A mockup's folder with its PSD and cover, and whatever else is named. */
function mockup(...files: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'ds-ensure-'))
  dirs.push(dir)
  mkdirSync(dir, { recursive: true })
  for (const f of ['original.psd', 'cover.webp', ...files]) writeFileSync(join(dir, f), '')
  return { dir, m: { libraryPath: join(dir, 'original.psd'), coverPath: join(dir, 'cover.webp'), coverSource: 'embedded' as const } }
}

describe('ensureSlotMask: the queue readies a mockup before the AI reads it', () => {
  it('reads a PSD that has neither a mask nor an answer about one', async () => {
    const { m } = mockup()
    const write = vi.fn(async () => 'no-slot' as const)
    await ensureSlotMask(m, write)
    expect(write).toHaveBeenCalledWith(m.libraryPath, m.coverPath, join(m.coverPath, '..', SLOT_MASK_FILE))
  })

  it('never reads a PSD again once it has a mask, or once it gave none', async () => {
    const write = vi.fn(async () => 'written' as const)
    await ensureSlotMask(mockup(SLOT_MASK_FILE).m, write)
    const { dir, m } = mockup()
    writeFileSync(join(dir, SLOT_MASK_NONE), JSON.stringify({ outcome: 'other-shape', version: SLOT_MASK_VERSION }))
    await ensureSlotMask(m, write)
    expect(write).not.toHaveBeenCalled()
  })

  it('leaves a cover the person chose alone', async () => {
    const write = vi.fn(async () => 'written' as const)
    await ensureSlotMask({ ...mockup().m, coverSource: 'user-uploaded' }, write)
    expect(write).not.toHaveBeenCalled()
  })
})
