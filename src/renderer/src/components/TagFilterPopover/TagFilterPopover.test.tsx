import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { TagFilterPopover, type TagFilterPopoverProps } from './TagFilterPopover'
import { TAG_FILTER_POPOVER_CONTRACT } from './TagFilterPopover.types'

describe('TagFilterPopover', () => {
  it.each(variantMatrix(TAG_FILTER_POPOVER_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<TagFilterPopover {...(props as TagFilterPopoverProps)} />)
    expect(baseElement.querySelector('[data-ds="TagFilterPopover"]')).not.toBeNull()
  })
})
