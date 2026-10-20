import { eq } from 'drizzle-orm'
import { mockups } from '../schema'

/** A mockup is in My Stash when its stage is 'stashed'. Every reader asks this one question. */
export const isStashed = eq(mockups.stage, 'stashed')
