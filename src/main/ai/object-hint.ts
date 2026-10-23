/**
 * Two looks for the object's name (eval ck-7, design/research/ai-round3.md). A masked cover hides
 * the sample art the model used to tell what the product is: a lime print made "a branded box",
 * address text made "envelopes". So before answering from the masked cover, the model is asked
 * about the cover as it is what kind of object it shows, in a few words with no colours, brands or
 * printed words, and the masked request is told that name.
 */

/** The question, about the cover as it is. */
export function objectHintRequest(coverUrl: string): object {
  return {
    messages: [
      { role: 'system', content: 'You name the object a design mockup shows.' },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: coverUrl } },
          {
            type: 'text',
            text: 'What kind of object is this mockup of? Give its everyday name in one to three words, plural if there are several of it. No colours, brands, printed words or setting.'
          }
        ]
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'object',
        schema: { type: 'object', properties: { object: { type: 'string', maxLength: 40 } }, required: ['object'] }
      }
    },
    temperature: 0,
    max_tokens: 30
  }
}

/** The name from the reply, or null when there is none to use. */
export function readObjectHint(text: string): string | null {
  try {
    const object = (JSON.parse(text) as { object?: unknown }).object
    return typeof object === 'string' && object.trim() ? object.trim() : null
  } catch {
    return null
  }
}

/** The line the masked request gets. */
export const objectHintLine = (object: string): string => `Seen in full, the main object is: ${object}. Use that name for it.`
