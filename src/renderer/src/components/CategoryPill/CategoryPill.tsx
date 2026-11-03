import type { ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'
import { CATEGORY_PILL_DEFAULTS, type CategoryPillContractProps } from './CategoryPill.types'
import { categoryPillVariants } from './CategoryPill.variants'

export interface CategoryPillProps
  extends
    CategoryPillContractProps,
    Omit<ComponentProps<'button'>, keyof CategoryPillContractProps | 'children'> {}

/**
 * CategoryPill — Category filter inside TagFilterPopover: All, then one pill per tag category with how many tags match.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=583-6970
 * A toggle button: `active` is the category shown (aria-pressed). Counts follow the search.
 */
export function CategoryPill({ className, ...rest }: CategoryPillProps) {
  const { active, showCount, label, count, ...props } = { ...CATEGORY_PILL_DEFAULTS, ...rest }
  return (
    <button
      type="button"
      data-ds="CategoryPill"
      data-state={active ? 'active' : 'default'}
      aria-pressed={active}
      className={cn(categoryPillVariants({ active }), className)}
      {...props}
    >
      <span>{label}</span>
      {showCount && <span className="text-tertiary">{count}</span>}
    </button>
  )
}
