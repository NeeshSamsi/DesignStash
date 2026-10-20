import { useCallback, useEffect, useState } from 'react'
import type { ApprovalTag } from '@shared/approval'
import { IPC_CHANNELS } from '@shared/ipc'
import type { MockupDetail } from '@shared/library'
import type { TagTree } from '@shared/tags'
import type { NewTagRequest, TagVocabularyCategory } from '@renderer/components/TagEditor'
import { useDetailEffects } from '@renderer/stores/detailEffectsStore'
import { toast } from '@renderer/stores/toastStore'
import {
  draftOf,
  formFromDetail,
  isDirty,
  saveBlockedReason,
  type DetailDraft,
  type DetailForm
} from './detail-edits'
import { syncLibrary } from './library-sync'
import { disbandPile } from './pile-actions'

type Status = 'loading' | 'ready' | 'error'

const toVocabulary = (tree: TagTree): TagVocabularyCategory[] =>
  tree.map(({ categoryId, categoryLabel, tags }) => ({ categoryId, categoryLabel, tags }))

async function fetchDetail(id: number) {
  try {
    const [detailRes, treeRes] = await Promise.all([
      window.api.invoke(IPC_CHANNELS.MOCKUP_DETAIL, { mockupId: id }),
      window.api.invoke(IPC_CHANNELS.TAG_TREE, undefined)
    ])
    if (!detailRes.success || !detailRes.data?.item) return null
    return { detail: detailRes.data, tree: treeRes.success ? treeRes.data.tree : [] }
  } catch {
    return null
  }
}

/** Why Photoshop did not open, for the retry ask. */
export type PhotoshopFailure = 'no-app' | 'failed'

/**
 * What the sidebar needs for one mockup or pile: the loaded details, the edit form, and the actions
 * (save, star, Photoshop, disband, new tags). Edits are explicit: nothing saves until `save` runs.
 * The page behind reloads through `syncLibrary` whenever something it shows has changed.
 */
export function useDetailsData(id: number) {
  const [status, setStatus] = useState<Status>('loading')
  const [loadKey, setLoadKey] = useState(0)
  const [detail, setDetail] = useState<MockupDetail | null>(null)
  const [vocabulary, setVocabulary] = useState<TagVocabularyCategory[]>([])
  const [form, setForm] = useState<DetailForm>({ title: '', description: '', tags: [] })
  const [saved, setSaved] = useState<DetailDraft>({ title: '', description: '', tagIds: [] })
  const [saving, setSaving] = useState(false)
  const [photoshop, setPhotoshop] = useState<PhotoshopFailure | null>(null)
  /** Bumps when a cover changed, so the <img> asks for the new file. */
  const [coverVersion, setCoverVersion] = useState(0)

  const revision = useDetailEffects((s) => s.revision)

  useEffect(() => {
    let live = true
    void (async () => {
      const loaded = await fetchDetail(id)
      if (!live) return
      if (!loaded) {
        setStatus('error')
        return
      }
      const next = formFromDetail(loaded.detail, loaded.tree)
      setDetail(loaded.detail)
      setVocabulary(toVocabulary(loaded.tree))
      setForm(next)
      setSaved(draftOf(next))
      setStatus('ready')
    })()
    return () => {
      live = false
    }
  }, [id, loadKey])

  /** Something changed elsewhere (a star in the grid, a pile edit): show the fresh state, keep what is typed. */
  useEffect(() => {
    if (revision === 0 || status !== 'ready') return
    let live = true
    void fetchDetail(id).then((loaded) => {
      if (!live || !loaded) return
      setDetail(loaded.detail)
      setCoverVersion((version) => version + 1)
    })
    return () => {
      live = false
    }
    // Only a change elsewhere reloads; the form is the person's until they save or cancel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])

  const draft = draftOf(form)
  const dirty = status === 'ready' && isDirty(saved, draft)
  const blocked = saveBlockedReason(draft)

  /** Put the form back to what was last saved. */
  const reset = useCallback(() => {
    setForm((current) => {
      if (!detail) return current
      return {
        title: saved.title,
        description: saved.description,
        tags: current.tags.filter((tag) => saved.tagIds.includes(tag.tagId))
      }
    })
  }, [detail, saved])

  /** Saves the form. True once it is saved; on failure the edits stay and Save is the retry. */
  const save = async (): Promise<boolean> => {
    const item = detail?.item
    if (!item || saving || !dirty || blocked !== null) return false
    setSaving(true)
    const next = { ...draft, title: draft.title.trim() }
    const res = await window.api
      .invoke(IPC_CHANNELS.MOCKUP_UPDATE, {
        mockupId: item.id,
        title: next.title,
        description: next.description,
        tagIds: next.tagIds
      })
      .catch(() => null)
    setSaving(false)
    if (res?.success) {
      setSaved(next)
      setForm((current) => ({ ...current, title: next.title }))
      setDetail((current) =>
        current
          ? {
              ...current,
              item: {
                ...current.item,
                title: next.title,
                description: next.description,
                tags: form.tags.map((tag) => ({
                  id: tag.tagId,
                  label: tag.label,
                  categoryLabel: tag.categoryLabel
                }))
              }
            }
          : current
      )
      toast('Saved your changes', 'success')
      void syncLibrary()
      return true
    }
    toast({
      variant: 'error',
      message: 'Couldn’t save your changes',
      description: 'Your edits are still here. Try saving again.'
    })
    return false
  }

  const toggleFavourite = async (favourite: boolean) => {
    const item = detail?.item
    if (!item) return
    const set = (value: boolean) =>
      setDetail((current) =>
        current ? { ...current, item: { ...current.item, favourite: value } } : current
      )
    set(favourite)
    const res = await window.api
      .invoke(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, { mockupId: item.id, favourite })
      .catch(() => null)
    if (res?.success) void syncLibrary()
    else set(!favourite)
  }

  /** Opens a mockup in Photoshop. A pile opens its top mockup unless given another. */
  const openInPhotoshop = async (mockupId?: number) => {
    const target = mockupId ?? detail?.item.id
    if (target === undefined) return
    const res = await window.api
      .invoke(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL, { mockupId: target })
      .catch(() => null)
    if (!res?.success) setPhotoshop('failed')
    else if (!res.data.opened) setPhotoshop(res.data.reason)
  }

  /** Breaks the pile up into its mockups, with an Undo toast. True once it is done. */
  const disband = async (): Promise<boolean> => (detail ? disbandPile(detail.item.id) : false)

  const createTag = async (request: NewTagRequest): Promise<ApprovalTag> => {
    try {
      let categoryId = request.categoryId
      if (categoryId === null) {
        const category = await window.api.invoke(IPC_CHANNELS.CATEGORY_CREATE, {
          label: request.categoryLabel
        })
        if (!category.success) throw new Error('category')
        categoryId = category.data.categoryId
      }
      const created = await window.api.invoke(IPC_CHANNELS.TAG_CREATE, {
        label: request.label,
        categoryId
      })
      if (!created.success) throw new Error('tag')
      const tag = {
        tagId: created.data.tagId,
        label: created.data.label,
        categoryId: created.data.categoryId,
        categoryLabel: request.categoryLabel
      }
      const known = categoryId
      setVocabulary((current) =>
        current.some((category) => category.categoryId === known)
          ? current.map((category) =>
              category.categoryId === known
                ? {
                    ...category,
                    tags: [...category.tags, { tagId: tag.tagId, label: tag.label, usageCount: 0 }]
                  }
                : category
            )
          : [
              ...current,
              {
                categoryId: known,
                categoryLabel: request.categoryLabel,
                tags: [{ tagId: tag.tagId, label: tag.label, usageCount: 0 }]
              }
            ]
      )
      return tag
    } catch (error) {
      toast({
        variant: 'error',
        message: 'Couldn’t add that tag',
        description: 'Try again in a moment.'
      })
      throw error
    }
  }

  return {
    status,
    detail,
    vocabulary,
    form,
    setForm,
    dirty,
    blocked,
    saving,
    photoshop,
    dismissPhotoshop: () => setPhotoshop(null),
    coverVersion,
    retry: () => {
      setStatus('loading')
      setLoadKey((key) => key + 1)
    },
    reset,
    save,
    toggleFavourite,
    openInPhotoshop,
    disband,
    createTag
  }
}
