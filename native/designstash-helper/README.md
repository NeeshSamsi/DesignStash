# designstash-helper

One small Swift command-line tool for the Apple-only abilities DesignStash uses: Vision (OCR, people
and hands, feature prints, classification) and Apple's on-device model (Foundation Models, image
prompts from macOS 27). The Electron main process spawns it and talks to it over stdin and stdout,
the same way it runs `llama-server` (`src/main/native/helper.ts`). Nothing here crosses into the renderer.

- arm64, deployment target macOS 26. Foundation Models code runs only on macOS 27 and later.
- Builds with the Command Line Tools alone (`swift build`). Guided generation uses
  `DynamicGenerationSchema`, so no `@Generable` macro (which needs Xcode) is involved.

## Build

```sh
pnpm helper:build            # release build, copied to ~/Library/Application Support/DesignStash-dev/helper/
pnpm helper:build --stage    # also copies it to build/helper/, which electron-builder ships to <resources>/helper/
```

`pnpm build` runs `helper:build --stage --optional` first: where the helper can't be built (an SDK older
than macOS 26), it warns and the build carries on without it. `pnpm package:stage` builds it without
`--optional`, so a release can't leave it out by accident.

The main process finds the binary at `DESIGNSTASH_HELPER` if set, then `<resources>/helper/designstash-helper`,
then the development copy above. With none, the helper is unavailable and
nothing that uses it crashes.

## Protocol (version 1)

Long-running. One JSON request per line on stdin, one JSON reply per line on stdout, matched by `id`
(any JSON value, echoed back). Requests are answered in order, one at a time. Logs go to stderr only.
The helper exits when stdin closes.

```
→ {"id": 1, "cmd": "ocr", "args": {"path": "/abs/cover.webp"}}
← {"id": 1, "ok": true, "result": {..., "ms": 118}}
← {"id": 2, "ok": false, "error": {"code": "not_found", "message": "no file at /abs/nope.webp"}}
```

Every result carries its own `ms`. Boxes are `[x, y, width, height]` as fractions of the image, with
the origin top-left. (The eval's `vision.json`, made by `scripts/ai-eval/apple/vision.swift`, kept
Vision's bottom-left origin.)

| Command | Args | Result |
|---|---|---|
| `info` | none | `protocol`, `os`, `vision` (current, default and supported revisions of each request), `foundationModels` (`available`, or `reason`: `notMacOS27`, `appleIntelligenceNotEnabled`, `deviceNotEligible`, `modelNotReady`, `unknown`) |
| `ocr` | `path`, `level?` (`accurate` default, or `fast`), `languageCorrection?` (true), `minConfidence?` (0) | `lines: [{text, confidence, box}]`, `level`, `languageCorrection`, `revision`, `width`, `height` |
| `people` | `path`, `minConfidence?` (0.3) | `peopleCount`, `handCount`, `people: [{confidence, box}]`, `hands: [{confidence, box}]`, `minConfidence` |
| `featureprint` | `path` | `revision`, `elementCount`, `data` (base64, little-endian Float32). Compare prints only within one revision. |
| `classify` | `path`, `max?` (10), `minConfidence?` (0.05) | `labels: [{label, confidence}]`, `revision` |
| `describe` | `path` (or null for text only), `instructions`, `prompt`, `schema?`, `maxTokens?` | `text`, `json` (true when `schema` shaped it) |

`describe` samples greedily, so the same input gives the same answer. `schema` is a JSON-schema-like
object: `object` (`properties`, `required`), `array` (`items`, `minItems`, `maxItems`), `string`
(`enum`, `pattern`), `integer` and `number` (`minimum`, `maximum`), `boolean`, and `description`.
Properties are generated in `required` order, then the rest by name. On macOS 27.2 the model rejects
any `pattern` (`bad_schema`), so leave patterns out.

Use `accurate` OCR on the 2048 px cover: on mockup covers `fast` and the 1024 px preview misread or
lose text (`design/research/vlm-pipeline-helpers.md`). The very first OCR call on a Mac can take
about 35 s while the system loads its text models; after that it is about 0.1 to 0.3 s.

### Error codes

| Code | Meaning |
|---|---|
| `bad_request` | The line isn't a JSON object, or `cmd` isn't a string. `id` is null when it couldn't be read. |
| `unknown_command` | No such `cmd`. |
| `bad_args` | A missing or wrongly typed argument. |
| `not_found` | No file at `path`. |
| `unreadable_image` | ImageIO can't decode the file. |
| `vision_failed` | A Vision request failed. |
| `unavailable` | Foundation Models can't run here; the message says why (`info` has it structured). |
| `bad_schema` | `schema` uses something unsupported, or the model can't follow it. |
| `refused` | The model's guardrails refused. |
| `context_too_long` | The prompt and image don't fit the model's context. |
| `busy` | The system model is rate limited or busy. |
| `generation_failed` | Any other generation error. |
| `internal` | A bug in the helper. |

## Packaging and signing

`electron-builder.yml` ships `build/helper/designstash-helper` to `<resources>/helper/`. Signing walks
every Mach-O file in the app, so the helper is signed with the app's identity and the hardened runtime
whenever an identity is configured; with none, the build stays unsigned (the linker's ad-hoc
signature) and runs for development. Still open: checking Vision and Foundation Models under the
hardened runtime on the first signed build, and the inherited-sandbox entitlements of an embedded
helper tool for a Mac App Store build.
