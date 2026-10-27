import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ApprovalTag } from '@shared/approval'
import { IPC_CHANNELS } from '@shared/ipc'
import type { CoverChange, MockupDetail } from '@shared/library'
import type { TagTree } from '@shared/tags'
import { coverRefusal } from '@renderer/components/CoverPanel/cover-refusal'
import type { NewTagRequest, TagVocabularyCategory } from '@renderer/components/TagEditor'
import { useDetailEffects } from '@renderer/stores/detailEffectsStore'
import { useLibraryStore } from '@renderer/stores/libraryStore'
import { useTagTreeStore } from '@renderer/stores/tagTreeStore'
import { toast, undoToast } from '@renderer/stores/toastStore'
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

/** The cover panel's state while a cover is being changed. */
export type CoverUi = 'default' | 'replacing' | 'error'

const toVocabulary = (tree: TagTree): TagVocabularyCategory[] =>
  tree.map(({ categoryId, categoryLabel, tags }) => ({ categoryId, categoryLabel, tags }))

async function fetchDetail(id: number) {
  try {
    const [detailRes, tree] = await Promise.all([
      window.api.invoke(IPC_CHANNELS.MOCKUP_DETAIL, { mockupId: id }),
      useTagTreeStore.getState().load()
    ])
    if (!detailRes.success || !detailRes.data?.item) return null
    return { detail: detailRes.data, tree }
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
  const tagTree = useTagTreeStore((s) => s.tree)
  const vocabulary = useMemo(() => toVocabulary(tagTree ?? []), [tagTree])
  const [form, setForm] = useState<DetailForm>({
    title: '',
    variation: null,
    description: '',
    tags: []
  })
  const [saved, setSaved] = useState<DetailDraft>({
    title: '',
    variation: null,
    description: '',
    tagIds: []
  })
  const [saving, setSaving] = useState(false)
  /** Photoshop didn't open: why, and which mockup, so Try again opens the same one. */
  const [photoshop, setPhotoshop] = useState<{ reason: PhotoshopFailure; mockupId: number } | null>(
    null
  )
  /** Bumps when a cover changed, so the <img> asks for the new file. */
  const [coverVersion, setCoverVersion] = useState(0)
  const [coverUi, setCoverUi] = useState<CoverUi>('default')
  /** Why main kept the cover (a PSD preview that is only the kit's notice, or none); the panel's error line. */
  const [coverError, setCoverError] = useState<string | undefined>(undefined)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | undefined>()
  // A replace the person cancelled with Esc: its result must not touch the screen.
  const replaceToken = useRef(0)

  const revision = useDetailEffects((s) => s.revision)
  // The grid behind reloads after a pile is made or a mockup starred: show what it now holds.
  const gridItems = useLibraryStore((s) => s.items)

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
      setForm(next)
      setSaved(draftOf(next))
      setStatus('ready')
    })()
    return () => {
      live = false
    }
  }, [id, loadKey])

  /**
   * Fetches the mockup again and shows it. The cover always asks for its file again, because a
   * reload is how a change made elsewhere (or a cancelled replace) becomes visible. The cover panel
   * goes back to its resting state unless `keepCoverUi` says a replace is still under way.
   */
  const refreshDetail = async (
    mockupId: number,
    options: { keepCoverUi?: boolean } = {},
    stillWanted: () => boolean = () => true
  ) => {
    const loaded = await fetchDetail(mockupId)
    if (!loaded || !stillWanted()) return
    setDetail(loaded.detail)
    setCoverVersion((version) => version + 1)
    if (!options.keepCoverUi) {
      setCoverUi('default')
      setImageSize(undefined)
    }
  }

  /** Something changed elsewhere (a star in the grid, a pile edit): show the fresh state, keep what is typed. */
  const seen = useRef({ revision, gridItems })
  useEffect(() => {
    const unchanged = seen.current.revision === revision && seen.current.gridItems === gridItems
    seen.current = { revision, gridItems }
    if (unchanged || status !== 'ready') return
    let live = true
    void refreshDetail(id, { keepCoverUi: true }, () => live)
    return () => {
      live = false
    }
    // Only a change elsewhere reloads; the form is the person's until they save or cancel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, gridItems])

  const draft = draftOf(form)
  const dirty = status === 'ready' && isDirty(saved, draft)
  const blocked = saveBlockedReason(draft)

  /** Put the form back to what was last saved. */
  const reset = useCallback(() => {
    setForm((current) => {
      if (!detail) return current
      return {
        title: saved.title,
        variation: saved.variation,
        description: saved.description,
        tags: current.tags.filter((tag) => saved.tagIds.includes(tag.tagId))
      }
    })
  }, [detail, saved])

  /**
   * A pile mockup's variation left empty: when focus leaves it takes its last saved words back, so
   * every mockup in a pile keeps one (pile-titles.md). Nothing saves until Save.
   */
  const restoreVariation = () =>
    setForm((current) =>
      current.variation !== null && current.variation.trim() === ''
        ? { ...current, variation: saved.variation }
        : current
    )

  /** Saves the form. True once it is saved; on failure the edits stay and Save is the retry. */
  const save = async (): Promise<boolean> => {
    const item = detail?.item
    if (!item || saving || !dirty || blocked !== null) return false
    setSaving(true)
    // In a pile the title is the base (renaming every mockup in it) and the variation its own words,
    // never saved empty.
    const variation = draft.variation === null ? null : draft.variation.trim() || saved.variation
    const next = { ...draft, title: draft.title.trim(), variation }
    const res = await window.api
      .invoke(IPC_CHANNELS.MOCKUP_UPDATE, {
        mockupId: item.id,
        title: next.title,
        ...(variation !== null ? { variation } : {}),
        description: next.description,
        tagIds: next.tagIds
      })
      .catch(() => null)
    setSaving(false)
    if (res?.success) {
      setSaved(next)
      setForm((current) => ({ ...current, title: next.title, variation }))
      setDetail((current) =>
        current
          ? {
              ...current,
              item: {
                ...current.item,
                title: next.title,
                variation:
                  variation === null
                    ? null
                    : variation === saved.variation && current.item.variation
                      ? current.item.variation
                      : { words: variation, source: 'typed' },
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
    if (!res?.success) setPhotoshop({ reason: 'failed', mockupId: target })
    else if (!res.data.opened) setPhotoshop({ reason: res.data.reason, mockupId: target })
  }

  /** Breaks the pile up into its mockups, with an Undo toast. True once it is done. */
  const disband = async (): Promise<boolean> => (detail ? disbandPile(detail.item.id) : false)

  // -- Cover ----------------------------------------------------------------------------------
  // A cover change is not a form edit: it applies at once, with an Undo toast, and Save stays out of it.

  const applyCover = (change: CoverChange) => {
    if (!change.ok) {
      setCoverError(coverRefusal(change.reason))
      setCoverUi('error')
      return
    }
    setCoverError(undefined)
    setCoverUi('default')
    setImageSize({ width: change.width, height: change.height })
    setCoverVersion((version) => version + 1)
    setDetail((current) =>
      current
        ? {
            ...current,
            item: {
              ...current.item,
              coverPath: change.coverPath,
              coverSource: change.coverSource,
              coverMissing: false
            }
          }
        : current
    )
    void syncLibrary()
  }

  const changeCover = async (run: () => Promise<CoverChange | null>, message: string) => {
    const item = detail?.item
    if (!item) return
    const token = ++replaceToken.current
    setCoverUi('replacing')
    const change = await run()
    if (token !== replaceToken.current) {
      // Cancelled with Esc: the change may still have happened, so show what is really there.
      // A newer replace may be under way; leave its panel state alone.
      void refreshDetail(item.id, { keepCoverUi: true })
      return
    }
    if (!change) {
      setCoverError(undefined)
      setCoverUi('error')
      return
    }
    applyCover(change)
    if (change.ok) {
      undoToast(message, () => {
        const { previous } = change
        const revert =
          previous.coverSource === 'embedded'
            ? window.api.invoke(IPC_CHANNELS.MOCKUP_USE_EMBEDDED_COVER, { mockupId: item.id })
            : window.api.invoke(IPC_CHANNELS.MOCKUP_SET_COVER, {
                mockupId: item.id,
                filePath: previous.coverPath
              })
        void revert.then((res) => {
          if (res.success) applyCover(res.data)
        })
      })
    }
  }

  const replaceCover = (file: File) => {
    const id = detail?.item.id
    if (id === undefined) return
    void changeCover(async () => {
      const res = await window.api
        .invoke(IPC_CHANNELS.MOCKUP_SET_COVER, {
          mockupId: id,
          filePath: window.api.getPathForFile(file)
        })
        .catch(() => null)
      return res?.success ? res.data : null
    }, 'Cover replaced')
  }

  const useEmbeddedCover = () => {
    const id = detail?.item.id
    if (id === undefined) return
    void changeCover(async () => {
      const res = await window.api
        .invoke(IPC_CHANNELS.MOCKUP_USE_EMBEDDED_COVER, { mockupId: id })
        .catch(() => null)
      return res?.success ? res.data : null
    }, 'Using the PSD’s preview')
  }

  /** Esc while replacing: the old cover stays. */
  const cancelReplace = () => {
    replaceToken.current += 1
    setCoverUi('default')
    const id = detail?.item.id
    if (id === undefined) return
    void refreshDetail(id)
  }

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
      const { addTag, load } = useTagTreeStore.getState()
      addTag(
        { categoryId, categoryLabel: request.categoryLabel },
        { tagId: tag.tagId, label: tag.label }
      )
      void load()
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
    restoreVariation,
    dirty,
    blocked,
    saving,
    photoshop: photoshop?.reason ?? null,
    dismissPhotoshop: () => setPhotoshop(null),
    /** Try again: opens the mockup that didn't open, in a pile too. */
    retryPhotoshop: () => {
      const failed = photoshop
      setPhotoshop(null)
      if (failed) void openInPhotoshop(failed.mockupId)
    },
    coverVersion,
    coverUi,
    coverError,
    imageSize,
    replaceCover,
    useEmbeddedCover,
    cancelReplace,
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
