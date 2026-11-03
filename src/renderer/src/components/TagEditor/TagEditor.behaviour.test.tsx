import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ApprovalTag } from '@shared/approval'
import { TagEditor, type TagEditorProps } from './TagEditor'
import { SAMPLE_SUGGESTIONS, SAMPLE_TAGS } from './TagEditor.samples'

// Behaviour of the inline-add tags field — design/specs/tags.md.

interface HarnessProps extends Partial<TagEditorProps> {
  onTagsSpy?: (tags: ApprovalTag[]) => void
}

/** Holds the tags and suggestions the way a screen would. */
function Harness({ onTagsSpy, ...props }: HarnessProps) {
  const [tags, setTags] = useState(SAMPLE_TAGS)
  const [suggestions, setSuggestions] = useState(SAMPLE_SUGGESTIONS)
  return (
    <TagEditor
      tags={tags}
      onTagsChange={(next) => {
        setTags(next)
        onTagsSpy?.(next)
      }}
      suggestions={suggestions}
      onSuggestionsChange={setSuggestions}
      {...props}
    />
  )
}

const yourTags = () =>
  [...document.querySelectorAll<HTMLElement>('[data-tag^="tag-"]')].map((el) => el.textContent)
const suggestionLabels = () =>
  [...document.querySelectorAll<HTMLElement>('[data-tag^="suggestion-"]')].map(
    (el) => el.textContent
  )
const addChip = () => screen.getByRole('button', { name: 'Add tag' })
const openInput = () => {
  fireEvent.click(addChip())
  return screen.getByRole('textbox', { name: 'New tag' })
}
const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } })
/** The popover is portalled, and chips elsewhere repeat the category names. */
const popover = () => within(document.querySelector('[data-slot="popover-content"]') as HTMLElement)
const key = (el: HTMLElement, name: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(el, { key: name, ...init })

/** The web tsconfig doesn't type Node's `process`; vitest runs in Node, so it is there. */
const nodeProcess = (
  globalThis as unknown as {
    process: {
      on: (event: 'unhandledRejection', fn: (reason: unknown) => void) => void
      off: (event: 'unhandledRejection', fn: (reason: unknown) => void) => void
    }
  }
).process

describe('TagEditor · inline add', () => {
  it('renders the add chip first, then your tags, then a divider and AI suggestions', () => {
    render(<Harness />)
    const row = screen.getByRole('group', { name: 'Tags' })
    const children = [...row.children] as HTMLElement[]
    expect(children[0]).toBe(addChip())
    expect(yourTags()).toEqual(['DeviceiPhone 15 Pro', 'StyleClay', 'SceneStudio'])
    const divider = children.find((el) => el.getAttribute('aria-hidden') && !el.dataset.ds)
    expect(divider).toBeDefined()
    expect(children.indexOf(divider!)).toBeGreaterThan(
      children.findIndex((el) => el.dataset.tag === 'tag-3')
    )
    expect(suggestionLabels()).toEqual(['ColourBeige', 'MoodWarm'])
  })

  it('turns the add chip into the input in place on click or Enter', () => {
    render(<Harness />)
    fireEvent.keyDown(addChip(), { key: 'Enter' })
    const input = screen.getByRole('textbox', { name: 'New tag' })
    expect(document.activeElement).toBe(input)
    expect(screen.queryByRole('button', { name: 'Add tag' })).toBeNull()
    const row = screen.getByRole('group', { name: 'Tags' })
    expect(row.firstElementChild?.contains(input)).toBe(true)
  })

  it('shows matching tags grouped by category with use counts while typing', () => {
    render(<Harness />)
    type(openInput(), 'be')
    const list = popover()
    expect(list.getByText('Colour')).toBeTruthy()
    expect(list.getByText('Scene')).toBeTruthy()
    const beige = list.getByText('Beige')
    expect(within(beige.closest('[cmdk-item]') as HTMLElement).getByText('12')).toBeTruthy()
    expect(list.getByText('Beach')).toBeTruthy()
    expect(list.getByText('↵ add · esc cancel')).toBeTruthy()
  })

  it('appends an added tag at the end, marks it "new", and keeps the input open', () => {
    const spy = vi.fn()
    render(<Harness onTagsSpy={spy} />)
    const input = openInput()
    type(input, 'bone')
    key(input, 'Enter')
    expect(yourTags()).toEqual(['DeviceiPhone 15 Pro', 'StyleClay', 'SceneStudio', 'ColourBone'])
    expect(document.querySelector('[data-tag="tag-6"]')?.getAttribute('data-variant')).toBe('new')
    expect(spy).toHaveBeenCalledTimes(1)
    const open = screen.getByRole('textbox', { name: 'New tag' }) as HTMLInputElement
    expect(open.value).toBe('')
  })

  it('fades "new" back to a plain tag after about two seconds', () => {
    vi.useFakeTimers()
    try {
      render(<Harness />)
      const input = openInput()
      type(input, 'bone')
      key(input, 'Enter')
      expect(document.querySelector('[data-tag="tag-6"]')?.getAttribute('data-variant')).toBe('new')
      act(() => {
        vi.advanceTimersByTime(2100)
      })
      expect(document.querySelector('[data-tag="tag-6"]')?.getAttribute('data-variant')).toBe(
        'removable'
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops an AI suggestion once the same tag is added', () => {
    render(<Harness />)
    expect(suggestionLabels()).toContain('ColourBeige')
    const input = openInput()
    type(input, 'beige')
    key(input, 'Enter')
    expect(yourTags()).toContain('ColourBeige')
    expect(suggestionLabels()).toEqual(['MoodWarm'])
  })

  it('offers to create an unknown tag inline, with the categories in the same popover', async () => {
    const onCreateTag = vi.fn(async (request) => ({
      tagId: 99,
      label: request.label,
      categoryId: request.categoryId ?? 0,
      categoryLabel: request.categoryLabel
    }))
    render(<Harness onCreateTag={onCreateTag} />)
    const input = openInput()
    type(input, 'terracotta')
    const list = popover()
    expect(list.getByText('No “terracotta” tag yet. Add it to…')).toBeTruthy()
    for (const name of ['Colour', 'Scene', 'Style', 'Device', 'New category…']) {
      expect(list.getByText(name)).toBeTruthy()
    }
    expect(list.getByText('↵ adds to Colour')).toBeTruthy()
    fireEvent.click(list.getByText('Style'))
    await waitFor(() => expect(yourTags()).toContain('Styleterracotta'))
    expect(onCreateTag).toHaveBeenCalledWith({
      label: 'terracotta',
      categoryId: 2,
      categoryLabel: 'Style'
    })
  })

  it('keeps the input, the typed text and the popover when creating a tag fails', async () => {
    const onCreateTag = vi.fn().mockRejectedValue(new Error('offline'))
    const unhandled = vi.fn()
    nodeProcess.on('unhandledRejection', unhandled)
    try {
      render(<Harness onCreateTag={onCreateTag} />)
      const input = openInput()
      type(input, 'terracotta')
      key(input, 'Enter')
      await waitFor(() => expect(onCreateTag).toHaveBeenCalledTimes(1))
      await act(async () => {
        await Promise.resolve()
      })
      expect(unhandled).not.toHaveBeenCalled()
      expect(yourTags()).toHaveLength(3)
      const open = screen.getByRole('textbox', { name: 'New tag' }) as HTMLInputElement
      expect(open.value).toBe('terracotta')
      expect(popover().getByText('No “terracotta” tag yet. Add it to…')).toBeTruthy()
    } finally {
      nodeProcess.off('unhandledRejection', unhandled)
    }
  })

  it('marks the input invalid and highlights the existing chip for a duplicate tag', () => {
    const spy = vi.fn()
    render(<Harness onTagsSpy={spy} />)
    const input = openInput()
    type(input, 'clay')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(document.querySelector('[data-tag="tag-2"]')?.hasAttribute('data-highlighted')).toBe(
      true
    )
    expect(screen.getByText('Already tagged: Style · Clay')).toBeTruthy()
    key(input, 'Enter')
    expect(spy).not.toHaveBeenCalled()
    expect(yourTags()).toHaveLength(3)
  })

  it('accepts a suggestion on click or ✓ and moves it to the end of your tags', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Colour Beige' }))
    expect(yourTags()).toEqual(['DeviceiPhone 15 Pro', 'StyleClay', 'SceneStudio', 'ColourBeige'])
    expect(document.querySelector('[data-tag="tag-4"]')?.getAttribute('data-variant')).toBe('new')
    expect(suggestionLabels()).toEqual(['MoodWarm'])
  })

  it('dismisses a suggestion for this mockup only', () => {
    const spy = vi.fn()
    render(<Harness onTagsSpy={spy} />)
    const warm = screen.getByRole('button', { name: 'Add Mood Warm' })
    fireEvent.click(warm.querySelector('[data-slot="dismiss"]') as HTMLElement)
    expect(suggestionLabels()).toEqual(['ColourBeige'])
    expect(yourTags()).toHaveLength(3)
    expect(spy).not.toHaveBeenCalled()
  })

  it('removes a tag from its hover ×, undoable with ⌘Z', () => {
    const { container } = render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Clay' }))
    expect(yourTags()).toEqual(['DeviceiPhone 15 Pro', 'SceneStudio'])
    key(container.firstElementChild as HTMLElement, 'z', { metaKey: true })
    expect(yourTags()).toEqual(['DeviceiPhone 15 Pro', 'StyleClay', 'SceneStudio'])
  })

  it('marks the last tag on ⌫ in an empty input and removes it on a second ⌫', () => {
    render(<Harness />)
    const input = openInput()
    key(input, 'Backspace')
    expect(document.querySelector('[data-tag="tag-3"]')?.getAttribute('data-state')).toBe('marked')
    expect(screen.getByText('⌫ again removes it · Esc keeps it')).toBeTruthy()
    key(input, 'Backspace')
    expect(yourTags()).toEqual(['DeviceiPhone 15 Pro', 'StyleClay'])
  })

  it('clears the mark on Esc and moves it with the arrow keys', () => {
    render(<Harness />)
    const input = openInput()
    key(input, 'Backspace')
    key(input, 'ArrowLeft')
    expect(document.querySelector('[data-tag="tag-2"]')?.getAttribute('data-state')).toBe('marked')
    key(input, 'Escape')
    expect(document.querySelector('[data-state="marked"]')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'New tag' })).toBe(input)
  })

  it('adds every match from a pasted comma list and asks about new names one at a time', async () => {
    const onCreateTag = vi.fn()
    render(<Harness onCreateTag={onCreateTag} />)
    const input = openInput()
    fireEvent.paste(input, { clipboardData: { getData: () => 'Bone, Beach, terracotta, linen' } })
    expect(yourTags()).toEqual([
      'DeviceiPhone 15 Pro',
      'StyleClay',
      'SceneStudio',
      'ColourBone',
      'SceneBeach'
    ])
    expect(screen.getByText('No “terracotta” tag yet. Add it to…')).toBeTruthy()
    fireEvent.click(screen.getByText('Skip it'))
    expect(screen.getByText('No “linen” tag yet. Add it to…')).toBeTruthy()
    fireEvent.click(screen.getByText('Skip it'))
    expect(screen.queryByText(/tag yet/)).toBeNull()
    expect(onCreateTag).not.toHaveBeenCalled()
  })

  it('closes back into the add chip on Esc or blur, dropping typed text', () => {
    render(<Harness />)
    let input = openInput()
    type(input, 'bei')
    key(input, 'Escape')
    expect(screen.queryByRole('textbox', { name: 'New tag' })).toBeNull()
    expect(document.activeElement).toBe(addChip())
    expect(yourTags()).toHaveLength(3)

    input = openInput()
    type(input, 'bei')
    fireEvent.blur(input)
    expect(screen.queryByRole('textbox', { name: 'New tag' })).toBeNull()
    fireEvent.click(addChip())
    expect((screen.getByRole('textbox', { name: 'New tag' }) as HTMLInputElement).value).toBe('')
  })

  it('shows the empty and AI-thinking states with the add chip still usable', () => {
    const { unmount } = render(<TagEditor tags={[]} suggestions={[]} />)
    expect(screen.getByText('Tags help you find this mockup later.')).toBeTruthy()
    expect(openInput()).toBeTruthy()
    unmount()

    render(<TagEditor thinking />)
    expect(document.querySelectorAll('[data-state="thinking"]')).toHaveLength(2)
    expect(openInput()).toBeTruthy()
  })

  it('renders read-only as plain tags with no add chip or suggestions', () => {
    render(<TagEditor variant="read-only" />)
    expect(screen.queryByRole('button', { name: 'Add tag' })).toBeNull()
    expect(yourTags()).toHaveLength(3)
    expect(suggestionLabels()).toEqual([])
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull()
  })
})
