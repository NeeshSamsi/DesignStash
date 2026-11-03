import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { GroupMemberThumb, type GroupMemberThumbProps } from './GroupMemberThumb'
import { GROUP_MEMBER_THUMB_CONTRACT } from './GroupMemberThumb.types'

describe('GroupMemberThumb', () => {
  it.each(variantMatrix(GROUP_MEMBER_THUMB_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<GroupMemberThumb {...(props as GroupMemberThumbProps)} />)
    expect(baseElement.querySelector('[data-ds="GroupMemberThumb"]')).not.toBeNull()
  })

  it('renders the Figma default text', () => {
    render(<GroupMemberThumb />)
    for (const text of Object.values<string>(GROUP_MEMBER_THUMB_CONTRACT.texts)) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
  })
})
