/**
 * helper:try. Runs one command of the Swift helper through the main-process client and prints the
 * result, to try it by hand after `pnpm helper:build`.
 *
 *   pnpm helper:try info
 *   pnpm helper:try ocr <image> [--fast]
 *   pnpm helper:try people <image>
 *   pnpm helper:try classify <image>
 *   pnpm helper:try featureprint <image>
 *   pnpm helper:try describe <image> [--name "File name.psd"]   # AppleInferenceProvider, the app's prompt
 *   pnpm helper:try describe-text <image | -> "<prompt>"        # plain text, no schema
 *
 * Uses `DESIGNSTASH_HELPER` or the dev copy; never starts llama-server.
 */
import { basename, dirname, resolve } from 'node:path'
import { AppleInferenceProvider } from '../src/main/ai/apple-provider'
import { NativeHelper, resolveHelperPath } from '../src/main/native/helper'

const [cmd, target, ...rest] = process.argv.slice(2)
const flag = (name: string) => rest.includes(`--${name}`)
const option = (name: string) => {
  const at = rest.indexOf(`--${name}`)
  return at === -1 ? undefined : rest[at + 1]
}

async function main(): Promise<void> {
  const binaryPath = resolveHelperPath(process.env, undefined)
  if (!binaryPath) throw new Error('No helper. Run `pnpm helper:build` first.')
  const helper = new NativeHelper({ binaryPath })
  const image = target && target !== '-' ? resolve(target) : null
  const need = () => {
    if (!image) throw new Error(`${cmd} needs an image path`)
    return image
  }
  try {
    const started = performance.now()
    let output: unknown
    switch (cmd) {
      case 'info':
        output = await helper.info()
        break
      case 'ocr':
        output = await helper.ocr(need(), flag('fast') ? { level: 'fast' } : {})
        break
      case 'people':
        output = await helper.people(need())
        break
      case 'classify':
        output = await helper.classify(need())
        break
      case 'featureprint': {
        const print = await helper.featurePrint(need())
        output = {
          revision: print.revision,
          elementCount: print.elementCount,
          ms: print.ms,
          first: Array.from(print.vector.slice(0, 8))
        }
        break
      }
      case 'describe': {
        const path = need()
        // An eval cover lives at covers/<id>/cover.webp, so the folder name stands in for the file name.
        const fileName = option('name') ?? `${basename(dirname(path))}.psd`
        output = await new AppleInferenceProvider({ helper }).analyze({
          imagePath: path,
          fileName,
          folderTrail: []
        })
        break
      }
      case 'describe-text':
        output = await helper.describe({
          imagePath: image,
          instructions: 'You describe images briefly and plainly.',
          prompt: rest[0] ?? 'Describe this image in one sentence.'
        })
        break
      default:
        throw new Error(
          'Usage: pnpm helper:try info | ocr | people | classify | featureprint | describe | describe-text <image>'
        )
    }
    console.log(JSON.stringify(output, null, 2))
    console.log(`(${Math.round(performance.now() - started)} ms with start-up)`)
  } finally {
    await helper.stop()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : err)
  process.exit(1)
})
