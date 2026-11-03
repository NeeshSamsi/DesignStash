import { describe, expect, it, vi, type Mock } from 'vitest'
import { join } from 'node:path'
import { DEV_USER_DATA, applyDevUserData, type DevUserDataApp } from './dev-user-data'

const APP_DATA = '/Users/neesh/Library/Application Support'

function fakeApp(opts: { packaged: boolean; userDataDir?: string }): DevUserDataApp & {
  setPath: Mock<(name: string, path: string) => void>
} {
  return {
    isPackaged: opts.packaged,
    commandLine: { hasSwitch: (name: string) => name === 'user-data-dir' && !!opts.userDataDir },
    getPath: (name: 'appData') => (name === 'appData' ? APP_DATA : ''),
    setPath: vi.fn<(name: string, path: string) => void>()
  }
}

describe('applyDevUserData', () => {
  it('gives dev its own DesignStash-dev folder', () => {
    const app = fakeApp({ packaged: false })
    applyDevUserData(app)
    expect(app.setPath).toHaveBeenCalledWith('userData', join(APP_DATA, 'DesignStash-dev'))
    expect(DEV_USER_DATA).toBe('DesignStash-dev')
  })

  it('leaves the installed app in DesignStash', () => {
    const app = fakeApp({ packaged: true })
    applyDevUserData(app)
    expect(app.setPath).not.toHaveBeenCalled()
  })

  it('leaves an explicit --user-data-dir alone, as e2e and the seed tool pass one', () => {
    const app = fakeApp({ packaged: false, userDataDir: '/tmp/designstash-e2e-1' })
    applyDevUserData(app)
    expect(app.setPath).not.toHaveBeenCalled()
  })
})
