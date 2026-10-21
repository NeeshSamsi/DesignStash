import { ICON_STROKE } from '@renderer/design-system/icon'
import { useId, type ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { AiMagicIcon } from '@hugeicons/core-free-icons'
import { Field } from '@renderer/components/Field'
import { Input } from '@renderer/components/Input'
import { TagEditor, type TagEditorProps } from '@renderer/components/TagEditor'
import { cn } from '@renderer/lib/utils'
import { FieldTitle, Field as UiField } from '@renderer/ui/field'
import { Skeleton } from '@renderer/ui/skeleton'
import { Textarea } from '@renderer/ui/textarea'
import { textareaVariants } from '../Textarea/Textarea.variants'
import { MOCKUP_META_FORM_DEFAULTS, type MockupMetaFormContractProps } from './MockupMetaForm.types'
import { mockupMetaFormVariants } from './MockupMetaForm.variants'

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
}

const SAMPLE_TITLE = 'Mockup title'
const SAMPLE_DESCRIPTION =
  'Clay-style iPhone 15 Pro mockup on a warm beige backdrop, three-quarter angle.'
const THINKING_HINT = 'Sniffing out a title… this one’s still with the AI.'

/** The hint row above the fields: a sparkle and one line of caption. */
function AiHint({ children }: { children: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <HugeiconsIcon
        icon={AiMagicIcon}
        strokeWidth={ICON_STROKE}
        className="size-4 shrink-0 text-brand"
      />
      <p className="min-w-0 flex-1 type-caption-xs-regular text-muted-foreground">{children}</p>
    </div>
  )
}

/** A Skeleton in the shape of a field's box. */
function FieldSkeleton({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="type-label-xs-medium text-foreground">{label}</span>
      <div
        className={cn(
          'flex flex-col gap-2 rounded-lg border border-input bg-surface-2 p-3',
          lines.length > 1 ? 'h-20' : 'h-9.5'
        )}
      >
        {lines.map((width) => (
          <Skeleton key={width} className={cn('h-2.5 rounded-sm', width)} />
        ))}
      </div>
    </div>
  )
}

/**
 * MockupMetaForm — One title / description / tags editor for approval and detail.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=222-3346
 * The form shows no status of its own. In Detail an enabled Save means unsaved changes, and a
 * failed save is a toast, so `edited` looks like `pristine` here. `saving` locks the fields;
 * `invalid` is the empty title; `thinking` is the AI still working on all three.
 */
export function MockupMetaForm({
  className,
  title,
  onTitleChange,
  description = SAMPLE_DESCRIPTION,
  onDescriptionChange,
  tagEditor,
  ...rest
}: MockupMetaFormProps) {
  const { variant, state, showHint, hint, ...props } = { ...MOCKUP_META_FORM_DEFAULTS, ...rest }
  const id = useId()
  const approval = variant === 'approval'
  const thinking = approval && state === 'thinking'
  const saving = state === 'saving'
  const titleText = title ?? (state === 'invalid' ? '' : SAMPLE_TITLE)

  return (
    <div
      data-ds="MockupMetaForm"
      data-variant={variant}
      data-state={state}
      aria-busy={saving || thinking || undefined}
      className={cn(mockupMetaFormVariants({ variant, state }), className)}
      {...props}
    >
      {thinking ? (
        <>
          <AiHint>{THINKING_HINT}</AiHint>
          <div className="flex flex-col gap-5" aria-hidden>
            <FieldSkeleton label="Title" lines={['w-52']} />
            <FieldSkeleton label="Description" lines={['w-11/12', 'w-3/5']} />
          </div>
        </>
      ) : (
        <>
          {approval && showHint && <AiHint>{hint}</AiHint>}
          {approval && (
            <Field
              label="Title"
              required
              showDescription={false}
              invalid={state === 'invalid'}
              error="Title can't be empty."
              htmlFor={`${id}-title`}
            >
              <Input
                id={`${id}-title`}
                value={titleText}
                readOnly={saving}
                aria-invalid={state === 'invalid' || undefined}
                {...(onTitleChange && { onChange: (event) => onTitleChange(event.target.value) })}
              />
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
              className={cn('resize-none', textareaVariants({ rowRange: approval ? '4-6' : '3' }))}
              readOnly={saving}
              {...(onDescriptionChange
                ? {
                    value: description,
                    onChange: (event) => onDescriptionChange(event.target.value)
                  }
                : { defaultValue: description })}
            />
          </Field>
        </>
      )}
      <UiField>
        <FieldTitle id={`${id}-tags`}>Tags</FieldTitle>
        <div inert={saving || undefined}>
          <TagEditor
            aria-labelledby={`${id}-tags`}
            {...(thinking && { thinking: true, tags: [], suggestions: [] })}
            {...tagEditor}
          />
        </div>
      </UiField>
    </div>
  )
}
