import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
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

describe('MockupMetaForm · behaviour', () => {
  it('approval shows the hint, title, description and tags', () => {
    render(<MockupMetaForm />)
    expect(screen.getByLabelText(/Title/)).toBeTruthy()
    expect(screen.getByLabelText('Description')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Tags' })).toBeTruthy()
    expect(screen.getByText(/AI suggested the title/)).toBeTruthy()
  })

  it('detail leaves the title to the modal header and shows no hint', () => {
    render(<MockupMetaForm variant="detail" />)
    expect(screen.queryByLabelText(/Title/)).toBeNull()
    expect(screen.queryByText(/AI suggested the title/)).toBeNull()
    expect(screen.getByLabelText('Description')).toBeTruthy()
  })

  it('reports title and description edits', () => {
    const onTitleChange = vi.fn()
    const onDescriptionChange = vi.fn()
    render(
      <MockupMetaForm
        title="Old"
        description="Words"
        onTitleChange={onTitleChange}
        onDescriptionChange={onDescriptionChange}
      />
    )
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'New' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'More words' } })
    expect(onTitleChange).toHaveBeenCalledWith('New')
    expect(onDescriptionChange).toHaveBeenCalledWith('More words')
  })

  it('says why an empty title is wrong', () => {
    render(<MockupMetaForm state="invalid" />)
    expect(screen.getByText("Title can't be empty.")).toBeTruthy()
    expect(screen.getByLabelText(/Title/).getAttribute('aria-invalid')).toBe('true')
  })

  it('locks the text fields and the tags while saving', () => {
    const { container } = render(<MockupMetaForm state="saving" />)
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).readOnly).toBe(true)
    expect(container.querySelector('[inert]')).not.toBeNull()
  })

  it('shows skeleton fields and shimmering tags while the AI is thinking', () => {
    const { container } = render(<MockupMetaForm state="thinking" />)
    expect(screen.getByText('Sniffing out a title… this one’s still with the AI.')).toBeTruthy()
    expect(screen.queryByLabelText('Description')).toBeNull()
    expect(container.querySelectorAll('[data-ds="TagChip"][data-state="thinking"]')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Add tag' })).toBeTruthy()
  })
})
