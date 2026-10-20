/* eslint-disable no-empty-pattern, react-hooks/rules-of-hooks -- Playwright fixtures take an empty destructuring pattern and call `use`, which is not a React hook. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test as base, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { buildPsdWithComposite } from '../../src/main/psd/__fixtures__/build'

/** The catalogue model the seeded settings point at. Its files are empty: the stub provider answers instead. */
const STUB_MODEL_ID = 'qwen2.5-vl-3b'

export interface LaunchOptions {
  /** Skip onboarding by seeding settings as a finished first run. Default true. */
  onboarded?: boolean
}

export interface E2EApp {
  app: ElectronApplication
  window: Page
  /** The app's userData folder for this test only. */
  userData: string
  /** The stash folder the app was started with. */
  stash: string
  /** Call a typed IPC channel from the page, the way the renderer does. */
  invoke: <T = unknown>(
    channel: string,
    args?: unknown
  ) => Promise<{ success: boolean; data?: T; error?: { code: string } }>
}

/** A folder of real PSDs (with a usable embedded preview) outside the stash, like files on a Desktop. */
let psdCounter = 0

export function makePsds(dir: string, names: string[]): string[] {
  mkdirSync(dir, { recursive: true })
  return names.map((name) => {
    const path = join(dir, `${name}.psd`)
    // Every file gets its own colour, so none is mistaken for a duplicate of another.
    const n = psdCounter++
    buildPsdWithComposite(path, {
      width: 640,
      height: 480,
      color: { r: (n * 37) % 256, g: (n * 91 + 30) % 256, b: (n * 53 + 90) % 256 }
    })
    return path
  })
}

/**
 * Launch the built app (`pnpm build` first) with a fresh userData folder. Nothing is shared between
 * tests and nothing touches the real user's stash.
 */
export async function launchApp(
  opts: LaunchOptions = {}
): Promise<E2EApp & { close: () => Promise<void> }> {
  const { onboarded = true } = opts
  const userData = mkdtempSync(join(tmpdir(), 'designstash-e2e-'))
  const stash = join(userData, 'Library')

  if (onboarded) {
    // A returning user's stash folder already exists; without it launch reports the folder as unavailable.
    mkdirSync(stash, { recursive: true })
    const modelDir = join(userData, 'models', STUB_MODEL_ID)
    mkdirSync(modelDir, { recursive: true })
    writeFileSync(join(modelDir, 'model.gguf'), '')
    writeFileSync(join(modelDir, 'mmproj.gguf'), '')
    writeFileSync(
      join(userData, 'settings.json'),
      JSON.stringify({
        libraryRoot: stash,
        onboarded: true,
        // A model is "installed" and active, but the stub answers in its place (see provider-factory).
        activeModelId: STUB_MODEL_ID,
        telemetryEnabled: false,
        telemetryInstallId: 'e2e'
      })
    )
  }

  const app = await electron.launch({
    // "." is the project folder, so the app finds its drizzle migrations the way `pnpm start` does.
    args: ['.', `--user-data-dir=${userData}`],
    env: { ...process.env, NODE_ENV: 'test', DESIGNSTASH_E2E_STUB_AI: '1' }
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  // The flow modals are wider than the default 1200x800 window.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1800, 1100))

  return {
    app,
    window,
    userData,
    stash,
    invoke: (channel, args) =>
      window.evaluate(
        ([c, a]) =>
          (
            window as unknown as { api: { invoke: (c: string, a: unknown) => Promise<never> } }
          ).api.invoke(c as string, a),
        [channel, args] as const
      ),
    close: async () => {
      await app.close().catch(() => {})
      rmSync(userData, { recursive: true, force: true })
    }
  }
}

/** `test` with an `app` fixture (already onboarded) and an `unboarded` one (first run). */
export const test = base.extend<{ app: E2EApp; firstRun: E2EApp }>({
  app: async ({}, use) => {
    const launched = await launchApp({ onboarded: true })
    await use(launched)
    await launched.close()
  },
  firstRun: async ({}, use) => {
    const launched = await launchApp({ onboarded: false })
    await use(launched)
    await launched.close()
  }
})

export { expect }
