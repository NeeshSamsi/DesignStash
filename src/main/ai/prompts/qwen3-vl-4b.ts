import { buildRequest, parseResult } from '../vision-provider'
import type { PromptProfile } from './profile'

/** Qwen3-VL 4B Instruct. For now the shipped request and parsing, unchanged; a tuned prompt replaces this. */
export const profile: PromptProfile = { buildRequest, parseResult }
