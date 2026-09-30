import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { AppWindow, type AppWindowProps } from './AppWindow'
import { APP_WINDOW_CONTRACT } from './AppWindow.types'

describe('AppWindow', () => {
  it.each(variantMatrix(APP_WINDOW_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<AppWindow {...(props as AppWindowProps)} />)
    expect(baseElement.querySelector('[data-ds="AppWindow"]')).not.toBeNull()
  })
})
