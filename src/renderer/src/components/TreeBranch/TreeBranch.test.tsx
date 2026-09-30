import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { TreeBranch, type TreeBranchProps } from './TreeBranch'
import { TREE_BRANCH_CONTRACT } from './TreeBranch.types'

describe('TreeBranch', () => {
  it.each(variantMatrix(TREE_BRANCH_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<TreeBranch {...(props as TreeBranchProps)} />)
    expect(baseElement.querySelector('[data-ds="TreeBranch"]')).not.toBeNull()
  })
})
