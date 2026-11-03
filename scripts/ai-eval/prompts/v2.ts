import { RESULT_JSON_SCHEMA, parseResult } from '../../../src/main/ai/vision-provider'
import type { PromptVersion } from './prompt-version'
import v1 from './v1'

/**
 * v2: v1's words plus a free-text `seen` field the model fills first, so the title, description and
 * tags are written from what it has just looked at (design/research/vlm-prompting.md §2). `seen` is
 * kept for reading and never saved.
 */
const SCHEMA = {
  ...RESULT_JSON_SCHEMA,
  properties: { seen: { type: 'string' }, ...RESULT_JSON_SCHEMA.properties },
  required: ['seen', ...RESULT_JSON_SCHEMA.required]
}

const SEEN_LINE =
  '- seen: first, two or three plain sentences on what is in the picture: the main object and what it is made of, what it stands on or hangs from, the background, the colours, and where the camera is. Write the other fields from this.'

const v2: PromptVersion = {
  id: 'v2',
  notes: "v1 plus a free-text 'seen' field ahead of the title, so the model looks before it names.",
  buildRequest(input, imageUrl) {
    const req = v1.buildRequest(input, imageUrl) as {
      messages: { role: string; content: unknown }[]
      response_format: { json_schema: { schema: object } }
      max_tokens: number
    }
    const user = req.messages[1]!.content as { type: string; text: string }[]
    const text = user[user.length - 1]!
    text.text = text.text
      .replace('Reply with JSON: title, description, tags.', 'Reply with JSON: seen, title, description, tags.')
      .replace('\n- title:', `\n${SEEN_LINE}\n- title:`)
    req.response_format.json_schema.schema = SCHEMA
    req.max_tokens = 600
    return req
  },
  parseResult(raw) {
    const result = parseResult(raw)
    const seen = (JSON.parse(raw.match(/\{[\s\S]*\}/)![0]) as { seen?: string }).seen
    return { ...result, extra: { seen } }
  }
}

export default v2
