import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { CopyFileRow, type CopyFileRowProps } from './CopyFileRow'
import { COPY_FILE_ROW_CONTRACT } from './CopyFileRow.types'

describe('CopyFileRow', () => {
  it.each(variantMatrix(COPY_FILE_ROW_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<CopyFileRow {...(props as CopyFileRowProps)} />)
    expect(baseElement.querySelector('[data-ds="CopyFileRow"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<CopyFileRow />)
    for (const text of Object.values<string>(COPY_FILE_ROW_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
