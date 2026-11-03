import { appR4, imageOf, requestKind, smaller, withImage } from './r4'

/** Round 4, 4B speed: the scene checks look at the cover scaled to 512 px. */
export default appR4({
  id: 'sp-check512',
  notes: 'The scene checks on a 512 px cover.',
  transform: async (request) => {
    const url = imageOf(request)
    return requestKind(request) === 'check' && url ? withImage(request, await smaller(url, 512)) : request
  }
})
