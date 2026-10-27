import type { LogFile } from './log-file'

let sink: LogFile | null = null

type ConsoleLike = Pick<Console, 'log' | 'warn' | 'error' | 'debug'>

/** Where the logger prints. The console itself, until captureConsole swaps its methods. */
let out: ConsoleLike = console

/** Point the logger at its rotating file. Until this is called (and in tests) it only writes to the console. */
export function attachLogFile(file: LogFile | null): void {
  sink = file
}

/** The last lines of the log file, or '' when there is none. Already scrubbed on the way in. */
export function logTail(lines: number): string {
  return sink?.tail(lines) ?? ''
}

function render(arg: unknown): string {
  if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`
  if (typeof arg === 'string') return arg
  try {
    return JSON.stringify(arg) ?? String(arg)
  } catch {
    return String(arg)
  }
}

function toFile(level: string, parts: unknown[]): void {
  if (!sink) return
  sink.write(`[${level}] ${new Date().toISOString()} - ${parts.map(render).join(' ')}`)
}

/**
 * Sends `console.warn` and `console.error` to the log file as well, so a module that reports a
 * failure straight to the console still reaches a problem report. Returns a function that puts the
 * console back.
 */
export function captureConsole(target: ConsoleLike = console): () => void {
  const { warn, error } = target
  out = {
    log: target.log.bind(target),
    debug: target.debug.bind(target),
    warn: warn.bind(target),
    error: error.bind(target)
  }
  target.warn = (...args: unknown[]) => {
    warn.apply(target, args)
    toFile('WARN', args)
  }
  target.error = (...args: unknown[]) => {
    error.apply(target, args)
    toFile('ERROR', args)
  }
  return () => {
    target.warn = warn
    target.error = error
    out = console
  }
}

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    out.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args)
    toFile('INFO', [message, ...args])
  },
  warn: (message: string, ...args: unknown[]) => {
    out.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args)
    toFile('WARN', [message, ...args])
  },
  error: (message: string, ...args: unknown[]) => {
    out.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args)
    toFile('ERROR', [message, ...args])
  },
  debug: (message: string, ...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      out.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args)
      toFile('DEBUG', [message, ...args])
    }
  }
}
