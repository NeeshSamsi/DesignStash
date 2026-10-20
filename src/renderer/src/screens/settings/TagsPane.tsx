import { useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { TagTree as TagTreeData, TagTreeNode } from '@shared/tags'
import { FormDialog } from '../../components/FormDialog'
import { Select } from '../../components/Select'
import { TagTree } from '../../components/TagTree'
import { useTagTreeStore } from '../../stores/tagTreeStore'
import { toast, undoToast } from '../../stores/toastStore'
import { mockupCount } from './settings-copy'

type Category = TagTreeData[number]
interface Merge {
  source: TagTreeNode
  target: TagTreeNode
  count: number | null
}

/** Settings › Tags: two tiers, no nesting. Add where the result appears; delete is instant with Undo. */
export function TagsPane() {
  const tree = useTagTreeStore((s) => s.tree)
  const load = useTagTreeStore((s) => s.load)
  const [merge, setMerge] = useState<Merge | null>(null)
  const [dropping, setDropping] = useState<{ category: Category; to: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  /** Runs a call; a failure toasts plain words and rejects so the tree keeps its input open. */
  const run = async <T,>(message: string, call: () => Promise<{ success: boolean; data?: T }>) => {
    const res = await call().catch(() => ({ success: false as const }))
    if (!res.success) {
      toast({ variant: 'error', message, description: 'Nothing was changed. Try again.' })
      throw new Error(message)
    }
    return res.data as T
  }

  const ipc = window.api.invoke

  const addTag = async (categoryId: number, label: string) => {
    await run('Couldn’t add that tag', () => ipc(IPC_CHANNELS.TAG_CREATE, { label, categoryId }))
    await load()
  }
  const moveTag = async (tagId: number, categoryId: number) => {
    await run('Couldn’t move that tag', () =>
      ipc(IPC_CHANNELS.TAG_SET_CATEGORY, { tagId, categoryId })
    )
    await load()
  }
  const renameTag = async (tagId: number, label: string) => {
    await run('Couldn’t rename that tag', () => ipc(IPC_CHANNELS.TAG_RENAME, { tagId, label }))
    await load()
  }
  const deleteTag = async (tag: TagTreeNode) => {
    const data = await run('Couldn’t delete that tag', () =>
      ipc(IPC_CHANNELS.TAG_DELETE, { tagId: tag.tagId })
    )
    await load()
    undoToast(
      `Deleted “${tag.label}”`,
      () => void ipc(IPC_CHANNELS.TAG_RESTORE, { snapshot: data.snapshot }).then(() => load()),
      `Removed from ${mockupCount(data.affectedMockups)}`
    )
  }
  const createCategory = async (label: string) => {
    await run('Couldn’t add that category', () => ipc(IPC_CHANNELS.CATEGORY_CREATE, { label }))
    await load()
  }
  const renameCategory = async (categoryId: number, label: string) => {
    await run('Couldn’t rename that category', () =>
      ipc(IPC_CHANNELS.CATEGORY_RENAME, { categoryId, label })
    )
    await load()
  }

  const askMerge = async (source: TagTreeNode, target: TagTreeNode) => {
    setMerge({ source, target, count: null })
    const res = await ipc(IPC_CHANNELS.TAG_MERGE_PREVIEW, {
      sourceTagId: source.tagId,
      targetTagId: target.tagId
    }).catch(() => null)
    setMerge((current) =>
      current ? { ...current, count: res?.success ? res.data.affectedMockups : 0 } : current
    )
  }
  const confirmMerge = async () => {
    if (!merge) return
    setBusy(true)
    const res = await ipc(IPC_CHANNELS.TAG_MERGE, {
      sourceTagId: merge.source.tagId,
      targetTagId: merge.target.tagId
    }).catch(() => null)
    setBusy(false)
    if (res?.success) {
      toast(`Merged “${merge.source.label}” into “${merge.target.label}”`, 'success')
      setMerge(null)
      await load()
    } else {
      toast({
        variant: 'error',
        message: 'Couldn’t merge those tags',
        description: 'Nothing was changed. Try again.'
      })
    }
  }

  const deleteCategory = async (category: Category) => {
    if (category.tags.length > 0) {
      const first = tree?.find((c) => c.categoryId !== category.categoryId)
      setDropping({ category, to: first ? String(first.categoryId) : '' })
      return
    }
    const data = await run('Couldn’t delete that category', () =>
      ipc(IPC_CHANNELS.CATEGORY_DELETE, { categoryId: category.categoryId })
    )
    await load()
    undoToast(`Deleted “${category.categoryLabel}”`, () => {
      void ipc(IPC_CHANNELS.CATEGORY_RESTORE, { snapshot: data.snapshot }).then(() => load())
    })
  }
  const confirmDropping = async () => {
    if (!dropping || dropping.to === '') return
    setBusy(true)
    const res = await ipc(IPC_CHANNELS.CATEGORY_DELETE, {
      categoryId: dropping.category.categoryId,
      moveTagsTo: Number(dropping.to)
    }).catch(() => null)
    setBusy(false)
    if (res?.success) {
      toast(`Deleted “${dropping.category.categoryLabel}” · its tags moved`, 'success')
      setDropping(null)
      await load()
    } else {
      toast({
        variant: 'error',
        message: 'Couldn’t delete that category',
        description: 'Nothing was changed. Try again.'
      })
    }
  }

  const others = (tree ?? []).filter((c) => c.categoryId !== dropping?.category.categoryId)

  return (
    <>
      <TagTree
        loading={tree === null}
        {...(tree ? { tree } : {})}
        onAddTag={addTag}
        onMoveTag={moveTag}
        onRenameTag={renameTag}
        onMergeTag={askMerge}
        onDeleteTag={deleteTag}
        onCreateCategory={createCategory}
        onRenameCategory={renameCategory}
        onDeleteCategory={deleteCategory}
      />

      <FormDialog
        open={merge !== null}
        state={busy ? 'submitting' : 'pristine'}
        title={`Merge “${merge?.source.label ?? ''}” into “${merge?.target.label ?? ''}”?`}
        description="Use this when two names mean the same thing. “iPhone” joins “iPhone 15 Pro”."
        submitLabel="Merge"
        submittingLabel="Merging…"
        onCancel={() => setMerge(null)}
        onSubmit={() => void confirmMerge()}
      >
        <p role="status" className="type-body-sm-regular text-muted-foreground">
          {merge?.count === null || merge === null
            ? 'Counting mockups…'
            : `${mockupCount(merge.count)} will move to “${merge.target.label}”. “${merge.source.label}” goes away.`}
        </p>
      </FormDialog>

      <FormDialog
        open={dropping !== null}
        state={busy ? 'submitting' : 'pristine'}
        title={`Delete “${dropping?.category.categoryLabel ?? ''}”?`}
        description="Pick where its tags go. Your mockups keep their tags."
        submitLabel="Delete category"
        submittingLabel="Deleting…"
        onCancel={() => setDropping(null)}
        onSubmit={() => void confirmDropping()}
      >
        <div className="flex flex-col gap-2">
          <span className="type-label-xs-medium text-foreground">Move its tags to</span>
          <Select
            aria-label="Move its tags to"
            value={dropping?.to ?? ''}
            options={others.map((c) => ({ value: String(c.categoryId), label: c.categoryLabel }))}
            onValueChange={(to) =>
              setDropping((current) => (current ? { ...current, to } : current))
            }
          />
        </div>
      </FormDialog>
    </>
  )
}
