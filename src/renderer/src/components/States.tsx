interface EmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8 py-16">
      <p className="text-base font-medium text-neutral-400">{title}</p>
      {description && <p className="text-sm text-neutral-500 max-w-xs">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

interface LoadingStateProps {
  message?: string
}

export function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  return (
    <div className="flex items-center justify-center h-full gap-2 text-neutral-400">
      <span className="text-sm">{message}</span>
    </div>
  )
}

interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8 py-16">
      <p className="text-sm text-red-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3 py-1.5 text-sm rounded-md bg-neutral-700 hover:bg-neutral-600 text-slate-200 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  )
}
