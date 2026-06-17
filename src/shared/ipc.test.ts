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

  describe('TAG_TREE channel', () => {
    it('validates a tag-tree response', () => {
      const { response } = IPC_CONTRACT[IPC_CHANNELS.TAG_TREE]
      const valid = {
        tree: [{
          categoryId: 1,
          categoryLabel: 'Device',
          tags: [
            { tagId: 10, label: 'laptop', parentTagId: null, usageCount: 3 },
            { tagId: 11, label: 'macbook', parentTagId: 10, usageCount: 0 }
          ]
        }]
      }
      expect(response.parse(valid)).toEqual(valid)
    })
  })

  describe('TAG_MERGE channel', () => {
    it('validates request and affectedMockups response', () => {
      const { request, response } = IPC_CONTRACT[IPC_CHANNELS.TAG_MERGE]
      expect(request.parse({ sourceTagId: 1, targetTagId: 2 })).toEqual({ sourceTagId: 1, targetTagId: 2 })
      expect(response.parse({ affectedMockups: 4 })).toEqual({ affectedMockups: 4 })
    })
  })

  describe('TAG_RENAME channel', () => {
    it('rejects an empty label', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.TAG_RENAME]
      expect(request.parse({ tagId: 1, label: 'notebook' })).toEqual({ tagId: 1, label: 'notebook' })
      expect(() => request.parse({ tagId: 1, label: '' })).toThrow()
    })
  })

  describe('TAG_SET_PARENT channel', () => {
    it('accepts parentTagId: null', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.TAG_SET_PARENT]
      expect(request.parse({ tagId: 1, parentTagId: null })).toEqual({ tagId: 1, parentTagId: null })
      expect(request.parse({ tagId: 1, parentTagId: 5 })).toEqual({ tagId: 1, parentTagId: 5 })
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

  describe('LIBRARY_LIST channel', () => {
    it('validates a full query with tagIds, query, and sort', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.LIBRARY_LIST]
      const valid = { tagIds: [1, 2], query: 'macbook', sort: 'name' as const }
      expect(request.parse(valid)).toEqual(valid)
    })

    it('defaults sort to "date" when omitted', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.LIBRARY_LIST]
      const result = request.parse({})
      expect(result.sort).toBe('date')
    })

    it('validates a response with items array', () => {
      const { response } = IPC_CONTRACT[IPC_CHANNELS.LIBRARY_LIST]
      const valid = {
        items: [{
          id: 1, title: 'Test', description: null, coverPath: '/c.png',
          isGroup: false, favourite: false, reviewStatus: 'approved' as const,
          variantCount: 0, tags: []
        }]
      }
      expect(response.parse(valid)).toEqual(valid)
    })
  })

  describe('INTEGRITY_SCAN channel', () => {
    it('validates a report with one orphan file and one orphan record', () => {
      const { response } = IPC_CONTRACT[IPC_CHANNELS.INTEGRITY_SCAN]
      const valid = {
        orphanFiles: ['/lib/mockups/x/stray.psd'],
        orphanRecords: [{ mockupId: 7, libraryPath: '/lib/mockups/a/original.psd' }]
      }
      expect(response.parse(valid)).toEqual(valid)
    })

    it('rejects a response missing orphanRecords', () => {
      const { response } = IPC_CONTRACT[IPC_CHANNELS.INTEGRITY_SCAN]
      expect(() => response.parse({ orphanFiles: [] })).toThrow()
    })
  })

  describe('INTEGRITY_ADD_ORPHAN channel', () => {
    it('validates request and response', () => {
      const { request, response } = IPC_CONTRACT[IPC_CHANNELS.INTEGRITY_ADD_ORPHAN]
      expect(request.parse({ filePath: '/lib/mockups/x/stray.psd' })).toEqual({
        filePath: '/lib/mockups/x/stray.psd'
      })
      expect(response.parse({ mockupId: 12 })).toEqual({ mockupId: 12 })
    })
  })

  describe('MOCKUP_UPDATE channel', () => {
    it('validates a valid update request', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.MOCKUP_UPDATE]
      const valid = { mockupId: 1, title: 'New Title', description: 'Desc', tagIds: [1, 2] }
      expect(request.parse(valid)).toEqual(valid)
    })

    it('rejects an empty title', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.MOCKUP_UPDATE]
      expect(() =>
        request.parse({ mockupId: 1, title: '', description: 'Desc', tagIds: [] })
      ).toThrow()
    })
  })

  describe('TELEMETRY_TRACK channel', () => {
    it('validates an event with primitive props', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.TELEMETRY_TRACK]
      const valid = { event: 'import_started', props: { count: 2 } }
      expect(request.parse(valid)).toEqual(valid)
    })

    it('rejects props containing a nested object / non-primitive value', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.TELEMETRY_TRACK]
      expect(() =>
        request.parse({ event: 'import_started', props: { meta: { nested: true } } })
      ).toThrow()
    })
  })

  describe('TELEMETRY_SET_CONSENT channel', () => {
    it('validates request and response', () => {
      const { request, response } = IPC_CONTRACT[IPC_CHANNELS.TELEMETRY_SET_CONSENT]
      expect(request.parse({ enabled: false })).toEqual({ enabled: false })
      expect(response.parse({ enabled: true })).toEqual({ enabled: true })
    })
  })
})
