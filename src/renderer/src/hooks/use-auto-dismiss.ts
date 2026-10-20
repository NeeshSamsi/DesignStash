import { useCallback, useEffect, useRef } from 'react'

/**
 * Calls `onDone` after `ms` while `active`, like a toast's timeout. Hovering pauses it; moving away
 * starts the full time again. Pass the returned props to the element that shows the message.
 */
export function useAutoDismiss(active: boolean, ms: number, onDone: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })

  const stop = useCallback(() => clearTimeout(timer.current), [])
  const start = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => done.current(), ms)
  }, [ms])

  useEffect(() => {
    if (!active) return
    start()
    return stop
  }, [active, start, stop])

  return {
    onMouseEnter: () => {
      if (active) stop()
    },
    onMouseLeave: () => {
      if (active) start()
    },
    onFocus: () => {
      if (active) stop()
    },
    onBlur: () => {
      if (active) start()
    }
  }
}
