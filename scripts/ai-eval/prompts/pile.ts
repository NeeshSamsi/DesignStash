import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GroupingService } from '../../../src/main/import/grouping-service'
import { argValue, readItems, runDir } from '../eval-files'
import type { ItemResult } from '../run'
import type { AnalyzeContext, EvalResult, EvalVersion, PromptVersion } from './prompt-version'
import type { AnalysisInput } from '../../../src/shared/inference'

/**
 * The variant line said after the top's words, in place of the app's "Keep the title and tags
 * consistent with it.": the product and its names carry over, the scene is the variant's own.
 */
export const VARIANT_OWN_SCENE =
  'Use the same name for the product and keep the tags consistent with it, but describe what this image shows: its own setting, surface, angle and colours, which may differ from the first one.'

/** The tag categories that name the product; the others (Environment, Style, Angle) describe the scene. */
const PRODUCT_CATEGORIES = new Set(['Device', 'Print & Branding', 'Apparel'])

/**
 * The variant lines for a reference of the top's product names alone (`b-*-name`): no title,
 * description or scene tags, so nothing of the top's setting can carry over. Nothing is said when
 * the top has no product tag.
 */
export function productOnlyLines(group: NonNullable<AnalysisInput['groupContext']>): string[] {
  const names = [...new Set(group.originalTags.filter((t) => PRODUCT_CATEGORIES.has(t.category)).map((t) => t.label))]
  if (names.length === 0) return []
  return [
    `It is one of several mockups of the same product, which the first one names: ${names.join(', ')}. Use those names where this image shows that product, and describe this image's own setting, surface, angle and colours.`
  ]
}

/**
 * Round 3, experiment B: a pile variant gets its top's suggestion as a reference, in the app's
 * `groupContext` shape (`analysisInputFor`). Piles are what the app's `GroupingService.propose`
 * makes of the eval items when they are all dropped at once (same zip, then same folder, then same
 * name stem); the top is each pile's first member by file name, as the app picks it.
 *
 * The top's suggestion is read from the base version's own run for the same model and pass
 * (`runs/<model>/<base>/results.json`, or `topsFrom`'s), so a variant sees exactly what the app
 * would have shown the person for the top. With `reference: 'gold'` it is the top's gold entry
 * instead, standing in for the approved words the app passes today once the top is stashed
 * (`pileContextFor`). Run a pile version with `--only` its variants: `pileIds()` lists them.
 * Not a version itself.
 */
export interface Pile {
  top: string
  variants: string[]
}

export function piles(): Pile[] {
  const items = readItems().filter((i) => !i.duplicateOf)
  const members = items.map((i, n) => ({
    mockupId: n + 1,
    fileName: i.fileName,
    folderTrail: i.folderTrail,
    ...(i.source.zip && { archive: i.source.zip })
  }))
  const proposal = GroupingService.propose('eval', members as Parameters<typeof GroupingService.propose>[1])
  return proposal.groups.map((g) => {
    const ids = g.members.map((m) => ({ id: items[m.mockupId - 1]!.id, primary: m.isPrimary }))
    return { top: ids.find((m) => m.primary)!.id, variants: ids.filter((m) => !m.primary).map((m) => m.id) }
  })
}

/** Every variant id, for `--only`. */
export function pileIds(): string[] {
  return piles().flatMap((p) => p.variants)
}

export function pileVersion(
  base: EvalVersion,
  opts: { id: string; notes: string; topsFrom?: string; reference?: 'draft' | 'gold' }
): PromptVersion {
  const items = readItems().filter((i) => !i.duplicateOf)
  const gold: Record<string, EvalResult> = {}
  if (opts.reference === 'gold')
    for (const f of ['gold.json', 'gold-heldout.json', 'gold-signoff.json'])
      Object.assign(gold, (JSON.parse(readFileSync(join(import.meta.dirname, '..', f), 'utf8')) as { items: Record<string, EvalResult> }).items)
  const topOf = new Map(piles().flatMap((p) => p.variants.map((v) => [v, p.top] as const)))
  let tops: ItemResult[] | null = null
  const topAnswer = (topId: string, repeat: number): EvalResult => {
    if (opts.reference === 'gold') {
      if (!gold[topId]) throw new Error(`No gold entry for top ${topId}`)
      return gold[topId]
    }
    if (!tops) {
      const model = argValue('model')
      if (!model) throw new Error('pile versions read the --model run of their base version')
      const path = join(runDir(model, opts.topsFrom ?? base.id), 'results.json')
      if (!existsSync(path)) throw new Error(`No ${opts.topsFrom ?? base.id} run for ${model} to take the tops from`)
      tops = JSON.parse(readFileSync(path, 'utf8')) as ItemResult[]
    }
    const r = tops.find((t) => t.id === topId && t.repeat === repeat) ?? tops.find((t) => t.id === topId)
    if (!r?.parsed) throw new Error(`No ${opts.topsFrom ?? base.id} answer for top ${topId}`)
    return { ...r.parsed, tags: r.searchTags.length > 0 ? r.searchTags : r.parsed.tags }
  }
  return {
    ...(base as PromptVersion),
    id: opts.id,
    notes: opts.notes,
    async analyze(ctx: AnalyzeContext) {
      const item = items.find(
        (i) => i.fileName === ctx.input.fileName && i.folderTrail.join('/') === ctx.input.folderTrail.join('/')
      )
      const top = item && topOf.get(item.id)
      if (!top) throw new Error(`${ctx.input.fileName} is no pile's variant`)
      const t = topAnswer(top, ctx.repeat)
      const input = {
        ...ctx.input,
        groupContext: { originalTitle: t.title, originalDescription: t.description, originalTags: t.tags }
      }
      const answer = await base.analyze!({ ...ctx, input })
      return { ...answer, extra: { ...answer.extra, top } }
    }
  }
}
