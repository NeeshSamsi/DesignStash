import { describe, expect, it } from 'vitest'
import type { LookOverItem } from '@shared/approval'
import type { AiStatusUpdate } from '@shared/ipc/ai-status'
import {
  LANDED_FOR_MS,
  aiLine,
  couldNotWrite,
  isWriting,
  nextLineChange,
  opensWithRow,
  railNote,
  slowAt,
  stashWait,
  writingFields,
  type Writing
} from './ai-writing'

// The AI writing state in Look it over (design/specs/look-over.md, L6).

const item = (over: Partial<LookOverItem> = {}): LookOverItem => ({
  mockupId: 11,
  pileId: 10,
  role: 'variant',
  title: 'phone side',
  description: '',
  tags: [],
  touched: false,
  checked: false,
  waitingForAi: true,
  carry: null,
  cover: { path: '/c.png', source: 'embedded', missing: false, width: 1600, height: 1200 },
  ...over
})

const ai = (over: Partial<AiStatusUpdate> = {}): AiStatusUpdate => ({
  mockupId: 11,
  status: 'sniffing',
  run: { phase: 'writing', writingSince: 1_000, slowAfterMs: 20_000 },
  ...over
})

const NOW = 5_000

describe('isWriting and writingFields', () => {
  it('writes every field of a mockup still waiting for the AI, a top or single included', () => {
    for (const role of ['top', 'variant', 'single'] as const) {
      expect(isWriting(item({ role }))).toBe(true)
      expect(writingFields(item({ role }))).toEqual(['title', 'description', 'tags'])
    }
  })

  it('leaves a field the person typed in to them, and keeps writing the rest', () => {
    expect(writingFields(item(), { typed: ['title'] })).toEqual(['description', 'tags'])
  })

  it('writes nothing once its suggestion is in, after Fill it myself, when it failed or AI is off', () => {
    expect(isWriting(item({ waitingForAi: false }))).toBe(false)
    expect(isWriting(item(), { optedOut: true })).toBe(false)
    expect(isWriting(item(), { ai: ai({ status: 'failed', run: undefined }) })).toBe(false)
    expect(isWriting(item(), { ai: ai({ status: 'off', run: undefined }) })).toBe(false)
    expect(writingFields(item(), { optedOut: true })).toEqual([])
  })

  it('counts a failed run as couldn’t write, unless the person filled it in themselves', () => {
    const failed = { ai: ai({ status: 'failed', run: undefined }) }
    expect(couldNotWrite(failed)).toBe(true)
    expect(couldNotWrite({ ...failed, optedOut: true })).toBe(false)
    expect(couldNotWrite({ ai: ai() })).toBe(false)
  })
})

describe('slowAt: when “taking a while” shows', () => {
  it('counts from when the model began on this mockup', () => {
    expect(slowAt({ ai: ai() })).toBe(21_000)
  })

  it('counts from when it came on screen while it waits its turn', () => {
    const queued = ai({
      status: 'pending',
      run: { phase: 'queued', writingSince: null, slowAfterMs: 20_000 }
    })
    expect(slowAt({ ai: queued, shownAt: 3_000 })).toBe(23_000)
    expect(slowAt({ ai: queued })).toBeNull()
  })

  it('leaves the model load out of the clock, and has no clock without a run', () => {
    const starting = ai({ run: { phase: 'starting', writingSince: null, slowAfterMs: 20_000 } })
    expect(slowAt({ ai: starting, shownAt: 3_000 })).toBeNull()
    expect(slowAt({})).toBeNull()
  })
})

describe('aiLine: the status line', () => {
  it('L6.1: writing, with Fill it myself from the start', () => {
    expect(aiLine(item(), { ai: ai() }, NOW)).toEqual({
      kind: 'working',
      message: 'Writing with AI…',
      action: 'fill-myself'
    })
    expect(aiLine(item(), {}, NOW)?.message).toBe('Writing with AI…')
  })

  it('L6.2: says what is still coming once the person typed in a field', () => {
    expect(aiLine(item(), { typed: ['title'] }, NOW)).toEqual({
      kind: 'working',
      message: 'Writing the description and tags with AI. Your title stays as you typed it.',
      action: 'fill-myself'
    })
    expect(aiLine(item(), { typed: ['title', 'description'] }, NOW)?.message).toBe(
      'Writing the tags with AI. Your title and description stay as you typed them.'
    )
    expect(aiLine(item(), { typed: ['tags'] }, NOW)?.message).toBe(
      'Writing the title and description with AI. Your tags stay as you set them.'
    )
  })

  it('L6.4: taking a while once the run counts as slow, still with Fill it myself', () => {
    const w: Writing = { ai: ai(), typed: ['title'] }
    expect(aiLine(item(), w, 20_999)?.message).not.toMatch(/taking a while/)
    expect(aiLine(item(), w, 21_000)).toEqual({
      kind: 'working',
      message: 'Still writing with AI. This one is taking a while.',
      action: 'fill-myself'
    })
  })

  it('L6.3: says what landed for 4 s, then has nothing to say', () => {
    const w: Writing = { landed: { fields: ['description', 'tags'], at: NOW }, typed: ['title'] }
    const done = item({ waitingForAi: false })
    expect(aiLine(done, w, NOW)).toEqual({
      kind: 'done',
      message: 'AI filled in the description and tags. Your title stays as you typed it.'
    })
    expect(aiLine(done, w, NOW + LANDED_FOR_MS - 1)?.kind).toBe('done')
    expect(aiLine(done, w, NOW + LANDED_FOR_MS)).toBeNull()
    expect(
      aiLine(done, { landed: { fields: ['title', 'description', 'tags'], at: NOW } }, NOW)?.message
    ).toBe('AI filled in the title, description and tags.')
  })

  it('L6.E1: Fill it myself, with Write suggestions as the way back', () => {
    expect(aiLine(item(), { optedOut: true }, NOW)).toEqual({
      kind: 'off',
      message: 'You’re filling this one in. Its title starts from the file name.',
      action: 'write-suggestions'
    })
    expect(aiLine(item(), { optedOut: true, typed: ['title'] }, NOW)?.message).toBe(
      'You’re filling this one in.'
    )
  })

  it('L6.E3: couldn’t write, with Try again and where the title came from', () => {
    const failed = { ai: ai({ status: 'failed', run: undefined }) }
    expect(aiLine(item({ waitingForAi: false }), failed, NOW)).toEqual({
      kind: 'failed',
      message: 'Couldn’t write suggestions for this one, so the title is its file name.',
      action: 'try-again'
    })
    expect(
      aiLine(item({ waitingForAi: false }), { ...failed, typed: ['title'] }, NOW)?.message
    ).toBe('Couldn’t write suggestions for this one.')
  })

  it('says nothing when AI is off in Settings or the suggestion was already in', () => {
    expect(
      aiLine(item({ waitingForAi: false }), { ai: ai({ status: 'off', run: undefined }) }, NOW)
    ).toBeNull()
    expect(aiLine(item({ waitingForAi: false }), {}, NOW)).toBeNull()
  })
})

describe('opensWithRow: the row is decided when the mockup opens', () => {
  it('opens with a row when there is something to say, and with none otherwise', () => {
    expect(opensWithRow(item(), {}, NOW)).toBe(true)
    expect(
      opensWithRow(
        item({ waitingForAi: false }),
        { ai: ai({ status: 'failed', run: undefined }) },
        NOW
      )
    ).toBe(true)
    expect(opensWithRow(item({ waitingForAi: false }), {}, NOW)).toBe(false)
    expect(
      opensWithRow(
        item({ waitingForAi: false }),
        { ai: ai({ status: 'off', run: undefined }) },
        NOW
      )
    ).toBe(false)
  })
})

describe('nextLineChange: when the line next changes on its own', () => {
  it('is the slow threshold while writing, the end of the landed message after it lands', () => {
    expect(nextLineChange(item(), { ai: ai() }, NOW)).toBe(21_000)
    expect(nextLineChange(item(), { ai: ai() }, 21_000)).toBeNull()
    const landed: Writing = { landed: { fields: ['title'], at: NOW } }
    expect(nextLineChange(item({ waitingForAi: false }), landed, NOW)).toBe(NOW + LANDED_FOR_MS)
    expect(nextLineChange(item({ waitingForAi: false }), {}, NOW)).toBeNull()
  })
})

describe('railNote: the rail shows what is still coming', () => {
  it('“Writing with AI…” on the one being written, “Suggestions on the way” on queued ones', () => {
    expect(railNote(item(), { ai: ai() })).toBe('Writing with AI…')
    expect(railNote(item(), { ai: ai({ status: 'pending', run: undefined }) })).toBe(
      'Suggestions on the way'
    )
    expect(railNote(item(), {})).toBe('Suggestions on the way')
  })

  it('has no note once it isn’t written by the AI any more', () => {
    expect(railNote(item({ waitingForAi: false }), {})).toBeNull()
    expect(railNote(item(), { optedOut: true })).toBeNull()
  })
})

describe('stashWait: Stash pile waits for the ones still writing (L6.E4)', () => {
  const pile = [
    item({ mockupId: 10, role: 'top', waitingForAi: false }),
    item({ mockupId: 11, waitingForAi: false }),
    item({ mockupId: 12, title: 'phone top' })
  ]
  const titles = { 10: 'Three-quarter', 11: 'Side', 12: 'phone top' }

  it('names the one still writing', () => {
    expect(stashWait(pile, {}, titles)).toBe(
      'Stash pile waits until phone top’s suggestions arrive.'
    )
  })

  it('counts them when more than one is still writing', () => {
    const two = [...pile, item({ mockupId: 13 })]
    expect(stashWait(two, {}, titles)).toBe('Stash pile waits until 2 mockups’ suggestions arrive.')
  })

  it('stops waiting once each has landed or been filled in by hand', () => {
    expect(stashWait(pile, { 12: { optedOut: true } }, titles)).toBeNull()
    expect(stashWait(pile.slice(0, 2), {}, titles)).toBeNull()
  })
})
