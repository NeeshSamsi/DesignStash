import type { AiDownloadFailure } from '@shared/ipc/ai'

/**
 * A folder as a person would say it: "/Users/ada/Pictures/DesignStash" → "~/Pictures/DesignStash",
 * "/Volumes/Studio SSD/Work" → "Studio SSD/Work", and the "/private" macOS adds to /var, /tmp and /etc
 * is dropped.
 */
export function friendlyPath(path: string): string {
  const real = path.replace(/^\/private(?=\/(?:var|tmp|etc)(?:\/|$))/, '')
  const home = /^\/Users\/[^/]+/.exec(real)
  if (home) {
    const rest = real.slice(home[0].length)
    return rest === '' ? '~' : `~${rest}`
  }
  const volume = /^\/Volumes\/([^/]+)(.*)$/.exec(real)
  return volume ? `${volume[1]}${volume[2]}` : real
}

/**
 * A friendly path cut in the middle so the last two folders always show:
 * "~/Pictures/Work/Clients/DesignStash" → "~/…/Clients/DesignStash". Short paths stay whole.
 */
export function shortPath(path: string, keep = 2): string {
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= keep + 1) return path
  const head = path.startsWith('/') ? `/${parts[0]}` : (parts[0] ?? '')
  return `${head}/…/${parts.slice(-keep).join('/')}`
}

/** Where a folder lives, in words: "Macintosh HD › Users › you › Pictures". */
export function locationTrail(path: string): string {
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  if (parts[0] === 'Volumes' && parts[1]) {
    return [parts[1], ...parts.slice(2)].join(' › ')
  }
  const named = parts.map((part, index) => (parts[index - 1] === 'Users' ? 'you' : part))
  return ['Macintosh HD', ...named].join(' › ')
}

export const WELCOME = {
  title: 'Welcome to DesignStash',
  body: 'Keep all your mockup PSDs in one place and find them by what’s in them. Everything stays on your Mac.'
} as const

export const STASH_STEP = {
  title: 'Where should your stash live?',
  body: 'We’ll copy your PSDs here and keep their covers and tags right next to them.'
} as const

export const PRIVACY_STEP = {
  title: 'Your privacy',
  body: 'DesignStash shares anonymous usage data to help squash bugs. It’s on by default; switch it off below if you’d rather not. Here’s what it does and never includes.'
} as const

export const DONE_STEP = {
  title: 'Your stash is ready!',
  body: 'Use the Add card in My Stash to bring in files or a folder, or just drop PSDs or zips anywhere in the window.'
} as const

export const AI_STEP = {
  title: 'Set up on-device AI',
  body: 'A small AI model writes titles and tags for your new mockups. It runs right here on your Mac, so nothing gets uploaded.'
} as const

/** What the stash-folder check found, as the line under the field. */
export function folderHint(state: 'missing' | 'not-writable'): string {
  return state === 'missing'
    ? 'We can’t find that folder. Mind picking another one?'
    : 'We can’t stash anything in this folder. Mind picking another one?'
}

/** The download failure as the row's reason. Reuses the settings wording. */
export type { AiDownloadFailure }
