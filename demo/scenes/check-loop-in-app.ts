/**
 * Does a bundled loop play inside the packaged app under its Content-Security-Policy?
 * Launches the packaged app, injects `<video autoplay muted loop>` elements pointing at the loop
 * from a few kinds of URL, and reports which play and which the CSP blocks.
 *
 *   DESIGNSTASH_E2E_APP=dist/mac-arm64/DesignStash.app tsx demo/scenes/check-loop-in-app.ts <loop.mp4>
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { launchApp, PACKAGED_APP_ENV } from '../../e2e/fixtures/app'

async function main(): Promise<void> {
  const loop = resolve(process.argv[2] ?? '')
  process.env[PACKAGED_APP_ENV] ??= resolve('dist/mac-arm64/DesignStash.app')
  const app = await launchApp({ onboarded: true })
  try {
    const dataUrl = `data:video/mp4;base64,${readFileSync(loop).toString('base64')}`
    const result = await app.window.evaluate(
      async ({ file, dataUrl }) => {
        const csp = document.querySelector<HTMLMetaElement>(
          'meta[http-equiv="Content-Security-Policy"]'
        )?.content
        const violations: string[] = []
        document.addEventListener('securitypolicyviolation', (e) => {
          violations.push(`${e.violatedDirective} blocked ${e.blockedURI.slice(0, 40)}`)
        })
        const sources: Record<string, string> = {
          'file:// path outside the bundle': `file://${file}`,
          'relative to the page (next to index.html)': './does-not-exist-loop.mp4',
          'data: URL': dataUrl
        }
        const out: Record<string, string> = {}
        for (const [name, src] of Object.entries(sources)) {
          const video = document.createElement('video')
          video.muted = true
          video.loop = true
          video.autoplay = true
          video.playsInline = true
          video.style.cssText = 'position:fixed;left:0;top:0;width:200px;z-index:99999'
          out[name] = await new Promise<string>((done) => {
            const timer = setTimeout(() => done(`no event in 4 s (paused=${video.paused})`), 4000)
            video.addEventListener('playing', () => {
              clearTimeout(timer)
              done(
                `plays (${video.videoWidth}x${video.videoHeight}, ${video.duration.toFixed(1)} s)`
              )
            })
            video.addEventListener('error', () => {
              clearTimeout(timer)
              done(`error code ${video.error?.code}`)
            })
            video.src = src
            document.body.append(video)
          })
          video.remove()
        }
        return {
          href: location.protocol + '//' + location.pathname.slice(-40),
          csp,
          out,
          violations
        }
      },
      { file: loop, dataUrl }
    )
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
