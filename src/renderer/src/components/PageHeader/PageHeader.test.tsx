import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { PageHeader, type PageHeaderProps } from './PageHeader'
import { PAGE_HEADER_CONTRACT } from './PageHeader.types'

describe('PageHeader', () => {
  it.each(variantMatrix(PAGE_HEADER_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<PageHeader {...(props as PageHeaderProps)} />)
    expect(baseElement.querySelector('[data-ds="PageHeader"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<PageHeader />)
    for (const text of Object.values<string>(PAGE_HEADER_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})

describe('PageHeader behaviour', () => {
  it('shows the description at zero items', () => {
    render(<PageHeader description="0 mockups" />)
    expect(screen.getByText('0 mockups')).not.toBeNull()
  })

  it('renders actions only when given', () => {
    const { rerender } = render(<PageHeader actions />)
    expect(screen.queryByRole('button')).toBeNull()
    rerender(
      <PageHeader actions>
        <button type="button">Empty Trash</button>
      </PageHeader>
    )
    expect(screen.getByRole('button', { name: 'Empty Trash' })).not.toBeNull()
  })

  it('section has no breadcrumb', () => {
    render(<PageHeader variant="section" />)
    expect(screen.queryByText('My Stash')).toBeNull()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Starred')
  })

  it('wraps the actions below the title before cutting the title', () => {
    render(
      <PageHeader current="A pile" breadcrumb parent="My Stash" description="x">
        <button>Edit</button>
      </PageHeader>
    )
    const row = document.querySelector('[data-ds="PageHeader"] > div')!
    expect(row.className).toContain('flex-wrap')
  })

  it('cuts the parent crumb before the current one, and reads as a link on hover', () => {
    render(
      <PageHeader
        current="A pile"
        breadcrumb
        parent="My Stash"
        description="x"
        onParent={() => {}}
      />
    )
    const parent = screen.getByRole('button', { name: 'My Stash' })
    expect(parent.className).toContain('shrink-3')
    expect(parent.className).toContain('hover:underline')
  })
})
