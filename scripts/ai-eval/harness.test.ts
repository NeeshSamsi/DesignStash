import { describe, expect, it } from 'vitest'
import {
  analyzeRequestBody,
  checkVersion,
  parseRssKb,
  parseSeedBase,
  parseVersionString,
  redactDataUrls,
  requestRecord,
  serverArgsFromEnv,
  singleRequestBody,
  toChatReply
} from './harness'
import v0 from './prompts/v0'

describe('serverArgsFromEnv', () => {
  it('splits DESIGNSTASH_EVAL_SERVER_ARGS on whitespace', () => {
    expect(
      serverArgsFromEnv({ DESIGNSTASH_EVAL_SERVER_ARGS: ' --reasoning off\t--cache-ram 2048 ' })
    ).toEqual(['--reasoning', 'off', '--cache-ram', '2048'])
  })

  it('is empty when unset or blank', () => {
    expect(serverArgsFromEnv({})).toEqual([])
    expect(serverArgsFromEnv({ DESIGNSTASH_EVAL_SERVER_ARGS: '  ' })).toEqual([])
  })
})

describe('parseSeedBase', () => {
  it('defaults to 42 and takes any whole number', () => {
    expect(parseSeedBase(undefined)).toBe(42)
    expect(parseSeedBase('1000')).toBe(1000)
  })

  it('refuses anything else', () => {
    expect(() => parseSeedBase('x')).toThrow(/--seed-base/)
    expect(() => parseSeedBase('1.5')).toThrow(/--seed-base/)
  })
})

describe('singleRequestBody', () => {
  const input = { imagePath: '/c.webp', fileName: 'Tote.psd', folderTrail: ['Bags'] }

  it("is the version's request with the pass seed set over any seed of its own", () => {
    const version = { ...v0, buildRequest: () => ({ messages: [], seed: 7, temperature: 0.2 }) }
    expect(singleRequestBody(version, input, null, 43)).toEqual({
      messages: [],
      seed: 43,
      temperature: 0.2
    })
  })

  it('is what run.ts sent before for v0', () => {
    const before = { ...v0.buildRequest(input, 'data:image/webp;base64,AAAA'), seed: 42 }
    expect(singleRequestBody(v0, input, 'data:image/webp;base64,AAAA', 42)).toEqual(before)
  })
})

describe('analyzeRequestBody', () => {
  it('adds the pass seed unless the request sets its own', () => {
    expect(analyzeRequestBody({ n: 3 }, 42)).toEqual({ seed: 42, n: 3 })
    expect(analyzeRequestBody({ seed: 9 }, 42)).toEqual({ seed: 9 })
  })

  it('drops the seed when the request sets it to undefined, so the server picks one', () => {
    expect(JSON.parse(JSON.stringify(analyzeRequestBody({ seed: undefined }, 42)))).toEqual({})
  })
})

describe('toChatReply', () => {
  it('gives the first reply, every choice, usage, timings and logprobs', () => {
    const reply = toChatReply(
      {
        choices: [
          { message: { content: 'a' }, logprobs: { content: [{ token: 'a', logprob: -0.1 }] } },
          { message: { content: 'b' } }
        ],
        usage: { prompt_tokens: 900, completion_tokens: 40 },
        timings: { prompt_ms: 300, predicted_ms: 500 }
      },
      812
    )
    expect(reply).toEqual({
      raw: 'a',
      choices: [{ raw: 'a', logprobs: { content: [{ token: 'a', logprob: -0.1 }] } }, { raw: 'b' }],
      usage: { promptTokens: 900, completionTokens: 40 },
      timings: { prompt_ms: 300, predicted_ms: 500 },
      logprobs: { content: [{ token: 'a', logprob: -0.1 }] },
      ms: 812
    })
  })

  it('fails as LlamaServer.chat does when there is no message content', () => {
    expect(() => toChatReply({ choices: [{ message: {} }] }, 1)).toThrow(
      'llama-server reply has no message content'
    )
  })
})

describe('requestRecord', () => {
  const reply = toChatReply(
    {
      choices: [{ message: { content: 'a' }, logprobs: { content: [] } }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
      timings: { prompt_ms: 3 }
    },
    50
  )

  it('keeps time, tokens and timings, and logprobs only when the request asked for them', () => {
    expect(requestRecord(reply, { messages: [] }, false)).toEqual({
      ms: 50,
      promptTokens: 10,
      completionTokens: 2,
      timings: { prompt_ms: 3 }
    })
    expect(requestRecord(reply, { logprobs: true }, false).logprobs).toEqual([{ content: [] }])
  })

  it('keeps the reply text when asked', () => {
    expect(requestRecord(reply, {}, true).raw).toEqual(['a'])
  })
})

describe('checkVersion', () => {
  const base = { id: 'x', notes: '' }
  const analyze = async () => ({ title: '', description: '', tags: [] })

  it('takes a one-request version or one with analyze', () => {
    expect(() => checkVersion(v0)).not.toThrow()
    expect(() => checkVersion({ ...base, analyze })).not.toThrow()
    expect(() => checkVersion({ ...base, analyze, runtime: 'external' })).not.toThrow()
  })

  it('refuses a version with neither, and an external one without analyze', () => {
    expect(() => checkVersion(base)).toThrow(/buildRequest/)
    expect(() => checkVersion({ ...v0, runtime: 'external' })).toThrow(/external/)
  })
})

describe('parseVersionString', () => {
  it('finds the version line in llama-server --version output', () => {
    expect(
      parseVersionString(
        'ggml_metal_init: found device\nversion: 6970 (2f966b8e)\nbuilt with clang for arm64\n'
      )
    ).toBe('version: 6970 (2f966b8e)')
  })

  it('is null for empty output', () => {
    expect(parseVersionString('')).toBeNull()
  })
})

describe('parseRssKb', () => {
  it('reads ps -o rss= output in kilobytes', () => {
    expect(parseRssKb('  4523104\n')).toBe(4523104)
    expect(parseRssKb('')).toBeNull()
  })
})

describe('redactDataUrls', () => {
  it('cuts image data URLs anywhere in a request to type, length and hash', () => {
    const out = redactDataUrls({
      messages: [{ content: [{ image_url: { url: 'data:image/webp;base64,AAAA' } }, 'hi'] }],
      seed: 1
    }) as { messages: { content: [{ image_url: { url: string } }, string] }[]; seed: number }
    expect(out.messages[0]!.content[0].image_url.url).toMatch(
      /^data:image\/webp \(27 chars, sha256 [0-9a-f]{16}\)$/
    )
    expect(out.messages[0]!.content[1]).toBe('hi')
    expect(out.seed).toBe(1)
  })
})
