import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ListRow, type ListRowProps } from './ListRow'
import { LIST_ROW_CONTRACT } from './ListRow.types'

describe('ListRow', () => {
  it.each(variantMatrix(LIST_ROW_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ListRow {...(props as ListRowProps)} />)
    expect(baseElement.querySelector('[data-ds="ListRow"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<ListRow />)
    for (const text of Object.values<string>(LIST_ROW_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
