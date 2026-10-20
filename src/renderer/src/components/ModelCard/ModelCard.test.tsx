import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ModelCard, type ModelCardProps } from './ModelCard'
import { MODEL_CARD_CONTRACT } from './ModelCard.types'

const names = () => screen.getAllByRole('button').map((b) => b.textContent)

describe('ModelCard', () => {
  it.each(variantMatrix(MODEL_CARD_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ModelCard {...(props as ModelCardProps)} />)
    expect(baseElement.querySelector('[data-ds="ModelCard"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<ModelCard />)
    for (const text of Object.values<string>(MODEL_CARD_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('in use: orange border, In use tag and Delete only', () => {
    const onDelete = vi.fn()
    const { container } = render(<ModelCard state="in-use" onDelete={onDelete} />)
    expect(container.querySelector('[data-ds="ModelCard"]')?.className).toContain('border-primary')
    expect(screen.getByText('In use')).not.toBeNull()
    expect(names()).toEqual(['Delete'])
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('downloaded: Delete and Use this model', () => {
    const onUse = vi.fn()
    render(<ModelCard state="downloaded" onUse={onUse} />)
    expect(names()).toEqual(['Delete', 'Use this model'])
    fireEvent.click(screen.getByRole('button', { name: 'Use this model' }))
    expect(onUse).toHaveBeenCalledOnce()
    expect(screen.queryByText('In use')).toBeNull()
  })

  it('available: Download, with the download size', () => {
    const onDownload = vi.fn()
    render(<ModelCard state="available" size="4.6 GB" onDownload={onDownload} />)
    expect(names()).toEqual(['Download'])
    expect(screen.getByText('4.6 GB')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(onDownload).toHaveBeenCalledOnce()
  })

  it('downloading: progress, speed and time left in the footer, and Cancel', () => {
    const onCancel = vi.fn()
    const { container } = render(<ModelCard state="downloading" onCancel={onCancel} />)
    expect(screen.getByText('Downloading 42% · 18 MB/s · about 3 min left')).not.toBeNull()
    expect(container.querySelector('[data-ds="Progress"]')).not.toBeNull()
    expect(names()).toEqual(['Cancel'])
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('downloading leaves out a speed or time it does not know', () => {
    render(<ModelCard state="downloading" percent={7} rate="" remaining="" />)
    expect(screen.getByText('Downloading 7%')).not.toBeNull()
  })

  it('failed: says why in plain words and offers Try again', () => {
    const onRetry = vi.fn()
    render(<ModelCard state="failed" onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toBe(
      'The download stopped. Check your connection, then try again.'
    )
    expect(names()).toEqual(['Try again'])
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows Best fit beside the name, and quality and speed as five steps', () => {
    render(<ModelCard state="available" bestFit quality={5} speed={2} />)
    expect(screen.getByText('Best fit for this Mac')).not.toBeNull()
    expect(screen.getByRole('img', { name: 'quality 5 of 5' }).children).toHaveLength(5)
    expect(
      screen.getByRole('img', { name: 'speed 2 of 5' }).querySelectorAll('.bg-input')
    ).toHaveLength(2)
  })

  it('never makes the card itself clickable', () => {
    const { container } = render(<ModelCard state="downloaded" />)
    const card = container.querySelector('[data-ds="ModelCard"]')!
    expect(card.getAttribute('role')).toBeNull()
    expect(card.getAttribute('tabindex')).toBeNull()
  })
})
