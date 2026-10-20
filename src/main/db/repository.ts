import type { AppDatabase } from './connection'
import { MockupRepository } from './repositories/mockups'
import { PileRepository } from './repositories/piles'
import { TagRepository } from './repositories/tags'
import { LibraryQueryRepository } from './repositories/library-query'
import { TrashRepository } from './repositories/trash'
import { SearchRepository } from './repositories/search'
import { InboxRepository } from './repositories/inbox'

export type { LibraryRow } from './repositories/library-query'

type Args<T extends (...args: never[]) => unknown> = Parameters<T>

/**
 * Typed data-access layer over Drizzle. Queries live in the domain classes under
 * ./repositories; this facade keeps the original flat API so services and handlers
 * don't change. Add new queries to a domain class, not here.
 */
export class Repository {
  readonly search: SearchRepository
  readonly mockups: MockupRepository
  readonly piles: PileRepository
  readonly tags: TagRepository
  readonly library: LibraryQueryRepository
  readonly trash: TrashRepository
  readonly inbox: InboxRepository

  constructor(db: AppDatabase) {
    this.search = new SearchRepository(db)
    this.mockups = new MockupRepository(db, this.search)
    this.piles = new PileRepository(db)
    this.tags = new TagRepository(db, this.mockups, this.search)
    this.library = new LibraryQueryRepository(db, this.mockups, this.piles, this.search)
    this.trash = new TrashRepository(db, this.mockups, this.search, this.library, this.piles)
    this.inbox = new InboxRepository(db, this.library, this.piles)
  }

  // Mockups
  createMockup(...a: Args<MockupRepository['createMockup']>) { return this.mockups.createMockup(...a) }
  setStage(...a: Args<MockupRepository['setStage']>) { return this.mockups.setStage(...a) }
  getMockup(...a: Args<MockupRepository['getMockup']>) { return this.mockups.getMockup(...a) }
  /** @deprecated legacy — does not exclude soft-deleted; use getLibrary for the grid */
  getAllMockups() { return this.mockups.getAllMockups() }
  deleteMockup(...a: Args<MockupRepository['deleteMockup']>) { return this.mockups.deleteMockup(...a) }
  setFavourite(...a: Args<MockupRepository['setFavourite']>) { return this.mockups.setFavourite(...a) }
  getAllLibraryPaths() { return this.mockups.getAllLibraryPaths() }
  mockupExistsByHash(...a: Args<MockupRepository['mockupExistsByHash']>) { return this.mockups.mockupExistsByHash(...a) }
  updateMockup(...a: Args<MockupRepository['updateMockup']>) { return this.mockups.updateMockup(...a) }
  getMockupsByBatchId(...a: Args<MockupRepository['getMockupsByBatchId']>) { return this.mockups.getMockupsByBatchId(...a) }
  approveItem(...a: Args<MockupRepository['approveItem']>) { return this.mockups.approveItem(...a) }
  setMockupCover(...a: Args<MockupRepository['setMockupCover']>) { return this.mockups.setMockupCover(...a) }
  updateMockupMeta(...a: Args<MockupRepository['updateMockupMeta']>) { return this.mockups.updateMockupMeta(...a) }
  createVariant(...a: Args<MockupRepository['createVariant']>) { return this.mockups.createVariant(...a) }
  getVariantsForMockup(...a: Args<MockupRepository['getVariantsForMockup']>) { return this.mockups.getVariantsForMockup(...a) }
  getTagsForMockup(...a: Args<MockupRepository['getTagsForMockup']>) { return this.mockups.getTagsForMockup(...a) }
  addTagToMockup(...a: Args<MockupRepository['addTagToMockup']>) { return this.mockups.addTagToMockup(...a) }
  removeTagFromMockup(...a: Args<MockupRepository['removeTagFromMockup']>) { return this.mockups.removeTagFromMockup(...a) }
  clearTagsForMockup(...a: Args<MockupRepository['clearTagsForMockup']>) { return this.mockups.clearTagsForMockup(...a) }

  // Piles
  getMockupsByGroupId(...a: Args<PileRepository['getMockupsByGroupId']>) { return this.piles.getMockupsByGroupId(...a) }
  confirmGroupings(...a: Args<PileRepository['confirmGroupings']>) { return this.piles.confirmGroupings(...a) }
  ungroupGroup(...a: Args<PileRepository['ungroupGroup']>) { return this.piles.ungroupGroup(...a) }
  collectGroupIds(...a: Args<PileRepository['collectGroupIds']>) { return this.piles.collectGroupIds(...a) }
  getPileRows(...a: Args<PileRepository['getPileRows']>) { return this.piles.getPileRows(...a) }
  restorePileRows(...a: Args<PileRepository['restorePileRows']>) { return this.piles.restorePileRows(...a) }
  createPile(...a: Args<PileRepository['createPile']>) { return this.piles.createPile(...a) }
  addToPile(...a: Args<PileRepository['addToPile']>) { return this.piles.addToPile(...a) }
  mergePiles(...a: Args<PileRepository['mergePiles']>) { return this.piles.mergePiles(...a) }
  setPileTop(...a: Args<PileRepository['setPileTop']>) { return this.piles.setPileTop(...a) }
  disbandPile(...a: Args<PileRepository['disbandPile']>) { return this.piles.disbandPile(...a) }

  // Tags and categories
  getCategoryByLabel(...a: Args<TagRepository['getCategoryByLabel']>) { return this.tags.getCategoryByLabel(...a) }
  createCategory(...a: Args<TagRepository['createCategory']>) { return this.tags.createCategory(...a) }
  getAllCategories() { return this.tags.getAllCategories() }
  renameCategory(...a: Args<TagRepository['renameCategory']>) { return this.tags.renameCategory(...a) }
  getAllTags() { return this.tags.getAllTags() }
  getTagTree() { return this.tags.getTagTree() }
  getTagUsageCount(...a: Args<TagRepository['getTagUsageCount']>) { return this.tags.getTagUsageCount(...a) }
  renameTag(...a: Args<TagRepository['renameTag']>) { return this.tags.renameTag(...a) }
  reassignTagCategory(...a: Args<TagRepository['reassignTagCategory']>) { return this.tags.reassignTagCategory(...a) }
  previewMergeTags(...a: Args<TagRepository['previewMergeTags']>) { return this.tags.previewMergeTags(...a) }
  mergeTags(...a: Args<TagRepository['mergeTags']>) { return this.tags.mergeTags(...a) }
  deleteTag(...a: Args<TagRepository['deleteTag']>) { return this.tags.deleteTag(...a) }
  restoreTag(...a: Args<TagRepository['restoreTag']>) { return this.tags.restoreTag(...a) }
  deleteCategory(...a: Args<TagRepository['deleteCategory']>) { return this.tags.deleteCategory(...a) }
  restoreCategory(...a: Args<TagRepository['restoreCategory']>) { return this.tags.restoreCategory(...a) }
  findTagsByLabel(...a: Args<TagRepository['findTagsByLabel']>) { return this.tags.findTagsByLabel(...a) }
  getTagByLabel(...a: Args<TagRepository['getTagByLabel']>) { return this.tags.getTagByLabel(...a) }
  createTag(...a: Args<TagRepository['createTag']>) { return this.tags.createTag(...a) }
  getApprovalTagsByIds(...a: Args<TagRepository['getApprovalTagsByIds']>) { return this.tags.getApprovalTagsByIds(...a) }

  // Search index
  upsertSearchIndex(...a: Args<SearchRepository['upsertSearchIndex']>) { return this.search.upsertSearchIndex(...a) }
  removeSearchIndex(...a: Args<SearchRepository['removeSearchIndex']>) { return this.search.removeSearchIndex(...a) }
  rebuildSearchIndex() { return this.search.rebuildSearchIndex() }

  // Library reads
  getLibrary(...a: Args<LibraryQueryRepository['getLibrary']>) { return this.library.getLibrary(...a) }
  getMockupDetail(...a: Args<LibraryQueryRepository['getMockupDetail']>) { return this.library.getMockupDetail(...a) }
  getDetailVariants(...a: Args<LibraryQueryRepository['getDetailVariants']>) { return this.library.getDetailVariants(...a) }
  getLibraryStats() { return this.library.getLibraryStats() }

  // Inboxes
  getInboxList(...a: Args<InboxRepository['list']>) { return this.inbox.list(...a) }
  getUnfinishedAiMockups() { return this.inbox.getUnfinishedAiMockups() }
  getInboxCounts() { return this.inbox.getCounts() }
  collectTossable(...a: Args<InboxRepository['collectTossable']>) { return this.inbox.collectTossable(...a) }

  // Trash
  getTrash() { return this.trash.getTrash() }
  getTrashEntries() { return this.trash.getTrashEntries() }
  moveToTrash(...a: Args<TrashRepository['moveToTrash']>) { return this.trash.moveToTrash(...a) }
  restore(...a: Args<TrashRepository['restore']>) { return this.trash.restore(...a) }
  moveManyToTrash(...a: Args<TrashRepository['moveManyToTrash']>) { return this.trash.moveManyToTrash(...a) }
  restoreMany(...a: Args<TrashRepository['restoreMany']>) { return this.trash.restoreMany(...a) }
  deleteMockupsHard(...a: Args<TrashRepository['deleteMockupsHard']>) { return this.trash.deleteMockupsHard(...a) }
}
