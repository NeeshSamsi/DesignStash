import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ListGroup, type ListGroupProps } from './ListGroup'
import { LIST_GROUP_CONTRACT } from './ListGroup.types'

describe('ListGroup', () => {
  it.each(variantMatrix(LIST_GROUP_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ListGroup {...(props as ListGroupProps)} />)
    expect(baseElement.querySelector('[data-ds="ListGroup"]')).not.toBeNull()
  })
})
