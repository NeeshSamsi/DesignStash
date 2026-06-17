import { describe, it, expect } from 'vitest'
import { IPC_CONTRACT, IPC_CHANNELS, AiModelInfoSchema, AiDownloadProgressSchema } from './ipc'

describe('IPC Contract', () => {
  describe('APP_INFO channel', () => {
    const { response } = IPC_CONTRACT[IPC_CHANNELS.APP_INFO]

    it('validates a correct response', () => {
      const validResponse = {
        name: 'DesignStash',
        version: '1.0.0',
        env: 'development'
      }
      expect(response.parse(validResponse)).toEqual(validResponse)
    })

    it('rejects an invalid env', () => {
      const invalidResponse = {
        name: 'DesignStash',
        version: '1.0.0',
        env: 'staging'
      }
      expect(() => response.parse(invalidResponse)).toThrow()
    })
  })

  describe('DB_PING channel', () => {
    const { response } = IPC_CONTRACT[IPC_CHANNELS.DB_PING]

    it('validates a correct response', () => {
      const validResponse = {
        success: true,
        message: 'pong',
        timestamp: Date.now()
      }
      expect(response.parse(validResponse)).toEqual(validResponse)
    })
  })

  describe('IMPORT_START channel', () => {
    const { request, response } = IPC_CONTRACT[IPC_CHANNELS.IMPORT_START]

    it('validates a correct request', () => {
      const validRequest = { paths: ['/path/to/file.psd'] }
      expect(request.parse(validRequest)).toEqual(validRequest)
    })

    it('validates a correct response', () => {
      const validResponse = {
        batchId: '123',
        items: [],
        imported: 0,
        pendingPreview: 0,
        duplicates: 0,
        errors: 0,
        skippedNonPsd: 0
      }
      expect(response.parse(validResponse)).toEqual(validResponse)
    })
  })

  describe('IMPORT_PROGRESS channel', () => {
    const { request } = IPC_CONTRACT[IPC_CHANNELS.IMPORT_PROGRESS]

    it('validates a correct request', () => {
      const validRequest = {
        batchId: '123',
        phase: 'copying',
        completed: 1,
        total: 2,
        currentTitle: 'file.psd'
      }
      expect(request.parse(validRequest)).toEqual(validRequest)
    })
  })

  describe('IMPORT_CANCEL channel', () => {
    const { request, response } = IPC_CONTRACT[IPC_CHANNELS.IMPORT_CANCEL]

    it('validates a correct request', () => {
      const validRequest = { batchId: '123' }
      expect(request.parse(validRequest)).toEqual(validRequest)
    })

    it('validates a correct response', () => {
      const validResponse = { cancelled: true }
      expect(response.parse(validResponse)).toEqual(validResponse)
    })
  })

  describe('AI_HARDWARE_INFO channel', () => {
    const { response } = IPC_CONTRACT[IPC_CHANNELS.AI_HARDWARE_INFO]

    it('validates a correct response', () => {
      const valid = { chip: 'M3', totalMemoryGB: 16, isAppleSilicon: true, recommendedTier: 'medium' }
      expect(response.parse(valid)).toEqual(valid)
    })

    it('rejects an invalid tier', () => {
      expect(() =>
        response.parse({ chip: 'X', totalMemoryGB: 8, isAppleSilicon: false, recommendedTier: 'xl' })
      ).toThrow()
    })
  })

  describe('AI_LIST_MODELS channel', () => {
    const { response } = IPC_CONTRACT[IPC_CHANNELS.AI_LIST_MODELS]

    it('validates a list response', () => {
      const valid = {
        models: [
          { id: 'qwen2.5-1.5b', name: 'Qwen 2.5 1.5B', tier: 'small', sizeBytes: 1040000000, installed: false, active: false }
        ]
      }
      expect(response.parse(valid)).toEqual(valid)
    })
  })

  describe('AI_DOWNLOAD_MODEL channel', () => {
    it('validates request and response', () => {
      const { request, response } = IPC_CONTRACT[IPC_CHANNELS.AI_DOWNLOAD_MODEL]
      expect(request.parse({ id: 'moondream2-q4' })).toEqual({ id: 'moondream2-q4' })
      expect(response.parse({ started: true })).toEqual({ started: true })
    })
  })

  describe('AI_CANCEL_DOWNLOAD channel', () => {
    it('validates request and response', () => {
      const { request, response } = IPC_CONTRACT[IPC_CHANNELS.AI_CANCEL_DOWNLOAD]
      expect(request.parse({ id: 'moondream2-q4' })).toEqual({ id: 'moondream2-q4' })
      expect(response.parse({ cancelled: false })).toEqual({ cancelled: false })
    })
  })

  describe('AI_DOWNLOAD_PROGRESS channel', () => {
    it('validates a progress event payload', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.AI_DOWNLOAD_PROGRESS]
      const valid = { modelId: 'moondream2-q4', receivedBytes: 500, totalBytes: 1800000000, phase: 'downloading' }
      expect(request.parse(valid)).toEqual(valid)
    })

    it('validates an error event payload with optional error field', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.AI_DOWNLOAD_PROGRESS]
      const valid = { modelId: 'x', receivedBytes: 0, totalBytes: 0, phase: 'error', error: 'Checksum failed' }
      expect(request.parse(valid)).toEqual(valid)
    })
  })

  describe('AI_GET_ACTIVE / AI_SET_ACTIVE channels', () => {
    it('AI_GET_ACTIVE returns nullable modelId', () => {
      const { response } = IPC_CONTRACT[IPC_CHANNELS.AI_GET_ACTIVE]
      expect(response.parse({ modelId: null })).toEqual({ modelId: null })
      expect(response.parse({ modelId: 'moondream2-q4' })).toEqual({ modelId: 'moondream2-q4' })
    })

    it('AI_SET_ACTIVE request accepts null', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.AI_SET_ACTIVE]
      expect(request.parse({ id: null })).toEqual({ id: null })
    })
  })

  describe('AiModelInfoSchema', () => {
    it('rejects an invalid tier', () => {
      expect(() =>
        AiModelInfoSchema.parse({ id: 'x', name: 'X', tier: 'xl', sizeBytes: 0, installed: false, active: false })
      ).toThrow()
    })

    it('validates a well-formed model entry', () => {
      const valid = { id: 'phi-3.5-mini', name: 'Phi 3.5 Mini', tier: 'medium', sizeBytes: 2400000000, installed: true, active: true }
      expect(AiModelInfoSchema.parse(valid)).toEqual(valid)
    })
  })

  describe('AiDownloadProgressSchema', () => {
    it('rejects an unknown phase', () => {
      expect(() =>
        AiDownloadProgressSchema.parse({ modelId: 'x', receivedBytes: 0, totalBytes: 0, phase: 'pending' })
      ).toThrow()
    })
  })

  describe('GROUPING_PROPOSE channel', () => {
    it('validates a grouping proposal response', () => {
      const { response } = IPC_CONTRACT[IPC_CHANNELS.GROUPING_PROPOSE]
      const valid = {
        batchId: 'batch-abc',
        groups: [{
          id: 'g1',
          members: [{ mockupId: 1, isPrimary: true, coverPath: '/covers/1.png', fileName: 'hero-A.psd', folderTrail: ['iPhone'] }],
          confidence: 'high',
          reason: 'folder'
        }],
        singletons: []
      }
      expect(response.parse(valid)).toEqual(valid)
    })
  })

  describe('APPROVAL_INIT channel', () => {
    it('validates an approval queue response', () => {
      const { response } = IPC_CONTRACT[IPC_CHANNELS.APPROVAL_INIT]
      const valid = {
        batchId: 'batch-1',
        items: [{
          mockupId: 1, leaderId: null, isLeader: false, variantIndex: 0,
          title: 'Hero Mockup', description: '', tags: [],
          coverPath: '/covers/1.png', coverSource: 'embedded', sidecarFileName: null
        }]
      }
      expect(response.parse(valid)).toEqual(valid)
    })
  })

  describe('APPROVAL_SAVE_ITEM channel', () => {
    it('validates a save-item request', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.APPROVAL_SAVE_ITEM]
      const valid = {
        mockupId: 1, title: 'Hero', description: '', tagIds: [3, 5],
        coverPath: '/covers/1.png', coverSource: 'embedded',
        isLeader: false, wasEdited: false, leaderId: null
      }
      expect(request.parse(valid)).toEqual(valid)
    })

    it('rejects coverSource: none at save time', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.APPROVAL_SAVE_ITEM]
      expect(() => request.parse({
        mockupId: 1, title: 'X', description: '', tagIds: [],
        coverPath: '/c.png', coverSource: 'none', isLeader: false, wasEdited: false, leaderId: null
      })).toThrow()
    })
  })

  describe('TAG_LIST_BY_CATEGORY channel', () => {
    it('validates a categories response', () => {
      const { response } = IPC_CONTRACT[IPC_CHANNELS.TAG_LIST_BY_CATEGORY]
      const valid = {
        categories: [{
          categoryId: 1, categoryLabel: 'Device',
          tags: [{ tagId: 10, label: 'iphone', parentTagId: null }]
        }]
      }
      expect(response.parse(valid)).toEqual(valid)
    })
  })

  describe('TAG_CREATE channel', () => {
    it('validates request and response', () => {
      const { request, response } = IPC_CONTRACT[IPC_CHANNELS.TAG_CREATE]
      expect(request.parse({ label: 'tablet', categoryId: 1 })).toEqual({ label: 'tablet', categoryId: 1 })
      expect(response.parse({ tagId: 42, label: 'tablet', categoryId: 1 })).toEqual({ tagId: 42, label: 'tablet', categoryId: 1 })
    })

    it('rejects empty label', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.TAG_CREATE]
      expect(() => request.parse({ label: '', categoryId: 1 })).toThrow()
    })
  })

  describe('GROUPING_CONFIRM channel', () => {
    it('validates a confirm request', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.GROUPING_CONFIRM]
      const valid = {
        batchId: 'batch-abc',
        groups: [{ id: 'g1', memberIds: [1, 2, 3] }],
        singletonIds: [4]
      }
      expect(request.parse(valid)).toEqual(valid)
    })

    it('rejects confirm request with non-array memberIds', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.GROUPING_CONFIRM]
      expect(() =>
        request.parse({ batchId: 'x', groups: [{ id: 'g1', memberIds: 'bad' }], singletonIds: [] })
      ).toThrow()
    })
  })
})
