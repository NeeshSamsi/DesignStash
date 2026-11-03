import { Modal } from './components/_legacy/Modal'

interface FullscreenPreviewProps {
  coverPath: string
  onClose: () => void
}

export function FullscreenPreview({ coverPath, onClose }: FullscreenPreviewProps) {
  return (
    <Modal onClose={onClose} className="sm:max-w-4xl" label="Full-size preview">
      <div className="flex items-center justify-center p-2">
        <img
          src={coverPath}
          alt="Full-size preview"
          className="max-h-full w-full rounded-lg object-contain"
        />
      </div>
    </Modal>
  )
}
