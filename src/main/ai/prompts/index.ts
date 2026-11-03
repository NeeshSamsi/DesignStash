import { profile as apple } from './apple'
import type { PromptProfile } from './profile'
import { profile as qwen35 } from './qwen3.5-9b'
import { profile as qwen3vl } from './qwen3-vl-4b'

export type { PromptProfile } from './profile'

/** Every model's prompt, by the id its catalogue entry names. */
export const PROMPT_PROFILES = {
  'qwen3-vl-4b': qwen3vl,
  'qwen3.5-9b': qwen35,
  apple
} as const satisfies Record<string, PromptProfile>

export type PromptProfileId = keyof typeof PROMPT_PROFILES

export function promptProfile(id: string): PromptProfile | undefined {
  return Object.hasOwn(PROMPT_PROFILES, id) ? PROMPT_PROFILES[id as PromptProfileId] : undefined
}
