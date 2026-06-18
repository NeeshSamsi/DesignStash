import { useToastStore } from '../stores/toastStore'

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium pointer-events-auto cursor-pointer border ${
            t.kind === 'error'
              ? 'bg-red-900/90 border-red-700 text-red-100'
              : t.kind === 'success'
                ? 'bg-green-900/90 border-green-700 text-green-100'
                : 'bg-neutral-800 border-neutral-600 text-slate-100'
          }`}
          onClick={() => removeToast(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
