import { coverUrl } from '@shared/cover-url'
import { Button } from '@renderer/components/Button'
import { FavouriteToggle } from '@renderer/components/FavouriteToggle'
import { Field } from '@renderer/components/Field'
import { Input } from '@renderer/components/Input'
import { MockupMetaForm } from '@renderer/components/MockupMetaForm'
import { TagChip } from '@renderer/components/TagChip'
import { Tooltip } from '@renderer/components/Tooltip'
import { ErrorState } from '@renderer/components/ErrorState'
import { useShortcut } from '@renderer/lib/shortcuts'
import { useDetailsStore } from '@renderer/stores/detailsStore'
import { detailsCaption, type DetailsKind } from './details-model'
import { PhotoshopAsk, SidebarActions, SidebarCover, SidebarHeader } from './SidebarParts'
import type { useDetailsData } from './use-details-data'

type Data = ReturnType<typeof useDetailsData>

export interface SingleViewProps {
  data: Data
  edit: boolean
  /** On the pile page the top mockup says so. */
  kind: Extract<DetailsKind, 'mockup' | 'top'>
}

/**
 * One mockup in the details sidebar: read-only first (Figma D2.3 B3), fields after Edit (B2).
 * Edits are explicit. Leaving with unsaved edits asks first (Esc, ✕, another card, Cancel).
 */
export function SingleView({ data, edit, kind }: SingleViewProps) {
  const { detail, form, setForm } = data
  const item = detail?.item
  const setDirty = useDetailsStore((s) => s.setDirty)

  // The store holds "unsaved edits" for the guard around every way out.
  const dirty = edit && data.dirty
  if (useDetailsStore.getState().dirty !== dirty) setDirty(dirty)

  const leaveEdit = () => {
    useDetailsStore.getState().guard(() => {
      data.reset()
      useDetailsStore.getState().setEditing(false)
    })
  }
  const save = async () => {
    if (await data.save()) useDetailsStore.getState().setEditing(false)
  }

  useShortcut({
    id: 'details.save',
    combo: 'mod+s',
    scope: 'global',
    handler: () => {
      if (edit && data.photoshop === null) void save()
    }
  })

  if (data.status === 'error') {
    return (
      <>
        <SidebarHeader caption="Mockup" />
        <ErrorState
          variant="inline"
          title="Couldn’t open this mockup"
          message="Try again in a moment."
          showDetails={false}
          retryLabel="Try again"
          onRetry={data.retry}
          secondaryLabel={null}
        />
      </>
    )
  }
  if (!item || data.status === 'loading') return <SidebarLoading />

  const src = item.coverPath ? coverUrl(item.coverPath, data.coverVersion) : undefined
  const caption = detailsCaption(item, kind)
  const star = (
    <FavouriteToggle
      variant="inline"
      pressed={item.favourite}
      aria-label={item.favourite ? `Remove star from ${item.title}` : `Star ${item.title}`}
      onPressedChange={(favourite) => void data.toggleFavourite(favourite)}
    />
  )

  const save$ = (
    <Button
      label={data.saving ? 'Saving…' : 'Save'}
      loading={data.saving}
      disabled={!data.dirty || data.blocked !== null}
      className="w-full"
      onClick={() => void save()}
    />
  )

  return (
    <>
      <SidebarHeader {...(edit ? {} : { title: item.title })} caption={caption}>
        {star}
      </SidebarHeader>
      <SidebarCover
        src={src}
        title={item.title}
        coverSource={item.coverSource}
        missing={item.coverMissing}
      />

      {edit ? (
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
          <Field
            label="Title"
            required={false}
            showDescription={false}
            invalid={data.blocked !== null}
            error={data.blocked ?? ''}
            htmlFor="details-title"
          >
            <Input
              id="details-title"
              value={form.title}
              readOnly={data.saving}
              aria-invalid={data.blocked !== null || undefined}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
            />
          </Field>
          <MockupMetaForm
            variant="detail"
            state={data.saving ? 'saving' : 'pristine'}
            description={form.description}
            onDescriptionChange={(description) =>
              setForm((current) => ({ ...current, description }))
            }
            tagEditor={{
              tags: form.tags,
              onTagsChange: (tags) => setForm((current) => ({ ...current, tags })),
              suggestions: [],
              vocabulary: data.vocabulary,
              onCreateTag: data.createTag
            }}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
          {item.description && (
            <p className="type-body-sm-regular text-muted-foreground">{item.description}</p>
          )}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <TagChip
                  key={tag.id}
                  variant="display"
                  category={tag.categoryLabel}
                  label={tag.label}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <SidebarActions>
        {edit ? (
          <>
            <Button variant="secondary" label="Cancel" className="w-full" onClick={leaveEdit} />
            {data.blocked !== null && data.dirty ? (
              <Tooltip label={data.blocked} arrow="bottom-right">
                <span
                  tabIndex={0}
                  className="flex w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {save$}
                </span>
              </Tooltip>
            ) : (
              save$
            )}
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              label="Edit"
              className="w-full"
              onClick={() => useDetailsStore.getState().setEditing(true)}
            />
            <Button
              label="Open in Photoshop"
              className="w-full"
              onClick={() => void data.openInPhotoshop()}
            />
          </>
        )}
      </SidebarActions>

      <PhotoshopAsk
        failure={data.photoshop}
        onCancel={data.dismissPhotoshop}
        onRetry={() => {
          data.dismissPhotoshop()
          void data.openInPhotoshop()
        }}
      />
    </>
  )
}

/** The loading sidebar: the same shapes as the loaded one, as plain blocks. */
export function SidebarLoading() {
  return (
    <div aria-busy className="flex flex-1 flex-col gap-5" data-state="loading">
      <div className="h-10 w-full rounded-lg bg-surface-3" />
      <div className="aspect-4/3 w-full rounded-card-cover bg-surface-3" />
      <div className="h-5 w-3/4 rounded-sm bg-surface-3" />
    </div>
  )
}
