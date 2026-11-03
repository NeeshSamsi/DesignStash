import { appR4, requestKind } from './r4'

/**
 * Round 4, 4B speed: the object hint asked with the answer's system prompt, so it and the scene
 * checks start with the same tokens (system, then the cover as it is). Run with two llama-server
 * slots, so the hint's cover stays cached in one while the answer uses the other:
 *   DESIGNSTASH_EVAL_SERVER_ARGS="--parallel 2 --ctx-size 16384" pnpm ai-eval:run --model qwen3-vl-4b --prompt sp-2slot
 */
export default appR4({
  id: 'sp-2slot',
  notes: "The hint with the answer's system prompt, on two llama-server slots.",
  transform: (request) => {
    if (requestKind(request) !== 'hint') return request
    const [, ...rest] = request.messages as { role: string; content: unknown }[]
    return {
      ...request,
      messages: [{ role: 'system', content: "You write the catalogue entry for one design mockup in a designer's library. A designer finds it later by typing a few plain words into a search box, so the words you choose decide whether it can be found. Write in English." }, ...rest]
    }
  }
})
