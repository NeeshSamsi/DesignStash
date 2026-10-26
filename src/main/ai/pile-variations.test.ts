import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  PILE_VARIATION_SYSTEM,
  askPileVariations,
  pileSheet,
  pileVariationsRequest,
  readPileVariations
} from './pile-variations'

let dir: string
const cover = (name: string) => join(dir, `${name}.png`)

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ds-pile-variations-'))
  for (const name of ['a', 'b', 'c', 'd']) {
    await sharp({ create: { width: 800, height: 600, channels: 3, background: '#808080' } }).png().toFile(cover(name))
  }
})

afterAll(() => rm(dir, { recursive: true, force: true }))

const size = async (url: string) => sharp(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')).metadata()

type Request = {
  messages: { role: string; content: string | { type: string; text?: string; image_url?: { url: string } }[] }[]
  response_format: { json_schema: { schema: { properties: { variations: { minItems: number; maxItems: number } } } } }
  temperature: number
  max_tokens: number
}

describe('pileSheet', () => {
  it('lays the covers out numbered, three to a row, 1024 px wide, as the eval measured', async () => {
    expect(await size(await pileSheet([cover('a'), cover('b')]))).toMatchObject({ width: 1024, height: 512 + 44, format: 'jpeg' })
    expect(await size(await pileSheet([cover('a'), cover('b'), cover('c'), cover('d')]))).toMatchObject({ width: 1023, height: 2 * (341 + 44) })
  })

  it('leaves a blank tile for a cover it cannot read, so the numbers still match the files', async () => {
    expect(await size(await pileSheet([cover('a'), join(dir, 'gone.png'), cover('c')]))).toMatchObject({ width: 1023, height: 341 + 44 })
  })
})

describe('pileVariationsRequest', () => {
  const request = pileVariationsRequest('data:image/jpeg;base64,SHEET', ['phone_front.psd', 'phone_side.psd', 'phone_back.psd']) as Request

  it('asks for every mockup in the pile in one request, the sheet first, with the file names numbered', () => {
    expect(request.messages[0]).toEqual({ role: 'system', content: PILE_VARIATION_SYSTEM })
    const [image, text] = request.messages[1]!.content as { type: string; text?: string; image_url?: { url: string } }[]
    expect(image).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,SHEET' } })
    expect(text!.text).toContain('3 mockups from one pile')
    expect(text!.text).toContain('Files: 1 = phone_front.psd, 2 = phone_side.psd, 3 = phone_back.psd.')
    expect(text!.text).toContain('in 1 to 3 words')
    expect(text!.text).toContain('Never name a colour of the object itself')
  })

  it('holds the reply to one answer per mockup, greedily, with room for each', () => {
    expect(request.response_format.json_schema.schema.properties.variations).toMatchObject({ minItems: 3, maxItems: 3 })
    expect(request.temperature).toBe(0)
    expect(request.max_tokens).toBe(60 + 30 * 3)
  })
})

describe('readPileVariations', () => {
  it('gives each mockup its words in order, trimmed, as the model wrote them', () => {
    expect(readPileVariations(JSON.stringify({ variations: [' front view ', 'side view.', 'European layout'] }), 3)).toEqual([
      'front view',
      'side view',
      'European layout'
    ])
  })

  it('gives nothing for "same", an empty answer, or one that is missing, so the fallback takes over', () => {
    expect(readPileVariations(JSON.stringify({ variations: ['same', 'No difference', '', 'n/a'] }), 5)).toEqual([null, null, null, null, null])
  })

  it('gives nothing for a reply it cannot read, and reads no further than the pile', () => {
    expect(readPileVariations('not json', 2)).toEqual([null, null])
    expect(readPileVariations(JSON.stringify({ variations: 'side' }), 1)).toEqual([null])
    expect(readPileVariations(JSON.stringify({ variations: ['a', 'b', 'c'] }), 2)).toEqual(['a', 'b'])
  })
})

describe('askPileVariations', () => {
  const pile = () => [
    { coverPath: cover('a'), fileName: 'phone_front.psd' },
    { coverPath: cover('b'), fileName: 'phone_side.psd' }
  ]

  it('asks once for the whole pile, the top included, and reads the answer', async () => {
    const complete = vi.fn<(request: object) => Promise<string>>(async () => JSON.stringify({ variations: ['front', 'side'] }))
    expect(await askPileVariations(pile(), complete)).toEqual(['front', 'side'])
    expect(complete).toHaveBeenCalledOnce()
    const request = complete.mock.calls[0]![0] as Request
    expect(await size((request.messages[1]!.content as { image_url?: { url: string } }[])[0]!.image_url!.url)).toMatchObject({ width: 1024 })
  })

  it('gives nothing for any of them when the request fails, so they all take the fallback', async () => {
    expect(await askPileVariations(pile(), async () => Promise.reject(new Error('busy')))).toEqual([null, null])
  })

  it('asks nothing for a pile of one', async () => {
    const complete = vi.fn(async () => '')
    expect(await askPileVariations(pile().slice(0, 1), complete)).toEqual([null])
    expect(complete).not.toHaveBeenCalled()
  })
})
