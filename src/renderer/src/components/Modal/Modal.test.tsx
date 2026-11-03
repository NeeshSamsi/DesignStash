import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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

  it('closes on Esc and from the close button', () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('blocking ignores Esc and has no close button', () => {
    const onClose = vi.fn()
    render(<Modal open blocking onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('closable off removes the close button', () => {
    render(<Modal open closable={false} />)
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('a live modal shows its body and footer, not the catalog placeholders', () => {
    render(<Modal open body={<p>Real body</p>} footerContent={<p>Real footer</p>} />)
    expect(screen.getByText('Real body')).toBeTruthy()
    expect(screen.getByText('Real footer')).toBeTruthy()
    expect(screen.queryByText('Swap in content')).toBeNull()
    expect(screen.queryByText('Open in Photoshop')).toBeNull()
  })

  it('a live modal without a footer renders none', () => {
    render(<Modal open />)
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('names the dialog from its title', () => {
    render(<Modal open title="Skipped files" />)
    expect(screen.getByRole('dialog', { name: 'Skipped files' })).toBeTruthy()
  })
})
