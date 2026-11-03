import { useCallback, useEffect, useRef, useState } from 'react'
import { dragVerdict, keepDropped, type DragVerdict } from './gather-model'

export interface DragState {
  /** Files are being dragged over the window. */
  active: boolean
  verdict: DragVerdict
  /** How many items are in the drag, for "Add 6 more to the copy". */
  count: number
  /** The pointer, for the cursor-following hint. */
  at: { x: number; y: number }
}

const IDLE: DragState = { active: false, verdict: 'ok', count: 0, at: { x: 0, y: 0 } }

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

export interface WindowDropOptions {
  /** Called with the paths of what was dropped, PSDs and folders only. Not called when nothing is left. */
  onDrop: (paths: string[]) => void
  /** Called when a drop had files but none of them can be added. */
  onRejected: () => void
  /** Whether this page takes drops at all. Elsewhere the drop is swallowed so the window never navigates. */
  accepts: boolean
  getPath: (file: File) => string
}

/**
 * Window-wide file drags. Listens on the window so a drag is seen wherever it is, counts enters
 * and leaves (children fire both), and always cancels the browser's own drop so Electron never
 * opens the file.
 */
export function useWindowDrop({
  onDrop,
  onRejected,
  accepts,
  getPath
}: WindowDropOptions): DragState {
  const [state, setState] = useState<DragState>(IDLE)
  const depth = useRef(0)
  const latest = useRef({ onDrop, onRejected, accepts, getPath })
  useEffect(() => {
    latest.current = { onDrop, onRejected, accepts, getPath }
  })

  const read = useCallback((event: DragEvent): DragState => {
    const items = Array.from(event.dataTransfer?.items ?? [])
    return {
      active: true,
      verdict: dragVerdict(items.map((i) => ({ kind: i.kind, type: i.type }))),
      count: items.filter((i) => i.kind === 'file').length,
      at: { x: event.clientX, y: event.clientY }
    }
  }, [])

  useEffect(() => {
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth.current += 1
      setState(read(event))
    }
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer)
        event.dataTransfer.dropEffect = latest.current.accepts ? 'copy' : 'none'
      setState(read(event))
    }
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setState(IDLE)
    }
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth.current = 0
      setState(IDLE)
      const { accepts: ok, onDrop: take, onRejected: reject, getPath: pathOf } = latest.current
      if (!ok) return
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length === 0) return
      const kept = keepDropped(files).map((i) => files[i]!)
      if (kept.length === 0) return reject()
      take(kept.map(pathOf))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [read])

  return state
}
