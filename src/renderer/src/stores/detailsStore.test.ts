import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDetailsStore } from './detailsStore'

const store = () => useDetailsStore.getState()

beforeEach(() => {
  store().closePile()
  store().syncTarget(null)
  store().keepEditing()
  store().setClearSelection(null)
})

describe('detailsStore', () => {
  it('follows the selection: a mockup opens the sidebar, none closes it', () => {
    store().syncTarget(4)
    expect(store().target).toEqual({ id: 4, edit: false })
    store().syncTarget(null)
    expect(store().target).toBeNull()
  })

  it('keeps editing when the selection reports the same mockup again', () => {
    store().syncTarget(4)
    store().setEditing(true)
    store().syncTarget(4)
    expect(store().target).toEqual({ id: 4, edit: true })
  })

  it('opens as fields when edit was asked for before the selection arrived', () => {
    store().requestEdit(7)
    store().syncTarget(7)
    expect(store().target).toEqual({ id: 7, edit: true })
    store().syncTarget(8)
    expect(store().target).toEqual({ id: 8, edit: false })
  })

  it('switches to fields at once when the mockup is already showing', () => {
    store().syncTarget(7)
    store().requestEdit(7)
    expect(store().target).toEqual({ id: 7, edit: true })
  })

  it('leaving with unsaved edits asks first; Keep editing drops the ask and leaves nothing done', () => {
    const leave = vi.fn()
    store().syncTarget(1)
    store().setEditing(true)
    store().setDirty(true)
    store().guard(leave)
    expect(leave).not.toHaveBeenCalled()
    expect(store().ask).not.toBeNull()
    store().keepEditing()
    expect(store().ask).toBeNull()
    expect(leave).not.toHaveBeenCalled()
    expect(store().target?.id).toBe(1)
  })

  it('Discard runs the leave and forgets the edits', () => {
    const leave = vi.fn()
    store().syncTarget(1)
    store().setDirty(true)
    store().guard(leave)
    store().confirmDiscard()
    expect(leave).toHaveBeenCalledOnce()
    expect(store().dirty).toBe(false)
    expect(store().ask).toBeNull()
  })

  it('leaves at once when nothing changed', () => {
    const leave = vi.fn()
    store().guard(leave)
    expect(leave).toHaveBeenCalledOnce()
  })

  it('close clears the page selection and the sidebar, after the ask when dirty', () => {
    const clear = vi.fn()
    store().setClearSelection(clear)
    store().syncTarget(2)
    store().setDirty(true)
    store().close()
    expect(clear).not.toHaveBeenCalled()
    expect(store().target?.id).toBe(2)
    store().confirmDiscard()
    expect(clear).toHaveBeenCalledOnce()
    expect(store().target).toBeNull()
  })

  it('closing the pile page drops the sidebar with it', () => {
    store().openPile({ id: 3, title: 'Clay', count: 4, select: 3, edit: false })
    store().syncTarget(3)
    store().closePile()
    expect(store().pile).toBeNull()
    expect(store().target).toBeNull()
  })

  it('keeps the pile page title in step with edits', () => {
    store().openPile({ id: 3, title: 'Clay', count: 4, select: 3, edit: false })
    store().updatePile({ title: 'Clay phone' })
    expect(store().pile).toEqual({ id: 3, title: 'Clay phone', count: 4, select: 3, edit: false })
  })
})
