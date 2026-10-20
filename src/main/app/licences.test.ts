import { describe, it, expect } from 'vitest'
import { buildLicencesText, type PackageSource } from './licences'

const source: PackageSource = {
  readApp: () => ({ license: 'PolyForm-Shield-1.0.0', dependencies: { zod: '^4', better: '^1', odd: '^2' } }),
  readDependency: (name) =>
    ({ zod: { version: '4.1.0', license: 'MIT' }, better: { version: '1.0.0', license: { type: 'ISC' } }, odd: null })[
      name as 'zod' | 'better' | 'odd'
    ]
}

describe('buildLicencesText', () => {
  it('lists the app licence and each dependency in name order with version and licence', () => {
    expect(buildLicencesText(source)).toBe(
      [
        'DesignStash',
        'Licence: PolyForm-Shield-1.0.0',
        '',
        'Open source components',
        '',
        'better 1.0.0  ISC',
        'odd ^2  unknown',
        'zod 4.1.0  MIT',
        ''
      ].join('\n')
    )
  })

  it('has no paths in it', () => {
    expect(buildLicencesText(source)).not.toMatch(/\/Users|node_modules/)
  })
})
