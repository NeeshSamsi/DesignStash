import { useState, useEffect, useRef } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { useApprovalStore } from './stores/approvalStore'
import type { ApprovalItem, ApprovalTag, TagsByCategory, ApproveItemRequest } from '@shared/approval'
import { track } from './telemetry'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import { TagEditor } from './ui/TagEditor'

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
          <p className="text-xs text-amber-400">A cover image is required before saving</p>
        )}
        <div
          className="border-2 border-dashed border-neutral-600 rounded-xl flex flex-col items-center justify-center gap-2 p-6 cursor-pointer hover:border-blue-500 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <p className="text-sm text-neutral-400">Drag & drop or click to upload cover</p>
          <p className="text-xs text-neutral-600">PNG, JPG, WebP</p>
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
          <button
            onClick={() => setShowUploadZone(false)}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="w-full aspect-square bg-neutral-800 rounded-xl overflow-hidden">
        <img
          src={`file://${item.coverPath}`}
          alt="Cover"
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </div>
      {item.coverSource === 'sidecar' && item.sidecarFileName && (
        <p className="text-xs text-neutral-500 text-center truncate">{item.sidecarFileName}</p>
      )}
      <div className="flex gap-2">
        {item.coverSource === 'sidecar' && (
          <button
            onClick={() => onCoverUpdated(item.coverPath, 'sidecar')}
            className="flex-1 text-xs bg-neutral-700 hover:bg-neutral-600 text-white px-2 py-1.5 rounded-lg transition-colors"
          >
            Use this cover
          </button>
        )}
        <button
          onClick={() => setShowUploadZone(true)}
          className="flex-1 text-xs bg-neutral-700 hover:bg-neutral-600 text-white px-2 py-1.5 rounded-lg transition-colors"
        >
          Replace
        </button>
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

        <div className="flex-1 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Title</label>
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              placeholder="Mockup title"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Description</label>
            <textarea
              value={localDesc}
              onChange={(e) => setLocalDesc(e.target.value)}
              rows={3}
              className="w-full bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Short description…"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Tags</label>
            <TagEditor
              tags={localTags}
              categories={categories}
              onChange={setLocalTags}
              onNewTagRequest={onNewTagRequest}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              disabled={currentIndex === 0}
              onClick={onBack}
              className="text-sm bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => {
                const stem = item.title.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim()
                setLocalTitle(stem || item.title)
                setLocalDesc('')
                setLocalTags([])
              }}
              className="text-sm text-neutral-400 hover:text-neutral-200 px-4 py-2 rounded-lg transition-colors"
            >
              Skip AI
            </button>
            <div className="flex-1" />
            <button
              disabled={!canSave}
              onClick={() => void handleApprove()}
              className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {isSaving ? 'Saving…' : isLastItem ? 'Approve & Finish' : 'Approve & Next'}
            </button>
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
          ? { ...c, tags: [...c.tags, { tagId: newTag.tagId, label: newTag.label, parentTagId: null }] }
          : c
      )
    )
    return newTag
  }

  if (store.isInitializing) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <p className="text-neutral-400">Preparing review queue…</p>
      </div>
    )
  }

  if (!item) return null

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col">
      <header className="border-b border-neutral-700 px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-white">Review Mockup</h2>
          <p className="text-sm text-neutral-400 flex items-center gap-2">
            <span>{store.currentIndex + 1} of {store.totalItems()}</span>
            {item.isLeader && (
              <span className="text-xs bg-blue-700 text-blue-200 px-1.5 py-0.5 rounded">
                Group leader
              </span>
            )}
            {item.leaderId !== null && (
              <span className="text-xs bg-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded">
                Variant {item.variantIndex}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="text-sm bg-neutral-700 hover:bg-neutral-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Cancel
        </button>
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
