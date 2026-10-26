import type { LookOverItem } from '@shared/approval'
import type { AiStatusUpdate } from '@shared/ipc/ai-status'
import type { MetaField } from '@renderer/components/MockupMetaForm'
import { FIELDS, isWriting, writingFields, type Writing } from './ai-writing'

/**
 * What Look it over has learned about the AI since it opened: each mockup as main last sent it
 * (`live`), and its `Writing` (its run, the fields the person typed in, Fill it myself, what just
 * landed). One reducer, so a push and a keystroke always see the same state.
 */
export interface AiState {
  live: Readonly<Record<number, LookOverItem>>
  writing: Readonly<Record<number, Writing>>
}

export type AiEvent =
  /** `ai:status`: runs that changed. */
  | { type: 'status'; updates: readonly AiStatusUpdate[] }
  /** The `look-over:showing` answer for the mockup that just came on screen, at `at`. */
  | { type: 'showing'; mockupId: number; update: AiStatusUpdate | null; at: number }
  /** `look-over:draft`: main filled a draft in. What landed is kept only for the one on screen. */
  | { type: 'draft'; item: LookOverItem; at: number; onScreen: boolean }
  /** Items main sent again (after a carry-over or an undo), with nothing landing. */
  | { type: 'items'; items: readonly LookOverItem[] }
  /** The person typed in these fields. */
  | { type: 'typed'; mockupId: number; fields: readonly MetaField[] }
  /** Fill it myself. */
  | { type: 'fill-myself'; mockupId: number }
  /** The mockup went off screen: what landed has had its say. */
  | { type: 'left'; mockupId: number }

export const createAiState = (items: readonly LookOverItem[]): AiState => ({
  live: Object.fromEntries(items.map((i) => [i.mockupId, i])),
  writing: {}
})

/** The fields a late suggestion must leave alone. */
export const keepOf = (w: Writing | undefined): readonly MetaField[] =>
  w?.optedOut ? FIELDS : (w?.typed ?? [])

const withWriting = (s: AiState, id: number, patch: Partial<Writing>): AiState => ({
  ...s,
  writing: { ...s.writing, [id]: { ...s.writing[id], ...patch } }
})

export function aiReducer(s: AiState, e: AiEvent): AiState {
  switch (e.type) {
    case 'status':
      return e.updates.reduce((acc, u) => withWriting(acc, u.mockupId, { ai: u }), s)
    case 'showing': {
      const w = s.writing[e.mockupId]
      return withWriting(s, e.mockupId, {
        ...(e.update ? { ai: e.update } : {}),
        shownAt: w?.shownAt ?? e.at
      })
    }
    case 'draft': {
      const id = e.item.mockupId
      const before = s.live[id]
      const w = s.writing[id]
      const filled =
        before && isWriting(before, w) && !e.item.waitingForAi ? writingFields(before, w) : []
      const next = { ...s, live: { ...s.live, [id]: e.item } }
      return e.onScreen && filled.length > 0
        ? withWriting(next, id, { landed: { fields: filled, at: e.at } })
        : next
    }
    case 'items':
      return {
        ...s,
        live: { ...s.live, ...Object.fromEntries(e.items.map((i) => [i.mockupId, i])) }
      }
    case 'typed': {
      const item = s.live[e.mockupId]
      const w = s.writing[e.mockupId]
      if (!item) return s
      const open = writingFields(item, w)
      const typed = [...new Set([...(w?.typed ?? []), ...e.fields.filter((f) => open.includes(f))])]
      return typed.length === (w?.typed ?? []).length ? s : withWriting(s, e.mockupId, { typed })
    }
    case 'fill-myself':
      return withWriting(s, e.mockupId, { optedOut: true })
    case 'left': {
      const w = s.writing[e.mockupId]
      if (!w?.landed) return s
      const rest = { ...w }
      delete rest.landed
      return { ...s, writing: { ...s.writing, [e.mockupId]: rest } }
    }
  }
}
