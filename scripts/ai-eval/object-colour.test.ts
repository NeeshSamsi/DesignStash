import { describe, expect, it } from 'vitest'
import { objectColourWords, summariseObjectColours, withoutObjectColours } from './object-colour'

const words = (title: string, description = '', labels: string[] = []) => objectColourWords({ title, description }, labels)

describe('objectColourWords', () => {
  it("finds a colour that describes the mockup's object or one of its parts", () => {
    expect(words('White MacBook on a white bench')).toEqual(['white macbook'])
    expect(words('Mug', 'A round-bellied white mug with a black handle.')).toEqual(['white mug', 'black handle'])
    expect(words('Cap', 'A dark blue baseball cap with yellow stitching.')).toEqual(['dark blue baseball cap', 'yellow stitching'])
    expect(words('Dark laptop on an orange armchair', 'A sleek dark laptop on dark sand.')).toEqual(['dark laptop', 'dark laptop'])
    expect(words('Jar', 'A glass jar sealed with a gold metal clasp, and a brown kraft paper stand-up pouch.')).toEqual(['gold metal clasp', 'brown kraft paper stand-up pouch'])
  })

  it('finds a colour after the object, as in "leggings in a blue to pink gradient"', () => {
    expect(words('Leggings', 'A pair of leggings in a blue to pink gradient.')).toEqual(['leggings in a blue to pink gradient'])
  })

  it('takes colours joined by and, to or a hyphen as one', () => {
    expect(words('Red-to-white cosmetic tube')).toEqual(['red-to-white cosmetic tube'])
    expect(words('Lighter', 'A white and violet flip-top lighter.')).toEqual(['white and violet flip-top lighter'])
  })

  it('leaves the setting alone: backgrounds, surfaces and anything after "on" or "against"', () => {
    expect(words('Tote bag on beige', 'A tote bag standing on a white floor against a light grey wall.')).toEqual([])
    expect(words('Boxes', 'Three boxes stacked on a small black box, in a bright concrete room.')).toEqual([])
    expect(words('iPhone on a dark dusty background')).toEqual([])
    expect(words('iPhones floating in white', 'An iMac set in white with a keyboard.')).toEqual([])
    expect(words('Stationery', 'A white desk with stationery and a grey wall behind the notebook.')).toEqual([])
    expect(words('Cosmetic tube in grey smoke')).toEqual([])
    expect(words('Stapler', 'A yellow stapler with business cards, and a large gray square in the center.')).toEqual([])
  })

  it('still finds an object colour after a setting colour that ran up to it', () => {
    expect(words('Spray can', 'A spray can with a white base and silver top.')).toEqual(['silver top'])
    expect(words('Notebooks', 'Two notebooks on a white surface with grey covers.')).toEqual(['grey covers'])
  })

  it('reads "cream" as a colour only when it says so, since cream is also a product', () => {
    expect(words('Cosmetic box', 'A cosmetic box, also called cream packaging, with a cream-coloured label.')).toEqual(['cream-coloured label'])
  })

  it('counts materials and finishes as no colour', () => {
    expect(words('Kraft paper pouch', 'A matte metallic foil pouch and a canvas tote bag.')).toEqual([])
  })

  it('reads the saved tag labels too', () => {
    expect(words('Apron', '', ['Yellow apron'])).toEqual(['yellow apron'])
  })
})

describe('summariseObjectColours', () => {
  it('gives the share of answers with one, and the mentions per answer', () => {
    expect(summariseObjectColours([{ id: 'a', repeat: 0, words: ['white mug'] }, { id: 'b', repeat: 0, words: [] }])).toEqual({ answers: 2, mentioned: 0.5, wordsPerAnswer: 0.5 })
  })
})

describe('withoutObjectColours', () => {
  const strip = (title: string, description: string, tags: { category: string; label: string }[] = []) =>
    withoutObjectColours({ title, description, tags })

  it('takes the object colours out and leaves the object, the setting and its colours', () => {
    expect(strip('White MacBook on a white bench', 'A silver MacBook laptop on a white bench against a light grey wall.')).toEqual({
      title: 'MacBook on a white bench',
      description: 'A MacBook laptop on a white bench against a light grey wall.',
      tags: []
    })
  })

  it('mends the article and the capital the colour leaves behind', () => {
    expect(strip('Orange box', 'An orange box with a white lid, beside a white mug.').description).toBe('A box with a lid, beside a white mug.')
    expect(strip('Yellow apron', 'An amber bottle.')).toMatchObject({ title: 'Apron', description: 'A bottle.' })
    expect(strip('Box', 'A black aluminium box.').description).toBe('An aluminium box.')
  })

  it('cuts colours side by side, and joined colours, whole', () => {
    expect(strip('Gradient sweatshirt', 'An orange gradient sweatshirt on white.')).toMatchObject({ title: 'Sweatshirt', description: 'A sweatshirt on white.' })
    expect(strip('Stacked white and lime boxes on a grey pedestal', '').title).toBe('Stacked boxes on a grey pedestal')
  })

  it('cuts a colour after the object whole', () => {
    expect(strip('Leggings', 'A pair of leggings in a blue to pink gradient, floating on grey.').description).toBe('A pair of leggings, floating on grey.')
  })

  it('takes it out of tag labels too', () => {
    expect(strip('Apron', 'An apron.', [{ category: 'Apparel', label: 'Yellow apron' }]).tags).toEqual([{ category: 'Apparel', label: 'Apron' }])
  })
})
