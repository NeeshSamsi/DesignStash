import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent
} from 'react'
import type { ApprovalTag } from '@shared/approval'
import { TagChip } from '@renderer/components/TagChip'
import { cn } from '@renderer/lib/utils'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut
} from '@renderer/ui/command'
import { Popover, PopoverAnchor, PopoverContent } from '@renderer/ui/popover'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import {
  TAG_EDITOR_DEFAULTS,
  type TagEditorContractProps,
  type TagEditorState
} from './TagEditor.types'
import {
  SAMPLE_SUGGESTIONS,
  SAMPLE_TAGS,
  SAMPLE_VOCABULARY,
  type TagVocabularyCategory
} from './TagEditor.samples'

export type { TagVocabularyCategory }

/** Asks the owner to create a tag. `categoryId` is null when the category is new too. */
export interface NewTagRequest {
  label: string
  categoryId: number | null
  categoryLabel: string
}

export interface TagEditorProps extends TagEditorContractProps {
  /** Your tags, oldest first. Controlled when given; without it the editor keeps its own. */
  tags?: ApprovalTag[]
  onTagsChange?: (tags: ApprovalTag[]) => void
  /** AI suggestions. Accepting or dismissing one removes it from this list. */
  suggestions?: ApprovalTag[]
  onSuggestionsChange?: (suggestions: ApprovalTag[]) => void
  /** Every existing tag by category, with use counts: what typing matches against. */
  vocabulary?: TagVocabularyCategory[]
  /** The AI is still working: two shimmering placeholders after the divider. */
  thinking?: boolean
  /** Creates a tag (and its category if new). Without it the editor makes a local tag. */
  onCreateTag?: (request: NewTagRequest) => ApprovalTag | Promise<ApprovalTag>
  className?: string
  'aria-labelledby'?: string
}

/** How long a tag you just added keeps its brand outline. */
const NEW_TAG_MS = 2000

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** A value the owner may control, or leave to the editor. */
function useControllable<T>(
  value: T | undefined,
  onChange: ((next: T) => void) | undefined,
  initial: T
) {
  const [inner, setInner] = useState(initial)
  const current = value ?? inner
  const ref = useRef(current)
  useEffect(() => {
    ref.current = current
  }, [current])
  const set = useCallback(
    (next: T) => {
      ref.current = next
      setInner(next)
      onChange?.(next)
    },
    [onChange]
  )
  return [current, set, ref] as const
}

interface Pending {
  /** The new name waiting for a category. */
  label: string
  /** Pasted names still to go through afterwards. */
  rest: string[]
}

/** The input state the Figma `state` axis starts the editor in (catalog and tests). */
function seedFor(state: TagEditorState) {
  const typed = { suggestions: 'bei', 'no-match': 'terracotta', duplicate: 'clay' } as const
  return {
    adding: ['adding', 'suggestions', 'no-match', 'added', 'duplicate', 'marked'].includes(state),
    draft: typed[state as keyof typeof typed] ?? ''
  }
}

/**
 * TagEditor — Tags field with inline add: "+ Add tag" is first and becomes the input in place.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=222-2959
 * Rules: design/specs/tags.md. Two tiers (category, tag), no nesting. `state` only chooses where
 * the editor starts (catalog); a screen passes data and leaves it out.
 */
export function TagEditor({
  className,
  tags: tagsProp,
  onTagsChange,
  suggestions: suggestionsProp,
  onSuggestionsChange,
  vocabulary = SAMPLE_VOCABULARY,
  thinking: thinkingProp,
  onCreateTag,
  ...rest
}: TagEditorProps) {
  const { variant, state, ...props } = { ...TAG_EDITOR_DEFAULTS, ...rest }
  const seed = seedFor(state)
  const editable = variant === 'editable'
  const thinking = thinkingProp ?? state === 'thinking'

  const [tags, setTags, tagsRef] = useControllable(
    tagsProp,
    onTagsChange,
    state === 'empty' ? [] : SAMPLE_TAGS
  )
  const [suggestions, setSuggestions, suggestionsRef] = useControllable(
    suggestionsProp,
    onSuggestionsChange,
    state === 'empty' ? [] : SAMPLE_SUGGESTIONS
  )

  const [adding, setAdding] = useState(seed.adding)
  const [draft, setDraft] = useState(seed.draft)
  const [active, setActive] = useState('')
  const lastTagId = tags[tags.length - 1]?.tagId
  const [markedId, setMarkedId] = useState<number | null>(
    state === 'marked' ? (lastTagId ?? null) : null
  )
  const [fresh, setFresh] = useState<number[]>(
    state === 'added' && lastTagId !== undefined ? [lastTagId] : []
  )
  const [pending, setPending] = useState<Pending | null>(null)
  const [naming, setNaming] = useState<Pending | null>(null)

  const root = useRef<HTMLDivElement>(null)
  const addChip = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const undo = useRef<{ tag: ApprovalTag; index: number }[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const localId = useRef(-1)
  const refocusAddChip = useRef(false)

  useEffect(() => {
    const live = timers.current
    return () => live.forEach(clearTimeout)
  }, [])
  useEffect(() => {
    if (!adding && refocusAddChip.current) {
      refocusAddChip.current = false
      addChip.current?.focus()
    }
  }, [adding])

  const query = draft.trim()
  const duplicate = query && !naming ? tags.find((tag) => same(tag.label, query)) : undefined
  const mode = naming
    ? 'naming'
    : pending
      ? 'create'
      : !query
        ? 'closed'
        : duplicate
          ? 'duplicate'
          : 'matches'

  const groups = useMemo(() => {
    if (mode !== 'matches') return []
    const tagged = new Set(tags.map((tag) => tag.tagId))
    return vocabulary
      .map((category) => ({
        ...category,
        tags: category.tags.filter(
          (tag) => !tagged.has(tag.tagId) && tag.label.toLowerCase().includes(query.toLowerCase())
        )
      }))
      .filter((category) => category.tags.length > 0)
  }, [mode, tags, vocabulary, query])

  const creating = mode === 'create' || (mode === 'matches' && groups.length === 0)
  const items = creating
    ? [
        ...vocabulary.map((category) => `cat:${category.categoryId}`),
        'cat:new',
        ...(pending ? ['skip'] : [])
      ]
    : groups.flatMap((category) => category.tags.map((tag) => `tag:${tag.tagId}`))
  const current = items.includes(active) ? active : items[0]
  const newLabel = pending?.label ?? query
  const popoverOpen =
    adding && mode !== 'closed' && (mode !== 'matches' || items.length > 0 || creating)

  const markNew = (tagId: number) => {
    clearTimeout(timers.current.get(tagId))
    setFresh((ids) => [...ids.filter((id) => id !== tagId), tagId])
    timers.current.set(
      tagId,
      setTimeout(() => setFresh((ids) => ids.filter((id) => id !== tagId)), NEW_TAG_MS)
    )
  }

  /** Appends a tag you chose or accepted. A suggestion for the same tag goes away. */
  const addTag = (tag: ApprovalTag) => {
    if (tagsRef.current.some((existing) => existing.tagId === tag.tagId)) return
    setTags([...tagsRef.current, tag])
    setSuggestions(suggestionsRef.current.filter((s) => s.tagId !== tag.tagId))
    markNew(tag.tagId)
  }

  const removeTag = (tag: ApprovalTag) => {
    const index = tagsRef.current.findIndex((t) => t.tagId === tag.tagId)
    if (index < 0) return
    undo.current.push({ tag, index })
    setTags(tagsRef.current.filter((t) => t.tagId !== tag.tagId))
    setMarkedId(null)
  }

  /** Adds each pasted name that already exists; stops at the first new one to ask for a category. */
  const runQueue = (names: string[]) => {
    for (let i = 0; i < names.length; i++) {
      const name = names[i]
      if (tagsRef.current.some((tag) => same(tag.label, name))) continue
      const known = vocabulary
        .flatMap((category) => category.tags.map((tag) => ({ ...tag, category })))
        .find((tag) => same(tag.label, name))
      if (known) {
        addTag({
          tagId: known.tagId,
          label: known.label,
          categoryId: known.category.categoryId,
          categoryLabel: known.category.categoryLabel
        })
        continue
      }
      setPending({ label: name, rest: names.slice(i + 1) })
      setDraft('')
      return
    }
    setPending(null)
  }

  const createTag = async (request: NewTagRequest, rest: string[]) => {
    const made = onCreateTag
      ? await onCreateTag(request)
      : {
          tagId: localId.current--,
          label: request.label,
          categoryId: request.categoryId ?? localId.current--,
          categoryLabel: request.categoryLabel
        }
    addTag(made)
    setPending(null)
    setNaming(null)
    setDraft('')
    runQueue(rest)
  }

  const activate = (value: string | undefined) => {
    if (!value) return
    const [kind, id] = value.split(':')
    if (kind === 'tag') {
      const category = vocabulary.find((c) => c.tags.some((t) => String(t.tagId) === id))
      const tag = category?.tags.find((t) => String(t.tagId) === id)
      if (category && tag) {
        addTag({
          tagId: tag.tagId,
          label: tag.label,
          categoryId: category.categoryId,
          categoryLabel: category.categoryLabel
        })
        setDraft('')
      }
    } else if (value === 'skip') {
      const rest = pending?.rest ?? []
      setPending(null)
      runQueue(rest)
    } else if (value === 'cat:new') {
      setNaming({ label: newLabel, rest: pending?.rest ?? [] })
      setPending(null)
      setDraft('')
    } else if (kind === 'cat') {
      const category = vocabulary.find((c) => String(c.categoryId) === id)
      if (category) {
        void createTag(
          {
            label: newLabel,
            categoryId: category.categoryId,
            categoryLabel: category.categoryLabel
          },
          pending?.rest ?? []
        )
      }
    }
  }

  const close = (restoreFocus = false) => {
    refocusAddChip.current = restoreFocus
    setAdding(false)
    setDraft('')
    setPending(null)
    setNaming(null)
    setMarkedId(null)
  }

  const step = (delta: number) => {
    if (items.length === 0) return
    const at = items.indexOf(current ?? '')
    setActive(items[(at + delta + items.length) % items.length])
  }

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const empty = draft === ''
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        step(event.key === 'ArrowDown' ? 1 : -1)
        break
      case 'Enter':
        event.preventDefault()
        if (naming) {
          if (query) {
            void createTag(
              { label: naming.label, categoryId: null, categoryLabel: query },
              naming.rest
            )
          }
        } else if (mode !== 'duplicate') {
          activate(current)
        }
        break
      case 'Escape':
        event.preventDefault()
        if (markedId !== null) setMarkedId(null)
        else if (naming) {
          setDraft(naming.label)
          setNaming(null)
        } else close(true)
        break
      case 'Backspace':
        if (!empty || naming || pending) break
        if (markedId !== null) {
          const marked = tags.find((tag) => tag.tagId === markedId)
          if (marked) removeTag(marked)
        } else if (lastTagId !== undefined) setMarkedId(lastTagId)
        break
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (!empty || markedId === null) break
        event.preventDefault()
        const at = tags.findIndex((tag) => tag.tagId === markedId)
        const next = at + (event.key === 'ArrowLeft' ? -1 : 1)
        setMarkedId(next < 0 ? markedId : (tags[next]?.tagId ?? null))
        break
      }
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text')
    if (!/[,\n]/.test(text)) return
    event.preventDefault()
    runQueue(
      text
        .split(/[,\n]/)
        .map((name) => name.trim())
        .filter(Boolean)
    )
  }

  /** ← → and ⌫ on a focused chip: move along the row, or mark then remove a tag. */
  const onRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const chip = (event.target as HTMLElement).closest<HTMLElement>('[data-ds="TagChip"]')
    if (!chip || chip.contains(input.current)) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const chips = [
        ...event.currentTarget.querySelectorAll<HTMLElement>('[data-ds="TagChip"][tabindex="0"]')
      ]
      const next = chips[chips.indexOf(chip) + (event.key === 'ArrowLeft' ? -1 : 1)]
      if (next) {
        event.preventDefault()
        next.focus()
      }
    } else if (event.key === 'Escape') {
      setMarkedId(null)
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      const tag = tags.find((t) => `tag-${t.tagId}` === chip.dataset.tag)
      const suggestion = suggestions.find((s) => `suggestion-${s.tagId}` === chip.dataset.tag)
      if (tag) {
        event.preventDefault()
        if (markedId === tag.tagId) {
          removeTag(tag)
          addChip.current?.focus()
        } else setMarkedId(tag.tagId)
      } else if (suggestion) {
        event.preventDefault()
        setSuggestions(suggestions.filter((s) => s.tagId !== suggestion.tagId))
      }
    }
  }

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const typing = event.target instanceof HTMLInputElement && event.target.value !== ''
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'z' &&
      !typing
    ) {
      const last = undo.current.pop()
      if (!last) return
      event.preventDefault()
      const list = tagsRef.current
      setTags([...list.slice(0, last.index), last.tag, ...list.slice(last.index)])
    }
  }

  const footer = naming
    ? '↵ creates it · esc back'
    : creating
      ? `↵ adds to ${vocabulary.find((c) => `cat:${c.categoryId}` === current)?.categoryLabel ?? 'the new category'}`
      : '↵ add · esc cancel'
  const note = naming
    ? `Name the new category for “${naming.label}”.`
    : mode === 'duplicate' && duplicate
      ? `Already tagged: ${duplicate.categoryLabel} · ${duplicate.label}`
      : creating
        ? `No “${newLabel}” tag yet. Add it to…`
        : null

  const row = (
    <>
      {editable &&
        (adding ? (
          <Popover open={popoverOpen}>
            <PopoverAnchor asChild>
              <TagChip variant="input" state={duplicate ? 'invalid' : draft ? 'typing' : 'default'}>
                <input
                  ref={input}
                  autoFocus
                  value={draft}
                  aria-label={naming ? 'New category name' : 'New tag'}
                  placeholder={naming ? 'Category name…' : 'Type a tag…'}
                  aria-invalid={duplicate ? true : undefined}
                  onChange={(event) => {
                    setDraft(event.target.value)
                    setMarkedId(null)
                  }}
                  onKeyDown={onInputKeyDown}
                  onPaste={onPaste}
                  onBlur={() => close()}
                  className="field-sizing-content min-w-0 bg-transparent type-label-xs-medium text-foreground outline-none placeholder:text-placeholder"
                />
              </TagChip>
            </PopoverAnchor>
            <PopoverContent
              size="default"
              className="w-65 gap-0 bg-surface-3 p-1 shadow-lg"
              onOpenAutoFocus={(event) => event.preventDefault()}
              onInteractOutside={(event) => event.preventDefault()}
              onEscapeKeyDown={(event) => event.preventDefault()}
              onMouseDown={(event) => event.preventDefault()}
            >
              {note && <p className="px-2 py-1.5 type-caption-xs-regular text-secondary">{note}</p>}
              {mode !== 'duplicate' && mode !== 'naming' && (
                <Command
                  shouldFilter={false}
                  value={current ?? ''}
                  onValueChange={setActive}
                  className="w-full rounded-none border-0 bg-transparent"
                >
                  <CommandList className="p-0">
                    {creating ? (
                      <>
                        {vocabulary.map((category) => (
                          <CommandItem
                            key={category.categoryId}
                            value={`cat:${category.categoryId}`}
                            onSelect={activate}
                            className="data-selected:bg-surface-4"
                          >
                            <HugeiconsIcon
                              icon={PlusSignIcon}
                              strokeWidth={1.5}
                              className="size-3"
                            />
                            {category.categoryLabel}
                          </CommandItem>
                        ))}
                        <CommandItem
                          value="cat:new"
                          onSelect={activate}
                          className="data-selected:bg-surface-4"
                        >
                          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={1.5} className="size-3" />
                          New category…
                        </CommandItem>
                        {pending && (
                          <CommandItem
                            value="skip"
                            onSelect={activate}
                            className="data-selected:bg-surface-4"
                          >
                            Skip it
                          </CommandItem>
                        )}
                      </>
                    ) : (
                      groups.map((category) => (
                        <CommandGroup key={category.categoryId} heading={category.categoryLabel}>
                          {category.tags.map((tag) => (
                            <CommandItem
                              key={tag.tagId}
                              value={`tag:${tag.tagId}`}
                              onSelect={activate}
                              className="data-selected:bg-surface-4"
                            >
                              {tag.label}
                              <CommandShortcut>{tag.usageCount}</CommandShortcut>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ))
                    )}
                  </CommandList>
                </Command>
              )}
              {mode !== 'duplicate' && (
                <p className="px-2 pt-1.5 pb-1 type-caption-xs-regular text-tertiary">{footer}</p>
              )}
            </PopoverContent>
          </Popover>
        ) : (
          <TagChip
            ref={addChip}
            variant="add"
            onClick={() => {
              setAdding(true)
              setMarkedId(null)
            }}
          />
        ))}

      {tags.map((tag) => {
        const isNew = fresh.includes(tag.tagId)
        const common = {
          category: tag.categoryLabel,
          label: tag.label,
          'data-tag': `tag-${tag.tagId}`
        }
        if (!editable) return <TagChip key={tag.tagId} {...common} />
        return (
          <TagChip
            key={tag.tagId}
            variant={isNew ? 'new' : 'removable'}
            state={markedId === tag.tagId ? 'marked' : 'default'}
            highlighted={duplicate?.tagId === tag.tagId}
            onRemove={() => removeTag(tag)}
            {...common}
          />
        )
      })}

      {editable && (suggestions.length > 0 || thinking) && (
        <span aria-hidden className="h-4 border-l border-base" />
      )}
      {editable && thinking
        ? [0, 1].map((n) => (
            <TagChip key={n} variant="suggested" state="thinking" showCategory={false} />
          ))
        : editable &&
          suggestions.map((tag) => (
            <TagChip
              key={tag.tagId}
              variant="suggested"
              category={tag.categoryLabel}
              label={tag.label}
              data-tag={`suggestion-${tag.tagId}`}
              onAccept={() => addTag(tag)}
              onDismiss={() => setSuggestions(suggestions.filter((s) => s.tagId !== tag.tagId))}
            />
          ))}
    </>
  )

  return (
    <div
      data-ds="TagEditor"
      data-variant={variant}
      data-state={state}
      className={cn('flex w-full flex-col gap-2', className)}
      ref={root}
      onKeyDown={onRootKeyDown}
      {...props}
    >
      <div
        role="group"
        aria-label="Tags"
        className="flex flex-wrap items-center gap-1.5"
        onKeyDown={onRowKeyDown}
      >
        {row}
      </div>
      {editable && markedId !== null && (
        <p className="type-caption-xs-regular text-tertiary">⌫ again removes it · Esc keeps it</p>
      )}
      {editable && tags.length === 0 && markedId === null && (
        <p className="type-caption-xs-regular text-tertiary">
          Tags help you find this mockup later.
        </p>
      )}
    </div>
  )
}
