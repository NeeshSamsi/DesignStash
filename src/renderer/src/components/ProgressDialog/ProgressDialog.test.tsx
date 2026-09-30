import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ProgressDialog, type ProgressDialogProps } from './ProgressDialog'
import { PROGRESS_DIALOG_CONTRACT } from './ProgressDialog.types'

describe('ProgressDialog', () => {
  it.each(variantMatrix(PROGRESS_DIALOG_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ProgressDialog {...(props as ProgressDialogProps)} />)
    expect(baseElement.querySelector('[data-ds="ProgressDialog"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<ProgressDialog />)
    for (const text of Object.values<string>(PROGRESS_DIALOG_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
