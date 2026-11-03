import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { PathField, type PathFieldProps } from './PathField'
import { PATH_FIELD_CONTRACT } from './PathField.types'

describe('PathField', () => {
  it.each(variantMatrix(PATH_FIELD_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<PathField {...(props as PathFieldProps)} />)
    expect(baseElement.querySelector('[data-ds="PathField"]')).not.toBeNull()
  })
})
