import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readVision } from './vision-data'

let dir: string | undefined

function coversWith(id: string, content: string): string {
  dir = mkdtempSync(join(tmpdir(), 'ai-eval-vision-'))
  mkdirSync(join(dir, id))
  writeFileSync(join(dir, id, 'vision.json'), content)
  return dir
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

describe('readVision', () => {
  it('is undefined when the cover has no vision.json', () => {
    dir = mkdtempSync(join(tmpdir(), 'ai-eval-vision-'))
    expect(readVision(dir, 'tape')).toBeUndefined()
  })

  it('reads OCR lines, labels and counts, keeping fields it does not know', () => {
    const covers = coversWith(
      'tape',
      JSON.stringify({
        ocr: [{ text: 'FREE TAPE', conf: 0.5, box: [0.1, 0.2, 0.3, 0.4] }],
        classify: [{ label: 'cup', conf: 0.07 }],
        hands: 0,
        people: 1,
        size: [2048, 1536],
        ms: 174.4,
        faces: 2
      })
    )
    const vision = readVision(covers, 'tape')!
    expect(vision.ocr![0]!.text).toBe('FREE TAPE')
    expect(vision.classify![0]!.label).toBe('cup')
    expect(vision.people).toBe(1)
    expect((vision as Record<string, unknown>).faces).toBe(2)
  })

  it('names the file when it is not the expected shape', () => {
    const covers = coversWith('tape', JSON.stringify({ ocr: [{ conf: 1 }] }))
    expect(() => readVision(covers, 'tape')).toThrow(/tape[/\\]vision\.json/)
  })

  it('names the file when it is not JSON', () => {
    const covers = coversWith('tape', '{')
    expect(() => readVision(covers, 'tape')).toThrow(/tape[/\\]vision\.json/)
  })
})
