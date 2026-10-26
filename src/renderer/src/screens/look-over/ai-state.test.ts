import { describe, expect, it } from 'vitest'
import type { LookOverItem } from '@shared/approval'
import type { AiStatusUpdate } from '@shared/ipc/ai-status'
import { aiReducer, createAiState, keepOf } from './ai-state'

const item = (mockupId: number, over: Partial<LookOverItem> = {}): LookOverItem => ({
  mockupId,
  pileId: 10,
  role: 'variant',
  title: `phone ${mockupId}`,
  description: '',
  tags: [],
  touched: false,
  checked: false,
  waitingForAi: true,
  carry: null,
  ai: { status: 'pending' },
  cover: { path: '/c.png', source: 'embedded', missing: false, width: 1, height: 1 },
  ...over
})

const sniffing = (mockupId: number): AiStatusUpdate => ({
  mockupId,
  status: 'sniffing',
  run: { phase: 'writing', writingSince: 100, slowAfterMs: 20_000 }
})

const start = () => createAiState([item(11), item(12)])

describe('aiReducer', () => {
  it('starts from the queue’s items with nothing learned yet', () => {
    const s = start()
    expect(Object.keys(s.live)).toEqual(['11', '12'])
    expect(s.writing).toEqual({})
  })

  it('keeps main’s last word on each run, from ai:status and look-over:showing', () => {
    let s = aiReducer(start(), { type: 'status', updates: [sniffing(11)] })
    expect(s.writing[11]?.ai?.status).toBe('sniffing')
    s = aiReducer(s, { type: 'showing', mockupId: 12, update: null, at: 5 })
    s = aiReducer(s, {
      type: 'showing',
      mockupId: 12,
      update: { mockupId: 12, status: 'pending' },
      at: 9
    })
    // The slow clock counts from the first time it came on screen.
    expect(s.writing[12]).toMatchObject({ shownAt: 5, ai: { status: 'pending' } })
  })

  it('records what landed only for the mockup on screen, and drops it when you move on', () => {
    let s = aiReducer(start(), { type: 'typed', mockupId: 11, fields: ['title'] })
    s = aiReducer(s, {
      type: 'draft',
      item: item(11, { waitingForAi: false }),
      at: 50,
      onScreen: true
    })
    expect(s.writing[11]?.landed).toEqual({ fields: ['description', 'tags'], at: 50 })
    expect(s.live[11]?.waitingForAi).toBe(false)
    s = aiReducer(s, {
      type: 'draft',
      item: item(12, { waitingForAi: false }),
      at: 60,
      onScreen: false
    })
    expect(s.writing[12]?.landed).toBeUndefined()
    s = aiReducer(s, { type: 'left', mockupId: 11 })
    expect(s.writing[11]?.landed).toBeUndefined()
  })

  it('records nothing as landed when the run failed or the person filled it in', () => {
    let s = aiReducer(start(), { type: 'status', updates: [{ mockupId: 11, status: 'failed' }] })
    s = aiReducer(s, {
      type: 'draft',
      item: item(11, { waitingForAi: false }),
      at: 50,
      onScreen: true
    })
    expect(s.writing[11]?.landed).toBeUndefined()
    s = aiReducer(s, { type: 'fill-myself', mockupId: 12 })
    s = aiReducer(s, {
      type: 'draft',
      item: item(12, { waitingForAi: false }),
      at: 50,
      onScreen: true
    })
    expect(s.writing[12]?.landed).toBeUndefined()
  })

  it('counts a field as typed only while the AI was writing it', () => {
    let s = aiReducer(start(), { type: 'typed', mockupId: 11, fields: ['title', 'title'] })
    expect(s.writing[11]?.typed).toEqual(['title'])
    s = aiReducer(s, {
      type: 'draft',
      item: item(11, { waitingForAi: false }),
      at: 1,
      onScreen: false
    })
    s = aiReducer(s, { type: 'typed', mockupId: 11, fields: ['description'] })
    expect(s.writing[11]?.typed).toEqual(['title'])
  })

  it('takes fresh items without marking anything as landed', () => {
    const s = aiReducer(start(), { type: 'items', items: [item(11, { waitingForAi: false })] })
    expect(s.live[11]?.waitingForAi).toBe(false)
    expect(s.writing[11]).toBeUndefined()
  })
})

describe('keepOf', () => {
  it('keeps what the person typed, and everything after Fill it myself', () => {
    expect(keepOf(undefined)).toEqual([])
    expect(keepOf({ typed: ['tags'] })).toEqual(['tags'])
    expect(keepOf({ optedOut: true })).toEqual(['title', 'description', 'tags'])
  })
})
