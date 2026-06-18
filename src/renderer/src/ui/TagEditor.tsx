import { useState } from 'react'
import type { ApprovalTag, TagsByCategory } from '@shared/approval'

interface NewTagConfirmDialogProps {
  label: string
  categoryLabel: string
  onConfirm: () => void
  onCancel: () => void
}

function NewTagConfirmDialog({ label, categoryLabel, onConfirm, onCancel }: NewTagConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        <p className="text-white text-sm mb-4">
          <span className="font-semibold">'{label}'</span> is a new tag in{' '}
          <span className="font-semibold">{categoryLabel}</span> — adding it affects how your
          library is organised. Add it?
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="text-sm bg-neutral-700 hover:bg-neutral-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

export interface TagEditorProps {
  tags: ApprovalTag[]
  categories: TagsByCategory[]
  onChange: (tags: ApprovalTag[]) => void
  onNewTagRequest: (label: string, categoryId: number) => Promise<ApprovalTag | null>
}

export function TagEditor({ tags, categories, onChange, onNewTagRequest }: TagEditorProps) {
  const [inputValue, setInputValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [pendingNewLabel, setPendingNewLabel] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [confirmingNew, setConfirmingNew] = useState<{
    label: string
    categoryId: number
    categoryLabel: string
  } | null>(null)

  const allTags = categories.flatMap((cat) =>
    cat.tags.map((t) => ({
      tagId: t.tagId,
      label: t.label,
      categoryId: cat.categoryId,
      categoryLabel: cat.categoryLabel,
    }))
  )

  const existingTagIds = new Set(tags.map((t) => t.tagId))

  const filtered = inputValue.trim()
    ? allTags.filter(
        (t) =>
          t.label.toLowerCase().includes(inputValue.toLowerCase()) &&
          !existingTagIds.has(t.tagId)
      )
    : []

  const exactMatch = allTags.some(
    (t) => t.label.toLowerCase() === inputValue.trim().toLowerCase()
  )

  const handleSelectExisting = (tag: (typeof allTags)[number]) => {
    onChange([
      ...tags,
      {
        tagId: tag.tagId,
        label: tag.label,
        categoryId: tag.categoryId,
        categoryLabel: tag.categoryLabel,
      },
    ])
    setInputValue('')
    setIsOpen(false)
  }

  const handleNewTagClick = () => {
    setPendingNewLabel(inputValue.trim())
    setSelectedCategoryId(categories[0]?.categoryId ?? null)
    setIsOpen(false)
  }

  const handleConfirmNew = async () => {
    if (!confirmingNew) return
    const newTag = await onNewTagRequest(confirmingNew.label, confirmingNew.categoryId)
    if (newTag) onChange([...tags, newTag])
    setConfirmingNew(null)
    setPendingNewLabel(null)
    setSelectedCategoryId(null)
    setInputValue('')
  }

  const handleCategoryConfirm = () => {
    if (!pendingNewLabel || selectedCategoryId === null) return
    const cat = categories.find((c) => c.categoryId === selectedCategoryId)
    if (!cat) return
    setConfirmingNew({
      label: pendingNewLabel,
      categoryId: selectedCategoryId,
      categoryLabel: cat.categoryLabel,
    })
    setPendingNewLabel(null)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <span
            key={tag.tagId}
            className="inline-flex items-center gap-1 text-xs bg-neutral-700 text-neutral-200 px-2 py-1 rounded-full"
          >
            <span className="text-neutral-500 text-xs">{tag.categoryLabel}</span>
            <span>{tag.label}</span>
            <button
              onClick={() => onChange(tags.filter((t) => t.tagId !== tag.tagId))}
              className="text-neutral-400 hover:text-red-400 transition-colors leading-none ml-0.5"
              aria-label={`Remove tag ${tag.label}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          placeholder="Add tag…"
          className="w-full bg-neutral-700 border border-neutral-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
        />
        {isOpen && inputValue.trim() && (filtered.length > 0 || !exactMatch) && (
          <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden">
            {filtered.slice(0, 8).map((tag) => (
              <button
                key={tag.tagId}
                onMouseDown={() => handleSelectExisting(tag)}
                className="w-full text-left px-3 py-2 text-sm text-white hover:bg-neutral-700 flex items-center gap-2 transition-colors"
              >
                <span className="text-neutral-500 text-xs">{tag.categoryLabel}</span>
                <span>{tag.label}</span>
              </button>
            ))}
            {!exactMatch && (
              <button
                onMouseDown={handleNewTagClick}
                className="w-full text-left px-3 py-2 text-sm text-blue-400 hover:bg-neutral-700 transition-colors"
              >
                Add '{inputValue.trim()}' as a new tag
              </button>
            )}
          </div>
        )}
      </div>

      {pendingNewLabel && (
        <div className="mt-2 p-3 border border-neutral-600 rounded-lg">
          <p className="text-xs text-neutral-400 mb-2">
            Choose a category for '{pendingNewLabel}':
          </p>
          <select
            value={selectedCategoryId ?? ''}
            onChange={(e) => setSelectedCategoryId(Number(e.target.value))}
            className="w-full bg-neutral-700 border border-neutral-600 text-white text-sm rounded-lg px-2 py-1.5 mb-2 focus:outline-none"
          >
            {categories.map((cat) => (
              <option key={cat.categoryId} value={cat.categoryId}>
                {cat.categoryLabel}
              </option>
            ))}
          </select>
          <p className="text-xs text-amber-400 mb-2">New categories can be added in Settings.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPendingNewLabel(null)}
              className="text-xs bg-neutral-700 hover:bg-neutral-600 text-white px-3 py-1 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCategoryConfirm}
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {confirmingNew && (
        <NewTagConfirmDialog
          label={confirmingNew.label}
          categoryLabel={confirmingNew.categoryLabel}
          onConfirm={() => void handleConfirmNew()}
          onCancel={() => {
            setConfirmingNew(null)
            setPendingNewLabel(null)
          }}
        />
      )}
    </div>
  )
}
