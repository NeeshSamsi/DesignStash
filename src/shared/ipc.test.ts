import { describe, it, expect } from 'vitest'
import {
  IPC_CONTRACT,
  IPC_CHANNELS,
  IPC_DOMAIN_CONTRACTS,
  PUSH_CHANNELS,
  isPushChannel,
  AiModelInfoSchema,
  AiDownloadProgressSchema
} from './ipc'
import { TagsByCategorySchema } from './approval'

describe('IPC contract structure', () => {
  const channels = Object.values(IPC_CHANNELS)

  it('has exactly one contract per channel', () => {
    expect(Object.keys(IPC_CONTRACT).sort()).toEqual([...channels].sort())
  })

  it('puts every channel in exactly one domain file', () => {
    const owners = new Map<string, string[]>()
    for (const [domain, contract] of Object.entries(IPC_DOMAIN_CONTRACTS)) {
      for (const channel of Object.keys(contract)) {
        owners.set(channel, [...(owners.get(channel) ?? []), domain])
      }
    }
    expect([...owners.keys()].sort()).toEqual([...channels].sort())
    for (const [channel, domains] of owners) expect([channel, domains.length]).toEqual([channel, 1])
  })

  it('lists only real channels as push channels, each with a void response', () => {
    for (const channel of PUSH_CHANNELS) {
      expect(channels).toContain(channel)
      expect(IPC_CONTRACT[channel].response.safeParse(undefined).success).toBe(true)
    }
    expect(isPushChannel(IPC_CHANNELS.IMPORT_PROGRESS)).toBe(true)
    expect(isPushChannel(IPC_CHANNELS.TAG_TREE)).toBe(false)
    expect(isPushChannel('not:a-channel')).toBe(false)
  })
})

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
          { id: 'smolvlm2-2.2b', name: 'SmolVLM2 2.2B', tier: 'small', sizeBytes: 1705125856, description: 'Fast.', languages: ['English'], quality: 3, speed: 5, minMemoryGB: 8, bestFit: false, downloadedBytes: 0, installed: false, active: false }
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

    it('validates an error event payload with a reason', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.AI_DOWNLOAD_PROGRESS]
      const valid = { modelId: 'x', receivedBytes: 0, totalBytes: 0, phase: 'error', reason: 'checksum' }
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
        AiModelInfoSchema.parse({ id: 'x', name: 'X', tier: 'xl', sizeBytes: 0, description: '', languages: [], quality: 3, speed: 3, minMemoryGB: 8, bestFit: false, downloadedBytes: 0, installed: false, active: false })
      ).toThrow()
    })

    it('validates a well-formed model entry', () => {
      const valid = { id: 'qwen2.5-vl-3b', name: 'Qwen 2.5 VL 3B', tier: 'medium', sizeBytes: 2774658784, description: 'Balanced.', languages: ['English'], quality: 4, speed: 4, minMemoryGB: 12, bestFit: true, downloadedBytes: 0, installed: true, active: true }
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
          tags: [{ tagId: 10, label: 'iphone' }]
        }]
      }
      expect(response.parse(valid)).toEqual(valid)
    })

    it('describes a tag by id and label only (tags are two tiers)', () => {
      expect(Object.keys(TagsByCategorySchema.shape.tags.element.shape)).toEqual(['tagId', 'label'])
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
          tagCount: 2,
          tags: [
            { tagId: 10, label: 'laptop', usageCount: 3 },
            { tagId: 11, label: 'macbook', usageCount: 0 }
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

  describe('TagTree operation channels', () => {
    const snapshot = {
      tag: { id: 7, label: 'laptop', categoryId: 1, isCanonical: true, createdBy: 'seed' as const },
      mockupIds: [3, 4]
    }

    it('TAG_DELETE returns the affected count and an undo snapshot', () => {
      const { response } = IPC_CONTRACT[IPC_CHANNELS.TAG_DELETE]
      expect(response.parse({ affectedMockups: 2, snapshot })).toEqual({ affectedMockups: 2, snapshot })
      expect(() => response.parse({ affectedMockups: 2 })).toThrow()
    })

    it('TAG_RESTORE takes the snapshot back', () => {
      const { request, response } = IPC_CONTRACT[IPC_CHANNELS.TAG_RESTORE]
      expect(request.parse({ snapshot })).toEqual({ snapshot })
      expect(response.parse({ tagId: 7, restoredMockups: 2 })).toEqual({ tagId: 7, restoredMockups: 2 })
    })

    it('TAG_MERGE_PREVIEW mirrors TAG_MERGE', () => {
      const { request, response } = IPC_CONTRACT[IPC_CHANNELS.TAG_MERGE_PREVIEW]
      expect(request.parse({ sourceTagId: 1, targetTagId: 2 })).toEqual({ sourceTagId: 1, targetTagId: 2 })
      expect(response.parse({ affectedMockups: 5 })).toEqual({ affectedMockups: 5 })
    })

    it('CATEGORY_DELETE takes an optional move target and returns a snapshot', () => {
      const { request, response } = IPC_CONTRACT[IPC_CHANNELS.CATEGORY_DELETE]
      expect(request.parse({ categoryId: 1 })).toEqual({ categoryId: 1 })
      expect(request.parse({ categoryId: 1, moveTagsTo: 2 })).toEqual({ categoryId: 1, moveTagsTo: 2 })
      const valid = {
        deleted: true,
        movedTags: 3,
        snapshot: { id: 1, label: 'Angle', sortOrder: 5, isCanonical: true }
      }
      expect(response.parse(valid)).toEqual(valid)
    })

    it('CATEGORY_RESTORE takes a category snapshot', () => {
      const { request, response } = IPC_CONTRACT[IPC_CHANNELS.CATEGORY_RESTORE]
      const snap = { id: 1, label: 'Mood', sortOrder: 6, isCanonical: false }
      expect(request.parse({ snapshot: snap })).toEqual({ snapshot: snap })
      expect(response.parse({ categoryId: 1 })).toEqual({ categoryId: 1 })
    })

    it('TAG_FIND needs a label and lists matches across categories', () => {
      const { request, response } = IPC_CONTRACT[IPC_CHANNELS.TAG_FIND]
      expect(() => request.parse({ label: '' })).toThrow()
      const valid = {
        matches: [{ tagId: 9, label: 'clay', categoryId: 2, categoryLabel: 'Style', usageCount: 12 }]
      }
      expect(response.parse(valid)).toEqual(valid)
    })
  })

  describe('tag nesting', () => {
    it('has no channel for setting a tag parent', () => {
      expect(Object.values(IPC_CHANNELS)).not.toContain('tag:set-parent')
      expect(Object.keys(IPC_CONTRACT)).not.toContain('tag:set-parent')
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

    it('accepts categoryIds for a category-level filter', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.LIBRARY_LIST]
      expect(request.parse({ categoryIds: [3], sort: 'date' })).toEqual({ categoryIds: [3], sort: 'date' })
      expect(() => request.parse({ categoryIds: ['3'] })).toThrow()
    })

    it('accepts starredOnly for the Starred view', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.LIBRARY_LIST]
      expect(request.parse({ starredOnly: true }).starredOnly).toBe(true)
      expect(() => request.parse({ starredOnly: 'yes' })).toThrow()
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
          coverSource: 'embedded' as const, coverMissing: false,
          isGroup: false, favourite: false, reviewStatus: 'approved' as const,
          createdAt: '2025-01-01T00:00:00', variantCount: 0, topId: null, tags: []
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

  describe('ENTITLEMENTS_SNAPSHOT channel', () => {
    const { response } = IPC_CONTRACT[IPC_CHANNELS.ENTITLEMENTS_SNAPSHOT]

    it('parses a valid snapshot response', () => {
      const valid = { tier: 'free', enabled: { 'app.core': true, 'search.semantic': true } }
      expect(response.parse(valid)).toEqual(valid)
    })

    it('rejects an invalid tier', () => {
      expect(() =>
        response.parse({ tier: 'enterprise', enabled: {} })
      ).toThrow()
    })
  })
})
