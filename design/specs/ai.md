# AI: vision runtime

**Status:** decided and built 2026-10-20 (WP4.1). The catalogue and downloads are WP4.2. The models changed on 2026-10-22 after the AI bake-off (see "The catalogue").
**Code:** `src/main/ai/llama-server.ts`, `vision-provider.ts`, `provider-factory.ts`, `registry.ts`, `prompts/`; `scripts/fetch-llama-server.mjs`.

## The catalogue

**Since 2026-10-22,** after the AI bake-off (Research hub, "AI bake-off"; the candidates are in `design/research/vlm-models.md`). Every number below is from the bake-off: the shipped request, three passes over the 39 test-set mockups, on an M3 Max.

| Model | Id | Tier | Card | Measured |
|---|---|---|---|---|
| Qwen3-VL 4B Instruct | `qwen3-vl-4b` | medium, Best fit on every Mac | quality 4, speed 4, 8 GB | 5.1% of answers hallucinated (16.2% for Qwen 2.5 VL 3B), 3.6 s per mockup, 4.4 GB after the first answer, 2.95 GB download |
| Qwen3.5 9B, thinking off | `qwen3.5-9b` | large, 16 GB and more | quality 5, speed 3, 16 GB | 6.0% hallucinated, the most searches found, 10.1 s per mockup, 6.9 GB, 6.60 GB download |
| Apple's on-device model | `apple` | built in | quality 3, speed 5, 8 GB | 2.8% hallucinated, thinner wording, 2.5 s per mockup, nothing to download; macOS 27 with Apple Intelligence |

- **Files:** Qwen3-VL 4B is `Qwen/Qwen3-VL-4B-Instruct-GGUF` (Q4_K_M and the Q8_0 mmproj); Qwen3.5 9B is `unsloth/Qwen3.5-9B-GGUF` (Q4_K_M and `mmproj-F16.gguf`). The sha256 values in `registry.ts` match the downloaded files (`shasum -a 256`, 2026-10-22).
- **Qwen 2.5 VL 3B and 7B are gone.** The 3B's licence is non-commercial, and both did worse on every measure. An active model the catalogue no longer has reads as no model chosen at launch (`forgetRemovedModel`); its folder stays on disk and is listed as an old model the person can delete.
- **Apple's model is offered only where it runs.** `AI_LIST_MODELS` asks the helper's `info` (cached 5 minutes, `apple-availability.ts`) and lists the `apple` entry with `builtIn: true` and `installed: true` only when Foundation Models is available. Onboarding shows it as a third row ("Built in"), Settings under "Built into macOS", with no Delete. Qwen3-VL 4B stays the recommended pick. End-to-end runs (the stub provider) never ask the real helper.
- **One prompt per model.** `src/main/ai/prompts/` has a module per model id (`qwen3-vl-4b.ts`, `qwen3.5-9b.ts`, `apple.ts`), each a `PromptProfile` (`buildRequest`, `parseResult`, `sceneThings`), and each catalogue entry names its profile. Since 2026-10-22 they hold the tuned prompts (below, "Tuned per model"). `ChatRequest` carries `temperature`, `top_p`, `top_k`, `min_p`, `repeat_penalty`, `presence_penalty`, `seed` and `max_tokens`. For Apple, `appleDescribeRequest` turns the profile's request into a helper `describe` (instructions, prompt, schema without patterns, reply cap); the helper is greedy, so sampling settings don't apply.
- **Server flags** (`MODEL_SERVER_ARGS`): `--cache-ram 0` for every model, and `--reasoning off` for Qwen3.5 9B. llama-server's host prompt cache defaults to 8 GB and grew the server to 10 to 12 GB over long bake-off runs; we send one image per request, so it never helps. The slot's own KV cache still reuses the system prompt.

## What the model sees

**Tuned 2026-10-21 on the real test set** (39 mockups, both models, nine prompt versions). The full record, with every version, score and answer, is the review page "Mockup AI Tuning" (https://claude.ai/artifact/49CAgBduzsuKVAg9g66hLH); the harness is `scripts/ai-eval/` (`pnpm ai-eval:covers`, `ai-eval:run`, `ai-eval:score`), and the research behind it is `design/research/vlm-prompting.md` and `vlm-prompting-2.md`.

- **The cover goes first,** then the file name and folders. The image says what the mockup is; the names supply a product name (MacBook, iPhone 16) when the image shows that kind of product. For the rest of a pile, the first variant's title, description and tags are added.
- **A near-blank cover is sent as no image.** Some free PSDs embed a "Remove this layer to start" notice as their preview. Shown that, both models described the notice. Below a greyscale entropy of 1 (`PLACEHOLDER_ENTROPY`; the notices score about 0.23, the plainest real cover 2.24) the model gets the names only and is told to leave the setting out.
- **The prompt is written for search:** a designer finds the mockup later by typing a few words. The description is one natural sentence that names the object and one or two other words people use for it ("a tote bag, also called a shopping bag").
- **The only worked examples describe a bicycle.** Both models copy example strings into their answers (the 3B used an example title for unrelated covers; the 7B pasted the tote bag example into MacBook descriptions). Examples from outside the library make a copy harmless.
- **Printed words are template filler.** The prompt says so, but Qwen 2.5 VL quotes printed text anyway, so `parseResult` cuts quoted text with the words around it, drops a sentence that only reports printed text, removes "mockup" a phrase at a time, takes "free", "mockup", "PSD" and stock-site names out of titles and tags, and shortens at a word.
- **The grammar keeps title, description and labels to plain ASCII,** which stopped the 3B leaking Chinese characters into English text. `repeat_penalty` is 1.05, Qwen's own setting (the 7B once wrote "phone" thirty times).

The reply is `{title, description, tags:[{category, label}]}`:

- **Title:** at most 60 characters. **Description:** one sentence, at most 200. The grammar allows a little more and `parseResult` trims at a word.
- **Tags:** 3 to 6. The category must be one of the seed categories minus **Angle**: both models got the camera angle wrong about half the time (the 7B said Side on 21 of 39), it was half of the 7B's wrong tags, and no search uses it. People can still add Angle tags by hand.
- **Each category line has a few example labels,** not the seed list. With no examples the tags drifted into moods (Style: Futuristic) and Device filled with "Screen"; with the full seed list the models copied it in order.

**Results, same 73 searches through the app's search** (found: share of searches that return the mockup; clean: share of results that are right):

| | 3B found / clean | 7B found / clean |
|---|---|---|
| v0, the prompt before tuning | 46% / 55% | 55% / 60% |
| v4, the best single run | 49% / 58% | 70% / 76% |
| v7, shipped (single pass) | 51% / 59% | 63% / 69% |

Single passes vary by several points, so the v4 and v7 numbers were also measured over three passes each (see the review page). Things that were tried and dropped: a describe-first "seen" field (no gain on 3B, small and costly on 7B), a hidden keywords field (about one point either way, and it took other names out of the 7B's descriptions), and removing all examples (generic answers).

**Known limits:** the long-scroll MacBooks read as "flexible" or "curved" laptops on both models; the 7B sees a cosmic sky behind the iPhone 15 on dark sand; the 3B misreads stacked boxes as signs or books. The search also changed: a hyphenated word searches as a phrase and a plural finds the singular (`ftsMatchQuery`).

## Tuned per model (shipped 2026-10-22)

The per-model tuning ran after the bake-off (Research hub, AI tab, "Tuning: targets and progress"; versions in `scripts/ai-eval/prompts/`). What shipped, ported into `src/main/ai/prompts/` (`request.ts` holds the spec, `requestFrom` builds it):

- **Qwen3-VL 4B and Qwen3.5 9B:** the shipped prompt plus the **names-only rules** (`NAMES_ONLY`, eval q9-2 and ck-2). For a placeholder cover the model has only the names, and with the old rules it invented a setting and colours (an iMac "on a clean desk in soft light"). Now the description sticks to the object and its other names, with no colours, light, setting or surface, and the schema allows 1 to 6 tags. The 4B's own rewrites (q4-1 to q4-4) scored no better.
- **Apple:** the same, plus ap-3's names rule: the names often say the mockup type or product, so it uses those words when the image fits.
- **The scene-thing check, all three models** (`scene-check.ts`, eval ck-2 and ap-6). Models add things that usually go with the object: a desk under a floating iMac, a plant beside a mug. After the answer, each word from a fixed list (desk, table, chair, shelf, plate, plant, hand, person and the rest) that it mentions is asked about on the same image as a yes/no question. For llama-server it is one greedy token held to `yes|no` by a grammar, with logprobs: P(yes) = yes/(yes+no), and under 0.2 the phrase comes out of the title and description, and its tag. Apple's model gives no logprobs, so it answers through a `{answer: enum[yes, no]}` schema and a "no" removes the thing. Only things that could be placed in the scene are listed: attributes ("leather") and adjectives ("floating") misfired in ck-1. It caught every invented desk on the held-out and sign-off sets at no measurable time cost. Names-only answers aren't checked (there is no image to ask about), and a check that fails keeps the thing.

## Runtime decision: llama-server

- **node-llama-cpp can't take images.** The newest release (3.22.2, 2026-10-17, llama.cpp `v0.7.0`) has no image or mmproj API; its native addon doesn't include llama.cpp's `mtmd` library. So there's no upgrade, and `package.json` is unchanged.
- **llama.cpp's `llama-server` runs as a child of the main process,** with `--model <gguf> --mmproj <mmproj>`. The pinned release is `b11748` (macOS arm64, sha256 `003af132…3afb` as GitHub publishes it).
  - It listens on 127.0.0.1 on a free port, with `--parallel 1`, `--ctx-size 8192` and `--no-webui`.
  - It starts on the first request and waits for `/health` (503 while loading, 200 when ready). It stops after 5 minutes without a request, and the next request starts it again. A crash is handled the same way: the next request starts a new one.
  - **One server at a time:** switching the active model stops the previous server.
  - **On app quit** it's killed from `process.on('exit')`. On stop it gets SIGTERM, then SIGKILL after 5 s.
  - Requests go to the OpenAI-compatible `/v1/chat/completions`: the image as a base64 `image_url`, and `response_format: {type: 'json_schema'}`.
- **Covers are resized for the model:** stored covers are 2048 px WebP, and the provider scales them to fit 1024 px and re-encodes as JPEG (sharp). llama.cpp `b11748` decodes WebP too, but on SmolVLM2 the smaller image took the prompt from 1,780 to 610 tokens and the time from 6.3 s to 2.5 s.
- **Per-model server flags:** `MODEL_SERVER_ARGS` in `provider-factory.ts` (see "The catalogue"). During the spike, Moondream 2 needed `--no-jinja --chat-template vicuna`, because its own template drops the image marker and every image request fails with "Failed to tokenize prompt".
- **Where the binary is found:**
  1. `DESIGNSTASH_LLAMA_SERVER`, if set;
  2. the bundled copy, `<resourcesPath>/llama-server/llama-server` (planned);
  3. the development copy, which `node scripts/fetch-llama-server.mjs` puts at `~/Library/Application Support/DesignStash-dev/llama-server/current/llama-server`.

  With no binary there's no provider, so the queue marks suggestions off.
- **Model files** live at `<modelsDir>/<id>/model.gguf` and `mmproj.gguf`, as agreed with WP4.2. A folder without an mmproj (an old text model) gets no provider.

## Spike results

**Setup:** an M3 Max with 36 GB, llama-server `b11748`, `--ctx-size 8192`, and the final prompt.

**Covers:** three from `dev-fixtures/psd`, made with the app's own cover pipeline:

- a MacBook on white steps with a wavy blue screen (clean);
- a cotton tote bag on dark grey;
- a snack pouch on dark grey.

The last two have a large MockupFree.co watermark over a dimmed product, which is common in free mockups.

**How it was measured:** each model ran once per cover.

- Load is a one-token request on a warm disk cache. The first load from a cold disk took 8 to 14 s: SmolVLM2 10.5 s, Qwen 3B 8.1 s, Qwen 7B 13.6 s.
- Memory is the server's resident size after one image request. Activity Monitor's footprint is lower, because it leaves out the mapped model weights.

**Files:** all from ggml-org on Hugging Face, `https://huggingface.co/<repo>/resolve/main/<file>`. The sha256 values are the LFS object ids, and every download matched.

| Model | Repo | Model file | mmproj file | Total |
|---|---|---|---|---|
| SmolVLM2 2.2B | `ggml-org/SmolVLM2-2.2B-Instruct-GGUF` | `SmolVLM2-2.2B-Instruct-Q4_K_M.gguf` 1,112,602,656 B | `mmproj-SmolVLM2-2.2B-Instruct-Q8_0.gguf` 592,523,200 B | 1.71 GB |
| Qwen 2.5 VL 3B | `ggml-org/Qwen2.5-VL-3B-Instruct-GGUF` | `Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf` 1,929,901,056 B | `mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf` 844,757,728 B | 2.77 GB |
| Qwen 2.5 VL 7B | `ggml-org/Qwen2.5-VL-7B-Instruct-GGUF` | `Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf` 4,683,072,032 B | `mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf` 853,119,712 B | 5.54 GB |
| Moondream 2 | `ggml-org/moondream2-20250414-GGUF` | `moondream2-text-model-f16_ct-vicuna.gguf` 2,839,535,072 B | `moondream2-mmproj-f16-20250414.gguf` 909,777,984 B | 3.75 GB |

**sha256:**

- **SmolVLM2:**
  - model `0cf76814555b8665149075b74ab6b5c1d428ea1d3d01c1918c12012e8d7c9f58`
  - mmproj `ae07ea1facd07dd3230c4483b63e8cda96c6944ad2481f33d531f79e892dd024`
- **Qwen 3B:**
  - model `d02fe9b69ad8cadbbd228e387667af66612c44bed29ffc8eb1e7caf9ac486c12`
  - mmproj `980c9b2f78c04e6cff93d277ada09e768394f112d75db3b4e9dea8a69f9fb904`
- **Qwen 7B:**
  - model `9258bf05b12686d097ff3b6b18d968ab393649780aa2b3cd67fec43d50554392`
  - mmproj `2ddb555391bae966e412deab9e07b58afa18bcc06930ba0f1c78a3695ab9e506`
- **Moondream 2:**
  - model `925bcb666baf69ed747e26121af287b16ae7764483be9548b1382f29783689a5`
  - mmproj `4cc1cb3660d87ff56432ebeb7884ad35d67c48c7b9f6b2856f305e39c38eed8f`

| Model | Works | Load (warm disk) | Time per cover | Memory | JSON quality |
|---|---|---|---|---|---|
| SmolVLM2 2.2B | Yes | 1.3 s | 2.4 to 3.1 s | about 3.8 GB | Poor. Always valid JSON, but on the watermarked covers the title is the file name ("free_cotton_shopping_bag_mockup_psd_01"), and it pads tags into the wrong categories (Apparel: snack-packaging, Angle: snack-packaging, Device: laptop on a tote bag). On the clean cover it's fair: "scroll macbook mockup". |
| Qwen 2.5 VL 3B | Yes | 1.8 s | 3.6 to 4.3 s | about 3.5 GB | Good. It reads the image through the watermark: "Tote bag displayed on a black background", "Snack bag, top-down", "MacBook with long scroll", with sensible tags (macbook, flat-lay, minimal, side). It sometimes puts a tag in the wrong category, like Device: tote-bag or Device: monitor on the pouch. |
| Qwen 2.5 VL 7B | Yes | 3.1 s | 5.5 to 6.8 s | about 6.3 GB | Best. "Shopping bag, front view", "Snack packaging, dark background", "scrolling macbook on a curved surface", and descriptions that notice detail ("diagonal stripes", "straps"). Its categories are right, and it gives fewer filler tags. |
| Moondream 2 | Only with `--no-jinja --chat-template vicuna` | 2.3 s | 2.3 to 3.8 s | about 5.8 GB | Unusable with this prompt. It ignores the image and copies the file name into the title and every tag ("free-cotton-shopping-bag-mockup-psd-01.psd"); one reply ran out before the JSON closed. On a plain "Describe this image" it captions well, so the long structured prompt is too much for it. |

**Without a cover,** from names alone, every model gives a plausible title from the file name ("scroll Macbook Mockup") and generic tags. So a missing cover degrades gracefully.

## For WP4.2 (catalogue)

Superseded on 2026-10-22 by "The catalogue"; kept as the record of the first choice.

- **Moondream 2:**
  - Compatible files exist at `ggml-org/moondream2-20250414-GGUF`. The registry currently points at `moondream/moondream2-gguf`, which wasn't tested here.
  - The runtime flags are handled.
  - The quality isn't there, so keep it hidden (`pending`), or drop it.
- **SmolVLM2 2.2B** works and is the fastest, but it's the weakest at reading the image. Suggested ratings: quality 2, speed 5.
- **Qwen 2.5 VL 3B** is the right default. Suggested ratings: quality 4, speed 4.
- **Qwen 2.5 VL 7B** is the best and is 1.5 to 1.7 times slower than 3B. Suggested ratings: quality 5, speed 3. Its memory use fits the 16 GB+ rule.
- **Sizes for the UI:** the Total column above, model and mmproj together.

## Apple on-device helper

**Status:** built 2026-10-22 and turned on the same day: Apple's model is the catalogue's `apple` entry, and the helper ships in `<resources>/helper/`. How Vision feeds the pipeline (OCR filter, evidence, similarity) is still open.
**Code:** `native/designstash-helper/` (Swift, protocol in its README), `src/main/native/helper.ts` and `helper-schemas.ts`, `src/main/ai/apple-provider.ts`; `scripts/build-helper.mjs`, `scripts/helper-try.ts`. The research is `design/research/native-vs-electron.md` and `vlm-pipeline-helpers.md`.

- **One Swift command-line tool, `designstash-helper`,** runs as a child of the main process like llama-server: one JSON request per stdin line, one JSON reply per stdout line, matched by `id`, logs on stderr. arm64, macOS 26 and later; Foundation Models only on macOS 27. It builds with the Command Line Tools (`pnpm helper:build`), because guided generation uses `DynamicGenerationSchema` and no `@Generable` macro.
- **Commands:**
  - `info`: OS, Vision request revisions, Foundation Models availability (or why not: `notMacOS27`, `appleIntelligenceNotEnabled`, `deviceNotEligible`, `modelNotReady`).
  - `ocr`: `accurate` with language correction on the 2048 px cover by default.
  - `people`: people and hands above 0.3 confidence, with boxes.
  - `featureprint`: base64 Float32 plus its revision; prints are compared only within a revision.
  - `classify`: Vision's fixed 1,303-label taxonomy.
  - `describe`: Foundation Models with the image attached, greedy; with a schema the reply is JSON in that shape.
- **Boxes are top-left origin,** fractions of the image. The eval's `vision.json` (from `scripts/ai-eval/apple/vision.swift`) kept Vision's bottom-left origin.
- **The client** (`NativeHelper`) finds the binary at `DESIGNSTASH_HELPER`, then `<resources>/helper/designstash-helper`, then `~/Library/Application Support/DesignStash-dev/helper/designstash-helper`. With none, calls fail as `unavailable` and nothing crashes. It starts the helper on first use, stops it after 5 minutes idle, starts a fresh one after a crash, sends one call at a time and kills a call that hangs: 60 s for Vision (the very first OCR on this Mac took 35 s while the system loaded its text models; after that 0.1 to 0.4 s), 2 minutes for `describe`.
- **`AppleInferenceProvider`** sends its prompt profile's (`prompts/apple.ts`) system prompt, user text, schema and reply cap through `describe`, attaches the cover file (the framework scales it), sends a placeholder cover as names only, and parses with the profile. The provider factory builds it for the `apple` entry, over the runtime's one `NativeHelper`, when the helper says Foundation Models is available.
- **Packaging:** `pnpm build` runs `helper:build --stage --optional` first (a Mac whose SDK can't build it warns and carries on, and that build doesn't offer Apple's model); `pnpm package:stage` builds it strictly. `electron-builder.yml` ships `build/helper/designstash-helper` to `<resources>/helper/` with `hardenedRuntime: true`, and signing covers it whenever an identity is configured.
- **Regex guides don't work.** On macOS 27.2 the on-device model rejects every `pattern` in a dynamic schema (`UnsupportedGuide`, even for `[A-Za-z ]+`); enums and array counts work. The provider sends the schema without its ASCII patterns, which only kept the 3B from leaking Chinese characters.
- **Measured once by hand** (M3 Max, the duct tape cover): OCR 0.37 s, people 0.2 s, classify 0.1 s, feature print 0.09 s (768 floats), `describe` with the full prompt 4.8 s including the model's first load, a short plain-text answer 0.8 s.
- **Tests:** unit tests run the client and provider against a fake helper script (`src/main/native/__fixtures__/fake-helper.mjs`). `helper.integration.test.ts` runs the real binary's Vision commands when `DESIGNSTASH_HELPER_IT=1` and the helper is built; it never calls Foundation Models. Swift-side unit tests need Xcode (Swift Testing and XCTest aren't in the Command Line Tools).

## Open

- **Packaging:** the repo has no packager yet, so shipping `llama-server` (and its dylibs) with the app is unsolved. The factory already looks in `<resourcesPath>/llama-server/`.
- **Signing the helper:** `electron-builder.yml` ships it and signs it with the app's identity and the hardened runtime when one is configured, but no signed build has been made (electron-builder isn't installed in the repo yet). Check on the first one that Vision and Foundation Models work under the hardened runtime with no entitlements. A Mac App Store build would also need the inherited-sandbox entitlements.
- **Apple's model when it goes away:** if Apple Intelligence is turned off while `apple` is the active model, the list stops showing it and suggestions stop, with no message saying why. Settings then shows no model in use.
- **Base-chip speed:** the bake-off timed every model on an M3 Max; Qwen3.5 9B's 10 s per mockup will be slower on a base M1 or M2.
- **Hard crash:** if Electron is killed outright, the `exit` hook doesn't run and llama-server keeps running until it's killed. The next launch starts its own on a new port.
- **Renamed categories:** the schema limits categories to the seed six, so if someone renames "Device", suggestions recreate it. A follow-up could pass the live category list into the prompt.
- **Titles:** they sometimes come back hyphenated ("scroll-macbook-mockup"), with the label style bleeding into the title. This is minor; the user edits titles in Look it over.
- **Old text runtime:** `local-provider.ts` (text-only, node-llama-cpp) is no longer used at runtime; only `ci-guard.test.ts` imports it. A cleanup (WP9.3) can remove it and the `node-llama-cpp` dependency, updating the CI guard.
