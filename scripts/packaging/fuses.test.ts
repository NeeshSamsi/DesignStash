import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8')

/** The `electronFuses:` block of electron-builder.yml, as key → on/off. */
function electronFuses(yml: string): Record<string, boolean> {
  const block = /^electronFuses:\n((?: {2}.*\n|\s*\n)*)/m.exec(yml)?.[1] ?? ''
  return Object.fromEntries(
    [...block.matchAll(/^ {2}(\w+): (true|false)\b/gm)].map(([, key, value]) => [key, value === 'true'])
  )
}

// electron-builder burns these into the Electron binary before it signs the app.
describe('Electron fuses in the packaged app', () => {
  const fuses = electronFuses(read('electron-builder.yml'))

  it('never runs as plain Node or takes code from NODE_OPTIONS', () => {
    expect(fuses).toMatchObject({ runAsNode: false, enableNodeOptionsEnvironmentVariable: false })
  })

  it('loads the app only from its asar, checked against the hash in Info.plist', () => {
    expect(fuses).toMatchObject({ enableEmbeddedAsarIntegrityValidation: true, onlyLoadAppFromAsar: true })
  })

  it('keeps --inspect, which Playwright uses to drive the packaged app in e2e', () => {
    expect(fuses).toMatchObject({ enableNodeCliInspectArguments: true })
  })
})
