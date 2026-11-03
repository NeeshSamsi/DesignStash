import { watch as fsWatch } from 'node:fs'
import { join } from 'node:path'
import { logger } from '../logger'

/** `fs.watch` as cover-watch uses it, so a test can hand it events. */
export type WatchFn = (
  root: string,
  options: { recursive: true },
  listener: (event: string, filename: string | null) => void
) => { close: () => void; on: (event: 'error', listener: (err: Error) => void) => unknown; unref?: () => void }

/**
 * Tells the library when something in the stash folder changes or goes, so a cover deleted outside
 * the app (in Finder) shows as missing at the next list, while the list itself checks each cover on
 * disk only once (F-012). One recursive watch on the stash folder (FSEvents on macOS). Returns a stop
 * function. A folder that can't be watched leaves covers checked once a launch, as before.
 */
export function watchCovers(
  root: string,
  changed: (path: string) => void,
  watch: WatchFn = fsWatch as unknown as WatchFn
): () => void {
  try {
    const watcher = watch(root, { recursive: true }, (_event, filename) => {
      // Without a name the event can't say what changed, so the whole folder counts.
      changed(filename ? join(root, filename) : root)
    })
    watcher.on('error', () => {})
    // Watching never keeps the app open.
    watcher.unref?.()
    return () => watcher.close()
  } catch (err) {
    logger.warn('The stash folder can’t be watched: a cover deleted outside the app shows as missing from the next launch.', err)
    return () => {}
  }
}

/** How long the window waits for more changes before it's told once. */
const SETTLE_MS = 50

/**
 * The library's side of the watch: a change to a cover the list had seen on disk makes the library
 * check it again (`forget`), and the window is told once (`changed`) so it reads its list again. A
 * list asked for just before the change landed is put right that way, whatever the order.
 */
export function watchCoverChanges(
  root: string,
  library: { forget: (path: string) => boolean; changed: () => void },
  watch?: WatchFn
): () => void {
  let pending: ReturnType<typeof setTimeout> | null = null
  const stop = watchCovers(
    root,
    (path) => {
      if (!library.forget(path) || pending) return
      pending = setTimeout(() => {
        pending = null
        library.changed()
      }, SETTLE_MS)
    },
    watch
  )
  return () => {
    if (pending) clearTimeout(pending)
    stop()
  }
}
