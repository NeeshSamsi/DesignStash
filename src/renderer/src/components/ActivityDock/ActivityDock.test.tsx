import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { ActivityDock, type ActivityDockProps } from './ActivityDock'
import { ACTIVITY_DOCK_CONTRACT } from './ActivityDock.types'

describe('ActivityDock', () => {
  it.each(variantMatrix(ACTIVITY_DOCK_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<ActivityDock {...(props as ActivityDockProps)} />)
    expect(baseElement.querySelector('[data-ds="ActivityDock"]')).not.toBeNull()
  })
})
