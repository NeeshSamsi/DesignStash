import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Input } from '@renderer/components/Input'
import { cn } from '@renderer/lib/utils'
import { GLOBAL_SEARCH_DEFAULTS, type GlobalSearchContractProps } from './GlobalSearch.types'
import { globalSearchVariants } from './GlobalSearch.variants'

/**
 * The hairline field: no fill, a subtle edge at rest and the input edge on hover; focus keeps the ring.
 * The value and placeholder drop to body/sm/regular, with padding raised so the field stays 42px tall.
 */
const SEARCH_HAIRLINE =
  'border-subtle bg-transparent py-2.5 hover:border-input has-focus-visible:hover:border-ring *:data-[slot=input-group-control]:type-body-sm-regular'

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

/** The search field on screen, for the menu's View › Search. */
let mountedSearch: RefObject<HTMLInputElement | null> | null = null

/** Focuses the title-bar search and selects what is in it, as ⌘F does. */
export function focusGlobalSearch(): void {
  mountedSearch?.current?.focus()
  mountedSearch?.current?.select()
}

/** ⌘F, and ⌘K as its alias. The field's hint shows the first. */
const SEARCH_KEYS = ['f', 'k']
const SEARCH_HINT = '⌘F'

/** ⌘F (or ⌘K) focuses and selects the field behind `ref`, from anywhere in the window. */
export function useSearchFocusShortcut(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    mountedSearch = ref
    return () => {
      if (mountedSearch === ref) mountedSearch = null
    }
  }, [ref])
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!event.metaKey || !SEARCH_KEYS.includes(event.key.toLowerCase())) return
      event.preventDefault()
      ref.current?.focus()
      ref.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ref])
}

/**
 * GlobalSearch — Title-bar search; ⌘F (or ⌘K) focuses, 250 ms debounce; zero results → MockupGrid no-results.
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
        shortcut={SEARCH_HINT}
        className={SEARCH_HAIRLINE}
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
