import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Input } from '@renderer/components/Input'
import { cn } from '@renderer/lib/utils'
import { GLOBAL_SEARCH_DEFAULTS, type GlobalSearchContractProps } from './GlobalSearch.types'
import { globalSearchVariants } from './GlobalSearch.variants'

/** Delay between the last keystroke and `onQueryChange`. */
export const SEARCH_DEBOUNCE_MS = 250

export interface GlobalSearchProps extends GlobalSearchContractProps {
  /** Starting text. Defaults to Figma's "phone clay" for `state="with-query"`. */
  defaultQuery?: string
  /** Controlled text. With it, the field shows `value` and reports every keystroke to `onValueChange`. */
  value?: string
  onValueChange?: (value: string) => void
  /** Called 250 ms after typing stops. Clearing the field calls it at once. */
  onQueryChange?: (query: string) => void
  className?: string
}

/** ⌘K focuses (and selects) the field behind `ref`, from anywhere in the window. */
export function useSearchFocusShortcut(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!event.metaKey || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      ref.current?.focus()
      ref.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ref])
}

/**
 * GlobalSearch — Title-bar search; ⌘K focuses, 250 ms debounce; zero results → MockupGrid no-results.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=218-1649
 * Esc clears the text; Esc on an empty field blurs it. `state` only picks the starting text:
 * focus and query are the field's own.
 */
export function GlobalSearch({
  className,
  defaultQuery,
  value,
  onValueChange,
  onQueryChange,
  ...rest
}: GlobalSearchProps) {
  const props = { ...GLOBAL_SEARCH_DEFAULTS, ...rest }
  const [draft, setDraft] = useState(
    defaultQuery ?? (props.state === 'with-query' ? 'phone clay' : '')
  )
  const query = value ?? draft
  const emit = useRef(onValueChange)
  useEffect(() => {
    emit.current = onValueChange
  })
  const setQuery = useCallback((next: string) => {
    setDraft(next)
    emit.current?.(next)
  }, [])
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const notify = useRef(onQueryChange)
  useEffect(() => {
    notify.current = onQueryChange
  })

  useSearchFocusShortcut(inputRef)
  useEffect(() => () => clearTimeout(timer.current), [])

  const change = (next: string) => {
    setQuery(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => notify.current?.(next), SEARCH_DEBOUNCE_MS)
  }
  const clear = useCallback(() => {
    setQuery('')
    clearTimeout(timer.current)
    notify.current?.('')
  }, [setQuery])
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return
    if (query !== '') clear()
    else event.currentTarget.blur()
  }

  return (
    <div
      data-ds="GlobalSearch"
      role="search"
      className={cn(globalSearchVariants({ state: props.state }), className)}
    >
      <Input
        ref={inputRef}
        variant="search"
        placeholder="Search"
        aria-label="Search"
        value={query}
        onChange={(event) => change(event.target.value)}
        onClear={clear}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}
