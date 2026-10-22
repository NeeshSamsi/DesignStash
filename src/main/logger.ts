import type { LogFile } from './log-file'

let sink: LogFile | null = null

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

function toFile(level: string, message: string, args: unknown[]): void {
  if (!sink) return
  sink.write(
    `[${level}] ${new Date().toISOString()} - ${[message, ...args.map(render)].join(' ')}`
  )
}

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args)
    toFile('INFO', message, args)
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args)
    toFile('WARN', message, args)
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args)
    toFile('ERROR', message, args)
  },
  debug: (message: string, ...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args)
      toFile('DEBUG', message, args)
    }
  }
}
