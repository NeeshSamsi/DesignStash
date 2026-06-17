// PLACEHOLDER UI — raw mock exercising every tag-management IPC channel (M8.4)
import { useState, useEffect, useCallback } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { TagTree, TagTreeNode } from '@shared/tags'

export default function SettingsTagsPane() {
  const [tree, setTree] = useState<TagTree>([])
  const [status, setStatus] = useState<string>('')

  const refresh = useCallback(async () => {
    const res = await window.api.invoke(IPC_CHANNELS.TAG_TREE, undefined)
    if (res.success) setTree(res.data.tree)
    else setStatus(`TAG_TREE error: ${res.error.message}`)
  }, [])

  useEffect(() => {
    const id = setTimeout(() => void refresh(), 0)
    return () => clearTimeout(id)
  }, [refresh])

  const findNode = (tagId: number): TagTreeNode | undefined =>
    tree.flatMap((c) => c.tags).find((t) => t.tagId === tagId)

  const promptNumber = (label: string): number | null => {
    const raw = window.prompt(label)
    if (raw === null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }

  const handleRenameTag = async () => {
    const tagId = promptNumber('Tag id to rename:')
    if (tagId === null) return
    const label = window.prompt('New label:')
    if (!label) return
    const res = await window.api.invoke(IPC_CHANNELS.TAG_RENAME, { tagId, label })
    setStatus(res.success ? `Renamed tag ${tagId} → "${label}"` : `Error: ${res.error.message}`)
    await refresh()
  }

  const handleSetCategory = async () => {
    const tagId = promptNumber('Tag id:')
    if (tagId === null) return
    const categoryId = promptNumber('New category id:')
    if (categoryId === null) return
    const res = await window.api.invoke(IPC_CHANNELS.TAG_SET_CATEGORY, { tagId, categoryId })
    setStatus(res.success ? `Moved tag ${tagId} → category ${categoryId}` : `Error: ${res.error.message}`)
    await refresh()
  }

  const handleSetParent = async () => {
    const tagId = promptNumber('Tag id:')
    if (tagId === null) return
    const raw = window.prompt('Parent tag id (blank = clear/null):')
    if (raw === null) return
    const parentTagId = raw.trim() === '' ? null : Number(raw)
    const res = await window.api.invoke(IPC_CHANNELS.TAG_SET_PARENT, { tagId, parentTagId })
    setStatus(res.success ? `Set parent of ${tagId} → ${parentTagId}` : `Error: ${res.error.message}`)
    await refresh()
  }

  const handleMerge = async () => {
    const sourceTagId = promptNumber('Source tag id (will be deleted):')
    if (sourceTagId === null) return
    const targetTagId = promptNumber('Target tag id:')
    if (targetTagId === null) return
    const res = await window.api.invoke(IPC_CHANNELS.TAG_MERGE, { sourceTagId, targetTagId })
    setStatus(
      res.success
        ? `Merged ${sourceTagId} → ${targetTagId}; ${res.data.affectedMockups} mockup(s) affected`
        : `Error: ${res.error.message}`
    )
    await refresh()
  }

  const handleDeleteTag = async () => {
    const tagId = promptNumber('Tag id to delete:')
    if (tagId === null) return
    const node = findNode(tagId)
    const usage = node ? node.usageCount : '?'
    if (!window.confirm(`Delete tag ${tagId} ("${node?.label ?? '?'}")? It is used by ${usage} mockup(s).`)) return
    const res = await window.api.invoke(IPC_CHANNELS.TAG_DELETE, { tagId })
    setStatus(
      res.success ? `Deleted tag ${tagId}; ${res.data.affectedMockups} mockup(s) affected` : `Error: ${res.error.message}`
    )
    await refresh()
  }

  const handleCreateCategory = async () => {
    const label = window.prompt('New category label:')
    if (!label) return
    if (
      !window.confirm(
        `Create a NEW category "${label}"? New categories fall outside the canonical taxonomy (spec §3.6) — prefer reusing existing categories.`
      )
    )
      return
    const res = await window.api.invoke(IPC_CHANNELS.CATEGORY_CREATE, { label })
    setStatus(res.success ? `Created category ${res.data.categoryId} ("${res.data.label}")` : `Error: ${res.error.message}`)
    await refresh()
  }

  const handleRenameCategory = async () => {
    const categoryId = promptNumber('Category id to rename:')
    if (categoryId === null) return
    const label = window.prompt('New category label:')
    if (!label) return
    const res = await window.api.invoke(IPC_CHANNELS.CATEGORY_RENAME, { categoryId, label })
    setStatus(res.success ? `Renamed category ${categoryId} → "${label}"` : `Error: ${res.error.message}`)
    await refresh()
  }

  const handleDeleteCategory = async () => {
    const categoryId = promptNumber('Category id to delete:')
    if (categoryId === null) return
    if (
      !window.confirm(
        `Delete category ${categoryId}? This only works if it has NO tags — reassign or delete its tags first.`
      )
    )
      return
    const res = await window.api.invoke(IPC_CHANNELS.CATEGORY_DELETE, { categoryId })
    setStatus(res.success ? `Deleted category ${categoryId}` : `Error: ${res.error.message}`)
    await refresh()
  }

  const btn = 'text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200 px-2 py-1 rounded transition-colors'

  return (
    <div className="mt-6 border-t border-neutral-700 pt-6">
      <h2 className="text-lg font-semibold text-white mb-1">Tag Management (mock)</h2>
      <p className="text-sm text-neutral-400 mb-4">Raw controls to exercise every tag-management IPC channel.</p>

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => void handleRenameTag()} className={btn}>Rename tag</button>
        <button onClick={() => void handleSetCategory()} className={btn}>Set tag category</button>
        <button onClick={() => void handleSetParent()} className={btn}>Set tag parent</button>
        <button onClick={() => void handleMerge()} className={btn}>Merge tags</button>
        <button onClick={() => void handleDeleteTag()} className={btn}>Delete tag</button>
        <button onClick={() => void handleCreateCategory()} className={btn}>Create category</button>
        <button onClick={() => void handleRenameCategory()} className={btn}>Rename category</button>
        <button onClick={() => void handleDeleteCategory()} className={btn}>Delete category</button>
        <button onClick={() => void refresh()} className={btn}>Refresh</button>
      </div>

      {status && <p className="text-xs text-blue-400 mb-3 font-mono">{status}</p>}

      <pre className="text-xs text-neutral-300 bg-neutral-900 rounded-lg p-3 overflow-auto font-mono">
        {tree.map((cat) => (
          <div key={cat.categoryId}>
            <span className="text-white">[{cat.categoryId}] {cat.categoryLabel}</span>
            {cat.tags.map((t) => (
              <div key={t.tagId} className="pl-4 text-neutral-400">
                ({t.tagId}) {t.label} · parent={String(t.parentTagId)} · used={t.usageCount}
              </div>
            ))}
          </div>
        ))}
      </pre>
    </div>
  )
}
