import type { ComponentProps, ReactNode } from 'react'
import { Cancel01Icon, Delete02Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@renderer/components/Button'
import { CoverPanel } from '@renderer/components/CoverPanel'
import { ErrorState } from '@renderer/components/ErrorState'
import { FavouriteToggle } from '@renderer/components/FavouriteToggle'
import { Input } from '@renderer/components/Input'
import { KeyboardShortcut } from '@renderer/components/KeyboardShortcut'
import { MockupMetaForm } from '@renderer/components/MockupMetaForm'
import { Tooltip } from '@renderer/components/Tooltip'
import { VariantStrip } from '@renderer/components/VariantStrip'
import { DialogFrame } from '@renderer/lib/dialog-shell'
import { cn } from '@renderer/lib/utils'
import { DialogDescription, DialogTitle } from '@renderer/ui/dialog'
import { Skeleton } from '@renderer/ui/skeleton'
import {
  DETAIL_MODAL_LAYOUT_DEFAULTS,
  type DetailModalLayoutContractProps
} from './DetailModalLayout.types'
import {
  DETAIL_BODY,
  DETAIL_FOOTER,
  DETAIL_HEADER,
  DETAIL_MEDIA,
  DETAIL_META,
  detailModalLayoutVariants
} from './DetailModalLayout.variants'

export interface DetailModalLayoutProps
  extends
    DetailModalLayoutContractProps,
    Omit<ComponentProps<'div'>, keyof DetailModalLayoutContractProps | 'title'> {
  /** Live Radix dialog when given; without it the layout renders in place (catalog). */
  open?: boolean
  /** Esc, a click outside or the close button. The screen decides whether to guard it. */
  onClose?: () => void
  title?: string
  onTitleChange?: (title: string) => void
  /** The title is empty: marks the field and, with Save, explains why Save is off. */
  titleInvalid?: boolean
  favourite?: boolean
  onToggleFavourite?: (favourite: boolean) => void
  /** Move to Trash (⌘⌫). Instant; the screen offers Undo. */
  onTrash?: () => void
  /** The media column: CoverPanel, and for a pile the VariantStrip under it. Figma's sample until given. */
  media?: ReactNode
  /** The right column: MockupMetaForm. Figma's sample until given. */
  meta?: ReactNode
  /** Why Save is off, shown as its tooltip (“Add a title to save”). Save is enabled without it. */
  saveDisabledReason?: string
  onSave?: () => void
  onDisband?: () => void
  onOpenInPhotoshop?: () => void
  /** `error`: the plain-language message under the heading. */
  errorMessage?: string
  onRetry?: () => void
}

const SAMPLE_TITLE = 'Clay iPhone 15 Pro'
const ERROR_TITLE = 'We couldn’t load this mockup'
const ERROR_MESSAGE = 'We couldn’t read its entry in your stash. Try again, or check your stash.'

/** A bar of the skeleton that mirrors the loaded layout. */
const Bar = ({ className }: { className: string }) => (
  <Skeleton className={cn('rounded-full', className)} />
)

function LoadingBody() {
  return (
    <div className={DETAIL_BODY} aria-hidden>
      <div className={DETAIL_MEDIA}>
        <Skeleton className="aspect-card w-detail-media rounded-xl" />
        <Bar className="h-5 w-28" />
      </div>
      <div className={cn(DETAIL_META, 'gap-5')}>
        <div className="flex flex-col gap-2">
          <Bar className="h-3 w-20" />
          <Skeleton className="h-18 w-full rounded-lg" />
        </div>
        <div className="flex flex-col gap-2">
          <Bar className="h-3 w-9" />
          <div className="flex gap-1.5">
            <Bar className="h-5.5 w-18" />
            <Bar className="h-5.5 w-24" />
            <Bar className="h-5.5 w-16" />
            <Bar className="h-5.5 w-21" />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * DetailModalLayout — Two-pane mockup detail inside Modal xl, always editable.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=222-4366
 * Used by screens/detail/DetailModal.tsx. Header: title field · Move to Trash · star · close. Footer (F1): Disband pile on the
 * left for piles; on the right, Save (secondary, only once something changed) just left of Open in
 * Photoshop, which is always the primary and never moves. The layout shows no “unsaved” badge.
 * `loading` mirrors the loaded layout with the footer off; `error` shows the title as a plain heading.
 */
export function DetailModalLayout({
  className,
  open,
  onClose,
  title = SAMPLE_TITLE,
  onTitleChange,
  titleInvalid = false,
  favourite = false,
  onToggleFavourite,
  onTrash,
  media,
  meta,
  saveDisabledReason,
  onSave,
  onDisband,
  onOpenInPhotoshop,
  errorMessage = ERROR_MESSAGE,
  onRetry,
  ...rest
}: DetailModalLayoutProps) {
  const { variant, state, ...props } = { ...DETAIL_MODAL_LAYOUT_DEFAULTS, ...rest }
  const loading = state === 'loading'
  const failed = state === 'error'
  const saving = state === 'saving'
  const showSave = state === 'dirty' || saving
  const pile = variant === 'group'
  const close = onClose ?? (() => {})
  // Live, the plain heading is the dialog's own title, so the dialog is named once.
  const Heading = open === undefined ? 'h2' : DialogTitle

  const closeButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Close"
      iconStart={Cancel01Icon}
      showIconStart
      onClick={close}
    />
  )

  const header = loading ? (
    <div className={DETAIL_HEADER}>
      <div className="flex h-10 min-w-0 flex-1 items-center" aria-hidden>
        <Bar className="h-5 w-55" />
      </div>
      {closeButton}
    </div>
  ) : failed ? (
    <div className={DETAIL_HEADER}>
      <Heading className="min-w-0 flex-1 truncate px-2 py-1 type-display-2xl-medium text-foreground">
        {title || 'Mockup details'}
      </Heading>
      <FavouriteToggle variant="inline" pressed={favourite} />
      {closeButton}
    </div>
  ) : (
    <div className={DETAIL_HEADER}>
      <Input
        variant="inline-title"
        aria-label="Title"
        value={title}
        readOnly={saving}
        aria-invalid={titleInvalid || undefined}
        className="min-w-0 flex-1"
        {...(onTitleChange && { onChange: (event) => onTitleChange(event.target.value) })}
      />
      <Tooltip
        label="Move to Trash"
        arrow="top-right"
        showShortcut
        shortcut={<KeyboardShortcut keys="⌘⌫" />}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Move to Trash"
          iconStart={Delete02Icon}
          showIconStart
          onClick={onTrash}
        />
      </Tooltip>
      <FavouriteToggle
        variant="inline"
        pressed={favourite}
        {...(onToggleFavourite && { onPressedChange: onToggleFavourite })}
      />
      {closeButton}
    </div>
  )

  const body = loading ? (
    <LoadingBody />
  ) : failed ? (
    <ErrorState
      variant="inline"
      title={ERROR_TITLE}
      message={errorMessage}
      {...(onRetry && { onRetry })}
    />
  ) : (
    <div className={DETAIL_BODY}>
      <div className={DETAIL_MEDIA}>
        {media ?? (
          <>
            <CoverPanel showDeck={pile} />
            {pile && <VariantStrip />}
          </>
        )}
      </div>
      <div className={DETAIL_META}>
        {media === undefined && meta === undefined ? <MockupMetaForm variant="detail" /> : meta}
      </div>
    </div>
  )

  const save = (
    <Button
      variant="secondary"
      label={saving ? 'Saving…' : 'Save'}
      loading={saving}
      disabled={saveDisabledReason !== undefined}
      {...(onSave && { onClick: onSave })}
    />
  )

  const footer = failed ? (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" label="Close" onClick={close} />
    </div>
  ) : (
    <div className={DETAIL_FOOTER}>
      <div className="flex gap-2">
        {pile && !loading && <Button variant="ghost" label="Disband pile" onClick={onDisband} />}
      </div>
      <div className="flex gap-2">
        {showSave &&
          (saveDisabledReason !== undefined ? (
            <Tooltip label={saveDisabledReason} arrow="bottom-right">
              <span
                tabIndex={0}
                className="inline-flex rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {save}
              </span>
            </Tooltip>
          ) : (
            save
          ))}
        <Button
          label="Open in Photoshop"
          showIconStart
          iconStart={LinkSquare02Icon}
          disabled={loading}
          {...(onOpenInPhotoshop && { onClick: onOpenInPhotoshop })}
        />
      </div>
    </div>
  )

  const content = (
    <>
      {open !== undefined && (
        <>
          {!failed && <DialogTitle className="sr-only">{title || 'Mockup details'}</DialogTitle>}
          <DialogDescription className="sr-only">
            Edit this mockup’s title, description and tags.
          </DialogDescription>
        </>
      )}
      {header}
      {body}
      {footer}
    </>
  )

  if (open === undefined) {
    return (
      <div
        data-ds="DetailModalLayout"
        data-variant={variant}
        data-detail-state={state}
        aria-busy={loading || undefined}
        className={cn(
          'flex flex-col gap-5 rounded-xl border border-base bg-surface-2 p-6 text-foreground',
          detailModalLayoutVariants({ variant, state }),
          className
        )}
        {...props}
      >
        {content}
      </div>
    )
  }

  return (
    <DialogFrame
      open={open}
      dataDs="DetailModalLayout"
      className={cn(detailModalLayoutVariants({ variant, state }), className)}
      onDismiss={onClose}
    >
      <div data-detail-state={state} data-variant={variant} className="contents">
        {content}
      </div>
    </DialogFrame>
  )
}
