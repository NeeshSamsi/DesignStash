import { appR4, imageOf, requestKind, smaller, withImage } from './r4'

/** Round 4, 4B speed: the object hint looks at the cover scaled to 512 px, a quarter of the image tokens. */
export default appR4({
  id: 'sp-hint512',
  notes: 'The object hint on a 512 px cover.',
  transform: async (request) => {
    const url = imageOf(request)
    return requestKind(request) === 'hint' && url ? withImage(request, await smaller(url, 512)) : request
  }
})
