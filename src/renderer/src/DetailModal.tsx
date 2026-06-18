import { useState, useCallback, useEffect } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { MockupDetail } from '@shared/library'
import type { ApprovalTag, TagsByCategory } from '@shared/approval'
import { useLibraryStore } from './stores/libraryStore'
import { Modal } from './ui/Modal'
import { TagEditor } from './ui/TagEditor'
import { toast } from './stores/toastStore'

type PendingAction = 'trash' | 'ungroup' | 'group-delete' | null

interface Props {
  mockupId: number
  onClose: () => void
}

export function DetailModal({ mockupId, onClose }: Props) {
  const [detail, setDetail] = useState<MockupDetail | null>(null)
  const [categories, setCategories] = useState<TagsByCategory[]>([])
  const [coverIndex, setCoverIndex] = useState(0)

  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [tags, setTags] = useState<ApprovalTag[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const query = useLibraryStore((s) => s.query)
  const sort = useLibraryStore((s) => s.sort)
  const tagFilter = useLibraryStore((s) => s.tagFilter)
  const setItems = useLibraryStore((s) => s.setItems)
  const setStats = useLibraryStore((s) => s.setStats)
  const setLoading = useLibraryStore((s) => s.setLoading)

  useEffect(() => {
    void (async () => {
      const [detailRes, catRes] = await Promise.all([
        window.api.invoke(IPC_CHANNELS.MOCKUP_DETAIL, { mockupId }),
        window.api.invoke(IPC_CHANNELS.TAG_LIST_BY_CATEGORY, undefined),
      ])
      if (detailRes.success) {
        const d = detailRes.data
        setDetail(d)
        setTitle(d.item.title)
        setDesc(d.item.description ?? '')
        const catIdByLabel = new Map(
          catRes.success
            ? catRes.data.categories.map(
                (c: TagsByCategory) => [c.categoryLabel, c.categoryId] as const
              )
            : []
        )
        setTags(
          d.item.tags.map((t) => ({
            tagId: t.id,
            label: t.label,
            categoryId: catIdByLabel.get(t.categoryLabel) ?? 0,
            categoryLabel: t.categoryLabel,
          }))
        )
      }
      if (catRes.success) setCategories(catRes.data.categories)
    })()
  }, [mockupId])

  const refreshGrid = useCallback(async () => {
    setLoading(true)
    const [listRes, statsRes] = await Promise.all([
      window.api.invoke(IPC_CHANNELS.LIBRARY_LIST, {
        tagIds: tagFilter.length ? tagFilter : undefined,
        query: query || undefined,
        sort,
      }),
      window.api.invoke(IPC_CHANNELS.LIBRARY_STATS, undefined),
    ])
    setLoading(false)
    if (listRes.success) setItems(listRes.data.items)
    if (statsRes.success) setStats(statsRes.data)
  }, [query, sort, tagFilter, setLoading, setItems, setStats])

  const handleSave = async () => {
    if (!detail) return
    setIsSaving(true)
    const res = await window.api.invoke(IPC_CHANNELS.MOCKUP_UPDATE, {
      mockupId,
      title,
      description: desc,
      tagIds: tags.map((t) => t.tagId),
    })
    setIsSaving(false)
    if (res.success) {
      toast('Changes saved', 'success')
      await refreshGrid()
      onClose()
    } else {
      toast('Save failed', 'error')
    }
  }

  const handleFavouriteToggle = async () => {
    if (!detail) return
    const res = await window.api.invoke(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, {
      mockupId,
      favourite: !detail.item.favourite,
    })
    if (res.success) {
      setDetail((prev) =>
        prev ? { ...prev, item: { ...prev.item, favourite: res.data.favourite } } : null
      )
      void refreshGrid()
    }
  }

  const handleOpenExternal = async () => {
    await window.api.invoke(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL, { mockupId })
  }

  const handleDuplicate = async () => {
    const res = await window.api.invoke(IPC_CHANNELS.MOCKUP_DUPLICATE, { mockupId })
    if (res.success) {
      toast('Duplicate created', 'success')
      await refreshGrid()
    }
  }

  const handleTrash = async () => {
    const res = await window.api.invoke(IPC_CHANNELS.MOCKUP_TRASH, { mockupId })
    if (res.success) {
      await refreshGrid()
      onClose()
    }
    setPendingAction(null)
  }

  const handleUngroup = async () => {
    const res = await window.api.invoke(IPC_CHANNELS.GROUP_UNGROUP, { leaderId: mockupId })
    if (res.success) {
      toast('Group disbanded', 'success')
      await refreshGrid()
      onClose()
    }
    setPendingAction(null)
  }

  const handleGroupDelete = async () => {
    const res = await window.api.invoke(IPC_CHANNELS.GROUP_DELETE, { leaderId: mockupId })
    if (res.success) {
      toast('Group deleted', 'success')
      await refreshGrid()
      onClose()
    }
    setPendingAction(null)
  }

  const handleNewTagRequest = async (
    label: string,
    categoryId: number
  ): Promise<ApprovalTag | null> => {
    const cat = categories.find((c) => c.categoryId === categoryId)
    if (!cat) return null
    const res = await window.api.invoke(IPC_CHANNELS.TAG_CREATE, { label, categoryId })
    if (!res.success) return null
    const newTag: ApprovalTag = {
      tagId: res.data.tagId,
      label: res.data.label,
      categoryId: res.data.categoryId,
      categoryLabel: cat.categoryLabel,
    }
    setCategories((prev) =>
      prev.map((c) =>
        c.categoryId === categoryId
          ? {
              ...c,
              tags: [
                ...c.tags,
                { tagId: newTag.tagId, label: newTag.label, parentTagId: null },
              ],
            }
          : c
      )
    )
    return newTag
  }

  const allCovers = detail
    ? [detail.item.coverPath, ...detail.variants.map((v) => v.coverPath)]
    : []
  const activeCover = allCovers[coverIndex] ?? ''

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      {/* Confirm overlay — rendered inline when a destructive action is pending */}
      {pendingAction && (
        <div className="absolute inset-0 z-10 bg-neutral-900/90 rounded-xl flex flex-col items-center justify-center gap-4 p-6">
          <p className="text-white text-sm text-center">
            {pendingAction === 'trash' && 'Move this mockup to Trash?'}
            {pendingAction === 'ungroup' && 'Ungroup? All variants will become standalone mockups.'}
            {pendingAction === 'group-delete' && 'Delete this group and all its variants permanently?'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPendingAction(null)}
              className="text-sm bg-neutral-700 hover:bg-neutral-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (pendingAction === 'trash') void handleTrash()
                else if (pendingAction === 'ungroup') void handleUngroup()
                else if (pendingAction === 'group-delete') void handleGroupDelete()
              }}
              className={`text-sm px-4 py-2 rounded-lg transition-colors text-white ${
                pendingAction === 'group-delete'
                  ? 'bg-red-600 hover:bg-red-500'
                  : 'bg-neutral-600 hover:bg-neutral-500'
              }`}
            >
              {pendingAction === 'group-delete' ? 'Delete permanently' : 'Confirm'}
            </button>
          </div>
        </div>
      )}

      {!detail ? (
        <div className="p-8 flex items-center justify-center">
          <span className="text-neutral-400 text-sm">Loading…</span>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-700">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 bg-transparent text-white text-base font-semibold focus:outline-none border-b border-transparent focus:border-neutral-500 pb-0.5 transition-colors"
              aria-label="Title"
            />
            <button
              onClick={() => void handleFavouriteToggle()}
              className={`text-xl leading-none transition-colors ${detail.item.favourite ? 'text-yellow-400' : 'text-neutral-500 hover:text-yellow-400'}`}
              aria-label={detail.item.favourite ? 'Remove from favourites' : 'Add to favourites'}
            >
              ★
            </button>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white transition-colors text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div className="flex gap-5 p-5 overflow-auto max-h-modal-body">
            {/* Cover + carousel */}
            <div className="w-48 shrink-0 flex flex-col gap-2">
              <div className="w-full aspect-card bg-neutral-700 rounded-lg overflow-hidden">
                {activeCover && (
                  <img
                    src={`file://${activeCover}`}
                    alt="Cover"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                )}
              </div>
              {allCovers.length > 1 && (
                <div className="flex gap-1 flex-wrap">
                  {allCovers.map((cover, i) => (
                    <button
                      key={i}
                      onClick={() => setCoverIndex(i)}
                      className={`w-10 h-10 rounded overflow-hidden border-2 transition-colors ${
                        i === coverIndex ? 'border-brand-500' : 'border-neutral-600'
                      }`}
                      aria-label={`Variant ${i + 1}`}
                    >
                      <img
                        src={`file://${cover}`}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Edit fields */}
            <div className="flex-1 flex flex-col gap-4 min-w-0">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Description
                </label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  className="w-full bg-neutral-700 border border-neutral-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="Short description…"
                  aria-label="Description"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Tags</label>
                <TagEditor
                  tags={tags}
                  categories={categories}
                  onChange={setTags}
                  onNewTagRequest={handleNewTagRequest}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-neutral-700 flex flex-wrap items-center gap-2">
            {/* File actions */}
            <button
              onClick={() => void handleOpenExternal()}
              className="text-xs bg-neutral-700 hover:bg-neutral-600 text-slate-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              Open in Photoshop
            </button>
            <button
              onClick={() => void handleDuplicate()}
              className="text-xs bg-neutral-700 hover:bg-neutral-600 text-slate-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              Duplicate
            </button>

            {/* Group actions */}
            {detail.item.isGroup && (
              <>
                <button
                  onClick={() => setPendingAction('ungroup')}
                  className="text-xs bg-neutral-700 hover:bg-neutral-600 text-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Ungroup
                </button>
                <button
                  onClick={() => setPendingAction('group-delete')}
                  className="text-xs bg-red-900/60 hover:bg-red-800/60 text-red-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Delete Group
                </button>
              </>
            )}

            <div className="flex-1" />

            <button
              onClick={() => setPendingAction('trash')}
              className="text-xs text-neutral-500 hover:text-red-400 transition-colors px-2"
            >
              Move to Trash
            </button>
            <button
              disabled={isSaving || !title.trim()}
              onClick={() => void handleSave()}
              className="text-xs bg-brand-500 hover:bg-brand-500/80 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-colors"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
