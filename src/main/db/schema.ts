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
import type { DraftCarry } from '../../shared/approval'
import type { VariationSource } from '../../shared/pile-variation'

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

/**
 * A mockup's variation in a pile (design/specs/pile-titles.md): its 1 to 3 words, and where they came
 * from. Null on a mockup on its own. In a pile, `title` is the pile's base, the same on every row.
 */
const variationColumns = {
  variation: text('variation'),
  variationSource: text('variation_source').$type<VariationSource>()
}

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
    aiStatus: text('ai_status', { enum: ['pending', 'sniffing', 'ready', 'failed', 'opted_out', 'off'] })
      .notNull()
      .default('off'),
    /** The AI's suggestions for this mockup (title, tags). Written by the background queue. */
    aiResult: text('ai_result', { mode: 'json' }),
    ...variationColumns,
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
/** A draft's fields, by name. */
export type DraftField = 'title' | 'description' | 'tags'

// The carry's shape lives with the contract, since Undo of a stash carries it to the renderer and back.
export type { CarryState, DraftCarry, DraftWords } from '../../shared/approval'

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
  /**
   * Made from the fallback (the file name, and a variant's top) while the background AI was still
   * working on it. When the suggestion lands it replaces every field not in `keptFields`.
   */
  awaitingAi: integer('awaiting_ai', { mode: 'boolean' }).notNull().default(false),
  /** Fields a late suggestion leaves alone: ones the user edited, and ones a carry-over from the top set. */
  keptFields: text('kept_fields', { mode: 'json' })
    .$type<DraftField[]>()
    .notNull()
    .default(sql`'[]'`),
  /** The last edit to its pile's top, on an untouched variant: judged, offered or taken (`DraftCarry`). */
  carry: text('carry', { mode: 'json' }).$type<DraftCarry>(),
  /** In a pile, `title` is the pile's base, the same on every draft, and this is the mockup's own part. */
  ...variationColumns,
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

/**
 * Meaning-search vectors: one per stashed mockup per model, a Float32 BLOB of `dimension` floats
 * (unit length). `textHash` is the hash of the text that was embedded, so a vector is only
 * recomputed when the title, description or tags change.
 */
export const mockupEmbeddings = sqliteTable(
  'mockup_embeddings',
  {
    mockupId: integer('mockup_id')
      .notNull()
      .references(() => mockups.id, { onDelete: 'cascade' }),
    modelId: text('model_id').notNull(),
    dimension: integer('dimension').notNull(),
    vector: blob('vector', { mode: 'buffer' }).notNull(),
    textHash: text('text_hash').notNull()
  },
  (t) => [primaryKey({ columns: [t.mockupId, t.modelId] })]
)

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
