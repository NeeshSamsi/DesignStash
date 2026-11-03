import { appR4, imageOf, requestKind, smaller, withImage } from './r4'

/** Round 4, 4B speed: the object hint and the scene checks both look at the cover scaled to 512 px. */
export default appR4({
  id: 'sp-hc512',
  notes: 'The object hint and the scene checks on a 512 px cover.',
  transform: async (request) => {
    const kind = requestKind(request)
    const url = imageOf(request)
    return (kind === 'hint' || kind === 'check') && url ? withImage(request, await smaller(url, 512)) : request
  }
})
