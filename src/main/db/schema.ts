import { sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm'
import {
  sqliteTable,
  integer,
  text,
  blob,
  primaryKey,
  check,
  uniqueIndex,
  type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core'

// Shared timestamp columns (SQLite-native defaults).
const timestamps = {
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`)
}

const coverSource = (name: string) =>
  text(name, { enum: ['embedded', 'sidecar', 'user-uploaded', 'default', 'none'] })

/** Mockups — the primary library entity (spec §5.4). No `source_path`: originals are untracked once copied in. */
export const mockups = sqliteTable(
  'mockups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    description: text('description'),
    libraryPath: text('library_path').notNull(),
    coverPath: text('cover_path').notNull(),
    coverSource: coverSource('cover_source').notNull(),
    contentHash: text('content_hash'),
    /** Import metadata. Does NOT violate the 'no source_path' rule: we store folder *names* as text hints, never a reusable path. */
    importContext: text('import_context', { mode: 'json' }),
    isGroup: integer('is_group', { mode: 'boolean' }).notNull().default(false),
    groupId: integer('group_id').references((): AnySQLiteColumn => mockups.id, {
      onDelete: 'set null'
    }),
    favourite: integer('favourite', { mode: 'boolean' }).notNull().default(false),
    favouritedAt: text('favourited_at'),
    deletedAt: text('deleted_at'),
    /**
     * Where the mockup is in the import flow: waiting to be sorted into piles, sorted and waiting
     * to be looked over, or stashed (in My Stash).
     */
    stage: text('stage', { enum: ['to_sort', 'to_stash', 'stashed'] })
      .notNull()
      .default('stashed'),
    /** When it left To sort. */
    sortedAt: text('sorted_at'),
    /** Size of the PSD in the stash folder, in bytes. Null until measured. */
    sizeBytes: integer('size_bytes'),
    /** The AI suggestion's progress. `off` when the AI is not in use. */
    aiStatus: text('ai_status', { enum: ['pending', 'sniffing', 'ready', 'failed', 'off'] })
      .notNull()
      .default('off'),
    /** The AI's suggestions for this mockup (title, tags). Written by the background queue. */
    aiResult: text('ai_result', { mode: 'json' }),
    ...timestamps
  },
  (table) => [
    // A row is a pile's top or a member of one, never both (see pileRole in repositories/piles.ts).
    check('mockups_pile_shape', sql`NOT (${table.isGroup} AND ${table.groupId} IS NOT NULL)`)
  ]
)

/** Variants — angle/variant images belonging to a group mockup (spec §5.4). */
export const variants = sqliteTable('variants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mockupId: integer('mockup_id')
    .notNull()
    .references(() => mockups.id, { onDelete: 'cascade' }),
  libraryPath: text('library_path').notNull(),
  coverPath: text('cover_path').notNull(),
  coverSource: coverSource('cover_source').notNull(),
  position: integer('position').notNull().default(0),
  aiMeta: text('ai_meta', { mode: 'json' }),
  ...timestamps
})

/** Overarching tag categories (Device, Apparel, …). */
export const tagCategories = sqliteTable('tag_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  isCanonical: integer('is_canonical', { mode: 'boolean' }).notNull().default(true)
})

/** Tags: two tiers, category then tag. No nesting; roll-up is at the category level. */
export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    label: text('label').notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => tagCategories.id, { onDelete: 'cascade' }),
    isCanonical: integer('is_canonical', { mode: 'boolean' }).notNull().default(true),
    createdBy: text('created_by', { enum: ['seed', 'ai', 'user'] })
      .notNull()
      .default('seed')
  },
  (table) => [uniqueIndex('tags_category_label_unique').on(table.categoryId, table.label)]
)

/** Mockup ↔ tag join. */
export const mockupTags = sqliteTable(
  'mockup_tags',
  {
    mockupId: integer('mockup_id')
      .notNull()
      .references(() => mockups.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' })
  },
  (table) => [primaryKey({ columns: [table.mockupId, table.tagId] })]
)

/**
 * The Sort board as the user left it (Finish later from Sort): which mockups of a batch sit in
 * which pile, and which are standing alone. One row per import batch; `board` is JSON.
 */
export const sortBoards = sqliteTable('sort_boards', {
  batchId: text('batch_id').primaryKey(),
  board: text('board', { mode: 'json' }).notNull(),
  ...timestamps
})

/**
 * Look it over: what the user sees for a mockup until it is stashed. Everything in a pile stays a
 * draft until Stash pile, so nothing reaches My Stash one mockup at a time. A row is made when the
 * queue opens and is removed when the mockup is stashed.
 */
export const drafts = sqliteTable('drafts', {
  mockupId: integer('mockup_id')
    .primaryKey()
    .references(() => mockups.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  tagIds: text('tag_ids', { mode: 'json' })
    .$type<number[]>()
    .notNull()
    .default(sql`'[]'`),
  /** The user changed this variant, so edits to the top mockup no longer overwrite it. */
  touched: integer('touched', { mode: 'boolean' }).notNull().default(false),
  /** The user opened it. An unchecked draft in a stashed pile reads "Not checked". */
  checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
  /** Set by Skip for now (a mockup on its own): it moves to the end of the queue. */
  skippedAt: text('skipped_at'),
  ...timestamps
})

/** Where Finish later left off in a pile or on a mockup on its own, so coming back resumes there. */
export const lookOverResume = sqliteTable('look_over_resume', {
  /** The pile's id (its top mockup), or the mockup's own id when it stands alone. */
  unitId: integer('unit_id')
    .primaryKey()
    .references(() => mockups.id, { onDelete: 'cascade' }),
  /** The step to resume on. */
  mockupId: integer('mockup_id').notNull(),
  ...timestamps
})

/**
 * A haul: one run of the copy queue, from the first drop until it is done or cancelled. Files dropped
 * while it runs join it. Persisted so a restart carries on where it stopped.
 */
export const copyHauls = sqliteTable('copy_hauls', {
  id: text('id').primaryKey(),
  state: text('state', { enum: ['running', 'paused', 'done', 'cancelled', 'undone'] })
    .notNull()
    .default('running'),
  /** Why it is paused. Null unless `state` is 'paused'. */
  pauseReason: text('pause_reason', { enum: ['disk-full', 'source-gone'] }),
  /** Images found beside the dropped PSDs, which can stand in for a missing preview. Paths, kept only while it runs. */
  candidateImages: text('candidate_images', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  /** Files that were not PSDs and so were never queued. */
  notPsdCount: integer('not_psd_count').notNull().default(0),
  ...timestamps
})

/**
 * One PSD in a haul. `sourcePath` is only the way back to the file while it waits; it is cleared once
 * the file is handled. For a PSD inside a zip, `sourcePath` is the zip and `archiveEntry` the PSD's
 * path inside it, cleared together.
 */
export const copyJobs = sqliteTable('copy_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  haulId: text('haul_id')
    .notNull()
    .references(() => copyHauls.id, { onDelete: 'cascade' }),
  sourcePath: text('source_path').notNull(),
  /** The PSD's path inside the zip at `sourcePath`. Null for a PSD dropped as itself. */
  archiveEntry: text('archive_entry'),
  /** The zip the PSD came out of, by its file name as dropped. Kept after the job is handled, for its row. */
  archiveName: text('archive_name'),
  fileName: text('file_name').notNull(),
  folderTrail: text('folder_trail', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  status: text('status', { enum: ['queued', 'copying', 'done', 'skipped'] })
    .notNull()
    .default('queued'),
  skipReason: text('skip_reason', {
    enum: ['duplicate', 'unreadable', 'archive-unsupported', 'no-psd-in-archive']
  }),
  /** The PSD's size in bytes, read when the haul was queued, so progress can be counted in bytes. */
  sizeBytes: integer('size_bytes').notNull().default(0),
  /** The mockup this became. */
  mockupId: integer('mockup_id'),
  ...timestamps
})

/** Semantic-search vectors — placeholder for M13 (spec §8). */
export const embeddings = sqliteTable('embeddings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mockupId: integer('mockup_id')
    .notNull()
    .references(() => mockups.id, { onDelete: 'cascade' }),
  vector: blob('vector').notNull(),
  modelId: text('model_id').notNull()
})

// mockups_fts (FTS5 virtual table) is maintained via raw SQL in search-index.ts and repository.ts — NOT a Drizzle table.

export type Mockup = InferSelectModel<typeof mockups>
export type Draft = InferSelectModel<typeof drafts>
export type CopyHaul = InferSelectModel<typeof copyHauls>
export type CopyJob = InferSelectModel<typeof copyJobs>
export type NewMockup = InferInsertModel<typeof mockups>
export type Variant = InferSelectModel<typeof variants>
export type NewVariant = InferInsertModel<typeof variants>
export type TagCategory = InferSelectModel<typeof tagCategories>
export type Tag = InferSelectModel<typeof tags>
export type NewTag = InferInsertModel<typeof tags>
