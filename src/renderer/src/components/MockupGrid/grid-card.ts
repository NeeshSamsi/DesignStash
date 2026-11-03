import { createContext, useContext } from 'react'

/** What a card in a selectable grid says about itself: whether it is selected, and where it sits. */
export interface GridCard {
  selected: boolean
  /** 1-based, among the selectable cards. */
  position: number
  count: number
}

/** Given by a MockupGrid that has a selection; looks a card up by its mockup id. */
export const GridCardContext = createContext<((id: string) => GridCard | null) | null>(null)

/** The card's place in its grid, or null outside a selectable grid (or for a card with no id). */
export function useGridCard(mockupId: string | undefined): GridCard | null {
  const lookup = useContext(GridCardContext)
  return lookup && mockupId !== undefined ? lookup(mockupId) : null
}
