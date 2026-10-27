/** The most entries the history keeps. Older ones go first. */
export const UNDO_LIMIT = 200

/**
 * Something an action changed, so a permanent delete (Empty Trash, Delete for good, Delete entry)
 * can drop the entries that point at what it removed.
 */
export interface UndoTarget {
  kind: 'mockup' | 'tag' | 'category' | 'model'
  id: number | string
}

/** How an op went. A target that is gone comes back as data, never as a throw. */
export type OpOutcome = { ok: true } | { ok: false; missing: UndoTarget }

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
}

export type DropReason = { kind: 'missing-target'; target: UndoTarget }

export type UndoResult =
  | { status: 'done'; label: string }
  | { status: 'empty' }
  /** A toast's Undo for an action that is no longer the newest. */
  | { status: 'stale' }
  /** The step couldn't run and is gone from the history; the next one is the step before. */
  | { status: 'dropped'; label: string; reason: DropReason }

export interface UndoStep {
  id: number
  label: string
  at: string
}

const sameTarget = (a: UndoTarget, b: UndoTarget): boolean => a.kind === b.kind && a.id === b.id

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

  constructor(
    private readonly runner: OpRunner<Op>,
    options: { now?: () => Date } = {}
  ) {
    this.now = options.now ?? (() => new Date())
  }

  /**
   * Adds an action as the newest, clears what waits to be redone and returns the entry's id (a
   * toast keeps it). The entry is copied, which also refuses an op that holds a function.
   */
  record(action: UndoRecord<Op>): number {
    const copy = structuredClone(action)
    const entry: UndoEntry<Op> = { ...copy, id: this.nextId++, at: this.now().toISOString() }
    this.done.push(entry)
    if (this.done.length > UNDO_LIMIT) this.done.shift()
    this.undone = []
    this.generation++
    return entry.id
  }

  /** Takes back the newest action. With `id`, only when that entry is still the newest. */
  undo(options: { id?: number } = {}): Promise<UndoResult> {
    return this.serially(() => this.step('undo', options.id))
  }

  /** Does again the action undone last. */
  redo(): Promise<UndoResult> {
    return this.serially(() => this.step('redo'))
  }

  /**
   * After a permanent delete: drops every entry, on either side, that points at one of `targets`,
   * so ⌘Z walks back past them. Returns how many went.
   */
  forget(targets: UndoTarget[]): number {
    const hit = (e: UndoEntry<Op>) => e.targets.some((t) => targets.some((g) => sameTarget(t, g)))
    const gone = [...this.done, ...this.undone].filter(hit)
    for (const entry of gone) this.dropped.add(entry)
    this.done = this.done.filter((e) => !hit(e))
    this.undone = this.undone.filter((e) => !hit(e))
    return gone.length
  }

  clear(): void {
    for (const entry of [...this.done, ...this.undone]) this.dropped.add(entry)
    this.done = []
    this.undone = []
    this.generation++
  }

  /** The next undo and redo, for the Edit menu's labels and the toasts. */
  state(): { undo: UndoStep | null; redo: UndoStep | null } {
    const step = (e: UndoEntry<Op> | undefined): UndoStep | null =>
      e ? { id: e.id, label: e.label, at: e.at } : null
    return { undo: step(this.done.at(-1)), redo: step(this.undone.at(-1)) }
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
  private async step(direction: 'undo' | 'redo', id?: number): Promise<UndoResult> {
    const from = direction === 'undo' ? this.done : this.undone
    const entry = from.at(-1)
    if (!entry) return { status: 'empty' }
    if (id !== undefined && entry.id !== id) return { status: 'stale' }

    const generation = this.generation
    const outcome = await this.runner.run(direction === 'undo' ? entry.undo : entry.redo)

    // Read the sides again: an action may have been recorded, or entries forgotten, meanwhile.
    this.remove(entry)
    if (!outcome.ok) {
      return {
        status: 'dropped',
        label: entry.label,
        reason: { kind: 'missing-target', target: outcome.missing }
      }
    }
    if (this.dropped.has(entry)) return { status: 'done', label: entry.label }
    if (direction === 'undo') {
      // An action recorded while this ran cleared redo, and this step goes with it.
      if (generation === this.generation) this.undone.push(entry)
    } else {
      this.done.push(entry)
      if (this.done.length > UNDO_LIMIT) this.done.shift()
    }
    return { status: 'done', label: entry.label }
  }

  private remove(entry: UndoEntry<Op>): void {
    this.done = this.done.filter((e) => e !== entry)
    this.undone = this.undone.filter((e) => e !== entry)
  }
}
