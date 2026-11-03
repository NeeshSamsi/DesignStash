import { loadEnv } from 'vite'

/**
 * The build-time `define` for the PostHog key and host. Values come from the process environment
 * first (CI passes the GitHub secret that way), then from a `.env` file in `cwd` for local builds.
 */
export function posthogDefine(
  mode: string,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const file = loadEnv(mode, cwd, '')
  const key = env.POSTHOG_KEY || file.POSTHOG_KEY || ''
  const host = env.POSTHOG_HOST || file.POSTHOG_HOST || ''
  return { __POSTHOG_KEY__: JSON.stringify(key), __POSTHOG_HOST__: JSON.stringify(host) }
}
