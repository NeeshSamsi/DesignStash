import { homedir } from 'node:os'

/**
 * Privacy scrubbing for telemetry error payloads (spec §13). Absolute paths can
 * leak filenames, usernames, and library locations — none of which may ever be
 * sent. These helpers redact them before anything reaches the wire.
 */

const REDACTED = '<path>'

/**
 * Strip absolute paths from an arbitrary string:
 *   - the current user's home dir
 *   - any `/Users/<name>/…` POSIX user path
 *   - `file://…` URLs
 * All become the `<path>` token. Pure + unit-testable.
 */
export function scrubText(s: string): string {
  let out = s

  // file:// URLs (up to the next whitespace or quote).
  out = out.replace(/file:\/\/[^\s'")]*/g, REDACTED)

  // The actual home directory of the running user (handles non-/Users layouts too).
  const home = homedir()
  if (home) {
    // Escape regex metacharacters in the home path before building the matcher.
    const escaped = home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`${escaped}[^\\s'")]*`, 'g'), REDACTED)
  }

  // Generic macOS user paths: /Users/<name>/… (covers other users / sandboxed homes).
  out = out.replace(/\/Users\/[^/\s'")]+(?:\/[^\s'")]*)?/g, REDACTED)

  return out
}

/**
 * Convert an unknown thrown value into a plain, path-scrubbed object safe to
 * send as telemetry. Preserves the error name/type; never includes raw paths.
 */
export function scrubError(err: unknown): { message: string; stack?: string; name?: string } {
  if (err instanceof Error) {
    const result: { message: string; stack?: string; name?: string } = {
      message: scrubText(err.message),
      name: err.name
    }
    if (err.stack) {
      result.stack = scrubText(err.stack)
    }
    return result
  }

  if (typeof err === 'string') {
    return { message: scrubText(err) }
  }

  try {
    return { message: scrubText(JSON.stringify(err)) }
  } catch {
    return { message: scrubText(String(err)) }
  }
}
