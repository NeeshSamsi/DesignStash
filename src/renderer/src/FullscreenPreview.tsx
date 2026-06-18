import { Modal } from './ui/Modal'

interface FullscreenPreviewProps {
  coverPath: string
  onClose: () => void
}

export function FullscreenPreview({ coverPath, onClose }: FullscreenPreviewProps) {
  return (
    <Modal onClose={onClose} className="max-w-4xl">
      <div className="p-2 flex items-center justify-center">
        <img
          src={coverPath}
          alt="Full-size preview"
          className="max-h-full rounded-lg object-contain w-full"
        />
      </div>
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-neutral-400 hover:text-slate-100 text-sm transition-colors"
        aria-label="Close preview"
      >
        ✕
      </button>
    </Modal>
  )
}
