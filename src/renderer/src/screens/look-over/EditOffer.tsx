import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ApprovalTag } from '@shared/approval'
import { Button } from '@renderer/components/Button'
import { Popover } from '@renderer/components/Popover'
import { Spinner } from '@renderer/components/Spinner'
import { TagChip } from '@renderer/components/TagChip'
import { Skeleton } from '@renderer/ui/skeleton'
import type { OfferPreview } from './edit-offer'
import type { DiffPart } from './word-diff'

/** How long a pointer rests on the Apply button before the preview opens (Neesh, 2026-10-24). */
export const PREVIEW_HOVER_MS = 300
/** Time to move the pointer from the button into the preview before it closes. */
const LEAVE_MS = 150
/** The preview sits 8px (spacing/2) below its button and ends at least 8px above the Tags row. */
const GAP = 8

interface EditOfferProps {
  preview: OfferPreview
  /** Accepting is under way (it waits for a version still being prepared). */
  applying: boolean
  onApply: () => void
  /** The Tags row the preview must end above, so no chip is half hidden. */
  tagsRow: () => HTMLElement | null
}

function Sentence({ parts }: { parts: DiffPart[] }) {
  return (
    <p className="type-body-sm-regular text-muted-foreground">
      {parts.map((part, i) => {
        const gap = i < parts.length - 1 ? ' ' : ''
        if (part.kind === 'removed')
          return (
            <del key={i} className="text-tertiary line-through">
              {part.text}
              {gap}
            </del>
          )
        if (part.kind === 'added')
          return (
            <ins key={i} className="type-body-sm-medium text-brand no-underline">
              {part.text}
              {gap}
            </ins>
          )
        return (
          <span key={i}>
            {part.text}
            {gap}
          </span>
        )
      })}
    </p>
  )
}

function TagRow({
  label,
  tags,
  variant
}: {
  label: string
  tags: ApprovalTag[]
  variant: 'new' | 'removed'
}) {
  if (tags.length === 0) return null
  return (
    <div className="flex items-center gap-2">
      <span className="w-13 shrink-0 type-caption-xs-regular text-tertiary">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-1">
        {tags.map((tag) => (
          <TagChip
            key={tag.tagId}
            variant={variant}
            category={tag.categoryLabel}
            label={tag.label}
            tabIndex={-1}
          />
        ))}
      </div>
    </div>
  )
}

/** What the edit does to this variant: the description change, then only the tag changes. */
function Body({ preview }: { preview: OfferPreview }) {
  const { body } = preview
  return (
    <>
      {body.kind === 'preparing' ? (
        // The two lines the diff will take, so the popover keeps its height when it lands (L7.12).
        <>
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
            <p className="type-caption-xs-regular text-muted-foreground">
              Preparing this one’s version…
            </p>
          </div>
          <Skeleton aria-hidden className="h-3 w-full rounded-full" />
        </>
      ) : (
        body.diff &&
        (body.diff.mode === 'inline' ? (
          <Sentence parts={body.diff.parts} />
        ) : (
          <div className="flex flex-col gap-1">
            <p className="type-body-sm-regular text-tertiary">{body.diff.before}</p>
            <p className="type-body-sm-regular text-foreground">{body.diff.after}</p>
          </div>
        ))
      )}
      {body.kind === 'diff' && body.copied && (
        <p className="type-caption-xs-regular text-tertiary">
          Copied from your top mockup, since this one’s words couldn’t be reworded.
        </p>
      )}
      {(preview.adds.length > 0 || preview.removes.length > 0) && (
        <div className="flex flex-col gap-1.5">
          <TagRow label="Adds" tags={preview.adds} variant="new" />
          <TagRow label="Removes" tags={preview.removes} variant="removed" />
        </div>
      )}
    </>
  )
}

/**
 * Apply here (or Apply anyway) in the status line, and the preview that hangs from it (look-over.md,
 * L7, placement option A): hovering it for 300 ms or focusing it opens a Popover right-aligned 8px
 * below it, ending 8px above the Tags row. ↵ on the button applies exactly what the preview shows,
 * Esc closes the preview and keeps focus on the button, and Tab moves into the footer.
 */
export function EditOffer({ preview, applying, onApply, tagsRow }: EditOfferProps) {
  const [open, setOpen] = useState(false)
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const show = () => {
    clearTimeout(timer.current)
    const tags = tagsRow()?.getBoundingClientRect().top
    const below = trigger.current?.getBoundingClientRect().bottom
    const room = tags !== undefined && below !== undefined ? tags - below - 2 * GAP : 0
    setMaxHeight(room > 0 ? room : undefined)
    setOpen(true)
  }
  const later = (next: () => void, ms: number) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(next, ms)
  }
  const hide = () => {
    clearTimeout(timer.current)
    setOpen(false)
  }
  const focusIn = (selector: string) =>
    panel.current?.querySelector<HTMLButtonElement>(selector)?.focus()

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Tab' && !event.shiftKey && open) {
      event.preventDefault()
      focusIn('[data-slot="popover-footer"] button')
    }
  }
  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const buttons = [
      ...(panel.current?.querySelectorAll<HTMLButtonElement>(
        '[data-slot="popover-footer"] button'
      ) ?? [])
    ]
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (event.shiftKey && at === 0) {
      event.preventDefault()
      trigger.current?.focus()
    } else if (!event.shiftKey && at === buttons.length - 1) {
      // Past the footer: on to the line's ×, and the preview closes.
      event.preventDefault()
      hide()
      trigger.current?.parentElement
        ?.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')
        ?.focus()
    }
  }

  const apply = () => {
    hide()
    onApply()
  }

  return (
    <Popover
      anchored
      open={open}
      onOpenChange={(next) => (next ? show() : hide())}
      size="lg"
      align="end"
      sideOffset={GAP}
      title="Your top mockup edits"
      showDescription={preview.description !== null}
      description={preview.description ?? ''}
      footer
      secondary={<Button variant="ghost" size="sm" label="Close" onClick={hide} />}
      primary={<Button size="sm" label={preview.applyLabel} loading={applying} onClick={apply} />}
      panelProps={{
        ref: panel,
        // The preview never takes focus or hands it back: it belongs to the button.
        onOpenAutoFocus: (event) => event.preventDefault(),
        onCloseAutoFocus: (event) => event.preventDefault(),
        onInteractOutside: (event) => {
          if (trigger.current?.contains(event.target as Node)) event.preventDefault()
        },
        onPointerEnter: () => clearTimeout(timer.current),
        onPointerLeave: () => later(hide, LEAVE_MS),
        onKeyDown: onPanelKeyDown,
        ...(maxHeight !== undefined ? { style: { maxHeight } } : {})
      }}
      trigger={
        <Button
          ref={trigger}
          variant="secondary"
          size="xs"
          label={preview.applyLabel}
          loading={applying}
          onClick={apply}
          onFocus={show}
          onBlur={(event) => {
            if (!panel.current?.contains(event.relatedTarget as Node)) hide()
          }}
          onPointerEnter={() => later(show, PREVIEW_HOVER_MS)}
          onPointerLeave={() => later(hide, LEAVE_MS)}
          onKeyDown={onTriggerKeyDown}
        />
      }
    >
      <Body preview={preview} />
    </Popover>
  )
}
