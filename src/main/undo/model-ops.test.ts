import { describe, expect, it, vi } from 'vitest'
import { modelUndoOps } from './model-ops'

const setup = (activeModelId: string | null = null) => {
  const settings = { get: () => ({ activeModelId }), update: vi.fn() }
  const activeModelBack = vi.fn()
  const ops = modelUndoOps({
    downloader: { restoreSetAside: async () => true, setAside: async () => true },
    embeddings: { backfill: vi.fn(), modelRemoved: async () => {} },
    settings: settings as never,
    activeModelBack
  })
  return { ops, settings, activeModelBack }
}

describe('modelUndoOps', () => {
  it('an undone Delete model that makes it active again tells the queue a model is back (H-2)', async () => {
    const { ops, settings, activeModelBack } = setup()
    await ops.restore('qwen3-vl-4b', true)
    expect(settings.update).toHaveBeenCalledWith({ activeModelId: 'qwen3-vl-4b' })
    expect(activeModelBack).toHaveBeenCalledOnce()
  })

  it('one that only brings the files back says nothing to the queue', async () => {
    const { ops, activeModelBack } = setup('apple')
    await ops.restore('qwen3-vl-4b', false)
    expect(activeModelBack).not.toHaveBeenCalled()
  })
})
