import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { GroupCard, type GroupCardProps } from './GroupCard'
import { GROUP_CARD_CONTRACT } from './GroupCard.types'

describe('GroupCard', () => {
  it.each(variantMatrix(GROUP_CARD_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<GroupCard {...(props as GroupCardProps)} />)
    expect(baseElement.querySelector('[data-ds="GroupCard"]')).not.toBeNull()
  })
})
