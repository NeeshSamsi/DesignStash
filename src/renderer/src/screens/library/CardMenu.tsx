import {
  Delete02Icon,
  Edit02Icon,
  FileAddIcon,
  FolderAddIcon,
  Layers01Icon,
  LinkSquare02Icon,
  StarIcon,
  UndoIcon
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import type { LibraryItem } from '@shared/library'
import { DropdownMenu, DropdownMenuDivider } from '@renderer/components/DropdownMenu/DropdownMenu'
import { DropdownMenuItem } from '@renderer/components/DropdownMenuItem/DropdownMenuItem'
import type { UndoEntry } from './useLibraryActions'

/** What the menu is for: one card, a selection, a pile, or empty space. */
export type MenuTarget =
  /** `inPile` is set on the pile page, where a card can also be put on top. */
  | { kind: 'card'; item: LibraryItem; inPile?: { isTop: boolean } }
  | { kind: 'selection'; items: LibraryItem[] }
  | { kind: 'pile'; item: LibraryItem }
  | { kind: 'space' }

export interface CardMenuActions {
  openInPhotoshop: (item: LibraryItem) => void
  editDetails: (item: LibraryItem) => void
  star: (items: LibraryItem[], favourite: boolean) => void
  newPile?: (items: LibraryItem[]) => void
  disband?: (item: LibraryItem) => void
  /** A pile's page: open the pile, and put a card on top. */
  openPile?: (item: LibraryItem) => void
  putOnTop?: (item: LibraryItem) => void
  trash: (items: LibraryItem[]) => void
  selectAll: () => void
  addFiles?: () => void
  addFolder?: () => void
  undo: () => void
}

export interface CardMenuProps {
  target: MenuTarget | null
  /** Where the menu opens: the pointer for right-click, the ⋯ button's corner otherwise. */
  at: { x: number; y: number }
  onClose: () => void
  actions: CardMenuActions
  lastUndo: UndoEntry | null
}

interface Row {
  key: string
  label: string
  icon: IconSvgElement
  shortcut?: string
  disabled?: boolean
  destructive?: boolean
  run: () => void
}

/** The rows for a target, in `library.md` order. The same words the hover buttons use. */
export function menuRows(
  target: MenuTarget,
  actions: CardMenuActions,
  lastUndo: UndoEntry | null
): { rows: Row[]; groups: number[] } {
  switch (target.kind) {
    case 'card': {
      const { item, inPile } = target
      return {
        groups: [2, 3],
        rows: [
          {
            key: 'ps',
            label: 'Open in Photoshop',
            icon: LinkSquare02Icon,
            run: () => actions.openInPhotoshop(item)
          },
          {
            key: 'edit',
            label: 'Edit details',
            icon: Edit02Icon,
            run: () => actions.editDetails(item)
          },
          {
            key: 'star',
            label: item.favourite ? 'Remove star' : 'Star',
            icon: StarIcon,
            run: () => actions.star([item], !item.favourite)
          },
          inPile
            ? {
                key: 'top',
                label: 'Put on top',
                icon: Layers01Icon,
                disabled: inPile.isTop || !actions.putOnTop,
                run: () => actions.putOnTop?.(item)
              }
            : {
                key: 'pile',
                label: 'New pile',
                icon: Layers01Icon,
                shortcut: '⌘G',
                disabled: true,
                run: () => {}
              },
          {
            key: 'trash',
            label: 'Move to Trash',
            icon: Delete02Icon,
            shortcut: '⌘⌫',
            destructive: true,
            run: () => actions.trash([item])
          }
        ]
      }
    }
    case 'selection': {
      const { items } = target
      const n = items.length
      const allStarred = items.every((item) => item.favourite)
      return {
        groups: [1, 2],
        rows: [
          {
            key: 'pile',
            label: `New pile from ${n} mockups`,
            icon: Layers01Icon,
            shortcut: '⌘G',
            disabled: !actions.newPile,
            run: () => actions.newPile?.(items)
          },
          {
            key: 'star',
            label: allStarred ? `Remove star from ${n}` : `Star ${n}`,
            icon: StarIcon,
            run: () => actions.star(items, !allStarred)
          },
          {
            key: 'trash',
            label: `Move ${n} to Trash`,
            icon: Delete02Icon,
            shortcut: '⌘⌫',
            destructive: true,
            run: () => actions.trash(items)
          }
        ]
      }
    }
    case 'pile': {
      const { item } = target
      return {
        groups: [3, 3],
        rows: [
          {
            key: 'open',
            label: 'Open pile page',
            icon: Layers01Icon,
            shortcut: '↵',
            disabled: !actions.openPile,
            run: () => actions.openPile?.(item)
          },
          {
            key: 'ps',
            label: 'Open in Photoshop',
            icon: LinkSquare02Icon,
            run: () => actions.openInPhotoshop(item)
          },
          {
            key: 'edit',
            label: 'Edit details',
            icon: Edit02Icon,
            run: () => actions.editDetails(item)
          },
          {
            key: 'star',
            label: item.favourite ? 'Remove star' : 'Star',
            icon: StarIcon,
            run: () => actions.star([item], !item.favourite)
          },
          {
            key: 'disband',
            label: 'Disband pile',
            icon: Layers01Icon,
            shortcut: '⇧⌘G',
            disabled: !actions.disband,
            run: () => actions.disband?.(item)
          },
          {
            key: 'trash',
            label: 'Move pile to Trash',
            icon: Delete02Icon,
            destructive: true,
            run: () => actions.trash([item])
          }
        ]
      }
    }
    case 'space': {
      const rows: Row[] = [
        {
          key: 'all',
          label: 'Select all',
          icon: Layers01Icon,
          shortcut: '⌘A',
          run: actions.selectAll
        }
      ]
      if (actions.addFiles) {
        rows.push({
          key: 'files',
          label: 'Add files…',
          icon: FileAddIcon,
          shortcut: '⌘O',
          run: actions.addFiles
        })
      }
      if (actions.addFolder) {
        rows.push({
          key: 'folder',
          label: 'Add folder…',
          icon: FolderAddIcon,
          shortcut: '⇧⌘O',
          run: actions.addFolder
        })
      }
      rows.push({
        key: 'undo',
        label: lastUndo ? `Undo ${lastUndo.name}` : 'Undo',
        icon: UndoIcon,
        shortcut: '⌘Z',
        disabled: lastUndo === null,
        run: actions.undo
      })
      return { rows, groups: [1, rows.length - 1] }
    }
  }
}

/**
 * CardMenu — the one menu behind ⋯ and right-click, for a card, a selection, a pile or empty space.
 * It is the library's DropdownMenu, anchored to a point. Radix keeps it on screen near the window
 * edge. Never offers Duplicate, Reveal in Finder or a bare “Open”.
 */
export function CardMenu({ target, at, onClose, actions, lastUndo }: CardMenuProps) {
  const open = target !== null
  const { rows, groups } = target ? menuRows(target, actions, lastUndo) : { rows: [], groups: [] }
  // `groups` is the size of each block; a divider goes between blocks.
  const blocks = groups.map((size, i) => {
    const start = groups.slice(0, i).reduce((sum, n) => sum + n, 0)
    return rows.slice(start, start + size)
  })
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => !next && onClose()}
      align="start"
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
          {blocks.map((block, index) => (
            <span key={index} className="contents">
              {index > 0 && <DropdownMenuDivider />}
              {block.map((row) => (
                <DropdownMenuItem
                  key={row.key}
                  label={row.label}
                  icon={row.icon}
                  variant={row.destructive ? 'destructive' : 'neutral'}
                  disabled={row.disabled ?? false}
                  showShortcut={row.shortcut !== undefined}
                  {...(row.shortcut ? { shortcut: row.shortcut } : {})}
                  onSelect={() => row.run()}
                />
              ))}
            </span>
          ))}
        </>
      }
    />
  )
}
