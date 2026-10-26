import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { AddMockupCard } from '@renderer/components/AddMockupCard'
import { FavouriteToggle } from '@renderer/components/FavouriteToggle'
import { GlobalSearch } from '@renderer/components/GlobalSearch'
import { MockupCard } from '@renderer/components/MockupCard'
import { SidebarNavItem } from '@renderer/components/SidebarNavItem'
import { TagChip } from '@renderer/components/TagChip'

/**
 * One focus ring for every focusable component (look-over.md, Focus ring): the shared focus-ring
 * utility, 2px of border/focus 2px outside the control, which keeps its own border. These six drew a
 * flush ring-2 (or only recoloured a border) until 2026-10-26.
 */
const cases: [string, ReactElement, string][] = [
  ['SidebarNavItem', <SidebarNavItem key="nav" />, '[data-ds="SidebarNavItem"]'],
  ['AddMockupCard', <AddMockupCard key="add" />, '[data-ds="AddMockupCard"]'],
  ['FavouriteToggle', <FavouriteToggle key="fav" />, '[data-ds="FavouriteToggle"]'],
  ['TagChip', <TagChip key="chip" variant="removable" />, '[data-ds="TagChip"]'],
  ['MockupCard (its face)', <MockupCard key="card" />, '[data-ds="MockupCard"] > div.rounded-card'],
  ['GlobalSearch (its field)', <GlobalSearch key="search" />, '[data-slot="input-group"]']
]

describe('focus ring', () => {
  it.each(cases)('%s draws the shared focus-ring, never a flush ring-2', (_name, element, selector) => {
    const { container } = render(element)
    const target = container.querySelector(selector)
    expect(target).not.toBeNull()
    expect(target!.className).toMatch(/focus-ring/)
    expect(target!.className).not.toMatch(/\S:ring-2|border-ring/)
  })
})
