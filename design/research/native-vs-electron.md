# Native Swift or Electron for DesignStash

**Question:** considering everything built so far, would DesignStash be meaningfully better as a native Swift (SwiftUI/AppKit) app, or should it stay Electron? Brief: Solo scratchpad 68, section D.

**Researched:** 2026-10-21, on branch `feat/shadcn-ui` at `d8d438d`, on the user's M3 Max (36 GB) running macOS 27.2.

**How this was done.** Primary sources were read directly: Apple's documentation (fetched as the JSON behind developer.apple.com), Apple's App Review Guidelines, Electron's docs from its repository, Tauri's docs and README, MDN's browser-compat-data (the dataset behind MDN's support tables), the W3C Compositing spec, the MLX Swift and llama.cpp repositories, and 1Password's own engineering post. Measurements were taken on this Mac with throwaway scripts in the session scratchpad (Swift CLIs compiled with the Command Line Tools, and a Node script using the repo's own `ag-psd` and `sharp`). The test set was read only. The app, the eval, e2e and `llama-server` were not run. **Unverified** marks anything I could not check against a primary source or a measurement.

## Recommendation

**Stay on Electron. Add one small signed Swift helper (a command-line tool the main process spawns, like `llama-server` today) for the Apple-only capabilities that matter: Vision OCR, Apple's on-device Foundation Models with image input, and Vision feature prints for similarity.** That captures the one large native benefit found (a zero-download AI model that answered in 1.2 to 2.1 s per cover here) for about 1 to 2 weeks of work, against 14 to 20 engineer-weeks for a full rewrite whose other measured gains are small next to what the app already spends on its AI model.

Why, in short:

1. **Memory is dominated by the model.** A blank Electron 42 window measured about 85 MB of physical footprint across its processes, a blank SwiftUI window about 20 MB. The Qwen 2.5 VL 3B server already measured about 3.5 GB resident and the 7B about 6.3 GB (`design/specs/ai.md`). Rewriting the shell saves roughly 2% of the 3B's memory. Switching to Apple's model removes the 3.5 GB entirely, and Electron can reach that model through a helper.
2. **PSD and image speed is a non-issue at this scale.** ImageIO made a 1024 px thumbnail in 27 to 54 ms; the app's `ag-psd` plus `sharp` path took 90 to 140 ms on the same files. The real import averaged about 4.3 s per PSD (32 PSDs in 137 s, Roadmap 46), so native saves about 2% of import time.
3. **Distribution works either way.** A sandboxed Mac App Store build can spawn an embedded helper such as `llama-server` (Apple documents the exact setup), Electron ships a MAS build, and notarised direct distribution is what the app is set up for now. The blockers that exist (model downloads under guideline 2.4.5(iv), licence keys under 2.4.5(vi)) apply equally to a native app.
4. **The design pipeline is the costliest thing to rebuild.** 83 generated-contract components, a Figma token pipeline, 328 mapped screens and view-transition motion all target the DOM. Chromium already renders the approved squircle corners (`corner-shape`), which Safari's engine (and so Tauri) does not yet ship.
5. **The far-future mockup editor does not need native.** Electron's Chromium 148 has WebGPU and WebGL2, and the hard parts (Photoshop-exact blend modes, mesh warps, smart filters) are shader work on either side. Core Image gives more blend modes out of the box, and a Swift helper could render offline if that ever matters.

## Decision table

Scores are for this app, from the evidence below. "Today" is the current build.

| Factor | Electron today | Electron + Swift helper | Tauri 2 | Native SwiftUI/AppKit |
| --- | --- | --- | --- | --- |
| Idle memory of the shell | ~85 MB (blank window, measured) | same | Lower (system WebKit; unmeasured) | ~20 MB (blank window, measured) |
| Memory while the AI works | +3.5 GB (3B) or +6.3 GB (7B) | +0 app-side with Apple's model (45 MB peak RSS for the CLI, measured; system daemon memory not counted) | same as today | same as helper |
| Download size | Electron alone: 118 MB zipped, 273 MB on disk (measured) | +~0.1 MB helper | Small shell, but `sharp`/PSD work must be re-done | Small shell |
| Startup | Blank window first load 250 to 400 ms (measured) | same | Not measured | Not measured; Unverified |
| Battery | Not measured | same | Not measured | Not measured |
| PSD cover speed | 90 to 140 ms per cover (measured) | Optional ImageIO: 27 to 54 ms | Rust re-port needed | 27 to 54 ms (measured) |
| On-device AI | llama.cpp server, 2.8 to 5.5 GB model download | adds Apple Foundation Models (no download, macOS 27, Apple Intelligence on), Vision OCR, feature prints | sidecar works like today | everything, in process |
| Drag and drop, Quick Look | Drop in works today; drag out via `startDrag`; Quick Look via `win.previewFile` | same | Plugins; Unverified | Full AppKit |
| Spotlight, app extensions | No API; Unverified via native addon | Core Spotlight from a helper: Unverified | Unverified | Full (Core Spotlight, Quick Look and thumbnail extensions) |
| Mac App Store | MAS build exists (no `autoUpdater`, no `crashReporter`); helper needs `inherit` entitlement | same | Documented MAS path | Native path |
| Notarised direct | Set up now (`electron-builder.yml`) | helper signed with hardened runtime, like `llama-server` | Documented | Xcode default |
| Mockup editor (far future) | WebGPU/WebGL2 in Chromium 148 | plus Core Image offline render if needed | WebGPU in Safari 26+; Unverified in WKWebView | Core Image, Metal |
| Design fidelity to Figma tokens | Pipeline built; `corner-shape` supported | same | `corner-shape` not in Safari; re-QA every screen | Pipeline must be rebuilt for SwiftUI |
| Rewrite cost | 0 | 1 to 2 weeks | 6 to 9 engineer-weeks | 14 to 20 engineer-weeks |

## What exists today (the rewrite inventory)

Counted on `d8d438d` (non-test lines exclude generated files):

| Area | Source lines | Test lines | Notes |
| --- | --- | --- | --- |
| Main process (`src/main`) | 8,933 | 12,923 | 92 modules: import and copy queue, zip reading, DB and repositories, library services, PSD covers, AI runtime, telemetry, updates |
| Shared contracts (`src/shared`) | 1,949 | 1,082 | zod IPC contracts, about 100 channels |
| Renderer screens | 9,650 | 8,430 | 12 screen areas, 33 screen files |
| Renderer components | 12,276 | 6,704 | 83 components, one per Figma component set |
| shadcn `ui/`, stores, hooks, lib, design-system | 5,709 | 2,116 | |
| Generated (tokens, contracts, catalog) | 10,665 | | From `design/figma/*.json` via `pnpm ds` |
| Scripts (DS pipeline, AI eval) | 2,924 | 269 | |
| E2E (`e2e/`) | 2,085 | | 11 specs |
| CSS | 867 | | |
| Migrations | 12 SQL files | | |

In all: about 42,000 hand-written lines of source, 31,000 lines of tests (237 files, 2,989 tests), and a Figma-driven generator. The git history has 400 commits, most of them landed between 2026-10-19 and 2026-10-21 by parallel agents, which says the current stack and pipeline are what the agents are productive in.

## Evidence by factor

### Memory and startup

- **Measured, blank windows.** Electron 42.4.0 (Chromium 148.0.7778.254, Node 24.16.0) opening a sandboxed 1200 x 800 window: main process 41 MB, helper processes 20 MB, 17 MB and 7 MB of physical footprint (`top` MEM column, 8 s after launch), so about 85 MB. Summed RSS was 362 MB, which double-counts the shared framework. A SwiftUI window of the same size: 20 MB footprint, 83 MB RSS. First page load in Electron took 250 to 397 ms over two runs. The real app was not launched (its native `better-sqlite3` build was compiled for Node at the time, and the brief keeps agents away from the dev app), so the real DesignStash footprint with a full grid of covers is **Unverified**.
- **What the app already spends.** `design/specs/ai.md` measured `llama-server` at about 3.5 GB resident for Qwen 2.5 VL 3B and about 6.3 GB for 7B on this machine, and `registry.ts` sets the 7B's minimum at 16 GB of RAM. Against that, the shell difference (about 65 MB) is small.
- **Battery.** Not measured. Electron's own guidance is that performance problems usually come from the app's code (loading modules early, blocking the main process), which is the same work a native rewrite would also have to do well. Source: https://github.com/electron/electron/blob/main/docs/tutorial/performance.md. A battery comparison for this app is **Unverified**.

### App size

- Measured: `Electron.app` is 273 MB on disk (271 MB of it `Electron Framework.framework`) and 118 MB zipped with `ditto`. `sharp`'s libvips adds 17 MB, `better-sqlite3` 1.8 MB.
- For comparison, installed apps on this Mac: Electron apps Figma 306 MB, Notion 241 MB, Obsidian 528 MB, VS Code 866 MB; native apps Bear 120 MB, Raycast 242 MB, Affinity 3.6 GB. Native apps also grow large once they carry assets and libraries.
- The model download (2.77 GB for 3B, 5.54 GB for 7B, `design/specs/ai.md`) is 20 to 45 times the size of the Electron framework. A zero-download model changes the size story far more than the shell does.

### Drag and drop, Finder, Quick Look, Spotlight

- **Drop in** already works through `webUtils.getPathForFile` (Technical guide section 4).
- **Drag out** to Finder or another app: `webContents.startDrag({ file | files, icon })`. Source: https://github.com/electron/electron/blob/main/docs/api/web-contents.md.
- **Quick Look:** `win.previewFile(path, displayName)` opens the system Quick Look panel on macOS. Source: https://github.com/electron/electron/blob/main/docs/api/browser-window.md. macOS reads PSDs natively: ImageIO lists `com.adobe.photoshop-image` among its readable types (measured with `CGImageSourceCopyTypeIdentifiers`).
- **Spotlight:** Core Spotlight is an app-owned, on-device index ("The indexes you create using Core Spotlight remain on device, and are private to the owner of the device"). Source: https://developer.apple.com/documentation/corespotlight. Electron has no API for it. Whether a helper tool inside the bundle can index on the app's behalf is **Unverified**; a Node native addon in the main process can call it (Electron documents Swift addons through an Objective-C++ bridge: https://github.com/electron/electron/blob/main/docs/tutorial/native-code-and-electron-swift-macos.md).
- **Quick Look and thumbnail extensions** (`QLPreviewingController`, `QLThumbnailProvider`) are app extensions. Sources: https://developer.apple.com/documentation/quicklook/qlpreviewingcontroller, https://developer.apple.com/documentation/quicklookthumbnailing/qlthumbnailprovider. These are where native is clearly easier. The product rule "no Reveal in Finder for the Library" and the app-owned stash mean DesignStash has little reason to extend Finder today.

### File system, sandboxing and distribution

- **A sandboxed app can run an embedded helper tool.** Apple's article walks through embedding a command-line tool in a sandboxed app: the tool is signed with `com.apple.security.app-sandbox` and `com.apple.security.inherit`, placed in `Contents/MacOS`, and "the same basic process works for apps distributed independently using Developer ID signing". Source: https://developer.apple.com/documentation/xcode/embedding-a-helper-tool-in-a-sandboxed-app. So a sandboxed DesignStash can spawn `llama-server`. Because `llama-server` listens on 127.0.0.1, the app needs `com.apple.security.network.client` and the server `com.apple.security.network.server` (Electron lists both: https://github.com/electron/electron/blob/main/docs/tutorial/mac-app-store-submission-guide.md). Whether an inherited sandbox may bind a port is **Unverified**; a pipe or XPC transport avoids the question.
- **Electron MAS build.** "Only the MAS build of Electron can run with the App Sandbox." The MAS build disables `crashReporter` and `autoUpdater`, and helpers need the `inherit` entitlement. Source: the Electron MAS guide above.
- **App Review rules that bite either stack.** Guideline 2.4.5: Mac App Store apps "must be appropriately sandboxed"; "(iv) They may not download or install standalone apps, kexts, additional code, or resources to add functionality or significantly change the app from what we see during the review process"; "(vi) They may not present a license screen at launch, require license keys, or implement their own copy protection"; "(vii) They must use the Mac App Store to distribute updates". Source: https://developer.apple.com/app-store/review/guidelines/. Whether a multi-gigabyte model download passes (iv) is **Unverified** (a reviewer judgement). Shipping Apple's built-in model as the default sidesteps it.
- **Files outside the container.** The stash folder can live anywhere the user picks. In a sandbox the OS grants access to files from open panels and drags onto the Dock icon, and persistent access needs security-scoped bookmarks. Source: https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox. Electron's MAS build exposes this: `dialog.showOpenDialog({ securityScopedBookmarks: true })` returns `bookmarks`, and `app.startAccessingSecurityScopedResource(bookmark)` opens one. Sources: https://github.com/electron/electron/blob/main/docs/api/dialog.md, https://github.com/electron/electron/blob/main/docs/api/app.md. Whether files dropped into the window itself get a sandbox extension in Electron's MAS build is **Unverified**; the drop flow would need testing before a MAS release in either stack.
- **Notarised direct distribution** (today's path): every executable must be signed with a Developer ID certificate, have the Hardened Runtime enabled, carry a secure timestamp, and not carry `get-task-allow`. Source: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution. A Swift helper is signed the same way as the `llama-server` binary already staged by `scripts/stage-llama-server.mjs`.

### On-device AI

- **Apple Foundation Models now takes images.** The framework's June 2026 notes: "Perform image analysis tasks by including an image in your prompt and using tools the Vision framework provides, like OCRTool and BarcodeReaderTool", and the on-device model changes with macOS 27. Source: https://developer.apple.com/documentation/updates/foundationmodels. Image attachments (`Attachment(imageURL:)`, `CGImage`, `CIImage`, `CVPixelBuffer`) are macOS 27.0+, and "the framework performs the necessary scaling and color conversions". Sources: https://developer.apple.com/documentation/foundationmodels/imageattachmentcontent, https://developer.apple.com/documentation/foundationmodels/analyzing-images-with-multimodal-prompting. It needs a device that supports Apple Intelligence (https://developer.apple.com/documentation/foundationmodels). The same notes add `MLXLanguageModel` and `CoreAILanguageModel` adapters and a Python SDK (March 2026).
- **Measured on 10 real covers** (every fourth item of the eval's `preview.jpg` set, greedy sampling, a short plain-text prompt; the eval was not run and nothing was scored against `gold.json`): `availability: available`; 1.2 to 2.1 s per cover; 45 MB peak RSS for the CLI (the model runs in a system process whose memory I did not measure). Sample answers:
  - free-2-id-cards-mockup: "id card. Two white ID cards with colorful lanyards. Tags: id card, lanyard, badge".
  - free-craft-cup-mockup: "cup mockup. A white disposable coffee cup with a gray lid. Tags: cup, mockup, coffee".
  - m003t1513-c-long-scroll-macbook: "laptop with blue grid pattern. a laptop with a blue grid pattern extends across a dark surface".
  - qubus-eu: "tape mockup. A roll of white tape with black text on a gray surface".
  It names objects well and still says "mockup" (which `parseResult` already strips). For comparison, `design/specs/ai.md` measured Qwen 3B at 3.6 to 4.3 s and 7B at 5.5 to 6.8 s per cover with the full prompt. Whether its search score matches the shipped Qwen prompt is **Unverified** until it runs through `scripts/ai-eval/`.
- **Calling it needs Swift.** The `@Generable` macros need Xcode's macro plugin (the Command Line Tools build failed on them), so the spike used plain text; a helper built with Xcode can use guided generation or `DynamicGenerationSchema`. The framework is reachable from Electron only through a native helper or addon.
- **Vision OCR, measured.** `VNRecognizeTextRequest` (accurate) on a 1024 px cover took 25 to 78 ms warm and about 220 ms on the first call in a process; the very first run after a while took 32.7 s (likely the system loading its text models; cause **Unverified**). On the Boho MacBook cover it read "eplace Design Using / Laptop / mockup / High Resolution / 300dpi", exactly the printed filler the prompt research wants removed (`design/research/vlm-prompting-2.md`, item 11).
- **Image similarity.** `VNGenerateImageFeaturePrintRequest` returns feature prints for comparing images. Source: https://developer.apple.com/documentation/vision/vngenerateimagefeatureprintrequest. That fits the Roadmap's "Sort against the existing library" idea and the unused `embeddings` table.
- **Other runtimes.** MLX Swift's VLM factory registers `qwen2_5_vl`, `qwen3_vl`, `gemma3`, `gemma4`, `smolvlm`, `fastvlm` and more. Source: https://github.com/ml-explore/mlx-swift-lm/blob/main/Libraries/MLXVLM/VLMModelFactory.swift. llama.cpp treats Apple silicon as "a first-class citizen" with Metal and ships an XCFramework build. Source: https://github.com/ggml-org/llama.cpp/blob/master/README.md. Both work from a Swift helper as well as from a native app, so neither argues for a rewrite.

### Image and PSD performance

Measured on three test-set PSDs (49 MB, 141 MB, 31 MB):

| File | ImageIO 1024 thumbnail | ImageIO full decode | `ag-psd` composite | `sharp` 1024 WebP |
| --- | --- | --- | --- | --- |
| Macbook-Mockup-on-Rocks (3000 x 2000) | 27 ms | 23 ms | 40 ms | 50 ms |
| M003T1513 B long scroll (4000 x 3000) | 54 ms | 51 ms | 74 ms | 65 ms |
| M003T1514 C long scroll (4000 x 3000) | 44 ms | 39 ms | 52 ms | 37 ms |

- Node's peak RSS reached 865 MB because `embedded.ts` reads the whole file into memory; ImageIO's whole run peaked at 325 MB. If very large PSDs ever cause memory pressure, the fix is streaming the composite in the existing code or asking the helper for an ImageIO thumbnail.
- **PSD layers.** ImageIO exposes only the flattened composite (`CGImageSourceGetCount` returned 1 for a layered PSD). Apple has no public API for PSD layers, smart objects or warps, so a native app would still need a PSD parser for the editor. `ag-psd` already reads layers. Swift options for layer parsing were not researched further here; section E of the brief covers parsers.

### The far-roadmap mockup editor

- **Core Image** on this Mac offers 22 blend-mode filters (including Linear Burn, Linear Dodge, Vivid Light, Pin Light, Linear Light, Divide and Subtract), `CIPerspectiveTransform`, and `CIDisplacementDistortion` (listed with `CIFilter.filterNames(inCategory:)`, measured). There is no built-in mesh or bezier warp; that needs a custom kernel or a Metal mesh.
- **Chromium** gives CSS and canvas the 16 W3C blend modes (normal, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion, hue, saturation, color, luminosity). Source: https://www.w3.org/TR/compositing-1/. Photoshop's extra modes would be shader code. WebGPU ships in Chrome since 113 on macOS (MDN BCD: https://github.com/mdn/browser-compat-data/blob/main/api/GPU.json), and Electron 42 runs Chromium 148.
- Whether Core Image's or the W3C formulas match Photoshop pixel for pixel (soft light in particular) is **Unverified**. Mesh warps, smart filters and displacement maps are custom GPU work in both stacks, so the editor is roughly equal effort either way, with Core Image ahead on ready-made blend modes. A Swift helper could do a full-resolution export render with Core Image while the in-app preview stays in WebGPU.

### Design fidelity with Figma and Tailwind tokens

- The pipeline (Technical guide section 7) turns `tokens.json` and `components.json` into CSS variables, Tailwind theme tokens and TypeScript contracts, checked by `pnpm ds:check` and a drift test. A SwiftUI rewrite would need a new generator (tokens to Swift colours, fonts and spacing; contracts to SwiftUI view APIs) and a new drift check.
- The approved card corners (B5) use `corner-shape: superellipse()`. Chrome supports `corner-shape` from 139; Safari and Firefox only in preview. Source: https://github.com/mdn/browser-compat-data/blob/main/css/properties/corner-shape.json. Electron 42 (Chromium 148) can ship B5; Tauri on WKWebView cannot yet. SwiftUI draws squircles natively with `RoundedCornerStyle.continuous` ("Continuous curvature rounded rect corners", https://developer.apple.com/documentation/swiftui/roundedcornerstyle/continuous), though its curve is Apple's, so matching Figma's 60% smoothing exactly is **Unverified**.
- The details sidebar motion uses the View Transitions API (Chrome 111+, Safari 18+, MDN BCD `api/Document.json`). SwiftUI has its own transition system, so every motion spec (B7, M1 v3) would be re-implemented.

### Development speed and the cost of rewriting

Estimates are engineer-weeks for one experienced developer in the target stack, from the inventory above. They are judgement calls. Agents built the current code quickly, but that pace depended on the TypeScript stack and the Figma pipeline; agent speed on SwiftUI for this codebase is **Unverified**.

| Work | Native SwiftUI/AppKit | Tauri 2 (keep React UI) |
| --- | --- | --- |
| Data layer: SQLite + FTS5, 12 migrations, repositories | 1.5 | 1 |
| Import: scanner, zip reading (no Apple zip API; needs a library), copy queue with hashing, pause/resume | 1.5 | 1.5 |
| Library services: piles, trash, stash move with SQLite backup, stash check | 1.5 | 1.5 |
| PSD covers and images (ImageIO in native; Rust image crates in Tauri) | 0.5 | 1 |
| AI runtime (Foundation Models or llama.cpp; downloads, queue) | 1 | 0.5 (sidecar as today) |
| IPC contracts (gone in native; Rust commands with typed bindings in Tauri) | 0 | 1 |
| UI: 83 components, 12 screen areas, motion, overlay scrollbar, view transitions | 5 to 7 | 0.5 (WebKit differences) |
| Design pipeline: new generator and drift check | 1 | 0 |
| Tests: port 2,989 unit tests and 11 e2e specs (XCTest/XCUITest; Rust tests) | 2.5 to 4 | 1.5 to 2 |
| Packaging, signing, sandbox and bookmarks | 0.5 | 0.5 |
| Re-QA every screen against Figma | 1 | 0.5 |
| **Total** | **about 14 to 20** | **about 6 to 9** (rounded up for the Rust learning curve) |

Every week of rewrite is a week with no product progress (the Roadmap has fixes, D2 work and Phase 2 fonts waiting). The helper path costs about 1 to 2 weeks: a Swift package with three subcommands (`ocr`, `describe`, `featureprint`) speaking JSON over stdin/stdout, signing in `stage-llama-server.mjs`'s style, a zod contract for its output, a provider behind the existing `VisionInferenceProvider` interface, and stub-based unit tests like the rest of `src/main/ai/`.

### The middle paths

- **Electron plus a Swift helper (recommended).** Same process model as `llama-server`: spawned by main, typed and validated output, nothing added to the preload. Fits the sandbox rules (embedded helper with `inherit`) and notarisation. Gives Vision OCR, Foundation Models image input, feature prints and, if wanted later, ImageIO thumbnails or a Core Image export render.
- **Move only the main process to Swift.** Keeps Chromium (so none of the memory or size gain) and still rewrites 8,900 lines of main plus 12,900 lines of its tests, and the zod IPC contract becomes a cross-language one. All of the cost and little of the benefit.
- **Tauri 2.** Uses WKWebView on macOS (https://github.com/tauri-apps/tauri/blob/dev/README.md), bundles helpers as `externalBin` sidecars (https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/develop/sidecar.mdx) and documents a Mac App Store path with the sandbox entitlement (https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/distribute/app-store.mdx). It would drop most of the 118 MB framework download, but costs a Rust main process, loses `corner-shape`, moves rendering to a different engine than the one Figma screens were checked in, and gains no Apple API access that a Swift helper does not already give.

### Comparable apps

- **1Password 8** wanted to "Reduce the number of frontend languages and toolkits", "Support as many versions of macOS as possible" and "Create an app that looked and felt at home on macOS", found those "at odds with each other", and planned "two Mac apps. One written in SwiftUI that targeted the latest operating systems and another using web UI that allowed us to cover older OSes", over a shared Rust core. Source: https://1password.com/blog/1password-8-the-story-so-far. Their driver was many platforms; DesignStash targets one (Apple Silicon Mac), which is the strongest argument for native and is noted under "What would change this".
- **On this Mac**, the design and productivity tools split both ways: Figma, Notion, Obsidian, VS Code, Granola and Claude are Electron; Affinity, Bear and Raycast are native (bundle check for `Electron Framework.framework`). Figma, the tool these users live in, ships its desktop app on Electron.
- **Eagle** (eagle.cool), the closest asset-manager competitor, is widely described as Electron-based; its site does not say so, so this is **Unverified**. Microsoft's Teams architecture post could not be fetched and is left out.

## What would change this recommendation

Rewrite natively (or revisit) if one of these becomes true:

1. **Deep macOS integration becomes core to the product:** Spotlight search of the stash, Quick Look or thumbnail extensions, a Share extension, Finder or Photos integration. These are app extensions and per-app indexes that Electron reaches only through native addons or hand-built extension targets (**Unverified** effort).
2. **Phase 2 fonts needs system font activation** (Core Text font registration, in-place font previews across apps). Font tools lean on Core Text; doing this from a helper process versus the app itself was not researched (**Unverified**).
3. **The Mac App Store becomes the main channel and Electron's MAS build fails review or the drop flow loses file access in the sandbox.** Test a MAS build early if that channel matters; most of the review risk (model downloads, licence keys) is the same for native.
4. **Real users on 8 GB Macs hit memory pressure with the Apple model in use**, where the Electron shell becomes a larger share of the budget. Measure the real app's footprint with a full library first.
5. **The editor needs Photoshop-exact rendering that WebGPU cannot reach** after a prototype. Try a Swift helper render before considering a rewrite.

If none of these happens, the rewrite buys about 65 MB of idle memory and about 100 MB of download for 14 to 20 weeks of work.

## Suggested next steps

1. Build the Swift helper's `describe` subcommand and add an `apple` prompt version to `scripts/ai-eval/` so Apple's model is scored on the 39 covers and 73 searches against the shipped Qwen prompt.
2. Add `ocr` and wire the printed-text filter from `vlm-prompting-2.md` item 11.
3. Measure the real app's idle and import footprint once (Activity Monitor or `footprint`), so the memory row above has a number for DesignStash itself.
4. If the Mac App Store matters, make one MAS build of the current app with the helper and `llama-server` as inherited-sandbox tools and check drops, the stash folder bookmark and the localhost server.

## Measurement scripts

Kept in the session scratchpad and left out of the repo: `bench/psdbench.swift` (ImageIO and Vision timings), `bench/agbench.mjs` (`ag-psd` and `sharp` timings with the repo's packages), `bench/ehello/` and `bench/swhello.swift` (blank-window memory), `bench/fmvision.swift` (Foundation Models image test), `bench/ci.swift` (Core Image filter list). The core of the Foundation Models call, for whoever builds the helper:

```swift
import FoundationModels

let session = LanguageModelSession(instructions: "You write library metadata for a designer's collection of product mockups.")
let reply = try await session.respond(options: GenerationOptions(samplingMode: .greedy)) {
  "Describe this mockup cover in three lines: Title, Description, Tags."
  Attachment(imageURL: coverURL)
}
```
