# AI: vision runtime

**Status:** decided and built 2026-10-20 (WP4.1). The catalogue and downloads are WP4.2.
**Code:** `src/main/ai/llama-server.ts`, `vision-provider.ts`, `provider-factory.ts`; `scripts/fetch-llama-server.mjs`.

## What the model sees

The mockup's cover (the PSD's embedded preview) goes first. The file name and folder trail follow as text, marked as hints: when they disagree with the image, the image wins. For the rest of a pile, the first variant's title, description and tags are added so the suggestions stay consistent.

The reply is `{title, description, tags:[{category, label}]}`, constrained by a JSON schema:

- **Title:** at most 60 characters. **Description:** one sentence, at most 200.
- **Tags:** 3 to 6, two tiers. The category must be one of the seed categories (Device, Print & Branding, Apparel, Environment, Style, Angle), because `snapTags` matches categories exactly. Labels are free, then tidied to the seed style (lowercase, words joined by hyphens) and deduplicated.
- **The prompt describes each category** in a few words and doesn't list the seed labels. With the full label list, the small models copied it in order (a laptop tag on a tote bag) instead of looking at the image.

## Runtime decision: llama-server

- **node-llama-cpp can't take images.** The newest release (3.22.2, 2026-10-17, llama.cpp `v0.7.0`) has no image or mmproj API; its native addon doesn't include llama.cpp's `mtmd` library. So there's no upgrade, and `package.json` is unchanged.
- **llama.cpp's `llama-server` runs as a child of the main process,** with `--model <gguf> --mmproj <mmproj>`. The pinned release is `b11748` (macOS arm64, sha256 `003af132…3afb` as GitHub publishes it).
  - It listens on 127.0.0.1 on a free port, with `--parallel 1`, `--ctx-size 8192` and `--no-webui`.
  - It starts on the first request and waits for `/health` (503 while loading, 200 when ready). It stops after 5 minutes without a request, and the next request starts it again. A crash is handled the same way: the next request starts a new one.
  - **One server at a time:** switching the active model stops the previous server.
  - **On app quit** it's killed from `process.on('exit')`. On stop it gets SIGTERM, then SIGKILL after 5 s.
  - Requests go to the OpenAI-compatible `/v1/chat/completions`: the image as a base64 `image_url`, and `response_format: {type: 'json_schema'}`.
- **Covers are resized for the model:** stored covers are 2048 px WebP, and the provider scales them to fit 1024 px and re-encodes as JPEG (sharp). llama.cpp `b11748` decodes WebP too, but on SmolVLM2 the smaller image took the prompt from 1,780 to 610 tokens and the time from 6.3 s to 2.5 s.
- **Per-model server flags:** `MODEL_SERVER_ARGS` in `provider-factory.ts`. Moondream 2 needs `--no-jinja --chat-template vicuna`, because its own template drops the image marker and every image request fails with "Failed to tokenize prompt".
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

- **Moondream 2:**
  - Compatible files exist at `ggml-org/moondream2-20250414-GGUF`. The registry currently points at `moondream/moondream2-gguf`, which wasn't tested here.
  - The runtime flags are handled.
  - The quality isn't there, so keep it hidden (`pending`), or drop it.
- **SmolVLM2 2.2B** works and is the fastest, but it's the weakest at reading the image. Suggested ratings: quality 2, speed 5.
- **Qwen 2.5 VL 3B** is the right default. Suggested ratings: quality 4, speed 4.
- **Qwen 2.5 VL 7B** is the best and is 1.5 to 1.7 times slower than 3B. Suggested ratings: quality 5, speed 3. Its memory use fits the 16 GB+ rule.
- **Sizes for the UI:** the Total column above, model and mmproj together.

## Open

- **Packaging:** the repo has no packager yet, so shipping `llama-server` (and its dylibs) with the app is unsolved. The factory already looks in `<resourcesPath>/llama-server/`.
- **Hard crash:** if Electron is killed outright, the `exit` hook doesn't run and llama-server keeps running until it's killed. The next launch starts its own on a new port.
- **Renamed categories:** the schema limits categories to the seed six, so if someone renames "Device", suggestions recreate it. A follow-up could pass the live category list into the prompt.
- **Titles:** they sometimes come back hyphenated ("scroll-macbook-mockup"), with the label style bleeding into the title. This is minor; the user edits titles in Look it over.
- **Old text runtime:** `local-provider.ts` (text-only, node-llama-cpp) is no longer used at runtime; only `ci-guard.test.ts` imports it. A cleanup (WP9.3) can remove it and the `node-llama-cpp` dependency, updating the CI guard.
