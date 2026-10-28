import { ICON_STROKE } from '@renderer/design-system/icon'
import { useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { AiMagicIcon, Cancel01Icon, PlusSignIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { cn } from '@renderer/lib/utils'
import { WRITING_PLACEHOLDER } from '@renderer/lib/writing-field'
import { Tooltip } from '@renderer/components/Tooltip'
import { TAG_CHIP_DEFAULTS, type TagChipContractProps } from './TagChip.types'
import { tagChipVariants } from './TagChip.variants'

export interface TagChipProps
  extends
    TagChipContractProps,
    Omit<ComponentProps<'div'>, keyof TagChipContractProps | 'children'> {
  /** input: the live text field. Without it the chip draws the typed label and a caret. */
  children?: ReactNode
  /** removable / filter / marked: the × was pressed. */
  onRemove?: () => void
  /** suggested: the chip or its ✓ was pressed. */
  onAccept?: () => void
  /** suggested: the × was pressed. */
  onDismiss?: () => void
  /** Draws the focus ring without focus (the existing chip of a duplicate). */
  highlighted?: boolean
}

/** The label, with its full text in a tooltip once it is cut off at the max width. */
function TagLabel({ children, className }: { children: string; className: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <Tooltip
      arrow="none"
      label={children}
      open={open}
      onOpenChange={(next) => {
        const el = ref.current
        setOpen(next && !!el && el.scrollWidth > el.clientWidth)
      }}
    >
      <span ref={ref} className={cn('max-w-tag-label truncate', className)}>
        {children}
      </span>
    </Tooltip>
  )
}

/** The × at the end of a removable chip: on hover or focus, always once marked. */
function RemoveButton({
  label,
  marked,
  onRemove
}: {
  label: string
  marked: boolean
  onRemove?: (() => void) | undefined
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Remove ${label}`}
      onClick={(event) => {
        event.stopPropagation()
        onRemove?.()
      }}
      className={cn(
        'size-4 shrink-0 cursor-pointer items-center justify-center text-muted-foreground outline-none hover:text-foreground group-focus-within/chip:inline-flex group-hover/chip:inline-flex',
        marked ? 'inline-flex text-error' : 'hidden'
      )}
    >
      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={ICON_STROKE} className="size-4" />
    </button>
  )
}

/**
 * TagChip — Tag pill. Solid = your tag, dashed = not a tag yet.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-1203
 * Rules: design/specs/tags.md. hover / focus are CSS; `highlighted` draws the focus ring by hand.
 * Interactive variants (add, suggested) take focus and answer Enter and Space like a click.
 * `removed` is a tag an edit takes out, in the edit preview (look-over.md, L7): struck and muted.
 * A thinking suggestion says “Writing with AI…” while the AI writes the tags (L6.1).
 */
export function TagChip({
  className,
  children,
  onRemove,
  onAccept,
  onDismiss,
  highlighted,
  onClick,
  onKeyDown,
  ...rest
}: TagChipProps) {
  const { variant, state, showCategory, category, label, ...props } = {
    ...TAG_CHIP_DEFAULTS,
    ...rest
  }
  const marked = variant === 'removable' && state === 'marked'
  const thinking = variant === 'suggested' && state === 'thinking'
  const pressable = variant === 'add' || (variant === 'suggested' && !thinking)
  const press = variant === 'suggested' ? onAccept : undefined
  const removed = variant === 'removed'
  const categoryText = showCategory && (
    <span className={variant === 'filter' ? 'text-muted-foreground' : 'text-tertiary'}>
      {category}
    </span>
  )
  const labelClass = cn(
    'type-label-xs-medium',
    marked
      ? 'text-error'
      : variant === 'suggested'
        ? 'text-muted-foreground'
        : removed
          ? 'text-tertiary'
          : 'text-foreground'
  )

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.target !== event.currentTarget) return
    if (pressable && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      if (press) press()
      else event.currentTarget.click()
    }
  }

  let body: ReactNode
  switch (variant) {
    case 'add':
      body = (
        <>
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={ICON_STROKE}
            className="size-icon-2xs shrink-0 text-muted-foreground"
          />
          <span className="type-label-xs-medium text-muted-foreground group-hover/chip:text-foreground">
            Add tag
          </span>
        </>
      )
      break
    case 'input':
      body = children ?? (
        <>
          <span aria-hidden className="h-3 w-px shrink-0 bg-foreground" />
          {state === 'default' ? (
            <span className="text-placeholder">Type a tag…</span>
          ) : (
            <span className={labelClass}>{label}</span>
          )}
        </>
      )
      break
    case 'suggested':
      body = (
        <>
          <HugeiconsIcon
            icon={AiMagicIcon}
            strokeWidth={ICON_STROKE}
            className={cn('size-4 shrink-0', thinking ? 'text-tertiary' : 'text-brand')}
          />
          {thinking ? (
            <span className="animate-pulse type-label-xs-medium text-placeholder motion-reduce:animate-none">
              {WRITING_PLACEHOLDER}
            </span>
          ) : (
            <>
              {categoryText}
              <TagLabel className={labelClass}>{label}</TagLabel>
              <span className="hidden items-center gap-1 group-hover/chip:inline-flex group-focus-within/chip:inline-flex">
                <HugeiconsIcon
                  icon={Tick02Icon}
                  strokeWidth={ICON_STROKE}
                  className="size-icon-2xs text-muted-foreground"
                />
                <span
                  aria-hidden
                  data-slot="dismiss"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDismiss?.()
                  }}
                  className="inline-flex size-4 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    strokeWidth={ICON_STROKE}
                    className="size-icon-2xs"
                  />
                </span>
              </span>
            </>
          )}
        </>
      )
      break
    default:
      body = (
        <>
          {categoryText}
          <TagLabel className={labelClass}>{label}</TagLabel>
          {(variant === 'removable' || variant === 'filter') && (
            <RemoveButton label={label} marked={marked} onRemove={onRemove} />
          )}
        </>
      )
  }

  return (
    <div
      data-ds="TagChip"
      data-variant={variant}
      data-state={state}
      data-highlighted={highlighted || undefined}
      role={pressable ? 'button' : undefined}
      tabIndex={pressable || variant === 'removable' || variant === 'new' ? 0 : undefined}
      aria-label={
        variant === 'suggested' && !thinking
          ? `Add ${category} ${label}`
          : variant === 'add'
            ? 'Add tag'
            : undefined
      }
      aria-disabled={thinking || undefined}
      aria-invalid={variant === 'input' && state === 'invalid' ? true : undefined}
      className={cn(tagChipVariants({ variant, state }), className)}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented && variant === 'suggested' && !thinking) onAccept?.()
      }}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {body}
    </div>
  )
}
