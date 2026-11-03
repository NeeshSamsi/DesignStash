import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { MEANING_MODEL, MODEL_REGISTRY } from '../ai/registry'

export interface PackageJson {
  version?: string
  license?: string | { type?: string | undefined } | undefined
  dependencies?: Record<string, string> | undefined
  optionalDependencies?: Record<string, string> | undefined
}

export interface PackageSource {
  /** package.json of the app: name, license and dependencies. */
  readApp(): { license?: string | undefined; dependencies?: Record<string, string> | undefined }
  /**
   * package.json of one dependency, or null when it can't be read. `from` is the folder of the
   * package that depends on it (its `dir`), so a nested copy wins over the hoisted one.
   */
  readDependency(name: string, from?: string): (PackageJson & { dir?: string }) | null
}

export function nodePackageSource(root: string): PackageSource {
  const read = (path: string): PackageJson | null => {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as PackageJson
    } catch {
      return null
    }
  }
  return {
    readApp: () => (read(join(root, 'package.json')) ?? {}) as ReturnType<PackageSource['readApp']>,
    // Node's lookup: node_modules beside the asking package, then each folder up to the app's.
    readDependency: (name, from = root) => {
      for (let dir = from; ; dir = dirname(dir)) {
        const pkgDir = join(dir, 'node_modules', name)
        const pkg = read(join(pkgDir, 'package.json'))
        if (pkg) return { ...pkg, dir: pkgDir }
        if (relative(root, dir) === '' || relative(root, dir).startsWith('..')) return null
      }
    }
  }
}

/** Shipped inside the app without a package.json of their own. */
const BUNDLED = (versions: { electron?: string | undefined; chrome?: string | undefined }) => [
  `Electron ${versions.electron ?? ''}  MIT`,
  `Chromium ${versions.chrome ?? ''}  BSD-3-Clause, with the third-party licences Chromium lists`,
  'llama.cpp (llama-server)  MIT'
]

/** Licences of the downloadable models, from design/research/vlm-models.md. */
const MODEL_LICENCES: Record<string, string> = {
  'qwen3-vl-4b': 'Apache 2.0',
  'qwen3.5-9b': 'Apache 2.0'
}

function modelLines(): string[] {
  const vision = MODEL_REGISTRY.filter((m) => m.files !== null).map(
    (m) => `${m.name}  ${MODEL_LICENCES[m.id] ?? 'unknown'}`
  )
  return [...vision, `${MEANING_MODEL.name} (nomic-embed-text v1.5)  ${MEANING_MODEL.license}`]
}

const licenceOf = (pkg: PackageJson | null): string =>
  typeof pkg?.license === 'string' ? pkg.license : (pkg?.license?.type ?? 'unknown')

/**
 * Plain-text licences notice: the app's own licence, every npm package it ships (dependencies of
 * dependencies included), then what ships or downloads outside npm.
 */
export function buildLicencesText(
  source: PackageSource,
  versions: { electron?: string | undefined; chrome?: string | undefined } = process.versions
): string {
  const app = source.readApp()
  const found = new Map<string, { name: string; version: string; licence: string }>()

  const visit = (name: string, range: string, from: string | undefined, direct: boolean): void => {
    const pkg = source.readDependency(name, from)
    // A package that isn't there (an optional one for another platform) doesn't ship.
    if (!pkg && !direct) return
    const version = pkg?.version ?? range
    const key = `${name}@${version}`
    if (found.has(key)) return
    found.set(key, { name, version, licence: licenceOf(pkg) })
    const children = { ...pkg?.optionalDependencies, ...pkg?.dependencies }
    for (const [child, childRange] of Object.entries(children)) visit(child, childRange, pkg?.dir, false)
  }
  for (const [name, range] of Object.entries(app.dependencies ?? {})) visit(name, range, undefined, true)

  const packages = [...found.values()]
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.version.localeCompare(b.version, 'en', { numeric: true })
    )
    .map((p) => `${p.name} ${p.version}  ${p.licence}`.trimEnd())
  return (
    [
      'DesignStash',
      `Licence: ${app.license ?? 'see LICENSING.md'}`,
      '',
      'Open source components',
      '',
      ...packages,
      '',
      'Shipped with the app',
      '',
      ...BUNDLED(versions),
      '',
      'AI models, downloaded when you choose one',
      '',
      ...modelLines()
    ].join('\n') + '\n'
  )
}
