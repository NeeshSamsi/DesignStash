import { sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm'
import {
  sqliteTable,
  integer,
  text,
  blob,
  primaryKey,
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
  text(name, { enum: ['embedded', 'sidecar', 'user-uploaded', 'default'] })

/** Mockups — the primary library entity (spec §5.4). No `source_path`: originals are untracked once copied in. */
export const mockups = sqliteTable('mockups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  libraryPath: text('library_path').notNull(),
  coverPath: text('cover_path').notNull(),
  coverSource: coverSource('cover_source').notNull(),
  reviewStatus: text('review_status', { enum: ['needs_review', 'approved'] })
    .notNull()
    .default('needs_review'),
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
  ...timestamps
})

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

/** Tags — two-tier hierarchy: belong to a category, optional parent tag for roll-up (spec §3.6). */
export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    label: text('label').notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => tagCategories.id, { onDelete: 'cascade' }),
    parentTagId: integer('parent_tag_id').references((): AnySQLiteColumn => tags.id, {
      onDelete: 'set null'
    }),
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

/** Semantic-search vectors — placeholder for M13 (spec §8). */
export const embeddings = sqliteTable('embeddings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mockupId: integer('mockup_id')
    .notNull()
    .references(() => mockups.id, { onDelete: 'cascade' }),
  vector: blob('vector').notNull(),
  modelId: text('model_id').notNull()
})

export type Mockup = InferSelectModel<typeof mockups>
export type NewMockup = InferInsertModel<typeof mockups>
export type Variant = InferSelectModel<typeof variants>
export type NewVariant = InferInsertModel<typeof variants>
export type TagCategory = InferSelectModel<typeof tagCategories>
export type Tag = InferSelectModel<typeof tags>
export type NewTag = InferInsertModel<typeof tags>
