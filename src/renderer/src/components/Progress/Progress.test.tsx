import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Progress, type ProgressProps } from './Progress'
import { PROGRESS_CONTRACT } from './Progress.types'

describe('Progress', () => {
  it.each(variantMatrix(PROGRESS_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Progress {...(props as ProgressProps)} />)
    expect(baseElement.querySelector('[data-ds="Progress"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<Progress />)
    for (const text of Object.values<string>(PROGRESS_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
