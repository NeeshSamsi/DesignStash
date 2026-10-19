import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { CopyWidget, type CopyWidgetProps } from './CopyWidget'
import { COPY_WIDGET_CONTRACT } from './CopyWidget.types'

describe('CopyWidget', () => {
  it.each(variantMatrix(COPY_WIDGET_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<CopyWidget {...(props as CopyWidgetProps)} />)
    expect(baseElement.querySelector('[data-ds="CopyWidget"]')).not.toBeNull()
  })
})
