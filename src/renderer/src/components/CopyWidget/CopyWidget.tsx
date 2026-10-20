import { ICON_STROKE } from '@renderer/design-system/icon'
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import {
  Alert02Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  PauseCircleIcon,
  Tick02Icon,
  Upload01Icon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@renderer/components/Button'
import { cn } from '@renderer/lib/utils'
import { Progress as UiProgress } from '@renderer/ui/progress'
import { COPY_WIDGET_DEFAULTS, type CopyWidgetContractProps } from './CopyWidget.types'
import {
  copyWidgetFadeVariants,
  copyWidgetFilesVariants,
  copyWidgetStatusVariants,
  copyWidgetVariants
} from './CopyWidget.variants'

export interface CopyWidgetProps
  extends
    CopyWidgetContractProps,
    Omit<ComponentProps<'div'>, keyof CopyWidgetContractProps | 'title' | 'children'> {
  /** The headline: "Copying 12 of 40", "38 copied · 3 skipped". Defaults to Figma's sample for the state. */
  title?: string
  /** `stopped` and `error`, expanded: the line under the title. Defaults to Figma's sample. */
  description?: string
  /** `copying`: how far along, 0 to 100. Figma's sample is 30. */
  percent?: number
  /** `copying`, expanded: "About 1 min left". Left out when empty. */
  remaining?: string
  /** `stopped`: how many files made it in; the Keep button reads "Keep 12". */
  keepCount?: number
  onCancel?: () => void
  onKeep?: () => void
  onUndoAll?: () => void
  onRetry?: () => void
  onDismiss?: () => void
  /** Switches between expanded and collapsed. */
  onToggleView?: () => void
}

const TITLE = {
  copying: 'Copying 12 of 40',
  done: '38 copied · 3 skipped',
  stopped: 'Copying stopped at 12 of 40',
  error: 'Copying paused · your disk is full'
} as const

const DESCRIPTION = {
  stopped: 'Keep the 12 that made it in, or undo all?',
  error: 'Free up some space, then retry. The 12 already copied are safe in To sort.'
} as const

const LEAD = {
  copying: Upload01Icon,
  done: Tick02Icon,
  stopped: PauseCircleIcon,
  error: Alert02Icon
} as const

/**
 * CopyWidget — Bottom-right copy panel (transport only): per-file and overall progress, failures inline, Cancel asks keep or undo, done collapses to a summary.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=373-5804
 * Expanded: the header and footer are sticky and only the file list scrolls (capped at about five
 * rows). The edge fades follow the list's scroll position; `moreAbove` and `moreBelow` force them
 * on (the Figma variants). It never prompts to sort: the To sort count in the sidebar does that.
 */
export function CopyWidget({
  className,
  title,
  description,
  percent = 30,
  remaining = 'About 1 min left',
  keepCount = 12,
  onCancel,
  onKeep,
  onUndoAll,
  onRetry,
  onDismiss,
  onToggleView,
  ...rest
}: CopyWidgetProps) {
  const { view, state, moreAbove, moreBelow, files, ...props } = {
    ...COPY_WIDGET_DEFAULTS,
    ...rest
  }
  const expanded = view === 'expanded'
  const copying = state === 'copying'
  const headline = title ?? TITLE[state]
  const note = description ?? (state === 'stopped' || state === 'error' ? DESCRIPTION[state] : '')

  const listRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ above: false, below: false })
  const measure = useCallback(() => {
    const el = listRef.current
    if (!el) return
    setEdges({
      above: el.scrollTop > 0,
      below: el.scrollTop + el.clientHeight < el.scrollHeight - 1
    })
  }, [])
  useEffect(measure, [measure, files, expanded])

  const hasFooter = state !== 'done'

  return (
    <div
      data-ds="CopyWidget"
      data-view={view}
      data-state={state}
      className={cn(copyWidgetVariants({ view, state }), className)}
      {...props}
    >
      <div className="flex w-full items-start gap-3 px-4 py-3">
        <div className="flex h-9 items-center">
          <HugeiconsIcon
            icon={LEAD[state]}
            strokeWidth={ICON_STROKE}
            aria-hidden
            className={copyWidgetStatusVariants({ state })}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-2">
          <p className="w-full truncate type-body-sm-medium text-foreground">{headline}</p>
          {expanded && note && (
            <p className="w-full type-caption-xs-regular text-muted-foreground">{note}</p>
          )}
          {copying && (
            <div className="flex w-full flex-col gap-1.5 pt-1">
              <UiProgress size="sm" value={percent} aria-label={headline} />
              {expanded && remaining && (
                <p className="type-caption-xs-regular text-tertiary">{remaining}</p>
              )}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          iconStart={expanded ? ArrowDown01Icon : ArrowUp01Icon}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-expanded={expanded}
          onClick={onToggleView}
        />
        {!copying && (
          <Button
            variant="ghost"
            size="icon"
            iconStart={Cancel01Icon}
            aria-label="Dismiss"
            onClick={onDismiss}
          />
        )}
      </div>

      {expanded && (
        <>
          <div className="relative w-full">
            <div
              ref={listRef}
              onScroll={measure}
              className={copyWidgetFilesVariants({ footer: hasFooter })}
            >
              {files}
            </div>
            {(moreAbove || edges.above) && (
              <div className={copyWidgetFadeVariants({ edge: 'top' })} />
            )}
            {(moreBelow || edges.below) && (
              <div className={copyWidgetFadeVariants({ edge: 'bottom' })} />
            )}
          </div>
          {hasFooter && (
            <div className="flex w-full items-center justify-end gap-2 px-4 py-3">
              {copying && <Button variant="ghost" size="base" label="Cancel" onClick={onCancel} />}
              {state === 'stopped' && (
                <>
                  <Button variant="ghost" size="base" label="Undo all" onClick={onUndoAll} />
                  <Button
                    variant="primary"
                    size="base"
                    label={`Keep ${keepCount}`}
                    onClick={onKeep}
                  />
                </>
              )}
              {state === 'error' && (
                <>
                  <Button variant="ghost" size="base" label="Cancel" onClick={onCancel} />
                  <Button variant="primary" size="base" label="Retry" onClick={onRetry} />
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
