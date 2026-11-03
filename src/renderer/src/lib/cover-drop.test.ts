import { describe, expect, it } from 'vitest'
import { classifyDrag, clipboardFiles, isEditableTarget } from './cover-drop'

const item = (type: string, kind = 'file') => ({ kind, type })

describe('classifyDrag', () => {
  it('is none for no data or a non-file drag', () => {
    expect(classifyDrag(null)).toBe('none')
    expect(classifyDrag({ types: ['text/plain'], items: [item('text/plain', 'string')] })).toBe(
      'none'
    )
  })

  it('is image when any dragged file is an image', () => {
    expect(classifyDrag({ types: ['Files'], items: [item('image/png')] })).toBe('image')
    expect(
      classifyDrag({ types: ['Files'], items: [item('text/plain'), item('image/webp')] })
    ).toBe('image')
  })

  it('is rejected when every dragged file is something else', () => {
    expect(classifyDrag({ types: ['Files'], items: [item('application/pdf')] })).toBe('rejected')
  })

  it('gives files of unknown type the benefit of the doubt', () => {
    expect(classifyDrag({ types: ['Files'], items: [item('')] })).toBe('image')
    expect(classifyDrag({ types: ['Files'] })).toBe('image')
  })
})

describe('clipboardFiles', () => {
  it('keeps only images', () => {
    const png = new File(['x'], 'a.png', { type: 'image/png' })
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' })
    expect(clipboardFiles({ files: [txt, png] })).toEqual([png])
    expect(clipboardFiles(null)).toEqual([])
  })
})

describe('isEditableTarget', () => {
  it('recognises form fields', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true)
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})
