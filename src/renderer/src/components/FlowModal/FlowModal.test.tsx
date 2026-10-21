import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { FlowModal, type FlowModalProps } from './FlowModal'
import { FLOW_MODAL_CONTRACT } from './FlowModal.types'

const states = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('li[data-step-state]')).map((li) =>
    li.getAttribute('data-step-state')
  )

describe('FlowModal', () => {
  it.each(variantMatrix(FLOW_MODAL_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<FlowModal {...(props as FlowModalProps)} />)
    expect(baseElement.querySelector('[data-ds="FlowModal"]')).not.toBeNull()
  })

  it('names the three steps, with Sort current and its count', () => {
    const { container } = render(<FlowModal />)
    for (const name of ['Sort into piles', 'Look it over', 'Tucked away']) {
      expect(screen.getByText(name)).not.toBeNull()
    }
    expect(states(container)).toEqual(['current', 'todo', 'todo'])
    expect(screen.getByText('38 mockups')).not.toBeNull()
  })

  it('Look it over: Sort is done (ticked) and the haul count shows', () => {
    const { container } = render(<FlowModal step="look-over" count="5 of 12" />)
    expect(states(container)).toEqual(['done', 'current', 'todo'])
    expect(screen.getByText('5 of 12')).not.toBeNull()
    expect(container.querySelector('li[data-step-state="done"] svg')).not.toBeNull()
  })

  it('shows no badge while there is no count', () => {
    const { container } = render(<FlowModal step="look-over" count="" />)
    expect(states(container)).toEqual(['done', 'current', 'todo'])
    expect(container.querySelector('li[data-step-state="current"] [data-ds="Badge"]')).toBeNull()
  })

  it('fills the Look it over track to the progress, and leaves it empty without one', () => {
    const fillOf = (c: HTMLElement) => c.querySelector<HTMLElement>('span[style]')?.style.width
    expect(fillOf(render(<FlowModal step="look-over" progress={0.5} />).container)).toBe('50%')
    expect(fillOf(render(<FlowModal step="look-over" />).container)).toBe('0%')
  })

  it('lays its body in the padded area', () => {
    render(<FlowModal body={<p>board</p>} />)
    expect(screen.getByText('board')).not.toBeNull()
  })

  it('live, Esc only asks: it never closes itself', () => {
    const onRequestClose = vi.fn()
    render(<FlowModal open onRequestClose={onRequestClose} body={<p>x</p>} />)
    expect(screen.getByRole('dialog')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onRequestClose).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog')).not.toBeNull()
  })
})
