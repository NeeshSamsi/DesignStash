import { afterEach, describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MEANING_MODEL, MODEL_REGISTRY } from '../ai/registry'
import { buildLicencesText, nodePackageSource, type PackageSource } from './licences'

const versions = { electron: '42.4.0', chrome: '140.0.7339.41' }

const source: PackageSource = {
  readApp: () => ({ license: 'PolyForm-Shield-1.0.0', dependencies: { zod: '^4', better: '^1', odd: '^2' } }),
  readDependency: (name) =>
    ({ zod: { version: '4.1.0', license: 'MIT' }, better: { version: '1.0.0', license: { type: 'ISC' } }, odd: null })[
      name as 'zod' | 'better' | 'odd'
    ] ?? null
}

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** An app folder with a hoisted node_modules, the way pnpm installs it here. */
function appFolder(packages: Record<string, object>, app: object): string {
  const root = mkdtempSync(join(tmpdir(), 'ds-licences-'))
  dirs.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify(app))
  for (const [path, pkg] of Object.entries(packages)) {
    mkdirSync(join(root, path), { recursive: true })
    writeFileSync(join(root, path, 'package.json'), JSON.stringify(pkg))
  }
  return root
}

describe('buildLicencesText', () => {
  it('lists the app licence, then each dependency in name order with version and licence', () => {
    const start = [
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
    const text = buildLicencesText(source, versions)
    expect(text.slice(0, start.length)).toBe(start)
  })

  it('has no paths in it', () => {
    expect(buildLicencesText(source, versions)).not.toMatch(/\/Users|node_modules/)
  })

  it('lists every package the app ships, its dependencies’ dependencies included', () => {
    const root = appFolder(
      {
        'node_modules/ag-psd': { version: '30.1.1', license: 'MIT', dependencies: { 'base64-js': '^1', pako: '^2' } },
        'node_modules/base64-js': { version: '1.5.1', license: 'MIT' },
        'node_modules/pako': { version: '1.0.11', license: '(MIT AND Zlib)' },
        // A second version, nested where the hoisted one doesn't fit.
        'node_modules/ag-psd/node_modules/pako': { version: '2.1.0', license: '(MIT AND Zlib)' },
        'node_modules/zod': { version: '4.1.0', license: 'MIT', optionalDependencies: { 'not-for-mac': '^1' } }
      },
      { license: 'PolyForm-Shield-1.0.0', dependencies: { 'ag-psd': '^30', pako: '^1', zod: '^4' } }
    )

    const text = buildLicencesText(nodePackageSource(root), versions)

    expect(text).toContain('ag-psd 30.1.1  MIT\n')
    expect(text).toContain('base64-js 1.5.1  MIT\n')
    expect(text).toContain('pako 1.0.11  (MIT AND Zlib)\n')
    expect(text).toContain('pako 2.1.0  (MIT AND Zlib)\n')
    expect(text).toContain('zod 4.1.0  MIT\n')
    // An optional package for another platform was never installed, so it doesn't ship.
    expect(text).not.toContain('not-for-mac')
  })

  it('names what ships outside npm: Electron, Chromium and llama.cpp', () => {
    const text = buildLicencesText(source, versions)
    expect(text).toContain('Electron 42.4.0  MIT')
    expect(text).toContain('Chromium 140.0.7339.41  BSD-3-Clause')
    expect(text).toMatch(/llama\.cpp .* MIT/)
  })

  it('names every AI model the app downloads, with a known licence', () => {
    const text = buildLicencesText(source, versions)
    const downloaded = MODEL_REGISTRY.filter((m) => m.files !== null).map((m) => m.name)
    for (const name of [...downloaded, MEANING_MODEL.name]) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expect(text).toMatch(new RegExp(`^${escaped}.*  (?!unknown)\\S.*$`, 'm'))
    }
  })

  it('gives the models their licences from the model research', () => {
    // design/research/vlm-models.md and the registry's meaning model.
    const text = buildLicencesText(source, versions)
    expect(text).toContain('Qwen3-VL 4B  Apache 2.0\n')
    expect(text).toContain('Qwen3.5 9B  Apache 2.0\n')
    expect(text).toContain('Meaning search (nomic-embed-text v1.5)  Apache 2.0\n')
  })
})
