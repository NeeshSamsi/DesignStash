import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { DropOverlay, type DropOverlayProps } from './DropOverlay'
import { DROP_OVERLAY_CONTRACT } from './DropOverlay.types'

describe('DropOverlay', () => {
  it.each(variantMatrix(DROP_OVERLAY_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<DropOverlay {...(props as DropOverlayProps)} />)
    expect(baseElement.querySelector('[data-ds="DropOverlay"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<DropOverlay />)
    for (const text of Object.values<string>(DROP_OVERLAY_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})

describe('DropOverlay behaviour', () => {
  it('shows the Figma title and description', () => {
    render(<DropOverlay />)
    expect(screen.getByText('Drop PSDs to add them')).not.toBeNull()
    expect(screen.getByText(/Files or folders both work/)).not.toBeNull()
  })

  it('announces a rejected drop as an alert', () => {
    render(<DropOverlay state="rejected" />)
    expect(screen.getByRole('alert')).not.toBeNull()
  })

  it('sets the title in display/2xl over the window and title/lg when compact', () => {
    const { rerender } = render(<DropOverlay title="Drop to use as cover" />)
    expect(screen.getByText('Drop to use as cover').className).toContain('type-display-2xl-medium')
    rerender(<DropOverlay compact title="Drop to use as cover" />)
    const title = screen.getByText('Drop to use as cover').className
    expect(title).toContain('type-title-lg-semibold')
    expect(title).not.toContain('type-display-2xl-medium')
  })
})
