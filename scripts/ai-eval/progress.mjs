// Live progress for eval runs that write to log files (node scripts/ai-eval/progress.mjs [dir]).
// Each run log starts with run.ts's header line "<model> · <version> · <n> items × <repeats>" and
// gets one "<ms>ms  <id>  <title>" line per answer. Shows a bar, the count, the average time and an
// estimate for every run touched in the last 30 minutes, newest first, redrawn every 2 s.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setInterval } from 'node:timers'

const dir = resolve(process.argv[2] ?? 'tmp/round3')
const RECENT_MS = 30 * 60_000
const WIDTH = 30
// Log files carry the colour codes of pnpm and the terminal; strip them before matching.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
const plain = (s) => s.replace(ANSI, '')

function readRun(path) {
  const lines = plain(readFileSync(path, 'utf8')).split('\n')
  const header = lines.map((l) => l.match(/^(.+?) · (.+?) · (\d+) items × (\d+)/)).find(Boolean)
  if (!header) return null
  const answers = lines
    .map((l) => l.match(/^\s*(\d+)ms\s+(\S+)\s+(.*)$/))
    .filter(Boolean)
    .map((m) => ({ ms: Number(m[1]), id: m[2], text: m[3] }))
  const failed = lines.some((l) => /ELIFECYCLE|Error:/.test(l))
  return {
    model: header[1],
    version: header[2],
    total: Number(header[3]) * Number(header[4]),
    answers,
    failed
  }
}

const time = (ms) => {
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

function recentLogs(now) {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.log') && f.startsWith('run-'))
      .map((f) => ({ path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
      .filter((f) => now - f.mtime < RECENT_MS)
      .sort((a, b) => b.mtime - a.mtime)
  } catch {
    return []
  }
}

function draw() {
  const now = Date.now()
  const files = recentLogs(now)
  const out = [`Eval runs in ${dir} · ${new Date().toLocaleTimeString()}`, '']
  if (files.length === 0) out.push('No run has written to a log in the last 30 minutes.')
  for (const f of files) {
    const run = readRun(f.path)
    if (!run) continue
    const done = run.answers.length
    const share = run.total ? Math.min(1, done / run.total) : 0
    const filled = Math.round(share * WIDTH)
    const avg = done ? run.answers.reduce((n, a) => n + a.ms, 0) / done : 0
    const finished = done >= run.total
    const state = run.failed ? 'stopped with an error' : finished ? 'done' : `about ${time(avg * (run.total - done))} left`
    out.push(`${run.model} · ${run.version}`)
    out.push(
      `  [${'█'.repeat(filled)}${'░'.repeat(WIDTH - filled)}] ${done}/${run.total}  ${Math.round(share * 100)}%  avg ${(avg / 1000).toFixed(1)}s  ${state}`
    )
    const last = run.answers.at(-1)
    if (last && !finished) out.push(`  last: ${last.id} · ${last.text.slice(0, 70)}`)
    out.push('')
  }
  process.stdout.write(`\u001b[2J\u001b[H${out.join('\n')}\n`)
}

draw()
setInterval(draw, 2000)
