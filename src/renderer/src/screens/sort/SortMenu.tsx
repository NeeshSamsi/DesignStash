import { DropdownMenu, DropdownMenuDivider } from '@renderer/components/DropdownMenu/DropdownMenu'
import { DropdownMenuItem } from '@renderer/components/DropdownMenuItem/DropdownMenuItem'
import type { BoardAction, BoardState } from './board-model'
import { buildMenu, type MenuTarget } from './menu-model'
import { pointMenuAlign } from '@renderer/lib/point-menu'

export interface SortMenuProps {
  state: BoardState
  target: MenuTarget | null
  /** Where it opens: the pointer for right-click, the ⋯ button's corner otherwise. */
  at: { x: number; y: number }
  onClose: () => void
  onAction: (action: BoardAction) => void
}

/** A row's words: a disabled one says why after its label (“New pile · needs 2 or more”). */
const labelOf = (row: { label: string; reason?: string }) =>
  row.reason ? `${row.label} · ${row.reason}` : row.label

/**
 * SortMenu — the one menu behind ⋯ and right-click on a tile, a selection, a pile or empty board
 * space. It is the shared DropdownMenu anchored to a point, so Radix flips it, and its submenus,
 * away from the window edge (S4.E5).
 */
export function SortMenu({ state, target, at, onClose, onAction }: SortMenuProps) {
  const rows = target ? buildMenu(state, target) : []
  return (
    <DropdownMenu
      open={target !== null}
      onOpenChange={(next) => !next && onClose()}
      align={pointMenuAlign(at.x)}
      trigger={
        <span
          aria-hidden
          data-grid-ignore
          className="pointer-events-none fixed size-0"
          style={{ left: at.x, top: at.y }}
        />
      }
      items={
        <>
          {rows.map((row, index) => {
            if (row.type === 'divider') return <DropdownMenuDivider key={`d${index}`} />
            if (row.type === 'sub') {
              return (
                <DropdownMenuItem
                  key={row.key}
                  label={labelOf(row)}
                  icon={row.icon}
                  submenu
                  disabled={row.disabled ?? false}
                >
                  {row.items.map((sub) => (
                    <DropdownMenuItem
                      key={sub.key}
                      label={sub.label}
                      showIcon={false}
                      onSelect={() => onAction(sub.action)}
                    />
                  ))}
                </DropdownMenuItem>
              )
            }
            return (
              <DropdownMenuItem
                key={row.key}
                label={labelOf(row)}
                icon={row.icon}
                variant={row.destructive ? 'destructive' : 'neutral'}
                disabled={row.disabled ?? false}
                showShortcut={row.shortcut !== undefined}
                {...(row.shortcut ? { shortcut: row.shortcut } : {})}
                onSelect={() => onAction(row.action)}
              />
            )
          })}
        </>
      }
    />
  )
}
