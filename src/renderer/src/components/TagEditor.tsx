import { useState } from 'react'
import type { ApprovalTag, TagsByCategory } from '@shared/approval'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'

interface NewTagConfirmDialogProps {
  label: string
  categoryLabel: string
  onConfirm: () => void
  onCancel: () => void
}

function NewTagConfirmDialog({ label, categoryLabel, onConfirm, onCancel }: NewTagConfirmDialogProps) {
  return (
    <AlertDialog
      open
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Add new tag?</AlertDialogTitle>
          <AlertDialogDescription>
            &apos;{label}&apos; is a new tag in {categoryLabel} — adding it affects how your library
            is organised. Add it?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Add</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
      <div className="mb-2 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Badge key={tag.tagId} variant="secondary" className="gap-1">
            <span className="text-muted-foreground">{tag.categoryLabel}</span>
            <span>{tag.label}</span>
            <button
              onClick={() => onChange(tags.filter((t) => t.tagId !== tag.tagId))}
              className="ml-0.5 leading-none text-muted-foreground transition-colors hover:text-destructive"
              aria-label={`Remove tag ${tag.label}`}
            >
              ×
            </button>
          </Badge>
        ))}
      </div>

      <div className="relative">
        <Input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          placeholder="Add tag…"
        />
        {isOpen && inputValue.trim() && (filtered.length > 0 || !exactMatch) && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl">
            {filtered.slice(0, 8).map((tag) => (
              <Button
                key={tag.tagId}
                variant="ghost"
                className="w-full justify-start gap-2 rounded-none"
                onMouseDown={() => handleSelectExisting(tag)}
              >
                <span className="text-xs text-muted-foreground">{tag.categoryLabel}</span>
                <span>{tag.label}</span>
              </Button>
            ))}
            {!exactMatch && (
              <Button
                variant="ghost"
                className="w-full justify-start rounded-none text-primary"
                onMouseDown={handleNewTagClick}
              >
                Add &apos;{inputValue.trim()}&apos; as a new tag
              </Button>
            )}
          </div>
        )}
      </div>

      {pendingNewLabel && (
        <div className="mt-2 rounded-lg border border-border p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Choose a category for &apos;{pendingNewLabel}&apos;:
          </p>
          <select
            value={selectedCategoryId ?? ''}
            onChange={(e) => setSelectedCategoryId(Number(e.target.value))}
            className="mb-2 w-full rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {categories.map((cat) => (
              <option key={cat.categoryId} value={cat.categoryId}>
                {cat.categoryLabel}
              </option>
            ))}
          </select>
          <p className="mb-2 text-xs text-muted-foreground">New categories can be added in Settings.</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPendingNewLabel(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCategoryConfirm}>
              Confirm
            </Button>
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
