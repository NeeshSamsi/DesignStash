import { Component, type ErrorInfo, type ReactNode } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { RENDERER_ERROR_LIMITS, type RendererErrorReport } from '@shared/ipc/app'
import { CrashScreen } from './CrashScreen'

interface Props {
  children: ReactNode
}

/** A window that keeps throwing sends each distinct error once, and stops after this many. */
const MOST_REPORTS = 20
const reported = new Set<string>()

/** Forget what was sent, for tests. */
export function resetRendererErrorReports(): void {
  reported.clear()
}

const cut = (text: string, limit: number) => (text.length > limit ? text.slice(0, limit) : text)

/**
 * Sends something the window threw to main, which logs it (so Copy report carries it) and, with
 * consent, sends it on. Paths are scrubbed in main. Never throws: reporting must not break the crash screen.
 */
function reportRendererError(
  source: RendererErrorReport['source'],
  thrown: unknown,
  componentStack?: string | null
): void {
  const error = thrown instanceof Error ? thrown : null
  const name = cut(error?.name ?? 'Error', RENDERER_ERROR_LIMITS.name)
  const message = cut(error?.message ?? String(thrown), RENDERER_ERROR_LIMITS.message)
  const key = `${source}:${name}:${message}`
  if (reported.has(key) || reported.size >= MOST_REPORTS) return
  reported.add(key)
  const report: RendererErrorReport = {
    source,
    name,
    message,
    ...(error?.stack ? { stack: cut(error.stack, RENDERER_ERROR_LIMITS.stack) } : {}),
    ...(componentStack ? { componentStack: cut(componentStack, RENDERER_ERROR_LIMITS.stack) } : {})
  }
  try {
    void window.api.invoke(IPC_CHANNELS.APP_RENDERER_ERROR, report).catch(() => {})
  } catch {
    // No bridge (a broken preload): the console line is all there is.
  }
}

const onWindowError = (event: ErrorEvent) =>
  reportRendererError('error', event.error ?? event.message)
const onUnhandledRejection = (event: PromiseRejectionEvent) =>
  reportRendererError('rejection', event.reason)

/**
 * Catches anything the window throws while rendering and shows the crash screen instead of a blank
 * window. While mounted it also sends the window's uncaught errors and unhandled rejections to main.
 */
export class ErrorBoundary extends Component<Props, { crashed: boolean }> {
  override state = { crashed: false }

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true }
  }

  override componentDidMount(): void {
    window.addEventListener('error', onWindowError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
  }

  override componentWillUnmount(): void {
    window.removeEventListener('error', onWindowError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The screen shows nothing technical; the log and the report get the detail.
    console.error('[renderer] crashed:', error, info.componentStack)
    reportRendererError('render', error, info.componentStack)
  }

  override render(): ReactNode {
    return this.state.crashed ? <CrashScreen /> : this.props.children
  }
}
