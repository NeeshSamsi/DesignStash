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

/**
 * Seed taxonomy: two tiers, category then tag (spec §3.7). Tags are stored as the label people read:
 * sentence case, except terms with their own casing (iPhone, MacBook, T-shirt, TV).
 */
const TAXONOMY: SeedCategory[] = [
  {
    label: 'Device',
    tags: [
      'Laptop',
      'MacBook',
      'Windows laptop',
      'Phone',
      'iPhone',
      'Android phone',
      'Tablet',
      'iPad',
      'Android tablet',
      'Desktop monitor',
      'iMac',
      'Studio display',
      'Smartwatch',
      'Apple Watch',
      'E-reader',
      'TV'
    ]
  },
  {
    label: 'Print & Branding',
    tags: [
      'Business card',
      'Poster',
      'Flyer',
      'Billboard',
      'Packaging',
      'Box',
      'Bottle',
      'Bag',
      'Label',
      'Book or magazine',
      'Stationery',
      'Letterhead',
      'Envelope',
      'Signage'
    ]
  },
  {
    label: 'Apparel',
    tags: ['T-shirt', 'Hoodie', 'Cap', 'Tote bag', 'Mug', 'Sticker']
  },
  {
    label: 'Environment',
    tags: [
      'Indoor',
      'Outdoor',
      'Desk scene',
      'Isometric',
      'Flat lay',
      'Hand-held',
      'Floating perspective'
    ]
  },
  {
    label: 'Style',
    tags: ['Minimal', 'Realistic', '3D render', 'Dark', 'Light', 'Colorful']
  },
  {
    label: 'Angle',
    tags: ['Front', 'Side', 'Angle', 'Top-down']
  }
]

/** The labels earlier versions seeded, with what each reads as now. The migration renames by this list. */
export const SEED_LABEL_RENAMES: Record<string, string> = {
  laptop: 'Laptop',
  macbook: 'MacBook',
  'windows-laptop': 'Windows laptop',
  phone: 'Phone',
  iphone: 'iPhone',
  'android-phone': 'Android phone',
  tablet: 'Tablet',
  ipad: 'iPad',
  'android-tablet': 'Android tablet',
  'desktop-monitor': 'Desktop monitor',
  imac: 'iMac',
  'studio-display': 'Studio display',
  smartwatch: 'Smartwatch',
  'apple-watch': 'Apple Watch',
  'e-reader': 'E-reader',
  tv: 'TV',
  'business-card': 'Business card',
  poster: 'Poster',
  flyer: 'Flyer',
  billboard: 'Billboard',
  packaging: 'Packaging',
  box: 'Box',
  bottle: 'Bottle',
  bag: 'Bag',
  label: 'Label',
  'book-magazine': 'Book or magazine',
  stationery: 'Stationery',
  letterhead: 'Letterhead',
  envelope: 'Envelope',
  signage: 'Signage',
  't-shirt': 'T-shirt',
  hoodie: 'Hoodie',
  cap: 'Cap',
  'tote-bag': 'Tote bag',
  mug: 'Mug',
  sticker: 'Sticker',
  indoor: 'Indoor',
  outdoor: 'Outdoor',
  'desk-scene': 'Desk scene',
  isometric: 'Isometric',
  'flat-lay': 'Flat lay',
  'hand-held': 'Hand-held',
  'floating-perspective': 'Floating perspective',
  minimal: 'Minimal',
  realistic: 'Realistic',
  '3d-render': '3D render',
  dark: 'Dark',
  light: 'Light',
  colorful: 'Colorful',
  front: 'Front',
  side: 'Side',
  angle: 'Angle',
  'top-down': 'Top-down'
}

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
