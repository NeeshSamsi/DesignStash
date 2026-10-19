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

interface SeedCategory {
  label: string
  tags: string[]
}

/** Seed taxonomy: two tiers, category then tag (spec §3.7). */
const TAXONOMY: SeedCategory[] = [
  {
    label: 'Device',
    tags: [
      'laptop',
      'macbook',
      'windows-laptop',
      'phone',
      'iphone',
      'android-phone',
      'tablet',
      'ipad',
      'android-tablet',
      'desktop-monitor',
      'imac',
      'studio-display',
      'smartwatch',
      'apple-watch',
      'e-reader',
      'tv'
    ]
  },
  {
    label: 'Print & Branding',
    tags: [
      'business-card',
      'poster',
      'flyer',
      'billboard',
      'packaging',
      'box',
      'bottle',
      'bag',
      'label',
      'book-magazine',
      'stationery',
      'letterhead',
      'envelope',
      'signage'
    ]
  },
  {
    label: 'Apparel',
    tags: ['t-shirt', 'hoodie', 'cap', 'tote-bag', 'mug', 'sticker']
  },
  {
    label: 'Environment',
    tags: [
      'indoor',
      'outdoor',
      'desk-scene',
      'isometric',
      'flat-lay',
      'hand-held',
      'floating-perspective'
    ]
  },
  {
    label: 'Style',
    tags: ['minimal', 'realistic', '3d-render', 'dark', 'light', 'colorful']
  },
  {
    label: 'Angle',
    tags: ['front', 'side', 'angle', 'top-down']
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

      for (const label of category.tags) {
        tx.insert(tags).values({ label, categoryId: cat.id, createdBy: 'seed' }).run()
      }
    })
  })
}
