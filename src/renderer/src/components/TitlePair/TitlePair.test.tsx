import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { TitlePair, type TitlePairProps } from './TitlePair'
import { TITLE_PAIR_CONTRACT } from './TitlePair.types'

describe('TitlePair', () => {
  it.each(variantMatrix(TITLE_PAIR_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<TitlePair {...(props as TitlePairProps)} />)
    expect(baseElement.querySelector('[data-ds="TitlePair"]')).not.toBeNull()
  })
})
