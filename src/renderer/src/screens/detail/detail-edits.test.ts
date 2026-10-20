import { describe, expect, it } from 'vitest'
import type { MockupDetail } from '@shared/library'
import {
  draftOf,
  formFromDetail,
  isDirty,
  panelSource,
  photoshopFailureCopy,
  saveBlockedReason
} from './detail-edits'

const saved = { title: 'Mug', description: 'A mug', tagIds: [1, 2] }

describe('isDirty', () => {
  it('is clean when nothing changed, whatever the tag order', () => {
    expect(isDirty(saved, { ...saved })).toBe(false)
    expect(isDirty(saved, { ...saved, tagIds: [2, 1] })).toBe(false)
  })

  it('is dirty after a title, description or tag change', () => {
    expect(isDirty(saved, { ...saved, title: 'Mugs' })).toBe(true)
    expect(isDirty(saved, { ...saved, description: '' })).toBe(true)
    expect(isDirty(saved, { ...saved, tagIds: [1] })).toBe(true)
    expect(isDirty(saved, { ...saved, tagIds: [1, 2, 3] })).toBe(true)
    expect(isDirty(saved, { ...saved, tagIds: [1, 3] })).toBe(true)
  })

  it('is clean again when an edit is undone', () => {
    expect(isDirty(saved, { ...saved, title: 'Mug' })).toBe(false)
  })
})

describe('saveBlockedReason', () => {
  it('blocks an empty or blank title with a reason', () => {
    expect(saveBlockedReason({ title: '' })).toBe('Add a title to save')
    expect(saveBlockedReason({ title: '   ' })).toBe('Add a title to save')
    expect(saveBlockedReason({ title: 'Mug' })).toBeNull()
  })
})

describe('formFromDetail', () => {
  const detail = {
    item: {
      title: 'Mug',
      description: null,
      tags: [{ id: 7, label: 'Clay', categoryLabel: 'Style' }]
    },
    variants: []
  } as unknown as MockupDetail

  it('fills category ids from the tag tree and turns a missing description into text', () => {
    const form = formFromDetail(detail, [
      { categoryId: 3, categoryLabel: 'Style', tagCount: 1, tags: [] }
    ])
    expect(form).toEqual({
      title: 'Mug',
      description: '',
      tags: [{ tagId: 7, label: 'Clay', categoryId: 3, categoryLabel: 'Style' }]
    })
    expect(draftOf(form)).toEqual({ title: 'Mug', description: '', tagIds: [7] })
  })
})

describe('panelSource', () => {
  it('names where the cover came from', () => {
    expect(panelSource('/a.png', 'embedded')).toBe('embedded')
    expect(panelSource('/a.png', 'user-uploaded')).toBe('uploaded')
    expect(panelSource('/a.png', 'sidecar')).toBe('sidecar')
    expect(panelSource('/a.png', 'default')).toBe('embedded')
    expect(panelSource('', 'embedded')).toBe('none')
    expect(panelSource('/a.png', 'none')).toBe('none')
  })
})

describe('photoshopFailureCopy', () => {
  it('is plain language with no codes or paths', () => {
    for (const reason of ['no-app', 'failed'] as const) {
      const { title, description } = photoshopFailureCopy(reason)
      expect(`${title} ${description}`).not.toMatch(/[/\\]|ENOENT|error code|\b[A-Z_]{4,}\b/)
    }
  })
})
