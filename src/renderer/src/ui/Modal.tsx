import { useEffect } from 'react'

interface ModalProps {
  children: React.ReactNode
  onClose?: () => void
  blocking?: boolean
  className?: string
}

export function Modal({ children, onClose, blocking = false, className = '' }: ModalProps) {
  useEffect(() => {
    if (blocking) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [blocking, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={blocking ? undefined : () => onClose?.()}
    >
      <div
        className={`relative bg-neutral-800 rounded-xl shadow-2xl border border-neutral-700 max-w-lg w-full mx-4 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
