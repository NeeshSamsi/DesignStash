import { describe, expect, it } from 'vitest'
import { objectColourWords, withoutObjectColours } from './object-colour'

const words = (title: string, description = '', labels: string[] = []) => objectColourWords({ title, description }, labels)
const strip = (title: string, description: string, tags: { category: string; label: string }[] = []) =>
  withoutObjectColours({ title, description, tags })

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

describe('withoutObjectColours', () => {
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

describe('the phrasings round 4 found missing', () => {
  it('finds and cuts a colour finish whole, with the word that joined it', () => {
    expect(words('Tube', 'A cosmetic tube floating in grey smoke with a red and white gradient finish.')).toEqual(['red and white gradient finish'])
    expect(strip('Tube', 'A cosmetic tube floating in grey smoke with a red and white gradient finish.').description).toBe(
      'A cosmetic tube floating in grey smoke.'
    )
    expect(strip('Phones', 'Two smartphones in a 3D render style with a silver finish, floating against white.').description).toBe(
      'Two smartphones in a 3D render style, floating against white.'
    )
    expect(strip('MacBook', 'A MacBook standing on a white surface with a silver finish and black edges.').description).toBe(
      'A MacBook standing on a white surface with black edges.'
    )
    expect(strip('MacBook', 'A MacBook on a white surface with dark edges and silver finish.').description).toBe('A MacBook on a white surface with dark edges.')
    expect(strip('MacBook', 'A MacBook.', [{ category: 'Style', label: 'silver finish' }]).tags).toEqual([])
  })

  it("leaves a finish that isn't a colour, and one that belongs to a table", () => {
    expect(words('Pouch', 'A kraft paper pouch with a matte finish and a sticker with a glossy finish.')).toEqual([])
    expect(words('Mug', 'A mug on a wooden table with a white finish.')).toEqual([])
  })

  it('finds a closure, a HomePod and coloured lanyards', () => {
    expect(strip('Jar', 'A glass jar featuring a gold wire bail closure and a label.').description).toBe('A glass jar featuring a wire bail closure and a label.')
    expect(strip('HomePod', 'A white Apple HomePod mini with a tablet screen.').description).toBe('An Apple HomePod mini with a tablet screen.')
    expect(strip('ID cards', 'Two ID cards hang from colored lanyards against a display.').description).toBe('Two ID cards hang from lanyards against a display.')
    expect(strip('Bag', 'A brightly coloured shopping bag.').description).toBe('A shopping bag.')
  })

  it('finds a colour given to "one", and keeps the "one"', () => {
    expect(words('Boxes', 'A stack of three boxes, including a lime green one on top, on a pedestal.')).toEqual(['lime green one'])
    expect(strip('Boxes', 'A stack of three boxes, including a lime green one on top, on a pedestal.').description).toBe(
      'A stack of three boxes, including one on top, on a pedestal.'
    )
    expect(words('Boxes', 'Three boxes stacked on a grey one.')).toEqual([])
  })

  it('still reads a light-coloured floor as the setting', () => {
    expect(words('Tote', 'A tote bag on a light-coloured floor.')).toEqual([])
  })
})

describe('the phrasings the 9B dev seed found missing (2026-10-26)', () => {
  it('keeps a product name that starts small when a colour before it is cut: iMac, iPhone, iPad', () => {
    expect(strip('White iMac desktop setup on white background', '').title).toBe('iMac desktop setup on white background')
    expect(strip('Silver iPhone 15 on a stand', '').title).toBe('iPhone 15 on a stand')
    expect(strip('Black mug', '').title).toBe('Mug')
  })

  it('cuts a gradient of colours given to the object, after it, whole', () => {
    expect(words('Leggings', 'A pair of leggings floating against a plain background with a blue to purple color gradient.')).toEqual(['blue to purple color gradient'])
    expect(strip('Leggings', 'A pair of leggings floating against a plain background with a blue to purple color gradient.').description).toBe(
      'A pair of leggings floating against a plain background.'
    )
    expect(strip('Set', 'A tank top and leggings, displayed in a gradient of blue and purple against a plain light grey background.').description).toBe(
      'A tank top and leggings, against a plain light grey background.'
    )
  })

  it('leaves a gradient that names no colour, and one that is the background itself', () => {
    expect(words('Phone', 'A foldable smartphone held in a hand against a soft gradient background.')).toEqual([])
    expect(words('Phone', 'A phone against a blue gradient background.')).toEqual([])
  })

  it('counts boxes of two colours as one number of boxes', () => {
    expect(words('Boxes', 'A stack of three white and one cardboard boxes on a pedestal.')).toEqual(['three white and one cardboard boxes'])
    expect(strip('Boxes', 'A stack of three white and one cardboard boxes on a pedestal.').description).toBe('A stack of four boxes on a pedestal.')
    expect(strip('Boxes', 'A stack of three white and one box, sitting on a base.').description).toBe('A stack of four boxes, sitting on a base.')
  })
})
