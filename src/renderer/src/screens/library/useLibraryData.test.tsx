/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { IPC_CHANNELS } from '@shared/ipc'
import { useLibraryStore } from '@renderer/stores/libraryStore'
import { useTagTreeStore } from '@renderer/stores/tagTreeStore'
import { item, resetStores, setupApi } from './library-test-utils'
import { useLibraryData } from './useLibraryData'

beforeEach(resetStores)

describe('useLibraryData cache', () => {
  it('shows a view it has already loaded at once, and fetches it again in the background', async () => {
    const api = setupApi([item(1), item(2)])
    const first = renderHook(() => useLibraryData(false))
    expect(first.result.current.loaded).toBe(false)
    await waitFor(() => expect(first.result.current.loaded).toBe(true))
    first.unmount()

    // Back on the page: the answer is slow, but the page is not waiting for it.
    useLibraryStore.setState({ items: [] })
    api.invoke.mockImplementation(() => new Promise(() => {}))
    const again = renderHook(() => useLibraryData(false))
    expect(again.result.current.loaded).toBe(true)
    expect(useLibraryStore.getState().items.map((i) => i.id)).toEqual([1, 2])
    expect(api.calls(IPC_CHANNELS.LIBRARY_LIST)).toHaveLength(2)
  })

  it('keeps each view apart: Starred has not loaded because My Stash has', async () => {
    setupApi([item(1), item(2, { favourite: true })])
    const all = renderHook(() => useLibraryData(false))
    await waitFor(() => expect(all.result.current.loaded).toBe(true))
    all.unmount()
    const starred = renderHook(() => useLibraryData(true))
    expect(starred.result.current.loaded).toBe(false)
    await waitFor(() => expect(starred.result.current.loaded).toBe(true))
    expect(useLibraryStore.getState().items.map((i) => i.id)).toEqual([2])
  })

  it('swaps in the fresh list when the background fetch lands', async () => {
    const api = setupApi([item(1)])
    const first = renderHook(() => useLibraryData(false))
    await waitFor(() => expect(first.result.current.loaded).toBe(true))
    first.unmount()
    api.invoke.mockImplementation(async (channel: string) =>
      channel === IPC_CHANNELS.LIBRARY_LIST
        ? { success: true, data: { items: [item(1), item(3)] } }
        : { success: true, data: { total: 2, favourites: 0, groups: 0, trashed: 0, tree: [] } }
    )
    renderHook(() => useLibraryData(false))
    await waitFor(() => expect(useLibraryStore.getState().items.map((i) => i.id)).toEqual([1, 3]))
  })
})

describe('useLibraryData tag filter', () => {
  const treeOf = (label: string) => ({
    tree: [
      {
        categoryId: 1,
        categoryLabel: 'Device',
        tagCount: 1,
        tags: [{ tagId: 7, label, usageCount: 3 }]
      }
    ]
  })

  it('lists a tag renamed elsewhere (Settings › Tags) under its new name', async () => {
    let tree = treeOf('iPhone')
    setupApi([item(1)], { [IPC_CHANNELS.TAG_TREE]: () => ({ success: true, data: tree }) })
    const { result } = renderHook(() => useLibraryData(false))
    await waitFor(() => expect(result.current.tagCategories[0]?.tags[0]?.label).toBe('iPhone'))

    tree = treeOf('iPhone 15')
    await act(async () => {
      await useTagTreeStore.getState().load()
    })
    expect(result.current.tagCategories[0]?.tags[0]).toEqual({
      tagId: 7,
      label: 'iPhone 15',
      count: 3
    })
  })

  it('applies only the newest answer when two loads overlap', async () => {
    const answers: Array<(value: unknown) => void> = []
    const api = setupApi([])
    api.invoke.mockImplementation(
      (channel: string) =>
        new Promise((resolve) => {
          if (channel === IPC_CHANNELS.TAG_TREE) answers.push(resolve)
          else resolve({ success: true, data: {} })
        })
    )
    const older = useTagTreeStore.getState().load()
    const newer = useTagTreeStore.getState().load()
    answers[1]!({ success: true, data: treeOf('New') })
    answers[0]!({ success: true, data: treeOf('Old') })
    await Promise.all([older, newer])
    expect(useTagTreeStore.getState().tree?.[0]?.tags[0]?.label).toBe('New')
  })
})

describe('skeleton grace period', () => {
  it('holds a loading grid back for 150ms, so a quick answer never flashes it', () => {
    const css = readFileSync('src/renderer/src/styles/loading-grace.css', 'utf8')
    expect(css).toMatch(/\[data-ds='MockupGrid'\]\[data-state='loading'\]/)
    expect(css).toMatch(/animation:\s*ds-loading-grace 1ms linear 150ms backwards/)
  })
})
