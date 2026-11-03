import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { PendingBatchGroup, type PendingBatchGroupProps } from './PendingBatchGroup'
import { PENDING_BATCH_GROUP_CONTRACT } from './PendingBatchGroup.types'

describe('PendingBatchGroup', () => {
  it.each(variantMatrix(PENDING_BATCH_GROUP_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<PendingBatchGroup {...(props as PendingBatchGroupProps)} />)
    expect(baseElement.querySelector('[data-ds="PendingBatchGroup"]')).not.toBeNull()
  })
})
