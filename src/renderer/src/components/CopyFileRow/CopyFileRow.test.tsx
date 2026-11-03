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
    // `detail` is Figma's sample for the copying row's line; code shows a line only when one is passed.
    const { detail: _sample, ...shown } = COPY_FILE_ROW_CONTRACT.texts
    void _sample
    for (const text of Object.values<string>(shown)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('does not draw the contract sample detail unless one is passed', () => {
    render(<CopyFileRow state="copying" />)
    expect(screen.queryByText(COPY_FILE_ROW_CONTRACT.texts.detail)).toBeNull()
    expect(screen.getByRole('progressbar')).not.toBeNull()
  })
})

describe('CopyFileRow copy', () => {
  it('says what happened in plain words, with no path or code', () => {
    render(<CopyFileRow state="unreadable" name="poster_old.psd" />)
    expect(screen.getByText('Couldn’t read it. The file might be damaged.')).not.toBeNull()
  })

  it('shows a progress bar and percentage while copying', () => {
    render(<CopyFileRow state="copying" percent={41} />)
    expect(screen.getByText('41%')).not.toBeNull()
    expect(screen.getByRole('progressbar')).not.toBeNull()
  })

  it('shows its detail in place of the bar while unpacking a zip', () => {
    render(<CopyFileRow state="copying" percent={41} detail="Unpacking… · From Cap.zip" />)
    expect(screen.getByText('Unpacking… · From Cap.zip')).not.toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByText('41%')).not.toBeNull()
  })
})
