import { useState, useEffect, useRef } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { useApprovalStore } from './stores/approvalStore'
import type { ApprovalItem, ApprovalTag, TagsByCategory, ApproveItemRequest } from '@shared/approval'
import { track } from './telemetry'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import { TagEditor } from './components/_legacy/TagEditor'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'

interface ApprovalStepperProps {
  onComplete: () => void
  onCancel: () => void
}

// --- CoverSection ---

interface CoverSectionProps {
  item: ApprovalItem
  onCoverUpdated: (coverPath: string, coverSource: ApprovalItem['coverSource']) => void
}

function CoverSection({ item, onCoverUpdated }: CoverSectionProps) {
  const [showUploadZone, setShowUploadZone] = useState(item.coverSource === 'none')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Telemetry: the mandatory-cover gate blocked save for this item (count only, no file info).
  useEffect(() => {
    if (item.coverSource === 'none') {
      track(TELEMETRY_EVENTS.MANDATORY_UPLOAD_HIT)
    }
  }, [item.coverSource, item.mockupId])

  const handleFileChange = async (file: File) => {
    const filePath = window.api.getPathForFile(file)
    const res = await window.api.invoke(IPC_CHANNELS.APPROVAL_SET_COVER, {
      mockupId: item.mockupId,
      filePath
    })
    if (res.success) {
      onCoverUpdated(res.data.coverPath, 'user-uploaded')
      setShowUploadZone(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) void handleFileChange(file)
  }

  if (showUploadZone || item.coverSource === 'none') {
    return (
      <div className="flex flex-col gap-2">
        {item.coverSource === 'none' && (
          <p className="text-xs text-muted-foreground">A cover image is required before saving</p>
        )}
        <div
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-6 transition-colors hover:border-ring"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <p className="text-sm text-muted-foreground">Drag &amp; drop or click to upload cover</p>
          <p className="text-xs text-muted-foreground">PNG, JPG, WebP</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFileChange(file)
          }}
        />
        {item.coverSource !== 'none' && (
          <Button variant="ghost" size="xs" onClick={() => setShowUploadZone(false)}>
            Cancel
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="aspect-square w-full overflow-hidden rounded-xl bg-muted">
        <img
          src={`file://${item.coverPath}`}
          alt="Cover"
          className="h-full w-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </div>
      {item.coverSource === 'sidecar' && item.sidecarFileName && (
        <p className="truncate text-center text-xs text-muted-foreground">{item.sidecarFileName}</p>
      )}
      <div className="flex gap-2">
        {item.coverSource === 'sidecar' && (
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => onCoverUpdated(item.coverPath, 'sidecar')}
          >
            Use this cover
          </Button>
        )}
        <Button variant="secondary" size="sm" className="flex-1" onClick={() => setShowUploadZone(true)}>
          Replace
        </Button>
      </div>
    </div>
  )
}

// --- ItemEditor (remounted per item via key) ---

interface ItemEditorProps {
  item: ApprovalItem
  currentIndex: number
  queueLength: number
  isSaving: boolean
  categories: TagsByCategory[]
  onSave: (req: ApproveItemRequest, wasEdited: boolean) => Promise<void>
  onBack: () => void
  onCoverUpdated: (coverPath: string, coverSource: ApprovalItem['coverSource']) => void
  onNewTagRequest: (label: string, categoryId: number) => Promise<ApprovalTag | null>
}

function ItemEditor({
  item,
  currentIndex,
  queueLength,
  isSaving,
  categories,
  onSave,
  onBack,
  onCoverUpdated,
  onNewTagRequest
}: ItemEditorProps) {
  // Initialized from item on mount; remounted via key when currentIndex changes
  const [localTitle, setLocalTitle] = useState(item.title)
  const [localDesc, setLocalDesc] = useState(item.description)
  const [localTags, setLocalTags] = useState<ApprovalTag[]>(item.tags)
  const initialItem = useRef(item)

  const isLastItem = currentIndex === queueLength - 1
  const canSave = item.coverSource !== 'none' && !isSaving

  const handleApprove = async () => {
    if (!canSave) return
    const initial = initialItem.current
    const wasEdited =
      localTitle !== initial.title ||
      localDesc !== initial.description ||
      JSON.stringify(localTags.map((t) => t.tagId).sort()) !==
        JSON.stringify(initial.tags.map((t) => t.tagId).sort())

    const req: ApproveItemRequest = {
      mockupId: item.mockupId,
      title: localTitle,
      description: localDesc,
      tagIds: localTags.map((t) => t.tagId),
      coverPath: item.coverPath,
      coverSource: item.coverSource as 'embedded' | 'sidecar' | 'user-uploaded',
      isLeader: item.isLeader,
      wasEdited,
      leaderId: item.leaderId
    }
    await onSave(req, wasEdited)
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-3xl mx-auto flex gap-6">
        <div className="w-56 shrink-0">
          <CoverSection item={item} onCoverUpdated={onCoverUpdated} />
        </div>

        <div className="flex flex-1 flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Title</label>
            <Input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              placeholder="Mockup title"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={localDesc}
              onChange={(e) => setLocalDesc(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              placeholder="Short description…"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Tags</label>
            <TagEditor
              tags={localTags}
              categories={categories}
              onChange={setLocalTags}
              onNewTagRequest={onNewTagRequest}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="secondary" disabled={currentIndex === 0} onClick={onBack}>
              Back
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const stem = item.title.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim()
                setLocalTitle(stem || item.title)
                setLocalDesc('')
                setLocalTags([])
              }}
            >
              Skip AI
            </Button>
            <div className="flex-1" />
            <Button disabled={!canSave} onClick={() => void handleApprove()}>
              {isSaving ? 'Saving…' : isLastItem ? 'Approve & Finish' : 'Approve & Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- ApprovalStepper ---

export default function ApprovalStepper({ onComplete, onCancel }: ApprovalStepperProps) {
  const store = useApprovalStore()
  const [categories, setCategories] = useState<TagsByCategory[]>([])

  useEffect(() => {
    void (async () => {
      const res = await window.api.invoke(IPC_CHANNELS.TAG_LIST_BY_CATEGORY, undefined)
      if (res.success) setCategories(res.data.categories)
    })()
  }, [])

  const item = store.currentItem()

  const handleCoverUpdated = (coverPath: string, coverSource: ApprovalItem['coverSource']) => {
    store.updateCurrentItem({ coverPath, coverSource })
  }

  const handleSave = async (req: ApproveItemRequest, wasEdited: boolean) => {
    store.setSaving(true)
    const res = await window.api.invoke(IPC_CHANNELS.APPROVAL_SAVE_ITEM, req)
    store.setSaving(false)

    if (res.success) {
      if (wasEdited) store.markCurrentManuallyEdited()
      if (res.data.reinferredItems?.length) {
        store.applyReinferred(res.data.reinferredItems)
      }
      if (store.currentIndex === store.queue.length - 1) {
        store.setComplete()
        onComplete()
      } else {
        store.goNext()
      }
    }
  }

  const handleNewTagRequest = async (label: string, categoryId: number): Promise<ApprovalTag | null> => {
    const cat = categories.find((c) => c.categoryId === categoryId)
    if (!cat) return null
    const res = await window.api.invoke(IPC_CHANNELS.TAG_CREATE, { label, categoryId })
    if (!res.success) return null
    const newTag: ApprovalTag = {
      tagId: res.data.tagId,
      label: res.data.label,
      categoryId: res.data.categoryId,
      categoryLabel: cat.categoryLabel
    }
    setCategories((prev) =>
      prev.map((c) =>
        c.categoryId === categoryId
          ? { ...c, tags: [...c.tags, { tagId: newTag.tagId, label: newTag.label }] }
          : c
      )
    )
    return newTag
  }

  if (store.isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Preparing review queue…</p>
      </div>
    )
  }

  if (!item) return null

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Review Mockup</h2>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{store.currentIndex + 1} of {store.totalItems()}</span>
            {item.isLeader && <Badge>Group leader</Badge>}
            {item.leaderId !== null && <Badge variant="secondary">Variant {item.variantIndex}</Badge>}
          </p>
        </div>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </header>

      {/* key forces remount when index changes, resetting local state cleanly */}
      <ItemEditor
        key={store.currentIndex}
        item={item}
        currentIndex={store.currentIndex}
        queueLength={store.queue.length}
        isSaving={store.isSaving}
        categories={categories}
        onSave={handleSave}
        onBack={() => store.goBack()}
        onCoverUpdated={handleCoverUpdated}
        onNewTagRequest={handleNewTagRequest}
      />
    </div>
  )
}
