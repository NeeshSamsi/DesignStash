import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { CoverImage, type CoverImageProps } from './CoverImage'
import { COVER_IMAGE_CONTRACT } from './CoverImage.types'

describe('CoverImage', () => {
  it.each(variantMatrix(COVER_IMAGE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<CoverImage {...(props as CoverImageProps)} />)
    expect(baseElement.querySelector('[data-ds="CoverImage"]')).not.toBeNull()
  })
})
