import { eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../db/connection'
import type { Repository } from '../../db/repository'
import { mockupTags, mockups, tags } from '../../db/schema'
import {
  UndoStateRepository,
  diffState,
  isEmptyChange,
  type StateChange,
  type StateScope
} from '../../db/repositories/undo-state'
import type { OpOutcome, OpRunner, UndoRecord, UndoTarget } from '../undo-history'

export type { StateChange, StateScope } from '../../db/repositories/undo-state'

/**
 * The data side of undo (design/specs/undo.md): each action's undo and redo as a typed op with its
 * payload, run through the repositories. No closures, so an entry is plain data.
 *
 * - `state`: rows set back to how they were, or on to how the action left them, field by field.
 *   Every action in the spec's table that changes library rows records one (see `track`).
 * - `trash` and `restore`: an import's undo and redo. Undoing it moves what it brought in to Trash,
 *   marked as from an undone import, and redo brings it back (settled point 1).
 */
export type DataOp =
  | { kind: 'state'; payload: StateChange }
  | { kind: 'trash'; payload: { ids: number[]; origin: 'import' } }
  | { kind: 'restore'; payload: { ids: number[] } }

const NOUN: Record<UndoTarget['kind'], string> = {
  mockup: 'mockup',
  tag: 'tag',
  category: 'category',
  model: 'model'
}

/**
 * The short toast for a step dropped because what it changes was deleted for good:
 * "Couldn't undo Edit details: that mockup was deleted for good".
 */
export function skipWords(direction: 'undo' | 'redo', label: string, target: UndoTarget): string {
  return `Couldn’t ${direction} ${label}: that ${NOUN[target.kind]} was deleted for good`
}

/** What a change points at, so a permanent delete can drop its entries and toasts can tell overlaps. */
function targetsOf(change: StateChange): UndoTarget[] {
  return [
    ...change.mockups.map((m) => ({ kind: 'mockup' as const, id: m.id })),
    ...change.tags.map((t) => ({ kind: 'tag' as const, id: t.id })),
    ...change.categories.map((c) => ({ kind: 'category' as const, id: c.id }))
  ]
}

export interface DataOps {
  /** Runs data ops for the undo history. */
  runner: OpRunner<DataOp>
  /**
   * Runs an action and returns it as an undo record: what `scope` held before and after, so undo
   * and redo carry only the fields it changed. `created` names rows the action made, which weren't
   * there before (so undo takes them away). The record is null when nothing changed.
   */
  track<T>(
    label: string,
    scope: StateScope,
    action: () => T | Promise<T>,
    created?: (result: T) => StateScope
  ): Promise<{ result: T; record: UndoRecord<DataOp> | null }>
  /** An import's entry: undo sends what it brought in to Trash, redo brings it back. */
  importRecord(label: string, mockupIds: number[]): UndoRecord<DataOp>
  /** The scopes the actions need, read from the library as it is now. */
  scopes: {
    /** A pile (its top and every mockup in it), or a mockup on its own. */
    pile(id: number): number[]
    /** Every mockup carrying one of these tags. */
    taggedWith(tagIds: number[]): number[]
    /** The tags in a category. */
    tagsIn(categoryId: number): number[]
  }
}

export function createDataOps({ repo, db }: { repo: Repository; db: AppDatabase }): DataOps {
  const state = new UndoStateRepository(db, repo.search)

  const allThere = (ids: number[]): OpOutcome => {
    const found = new Set(
      ids.length ? db.select({ id: mockups.id }).from(mockups).where(inArray(mockups.id, ids)).all().map((m) => m.id) : []
    )
    const gone = ids.find((id) => !found.has(id))
    return gone === undefined ? { ok: true } : { ok: false, missing: { kind: 'mockup', id: gone } }
  }

  const runner: OpRunner<DataOp> = {
    run(op) {
      switch (op.kind) {
        case 'state':
          return state.apply(op.payload)
        case 'trash': {
          const there = allThere(op.payload.ids)
          if (!there.ok) return there
          repo.trash.moveManyToTrash(op.payload.ids, { origin: op.payload.origin })
          return { ok: true }
        }
        case 'restore': {
          const there = allThere(op.payload.ids)
          if (!there.ok) return there
          repo.trash.restoreMany(op.payload.ids)
          return { ok: true }
        }
      }
    }
  }

  const merge = (a: StateScope, b: StateScope): StateScope => ({
    mockupIds: [...(a.mockupIds ?? []), ...(b.mockupIds ?? [])],
    tagIds: [...(a.tagIds ?? []), ...(b.tagIds ?? [])],
    categoryIds: [...(a.categoryIds ?? []), ...(b.categoryIds ?? [])],
    sortBoard: a.sortBoard === true || b.sortBoard === true
  })

  return {
    runner,

    async track(label, scope, action, created) {
      const before = state.capture(scope)
      const result = await action()
      const after = state.capture(created ? merge(scope, created(result)) : scope)
      const redo = diffState(before, after)
      if (isEmptyChange(redo)) return { result, record: null }
      const undo = diffState(after, before)
      return {
        result,
        record: { label, undo: { kind: 'state', payload: undo }, redo: { kind: 'state', payload: redo }, targets: targetsOf(redo) }
      }
    },

    importRecord(label, mockupIds) {
      const ids = [...new Set(mockupIds)]
      return {
        label,
        undo: { kind: 'trash', payload: { ids, origin: 'import' } },
        redo: { kind: 'restore', payload: { ids } },
        targets: ids.map((id) => ({ kind: 'mockup', id }))
      }
    },

    scopes: {
      pile(id) {
        const m = repo.mockups.getMockup(id)
        if (!m) return [id]
        const top = m.isGroup ? m.id : (m.groupId ?? m.id)
        return [top, ...repo.piles.getMockupsByGroupId(top).map((x) => x.id)]
      },
      taggedWith(tagIds) {
        if (tagIds.length === 0) return []
        return [
          ...new Set(
            db.select({ id: mockupTags.mockupId }).from(mockupTags).where(inArray(mockupTags.tagId, tagIds)).all().map((r) => r.id)
          )
        ]
      },
      tagsIn(categoryId) {
        return db.select({ id: tags.id }).from(tags).where(eq(tags.categoryId, categoryId)).all().map((t) => t.id)
      }
    }
  }
}
