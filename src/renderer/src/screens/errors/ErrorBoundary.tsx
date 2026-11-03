import { Component, type ErrorInfo, type ReactNode } from 'react'
import { CrashScreen } from './CrashScreen'

interface Props {
  children: ReactNode
}

/** Catches anything the window throws while rendering and shows the crash screen instead of a blank window. */
export class ErrorBoundary extends Component<Props, { crashed: boolean }> {
  override state = { crashed: false }

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console only; the screen shows nothing technical.
    console.error('[renderer] crashed:', error, info.componentStack)
  }

  override render(): ReactNode {
    return this.state.crashed ? <CrashScreen /> : this.props.children
  }
}
