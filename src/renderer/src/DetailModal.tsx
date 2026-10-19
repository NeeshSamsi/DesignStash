import { useState, useCallback, useEffect } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { MockupDetail } from '@shared/library'
import type { ApprovalTag, TagsByCategory } from '@shared/approval'
import { useLibraryStore } from './stores/libraryStore'
import { Modal } from './components/_legacy/Modal'
import { TagEditor } from './components/_legacy/TagEditor'
import { toast } from './stores/toastStore'
import { Button } from './ui/button'

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
                { tagId: newTag.tagId, label: newTag.label },
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
    <Modal onClose={onClose} className="sm:max-w-2xl" showClose={false} label="Mockup details">
      {/* Confirm overlay — rendered inline when a destructive action is pending */}
      {pendingAction && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-xl bg-background/90 p-6">
          <p className="text-center text-sm text-foreground">
            {pendingAction === 'trash' && 'Move this mockup to Trash?'}
            {pendingAction === 'ungroup' && 'Ungroup? All variants will become standalone mockups.'}
            {pendingAction === 'group-delete' && 'Delete this group and all its variants permanently?'}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPendingAction(null)}>
              Cancel
            </Button>
            <Button
              variant={pendingAction === 'group-delete' ? 'destructive' : 'default'}
              size="sm"
              onClick={() => {
                if (pendingAction === 'trash') void handleTrash()
                else if (pendingAction === 'ungroup') void handleUngroup()
                else if (pendingAction === 'group-delete') void handleGroupDelete()
              }}
            >
              {pendingAction === 'group-delete' ? 'Delete permanently' : 'Confirm'}
            </Button>
          </div>
        </div>
      )}

      {!detail ? (
        <div className="flex items-center justify-center p-8">
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 border-b border-transparent bg-transparent pb-0.5 text-base font-semibold text-foreground outline-none transition-colors focus:border-ring"
              aria-label="Title"
            />
            <button
              onClick={() => void handleFavouriteToggle()}
              className={`text-xl leading-none transition-colors ${detail.item.favourite ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
              aria-label={detail.item.favourite ? 'Remove from favourites' : 'Add to favourites'}
            >
              ★
            </button>
            <button
              onClick={onClose}
              className="text-lg leading-none text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div className="flex max-h-modal-body gap-5 overflow-auto p-5">
            {/* Cover + carousel */}
            <div className="flex w-48 shrink-0 flex-col gap-2">
              <div className="aspect-card w-full overflow-hidden rounded-lg bg-muted">
                {activeCover && (
                  <img
                    src={`file://${activeCover}`}
                    alt="Cover"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                )}
              </div>
              {allCovers.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {allCovers.map((cover, i) => (
                    <button
                      key={i}
                      onClick={() => setCoverIndex(i)}
                      className={`h-10 w-10 overflow-hidden rounded border-2 transition-colors ${
                        i === coverIndex ? 'border-primary' : 'border-border'
                      }`}
                      aria-label={`Variant ${i + 1}`}
                    >
                      <img
                        src={`file://${cover}`}
                        alt=""
                        className="h-full w-full object-cover"
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
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Description
                </label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  placeholder="Short description…"
                  aria-label="Description"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Tags</label>
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
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
            {/* File actions */}
            <Button variant="secondary" size="sm" onClick={() => void handleOpenExternal()}>
              Open in Photoshop
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void handleDuplicate()}>
              Duplicate
            </Button>

            {/* Group actions */}
            {detail.item.isGroup && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setPendingAction('ungroup')}>
                  Ungroup
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setPendingAction('group-delete')}
                >
                  Delete Group
                </Button>
              </>
            )}

            <div className="flex-1" />

            <Button variant="ghost" size="sm" onClick={() => setPendingAction('trash')}>
              Move to Trash
            </Button>
            <Button
              size="sm"
              disabled={isSaving || !title.trim()}
              onClick={() => void handleSave()}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
