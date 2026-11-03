import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSettingsStore, type SettingsStore } from '../settings'
import { forgetRemovedModel } from './active-model'

let base: string
let settings: SettingsStore

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'ds-active-model-'))
  settings = createSettingsStore(base)
})
afterEach(() => rmSync(base, { recursive: true, force: true }))

describe('forgetRemovedModel', () => {
  it('clears an active model that left the catalogue, so setup offers the new ones', () => {
    settings.update({ activeModelId: 'qwen2.5-vl-3b' })
    expect(forgetRemovedModel(settings)).toBe('qwen2.5-vl-3b')
    expect(settings.get().activeModelId).toBeNull()
  })

  it('keeps a model that is still in the catalogue, Apple’s included', () => {
    for (const id of ['qwen3-vl-4b', 'qwen3.5-9b', 'apple']) {
      settings.update({ activeModelId: id })
      expect(forgetRemovedModel(settings)).toBeNull()
      expect(settings.get().activeModelId).toBe(id)
    }
  })

  it('does nothing when no model is active', () => {
    expect(forgetRemovedModel(settings)).toBeNull()
    expect(settings.get().activeModelId).toBeNull()
  })
})
