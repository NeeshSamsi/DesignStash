import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Modal, type ModalProps } from './Modal'
import { MODAL_CONTRACT } from './Modal.types'

describe('Modal', () => {
  it.each(variantMatrix(MODAL_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Modal {...(props as ModalProps)} />)
    expect(baseElement.querySelector('[data-ds="Modal"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Modal />)
    for (const text of Object.values<string>(MODAL_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
