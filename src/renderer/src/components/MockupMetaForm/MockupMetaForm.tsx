import { useId, type ComponentProps } from 'react'
import { Field } from '@renderer/components/Field'
import { Input } from '@renderer/components/Input'
import { TagEditor, type TagEditorProps } from '@renderer/components/TagEditor'
import { TitlePair, type TitlePairProps } from '@renderer/components/TitlePair'
import { Textarea } from '@renderer/components/Textarea'
import { cn } from '@renderer/lib/utils'
import { MOCKUP_META_FORM_DEFAULTS, type MockupMetaFormContractProps } from './MockupMetaForm.types'
import { mockupMetaFormVariants } from './MockupMetaForm.variants'

/** The three things the AI writes for a mockup. */
export type MetaField = 'title' | 'description' | 'tags'

const ALL_FIELDS: readonly MetaField[] = ['title', 'description', 'tags']

export interface MockupMetaFormProps
  extends
    MockupMetaFormContractProps,
    Omit<ComponentProps<'div'>, keyof MockupMetaFormContractProps | 'title' | 'children'> {
  /** approval only: Detail edits the title in the modal header. Figma's sample until given. */
  title?: string
  onTitleChange?: (title: string) => void
  /** Figma's sample until given. */
  description?: string
  onDescriptionChange?: (description: string) => void
  /** The tags field: pass the tags, suggestions and handlers here. */
  tagEditor?: Omit<TagEditorProps, 'variant' | 'state' | 'thinking' | 'aria-labelledby'>
  /**
   * The fields the AI is still writing, in any state (`writing` alone means all three). Typing in
   * one makes it the person's, so the caller drops it from the list (look-over.md, L6.2).
   */
  writingFields?: readonly MetaField[]
  /** The fields the AI just filled: they take the fading tint (L6.3). */
  filledFields?: readonly MetaField[]
  /**
   * A mockup in a pile (pile-titles.md): the Title is its base and its variation (TitlePair). The AI
   * writes the variation, so the title's writing state and tint go to it; the base is already known.
   */
  titlePair?: Omit<TitlePairProps, 'baseId' | 'baseState' | 'variationState'>
}

const SAMPLE_TITLE = 'Mockup title'
const SAMPLE_DESCRIPTION =
  'Clay-style iPhone 15 Pro mockup on a warm beige backdrop, three-quarter angle.'

/**
 * MockupMetaForm — One title / description / tags editor for approval and detail.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=222-3346
 * The form shows no status of its own: what the AI is doing lives in AiStatus above it. In Detail
 * an enabled Save means unsaved changes, and a failed save is a toast, so `edited` looks like
 * `pristine` here. `saving` locks the fields; `invalid` is the empty title; `writing` is the AI
 * still writing, with every field still typeable (or only `writingFields`, in any state).
 * `thinking` (a skeleton) is superseded by writing.
 */
export function MockupMetaForm({
  className,
  title,
  onTitleChange,
  description = SAMPLE_DESCRIPTION,
  onDescriptionChange,
  tagEditor,
  writingFields,
  filledFields = [],
  titlePair,
  ...rest
}: MockupMetaFormProps) {
  const { variant, state, ...props } = { ...MOCKUP_META_FORM_DEFAULTS, ...rest }
  const id = useId()
  const approval = variant === 'approval'
  const writing = state === 'writing' || state === 'thinking'
  const writes = (field: MetaField) =>
    (writingFields ?? (writing ? ALL_FIELDS : [])).includes(field)
  const filled = (field: MetaField) => !writes(field) && filledFields.includes(field)
  const saving = state === 'saving'
  const titleText = title ?? (state === 'invalid' ? '' : SAMPLE_TITLE)
  const titleState = writes('title') ? 'writing' : filled('title') ? 'ai-filled' : 'default'

  return (
    <div
      data-ds="MockupMetaForm"
      data-variant={variant}
      data-state={state}
      aria-busy={saving || undefined}
      className={cn(mockupMetaFormVariants({ variant, state }), className)}
      {...props}
    >
      {approval && (
        <Field
          label="Title"
          required
          showDescription={false}
          invalid={state === 'invalid'}
          error="Title can't be empty."
          htmlFor={`${id}-title`}
        >
          {titlePair ? (
            <TitlePair {...titlePair} baseId={`${id}-title`} variationState={titleState} />
          ) : (
            <Input
              id={`${id}-title`}
              value={titleText}
              state={titleState}
              readOnly={saving}
              aria-invalid={state === 'invalid' || undefined}
              {...(onTitleChange && { onChange: (event) => onTitleChange(event.target.value) })}
            />
          )}
        </Field>
      )}
      <Field
        label="Description"
        required={false}
        showDescription={false}
        htmlFor={`${id}-description`}
      >
        <Textarea
          id={`${id}-description`}
          rowRange={approval ? '4-6' : '3'}
          state={
            writes('description') ? 'writing' : filled('description') ? 'ai-filled' : 'default'
          }
          className="resize-none"
          readOnly={saving}
          value={description}
          {...(onDescriptionChange && {
            onChange: (event) => onDescriptionChange(event.target.value)
          })}
        />
      </Field>
      <Field label="Tags" labelId={`${id}-tags`} required={false} showDescription={false}>
        <div inert={saving || undefined}>
          <TagEditor
            aria-labelledby={`${id}-tags`}
            {...tagEditor}
            {...(writes('tags') && { thinking: true, tags: [], suggestions: [] })}
          />
        </div>
      </Field>
    </div>
  )
}
