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
  it('approval shows the title, description and tags, with no resting hint', () => {
    const { container } = render(<MockupMetaForm />)
    expect(screen.getByLabelText(/Title/)).toBeTruthy()
    expect(screen.getByLabelText('Description')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Tags' })).toBeTruthy()
    expect(screen.queryByText(/AI suggested the title/)).toBeNull()
    expect(
      container.querySelector('[data-ds="MockupMetaForm"]')!.firstElementChild!.textContent
    ).toMatch(/^Title/)
  })

  it('detail leaves the title to the modal header', () => {
    render(<MockupMetaForm variant="detail" />)
    expect(screen.queryByLabelText(/Title/)).toBeNull()
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

  it('writing: every field says “Writing with AI…” and stays a real field', () => {
    const { container } = render(
      <MockupMetaForm state="writing" title="phone_side" onTitleChange={() => {}} />
    )
    const title = screen.getByLabelText(/Title/) as HTMLInputElement
    const description = screen.getByLabelText('Description') as HTMLTextAreaElement
    for (const field of [title, description]) {
      expect(field.value).toBe('')
      expect(field.getAttribute('placeholder')).toBe('Writing with AI…')
      expect(field.readOnly).toBe(false)
    }
    expect(container.querySelectorAll('[data-ds="TagChip"][data-state="thinking"]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Add tag' })).toBeTruthy()
  })

  it('writes only the fields still listed, so a field someone typed in is theirs', () => {
    const { container } = render(
      <MockupMetaForm
        state="writing"
        writingFields={['description', 'tags']}
        title="Side"
        onTitleChange={() => {}}
      />
    )
    expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe('Side')
    expect(screen.getByLabelText('Description').getAttribute('placeholder')).toBe(
      'Writing with AI…'
    )
    expect(container.querySelectorAll('[data-state="thinking"]')).toHaveLength(1)
  })

  it('thinking is superseded by writing and draws the same', () => {
    render(<MockupMetaForm state="thinking" />)
    expect(screen.queryByText(/Sniffing out a title/)).toBeNull()
    expect(screen.getByLabelText('Description').getAttribute('placeholder')).toBe(
      'Writing with AI…'
    )
  })

  it('tints a description the AI just filled', () => {
    render(<MockupMetaForm descriptionFilled />)
    expect(screen.getByLabelText('Description').getAttribute('data-state')).toBe('ai-filled')
  })
})
