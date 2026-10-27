import type { AppDatabase } from './connection'
import { MockupRepository } from './repositories/mockups'
import { PileRepository } from './repositories/piles'
import { TagRepository } from './repositories/tags'
import { LibraryQueryRepository } from './repositories/library-query'
import { TrashRepository } from './repositories/trash'
import { SearchRepository } from './repositories/search'
import { EmbeddingRepository } from './repositories/embeddings'
import { InboxRepository } from './repositories/inbox'
import { SortBoardRepository } from './repositories/sort-board'
import { DraftRepository } from './repositories/drafts'
import { CopyJobRepository } from './repositories/copy-jobs'

export type { LibraryRow } from './repositories/library-query'

/**
 * Typed data-access layer over Drizzle. Queries live in the domain classes under
 * ./repositories; callers reach them as repo.<domain>.<method>. Add new queries to a
 * domain class, not here.
 */
export class Repository {
  readonly search: SearchRepository
  readonly embeddings: EmbeddingRepository
  readonly mockups: MockupRepository
  readonly piles: PileRepository
  readonly tags: TagRepository
  readonly library: LibraryQueryRepository
  readonly trash: TrashRepository
  readonly inbox: InboxRepository
  readonly sortBoards: SortBoardRepository
  readonly drafts: DraftRepository
  readonly copyJobs: CopyJobRepository

  constructor(private readonly db: AppDatabase) {
    this.search = new SearchRepository(db)
    this.embeddings = new EmbeddingRepository(db)
    this.mockups = new MockupRepository(db, this.search)
    this.piles = new PileRepository(db)
    this.tags = new TagRepository(db, this.mockups, this.search)
    this.library = new LibraryQueryRepository(db, this.mockups, this.piles, this.search)
    this.trash = new TrashRepository(db, this.mockups, this.search, this.library)
    this.inbox = new InboxRepository(db, this.library, this.piles)
    this.sortBoards = new SortBoardRepository(db)
    this.drafts = new DraftRepository(db)
    this.copyJobs = new CopyJobRepository(db)
  }

  /**
   * Runs `fn` in one transaction, for writes that span repositories: all of them land, or none
   * does. A repository's own transaction inside it becomes a savepoint, so it is undone too.
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(() => fn())
  }
}
