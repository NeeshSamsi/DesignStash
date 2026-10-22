import { buildRequest, parseResult } from '../vision-provider'
import type { PromptProfile } from './profile'

/**
 * Apple's on-device model, through the Swift helper's `describe`. For now the shipped request and
 * parsing, unchanged; a tuned prompt replaces this. Only the instructions, prompt, schema and
 * `max_tokens` reach the model (`appleDescribeRequest`): the helper decodes greedily, so the
 * sampling settings are ignored, and the schema loses its `pattern`s.
 */
export const profile: PromptProfile = { buildRequest, parseResult }
