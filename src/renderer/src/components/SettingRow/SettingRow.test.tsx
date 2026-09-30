import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { SettingRow, type SettingRowProps } from './SettingRow'
import { SETTING_ROW_CONTRACT } from './SettingRow.types'

describe('SettingRow', () => {
  it.each(variantMatrix(SETTING_ROW_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<SettingRow {...(props as SettingRowProps)} />)
    expect(baseElement.querySelector('[data-ds="SettingRow"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<SettingRow />)
    for (const text of Object.values<string>(SETTING_ROW_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
