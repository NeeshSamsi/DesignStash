import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ImportProgressCard, type ImportProgressCardProps } from './ImportProgressCard'
import { IMPORT_PROGRESS_CARD_CONTRACT } from './ImportProgressCard.types'

describe('ImportProgressCard', () => {
  it.each(variantMatrix(IMPORT_PROGRESS_CARD_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ImportProgressCard {...(props as ImportProgressCardProps)} />)
    expect(baseElement.querySelector('[data-ds="ImportProgressCard"]')).not.toBeNull()
  })
})
