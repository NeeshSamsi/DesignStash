import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ListGroup, type ListGroupProps } from './ListGroup'
import { LIST_GROUP_CONTRACT } from './ListGroup.types'

describe('ListGroup', () => {
  it.each(variantMatrix(LIST_GROUP_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ListGroup {...(props as ListGroupProps)} />)
    expect(baseElement.querySelector('[data-ds="ListGroup"]')).not.toBeNull()
  })

  it('shows three or five rows', () => {
    const { container, rerender } = render(<ListGroup rows="3" />)
    expect(container.querySelectorAll('[data-ds="ListRow"]')).toHaveLength(3)
    rerender(<ListGroup rows="5" />)
    expect(container.querySelectorAll('[data-ds="ListRow"]')).toHaveLength(5)
  })

  it('screens override the header and each row through slots', () => {
    render(
      <ListGroup
        rows="3"
        header={<h3>Skipped files</h3>}
        row1={<p>First</p>}
        row2={<p>Second</p>}
      />
    )
    expect(screen.getByText('Skipped files')).toBeTruthy()
    expect(screen.getByText('First')).toBeTruthy()
    expect(screen.getByText('Second')).toBeTruthy()
    expect(screen.queryByText('Strays in your stash folder')).toBeNull()
  })

  it('children replace the sample rows for real, longer lists', () => {
    const { container } = render(
      <ListGroup>
        <p>A</p>
        <p>B</p>
        <p>C</p>
        <p>D</p>
        <p>E</p>
        <p>F</p>
      </ListGroup>
    )
    expect(container.querySelectorAll('[data-ds="ListRow"]')).toHaveLength(0)
    expect(screen.getByText('F')).toBeTruthy()
  })

  it('passes the density to the sample rows', () => {
    const { container } = render(<ListGroup density="compact" />)
    for (const row of container.querySelectorAll('[data-ds="ListRow"]')) {
      expect(row.getAttribute('data-density')).toBe('compact')
    }
  })
})
