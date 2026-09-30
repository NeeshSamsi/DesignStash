import { toast as sonnerToast } from 'sonner'

export type ToastKind = 'info' | 'success' | 'error'

/**
 * Thin wrapper over Sonner so existing call sites keep the same `toast(msg, kind)`
 * signature. Rendering is handled by <Toaster /> (src/ui/sonner.tsx) mounted in AppShell.
 */
export function toast(message: string, kind: ToastKind = 'info') {
  if (kind === 'error') return sonnerToast.error(message)
  if (kind === 'success') return sonnerToast.success(message)
  return sonnerToast(message)
}
