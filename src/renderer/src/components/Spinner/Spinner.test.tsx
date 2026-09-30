import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Spinner, type SpinnerProps } from './Spinner'
import { SPINNER_CONTRACT } from './Spinner.types'

describe('Spinner', () => {
  it.each(variantMatrix(SPINNER_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Spinner {...(props as SpinnerProps)} />)
    expect(baseElement.querySelector('[data-ds="Spinner"]')).not.toBeNull()
  })
})
