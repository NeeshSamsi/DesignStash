import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

const read = () => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches

/** True while the system asks for less motion: panels fade instead of sliding or resizing. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(read)
  useEffect(() => {
    const list = window.matchMedia?.(QUERY)
    if (!list) return
    const onChange = () => setReduced(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [])
  return reduced
}
