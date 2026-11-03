import type { ComponentProps } from 'react'
import { Button } from '@renderer/components/Button'
import { CoverImage } from '@renderer/components/CoverImage'
import { cn } from '@renderer/lib/utils'
import { Skeleton } from '@renderer/ui/skeleton'
import {
  RECONCILIATION_PANEL_DEFAULTS,
  type ReconciliationPanelContractProps
} from './ReconciliationPanel.types'
import {
  reconciliationGroupVariants,
  reconciliationPanelVariants,
  reconciliationRowVariants
} from './ReconciliationPanel.variants'

/** A PSD that turned up in the stash folder, or a mockup whose PSD went missing. Names only, never paths. */
export interface ReconciliationItem {
  id: string
  /** "poster_new.psd" or the mockup's title. */
  name: string
  /** The line under the name: "Not in your stash yet · 48 MB". Plain sentence for the group when left out. */
  detail?: string
  /** The cover. Found files show the placeholder until one is given; gone rows show the stored cover. */
  coverSrc?: string
}

export interface ReconciliationPanelProps
  extends
    ReconciliationPanelContractProps,
    Omit<ComponentProps<'div'>, keyof ReconciliationPanelContractProps | 'children'> {
  /** "Found in your stash folder". Figma's two samples until given; an empty list hides the group. */
  found?: readonly ReconciliationItem[]
  /** "Gone from your stash folder". Figma's sample until given; an empty list hides the group. */
  gone?: readonly ReconciliationItem[]
  /** `resolving`: the row being worked on. Its buttons become a single disabled "Adding…" or "Removing…". */
  resolvingId?: string
  /** Overrides the sentence under the title, which is otherwise built from the counts. */
  description?: string
  /** Ignore · Add on a found row. Add puts the file in To sort. */
  onIgnore?: (id: string) => void
  onAdd?: (id: string) => void
  /** Remove · Relink… on a gone row. */
  onRemove?: (id: string) => void
  onRelink?: (id: string) => void
  onAddAll?: () => void
  onRemoveAll?: () => void
  /** One Ignore all in the footer: instant, with Undo in a toast. */
  onIgnoreAll?: () => void
  onDone?: () => void
}

const SAMPLE_FOUND: readonly ReconciliationItem[] = [
  { id: 'poster_new', name: 'poster_new.psd', detail: 'Not in your stash yet · 48 MB' },
  { id: 'mug_v2', name: 'mug_v2.psd', detail: 'Not in your stash yet · 31 MB' }
]
const SAMPLE_GONE: readonly ReconciliationItem[] = [
  { id: 'glass_iphone_14', name: 'Glass iPhone 14' }
]

const FOUND_DETAIL = 'Not in your stash yet'
const GONE_DETAIL = 'Its PSD isn’t in your stash folder any more'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function describe(found: number, gone: number): string {
  const parts = [
    found > 0 && `${plural(found, 'PSD turned', 'PSDs turned')} up in your stash folder`,
    gone > 0 && `${gone} went missing`
  ].filter(Boolean)
  return `${parts.join(' and ')}, outside DesignStash. Choose what to keep; nothing is deleted from disk without asking.`
}

function Group({
  title,
  count,
  bulkLabel,
  onBulk,
  disabled,
  children
}: {
  title: string
  count: string
  bulkLabel: string
  onBulk?: (() => void) | undefined
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <section aria-label={title} className={reconciliationGroupVariants()}>
      <div className="flex h-11 items-center gap-2 pr-3 pl-4">
        <h3 className="type-body-sm-medium whitespace-nowrap text-foreground">{title}</h3>
        <p className="min-w-0 flex-1 type-caption-xs-regular text-tertiary">{count}</p>
        <Button
          variant="secondary"
          size="sm"
          label={bulkLabel}
          disabled={disabled}
          onClick={onBulk}
        />
      </div>
      {children}
    </section>
  )
}

function Row({
  item,
  missing,
  fallbackDetail,
  children
}: {
  item: ReconciliationItem
  missing?: boolean
  fallbackDetail: string
  children: React.ReactNode
}) {
  return (
    <div className={reconciliationRowVariants()}>
      <CoverImage
        size="xs"
        state={missing ? 'missing-file' : 'loaded'}
        {...(item.coverSrc ? { src: item.coverSrc } : {})}
        className="shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate type-body-sm-regular text-foreground">{item.name}</p>
        <p className="truncate type-caption-xs-regular text-tertiary">
          {item.detail ?? fallbackDetail}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

/** Skeleton rows that mirror a group's rows: cover, a name line and a detail line. */
function CheckingRows() {
  return (
    <div
      aria-hidden
      className="flex w-full flex-col gap-3.5 rounded-xl border border-subtle bg-surface-1 px-4 py-3.5"
    >
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-3">
          <Skeleton className="h-9 w-12 shrink-0" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-45" />
            <Skeleton className="h-2.5 w-30" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * ReconciliationPanel — Resolve stash drift in a blocking modal (G1): PSDs that turned up in the stash folder and mockups whose PSD went missing, in the same grouped rows as Settings.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-6619
 * Found rows: Ignore · Add (Add puts the file in To sort, like anything you gather). Gone rows:
 * Remove · Relink…. Add all and Remove all sit in each group's header; one Ignore all in the footer.
 * The footer says how many are left and Done turns on at 0. Checking again shows skeleton rows,
 * never a spinner. Copy is plain names, no paths or codes. Esc handling belongs to the modal around it.
 */
export function ReconciliationPanel({
  className,
  found = SAMPLE_FOUND,
  gone = SAMPLE_GONE,
  resolvingId,
  description,
  onIgnore,
  onAdd,
  onRemove,
  onRelink,
  onAddAll,
  onRemoveAll,
  onIgnoreAll,
  onDone,
  ...rest
}: ReconciliationPanelProps) {
  const { state, ...props } = { ...RECONCILIATION_PANEL_DEFAULTS, ...rest }
  const checking = state === 'scanning' || state === 'rescanning'
  const resolved = state === 'all-resolved'
  const listed = !checking && !resolved
  const foundRows = listed ? found : []
  const goneRows = listed ? gone : []
  const left = foundRows.length + goneRows.length
  // `removing` is Figma's drawing of a gone row being worked on; code uses resolvingId for either.
  const busy = state === 'resolving' || state === 'removing'

  const title = resolved
    ? 'All sorted'
    : state === 'scanning'
      ? 'Checking your stash…'
      : 'Someone’s been rummaging in your stash'
  const line = resolved
    ? 'Your stash and its folder match again.'
    : state === 'scanning'
      ? 'Comparing your stash folder with DesignStash’s records.'
      : (description ?? describe(foundRows.length || found.length, goneRows.length || gone.length))

  return (
    <div
      data-ds="ReconciliationPanel"
      data-state={state}
      aria-busy={checking || busy || undefined}
      className={cn(reconciliationPanelVariants({ state }), className)}
      {...props}
    >
      <div className="flex w-full flex-col gap-1.5">
        <h2 className="type-title-lg-semibold text-foreground">{title}</h2>
        <p className="type-body-sm-regular text-muted-foreground">{line}</p>
      </div>

      {/* Long lists scroll here; the heading and footer stay pinned. */}
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
        {foundRows.length > 0 && (
          <Group
            title="Found in your stash folder"
            count={plural(foundRows.length, 'file', 'files')}
            bulkLabel="Add all"
            onBulk={onAddAll}
            disabled={busy}
          >
            {foundRows.map((item) => {
              const working = busy && resolvingId === item.id
              return (
                <Row key={item.id} item={item} fallbackDetail={FOUND_DETAIL}>
                  {working ? (
                    <Button variant="secondary" size="sm" label="Adding…" disabled />
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        label="Ignore"
                        disabled={busy}
                        onClick={() => onIgnore?.(item.id)}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        label="Add"
                        disabled={busy}
                        onClick={() => onAdd?.(item.id)}
                      />
                    </>
                  )}
                </Row>
              )
            })}
          </Group>
        )}

        {goneRows.length > 0 && (
          <Group
            title="Gone from your stash folder"
            count={plural(goneRows.length, 'mockup', 'mockups')}
            bulkLabel="Remove all"
            onBulk={onRemoveAll}
            disabled={busy}
          >
            {goneRows.map((item) => {
              const working = busy && resolvingId === item.id
              return (
                <Row key={item.id} item={item} missing fallbackDetail={GONE_DETAIL}>
                  {working ? (
                    <Button variant="secondary" size="sm" label="Removing…" disabled />
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        label="Remove"
                        disabled={busy}
                        onClick={() => onRemove?.(item.id)}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        label="Relink…"
                        disabled={busy}
                        onClick={() => onRelink?.(item.id)}
                      />
                    </>
                  )}
                </Row>
              )
            })}
          </Group>
        )}

        {checking && <CheckingRows />}
      </div>

      <div className="flex w-full items-center gap-2">
        {!resolved && (
          <Button
            variant="secondary"
            size="sm"
            label="Ignore all"
            disabled={checking || busy}
            onClick={onIgnoreAll}
          />
        )}
        <div className="h-px min-w-px flex-1" />
        {listed && (
          <p role="status" className="type-caption-xs-regular whitespace-nowrap text-tertiary">
            {left} left
          </p>
        )}
        <Button
          variant="primary"
          size="sm"
          label="Done"
          disabled={!resolved && !(listed && left === 0 && !busy)}
          onClick={onDone}
        />
      </div>
    </div>
  )
}
