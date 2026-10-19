import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { AddMockupCard, type AddMockupCardProps } from './AddMockupCard'
import { ADD_MOCKUP_CARD_CONTRACT } from './AddMockupCard.types'

describe('AddMockupCard', () => {
  it.each(variantMatrix(ADD_MOCKUP_CARD_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<AddMockupCard {...(props as AddMockupCardProps)} />)
    expect(baseElement.querySelector('[data-ds="AddMockupCard"]')).not.toBeNull()
  })
})
