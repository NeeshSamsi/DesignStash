import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { TagChip, type TagChipProps } from './TagChip'
import { TAG_CHIP_CONTRACT } from './TagChip.types'

describe('TagChip', () => {
  it.each(variantMatrix(TAG_CHIP_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<TagChip {...(props as TagChipProps)} />)
    expect(baseElement.querySelector('[data-ds="TagChip"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<TagChip />)
    for (const text of Object.values<string>(TAG_CHIP_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
