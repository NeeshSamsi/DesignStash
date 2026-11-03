import { ICON_STROKE } from '@renderer/design-system/icon'
import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Clock01Icon, Delete02Icon, Layers01Icon, Settings01Icon } from '@hugeicons/core-free-icons'
import { SidebarNavItem } from '@renderer/components/SidebarNavItem'
import { TreeBranch } from '@renderer/components/TreeBranch'
import { cn } from '@renderer/lib/utils'
import {
  SIDEBAR_NAV_DEFAULTS,
  type SidebarNavContractProps,
  type SidebarNavVariant
} from './SidebarNav.types'
import {
  sidebarNavBrandClass,
  sidebarNavListClass,
  sidebarNavLogoClass,
  sidebarNavStemClass,
  sidebarNavTreeClass,
  sidebarNavVariants
} from './SidebarNav.variants'

/** Pages the sidebar lists. Settings is a modal, so it is not one. */
export type SidebarNavKey = 'all' | 'starred' | 'to-sort' | 'to-stash' | 'trash'

export interface SidebarNavCounts {
  library?: number
  starred?: number
  all?: number
  toSort?: number
  toStash?: number
  trash?: number
}

export interface SidebarNavProps extends SidebarNavContractProps {
  /** The page on show. */
  selected?: SidebarNavKey
  counts?: SidebarNavCounts
  onNavigate?: (key: SidebarNavKey) => void
  /** Settings opens a modal; there is no route. */
  onOpenSettings?: () => void
  /** Settings is still a page: mark its row while it is on show. */
  settingsActive?: boolean
  className?: string
}

/** Which of To sort / To stash to list: each only while it has something in it. */
export function sidebarNavVariant(toSort: number, toStash: number): SidebarNavVariant {
  if (toSort > 0 && toStash > 0) return 'both'
  if (toSort > 0) return 'to-sort'
  if (toStash > 0) return 'to-stash'
  return 'none'
}

const countText = (n: number | undefined) => (n === undefined ? undefined : String(n))
/** A zero says nothing: its badge stays out of the row. */
const hasCount = (n: number | undefined): n is number => n !== undefined && n > 0

/**
 * SidebarNav — Primary navigation: the DesignStash brand row, My Stash › Starred / All, To sort and To stash (each only when non-empty), Trash, Settings.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=218-1964
 * Every row is a slot with a default built from `selected`, `counts` and the callbacks; pass a
 * slot to replace one. Clicking My Stash goes to All.
 */
export function SidebarNav({
  className,
  selected,
  counts = {},
  onNavigate,
  onOpenSettings,
  settingsActive = false,
  ...rest
}: SidebarNavProps) {
  const props = { ...SIDEBAR_NAV_DEFAULTS, ...rest }
  const row = (
    key: SidebarNavKey,
    label: string,
    count: number | undefined,
    extra: Partial<Parameters<typeof SidebarNavItem>[0]> = {}
  ): ReactNode => (
    <SidebarNavItem
      label={label}
      active={selected === key}
      showCount={hasCount(count)}
      {...(hasCount(count) ? { count: String(count) } : {})}
      onClick={() => onNavigate?.(key)}
      {...extra}
    />
  )
  const showToSort = props.variant === 'to-sort' || props.variant === 'both'
  const showToStash = props.variant === 'to-stash' || props.variant === 'both'

  return (
    <nav
      data-ds="SidebarNav"
      data-variant={props.variant}
      aria-label="Primary"
      className={cn(sidebarNavVariants({ variant: props.variant }), className)}
    >
      {props.add}
      <div data-slot="brand" className={sidebarNavBrandClass}>
        <span aria-hidden className={sidebarNavLogoClass}>
          <HugeiconsIcon icon={Layers01Icon} strokeWidth={ICON_STROKE} className="size-4" />
        </span>
        <span className="type-title-lg-semibold whitespace-nowrap text-foreground">
          DesignStash
        </span>
      </div>
      <div className={sidebarNavListClass}>
        {props.library ?? (
          <SidebarNavItem
            label="My Stash"
            showCount={hasCount(counts.library)}
            count={countText(counts.library) ?? ''}
            onClick={() => onNavigate?.('all')}
          />
        )}
        <div className={sidebarNavTreeClass}>
          <span className={sidebarNavStemClass} aria-hidden="true" />
          <div className="flex items-center">
            <TreeBranch position="middle" />
            {props.starred ??
              row('starred', 'Starred', counts.starred, { variant: 'child', showIcon: false })}
          </div>
          <div className="flex items-center">
            <TreeBranch position="last" />
            {props.all ?? row('all', 'All', counts.all, { variant: 'child', showIcon: false })}
          </div>
        </div>
        {showToSort &&
          (props.toSort ?? row('to-sort', 'To sort', counts.toSort, { icon: Layers01Icon }))}
        {showToStash &&
          (props.toStash ?? row('to-stash', 'To stash', counts.toStash, { icon: Clock01Icon }))}
        {props.trash ?? row('trash', 'Trash', counts.trash, { icon: Delete02Icon })}
      </div>
      <div className="flex-1" />
      {props.settings ?? (
        <SidebarNavItem
          label="Settings"
          icon={Settings01Icon}
          showCount={false}
          active={settingsActive}
          onClick={onOpenSettings}
        />
      )}
    </nav>
  )
}
