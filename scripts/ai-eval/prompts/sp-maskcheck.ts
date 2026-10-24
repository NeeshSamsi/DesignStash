import { appR4, imageOf, requestKind, withImage } from './r4'

/**
 * Round 4, 4B speed: the scene checks look at the image the answer came from (the masked cover), so
 * the first check reuses the answer's image from llama-server's cache. Round 3 found a masked check
 * misses things read into the painted slot; this measures what that costs.
 */
export default appR4({
  id: 'sp-maskcheck',
  notes: 'The scene checks on the image the answer came from.',
  transform: (request, memo) => {
    const kind = requestKind(request)
    const image = imageOf(request)
    if (kind === 'answer' && image) memo.answerImage = image
    return kind === 'check' && memo.answerImage ? withImage(request, memo.answerImage) : request
  }
})
