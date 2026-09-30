import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { KeyboardShortcut, type KeyboardShortcutProps } from './KeyboardShortcut'
import { KEYBOARD_SHORTCUT_CONTRACT } from './KeyboardShortcut.types'

describe('KeyboardShortcut', () => {
  it.each(variantMatrix(KEYBOARD_SHORTCUT_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<KeyboardShortcut {...(props as KeyboardShortcutProps)} />)
    expect(baseElement.querySelector('[data-ds="KeyboardShortcut"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<KeyboardShortcut />)
    for (const text of Object.values<string>(KEYBOARD_SHORTCUT_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
