import { join } from 'node:path'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import type { AppDatabase } from './connection'
import { tagCategories, tags } from './schema'

/** Create the managed library folders + config (spec §5.3). */
export function bootstrapLibrary(libraryRoot: string): void {
  for (const folder of [join(libraryRoot, 'mockups'), join(libraryRoot, 'models')]) {
    if (!existsSync(folder)) mkdirSync(folder, { recursive: true })
  }
  const configPath = join(libraryRoot, 'config.json')
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify({ version: 1 }, null, 2), 'utf-8')
  }
}

interface SeedTag {
  label: string
  children?: string[]
}
interface SeedCategory {
  label: string
  tags: SeedTag[]
}

/** Seed taxonomy with two-tier category→tag hierarchy + roll-up parents (spec §3.7). */
const TAXONOMY: SeedCategory[] = [
  {
    label: 'Device',
    tags: [
      { label: 'laptop', children: ['macbook', 'windows-laptop'] },
      { label: 'phone', children: ['iphone', 'android-phone'] },
      { label: 'tablet', children: ['ipad', 'android-tablet'] },
      { label: 'desktop-monitor', children: ['imac', 'studio-display'] },
      { label: 'smartwatch', children: ['apple-watch'] },
      { label: 'e-reader' },
      { label: 'tv' }
    ]
  },
  {
    label: 'Print & Branding',
    tags: [
      { label: 'business-card' },
      { label: 'poster' },
      { label: 'flyer' },
      { label: 'billboard' },
      { label: 'packaging', children: ['box', 'bottle', 'bag', 'label'] },
      { label: 'book-magazine' },
      { label: 'stationery', children: ['letterhead', 'envelope'] },
      { label: 'signage' }
    ]
  },
  {
    label: 'Apparel',
    tags: [
      { label: 't-shirt' },
      { label: 'hoodie' },
      { label: 'cap' },
      { label: 'tote-bag' },
      { label: 'mug' },
      { label: 'sticker' }
    ]
  },
  {
    label: 'Environment',
    tags: [
      { label: 'indoor' },
      { label: 'outdoor' },
      { label: 'desk-scene' },
      { label: 'isometric' },
      { label: 'flat-lay' },
      { label: 'hand-held' },
      { label: 'floating-perspective' }
    ]
  },
  {
    label: 'Style',
    tags: [
      { label: 'minimal' },
      { label: 'realistic' },
      { label: '3d-render' },
      { label: 'dark' },
      { label: 'light' },
      { label: 'colorful' }
    ]
  },
  {
    label: 'Angle',
    tags: [{ label: 'front' }, { label: 'side' }, { label: 'angle' }, { label: 'top-down' }]
  }
]

/** Idempotent: seeds only when no categories exist yet. */
export function seedTaxonomy(db: AppDatabase): void {
  const existing = db.select({ count: sql<number>`count(*)` }).from(tagCategories).get()
  if (existing && existing.count > 0) return

  db.transaction((tx) => {
    TAXONOMY.forEach((category, index) => {
      const cat = tx
        .insert(tagCategories)
        .values({ label: category.label, sortOrder: index })
        .returning({ id: tagCategories.id })
        .get()

      for (const tag of category.tags) {
        const parent = tx
          .insert(tags)
          .values({ label: tag.label, categoryId: cat.id, createdBy: 'seed' })
          .returning({ id: tags.id })
          .get()

        for (const child of tag.children ?? []) {
          tx.insert(tags)
            .values({ label: child, categoryId: cat.id, parentTagId: parent.id, createdBy: 'seed' })
            .run()
        }
      }
    })
  })
}
