import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { DropHint, type DropHintProps } from './DropHint'
import { DROP_HINT_CONTRACT } from './DropHint.types'

describe('DropHint', () => {
  it.each(variantMatrix(DROP_HINT_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<DropHint {...(props as DropHintProps)} />)
    expect(baseElement.querySelector('[data-ds="DropHint"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<DropHint />)
    for (const text of Object.values<string>(DROP_HINT_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
