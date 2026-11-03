import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM helper with no types
import { toContract } from './contract.mjs'

const set = (name: string, state: string[], extra: Record<string, string[]> = {}) => ({
  name,
  figmaId: '1:1',
  section: 'test',
  description: '',
  variants: { state, ...extra },
  booleans: {},
  texts: {},
  swaps: {},
  exposed: []
})

describe('toContract state axis', () => {
  it('turns default plus one state into a boolean named after it', () => {
    const c = toContract(set('Thing', ['default', 'hover', 'busy']))
    expect(c.flags).toEqual({ busy: { on: 'busy', off: 'default' } })
    expect(c.interactionStates).toEqual(['hover'])
  })

  it('treats derived options as the rest state, so a single drawn state still becomes a boolean', () => {
    // Input: empty and filled come from the value, invalid from aria-invalid.
    const c = toContract(set('Input', ['empty', 'filled', 'focus', 'invalid', 'disabled', 'writing']))
    expect(c.flags).toEqual({ writing: { on: 'writing', off: 'default' } })
    expect(c.axes.state).toBeUndefined()
    expect(c.disabled).toBe(true)
  })

  it('gives a derived rest state the default slot of a state union', () => {
    const c = toContract(
      set(
        'Textarea',
        ['empty', 'filled', 'focus', 'invalid', 'disabled', 'ai-filled', 'writing'],
        { rows: ['3', '4-6'] }
      )
    )
    expect(c.axes.state).toEqual(['default', 'ai-filled', 'writing'])
    expect(c.axisDefaults.state).toBe('default')
    expect(c.axes.rowRange).toEqual(['3', '4-6'])
  })

  it('makes no prop when only derived and interaction states are drawn', () => {
    const c = toContract(set('Input', ['empty', 'filled', 'focus', 'invalid', 'disabled']))
    expect(c.flags).toEqual({})
    expect(c.axes.state).toBeUndefined()
  })
})
