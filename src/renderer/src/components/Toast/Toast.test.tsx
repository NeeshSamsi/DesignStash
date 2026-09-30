import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Toast, type ToastProps } from './Toast'
import { TOAST_CONTRACT } from './Toast.types'

describe('Toast', () => {
  it.each(variantMatrix(TOAST_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Toast {...(props as ToastProps)} />)
    expect(baseElement.querySelector('[data-ds="Toast"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Toast />)
    for (const text of Object.values<string>(TOAST_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
