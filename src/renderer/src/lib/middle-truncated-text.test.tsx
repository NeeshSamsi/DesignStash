import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MiddleTruncatedText, NAME_TAIL, splitName } from './middle-truncated-text'

describe('splitName', () => {
  it('keeps a short name whole', () => {
    expect(splitName('cap_navy.psd')).toEqual({ head: 'cap_navy.psd', tail: '' })
  })

  it('keeps the end of a long name, where files differ', () => {
    const name = 'M003T1513 A long scroll Macbook mockup 08Agu25.psd'
    const { head, tail } = splitName(name)
    expect(tail).toBe(name.slice(-NAME_TAIL))
    expect(tail.endsWith('08Agu25.psd')).toBe(true)
    expect(head + tail).toBe(name)
  })
})

describe('MiddleTruncatedText', () => {
  it('draws the head and the tail as one name', () => {
    const name = 'M003T1513 A long scroll Macbook mockup 08Agu25.psd'
    const { container } = render(<MiddleTruncatedText>{name}</MiddleTruncatedText>)
    expect(container.textContent).toBe(name)
  })
})
