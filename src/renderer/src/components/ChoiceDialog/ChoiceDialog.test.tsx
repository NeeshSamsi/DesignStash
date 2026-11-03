import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ChoiceDialog, type ChoiceDialogProps } from './ChoiceDialog'
import { CHOICE_DIALOG_CONTRACT } from './ChoiceDialog.types'

describe('ChoiceDialog', () => {
  it.each(variantMatrix(CHOICE_DIALOG_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ChoiceDialog {...(props as ChoiceDialogProps)} />)
    expect(baseElement.querySelector('[data-ds="ChoiceDialog"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<ChoiceDialog />)
    for (const text of Object.values<string>(CHOICE_DIALOG_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
