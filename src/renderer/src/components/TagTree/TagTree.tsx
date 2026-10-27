import { ICON_STROKE } from '@renderer/design-system/icon'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent
} from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Delete02Icon,
  Edit02Icon,
  FolderTransferIcon,
  GitMergeIcon,
  MoreHorizontalIcon,
  PlusSignIcon,
  Tag01Icon
} from '@hugeicons/core-free-icons'
import type { TagTree as TagTreeData, TagTreeNode } from '@shared/tags'
import { DropdownMenu, DropdownMenuDivider } from '@renderer/components/DropdownMenu/DropdownMenu'
import { DropdownMenuItem } from '@renderer/components/DropdownMenuItem'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/ui/button'
import { Skeleton } from '@renderer/ui/skeleton'
import { TAG_TREE_DEFAULTS, type TagTreeContractProps, type TagTreeState } from './TagTree.types'
import { sampleTreeFor } from './TagTree.samples'
import {
  addRowClass,
  categoryClass,
  categoryHeaderClass,
  newCategoryRowClass,
  rowHintClass,
  rowInputClass,
  tagRowClass,
  tagTreeVariants
} from './TagTree.variants'
import { pointMenuAlign } from '@renderer/lib/point-menu'

type Category = TagTreeData[number]
type Result = void | Promise<void>

export interface TagTreeProps
  extends
    TagTreeContractProps,
    Omit<ComponentProps<'div'>, keyof TagTreeContractProps | 'children'> {
  /** Categories with their tags and use counts. Figma's sample until given. */
  tree?: TagTreeData
  /** The first load is still running: skeleton containers. */
  loading?: boolean
  /** Add a tag to a category. A rejection keeps the input and its text open; the owner shows why. */
  onAddTag?: (categoryId: number, label: string) => Result
  /** Move an existing tag to another category ("Move it to Device", the Move to menu). */
  onMoveTag?: (tagId: number, categoryId: number) => Result
  onRenameTag?: (tagId: number, label: string) => Result
  /** Merge asks first, so the owner confirms. `source` goes away; `target` stays. */
  onMergeTag?: (source: TagTreeNode, target: TagTreeNode) => Result
  /** Instant: the row goes and the owner offers Undo. */
  onDeleteTag?: (tag: TagTreeNode) => Result
  onCreateCategory?: (label: string) => Result
  onRenameCategory?: (categoryId: number, label: string) => Result
  /** A category with tags asks where they go, so the owner asks; an empty one deletes at once. */
  onDeleteCategory?: (category: Category) => Result
  className?: string
}

/** How long a tag you just added keeps its orange outline. */
const FRESH_MS = 2000

const norm = (text: string) => text.trim().toLowerCase()
const freshKey = (categoryId: number, label: string) => `${categoryId}:${norm(label)}`
const tagCountText = (n: number) => `${n} ${n === 1 ? 'tag' : 'tags'}`

/** Runs an owner handler; a rejection is the owner's to report, so the input just stays. */
async function attempt(run: () => Result): Promise<boolean> {
  try {
    await run()
    return true
  } catch {
    return false
  }
}

/** The input state the Figma `state` axis starts a sample in (catalog and tests). */
function seedFor(state: TagTreeState) {
  return {
    adding:
      state === 'adding'
        ? { categoryId: 1, draft: 'MacBook' }
        : state === 'duplicate'
          ? { categoryId: 1, draft: 'clay' }
          : null,
    renaming: state === 'renaming' ? { kind: 'tag' as const, id: 3, draft: 'iPad Pro' } : null,
    newCategory: state === 'new-category' ? { draft: 'Colour' } : null,
    fresh: state === 'added' ? [freshKey(1, 'MacBook')] : []
  }
}

interface RowInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
  invalid?: boolean
  label: string
  hint: string
  bare?: boolean
}

/** The field renaming, adding and New category share: Enter submits, Esc or blur cancels. */
function RowInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  invalid,
  label,
  hint,
  bare
}: RowInputProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onSubmit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }
  return (
    <>
      <input
        autoFocus
        value={value}
        aria-label={label}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onCancel}
        className={
          bare
            ? 'min-w-0 flex-1 bg-transparent type-body-sm-medium text-foreground outline-none'
            : rowInputClass({ invalid })
        }
      />
      <span className={cn(rowHintClass, bare && 'flex-none text-right')}>{hint}</span>
    </>
  )
}

/**
 * ⋯ at the end of a header or row. It is the menu's trigger, so it passes on everything Radix gives
 * it (ref, aria-expanded, pointer handlers, data-state): without them it can't open the menu or
 * anchor it. It stays in the layout while open.
 */
function MoreButton({
  label,
  always,
  className,
  ...rest
}: { label: string; always?: boolean } & Omit<ComponentProps<typeof Button>, 'aria-label'>) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      {...rest}
      className={cn(
        'size-7 shrink-0 p-1.5 text-muted-foreground [&_svg]:size-5',
        !always && 'hidden group-focus-within/row:flex group-hover/row:flex data-[state=open]:flex',
        className
      )}
    >
      <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={ICON_STROKE} />
    </Button>
  )
}

/**
 * TagTree — Settings › Tags: one container per category (name, tag count, ⋯), its tags with use
 * counts, its own Add tag row, and a dashed New category row to close the list.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-5509
 * Rules: design/specs/settings.md (Tags). Two tiers, no nesting. Adding happens where the result
 * appears: Add tag turns into an input row in place. The owner holds the data and does the work
 * (it passes `tree` and the on* handlers); `state` only chooses where a sample starts.
 */
export function TagTree({
  className,
  tree: treeProp,
  loading: loadingProp,
  onAddTag,
  onMoveTag,
  onRenameTag,
  onMergeTag,
  onDeleteTag,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
  ...rest
}: TagTreeProps) {
  const { state, ...props } = { ...TAG_TREE_DEFAULTS, ...rest }
  const seed = useMemo(() => seedFor(state), [state])
  const tree = treeProp ?? sampleTreeFor(state)
  const loading = loadingProp ?? state === 'loading'

  const [adding, setAdding] = useState(seed.adding)
  const [renaming, setRenaming] = useState<{
    kind: 'tag' | 'category'
    id: number
    draft: string
  } | null>(seed.renaming)
  const [newCategory, setNewCategory] = useState(seed.newCategory)
  const [fresh, setFresh] = useState(seed.fresh)
  /**
   * The open menu. `at` is where a right-click happened: the menu opens there. Without it the menu
   * hangs off the row's own ⋯ button (hover or keyboard).
   */
  const [menu, setMenu] = useState<{
    kind: 'tag' | 'category'
    id: number
    at: { x: number; y: number } | null
  } | null>(null)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const live = timers.current
    return () => live.forEach(clearTimeout)
  }, [])

  const markFresh = (categoryId: number, label: string) => {
    const key = freshKey(categoryId, label)
    clearTimeout(timers.current.get(key))
    setFresh((keys) => [...keys.filter((k) => k !== key), key])
    timers.current.set(
      key,
      setTimeout(() => setFresh((keys) => keys.filter((k) => k !== key)), FRESH_MS)
    )
  }

  const findTag = (label: string, exceptTagId?: number) => {
    const wanted = norm(label)
    if (!wanted) return undefined
    for (const category of tree) {
      const tag = category.tags.find((t) => norm(t.label) === wanted && t.tagId !== exceptTagId)
      if (tag) return { category, tag }
    }
    return undefined
  }

  const addTo = async (category: Category) => {
    if (!adding) return
    const label = adding.draft.trim()
    if (!label || findTag(label)) return
    if (await attempt(() => onAddTag?.(category.categoryId, label))) {
      markFresh(category.categoryId, label)
      setAdding({ categoryId: category.categoryId, draft: '' })
    }
  }

  const moveHere = async (category: Category, tag: TagTreeNode) => {
    if (await attempt(() => onMoveTag?.(tag.tagId, category.categoryId))) {
      markFresh(category.categoryId, tag.label)
      setAdding({ categoryId: category.categoryId, draft: '' })
    }
  }

  /** Another category already called this, whatever its casing. */
  const findCategory = (label: string, exceptCategoryId: number) =>
    tree.find((c) => c.categoryId !== exceptCategoryId && norm(c.categoryLabel) === norm(label))

  const saveRename = async () => {
    if (!renaming) return
    const label = renaming.draft.trim()
    // A tag's name is checked against tags, a category's against categories.
    const taken =
      renaming.kind === 'tag' ? findTag(label, renaming.id) : findCategory(label, renaming.id)
    if (!label || taken) return
    const run =
      renaming.kind === 'tag'
        ? () => onRenameTag?.(renaming.id, label)
        : () => onRenameCategory?.(renaming.id, label)
    if (await attempt(run)) setRenaming(null)
  }

  const createCategory = async () => {
    if (!newCategory) return
    const label = newCategory.draft.trim()
    if (!label || tree.some((c) => norm(c.categoryLabel) === norm(label))) return
    if (await attempt(() => onCreateCategory?.(label))) setNewCategory(null)
  }

  const menuProps = (kind: 'tag' | 'category', id: number) => ({
    open: menu?.kind === kind && menu.id === id && menu.at === null,
    onOpenChange: (open: boolean) => setMenu(open ? { kind, id, at: null } : null)
  })

  const newCategoryRow = newCategory ? (
    <div className={newCategoryRowClass({ editing: true })}>
      <RowInput
        bare
        label="New category"
        value={newCategory.draft}
        onChange={(draft) => setNewCategory({ draft })}
        onSubmit={() => void createCategory()}
        onCancel={() => setNewCategory(null)}
        invalid={tree.some((c) => norm(c.categoryLabel) === norm(newCategory.draft))}
        hint="↵ to add · Esc to cancel"
      />
    </div>
  ) : (
    <button
      type="button"
      className={newCategoryRowClass({ editing: false })}
      onClick={() => setNewCategory({ draft: '' })}
    >
      <HugeiconsIcon
        icon={PlusSignIcon}
        strokeWidth={ICON_STROKE}
        className="size-icon-xs shrink-0"
      />
      New category
    </button>
  )

  /**
   * Opens the inline rename input once the menu has closed and handed focus back. Starting it in the
   * same tick lets the closing menu's focus return blur the new input, which cancels it.
   */
  const startRename = (next: NonNullable<typeof renaming>) => {
    setTimeout(() => setRenaming(next), 0)
  }

  /** The rows of a tag's menu, shared by its ⋯ button and a right-click. */
  const tagMenuItems = (category: Category, tag: TagTreeNode) => {
    const others = tree.filter((c) => c.categoryId !== category.categoryId)
    const mergeTargets = tree.flatMap((c) =>
      c.tags.filter((t) => t.tagId !== tag.tagId).map((t) => ({ category: c, tag: t }))
    )
    return (
      <>
        <DropdownMenuItem
          label="Rename"
          icon={Edit02Icon}
          onSelect={() => startRename({ kind: 'tag', id: tag.tagId, draft: tag.label })}
        />
        <DropdownMenuItem
          label="Move to"
          icon={FolderTransferIcon}
          submenu
          disabled={!others.length}
        >
          {others.map((c) => (
            <DropdownMenuItem
              key={c.categoryId}
              label={c.categoryLabel}
              showIcon={false}
              onSelect={() => void attempt(() => onMoveTag?.(tag.tagId, c.categoryId))}
            />
          ))}
        </DropdownMenuItem>
        <DropdownMenuItem
          label="Merge into…"
          icon={GitMergeIcon}
          submenu
          disabled={!mergeTargets.length}
        >
          {mergeTargets.map(({ category: c, tag: target }) => (
            <DropdownMenuItem
              key={target.tagId}
              label={`${c.categoryLabel} · ${target.label}`}
              showIcon={false}
              onSelect={() => void attempt(() => onMergeTag?.(tag, target))}
            />
          ))}
        </DropdownMenuItem>
        <DropdownMenuDivider />
        <DropdownMenuItem
          label="Delete"
          icon={Delete02Icon}
          variant="destructive"
          onSelect={() => void attempt(() => onDeleteTag?.(tag))}
        />
      </>
    )
  }

  /** The rows of a category's menu. */
  const categoryMenuItems = (category: Category) => (
    <>
      <DropdownMenuItem
        label="Rename"
        icon={Edit02Icon}
        onSelect={() =>
          startRename({
            kind: 'category',
            id: category.categoryId,
            draft: category.categoryLabel
          })
        }
      />
      <DropdownMenuDivider />
      <DropdownMenuItem
        label="Delete category…"
        icon={Delete02Icon}
        variant="destructive"
        onSelect={() => void attempt(() => onDeleteCategory?.(category))}
      />
    </>
  )

  const renderTag = (category: Category, tag: TagTreeNode) => {
    const isFresh = fresh.includes(freshKey(category.categoryId, tag.label))
    const editing = renaming?.kind === 'tag' && renaming.id === tag.tagId
    return (
      <div
        key={tag.tagId}
        data-tag={tag.tagId}
        data-fresh={isFresh || undefined}
        tabIndex={0}
        onContextMenu={(event) => {
          event.preventDefault()
          setMenu({ kind: 'tag', id: tag.tagId, at: { x: event.clientX, y: event.clientY } })
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            setMenu({ kind: 'tag', id: tag.tagId, at: null })
          }
        }}
        className={tagRowClass({ fresh: isFresh })}
      >
        <HugeiconsIcon
          icon={Tag01Icon}
          strokeWidth={ICON_STROKE}
          className="size-icon-xs shrink-0 text-tertiary"
        />
        {editing ? (
          <RowInput
            label={`Rename ${tag.label}`}
            value={renaming.draft}
            onChange={(draft) => setRenaming({ ...renaming, draft })}
            onSubmit={() => void saveRename()}
            onCancel={() => setRenaming(null)}
            invalid={!!findTag(renaming.draft, tag.tagId)}
            hint="↵ to save · Esc to cancel"
          />
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate type-body-sm-regular text-foreground">
              {tag.label}
            </span>
            <span className={cn(rowHintClass, 'whitespace-nowrap')}>
              {tag.usageCount} {tag.usageCount === 1 ? 'mockup' : 'mockups'}
            </span>
            <DropdownMenu
              align="end"
              {...menuProps('tag', tag.tagId)}
              trigger={<MoreButton label={`${tag.label} actions`} />}
              items={tagMenuItems(category, tag)}
            />
          </>
        )}
      </div>
    )
  }

  const renderAddRow = (category: Category) => {
    if (adding?.categoryId !== category.categoryId) {
      return (
        <button
          type="button"
          className={addRowClass}
          onClick={() => setAdding({ categoryId: category.categoryId, draft: '' })}
        >
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={ICON_STROKE}
            className="size-icon-xs shrink-0"
          />
          Add tag
        </button>
      )
    }
    const duplicate = findTag(adding.draft)
    const inOther = duplicate && duplicate.category.categoryId !== category.categoryId
    return (
      <>
        <div className={tagRowClass()}>
          <HugeiconsIcon
            icon={Tag01Icon}
            strokeWidth={ICON_STROKE}
            className="size-icon-xs shrink-0 text-tertiary"
          />
          <RowInput
            label={`New tag in ${category.categoryLabel}`}
            value={adding.draft}
            onChange={(draft) => setAdding({ categoryId: category.categoryId, draft })}
            onSubmit={() => void addTo(category)}
            onCancel={() => setAdding(null)}
            invalid={!!duplicate}
            hint={
              duplicate
                ? `Already in ${duplicate.category.categoryLabel}`
                : '↵ to save · Esc to cancel'
            }
          />
        </div>
        {duplicate && (
          <div className="flex items-center gap-3 py-2.5 pr-3 pl-4">
            <p className="min-w-0 flex-1 type-caption-xs-regular text-muted-foreground">
              {inOther
                ? `“${duplicate.tag.label}” is already a tag in ${duplicate.category.categoryLabel}, on ${duplicate.tag.usageCount} mockups.`
                : `“${duplicate.tag.label}” is already a tag here, on ${duplicate.tag.usageCount} mockups.`}
            </p>
            {inOther && (
              <Button
                variant="secondary"
                size="sm"
                // Keep focus in the input so the blur that cancels it doesn't swallow the click.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void moveHere(category, duplicate.tag)}
              >
                Move it to {category.categoryLabel}
              </Button>
            )}
          </div>
        )}
      </>
    )
  }

  /** A right-click opens the menu at the pointer; the ⋯ button keeps its own anchor. */
  const pointedTag =
    menu?.at && menu.kind === 'tag'
      ? tree
          .flatMap((c) => c.tags.map((t) => ({ category: c, tag: t })))
          .find((x) => x.tag.tagId === menu.id)
      : undefined
  const pointedCategory =
    menu?.at && menu.kind === 'category' ? tree.find((c) => c.categoryId === menu.id) : undefined
  const pointMenu = menu?.at && (pointedTag || pointedCategory) && (
    <DropdownMenu
      open
      onOpenChange={(open) => !open && setMenu(null)}
      align={pointMenuAlign(menu.at.x)}
      trigger={
        <span
          aria-hidden
          data-menu-anchor=""
          className="pointer-events-none fixed size-0"
          style={{ left: menu.at.x, top: menu.at.y }}
        />
      }
      items={
        pointedTag
          ? tagMenuItems(pointedTag.category, pointedTag.tag)
          : categoryMenuItems(pointedCategory!)
      }
    />
  )

  const renderCategory = (category: Category) => {
    const editing = renaming?.kind === 'category' && renaming.id === category.categoryId
    return (
      <section
        key={category.categoryId}
        aria-label={category.categoryLabel}
        className={categoryClass}
      >
        <div
          className={cn(categoryHeaderClass, 'group/row')}
          onContextMenu={(event) => {
            event.preventDefault()
            setMenu({
              kind: 'category',
              id: category.categoryId,
              at: { x: event.clientX, y: event.clientY }
            })
          }}
        >
          {editing ? (
            <RowInput
              label={`Rename ${category.categoryLabel}`}
              value={renaming.draft}
              onChange={(draft) => setRenaming({ ...renaming, draft })}
              onSubmit={() => void saveRename()}
              onCancel={() => setRenaming(null)}
              invalid={!!findCategory(renaming.draft, category.categoryId)}
              hint="↵ to save · Esc to cancel"
            />
          ) : (
            <>
              <h3 className="shrink-0 type-body-sm-medium whitespace-nowrap text-foreground">
                {category.categoryLabel}
              </h3>
              <p className="min-w-0 flex-1 type-caption-xs-regular text-tertiary">
                {tagCountText(category.tags.length)}
              </p>
              <DropdownMenu
                align="end"
                {...menuProps('category', category.categoryId)}
                trigger={<MoreButton always label={`${category.categoryLabel} actions`} />}
                items={categoryMenuItems(category)}
              />
            </>
          )}
        </div>
        {category.tags.map((tag) => renderTag(category, tag))}
        {renderAddRow(category)}
      </section>
    )
  }

  return (
    <div
      data-ds="TagTree"
      data-state={state}
      aria-busy={loading || undefined}
      className={cn(tagTreeVariants({ state }), className)}
      {...props}
    >
      {pointMenu}
      {loading ? (
        <div aria-hidden className="flex flex-col gap-3">
          {[0, 1].map((n) => (
            <div key={n} className={cn(categoryClass, 'gap-3 divide-y-0 px-4 py-3.5')}>
              {['w-24', 'w-55', 'w-45', 'w-35'].map((width) => (
                <Skeleton key={width} className={cn('h-3 rounded-sm', width)} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <>
          {tree.length === 0 && (
            <p className="type-body-sm-regular text-muted-foreground">
              No tags yet. Tags you add while looking over mockups land here, grouped by category.
              Start a category to set some up ahead of time.
            </p>
          )}
          {tree.map(renderCategory)}
          {newCategoryRow}
        </>
      )}
    </div>
  )
}
