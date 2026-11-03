import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MiddleTruncatedText, splitName } from './middle-truncated-text'

describe('splitName', () => {
  it('keeps a short name whole', () => {
    expect(splitName('cap_navy.psd')).toEqual({ head: 'cap_navy.psd', tail: '' })
  })

  it('gives about two thirds to the start and one third to the end, keeping the extension', () => {
    const name = 'M003T1513 A long scroll Macbook mockup 08Agu25.psd'
    const { head, tail } = splitName(name)
    expect(head + tail).toBe(name)
    expect(tail.endsWith('08Agu25.psd')).toBe(true)
    expect(tail.length).toBe(Math.ceil(name.length / 3))
    expect(head.length).toBeGreaterThan(tail.length)
  })

  it('always keeps the whole extension', () => {
    const { tail } = splitName('a_very_long_name_with_a_long.extension')
    expect(tail.endsWith('.extension')).toBe(true)
  })
})

describe('MiddleTruncatedText', () => {
  it('draws the head and the tail as one name', () => {
    const name = 'M003T1513 A long scroll Macbook mockup 08Agu25.psd'
    const { container } = render(<MiddleTruncatedText>{name}</MiddleTruncatedText>)
    expect(container.textContent).toBe(name)
  })
})
