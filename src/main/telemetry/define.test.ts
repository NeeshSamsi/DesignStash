import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { posthogDefine } from './define'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ds-env-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('posthogDefine', () => {
  it('picks the key and host up from a .env file', () => {
    writeFileSync(join(dir, '.env'), 'POSTHOG_KEY=phc_local\nPOSTHOG_HOST=https://eu.example\n')
    expect(posthogDefine('production', dir, {})).toEqual({
      __POSTHOG_KEY__: '"phc_local"',
      __POSTHOG_HOST__: '"https://eu.example"'
    })
  })

  it('lets the process environment (CI) win over the file', () => {
    writeFileSync(join(dir, '.env'), 'POSTHOG_KEY=phc_local\n')
    expect(posthogDefine('production', dir, { POSTHOG_KEY: 'phc_ci' }).__POSTHOG_KEY__).toBe('"phc_ci"')
  })

  it('is empty with no file and no environment, so the build stays Noop', () => {
    expect(posthogDefine('production', dir, {})).toEqual({ __POSTHOG_KEY__: '""', __POSTHOG_HOST__: '""' })
  })
})
