import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ApprovalTag } from '@shared/approval'
import { IPC_CHANNELS } from '@shared/ipc'
import type { CoverChange, MockupDetail } from '@shared/library'
import type { TagTree } from '@shared/tags'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { CoverPanel } from '../../components/CoverPanel'
import { DetailModalLayout } from '../../components/DetailModalLayout'
import { Lightbox } from '../../components/Lightbox'
import { MockupMetaForm } from '../../components/MockupMetaForm'
import type { NewTagRequest, TagVocabularyCategory } from '../../components/TagEditor'
import { VariantStrip, type StripVariant } from '../../components/VariantStrip'
import { isEditableTarget } from '../../lib/cover-drop'
import { useShortcut } from '../../lib/shortcuts'
import { toast, undoToast } from '../../stores/toastStore'
import { useDetailEffects } from '../../stores/detailEffectsStore'
import {
  draftOf,
  formFromDetail,
  isDirty,
  panelSource,
  photoshopFailureCopy,
  saveBlockedReason,
  type DetailDraft,
  type DetailForm
} from './detail-edits'
import { syncLibrary } from './library-sync'

interface Props {
  mockupId: number
  onClose: () => void
}

type Status = 'loading' | 'ready' | 'error'
type CoverUi = 'default' | 'replacing' | 'error'

const fileUrl = (path: string, version: number) =>
  path === '' ? undefined : `file://${path}${version > 0 ? `?v=${version}` : ''}`

const toVocabulary = (tree: TagTree): TagVocabularyCategory[] =>
  tree.map(({ categoryId, categoryLabel, tags }) => ({ categoryId, categoryLabel, tags }))

/**
 * Detail & edit (D1 to D3): one mockup or pile, always editable. Edits are explicit: Save appears once
 * something changed and ⌘S saves; closing with changes asks Keep editing or Discard. Trash and Disband
 * pile are instant, with an Undo toast. Layout is DetailModalLayout; this holds the data and the actions.
 * Rules: design/specs/detail.md and cover.md.
 */
export function DetailModal({ mockupId, onClose }: Props) {
  const [activeId, setActiveId] = useState(mockupId)
  const [status, setStatus] = useState<Status>('loading')
  const [loadKey, setLoadKey] = useState(0)
  const [detail, setDetail] = useState<MockupDetail | null>(null)
  const [vocabulary, setVocabulary] = useState<TagVocabularyCategory[]>([])
  const [form, setForm] = useState<DetailForm>({ title: '', description: '', tags: [] })
  const [saved, setSaved] = useState<DetailDraft>({ title: '', description: '', tagIds: [] })
  const [saving, setSaving] = useState(false)
  const [shownId, setShownId] = useState(mockupId)
  const [coverUi, setCoverUi] = useState<CoverUi>('default')
  const [coverVersion, setCoverVersion] = useState(0)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | undefined>()
  const [zoomOpen, setZoomOpen] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [photoshop, setPhotoshop] = useState<'no-app' | 'failed' | null>(null)
  // A replace the person cancelled with Esc: its result must not touch the screen.
  const replaceToken = useRef(0)

  const item = detail?.item
  const variants = useMemo(() => detail?.variants ?? [], [detail])
  const pile = variants.length > 0
  const shownIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.id === shownId)
  )
  const shownVariant = pile ? variants[shownIndex] : undefined
  const draft = draftOf(form)
  const dirty = status === 'ready' && isDirty(saved, draft)
  const blocked = saveBlockedReason(draft)

  // -- Loading --------------------------------------------------------------------------------

  const fetchDetail = useCallback(async (id: number) => {
    try {
      const [detailRes, treeRes] = await Promise.all([
        window.api.invoke(IPC_CHANNELS.MOCKUP_DETAIL, { mockupId: id }),
        window.api.invoke(IPC_CHANNELS.TAG_TREE, undefined)
      ])
      if (!detailRes.success) return null
      return { detail: detailRes.data, tree: treeRes.success ? treeRes.data.tree : [] }
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    let live = true
    void (async () => {
      setStatus('loading')
      const loaded = await fetchDetail(activeId)
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
      setShownId(loaded.detail.item.id)
      setStatus('ready')
    })()
    return () => {
      live = false
    }
    // activeId only changes through refresh(), which loads by itself; loadKey is Retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey, fetchDetail])

  /** Reload after the main process changed something, keeping what has been typed. */
  const refresh = useCallback(
    async (id: number) => {
      const loaded = await fetchDetail(id)
      if (!loaded) return
      setActiveId(id)
      setDetail(loaded.detail)
      setVocabulary(toVocabulary(loaded.tree))
      setCoverVersion((version) => version + 1)
    },
    [fetchDetail]
  )

  // -- Closing --------------------------------------------------------------------------------

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  // -- Saving ---------------------------------------------------------------------------------

  const save = async () => {
    if (!item || saving || !dirty || blocked !== null) return
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
      toast('Changes saved', 'success')
      void syncLibrary()
    } else {
      // The edits stay in the form and Save stays on: it is the retry, so the toast has none.
      toast({
        variant: 'error',
        message: 'Couldn’t save your changes',
        description: 'Your edits are still here. Try saving again.'
      })
    }
  }

  useShortcut({
    id: 'detail.save',
    combo: 'mod+s',
    scope: 'global',
    handler: () => {
      if (!confirmDiscard && photoshop === null) void save()
    }
  })

  // -- Header actions -------------------------------------------------------------------------

  const toggleFavourite = async (favourite: boolean) => {
    if (!item) return
    setDetail((current) =>
      current ? { ...current, item: { ...current.item, favourite } } : current
    )
    const res = await window.api
      .invoke(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, { mockupId: item.id, favourite })
      .catch(() => null)
    if (res?.success) void syncLibrary()
    else
      setDetail((current) =>
        current ? { ...current, item: { ...current.item, favourite: !favourite } } : current
      )
  }

  const trash = async () => {
    if (!item) return
    const id = item.id
    const res = await window.api.invoke(IPC_CHANNELS.MOCKUP_TRASH, { ids: [id] }).catch(() => null)
    if (!res?.success) {
      toast({
        variant: 'error',
        message: 'Couldn’t move it to Trash',
        description: 'Nothing was changed. Try again.'
      })
      return
    }
    onClose()
    void syncLibrary()
    undoToast('Moved to Trash', () => {
      void window.api.invoke(IPC_CHANNELS.MOCKUP_RESTORE, { ids: [id] }).then(() => syncLibrary())
    })
  }

  // ⌘⌫ moves to Trash, except while typing: there it deletes to the start of the line, as in any field.
  const trashRef = useRef(trash)
  useEffect(() => {
    trashRef.current = trash
  })
  const trashAllowed = status === 'ready' && !confirmDiscard && photoshop === null
  useEffect(() => {
    if (!trashAllowed) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.key === 'Backspace' && !isEditableTarget(event.target)) {
        event.preventDefault()
        void trashRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [trashAllowed])

  // -- Footer actions -------------------------------------------------------------------------

  const openInPhotoshop = async () => {
    if (!item) return
    const target = shownVariant?.id ?? item.id
    const res = await window.api
      .invoke(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL, { mockupId: target })
      .catch(() => null)
    if (!res?.success) setPhotoshop('failed')
    else if (!res.data.opened) setPhotoshop(res.data.reason)
  }

  const disband = async () => {
    if (!item) return
    const res = await window.api
      .invoke(IPC_CHANNELS.PILE_DISBAND, { pileId: item.id })
      .catch(() => null)
    if (!res?.success) {
      toast({
        variant: 'error',
        message: 'Couldn’t break up the pile',
        description: 'Nothing was changed. Try again.'
      })
      return
    }
    const { snapshot, freedIds } = res.data
    useDetailEffects.getState().selectAfterReload(freedIds)
    onClose()
    void syncLibrary()
    undoToast(
      'Pile broken up',
      () => {
        useDetailEffects.getState().selectAfterReload([])
        void window.api.invoke(IPC_CHANNELS.PILE_RESTORE, { snapshot }).then(() => syncLibrary())
      },
      `${freedIds.length} mockups are on their own`
    )
  }

  const putOnTop = async (variantId: number) => {
    if (!item) return
    const label = variants.find((variant) => variant.id === variantId)?.title ?? 'It'
    const previousTop = item.id
    const res = await window.api
      .invoke(IPC_CHANNELS.PILE_SET_TOP, { pileId: previousTop, topId: variantId })
      .catch(() => null)
    if (!res?.success) {
      toast({
        variant: 'error',
        message: 'Couldn’t put it on top',
        description: 'Nothing was changed. Try again.'
      })
      return
    }
    const { pileId, snapshot } = res.data
    await refresh(pileId)
    void syncLibrary()
    undoToast(`${label} is on top`, () => {
      void window.api
        .invoke(IPC_CHANNELS.PILE_RESTORE, { snapshot })
        .then(() => refresh(previousTop))
        .then(() => syncLibrary())
    })
  }

  // -- Cover ----------------------------------------------------------------------------------

  const applyCover = (change: CoverChange) => {
    if (!change.ok) {
      setCoverUi('error')
      return
    }
    setCoverUi('default')
    setImageSize({ width: change.width, height: change.height })
    setCoverVersion((version) => version + 1)
    setDetail((current) => {
      if (!current) return current
      const onTop = !shownVariant || shownVariant.id === current.item.id
      return {
        item: onTop
          ? {
              ...current.item,
              coverPath: change.coverPath,
              coverSource: change.coverSource,
              coverMissing: false
            }
          : current.item,
        variants: current.variants.map((variant) =>
          variant.id === (shownVariant?.id ?? current.item.id)
            ? { ...variant, coverPath: change.coverPath, coverMissing: false }
            : variant
        )
      }
    })
    void syncLibrary()
  }

  const changeCover = async (run: () => Promise<CoverChange | null>, message: string) => {
    const token = ++replaceToken.current
    setCoverUi('replacing')
    const change = await run()
    if (token !== replaceToken.current) {
      // Cancelled with Esc: the change may still have happened, so show what is really there.
      if (item) void refresh(item.id)
      return
    }
    if (!change) {
      setCoverUi('error')
      return
    }
    applyCover(change)
    if (change.ok && item) {
      const targetId = shownVariant?.id ?? item.id
      undoToast(message, () => {
        const { previous } = change
        const revert =
          previous.coverSource === 'embedded'
            ? window.api.invoke(IPC_CHANNELS.MOCKUP_USE_EMBEDDED_COVER, { mockupId: targetId })
            : window.api.invoke(IPC_CHANNELS.MOCKUP_SET_COVER, {
                mockupId: targetId,
                filePath: previous.coverPath
              })
        void revert.then((res) => {
          if (res.success) applyCover(res.data)
        })
      })
    }
  }

  const replaceCover = (file: File) => {
    const target = shownVariant?.id ?? item?.id
    if (target === undefined) return
    void changeCover(async () => {
      const res = await window.api
        .invoke(IPC_CHANNELS.MOCKUP_SET_COVER, {
          mockupId: target,
          filePath: window.api.getPathForFile(file)
        })
        .catch(() => null)
      return res?.success ? res.data : null
    }, 'Cover replaced')
  }

  const useEmbeddedCover = () => {
    const target = shownVariant?.id ?? item?.id
    if (target === undefined) return
    void changeCover(async () => {
      const res = await window.api
        .invoke(IPC_CHANNELS.MOCKUP_USE_EMBEDDED_COVER, { mockupId: target })
        .catch(() => null)
      return res?.success ? res.data : null
    }, 'Using the PSD’s preview')
  }

  // -- Tags -----------------------------------------------------------------------------------

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

  // -- Render ---------------------------------------------------------------------------------

  const stripVariants = useMemo<StripVariant[]>(
    () =>
      variants.map((variant) => {
        const src = fileUrl(variant.coverPath, coverVersion)
        return {
          id: String(variant.id),
          label: variant.title,
          top: variant.isTop,
          missingCover: variant.coverMissing,
          ...(src ? { coverSrc: src } : {})
        }
      }),
    [variants, coverVersion]
  )
  const stepShown = (delta: -1 | 1) => {
    const next = variants[shownIndex + delta]
    if (next) setShownId(next.id)
  }

  const coverPath = shownVariant?.coverPath ?? item?.coverPath ?? ''
  const coverMissing = shownVariant?.coverMissing ?? item?.coverMissing ?? false
  const onTopCover = !shownVariant || shownVariant.isTop
  const source = panelSource(coverPath, onTopCover ? (item?.coverSource ?? 'embedded') : 'embedded')
  const coverSrc = fileUrl(coverPath, coverVersion)
  const layoutState =
    status === 'loading'
      ? 'loading'
      : status === 'error'
        ? 'error'
        : saving
          ? 'saving'
          : dirty
            ? 'dirty'
            : 'loaded'

  const media = item && (
    <>
      <CoverPanel
        source={source}
        state={coverUi}
        coverMissing={coverMissing}
        sidecarAccepted
        showDeck={pile}
        deckMore={variants.length > 2}
        deckLabel=""
        {...(pile ? { variantIndex: shownIndex } : {})}
        {...(coverSrc ? { coverSrc } : {})}
        {...(imageSize ? { imageSize } : {})}
        onCover={replaceCover}
        onUsePsdPreview={useEmbeddedCover}
        onCancelReplace={() => {
          replaceToken.current += 1
          setCoverUi('default')
          void refresh(item.id)
        }}
        onZoom={() => setZoomOpen(true)}
      />
      {pile && (
        <VariantStrip
          variants={stripVariants}
          shownId={String(shownId)}
          onShow={(id) => setShownId(Number(id))}
          onPutOnTop={(id) => void putOnTop(Number(id))}
        />
      )}
    </>
  )

  const meta = (
    <MockupMetaForm
      variant="detail"
      state={saving ? 'saving' : 'pristine'}
      description={form.description}
      onDescriptionChange={(description) => setForm((current) => ({ ...current, description }))}
      tagEditor={{
        tags: form.tags,
        onTagsChange: (tags) => setForm((current) => ({ ...current, tags })),
        suggestions: [],
        vocabulary,
        onCreateTag: createTag
      }}
    />
  )

  const psCopy = photoshopFailureCopy(photoshop ?? 'failed')

  return (
    <>
      <DetailModalLayout
        open
        variant={pile ? 'group' : 'single'}
        state={layoutState}
        onClose={requestClose}
        title={form.title}
        onTitleChange={(title) => setForm((current) => ({ ...current, title }))}
        titleInvalid={blocked !== null}
        favourite={item?.favourite ?? false}
        onToggleFavourite={(favourite) => void toggleFavourite(favourite)}
        onTrash={() => void trash()}
        {...(media ? { media } : {})}
        meta={meta}
        {...(dirty && blocked !== null ? { saveDisabledReason: blocked } : {})}
        onSave={() => void save()}
        onDisband={() => void disband()}
        onOpenInPhotoshop={() => void openInPhotoshop()}
        onRetry={() => setLoadKey((key) => key + 1)}
      />

      <Lightbox
        open={zoomOpen}
        mode={pile ? 'group' : 'single'}
        state={coverMissing ? 'missing' : 'loaded'}
        onClose={() => setZoomOpen(false)}
        {...(coverSrc ? { src: coverSrc } : {})}
        {...(pile && shownIndex > 0 ? { onPrev: () => stepShown(-1) } : {})}
        {...(pile && shownIndex < variants.length - 1 ? { onNext: () => stepShown(1) } : {})}
        onCheckLibrary={() => setZoomOpen(false)}
      />

      <ConfirmDialog
        open={confirmDiscard}
        variant="destructive"
        detail={false}
        title="Discard your changes?"
        description="Your edits to this mockup won’t be saved."
        cancelLabel="Keep editing"
        confirmLabel="Discard"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false)
          onClose()
        }}
      />

      <ConfirmDialog
        open={photoshop !== null}
        variant="neutral"
        detail={false}
        title={psCopy.title}
        description={psCopy.description}
        cancelLabel="Cancel"
        confirmLabel="Try again"
        onCancel={() => setPhotoshop(null)}
        onConfirm={() => {
          setPhotoshop(null)
          void openInPhotoshop()
        }}
      />
    </>
  )
}
