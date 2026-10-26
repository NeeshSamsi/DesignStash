import { useState } from 'react'

/** What a field says while the AI writes it (Input and Textarea `state=writing`, look-over.md L6.1). */
export const WRITING_PLACEHOLDER = 'Writing with AI…'

/** The placeholder pulses like Skeleton; with reduced motion it stays still. */
export const WRITING_CLASS = 'animate-placeholder-pulse motion-reduce:animate-none'

/**
 * A field the AI is writing: empty, with the pulsing placeholder, and still a real field. A field
 * someone controls stops writing when they say so (their first keystroke); one nobody controls
 * (the catalog) stops on its own first keystroke.
 */
export function useWritingField(writing: boolean, controlled: boolean) {
  const [typed, setTyped] = useState(false)
  const active = writing && (controlled || !typed)
  return {
    active,
    markTyped: () => setTyped(true),
    props: active ? { placeholder: WRITING_PLACEHOLDER, 'aria-busy': true as const } : {}
  }
}
