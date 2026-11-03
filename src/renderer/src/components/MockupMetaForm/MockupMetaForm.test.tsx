import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { MockupMetaForm, type MockupMetaFormProps } from './MockupMetaForm'
import { MOCKUP_META_FORM_CONTRACT } from './MockupMetaForm.types'

describe('MockupMetaForm', () => {
  it.each(variantMatrix(MOCKUP_META_FORM_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<MockupMetaForm {...(props as MockupMetaFormProps)} />)
    expect(baseElement.querySelector('[data-ds="MockupMetaForm"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<MockupMetaForm />)
    for (const text of Object.values<string>(MOCKUP_META_FORM_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
