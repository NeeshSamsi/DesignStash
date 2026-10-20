import { useState } from 'react'
import { FileAddIcon, FolderAddIcon } from '@hugeicons/core-free-icons'
import { AddMockupCard } from '@renderer/components/AddMockupCard'
import {
  DropdownMenu,
  DropdownMenuDivider,
  DropdownMenuHint
} from '@renderer/components/DropdownMenu/DropdownMenu'
import { DropdownMenuItem } from '@renderer/components/DropdownMenuItem/DropdownMenuItem'
import { useCopyStore } from '@renderer/stores/copyStore'

export interface AddCardMenuProps {
  onAddFiles?: (() => void) | undefined
  onAddFolder?: (() => void) | undefined
}

/**
 * The Add card and its menu, as My Stash and the inboxes show them. The last row says how to add
 * without the menu, or, while a copy runs, that what is added joins it.
 */
export function AddCardMenu({ onAddFiles, onAddFolder }: AddCardMenuProps) {
  // A menu closing hands focus back to the card; after a mouse click that must not look selected.
  const [pointer, setPointer] = useState(false)
  const copying = useCopyStore((s) => s.haul?.state === 'running' || s.haul?.state === 'paused')
  return (
    <DropdownMenu
      align="start"
      trigger={
        <AddMockupCard
          {...(pointer ? { 'data-pointer': '' } : {})}
          onPointerDown={() => setPointer(true)}
          onKeyDown={() => setPointer(false)}
        />
      }
      items={
        <>
          <DropdownMenuItem
            label="Add files…"
            icon={FileAddIcon}
            shortcut="⌘O"
            {...(onAddFiles ? { onSelect: onAddFiles } : { disabled: true })}
          />
          <DropdownMenuItem
            label="Add folder…"
            icon={FolderAddIcon}
            shortcut="⇧⌘O"
            {...(onAddFolder ? { onSelect: onAddFolder } : { disabled: true })}
          />
          <DropdownMenuDivider />
          <DropdownMenuHint>
            {copying ? 'Copying now. What you add joins the copy.' : 'or drop PSDs anywhere'}
          </DropdownMenuHint>
        </>
      }
    />
  )
}
