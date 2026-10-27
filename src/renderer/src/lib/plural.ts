/** Counts in copy: one place for "1 mockup", "1,204 mockups" and the like. */

/** 1204 reads as "1,204". */
export const formatCount = (n: number): string => n.toLocaleString('en-US')

/** "1 item", "3 items". Give `many` when the plural is more than an added s ("PSDs turned"). */
export function pluralise(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`
}

/** "1 mockup", "1,204 mockups". */
export const mockups = (n: number): string => pluralise(n, 'mockup')
