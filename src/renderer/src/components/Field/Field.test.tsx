import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Field } from './Field'

describe('Field', () => {
  it('labels its one control with a label element', () => {
    render(
      <Field label="Title" htmlFor="title" showDescription={false}>
        <input id="title" />
      </Field>
    )
    expect(screen.getByRole('textbox', { name: /Title/ })).toBeTruthy()
  })

  it('titles a control made of many, which names itself by the title’s id', () => {
    const { container } = render(
      <Field label="Tags" labelId="tags" required={false} showDescription={false}>
        <div role="group" aria-labelledby="tags">
          <button type="button">Add tag</button>
        </div>
      </Field>
    )
    expect(screen.getByRole('group', { name: 'Tags' })).toBeTruthy()
    expect(container.querySelector('label')).toBeNull()
    expect(container.querySelector('[data-ds="Field"]')).not.toBeNull()
  })
})
