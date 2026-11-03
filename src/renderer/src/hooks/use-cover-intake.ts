import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type RefObject
} from 'react'
import { COVER_MIME_TYPES, pickCover, type CoverFileProblem } from '@shared/cover-fit'
import { classifyDrag, clipboardFiles, isEditableTarget } from '@renderer/lib/cover-drop'

export interface CoverIntakeOptions {
  /** Called with the one file that became the cover (the first image of a drop, paste or pick). */
  onCover?: ((file: File) => void) | undefined
  /** Listen for ⌘V with an image on the clipboard. Default on. */
  paste?: boolean | undefined
}

export interface CoverIntake {
  /** What is being dragged over: an image, or files that can't be a cover. */
  drag: 'image' | 'rejected' | null
  /** Why the last file couldn't be used. Cleared by the next good file or `dismissProblem`. */
  problem: CoverFileProblem | null
  /** "We’ll use the first image (3 files)" after a multi-file drop. */
  notice: string | null
  dismissProblem: () => void
  /** Opens the system file picker. The cover stays as it is until a file is chosen. */
  openPicker: () => void
  dropProps: {
    onDragEnter: (event: DragEvent) => void
    onDragOver: (event: DragEvent) => void
    onDragLeave: (event: DragEvent) => void
    onDrop: (event: DragEvent) => void
  }
  /** Spread on a hidden `<input type="file">`. */
  inputProps: {
    ref: RefObject<HTMLInputElement | null>
    type: 'file'
    accept: string
    hidden: true
    tabIndex: -1
    onChange: (event: ChangeEvent<HTMLInputElement>) => void
  }
}

/**
 * The shared way a cover gets in: Replace or click (file picker), drag and drop, and paste.
 * Validation is the pure `pickCover` in `@shared/cover-fit`; the file itself is never edited.
 */
export function useCoverIntake({ onCover, paste = true }: CoverIntakeOptions = {}): CoverIntake {
  const [drag, setDrag] = useState<'image' | 'rejected' | null>(null)
  const [problem, setProblem] = useState<CoverFileProblem | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // dragenter and dragleave also fire for every child, so count them.
  const depth = useRef(0)

  const onCoverRef = useRef(onCover)
  useEffect(() => {
    onCoverRef.current = onCover
  })

  const handleFiles = useCallback((files: File[]) => {
    const picked = pickCover(files)
    if (!picked.ok) {
      setProblem(picked.problem)
      setNotice(null)
      return
    }
    setProblem(null)
    setNotice(picked.ignored > 0 ? `We’ll use the first image (${picked.total} files)` : null)
    onCoverRef.current?.(picked.file)
  }, [])

  useEffect(() => {
    if (!paste) return
    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return
      const files = clipboardFiles(event.clipboardData)
      if (files.length === 0) return
      event.preventDefault()
      handleFiles(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [paste, handleFiles])

  const track = (event: DragEvent) => {
    const kind = classifyDrag(event.dataTransfer)
    if (kind === 'none') return false
    event.preventDefault()
    setDrag(kind)
    return true
  }

  return {
    drag,
    problem,
    notice,
    dismissProblem: () => setProblem(null),
    openPicker: () => inputRef.current?.click(),
    dropProps: {
      onDragEnter: (event) => {
        if (track(event)) depth.current += 1
      },
      onDragOver: (event) => {
        track(event)
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDrag(null)
      },
      onDrop: (event) => {
        if (classifyDrag(event.dataTransfer) === 'none') return
        event.preventDefault()
        depth.current = 0
        setDrag(null)
        handleFiles(Array.from(event.dataTransfer.files))
      }
    },
    inputProps: {
      ref: inputRef,
      type: 'file',
      accept: COVER_MIME_TYPES.join(','),
      hidden: true,
      tabIndex: -1,
      onChange: (event) => {
        handleFiles(Array.from(event.target.files ?? []))
        // Choosing the same file twice should still fire.
        event.target.value = ''
      }
    }
  }
}
