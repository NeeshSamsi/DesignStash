import { describe, expect, it } from 'vitest'
import { draftLine, placeholderQuestion, placeholderWordsIn, withoutWords } from './placeholder-check'

const answer = (title: string, description: string, labels: string[] = []) => ({
  title,
  description,
  tags: labels.map((label) => ({ category: 'Style', label }))
})

describe('placeholderWordsIn', () => {
  it('finds the colour and pattern words an answer uses, in list order, and never grey, white or black', () => {
    const a = answer('Blue grid MacBook on white bench', 'A grey MacBook with a patterned screen.', ['Colorful'])
    expect(placeholderWordsIn(a)).toEqual(['blue', 'colorful', 'grid', 'pattern'])
  })
})

describe('placeholderQuestion', () => {
  it('asks whether anything is the colour, or whether the thing is there', () => {
    expect(placeholderQuestion('blue')).toBe('Look only at the image. Is anything in this image blue in colour? Answer yes or no.')
    expect(placeholderQuestion('colorful')).toBe('Look only at the image. Is anything in this image colourful in colour? Answer yes or no.')
    expect(placeholderQuestion('grid')).toBe('Look only at the image. Is there a grid in this image? Answer yes or no.')
    expect(placeholderQuestion('artwork')).toBe('Look only at the image. Is there an artwork in this image? Answer yes or no.')
  })
})

describe('withoutWords', () => {
  it('takes the words, and their -s, -ed and -y forms, out of a title', () => {
    expect(withoutWords('Blue grid patterned MacBook on white bench', ['blue', 'grid', 'pattern'])).toBe('MacBook on white bench')
  })

  it('leaves no space before a comma or full stop it cut up to', () => {
    expect(withoutWords('A sign painted blue, on a wall in blue.', ['blue'])).toBe('A sign painted, on a wall in.')
  })
})

describe('draftLine', () => {
  it('gives the first answer less the words, dropping a tag left empty, and asks to keep its names', () => {
    const a = answer('Blue hanging signboard', 'A blue hanging signboard, also called a shop sign, on a cream wall.', ['blue', 'sign'])
    expect(draftLine(a, ['blue'])).toBe(
      "A first draft, written from the cover before its design area was blanked out, with the stand-in design's words taken out:\n" +
        'Title: hanging signboard\nDescription: A hanging signboard, also called a shop sign, on a cream wall.\nTags: sign\n' +
        'Keep its names, other names and details where the image agrees, mend any sentence the cuts left broken, and never describe the design area.'
    )
  })
})
