import { TOKENS } from './tokens.generated'

const ms = (name: string): number => TOKENS.numbers.find((n) => n.name === name)!.value

/** Motion durations in ms, from the Figma duration/* variables. CSS uses --duration-fast, -base and -slow. */
export const DURATION_MS = {
  fast: ms('duration/fast'),
  base: ms('duration/base'),
  slow: ms('duration/slow')
} as const

/** The same curves as --ease-out and --ease-in in assets/main.css, for the Web Animations API. */
export const EASE_OUT = 'cubic-bezier(0, 0, 0.2, 1)'
export const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)'
