import type { AppDatabase } from '../db/connection'
import type { Repository } from '../db/repository'
import type { SettingsStore } from '../settings'
import { createDataOps, type DataOps } from './ops'
import { createUndoService, type UndoService } from './undo-service'

/**
 * A handler test's undo: the real history over data's real ops on the test's database, with
 * nothing pushed and no menu. Spread into the test's HandlerContext.
 */
export function undoForTests(
  repo: Repository,
  db: AppDatabase,
  settings: Pick<SettingsStore, 'update'> = { update: (patch) => patch as never }
): { undo: UndoService; dataOps: DataOps } {
  const dataOps = createDataOps({ repo, db })
  const undo = createUndoService({
    data: dataOps.runner,
    settings: settings as SettingsStore,
    push: () => {},
    menu: () => {},
    editField: () => {}
  })
  return { undo, dataOps }
}
