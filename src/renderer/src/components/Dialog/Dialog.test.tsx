import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Dialog, type DialogProps } from './Dialog'
import { DIALOG_CONTRACT } from './Dialog.types'

describe('Dialog', () => {
  it.each(variantMatrix(DIALOG_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Dialog {...(props as DialogProps)} />)
    expect(baseElement.querySelector('[data-ds="Dialog"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Dialog />)
    for (const text of Object.values<string>(DIALOG_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
