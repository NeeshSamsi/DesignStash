import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { TagTree, type TagTreeProps } from './TagTree'
import { TAG_TREE_CONTRACT } from './TagTree.types'

describe('TagTree', () => {
  it.each(variantMatrix(TAG_TREE_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<TagTree {...(props as TagTreeProps)} />)
    expect(baseElement.querySelector('[data-ds="TagTree"]')).not.toBeNull()
  })
})
