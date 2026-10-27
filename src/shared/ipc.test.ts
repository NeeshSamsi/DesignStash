import { describe, it, expect } from 'vitest'
import {
  IPC_CONTRACT,
  PUSH_CONTRACT,
  IPC_CHANNELS,
  IPC_DOMAIN_CONTRACTS,
  PUSH_CHANNELS,
  isPushChannel,
  AiModelInfoSchema,
  AiDownloadProgressSchema,
  type InvokeChannel,
  type IpcRequest,
  type PushChannel
} from './ipc'
import { TagsByCategorySchema } from './approval'

describe('IPC contract structure', () => {
  const channels = Object.values(IPC_CHANNELS)

  it('has exactly one contract per channel, push channels in PUSH_CONTRACT', () => {
    expect([...Object.keys(IPC_CONTRACT), ...Object.keys(PUSH_CONTRACT)].sort()).toEqual(
      [...channels].sort()
    )
    expect(Object.keys(PUSH_CONTRACT).sort()).toEqual([...PUSH_CHANNELS].sort())
  })

  it('puts every invoke channel in exactly one domain file', () => {
    const owners = new Map<string, string[]>()
    for (const [domain, contract] of Object.entries(IPC_DOMAIN_CONTRACTS)) {
      for (const channel of Object.keys(contract)) {
        owners.set(channel, [...(owners.get(channel) ?? []), domain])
      }
    }
    expect([...owners.keys()].sort()).toEqual(Object.keys(IPC_CONTRACT).sort())
    for (const [channel, domains] of owners) expect([channel, domains.length]).toEqual([channel, 1])
  })

  it('lists only real channels as push channels, each with a payload schema', () => {
    for (const channel of PUSH_CHANNELS) {
      expect(channels).toContain(channel)
      expect(typeof PUSH_CONTRACT[channel].payload.safeParse).toBe('function')
    }
    expect(isPushChannel(IPC_CHANNELS.AI_STATUS)).toBe(true)
    expect(isPushChannel(IPC_CHANNELS.TAG_TREE)).toBe(false)
    expect(isPushChannel('not:a-channel')).toBe(false)
  })

  it('keeps push channels out of the invoke types', () => {
    const invoke = (channel: InvokeChannel) => channel
    invoke(IPC_CHANNELS.TAG_TREE)
    // @ts-expect-error a push channel cannot be invoked
    invoke(IPC_CHANNELS.AI_STATUS)

    const push = (channel: PushChannel) => channel
    push(IPC_CHANNELS.AI_STATUS)
    // @ts-expect-error an invoke channel cannot be pushed
    push(IPC_CHANNELS.TAG_TREE)

    // @ts-expect-error a push channel has no request type
    const request: IpcRequest<typeof IPC_CHANNELS.COPY_PROGRESS> | null = null
    // @ts-expect-error a push channel has no entry in IPC_CONTRACT
    void IPC_CONTRACT[IPC_CHANNELS.COPY_PROGRESS]
    // @ts-expect-error an invoke channel has no entry in PUSH_CONTRACT
    void PUSH_CONTRACT[IPC_CHANNELS.TAG_TREE]
    expect(request).toBeNull()
  })
})

describe('copy status wire shape', () => {
  const counts = {
    haulId: 'h1',
    total: 3,
    landed: 1,
    bytesTotal: 300,
    bytesCopied: 100,
    bytesPerSecond: 0,
    secondsLeft: null,
    skipped: { notPsd: 0, duplicate: 0, unreadable: 0, archiveUnsupported: 0, noPsdInArchive: 0 }
  }
  const { payload } = PUSH_CONTRACT[IPC_CHANNELS.COPY_PROGRESS]
  const { response } = IPC_CONTRACT[IPC_CHANNELS.COPY_RETRY]

  it('a paused haul says why', () => {
    const paused = { ...counts, state: 'paused', pauseReason: 'disk-full' }
    expect(response.parse({ ...paused, files: [] })).toEqual({ ...paused, files: [] })
    expect(payload.parse({ ...paused, file: null })).toEqual({ ...paused, file: null })
    expect(payload.safeParse({ ...counts, state: 'paused', file: null }).success).toBe(false)
    expect(
      payload.safeParse({ ...counts, state: 'paused', pauseReason: null, file: null }).success
    ).toBe(false)
  })

  it.each(['running', 'done', 'cancelled', 'undone'] as const)(
    'a %s haul carries no pause reason',
    (state) => {
      const parsed = response.parse({ ...counts, state, pauseReason: 'disk-full', files: [] })
      expect(parsed).toEqual({ ...counts, state, files: [] })
      expect('pauseReason' in parsed).toBe(false)
    }
  )

  it('rejects a state that does not exist', () => {
    expect(payload.safeParse({ ...counts, state: 'sleeping', file: null }).success).toBe(false)
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

  describe('AI_HARDWARE_INFO channel', () => {
    const { response } = IPC_CONTRACT[IPC_CHANNELS.AI_HARDWARE_INFO]

    it('validates a correct response', () => {
      const valid = {
        chip: 'M3',
        totalMemoryGB: 16,
        isAppleSilicon: true,
        recommendedTier: 'medium'
      }
      expect(response.parse(valid)).toEqual(valid)
    })

    it('rejects an invalid tier', () => {
      expect(() =>
        response.parse({
          chip: 'X',
          totalMemoryGB: 8,
          isAppleSilicon: false,
          recommendedTier: 'xl'
        })
      ).toThrow()
    })
  })

  describe('AI_LIST_MODELS channel', () => {
    const { response } = IPC_CONTRACT[IPC_CHANNELS.AI_LIST_MODELS]

    it('validates a list response', () => {
      const valid = {
        models: [
          {
            id: 'qwen3-vl-4b',
            name: 'Qwen3-VL 4B',
            tier: 'medium',
            sizeBytes: 2774658784,
            description: 'Fast.',
            languages: ['English'],
            quality: 3,
            speed: 5,
            minMemoryGB: 8,
            bestFit: false,
            builtIn: false,
            downloadedBytes: 0,
            installed: false,
            active: false
          }
        ],
        meaning: {
          id: 'nomic-embed-v1.5',
          name: 'Meaning search',
          description: 'Finds mockups by what a search means.',
          license: 'Apache 2.0',
          sizeBytes: 146146432,
          downloadedBytes: 0,
          installed: false
        },
        legacy: [{ id: 'qwen2.5-1.5b', sizeBytes: 1040000000 }],
        activeProblem: null
      }
      expect(response.parse(valid)).toEqual(valid)
      expect(() => response.parse({ ...valid, meaning: undefined })).toThrow()
      expect(
        response.parse({ ...valid, activeProblem: 'apple-intelligence-off' }).activeProblem
      ).toBe('apple-intelligence-off')
      expect(() => response.parse({ ...valid, activeProblem: 'gone' })).toThrow()
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
      const { payload } = PUSH_CONTRACT[IPC_CHANNELS.AI_DOWNLOAD_PROGRESS]
      const valid = {
        modelId: 'moondream2-q4',
        receivedBytes: 500,
        totalBytes: 1800000000,
        phase: 'downloading'
      }
      expect(payload.parse(valid)).toEqual(valid)
    })

    it('validates an error event payload with a reason', () => {
      const { payload } = PUSH_CONTRACT[IPC_CHANNELS.AI_DOWNLOAD_PROGRESS]
      const valid = {
        modelId: 'x',
        receivedBytes: 0,
        totalBytes: 0,
        phase: 'error',
        reason: 'checksum'
      }
      expect(payload.parse(valid)).toEqual(valid)
    })
  })

  describe('AI_SET_ACTIVE channel', () => {
    it('AI_SET_ACTIVE request accepts null', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.AI_SET_ACTIVE]
      expect(request.parse({ id: null })).toEqual({ id: null })
    })
  })

  describe('AiModelInfoSchema', () => {
    it('rejects an invalid tier', () => {
      expect(() =>
        AiModelInfoSchema.parse({
          id: 'x',
          name: 'X',
          tier: 'xl',
          sizeBytes: 0,
          description: '',
          languages: [],
          quality: 3,
          speed: 3,
          minMemoryGB: 8,
          bestFit: false,
          builtIn: false,
          downloadedBytes: 0,
          installed: false,
          active: false
        })
      ).toThrow()
    })

    it('validates a well-formed model entry', () => {
      const valid = {
        id: 'qwen3-vl-4b',
        name: 'Qwen3-VL 4B',
        tier: 'medium',
        sizeBytes: 2774658784,
        description: 'Balanced.',
        languages: ['English'],
        quality: 4,
        speed: 4,
        minMemoryGB: 12,
        bestFit: true,
        builtIn: false,
        downloadedBytes: 0,
        installed: true,
        active: true
      }
      expect(AiModelInfoSchema.parse(valid)).toEqual(valid)
    })

    it('needs to know whether a model is built in', () => {
      const apple = {
        id: 'apple',
        name: 'Apple’s on-device model',
        tier: 'small',
        sizeBytes: 0,
        description: 'Built in.',
        languages: ['English'],
        quality: 3,
        speed: 5,
        minMemoryGB: 8,
        bestFit: false,
        builtIn: true,
        downloadedBytes: 0,
        installed: true,
        active: false
      }
      expect(AiModelInfoSchema.parse(apple)).toEqual(apple)
      const withoutField: Record<string, unknown> = { ...apple }
      delete withoutField.builtIn
      expect(() => AiModelInfoSchema.parse(withoutField)).toThrow()
    })
  })

  describe('AiDownloadProgressSchema', () => {
    it('rejects an unknown phase', () => {
      expect(() =>
        AiDownloadProgressSchema.parse({
          modelId: 'x',
          receivedBytes: 0,
          totalBytes: 0,
          phase: 'pending'
        })
      ).toThrow()
    })
  })

  describe('GROUPING_PROPOSE channel', () => {
    it('validates a grouping proposal response', () => {
      const { response } = IPC_CONTRACT[IPC_CHANNELS.GROUPING_PROPOSE]
      const valid = {
        batchId: 'batch-abc',
        groups: [
          {
            id: 'g1',
            members: [
              {
                mockupId: 1,
                isPrimary: true,
                coverPath: '/covers/1.png',
                fileName: 'hero-A.psd',
                folderTrail: ['iPhone']
              }
            ],
            reason: 'folder'
          }
        ],
        singletons: []
      }
      expect(response.parse(valid)).toEqual(valid)
    })
  })

  describe('TAG_LIST_BY_CATEGORY channel', () => {
    it('validates a categories response', () => {
      const { response } = IPC_CONTRACT[IPC_CHANNELS.TAG_LIST_BY_CATEGORY]
      const valid = {
        categories: [
          {
            categoryId: 1,
            categoryLabel: 'Device',
            tags: [{ tagId: 10, label: 'iphone' }]
          }
        ]
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
      expect(request.parse({ label: 'tablet', categoryId: 1 })).toEqual({
        label: 'tablet',
        categoryId: 1
      })
      expect(response.parse({ tagId: 42, label: 'tablet', categoryId: 1 })).toEqual({
        tagId: 42,
        label: 'tablet',
        categoryId: 1
      })
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
        tree: [
          {
            categoryId: 1,
            categoryLabel: 'Device',
            tagCount: 2,
            tags: [
              { tagId: 10, label: 'laptop', usageCount: 3 },
              { tagId: 11, label: 'macbook', usageCount: 0 }
            ]
          }
        ]
      }
      expect(response.parse(valid)).toEqual(valid)
    })
  })

  describe('TAG_MERGE channel', () => {
    it('validates request and affectedMockups response', () => {
      const { request, response } = IPC_CONTRACT[IPC_CHANNELS.TAG_MERGE]
      expect(request.parse({ sourceTagId: 1, targetTagId: 2 })).toEqual({
        sourceTagId: 1,
        targetTagId: 2
      })
      expect(response.parse({ affectedMockups: 4 })).toEqual({ affectedMockups: 4 })
    })
  })

  describe('TAG_RENAME channel', () => {
    it('rejects an empty label', () => {
      const { request } = IPC_CONTRACT[IPC_CHANNELS.TAG_RENAME]
      expect(request.parse({ tagId: 1, label: 'notebook' })).toEqual({
        tagId: 1,
        label: 'notebook'
      })
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
      expect(response.parse({ affectedMockups: 2, snapshot })).toEqual({
        affectedMockups: 2,
        snapshot
      })
      expect(() => response.parse({ affectedMockups: 2 })).toThrow()
    })

    it('TAG_MERGE_PREVIEW mirrors TAG_MERGE', () => {
      const { request, response } = IPC_CONTRACT[IPC_CHANNELS.TAG_MERGE_PREVIEW]
      expect(request.parse({ sourceTagId: 1, targetTagId: 2 })).toEqual({
        sourceTagId: 1,
        targetTagId: 2
      })
      expect(response.parse({ affectedMockups: 5 })).toEqual({ affectedMockups: 5 })
    })

    it('CATEGORY_DELETE takes an optional move target and returns a snapshot', () => {
      const { request, response } = IPC_CONTRACT[IPC_CHANNELS.CATEGORY_DELETE]
      expect(request.parse({ categoryId: 1 })).toEqual({ categoryId: 1 })
      expect(request.parse({ categoryId: 1, moveTagsTo: 2 })).toEqual({
        categoryId: 1,
        moveTagsTo: 2
      })
      const valid = {
        deleted: true,
        movedTags: 3,
        snapshot: { id: 1, label: 'Angle', sortOrder: 5, isCanonical: true }
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
      expect(request.parse({ categoryIds: [3], sort: 'date' })).toEqual({
        categoryIds: [3],
        sort: 'date'
      })
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
        items: [
          {
            id: 1,
            title: 'Test',
            description: null,
            coverPath: '/c.png',
            coverSource: 'embedded' as const,
            coverMissing: false,
            favourite: false,
            createdAt: '2025-01-01T00:00:00',
            pile: null,
            tags: [],
            pileId: null,
            variation: null
          }
        ]
      }
      expect(response.parse(valid)).toEqual(valid)
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

describe('menu:command push', () => {
  const { payload } = PUSH_CONTRACT[IPC_CHANNELS.MENU_COMMAND]

  it('is a push channel the preload relays', () => {
    expect(isPushChannel(IPC_CHANNELS.MENU_COMMAND)).toBe(true)
  })

  it('carries one of the known commands and nothing else', () => {
    expect(payload.parse('settings')).toBe('settings')
    expect(payload.parse('view:trash')).toBe('view:trash')
    expect(payload.safeParse('view:somewhere').success).toBe(false)
    expect(payload.safeParse({ command: 'settings' }).success).toBe(false)
  })
})

describe('look-over:draft push', () => {
  const { payload } = PUSH_CONTRACT[IPC_CHANNELS.LOOK_OVER_DRAFT]
  const item = {
    mockupId: 14,
    pileId: 13,
    role: 'variant',
    title: 'Blue scroll Macbook',
    variation: { words: 'side', source: 'marker' },
    description: 'A long page',
    tags: [],
    touched: false,
    checked: false,
    waitingForAi: false,
    carry: null,
    ai: { status: 'ready' },
    cover: { path: '/lib/c.webp', source: 'embedded', missing: false, width: 10, height: 10 }
  }

  it('is a push channel the preload relays', () => {
    expect(isPushChannel(IPC_CHANNELS.LOOK_OVER_DRAFT)).toBe(true)
  })

  it("says where the item's suggestion is: writing with its run, couldn't write, or filled in by the person (L6)", () => {
    const run = { phase: 'writing', writingSince: 1_000, slowAfterMs: 20_000 }
    expect(payload.parse({ ...item, ai: { status: 'sniffing', run } })).toMatchObject({
      ai: { status: 'sniffing', run }
    })
    for (const status of ['pending', 'failed', 'opted_out', 'off'])
      expect(payload.safeParse({ ...item, ai: { status } }).success).toBe(true)
    expect(payload.safeParse({ ...item, ai: undefined }).success).toBe(false)
    expect(payload.safeParse({ ...item, ai: { status: 'stopped' } }).success).toBe(false)
  })

  it('carries one Look it over item, saying whether it still waits for the AI', () => {
    expect(payload.parse(item)).toEqual(item)
    expect(payload.safeParse({ ...item, waitingForAi: undefined }).success).toBe(false)
  })

  it("carries a variant's offer of the top's edit: its reason, the version accepting gives and the tag changes", () => {
    const tag = { tagId: 3, label: 'bench', categoryId: 1, categoryLabel: 'Environment' }
    const offered = {
      ...item,
      carry: {
        state: 'offered',
        reason: 'this one is on a mesh floor',
        why: 'refused',
        after: { description: 'A long page on a bench', via: 'rewrite' },
        tagsAdded: [tag],
        tagsRemoved: []
      }
    }
    expect(payload.parse(offered)).toEqual(offered)
    expect(
      payload.safeParse({ ...offered, carry: { ...offered.carry, after: null } }).success
    ).toBe(true)
    expect(
      payload.safeParse({ ...offered, carry: { ...offered.carry, state: 'copied' } }).success
    ).toBe(false)
  })

  it('says why an edit is on offer: not judged, refused, slow, failed or undone, and null while checking or once in (L7)', () => {
    const offered = {
      ...item,
      carry: {
        state: 'offered',
        reason: null,
        why: 'unjudged',
        after: null,
        tagsAdded: [],
        tagsRemoved: []
      }
    }
    for (const why of ['unjudged', 'refused', 'slow', 'failed', 'undone'])
      expect(payload.safeParse({ ...offered, carry: { ...offered.carry, why } }).success).toBe(true)
    expect(
      payload.safeParse({ ...offered, carry: { ...offered.carry, state: 'checking', why: null } })
        .success
    ).toBe(true)
    expect(
      payload.safeParse({ ...offered, carry: { ...offered.carry, why: 'timeout' } }).success
    ).toBe(false)
  })
})

describe('look-over:open', () => {
  const { response } = IPC_CONTRACT[IPC_CHANNELS.LOOK_OVER_OPEN]

  it('says whether the active model checks an edit to a pile top (L7.1)', () => {
    expect(response.safeParse({ units: [], checksEdits: true, resume: null }).success).toBe(true)
    expect(response.safeParse({ units: [], resume: null }).success).toBe(false)
  })
})

describe('look-over:fill-myself and look-over:write', () => {
  it('take one mockup and answer with its item, or null when it is not waiting in To stash (L6.E1, L6.E3)', () => {
    for (const channel of [
      IPC_CHANNELS.LOOK_OVER_FILL_MYSELF,
      IPC_CHANNELS.LOOK_OVER_WRITE
    ] as const) {
      const { request, response } = IPC_CONTRACT[channel]
      expect(request.parse({ mockupId: 4 })).toEqual({ mockupId: 4 })
      expect(request.safeParse({}).success).toBe(false)
      expect(response.safeParse(null).success).toBe(true)
      expect(isPushChannel(channel)).toBe(false)
    }
  })
})

describe('look-over:answer-edit', () => {
  const { request, response } = IPC_CONTRACT[IPC_CHANNELS.LOOK_OVER_ANSWER_EDIT]

  it("takes one variant and the person's answer to its edit: accept, undo, dismiss or restore", () => {
    for (const action of ['accept', 'undo', 'dismiss', 'restore'] as const) {
      expect(request.parse({ mockupId: 3, action })).toEqual({ mockupId: 3, action })
    }
    expect(request.safeParse({ mockupId: 3, action: 'copy' }).success).toBe(false)
    expect(request.safeParse({ action: 'accept' }).success).toBe(false)
  })

  it('answers with the updated item, or null when that variant had nothing in that state', () => {
    expect(response.parse(null)).toBeNull()
    expect(response.safeParse({ mockupId: 3 }).success).toBe(false)
  })
})

describe('look-over:showing', () => {
  const { request, response } = IPC_CONTRACT[IPC_CHANNELS.LOOK_OVER_SHOWING]

  it('takes the mockup now on screen', () => {
    expect(request.parse({ mockupId: 3 })).toEqual({ mockupId: 3 })
    expect(request.safeParse({}).success).toBe(false)
  })

  it('answers with where its suggestion is: waiting its turn, its run, or how it ended; null when it is gone', () => {
    expect(response.parse({ mockupId: 3, status: 'pending' })).toEqual({
      mockupId: 3,
      status: 'pending'
    })
    const queued = {
      mockupId: 3,
      status: 'pending',
      run: { phase: 'queued', writingSince: null, slowAfterMs: 20_000 }
    }
    expect(response.parse(queued)).toEqual(queued)
    const run = { phase: 'writing', writingSince: 1_700_000_000_000, slowAfterMs: 35_000 }
    expect(response.parse({ mockupId: 3, status: 'sniffing', run })).toEqual({
      mockupId: 3,
      status: 'sniffing',
      run
    })
    expect(
      response.parse({
        mockupId: 3,
        status: 'sniffing',
        run: { ...run, phase: 'starting', writingSince: null }
      })?.run?.phase
    ).toBe('starting')
    expect(
      response.safeParse({ mockupId: 3, status: 'sniffing', run: { ...run, phase: 'loading' } })
        .success
    ).toBe(false)
    expect(response.parse(null)).toBeNull()
  })
})

describe('ai:status with a run', () => {
  it("carries a started run's phase, its clock and its threshold", () => {
    const { payload } = PUSH_CONTRACT[IPC_CHANNELS.AI_STATUS]
    const event = {
      updates: [
        {
          mockupId: 1,
          status: 'sniffing',
          run: { phase: 'starting', writingSince: null, slowAfterMs: 90_000 }
        },
        { mockupId: 2, status: 'pending' }
      ],
      totals: { total: 2, remaining: 2 }
    }
    expect(payload.parse(event)).toEqual(event)
  })
})
