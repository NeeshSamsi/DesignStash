import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { FormDialog, type FormDialogProps } from './FormDialog'
import { FORM_DIALOG_CONTRACT } from './FormDialog.types'

describe('FormDialog', () => {
  it.each(variantMatrix(FORM_DIALOG_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<FormDialog {...(props as FormDialogProps)} />)
    expect(baseElement.querySelector('[data-ds="FormDialog"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<FormDialog />)
    for (const text of Object.values<string>(FORM_DIALOG_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
