import { describe, expect, it } from 'vitest'
import { UNDO_LIMIT, UndoHistory, type OpOutcome, type UndoTarget } from './undo-history'

/** A fake op: what a service would be told to do, as data. */
type FakeOp =
  | { kind: 'title'; mockupId: number; title: string }
  | { kind: 'star'; mockupId: number; starred: boolean }

const mockup = (id: number): UndoTarget => ({ kind: 'mockup', id })

/** A runner that only writes down what it was asked to run, and answers as told. */
function fakeRunner(answer: (op: FakeOp) => OpOutcome | Promise<OpOutcome> = () => ({ ok: true })) {
  const ran: FakeOp[] = []
  return {
    ran,
    run: (op: FakeOp) => {
      ran.push(op)
      return answer(op)
    }
  }
}

/** A title edit on one mockup, from `before` to `after`. */
function titleEdit(
  history: UndoHistory<FakeOp>,
  id: number,
  before: string,
  after: string
): number {
  return history.record({
    label: 'Edit details',
    undo: { kind: 'title', mockupId: id, title: before },
    redo: { kind: 'title', mockupId: id, title: after },
    targets: [mockup(id)]
  })
}

/** Waits until the runner has been asked for `count` ops, so a step is under way. */
async function running(runner: { ran: FakeOp[] }, count = 1): Promise<void> {
  for (let i = 0; i < 100 && runner.ran.length < count; i++) await Promise.resolve()
  expect(runner.ran).toHaveLength(count)
}

/** A promise the test settles by hand, for an op that takes its time. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('UndoHistory', () => {
  it('undoes the newest action first, and redoes in the reverse order', async () => {
    const runner = fakeRunner()
    const history = new UndoHistory<FakeOp>(runner)
    titleEdit(history, 1, 'Tote', 'Tote bag')
    titleEdit(history, 2, 'Mug', 'Coffee mug')

    await history.undo()
    await history.undo()
    await history.redo()
    await history.redo()

    expect(runner.ran.map((op) => op.kind === 'title' && op.title)).toEqual([
      'Mug',
      'Tote',
      'Tote bag',
      'Coffee mug'
    ])
  })

  it('says what it did, by the action’s name', async () => {
    const history = new UndoHistory<FakeOp>(fakeRunner())
    titleEdit(history, 1, 'Tote', 'Tote bag')
    expect(await history.undo()).toEqual({ status: 'done', label: 'Edit details' })
    expect(await history.redo()).toEqual({ status: 'done', label: 'Edit details' })
  })

  it('a new action clears what waits to be redone', async () => {
    const history = new UndoHistory<FakeOp>(fakeRunner())
    titleEdit(history, 1, 'Tote', 'Tote bag')
    await history.undo()
    history.record({
      label: 'Star',
      undo: { kind: 'star', mockupId: 2, starred: false },
      redo: { kind: 'star', mockupId: 2, starred: true },
      targets: [mockup(2)]
    })
    expect(history.state().redo).toBeNull()
    expect(await history.redo()).toEqual({ status: 'empty' })
  })

  it('names the next undo and redo, for the Edit menu and the toasts', async () => {
    const history = new UndoHistory<FakeOp>(fakeRunner(), {
      now: () => new Date('2026-10-27T05:00:00Z')
    })
    expect(history.state()).toEqual({ undo: null, redo: null })
    const id = titleEdit(history, 1, 'Tote', 'Tote bag')
    expect(history.state()).toEqual({
      undo: { id, label: 'Edit details', at: '2026-10-27T05:00:00.000Z' },
      redo: null
    })
    await history.undo()
    expect(history.state()).toEqual({
      undo: null,
      redo: { id, label: 'Edit details', at: '2026-10-27T05:00:00.000Z' }
    })
  })

  it('with nothing to undo or redo, says so and runs nothing', async () => {
    const runner = fakeRunner()
    const history = new UndoHistory<FakeOp>(runner)
    expect(await history.undo()).toEqual({ status: 'empty' })
    expect(await history.redo()).toEqual({ status: 'empty' })
    expect(runner.ran).toEqual([])
  })

  it(`keeps at most ${UNDO_LIMIT} entries, letting the oldest go`, async () => {
    const runner = fakeRunner()
    const history = new UndoHistory<FakeOp>(runner)
    for (let i = 1; i <= UNDO_LIMIT + 1; i++) titleEdit(history, i, `before ${i}`, `after ${i}`)

    let result = await history.undo()
    while (result.status === 'done') result = await history.undo()

    expect(runner.ran).toHaveLength(UNDO_LIMIT)
    expect(runner.ran.at(-1)).toEqual({ kind: 'title', mockupId: 2, title: 'before 2' })
  })

  it('a toast’s Undo works only while its action is still the newest', async () => {
    const runner = fakeRunner()
    const history = new UndoHistory<FakeOp>(runner)
    const older = titleEdit(history, 1, 'Tote', 'Tote bag')
    const newer = titleEdit(history, 2, 'Mug', 'Coffee mug')

    expect(await history.undo({ id: older })).toEqual({ status: 'stale' })
    expect(runner.ran).toEqual([])
    expect(await history.undo({ id: newer })).toEqual({ status: 'done', label: 'Edit details' })
  })

  it('drops a step whose target is gone, says why, and the next undo goes to the step before', async () => {
    const runner = fakeRunner((op) =>
      op.mockupId === 2 ? { ok: false, missing: mockup(2) } : { ok: true }
    )
    const history = new UndoHistory<FakeOp>(runner)
    titleEdit(history, 1, 'Tote', 'Tote bag')
    titleEdit(history, 2, 'Mug', 'Coffee mug')

    expect(await history.undo()).toEqual({
      status: 'dropped',
      label: 'Edit details',
      reason: { kind: 'missing-target', target: mockup(2) }
    })
    // Gone from both sides: nothing to redo, and the next undo is the edit before it.
    expect(history.state().redo).toBeNull()
    await history.undo()
    expect(runner.ran.at(-1)).toEqual({ kind: 'title', mockupId: 1, title: 'Tote' })
  })

  it('a permanent delete drops every entry that points at what it removed, on both sides', async () => {
    const history = new UndoHistory<FakeOp>(fakeRunner())
    titleEdit(history, 1, 'Tote', 'Tote bag')
    const kept = titleEdit(history, 2, 'Mug', 'Coffee mug')
    history.record({
      label: 'Move to Trash',
      undo: { kind: 'star', mockupId: 1, starred: false },
      redo: { kind: 'star', mockupId: 1, starred: true },
      targets: [mockup(3), mockup(1)]
    })
    await history.undo()

    expect(history.forget([mockup(1)])).toBe(2)

    expect(history.state()).toEqual({ undo: expect.objectContaining({ id: kept }), redo: null })
    await history.undo()
    expect(history.state().undo).toBeNull()
  })

  it('forgets only targets of the same kind and id', () => {
    const history = new UndoHistory<FakeOp>(fakeRunner())
    titleEdit(history, 1, 'Tote', 'Tote bag')
    expect(history.forget([{ kind: 'tag', id: 1 }, mockup(9)])).toBe(0)
    expect(history.state().undo).not.toBeNull()
  })

  it('refuses an op that holds a function: entries are data', () => {
    const history = new UndoHistory<FakeOp>(fakeRunner())
    const closure = {
      kind: 'title',
      mockupId: 1,
      title: 'Tote',
      run: () => {}
    } as unknown as FakeOp
    expect(() =>
      history.record({ label: 'Edit details', undo: closure, redo: closure, targets: [mockup(1)] })
    ).toThrow()
    expect(history.state().undo).toBeNull()
  })

  it('keeps its own copy, so a later change to the caller’s object changes nothing', async () => {
    const runner = fakeRunner()
    const history = new UndoHistory<FakeOp>(runner)
    const undo: FakeOp = { kind: 'title', mockupId: 1, title: 'Tote' }
    history.record({
      label: 'Edit details',
      undo,
      redo: { ...undo, title: 'Tote bag' },
      targets: [mockup(1)]
    })
    undo.title = 'changed afterwards'

    await history.undo()

    expect(runner.ran).toEqual([{ kind: 'title', mockupId: 1, title: 'Tote' }])
  })

  it('an op that throws leaves the history as it was, so it can be tried again', async () => {
    let fail = true
    const runner = fakeRunner(() => {
      if (fail) throw new Error('database is locked')
      return { ok: true }
    })
    const history = new UndoHistory<FakeOp>(runner)
    const id = titleEdit(history, 1, 'Tote', 'Tote bag')

    await expect(history.undo()).rejects.toThrow('database is locked')
    expect(history.state()).toEqual({ undo: expect.objectContaining({ id }), redo: null })

    fail = false
    expect(await history.undo()).toEqual({ status: 'done', label: 'Edit details' })
  })

  it('runs one step at a time: two quick undos take two different actions, newest first', async () => {
    const slow = deferred<OpOutcome>()
    const runner = fakeRunner((op) => (op.mockupId === 2 ? slow.promise : { ok: true }))
    const history = new UndoHistory<FakeOp>(runner)
    titleEdit(history, 1, 'Tote', 'Tote bag')
    titleEdit(history, 2, 'Mug', 'Coffee mug')

    const first = history.undo()
    const second = history.undo()
    slow.resolve({ ok: true })
    await Promise.all([first, second])

    expect(runner.ran.map((op) => op.mockupId)).toEqual([2, 1])
  })

  it('an action recorded while an undo runs still clears redo', async () => {
    const slow = deferred<OpOutcome>()
    const runner = fakeRunner(() => slow.promise)
    const history = new UndoHistory<FakeOp>(runner)
    titleEdit(history, 1, 'Tote', 'Tote bag')

    const undoing = history.undo()
    await running(runner)
    const newer = titleEdit(history, 2, 'Mug', 'Coffee mug')
    slow.resolve({ ok: true })
    await undoing

    expect(history.state()).toEqual({ undo: expect.objectContaining({ id: newer }), redo: null })
  })

  it('an entry a permanent delete drops while it runs does not come back', async () => {
    const slow = deferred<OpOutcome>()
    const runner = fakeRunner(() => slow.promise)
    const history = new UndoHistory<FakeOp>(runner)
    titleEdit(history, 1, 'Tote', 'Tote bag')

    const undoing = history.undo()
    await running(runner)
    history.forget([mockup(1)])
    slow.resolve({ ok: true })
    await undoing

    expect(history.state()).toEqual({ undo: null, redo: null })
  })

  it('clear() while a redo runs leaves nothing behind', async () => {
    let slow: ReturnType<typeof deferred<OpOutcome>> | null = null
    const runner = fakeRunner(() => (slow ? slow.promise : { ok: true }))
    const history = new UndoHistory<FakeOp>(runner)
    titleEdit(history, 1, 'Tote', 'Tote bag')
    await history.undo()
    slow = deferred<OpOutcome>()

    const redoing = history.redo()
    await running(runner, 2)
    history.clear()
    slow.resolve({ ok: true })
    await redoing

    expect(history.state()).toEqual({ undo: null, redo: null })
  })

  it('clear() forgets everything: on quit and on a stash folder switch', () => {
    const history = new UndoHistory<FakeOp>(fakeRunner())
    titleEdit(history, 1, 'Tote', 'Tote bag')
    history.clear()
    expect(history.state()).toEqual({ undo: null, redo: null })
  })
})
