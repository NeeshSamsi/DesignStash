import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { CoverDropZone, type CoverDropZoneProps } from './CoverDropZone'
import { COVER_DROP_ZONE_CONTRACT } from './CoverDropZone.types'

describe('CoverDropZone', () => {
  it.each(variantMatrix(COVER_DROP_ZONE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<CoverDropZone {...(props as CoverDropZoneProps)} />)
    expect(baseElement.querySelector('[data-ds="CoverDropZone"]')).not.toBeNull()
  })
})
