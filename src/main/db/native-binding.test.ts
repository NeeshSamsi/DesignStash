import { describe, expect, it } from 'vitest'
import { chooseNativeBinding, electronBindingPath } from './native-binding'

const base = {
  electronVersion: '41.0.0' as string | undefined,
  packaged: false,
  arch: 'arm64',
  nodeModulesDir: () => '/repo/node_modules',
  exists: () => true
}
const copy = '/repo/node_modules/.cache/better-sqlite3-electron/41.0.0-arm64/better_sqlite3.node'

describe('chooseNativeBinding', () => {
  it('names the Electron copy by version and architecture, outside better-sqlite3/build', () => {
    expect(electronBindingPath('/repo/node_modules', '41.0.0', 'arm64')).toBe(copy)
  })

  it('loads the Electron copy in dev when it exists', () => {
    expect(chooseNativeBinding(base)).toBe(copy)
  })

  it('falls back to the default build in dev when the copy is missing', () => {
    expect(chooseNativeBinding({ ...base, exists: () => false })).toBeUndefined()
  })

  it('leaves the installed app on the binary electron-builder shipped', () => {
    expect(chooseNativeBinding({ ...base, packaged: true })).toBeUndefined()
  })

  it('uses the default Node build outside Electron', () => {
    expect(chooseNativeBinding({ ...base, electronVersion: undefined })).toBeUndefined()
  })

  it('does not even look for the copy when it will not be used', () => {
    const look = () => {
      throw new Error('looked')
    }
    expect(chooseNativeBinding({ ...base, packaged: true, nodeModulesDir: look })).toBeUndefined()
  })
})
