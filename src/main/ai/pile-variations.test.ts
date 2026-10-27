import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  PILE_VARIATION_SYSTEM,
  askPileVariations,
  pileBaseLine,
  pileSheet,
  pileVariationsRequest,
  pileVariationsText,
  readPileBase,
  readPileVariations,
  withoutPileWords
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
  response_format: {
    json_schema: { schema: { properties: { variations: { minItems: number; maxItems: number }; title?: { type: string; maxLength: number } }; required: string[] } }
  }
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

describe("the pile's base, asked in the same request (round 4 B, the 9B)", () => {
  const names = ['phone_front.psd', 'phone_side.psd']
  const top = 'Long scroll MacBook on wavy white sheets'

  it("starts from the top's own title, in the words round 4 B measured (pilebase3)", () => {
    expect(pileBaseLine(top)).toBe(
      'The first mockup\'s own title is "Long scroll MacBook on wavy white sheets". Also give the pile\'s title, at most 60 characters: that title with anything taken out that not every mockup in the pile has, such as a setting, a surface, a state or the design on a screen or label. Keep the object\'s name and product name as they are. Leave out the words mockup, variant and variation, and anything printed on the object.'
    )
    expect(pileVariationsText(names, top).split('\n')).toEqual([
      ...pileVariationsText(names).split('\n').slice(0, 2),
      pileBaseLine(top),
      'Reply with JSON: variations, a list of 2 answers in order, then title.'
    ])
  })

  it('holds the reply to the variations, then a title, with room for it', () => {
    const request = pileVariationsRequest('data:image/jpeg;base64,SHEET', names, top) as Request
    const { schema } = request.response_format.json_schema
    expect(schema.properties.title).toEqual({ type: 'string', maxLength: 80 })
    expect(schema.required).toEqual(['variations', 'title'])
    expect(request.max_tokens).toBe(60 + 30 * 2 + 30)
    expect((pileVariationsRequest('data:image/jpeg;base64,SHEET', names) as Request).response_format.json_schema.schema.required).toEqual(['variations'])
  })
})

describe('readPileBase', () => {
  it('gives the base as the model wrote it, trimmed', () => {
    expect(readPileBase(JSON.stringify({ variations: ['a', 'b'], title: ' Long Scroll MacBook ' }))).toBe('Long Scroll MacBook')
  })

  it('gives nothing for an empty or missing title, or a reply it cannot read', () => {
    expect(readPileBase(JSON.stringify({ variations: ['a'], title: '  ' }))).toBeNull()
    expect(readPileBase(JSON.stringify({ variations: ['a'] }))).toBeNull()
    expect(readPileBase(JSON.stringify({ title: 3 }))).toBeNull()
    expect(readPileBase('not json')).toBeNull()
  })
})

describe('withoutPileWords', () => {
  it('cuts the words for the pile itself, which the 4B and 9B add to a base', () => {
    expect(withoutPileWords('iMac Monitor Variants')).toBe('iMac Monitor')
    expect(withoutPileWords('Apron variants')).toBe('Apron')
    expect(withoutPileWords('Variations of the Apple Watch Ultra')).toBe('Apple Watch Ultra')
    expect(withoutPileWords('Oval mug, variant views')).toBe('Oval mug, views')
    expect(withoutPileWords('Mockup variants')).toBe('Mockup')
    expect(withoutPileWords('Variants')).toBe('')
  })

  it('leaves every other word as it is', () => {
    expect(withoutPileWords('Long Scroll MacBook')).toBe('Long Scroll MacBook')
    expect(withoutPileWords('Invariant poster')).toBe('Invariant poster')
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
    expect(await askPileVariations(pile(), complete)).toEqual({ variations: ['front', 'side'], base: null })
    expect(complete).toHaveBeenCalledOnce()
    const request = complete.mock.calls[0]![0] as Request
    expect(await size((request.messages[1]!.content as { image_url?: { url: string } }[])[0]!.image_url!.url)).toMatchObject({ width: 1024 })
  })

  it("given the top's own title, asks for the pile's base in the same request and reads it", async () => {
    const complete = vi.fn<(request: object) => Promise<string>>(async () => JSON.stringify({ variations: ['front', 'side'], title: 'Phone' }))
    expect(await askPileVariations(pile(), complete, 'Phone on a grey floor')).toEqual({ variations: ['front', 'side'], base: 'Phone' })
    const [, text] = (complete.mock.calls[0]![0] as Request).messages[1]!.content as { text?: string }[]
    expect(text!.text).toContain(pileBaseLine('Phone on a grey floor'))
  })

  it('reads no base it did not ask for', async () => {
    expect(await askPileVariations(pile(), async () => JSON.stringify({ variations: ['front', 'side'], title: 'Phone' }))).toEqual({
      variations: ['front', 'side'],
      base: null
    })
  })

  it('gives nothing for any of them when the request fails, so they all take the fallback', async () => {
    expect(await askPileVariations(pile(), async () => Promise.reject(new Error('busy')), 'Phone')).toEqual({ variations: [null, null], base: null })
  })

  it('asks nothing for a pile of one', async () => {
    const complete = vi.fn(async () => '')
    expect(await askPileVariations(pile().slice(0, 1), complete, 'Phone')).toEqual({ variations: [null], base: null })
    expect(complete).not.toHaveBeenCalled()
  })
})
