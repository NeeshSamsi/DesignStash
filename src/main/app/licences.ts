import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface PackageSource {
  /** package.json of the app: name, license and dependencies. */
  readApp(): { license?: string | undefined; dependencies?: Record<string, string> | undefined }
  /** package.json of one dependency, or null when it can't be read. */
  readDependency(name: string): { version?: string; license?: string | { type?: string | undefined } | undefined } | null
}

export function nodePackageSource(root: string): PackageSource {
  const read = (path: string): ReturnType<PackageSource['readDependency']> => {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as ReturnType<PackageSource['readDependency']>
    } catch {
      return null
    }
  }
  return {
    readApp: () => (read(join(root, 'package.json')) ?? {}) as ReturnType<PackageSource['readApp']>,
    readDependency: (name) => read(join(root, 'node_modules', name, 'package.json'))
  }
}

/** Plain-text licences notice: the app's own licence, then each dependency with its version and licence. */
export function buildLicencesText(source: PackageSource): string {
  const app = source.readApp()
  const lines = ['DesignStash', `Licence: ${app.license ?? 'see LICENSING.md'}`, '', 'Open source components', '']
  const names = Object.keys(app.dependencies ?? {}).sort((a, b) => a.localeCompare(b))
  for (const name of names) {
    const pkg = source.readDependency(name)
    const licence = typeof pkg?.license === 'string' ? pkg.license : (pkg?.license?.type ?? 'unknown')
    lines.push(`${name} ${pkg?.version ?? app.dependencies?.[name] ?? ''}  ${licence}`.trimEnd())
  }
  return lines.join('\n') + '\n'
}
