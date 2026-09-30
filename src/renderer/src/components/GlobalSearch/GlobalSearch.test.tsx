import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { GlobalSearch, type GlobalSearchProps } from './GlobalSearch'
import { GLOBAL_SEARCH_CONTRACT } from './GlobalSearch.types'

describe('GlobalSearch', () => {
  it.each(variantMatrix(GLOBAL_SEARCH_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<GlobalSearch {...(props as GlobalSearchProps)} />)
    expect(baseElement.querySelector('[data-ds="GlobalSearch"]')).not.toBeNull()
  })
})
