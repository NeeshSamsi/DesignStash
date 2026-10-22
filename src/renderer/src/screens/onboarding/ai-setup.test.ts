import { describe, expect, it } from 'vitest'
import type { AiDownloadProgress, AiModelInfo } from '@shared/ipc/ai'
import {
  aiHeading,
  aiScreen,
  defaultSelection,
  downloadLabel,
  hardwareView,
  modelDetail,
  partialDownload,
  rowView
} from './ai-setup'
import type { HardwareInfo } from './model-phase'

const model = (id: string, over: Partial<AiModelInfo> = {}): AiModelInfo => ({
  id,
  name: `Model ${id}`,
  tier: 'medium',
  sizeBytes: 2_100_000_000,
  description: '',
  languages: [],
  quality: 3,
  speed: 3,
  minMemoryGB: 8,
  bestFit: false,
  builtIn: false,
  downloadedBytes: 0,
  installed: false,
  active: false,
  ...over
})

const mac: HardwareInfo = {
  chip: 'Apple M2 Pro',
  totalMemoryGB: 32,
  isAppleSilicon: true,
  recommendedTier: 'medium'
}
const event = (over: Partial<AiDownloadProgress>): AiDownloadProgress => ({
  modelId: 'a',
  receivedBytes: 0,
  totalBytes: 100,
  phase: 'downloading',
  ...over
})

describe('defaultSelection', () => {
  it('prefers best fit, then the recommended tier, then the first', () => {
    const list = [
      model('a', { tier: 'small' }),
      model('b', { tier: 'medium' }),
      model('c', { bestFit: true })
    ]
    expect(defaultSelection(list, mac)).toBe('c')
    expect(defaultSelection(list.slice(0, 2), mac)).toBe('b')
    expect(defaultSelection(list.slice(0, 1), mac)).toBe('a')
    expect(defaultSelection([], mac)).toBeNull()
  })
})

describe('rowView', () => {
  it('is not-installed with nothing on disk', () => {
    expect(rowView(model('a'), null).state).toBe('not-installed')
  })

  it('shows speed and time left while downloading', () => {
    const view = rowView(
      model('a'),
      event({ receivedBytes: 41, totalBytes: 100, bytesPerSecond: 18e6, secondsLeft: 120 })
    )
    expect(view.state).toBe('downloading')
    expect(view.percent).toBe(41)
    expect(view.progressText).toContain('18 MB/s')
    expect(view.progressText).toContain('about 2 min left')
  })

  it('ignores events for another model', () => {
    expect(rowView(model('a'), event({ modelId: 'b' })).state).toBe('not-installed')
  })

  it('maps verifying, done and installed', () => {
    expect(rowView(model('a'), event({ phase: 'verifying' })).state).toBe('verifying')
    expect(rowView(model('a'), event({ phase: 'done' })).state).toBe('installed')
    expect(rowView(model('a', { installed: true }), null).state).toBe('installed')
  })

  it('turns every failure reason into plain copy', () => {
    for (const reason of ['offline', 'disk-full', 'checksum', 'server'] as const) {
      const view = rowView(model('a'), event({ phase: 'error', reason }))
      expect(view.state).toBe('failed')
      expect(view.failureReason).not.toMatch(/[A-Z_]{4,}|\//)
    }
    expect(
      rowView(model('a'), event({ phase: 'error', reason: 'disk-full' })).failureReason
    ).toMatch(/disk is full/)
  })

  it('a partial download on disk is paused with how far it got', () => {
    const view = rowView(
      model('a', { downloadedBytes: 860_000_000, sizeBytes: 2_100_000_000 }),
      null
    )
    expect(view.state).toBe('paused')
    expect(view.percent).toBe(41)
  })
})

describe('aiScreen', () => {
  const base = {
    loaded: true,
    hardware: mac,
    models: [model('a')],
    aiOn: true,
    selected: model('a'),
    event: null
  }
  it.each([
    ['loading', { loaded: false }],
    ['unsupported', { hardware: { ...mac, isAppleSilicon: false } }],
    ['empty', { models: [] }],
    ['skipped', { aiOn: false }],
    ['choose', {}],
    ['downloading', { event: event({}) }],
    ['verifying', { event: event({ phase: 'verifying' }) }],
    ['failed', { event: event({ phase: 'error', reason: 'offline' }) }],
    ['complete', { selected: model('a', { installed: true }) }]
  ] as const)('%s', (screen, over) => {
    expect(aiScreen({ ...base, ...over })).toBe(screen)
  })
})

describe('hardwareView', () => {
  it('describes a Mac that can run models', () => {
    expect(hardwareView(mac, null, null)).toMatchObject({
      variant: 'supported',
      title: 'Apple M2 Pro · 32 GB memory',
      badge: 'Apple Silicon'
    })
  })

  it('warns on Intel, and says everything else still works', () => {
    const view = hardwareView({ ...mac, isAppleSilicon: false }, null, null)
    expect(view.variant).toBe('unsupported')
    expect(view.description).toMatch(/Everything else works/)
  })

  it('warns about disk when the download ran out of room, naming the size', () => {
    const view = hardwareView(mac, model('a', { name: 'Qwen 2.5 VL 3B' }), 'disk-full')
    expect(view.variant).toBe('low-disk')
    expect(view.description).toContain('2.1 GB')
  })
})

describe('headings and helpers', () => {
  const base = { title: 'Set up on-device AI', body: 'Body' }
  it('only the complete screen changes the heading', () => {
    expect(aiHeading('choose', base, model('a'))).toEqual(base)
    expect(aiHeading('complete', base, model('a', { name: 'Qwen 2.5 VL 3B' })).title).toBe(
      'Your AI model is ready to go'
    )
  })

  it('finds a partial download from an earlier launch', () => {
    expect(partialDownload([model('a'), model('b', { downloadedBytes: 5 })])?.id).toBe('b')
    expect(partialDownload([model('a', { installed: true, downloadedBytes: 5 })])).toBeNull()
  })

  it('details a model in one plain line', () => {
    expect(modelDetail(model('a'))).toBe('2.1 GB · medium · better titles and tags')
  })

  it('details a built-in model by what it needs instead of a size', () => {
    const apple = model('apple', { tier: 'small', sizeBytes: 0, builtIn: true, installed: true })
    expect(modelDetail(apple)).toBe('Built in, no download · fastest, shorter descriptions')
  })

  it('says a built-in model is built in once it is picked', () => {
    const base = { title: 'Set up AI', body: 'Pick a model.' }
    const apple = model('apple', {
      name: 'Apple’s on-device model',
      builtIn: true,
      installed: true
    })
    expect(aiHeading('complete', base, apple).body).toMatch(
      /^Apple’s on-device model is built into your Mac and switched on\./
    )
  })
})

describe('downloadLabel', () => {
  const meaning = {
    id: 'nomic-embed-v1.5',
    installed: false,
    sizeBytes: 146_146_432,
    downloadedBytes: 0
  }

  it('adds meaning search to the vision model while its switch is on', () => {
    expect(downloadLabel(model('a'), meaning, null, true)).toBe('Download 2.2 GB')
  })

  it('is the vision model alone with the switch off, with no meaning model, or once it is there', () => {
    expect(downloadLabel(model('a'), meaning, null, false)).toBe('Download 2.1 GB')
    expect(downloadLabel(model('a'), null, null, true)).toBe('Download 2.1 GB')
    expect(downloadLabel(model('a'), { ...meaning, installed: true }, null, true)).toBe(
      'Download 2.1 GB'
    )
  })

  it('leaves meaning search out once its own download has started', () => {
    const event: AiDownloadProgress = {
      modelId: meaning.id,
      receivedBytes: 10,
      totalBytes: meaning.sizeBytes,
      phase: 'downloading'
    }
    expect(downloadLabel(model('a'), meaning, event, true)).toBe('Download 2.1 GB')
  })

  it('is plain Download with nothing picked', () => {
    expect(downloadLabel(null, meaning, null, true)).toBe('Download')
  })
})
