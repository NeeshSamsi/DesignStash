import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { TagTree as TagTreeData } from '@shared/tags'
import { TagTree, type TagTreeProps } from './TagTree'
import { SAMPLE_TREE } from './TagTree.samples'

// Behaviour of Settings › Tags — design/specs/settings.md (Tags).

/** Holds the tree the way the Settings pane would. Handlers in `props` win. */
function Harness(props: Partial<TagTreeProps>) {
  const [tree, setTree] = useState<TagTreeData>(SAMPLE_TREE)
  const [nextId, setNextId] = useState(100)
  const edit = (fn: (tree: TagTreeData) => TagTreeData) =>
    setTree((current) => fn(current).map((c) => ({ ...c, tagCount: c.tags.length })))
  return (
    <TagTree
      tree={tree}
      onAddTag={(categoryId, label) => {
        setNextId((n) => n + 1)
        edit((t) =>
          t.map((c) =>
            c.categoryId === categoryId
              ? { ...c, tags: [...c.tags, { tagId: nextId, label, usageCount: 0 }] }
              : c
          )
        )
      }}
      onMoveTag={(tagId, categoryId) => {
        const moved = tree.flatMap((c) => c.tags).find((t) => t.tagId === tagId)
        if (!moved) return
        edit((t) =>
          t.map((c) => ({
            ...c,
            tags:
              c.categoryId === categoryId
                ? [...c.tags.filter((x) => x.tagId !== tagId), moved]
                : c.tags.filter((x) => x.tagId !== tagId)
          }))
        )
      }}
      onRenameTag={(tagId, label) =>
        edit((t) =>
          t.map((c) => ({
            ...c,
            tags: c.tags.map((x) => (x.tagId === tagId ? { ...x, label } : x))
          }))
        )
      }
      onDeleteTag={(tag) =>
        edit((t) => t.map((c) => ({ ...c, tags: c.tags.filter((x) => x.tagId !== tag.tagId) })))
      }
      onCreateCategory={(label) =>
        edit((t) => [...t, { categoryId: nextId, categoryLabel: label, tagCount: 0, tags: [] }])
      }
      onRenameCategory={(categoryId, label) =>
        edit((t) =>
          t.map((c) => (c.categoryId === categoryId ? { ...c, categoryLabel: label } : c))
        )
      }
      {...props}
    />
  )
}

const category = (name: string) => screen.getByRole('region', { name })
const tagRow = (label: string) => screen.getByText(label).closest('[data-tag]') as HTMLElement
const labels = (name: string) =>
  [...category(name).querySelectorAll<HTMLElement>('[data-tag]')].map(
    (row) => row.querySelector('span')?.textContent
  )
const key = (el: HTMLElement, name: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(el, { key: name, ...init })
const openAdd = (name: string) => {
  fireEvent.click(within(category(name)).getByRole('button', { name: 'Add tag' }))
  return within(category(name)).getByRole('textbox') as HTMLInputElement
}
const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } })
const openTagMenu = (label: string) => fireEvent.contextMenu(tagRow(label))
const pick = async (name: RegExp | string) =>
  fireEvent.click(await screen.findByRole('menuitem', { name }))

describe('TagTree · layout', () => {
  it('renders one container per category with its name, tag count and ⋯ menu', () => {
    render(<Harness />)
    expect(within(category('Device')).getByRole('heading', { name: 'Device' })).toBeTruthy()
    expect(within(category('Device')).getByText('3 tags')).toBeTruthy()
    expect(within(category('Style')).getByText('2 tags')).toBeTruthy()
    expect(within(category('Style')).getByRole('button', { name: 'Style actions' })).toBeTruthy()
  })

  it('shows each tag row with its use count, such as "24 mockups"', () => {
    render(<Harness />)
    expect(within(tagRow('iPhone 15 Pro')).getByText('24 mockups')).toBeTruthy()
    expect(within(tagRow('Glass')).getByText('7 mockups')).toBeTruthy()
  })

  it('ends every category with its own Add tag row and the list with a dashed New category row', () => {
    const { container } = render(<Harness />)
    for (const name of ['Device', 'Style']) {
      const sections = category(name)
      const last = sections.lastElementChild as HTMLElement
      expect(last.textContent).toBe('Add tag')
    }
    const root = container.firstElementChild as HTMLElement
    const closing = root.lastElementChild as HTMLElement
    expect(closing.textContent).toBe('New category')
    expect(closing.className).toContain('border-dashed')
  })

  it('has no nesting: no chevrons, indents or child rows', () => {
    const { container } = render(<Harness />)
    // Menu triggers (⋯) carry aria-expanded; nothing else on a row expands.
    expect(container.querySelector('[aria-expanded]:not([aria-haspopup])')).toBeNull()
    expect(container.querySelector('[data-slot="tree-branch"]')).toBeNull()
    const rows = container.querySelectorAll('[data-tag]')
    expect(rows).toHaveLength(5)
    for (const row of rows) expect(row.parentElement?.tagName).toBe('SECTION')
  })
})

describe('TagTree · adding a tag', () => {
  it('turns the category Add tag row into an input row in place', () => {
    render(<Harness />)
    const input = openAdd('Device')
    expect(document.activeElement).toBe(input)
    expect(within(category('Device')).queryByRole('button', { name: 'Add tag' })).toBeNull()
    expect(within(category('Style')).getByRole('button', { name: 'Add tag' })).toBeTruthy()
    expect(within(category('Device')).getByText('↵ to save · Esc to cancel')).toBeTruthy()
    expect(input.parentElement?.parentElement).toBe(category('Device'))
  })

  it('adds on Enter and keeps the input open and empty', async () => {
    const onAddTag = vi.fn()
    render(<Harness onAddTag={onAddTag} />)
    const input = openAdd('Device')
    type(input, 'MacBook')
    key(input, 'Enter')
    expect(onAddTag).toHaveBeenCalledWith(1, 'MacBook')
    await act(async () => {
      await Promise.resolve()
    })
    const open = within(category('Device')).getByRole('textbox') as HTMLInputElement
    expect(open.value).toBe('')
    expect(document.activeElement).toBe(open)
  })

  it('outlines the new row for about 2s, then drops the outline', async () => {
    vi.useFakeTimers()
    try {
      render(<Harness />)
      const input = openAdd('Device')
      type(input, 'MacBook')
      await act(async () => {
        key(input, 'Enter')
        await Promise.resolve()
      })
      expect(labels('Device')).toEqual(['iPhone 15 Pro', 'iPhone', 'iPad', 'MacBook'])
      expect(within(category('Device')).getByText('4 tags')).toBeTruthy()
      expect(tagRow('MacBook').hasAttribute('data-fresh')).toBe(true)
      act(() => {
        vi.advanceTimersByTime(2100)
      })
      expect(tagRow('MacBook').hasAttribute('data-fresh')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes the input on Esc or blur and drops typed text', () => {
    render(<Harness />)
    let input = openAdd('Device')
    type(input, 'Mac')
    key(input, 'Escape')
    expect(within(category('Device')).queryByRole('textbox')).toBeNull()
    input = openAdd('Device')
    expect(input.value).toBe('')
    type(input, 'Mac')
    fireEvent.blur(input)
    expect(within(category('Device')).getByRole('button', { name: 'Add tag' })).toBeTruthy()
    expect(labels('Device')).toHaveLength(3)
  })

  it('keeps the input and the typed text when adding fails', async () => {
    const onAddTag = vi.fn().mockRejectedValue(new Error('offline'))
    render(<Harness onAddTag={onAddTag} />)
    const input = openAdd('Device')
    type(input, 'MacBook')
    key(input, 'Enter')
    await waitFor(() => expect(onAddTag).toHaveBeenCalledTimes(1))
    await act(async () => {
      await Promise.resolve()
    })
    const open = within(category('Device')).getByRole('textbox') as HTMLInputElement
    expect(open.value).toBe('MacBook')
    expect(labels('Device')).toHaveLength(3)
  })
})

describe('TagTree · a tag that exists elsewhere', () => {
  it('turns the input red and says which category has it', () => {
    render(<Harness />)
    const input = openAdd('Device')
    type(input, 'clay')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.className).toContain('border-error')
    expect(within(category('Device')).getByText('Already in Style')).toBeTruthy()
    expect(
      within(category('Device')).getByText('“Clay” is already a tag in Style, on 12 mockups.')
    ).toBeTruthy()
  })

  it('offers "Move it to <this category>" and creates nothing twice', () => {
    const onAddTag = vi.fn()
    render(<Harness onAddTag={onAddTag} />)
    type(openAdd('Device'), 'clay')
    expect(screen.getByRole('button', { name: 'Move it to Device' })).toBeTruthy()
    expect(onAddTag).not.toHaveBeenCalled()
  })

  it('moves the existing tag to this category from the button', async () => {
    render(<Harness />)
    type(openAdd('Device'), 'clay')
    const move = screen.getByRole('button', { name: 'Move it to Device' })
    expect(fireEvent.mouseDown(move)).toBe(false)
    fireEvent.click(move)
    await act(async () => {
      await Promise.resolve()
    })
    expect(labels('Device')).toContain('Clay')
    expect(labels('Style')).toEqual(['Glass'])
    expect(tagRow('Clay').hasAttribute('data-fresh')).toBe(true)
  })

  it('does nothing on Enter while the name is a duplicate', () => {
    const onAddTag = vi.fn()
    render(<Harness onAddTag={onAddTag} />)
    const input = openAdd('Device')
    type(input, 'clay')
    key(input, 'Enter')
    type(input, 'IPAD')
    key(input, 'Enter')
    expect(onAddTag).not.toHaveBeenCalled()
    expect(
      within(category('Device')).getByText('“iPad” is already a tag here, on 8 mockups.')
    ).toBeTruthy()
  })
})

describe('TagTree · tag menu', () => {
  it('opens the ⋯ menu on hover or right-click with Rename, Move to, Merge into and Delete', async () => {
    render(<Harness />)
    openTagMenu('iPad')
    const rows = (await screen.findAllByRole('menuitem')).map((r) => r.textContent)
    expect(rows).toEqual(['Rename', 'Move to', 'Merge into…', 'Delete'])
  })

  it('renames a tag inline: Enter saves, Esc cancels', async () => {
    render(<Harness />)
    openTagMenu('iPad')
    await pick('Rename')
    let input = (await screen.findByRole('textbox', { name: 'Rename iPad' })) as HTMLInputElement
    expect(input.value).toBe('iPad')
    expect(screen.getByText('↵ to save · Esc to cancel')).toBeTruthy()
    type(input, 'iPad Pro')
    key(input, 'Enter')
    await act(async () => {
      await Promise.resolve()
    })
    expect(labels('Device')).toEqual(['iPhone 15 Pro', 'iPhone', 'iPad Pro'])

    openTagMenu('iPad Pro')
    await pick('Rename')
    input = (await screen.findByRole('textbox', { name: 'Rename iPad Pro' })) as HTMLInputElement
    type(input, 'Tablet')
    key(input, 'Escape')
    expect(labels('Device')).toEqual(['iPhone 15 Pro', 'iPhone', 'iPad Pro'])
  })

  it('moves a tag to another category from Move to', async () => {
    const onMoveTag = vi.fn()
    render(<Harness onMoveTag={onMoveTag} />)
    openTagMenu('Glass')
    const trigger = await screen.findByRole('menuitem', { name: 'Move to' })
    fireEvent.keyDown(trigger, { key: 'ArrowRight' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Device' }))
    expect(onMoveTag).toHaveBeenCalledWith(5, 1)
  })

  it('hands a merge to the owner with the tag to remove and the tag to keep', async () => {
    const onMergeTag = vi.fn()
    render(<Harness onMergeTag={onMergeTag} />)
    openTagMenu('iPhone')
    const trigger = await screen.findByRole('menuitem', { name: 'Merge into…' })
    fireEvent.keyDown(trigger, { key: 'ArrowRight' })
    expect(screen.queryByRole('menuitem', { name: 'Device · iPhone' })).toBeNull()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Device · iPhone 15 Pro' }))
    expect(onMergeTag).toHaveBeenCalledWith(
      { tagId: 2, label: 'iPhone', usageCount: 9 },
      { tagId: 1, label: 'iPhone 15 Pro', usageCount: 24 }
    )
  })

  it('deletes a tag at once with no confirm and reports it for Undo', async () => {
    const onDeleteTag = vi.fn()
    render(<Harness onDeleteTag={onDeleteTag} />)
    openTagMenu('Glass')
    await pick('Delete')
    expect(onDeleteTag).toHaveBeenCalledWith({ tagId: 5, label: 'Glass', usageCount: 7 })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('TagTree · where the menu opens', () => {
  const anchor = () => document.querySelector<HTMLElement>('[data-menu-anchor]')

  it('a right-click on a tag opens its menu at the pointer, whether or not the ⋯ is showing', async () => {
    render(<Harness />)
    fireEvent.contextMenu(tagRow('iPad'), { clientX: 140, clientY: 260 })
    await screen.findAllByRole('menuitem')
    expect(anchor()?.style.left).toBe('140px')
    expect(anchor()?.style.top).toBe('260px')
    // The row's own button is not what holds the menu open.
    expect(
      screen
        .getByRole('button', { name: 'iPad actions', hidden: true })
        .getAttribute('aria-expanded')
    ).toBe('false')
  })

  it('a right-click on a category header opens its menu at the pointer', async () => {
    render(<Harness />)
    fireEvent.contextMenu(category('Style').querySelector('h3')!, { clientX: 55, clientY: 80 })
    expect((await screen.findAllByRole('menuitem')).map((r) => r.textContent)).toEqual([
      'Rename',
      'Delete category…'
    ])
    expect(anchor()?.style.left).toBe('55px')
    expect(anchor()?.style.top).toBe('80px')
  })

  it('each right-click moves the menu to the new pointer position', async () => {
    render(<Harness />)
    fireEvent.contextMenu(tagRow('iPad'), { clientX: 10, clientY: 20 })
    await screen.findAllByRole('menuitem')
    key(document.activeElement as HTMLElement, 'Escape')
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull())
    fireEvent.contextMenu(tagRow('Glass'), { clientX: 300, clientY: 400 })
    await screen.findAllByRole('menuitem')
    expect(anchor()?.style.left).toBe('300px')
    expect(anchor()?.style.top).toBe('400px')
  })

  it('the ⋯ button opens the same menu from its own place, with no pointer anchor', async () => {
    render(<Harness />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'iPad actions' }), {
      button: 0,
      ctrlKey: false
    })
    const rows = (await screen.findAllByRole('menuitem')).map((r) => r.textContent)
    expect(rows).toEqual(['Rename', 'Move to', 'Merge into…', 'Delete'])
    expect(anchor()).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'iPad actions', hidden: true })
        .getAttribute('aria-expanded')
    ).toBe('true')
  })

  it('the ContextMenu key on a focused row uses the ⋯ button', async () => {
    render(<Harness />)
    key(tagRow('iPad'), 'ContextMenu')
    await screen.findAllByRole('menuitem')
    expect(anchor()).toBeNull()
  })

  it('picking a row from a pointer menu works like the ⋯ menu', async () => {
    const onDeleteTag = vi.fn()
    render(<Harness onDeleteTag={onDeleteTag} />)
    fireEvent.contextMenu(tagRow('Glass'), { clientX: 30, clientY: 40 })
    await pick('Delete')
    expect(onDeleteTag).toHaveBeenCalledWith({ tagId: 5, label: 'Glass', usageCount: 7 })
    await waitFor(() => expect(anchor()).toBeNull())
  })
})

describe('TagTree · categories', () => {
  it('renames a category from its ⋯ menu', async () => {
    render(<Harness />)
    fireEvent.contextMenu(category('Style').querySelector('h3')!)
    await pick('Rename')
    const input = (await screen.findByRole('textbox', { name: 'Rename Style' })) as HTMLInputElement
    type(input, 'Look')
    key(input, 'Enter')
    await act(async () => {
      await Promise.resolve()
    })
    expect(category('Look')).toBeTruthy()
  })

  it('renames a category to a name one of the tags has, since a tag and a category may share it', async () => {
    const onRenameCategory = vi.fn()
    render(<Harness onRenameCategory={onRenameCategory} />)
    fireEvent.contextMenu(category('Style').querySelector('h3')!)
    await pick('Rename')
    const input = (await screen.findByRole('textbox', { name: 'Rename Style' })) as HTMLInputElement
    type(input, 'Clay')
    key(input, 'Enter')
    await act(async () => {
      await Promise.resolve()
    })
    expect(onRenameCategory).toHaveBeenCalledWith(2, 'Clay')
  })

  it('won’t rename a category to another category’s name, whatever its casing', async () => {
    const onRenameCategory = vi.fn()
    render(<Harness onRenameCategory={onRenameCategory} />)
    fireEvent.contextMenu(category('Style').querySelector('h3')!)
    await pick('Rename')
    const input = (await screen.findByRole('textbox', { name: 'Rename Style' })) as HTMLInputElement
    type(input, 'device')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    key(input, 'Enter')
    await act(async () => {
      await Promise.resolve()
    })
    expect(onRenameCategory).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Rename Style' })).toBeTruthy()
  })

  it('hands Delete category to the owner, which asks where the tags go', async () => {
    const onDeleteCategory = vi.fn()
    render(<Harness onDeleteCategory={onDeleteCategory} />)
    fireEvent.contextMenu(category('Style').querySelector('h3')!)
    await pick('Delete category…')
    expect(onDeleteCategory).toHaveBeenCalledTimes(1)
    expect(onDeleteCategory.mock.calls[0]![0].categoryId).toBe(2)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('turns the New category row into a header input: Enter adds, Esc cancels', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'New category' }))
    let input = screen.getByRole('textbox', { name: 'New category' }) as HTMLInputElement
    expect(screen.getByText('↵ to add · Esc to cancel')).toBeTruthy()
    type(input, 'Colour')
    key(input, 'Escape')
    expect(screen.queryByRole('textbox', { name: 'New category' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'New category' }))
    input = screen.getByRole('textbox', { name: 'New category' }) as HTMLInputElement
    expect(input.value).toBe('')
    type(input, 'Colour')
    key(input, 'Enter')
    await act(async () => {
      await Promise.resolve()
    })
    expect(category('Colour')).toBeTruthy()
    expect(within(category('Colour')).getByText('0 tags')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'New category' })).toBeNull()
  })
})

describe('TagTree · empty and loading', () => {
  it('shows one line on where tags come from, and New category, when there are no tags', () => {
    render(<TagTree tree={[]} />)
    expect(
      screen.getByText(/No tags yet\. Tags you add while looking over mockups land here/)
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New category' })).toBeTruthy()
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('shows skeleton containers while loading, never a spinner', () => {
    const { container } = render(<TagTree loading tree={[]} />)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(8)
    expect(container.firstElementChild?.getAttribute('aria-busy')).toBe('true')
    expect(container.querySelector('[data-slot="spinner"], [role="status"]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New category' })).toBeNull()
  })
})
