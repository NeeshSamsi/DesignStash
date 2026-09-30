import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog'
import { CONFIRM_DIALOG_CONTRACT } from './ConfirmDialog.types'

describe('ConfirmDialog', () => {
  it.each(variantMatrix(CONFIRM_DIALOG_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ConfirmDialog {...(props as ConfirmDialogProps)} />)
    expect(baseElement.querySelector('[data-ds="ConfirmDialog"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<ConfirmDialog />)
    for (const text of Object.values<string>(CONFIRM_DIALOG_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
