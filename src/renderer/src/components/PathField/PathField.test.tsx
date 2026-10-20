import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { PathField, type PathFieldProps } from './PathField'
import { PATH_FIELD_CONTRACT } from './PathField.types'

describe('PathField', () => {
  it.each(variantMatrix(PATH_FIELD_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<PathField {...(props as PathFieldProps)} />)
    expect(baseElement.querySelector('[data-ds="PathField"]')).not.toBeNull()
  })

  it('shows the friendly path, its location and Choose…', () => {
    const onChoose = vi.fn()
    render(<PathField onChoose={onChoose} />)
    expect(screen.getByText('~/Pictures/DesignStash')).not.toBeNull()
    expect(screen.getByText('Macintosh HD › Users › you › Pictures')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Choose…' }))
    expect(onChoose).toHaveBeenCalledOnce()
  })

  it('is busy while checking: Checking… and no second pick', () => {
    const onChoose = vi.fn()
    render(<PathField state="busy" onChoose={onChoose} />)
    const button = screen.getByRole('button', { name: /Checking…/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText('Checking the folder…')).not.toBeNull()
  })

  it('explains a folder it cannot use, and an existing stash', () => {
    const { container, rerender } = render(<PathField state="not-writable" />)
    expect(screen.getByRole('alert').textContent).toContain(
      'We can’t stash anything in this folder'
    )
    expect(container.querySelector('.border-error')).not.toBeNull()
    rerender(<PathField state="existing-library" />)
    expect(screen.getByText('There’s already a stash in here (128 mockups).')).not.toBeNull()
    expect(container.querySelector('.border-warning')).not.toBeNull()
  })
})
