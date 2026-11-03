// A stand-in for designstash-helper in unit tests: the same line protocol, canned results.
// Special paths make it misbehave: /missing (error reply), /slow (answers after 150 ms),
// /hang (never answers), /crash (exits with code 3), /garbage (prints a non-JSON line first),
// /badshape (a result missing its fields). FAKE_HELPER_LOG names a file that gets "start",
// "req <id> <cmd> <args>" and "res <id>" lines, so tests can see what was sent and when.
import { Buffer } from 'node:buffer'
import { appendFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { createInterface } from 'node:readline'

const logFile = process.env.FAKE_HELPER_LOG
const log = (line) => logFile && appendFileSync(logFile, `${line}\n`)
log('start')
process.stderr.write('[fake-helper] ready\n')

const send = (reply) => {
  process.stdout.write(`${JSON.stringify(reply)}\n`)
  log(`res ${reply.id}`)
}
const box = [0.1, 0.2, 0.3, 0.4]
const vector = Buffer.from(new Float32Array([1, 2, 3]).buffer).toString('base64')
const describeText = (args) =>
  JSON.stringify({
    title: args.path ? 'Tape roll on a wall' : 'Tape roll',
    description: args.path ? 'A roll of tape on a white wall.' : 'A roll of tape.',
    tags: [
      { category: 'Print & Branding', label: 'tape' },
      { category: 'Environment', label: 'wall' },
      { category: 'Angle', label: 'front' }
    ]
  })

const results = {
  info: () => ({
    protocol: 1,
    os: '27.2.0',
    vision: { ocr: { current: 3, default: 3, supported: [1, 2, 3] } },
    foundationModels: { available: true }
  }),
  ocr: (args) => ({
    lines: [{ text: `text in ${args.path}`, confidence: 0.9, box }],
    level: args.level ?? 'accurate',
    languageCorrection: args.languageCorrection ?? true,
    revision: 3,
    width: 2048,
    height: 1536
  }),
  people: () => ({
    peopleCount: 1,
    handCount: 0,
    people: [{ confidence: 0.8, box }],
    hands: [],
    minConfidence: 0.3
  }),
  featureprint: () => ({ revision: 2, elementCount: 3, data: vector }),
  classify: () => ({ labels: [{ label: 'cup', confidence: 0.4 }], revision: 2 }),
  describe: (args) => ({ text: describeText(args), json: Boolean(args.schema) })
}

for await (const line of createInterface({ input: process.stdin })) {
  const { id, cmd, args = {} } = JSON.parse(line)
  log(`req ${id} ${cmd} ${JSON.stringify(args)}`)
  const path = args.path
  if (path === '/hang') continue
  if (path === '/crash') {
    process.stderr.write('[fake-helper] about to crash\n')
    process.exit(3)
  }
  if (path === '/garbage') process.stdout.write('not json at all\n')
  if (path === '/slow') await sleep(150)
  if (path === '/missing') {
    send({ id, ok: false, error: { code: 'not_found', message: 'no file at /missing' } })
  } else if (path === '/badshape') {
    send({ id, ok: true, result: { ms: 1 } })
  } else if (results[cmd]) {
    send({ id, ok: true, result: { ...results[cmd](args), ms: 1 } })
  } else {
    send({ id, ok: false, error: { code: 'unknown_command', message: `no command ${cmd}` } })
  }
}
