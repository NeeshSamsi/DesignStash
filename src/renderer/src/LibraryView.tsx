// MOCK UI — deliberately raw; every M7 channel exercised
import { useCallback, useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { FEATURE_KEYS } from '@shared/entitlements'
import { useLibraryStore } from './stores/libraryStore'
import Locked from './Locked'

interface Props {
  onBack: () => void
}

export default function LibraryView({ onBack }: Props) {
  const store = useLibraryStore()

  // Selective subscriptions for reactive data values (deps for useCallback)
  const tagFilter = useLibraryStore((s) => s.tagFilter)
  const query = useLibraryStore((s) => s.query)
  const sort = useLibraryStore((s) => s.sort)
  // Stable Zustand actions (identity never changes — safe as useCallback deps)
  const setLoading = useLibraryStore((s) => s.setLoading)
  const setItems = useLibraryStore((s) => s.setItems)
  const setStats = useLibraryStore((s) => s.setStats)
  const setTrash = useLibraryStore((s) => s.setTrash)

  const [showTrash, setShowTrash] = useState(false)
  const [tagInput, setTagInput] = useState('')

  const fetchList = useCallback(async () => {
    setLoading(true)
    const [listRes, statsRes] = await Promise.all([
      window.api.invoke(IPC_CHANNELS.LIBRARY_LIST, {
        tagIds: tagFilter.length ? tagFilter : undefined,
        query: query || undefined,
        sort
      }),
      window.api.invoke(IPC_CHANNELS.LIBRARY_STATS, undefined)
    ])
    setLoading(false)
    if (listRes.success) setItems(listRes.data.items)
    if (statsRes.success) setStats(statsRes.data)
  }, [tagFilter, query, sort, setLoading, setItems, setStats])

  const fetchTrash = useCallback(async () => {
    const res = await window.api.invoke(IPC_CHANNELS.LIBRARY_TRASH_LIST, undefined)
    if (res.success) setTrash(res.data.items)
  }, [setTrash])

  // Single debounced effect — fires whenever any of tagFilter/query/sort change
  // (fetchList identity changes when those values change). 150ms debounce is
  // imperceptible in this mock UI and avoids separate immediate/debounce effects.
  useEffect(() => {
    const id = setTimeout(fetchList, 150)
    return () => clearTimeout(id)
  }, [fetchList])

  const refresh = () => {
    fetchList()
    if (showTrash) fetchTrash()
  }

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    store.setQuery(e.target.value)
  }

  const handleTagInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTagInput(e.target.value)
    const ids = e.target.value.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
    store.setTagFilter(ids)
  }

  const handleToggleFavourite = async (id: number, current: boolean) => {
    await window.api.invoke(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, { mockupId: id, favourite: !current })
    refresh()
  }

  const handleOpen = async (id: number) => {
    await window.api.invoke(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL, { mockupId: id })
  }

  const handleDetail = async (id: number) => {
    const res = await window.api.invoke(IPC_CHANNELS.MOCKUP_DETAIL, { mockupId: id })
    if (res.success) store.setDetail(res.data)
  }

  const handleEdit = async (id: number, currentTitle: string, currentDesc: string | null, tagIds: number[]) => {
    const title = window.prompt('Title', currentTitle)
    if (!title) return
    const desc = window.prompt('Description', currentDesc ?? '') ?? ''
    const tagStr = window.prompt('Tag IDs (comma-separated)', tagIds.join(',')) ?? ''
    const newTagIds = tagStr.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
    await window.api.invoke(IPC_CHANNELS.MOCKUP_UPDATE, { mockupId: id, title, description: desc, tagIds: newTagIds })
    refresh()
  }

  const handleDuplicate = async (id: number) => {
    await window.api.invoke(IPC_CHANNELS.MOCKUP_DUPLICATE, { mockupId: id })
    refresh()
  }

  const handleTrash = async (id: number) => {
    await window.api.invoke(IPC_CHANNELS.MOCKUP_TRASH, { mockupId: id })
    refresh()
  }

  const handleUngroup = async (leaderId: number) => {
    await window.api.invoke(IPC_CHANNELS.GROUP_UNGROUP, { leaderId })
    refresh()
  }

  const handleDeleteGroup = async (leaderId: number) => {
    await window.api.invoke(IPC_CHANNELS.GROUP_DELETE, { leaderId })
    refresh()
  }

  const handleRestore = async (id: number) => {
    await window.api.invoke(IPC_CHANNELS.MOCKUP_RESTORE, { mockupId: id })
    refresh()
  }

  const handleDeletePermanent = async (id: number) => {
    if (!window.confirm('Permanently delete?')) return
    await window.api.invoke(IPC_CHANNELS.MOCKUP_DELETE_PERMANENT, { mockupId: id })
    refresh()
  }

  const toggleTrash = async () => {
    if (!showTrash) await fetchTrash()
    setShowTrash((v) => !v)
  }

  const { stats } = store

  return (
    <main className="min-h-screen bg-neutral-900 text-slate-100 p-4 font-mono text-sm">
      <div className="flex items-center gap-4 mb-4">
        <button onClick={onBack} className="bg-neutral-700 hover:bg-neutral-600 px-3 py-1 rounded">
          Back to import
        </button>
        <span className="font-bold text-base">Library</span>
        <span className="text-neutral-400">
          total:{stats.total} fav:{stats.favourites} groups:{stats.groups} trashed:{stats.trashed}
        </span>
        {store.isLoading && <span className="text-yellow-400">loading…</span>}
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        {/* Gating seam demo — SEARCH_SEMANTIC is 'free' in Phase 1, so this renders normally. */}
        <Locked feature={FEATURE_KEYS.SEARCH_SEMANTIC}>
          <input
            className="bg-neutral-800 border border-neutral-600 px-2 py-1 rounded w-48"
            placeholder="Search…"
            value={store.query}
            onChange={handleQueryChange}
          />
        </Locked>
        <input
          className="bg-neutral-800 border border-neutral-600 px-2 py-1 rounded w-36"
          placeholder="Tag IDs (1,2,3)"
          value={tagInput}
          onChange={handleTagInputChange}
        />
        <select
          className="bg-neutral-800 border border-neutral-600 px-2 py-1 rounded"
          value={store.sort}
          onChange={(e) => store.setSort(e.target.value as 'date' | 'name')}
        >
          <option value="date">date</option>
          <option value="name">name</option>
        </select>
        <button onClick={refresh} className="bg-neutral-700 hover:bg-neutral-600 px-2 py-1 rounded">
          Refresh
        </button>
        <button onClick={toggleTrash} className="bg-neutral-700 hover:bg-neutral-600 px-2 py-1 rounded">
          {showTrash ? 'Hide Trash' : 'Show Trash'}
        </button>
      </div>

      {store.selectedDetail && (
        <div className="mb-4 border border-blue-600 rounded p-3">
          <div className="flex justify-between mb-1">
            <strong>Detail: {store.selectedDetail.item.title}</strong>
            <button onClick={() => store.setDetail(null)} className="text-neutral-400 hover:text-white">
              close
            </button>
          </div>
          <pre className="text-xs text-neutral-300 overflow-auto max-h-48">
            {JSON.stringify(store.selectedDetail, null, 2)}
          </pre>
        </div>
      )}

      <table className="w-full border-collapse mb-6">
        <thead>
          <tr className="text-neutral-400 text-left border-b border-neutral-700">
            <th className="pr-2">id</th>
            <th className="pr-2">title</th>
            <th className="pr-2">fav</th>
            <th className="pr-2">group</th>
            <th className="pr-2">variants</th>
            <th className="pr-2">tags</th>
            <th>actions</th>
          </tr>
        </thead>
        <tbody>
          {store.items.map((item) => (
            <tr key={item.id} className="border-b border-neutral-800 hover:bg-neutral-800">
              <td className="pr-2 text-neutral-400">{item.id}</td>
              <td className="pr-2">{item.title}</td>
              <td className="pr-2">{item.favourite ? '★' : '☆'}</td>
              <td className="pr-2">{item.isGroup ? 'G' : '-'}</td>
              <td className="pr-2">{item.variantCount}</td>
              <td className="pr-2 text-neutral-400">{item.tags.map((t) => t.label).join(', ')}</td>
              <td className="flex gap-1 flex-wrap py-1">
                <button
                  onClick={() => handleToggleFavourite(item.id, item.favourite)}
                  className="bg-neutral-700 hover:bg-neutral-600 px-1 rounded text-xs"
                >
                  {item.favourite ? 'Unfav' : 'Fav'}
                </button>
                <button
                  onClick={() => handleOpen(item.id)}
                  className="bg-neutral-700 hover:bg-neutral-600 px-1 rounded text-xs"
                >
                  Open
                </button>
                <button
                  onClick={() => handleDetail(item.id)}
                  className="bg-neutral-700 hover:bg-neutral-600 px-1 rounded text-xs"
                >
                  Detail
                </button>
                <button
                  onClick={() => handleEdit(item.id, item.title, item.description, item.tags.map((t) => t.id))}
                  className="bg-neutral-700 hover:bg-neutral-600 px-1 rounded text-xs"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDuplicate(item.id)}
                  className="bg-neutral-700 hover:bg-neutral-600 px-1 rounded text-xs"
                >
                  Dup
                </button>
                <button
                  onClick={() => handleTrash(item.id)}
                  className="bg-red-900 hover:bg-red-800 px-1 rounded text-xs"
                >
                  Trash
                </button>
                {item.isGroup && (
                  <>
                    <button
                      onClick={() => handleUngroup(item.id)}
                      className="bg-yellow-900 hover:bg-yellow-800 px-1 rounded text-xs"
                    >
                      Ungroup
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(item.id)}
                      className="bg-red-900 hover:bg-red-800 px-1 rounded text-xs"
                    >
                      Del Group
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {store.items.length === 0 && (
            <tr>
              <td colSpan={7} className="text-neutral-500 py-4 text-center">
                No items
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showTrash && (
        <div className="border border-neutral-600 rounded p-3">
          <p className="font-bold mb-2">Trash ({store.trash.length})</p>
          {store.trash.length === 0 && <p className="text-neutral-500">Empty</p>}
          {store.trash.map((item) => (
            <div key={item.id} className="flex items-center gap-3 border-b border-neutral-700 py-1">
              <span className="text-neutral-400">{item.id}</span>
              <span>{item.title}</span>
              <button
                onClick={() => handleRestore(item.id)}
                className="bg-green-900 hover:bg-green-800 px-1 rounded text-xs"
              >
                Restore
              </button>
              <button
                onClick={() => handleDeletePermanent(item.id)}
                className="bg-red-900 hover:bg-red-800 px-1 rounded text-xs"
              >
                Delete forever
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
