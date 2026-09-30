import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { SettingsLayout, type SettingsLayoutProps } from './SettingsLayout'
import { SETTINGS_LAYOUT_CONTRACT } from './SettingsLayout.types'

describe('SettingsLayout', () => {
  it.each(variantMatrix(SETTINGS_LAYOUT_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<SettingsLayout {...(props as SettingsLayoutProps)} />)
    expect(baseElement.querySelector('[data-ds="SettingsLayout"]')).not.toBeNull()
  })
})
