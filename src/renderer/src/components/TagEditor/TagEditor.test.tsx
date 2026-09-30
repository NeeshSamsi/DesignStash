import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { variantMatrix } from '@renderer/design-system/matrix'
import { TagEditor, type TagEditorProps } from './TagEditor'
import { TAG_EDITOR_CONTRACT } from './TagEditor.types'

describe('TagEditor', () => {
  it.each(variantMatrix(TAG_EDITOR_CONTRACT))('renders %s', (_label, props) => {
    const { baseElement } = render(<TagEditor {...(props as TagEditorProps)} />)
    expect(baseElement.querySelector('[data-ds="TagEditor"]')).not.toBeNull()
  })
})
