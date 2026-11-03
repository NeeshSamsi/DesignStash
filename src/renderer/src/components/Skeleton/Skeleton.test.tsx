import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { Skeleton, type SkeletonProps } from './Skeleton'
import { SKELETON_CONTRACT } from './Skeleton.types'

describe('Skeleton', () => {
  it.each(variantMatrix(SKELETON_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<Skeleton {...(props as SkeletonProps)} />)
    expect(baseElement.querySelector('[data-ds="Skeleton"]')).not.toBeNull()
  })
})
