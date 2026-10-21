import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  archiveKindOf,
  classifyEntry,
  decodeEntryName,
  listArchive,
  openArchiveEntry
} from './archive'
import { makeZip, markEncrypted } from './__tests__/zips'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ds-archive-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('archiveKindOf', () => {
  it('knows a zip by its extension, in any case', () => {
    expect(archiveKindOf('/a/Free_Cap_Mockup.zip')).toBe('zip')
    expect(archiveKindOf('/a/LOUD.ZIP')).toBe('zip')
  })
  it('calls .rar and .7z unsupported', () => {
    expect(archiveKindOf('/a/pack.rar')).toBe('unsupported')
    expect(archiveKindOf('/a/pack.7Z')).toBe('unsupported')
  })
  it('leaves everything else alone', () => {
    expect(archiveKindOf('/a/cap.psd')).toBeNull()
    expect(archiveKindOf('/a/zip')).toBeNull()
  })
})

describe('listArchive', () => {
  it('lists every entry with its uncompressed size, without extracting', async () => {
    const zip = await makeZip(join(dir, 'a.zip'), [
      { name: 'Cap Mockup/', compress: false },
      { name: 'Cap Mockup/Cap.psd', data: 'x'.repeat(5000) },
      { name: 'Cap Mockup/readme.pdf', data: 'pdf', compress: false }
    ])
    const entries = await listArchive(zip)
    expect(entries).toEqual([
      { name: 'Cap Mockup/', size: 0, encrypted: false, directory: true },
      { name: 'Cap Mockup/Cap.psd', size: 5000, encrypted: false, directory: false },
      { name: 'Cap Mockup/readme.pdf', size: 3, encrypted: false, directory: false }
    ])
  })

  it('flags encrypted entries', async () => {
    const zip = await makeZip(join(dir, 'locked.zip'), [{ name: 'a.psd', data: 'psd' }])
    markEncrypted(zip)
    const [entry] = await listArchive(zip)
    expect(entry?.encrypted).toBe(true)
  })

  it('decodes UTF-8 names', async () => {
    const zip = await makeZip(join(dir, 'u.zip'), [{ name: '🎁 Free gift.pdf', data: 'x' }])
    const [entry] = await listArchive(zip)
    expect(entry?.name).toBe('🎁 Free gift.pdf')
  })

  it('rejects a file that is not a zip', async () => {
    const fake = join(dir, 'fake.zip')
    writeFileSync(fake, 'not a zip at all')
    await expect(listArchive(fake)).rejects.toThrow()
  })

  it('rejects a zip that is not there', async () => {
    await expect(listArchive(join(dir, 'gone.zip'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('decodeEntryName', () => {
  const name = '🎁 Gift.url'
  const utf8 = Buffer.from(name, 'utf8')

  it('reads UTF-8 when the entry is flagged as UTF-8', () => {
    expect(decodeEntryName(0x800, utf8, [])).toBe(name)
  })

  it('reads UTF-8 stored without the flag, as many zip tools write it', () => {
    expect(decodeEntryName(0, utf8, [])).toBe(name)
  })

  it('falls back to CP437 for bytes that are not UTF-8', () => {
    // 0x81 is ü in CP437 and can never start a UTF-8 character.
    expect(decodeEntryName(0, Buffer.from([0x4d, 0x81, 0x6c, 0x6c]), [])).toBe('Müll')
  })

  it('keeps plain ASCII as it is', () => {
    expect(decodeEntryName(0, Buffer.from('Cap Mockup/Cap.psd'), [])).toBe('Cap Mockup/Cap.psd')
  })

  it('turns backslashes into folder separators', () => {
    expect(decodeEntryName(0, Buffer.from('Cap\\Cap.psd'), [])).toBe('Cap/Cap.psd')
  })
})

describe('openArchiveEntry', () => {
  it('streams one entry, deflated or stored', async () => {
    const big = Buffer.alloc(3 * 1024 * 1024, 7)
    const zip = await makeZip(join(dir, 'a.zip'), [
      { name: 'a.psd', data: big },
      { name: 'b.psd', data: 'stored', compress: false }
    ])
    expect((await buffer(await openArchiveEntry(zip, 'a.psd'))).equals(big)).toBe(true)
    expect((await buffer(await openArchiveEntry(zip, 'b.psd'))).toString()).toBe('stored')
  })

  it('finds an entry by its decoded name', async () => {
    const zip = await makeZip(join(dir, 'a.zip'), [{ name: 'Mockup 🎁/Cap.psd', data: 'psd' }])
    expect((await buffer(await openArchiveEntry(zip, 'Mockup 🎁/Cap.psd'))).toString()).toBe('psd')
  })

  it('says so when the entry is gone', async () => {
    const zip = await makeZip(join(dir, 'a.zip'), [{ name: 'a.psd', data: 'psd' }])
    await expect(openArchiveEntry(zip, 'b.psd')).rejects.toMatchObject({ code: 'ENTRY_MISSING' })
  })

  it('will not open an encrypted entry', async () => {
    const zip = await makeZip(join(dir, 'a.zip'), [{ name: 'a.psd', data: 'psd' }])
    markEncrypted(zip)
    await expect(openArchiveEntry(zip, 'a.psd')).rejects.toThrow()
  })

  it('stops an entry that expands past its declared size', async () => {
    const zip = await makeZip(join(dir, 'a.zip'), [{ name: 'a.psd', data: 'x'.repeat(4096) }])
    // Shrink the declared size in both headers, as a zip bomb would.
    const buf = readFileSync(zip)
    for (let i = 0; i + 4 <= buf.length; i++) {
      const sig = buf.readUInt32LE(i)
      if (sig === 0x02014b50) buf.writeUInt32LE(10, i + 24)
      if (sig === 0x04034b50 && buf.readUInt32LE(i + 22) === 4096) buf.writeUInt32LE(10, i + 22)
    }
    writeFileSync(zip, buf)
    await expect(openArchiveEntry(zip, 'a.psd').then((s) => buffer(s))).rejects.toThrow(
      /too many bytes/
    )
  })
})

describe('classifyEntry', () => {
  const file = (name: string) => ({ name, directory: false })

  it('finds PSDs, in any case', () => {
    expect(classifyEntry(file('Cap Mockup/Cap.psd'))).toBe('psd')
    expect(classifyEntry(file('CAP.PSD'))).toBe('psd')
  })

  it('finds zips inside the zip', () => {
    expect(classifyEntry(file('Business Cards/Envelope.zip'))).toBe('zip')
  })

  it('treats macOS packaging as junk', () => {
    expect(classifyEntry(file('__MACOSX/Cap Mockup/._Cap.psd'))).toBe('junk')
    expect(classifyEntry(file('Cap Mockup/._Cap.psd'))).toBe('junk')
    expect(classifyEntry(file('Cap Mockup/.DS_Store'))).toBe('junk')
    expect(classifyEntry(file('__MACOSX/inner.zip'))).toBe('junk')
  })

  it('treats folders as junk', () => {
    expect(classifyEntry({ name: 'Cap Mockup/', directory: true })).toBe('junk')
  })

  it('calls everything else other', () => {
    expect(classifyEntry(file('Get 50% off.url'))).toBe('other')
    expect(classifyEntry(file('help.pdf'))).toBe('other')
    expect(classifyEntry(file('Cap.fig'))).toBe('other')
    expect(classifyEntry(file('preview.jpg'))).toBe('other')
  })
})
