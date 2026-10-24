import { describe, expect, it } from 'vitest'
import { objectColourWords, summariseObjectColours } from './object-colour'

const words = (title: string, description = '', labels: string[] = []) => objectColourWords({ title, description }, labels)

describe('objectColourWords', () => {
  it("finds a colour that describes the mockup's object or one of its parts", () => {
    expect(words('White MacBook on a white bench')).toEqual(['white macbook'])
    expect(words('Mug', 'A round-bellied white mug with a black handle.')).toEqual(['white mug', 'black handle'])
    expect(words('Cap', 'A dark blue baseball cap with yellow stitching.')).toEqual(['dark blue baseball cap', 'yellow stitching'])
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
