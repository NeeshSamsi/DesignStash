import type { RendererUndoOp, UndoRunResult } from '@shared/ipc/undo'

/** The most entries the history keeps. Older ones go first. */
export const UNDO_LIMIT = 200

/**
 * Something an action changed. A permanent delete (Empty Trash, Delete for good, Delete entry)
 * drops the entries that point at what it removed, and a toast's Undo is blocked by a newer entry
 * that points at the same thing. A pile or a cover change points at its mockups.
 */
export interface UndoTarget {
  kind: 'mockup' | 'tag' | 'category' | 'model'
  id: number | string
}

/**
 * How an op went. A target that is gone comes back as data, never as a throw. An op the window
 * carries out itself (Discard your changes) hands back its `renderer` step.
 */
export type OpOutcome = { ok: true; renderer?: RendererUndoOp } | { ok: false; missing: UndoTarget }

/** Runs an op through the same services the action used. */
export interface OpRunner<Op> {
  run(op: Op): OpOutcome | Promise<OpOutcome>
}

/** What an action records: its name, the op that takes it back and the op that does it again. */
export interface UndoRecord<Op> {
  /** The action's name, as the Edit menu shows it after Undo or Redo: "Move to Trash". */
  label: string
  undo: Op
  redo: Op
  targets: UndoTarget[]
}

export interface UndoEntry<Op> extends UndoRecord<Op> {
  id: number
  /** When it was recorded (ISO). */
  at: string
  /** Recorded by a toast's out-of-order undo: its undo puts that action back. */
  reversal: boolean
}

export interface UndoStep {
  id: number
  label: string
  at: string
  reversal: boolean
}

export interface UndoHistoryState {
  undo: UndoStep | null
  redo: UndoStep | null
  /** Every entry there is to undo, oldest first, with the newest later one blocking its toast. */
  entries: { id: number; blockedBy?: number }[]
}

const NOUN: Record<UndoTarget['kind'], string> = {
  mockup: 'mockup',
  tag: 'tag',
  category: 'category',
  model: 'model'
}

const sameTarget = (a: UndoTarget, b: UndoTarget): boolean => a.kind === b.kind && a.id === b.id
const overlaps = (a: UndoTarget[], b: UndoTarget[]): boolean =>
  a.some((t) => b.some((u) => sameTarget(t, u)))

/**
 * The app's undo history for this session (design/specs/undo.md): the person's actions, newest
 * last, each with the op that takes it back and the op that does it again. Entries are data, never
 * closures, and run through `runner`. One step runs at a time, so two quick ⌘Z presses undo two
 * different actions. Lives in memory only: cleared on quit and on a stash folder switch.
 */
export class UndoHistory<Op extends { kind: string }> {
  private done: UndoEntry<Op>[] = []
  private undone: UndoEntry<Op>[] = []
  private nextId = 1
  /** Goes up with each recorded action, so a step finishing late knows redo was cleared. */
  private generation = 0
  /** Entries a permanent delete or a clear took out, so a step finishing late never brings one back. */
  private dropped = new WeakSet<UndoEntry<Op>>()
  private queue: Promise<unknown> = Promise.resolve()
  private readonly now: () => Date
  private readonly onChange: () => void

  constructor(
    private readonly runner: OpRunner<Op>,
    options: { now?: () => Date; onChange?: () => void } = {}
  ) {
    this.now = options.now ?? (() => new Date())
    this.onChange = options.onChange ?? (() => {})
  }

  /**
   * Adds an action as the newest, clears what waits to be redone and returns the entry's id (a
   * toast keeps it). The entry is copied, which also refuses an op that holds a function.
   */
  record(action: UndoRecord<Op>): number {
    const id = this.push(structuredClone(action), false)
    this.onChange()
    return id
  }

  /** Takes back the newest action. */
  undo(): Promise<UndoRunResult> {
    return this.serially(() => this.step('undo'))
  }

  /** Does again the action undone last. */
  redo(): Promise<UndoRunResult> {
    return this.serially(() => this.step('redo'))
  }

  /**
   * A toast's Undo. The newest entry is a plain undo. An older one is undone on its own when no
   * newer entry points at the same things, and that is recorded as a new action, so ⌘Z straight
   * after puts it back; otherwise it's blocked, and nothing runs.
   */
  undoEntry(id: number): Promise<UndoRunResult> {
    return this.serially(async () => {
      const index = this.done.findIndex((e) => e.id === id)
      if (index === -1) return { status: 'gone' }
      if (index === this.done.length - 1) return this.step('undo')
      const entry = this.done[index]!
      const blocker = this.blockerOf(index)
      if (blocker) return { status: 'blocked', label: entry.label, blockedBy: blocker.id }

      const outcome = await this.runner.run(entry.undo)
      const wasDropped = this.dropped.has(entry)
      this.remove(entry)
      if (!outcome.ok) return this.drop(entry, outcome.missing)
      if (!wasDropped) {
        this.push(
          { label: entry.label, undo: entry.redo, redo: entry.undo, targets: entry.targets },
          true
        )
      }
      this.onChange()
      return this.doneResult(entry, outcome)
    })
  }

  /**
   * After a permanent delete: drops every entry, on either side, that points at one of `targets`,
   * so ⌘Z walks back past them. Returns how many went.
   */
  forget(targets: UndoTarget[]): number {
    const hit = (e: UndoEntry<Op>) => overlaps(e.targets, targets)
    const gone = [...this.done, ...this.undone].filter(hit)
    for (const entry of gone) this.dropped.add(entry)
    this.done = this.done.filter((e) => !hit(e))
    this.undone = this.undone.filter((e) => !hit(e))
    if (gone.length > 0) this.onChange()
    return gone.length
  }

  clear(): void {
    for (const entry of [...this.done, ...this.undone]) this.dropped.add(entry)
    this.done = []
    this.undone = []
    this.generation++
    this.onChange()
  }

  /** The next undo and redo, for the Edit menu's labels, and which toasts may still undo. */
  state(): UndoHistoryState {
    const step = (e: UndoEntry<Op> | undefined): UndoStep | null =>
      e ? { id: e.id, label: e.label, at: e.at, reversal: e.reversal } : null
    return {
      undo: step(this.done.at(-1)),
      redo: step(this.undone.at(-1)),
      entries: this.done.map((e, i) => {
        const blocker = this.blockerOf(i)
        return blocker ? { id: e.id, blockedBy: blocker.id } : { id: e.id }
      })
    }
  }

  /** The newest later entry that points at something the entry at `index` points at. */
  private blockerOf(index: number): UndoEntry<Op> | undefined {
    const entry = this.done[index]!
    for (let i = this.done.length - 1; i > index; i--) {
      if (overlaps(this.done[i]!.targets, entry.targets)) return this.done[i]
    }
    return undefined
  }

  private push(action: UndoRecord<Op>, reversal: boolean): number {
    const entry: UndoEntry<Op> = {
      ...action,
      id: this.nextId++,
      at: this.now().toISOString(),
      reversal
    }
    this.done.push(entry)
    if (this.done.length > UNDO_LIMIT) this.done.shift()
    this.undone = []
    this.generation++
    return entry.id
  }

  private serially<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run)
    this.queue = next.catch(() => {})
    return next
  }

  /**
   * Runs the newest entry on one side and moves it to the other. The entry stays where it is until
   * its op has run, so an op that throws leaves the history as it was.
   */
  private async step(direction: 'undo' | 'redo'): Promise<UndoRunResult> {
    const from = direction === 'undo' ? this.done : this.undone
    const entry = from.at(-1)
    if (!entry) return { status: 'empty' }

    const generation = this.generation
    const outcome = await this.runner.run(direction === 'undo' ? entry.undo : entry.redo)

    // Read the sides again: an action may have been recorded, or entries forgotten, meanwhile.
    const wasDropped = this.dropped.has(entry)
    this.remove(entry)
    if (!outcome.ok) return this.drop(entry, outcome.missing)
    if (!wasDropped) {
      if (direction === 'undo') {
        // An action recorded while this ran cleared redo, and this step goes with it.
        if (generation === this.generation) this.undone.push(entry)
      } else {
        this.done.push(entry)
        if (this.done.length > UNDO_LIMIT) this.done.shift()
      }
    }
    this.onChange()
    return this.doneResult(entry, outcome)
  }

  /** The step couldn't run: it's gone from the history, and the toast says why. */
  private drop(entry: UndoEntry<Op>, missing: UndoTarget): UndoRunResult {
    this.onChange()
    return {
      status: 'dropped',
      label: entry.label,
      reason: `that ${NOUN[missing.kind]} was deleted for good`
    }
  }

  private doneResult(entry: UndoEntry<Op>, outcome: { renderer?: RendererUndoOp }): UndoRunResult {
    return outcome.renderer
      ? { status: 'done', label: entry.label, renderer: outcome.renderer }
      : { status: 'done', label: entry.label }
  }

  private remove(entry: UndoEntry<Op>): void {
    this.done = this.done.filter((e) => e !== entry)
    this.undone = this.undone.filter((e) => e !== entry)
  }
}
