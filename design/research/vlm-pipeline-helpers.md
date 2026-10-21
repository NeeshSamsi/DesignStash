# Non-generative helpers around the VLM

**Question:** which deterministic or discriminative components could replace or check the VLM's free text (title, description, tags), and can we run them inside the Electron app on Apple Silicon, offline, under a commercial licence?

**Researched:** 2026-10-21 (round 3, brief C). Builds on `design/research/vlm-prompting.md` and `vlm-prompting-2.md`, which are not repeated here. Round 2 left "OCR the cover with the macOS text recognizer" as experiment 11 with its availability from Electron unverified; this round settles that and widens the question.

**Sources read directly:** Hugging Face model cards and the Hub API (licence tags, file lists and sizes), the MobileCLIP repo and its `LICENSE_MODELS`, the SigLIP 2 paper (arXiv HTML, Table 1), the transformers `siglip2.md` doc, the transformers.js 4.3.1 package source, the onnxruntime-node README and npm metadata, Apple's Vision documentation (JSON API behind developer.apple.com), Electron's `utility-process.md`, the sqlite-vec README and npm metadata, the mac-ocr README, and arXiv abstracts. For papers I read only the abstract unless a table is quoted, so a number that would need the paper body is marked **Unverified**.

**What I ran:** a small Swift probe (not committed; it lived in the session scratchpad) that calls Apple's Vision framework, which ships with macOS, on the 39 covers in `~/Library/Application Support/DesignStash-dev/ai-eval/covers/`. No model was downloaded, llama-server was not started and the eval harness was not run. Numbers from it are labelled **measured here** (M3 Max, 36 GB, macOS 27.2). I also read `runs/qwen2.5-vl-{3b,7b}/v4/results.json` (v4 is the shipped request) and `scripts/ai-eval/gold.json`.

## Ranked experiments (short form)

| # | Experiment | Cost to try | Why this rank |
|---|---|---|---|
| 1 | **Vision helper, OCR pass:** remove printed words from the output by matching OCR text, in place of guessing from quotes | Small Swift helper, no model download | Built into macOS, about 0.1 s per cover, reads the covers well (measured here). Printed words leak into 21 of 117 3B outputs and 4 of 117 7B outputs today |
| 2 | **People and hands gate:** when Vision finds no person and no hand, drop "wrist", "hand", "held", "model" claims | Same helper, a few ms | Vision found zero hands and zero people on all 39 covers; the 7B put the clay Apple Watch "on a wrist" in 3 of 3 passes |
| 3 | **OCR object nouns as evidence** (feed "tote bag", "billboard", "envelope" to the fusion rule as name-like evidence) | Same helper plus a noun list | OCR read the right object noun on 17 of 36 real covers, and a wrong one on 2 (measured here) |
| 4 | **SigLIP 2 B/16 zero-shot tagger** over a fixed vocabulary, then the hybrid that hands those tags to the VLM | onnxruntime-node or transformers.js, a 95 to 186 MB vision model | The only shippable contrastive model that is small, permissive and has ready ONNX files. Accuracy on mockups is **Unverified**: no benchmark covers them |
| 5 | **Feature-print similarity** for "find similar" and pile grouping | Same helper, 768 floats per mockup | Same-series variants are each other's nearest neighbours on the test set (measured here) |
| 6 | **Contrastive claim checks** for scene words the VLM invents (starry sky vs dark sand, glowing vs unlit) | Needs the SigLIP 2 text tower too (283 MB int8) | Evidence that CLIP similarity flags hallucinated sentences, but attribute binding is a known CLIP weakness |
| 7 | **Open-vocabulary detector** (Grounding DINO tiny) to confirm invented objects (tape roll, folder, hook) | 204 MB int8 ONNX, slow on CPU (**Unverified** speed) | Strongest published effect (Woodpecker), highest integration cost |

The full table with how to measure each on the harness is at the end.

## 1. What Apple's Vision framework does on our covers (measured here)

All five requests below are system APIs present since macOS 10.15 (or 11 for hand pose), so there is nothing to download or license:
`VNRecognizeTextRequest` (https://developer.apple.com/documentation/vision/vnrecognizetextrequest), `VNClassifyImageRequest` (https://developer.apple.com/documentation/vision/vnclassifyimagerequest), `VNGenerateImageFeaturePrintRequest` (https://developer.apple.com/documentation/vision/vngenerateimagefeatureprintrequest), `VNDetectHumanHandPoseRequest` (https://developer.apple.com/documentation/vision/vndetecthumanhandposerequest) and `VNDetectHumanRectanglesRequest` (https://developer.apple.com/documentation/vision/vndetecthumanrectanglesrequest). Swift-native versions (`RecognizeTextRequest`, `ClassifyImageRequest`, `GenerateImageFeaturePrintRequest`) exist from macOS 15 (https://developer.apple.com/documentation/vision/recognizetextrequest), and macOS 26 adds `RecognizeDocumentsRequest` for structured documents (https://developer.apple.com/documentation/vision/recognizedocumentsrequest), which we don't need.

### Speed

| Request | Image | Median | 90th pct | First call in a fresh process |
|---|---|---|---|---|
| Text, `accurate` + language correction | 2048 px cover | 106 ms | 161 ms | 238 ms (33 s the very first time on this machine, once) |
| Text, `fast` | 2048 px cover | 16 ms | 37 ms | 40 ms |
| Text, `accurate` | 1024 px preview | 55 ms | 83 ms | 53 ms |
| Classify (1,303 labels) | 1024 px preview | 6 ms | 9 ms | 23 ms |
| Feature print (768 floats) | 1024 px preview | 4.6 ms | | |
| Hands + people | 1024 px preview | a few ms | | |

A whole pass over 39 covers with OCR four ways, classification, feature print and saliency took 9.2 s wall time, about 0.24 s per cover, with a peak resident size of 1.35 GB for the process (`/usr/bin/time -l`). An M1 or M2 base will be slower; by how much is **Unverified**, but there is a large margin under the 10 s budget.

The one-off 33 s first call happened once on this machine and not on the second run, which fits the OS compiling or caching the text model on first use. **Unverified** as the cause; the app should run OCR in the background so a first-run stall can't block the UI.

### Accuracy

- **Use `accurate` on the 2048 px cover.** `fast` mode returned garbage on most covers ("3fientlon", "8inbo•rdmockup", "liqht"), and the 1024 px preview lost small text that the 2048 px cover kept ("Billboard Mockup" on the MacBook promo panel, "envelope" on the stationery set). Costs 106 ms.
- **It reads the printed filler the models copy:** "SNACKBAR®", "DOWNLOAD FREE MOCKUP FROM LS.GRAPHICS", "Extremely flammable", "DANGER / TEHLIKE", "Bessie Cooper", "iPhone 15", "MacBook 16 Pro", stock-site names ("Is.graphics", "pixelbuddha.net"), and the whole promo text on the Pixelbuddha poster.
- **It reads the placeholder notice.** All three "Remove this layer to start" covers returned that sentence. That gives a second, exact placeholder test next to `PLACEHOLDER_ENTROPY`.
- **Long-scroll MacBooks, the iPhone 16 and the clay Apple Watch have no text at all,** so OCR adds nothing there and costs nothing either.

### Printed text in the shipped output today

Words that appear in a cover's OCR text, in the v4 output, and in neither the names nor the gold entry (so they come from the print and are wrong), per output over 3 passes:

| Model | Outputs | With such words | Examples |
|---|---|---|---|
| 3B | 117 | 21 | "danger, extremely, flammable, tehlike" (shopper bag), "presentations" (sticker), "brd, grphcs, mckp" (boxes), "recipient" (mailers), "number" (MacBook) |
| 7B | 117 | 4 | "caution" (shopper bag), "package" (mailers) |

Some print-derived words are right, and the gold also uses them: "light box", "totebag", "tote". So blind removal of every OCR word would also take out good evidence (section 4).

### Built-in classifier and feature prints

- **`VNClassifyImageRequest` is a fixed 1,303-label taxonomy** (counted with `supportedIdentifiers()`). It has `laptop`, `bag`, `paper_bag`, `envelope`, `cup`, `mug`, `watch`, `billboards`, `sign`, `banner`, `book`, `baseball_hat`, `hoodie`, and no `tote_bag`, `poster`, `sticker`, `tape`, `business_card`, `packaging` or `smartwatch`. On the covers it was right where the object is common (laptop 0.65 to 0.86 on the four ordinary MacBooks, bag on the tote bags, watch on the realistic Apple Watch, billboards on the roadside banner) and wrong on the hard ones in the same way the VLM is: the long-scroll MacBooks read as `furniture`, `seat` and once `armchair`, the tape rolls as `cup` and `coffee`, the stacked boxes as `document` and `sticky_note`. It's a weak, free signal; it can't fix the cases we care most about.
- **Feature prints group series well.** Each long-scroll MacBook's nearest neighbour is another long-scroll MacBook (distance 0.41 to 0.56), the four tote bags pair with each other (0.49 to 0.70), the two stationery sets are 0.22 apart, the two box covers 0.66, the tapes 0.68 to 0.71, the billboards 0.71. Unrelated nearest neighbours are mostly above 0.8. The three placeholder covers cluster at 0.39 to 0.41, so grouping must skip placeholders, as the cover path already does. Only feature prints of the same revision can be compared, so store the revision with the vector and recompute after an OS change that bumps it (`VNGenerateImageFeaturePrintRequest.supportedRevisions` lists them; the comparison rule follows from `VNFeaturePrintObservation.computeDistance` working on two observations of one type, https://developer.apple.com/documentation/vision/vnfeatureprintobservation; **Unverified** whether Apple has ever bumped it in a minor release).
- **People and hands:** 0 hands and 0 people above 0.3 confidence on all 39 covers. The 7B's three v4 passes on `apple-watch-ultra-lay-psd` all mention a wrist or hand. The test set has no cover with a real hand, so the detector's recall on mockups (a hand holding a phone) is **Unverified**; add two or three such covers before relying on it.

## 2. Contrastive image-text models

### Which ones we may ship

| Model | Licence of the weights | Image tower | ImageNet zero-shot | ONNX ready |
|---|---|---|---|---|
| **SigLIP 2 B/16 224** | Apache 2.0 (https://huggingface.co/google/siglip2-base-patch16-224) | 86M | 78.2% | Yes: `onnx-community/siglip2-base-patch16-224-ONNX` |
| SigLIP 2 B/16 256, 384; L; So400m | Apache 2.0 | 86M to 400M | 79.1%, 80.6% (B at 256, 384) | Some variants |
| Perception Encoder Core B/16 224 | Apache 2.0 (https://huggingface.co/facebook/PE-Core-B16-224) | 0.09B, text 0.31B | 78.4% | No; needs its own export from `perception_models` |
| OpenCLIP ViT-B/32 (LAION-2B, DataComp) | MIT (https://huggingface.co/laion/CLIP-ViT-B-32-laion2B-s34B-b79K) | 88M | 72.8% (OpenCLIP B/32 at 256, SigLIP 2 Table 1) | Via Xenova ports of the OpenAI B/32; LAION ones need export |
| OpenVision B/16 | Apache 2.0 (https://huggingface.co/UCSC-VLAA/openvision-vit-base-patch16-224) | 5.9M to 632M family | Not checked | No |
| nomic-embed-vision v1.5 | Apache 2.0 (https://huggingface.co/nomic-ai/nomic-embed-vision-v1.5) | ViT-B class | Not checked | Yes |
| MobileCLIP, MobileCLIP2 (all sizes) | **Research only** | 11M to 322M | 67.8% to 81.9% | Yes (`Xenova/mobileclip_s0`) |
| AIMv2, DFN CLIP | **Research only** (`apple-amlr`) | | | |
| MetaCLIP 2, jina-clip-v2 | **Non-commercial** (CC-BY-NC 4.0) | | | |

Sources for the numbers: SigLIP 2 Table 1 (https://arxiv.org/html/2502.14786), the PE card above, the MobileCLIP2 card (https://huggingface.co/apple/MobileCLIP2-S0). Licences are the Hub `license:` tags read through `https://huggingface.co/api/models/<repo>`.

**The Apple models can't ship.** MobileCLIP and MobileCLIP2 are the obvious pick for Apple Silicon (MobileCLIP2-S2 reaches 77.2% at 3.6 ms per image on an iPhone 12 Pro Max), but their weights carry the Apple Machine Learning Research Model licence, which grants use "exclusively for Research Purposes" and says research "does not include any commercial exploitation, product development or use in any commercial product or service" (https://raw.githubusercontent.com/apple/ml-mobileclip/main/LICENSE_MODELS). The code is MIT (https://raw.githubusercontent.com/apple/ml-mobileclip/main/LICENSE), which doesn't help with the weights. AIMv2 and DFN CLIP carry the same `apple-amlr` tag (https://huggingface.co/apple/aimv2-large-patch14-224-lit, https://huggingface.co/apple/DFN5B-CLIP-ViT-H-14).

**SigLIP 2 B/16 is the candidate.** It matches PE-Core B/16 on ImageNet (78.2 vs 78.4), is Apache 2.0, and has ONNX files that transformers.js already loads.

- **Sizes** (`onnx-community/siglip2-base-patch16-224-ONNX`, Hub tree API): vision tower 372 MB fp32, 186 MB fp16, 95 MB int8; text tower 1,129 MB fp32, 565 MB fp16, 283 MB int8. The text tower is big because SigLIP 2 uses a 256,000-token vocabulary (the repo's `config.json`).
- **We need the text tower only when the text changes.** The tag vocabulary is fixed, so its text embeddings can be computed once at build time and shipped as a small matrix (a few hundred tags times 768 floats is under 1 MB). The app then needs only the 95 to 186 MB vision tower to tag. The text tower comes back if we want text-to-image search ("semantically search mockups" is in the Phase 1 scope in `CLAUDE.md`) or tags users add themselves.
- **Sigmoid scores suit tagging.** SigLIP is trained with a sigmoid loss on each image-text pair, with no softmax across the batch (https://arxiv.org/abs/2303.15343), and the transformers.js pipeline applies `sigmoid()` per label for SigLIP and `softmax` for CLIP (`src/pipelines/zero-shot-image-classification.js` in `@huggingface/transformers` 4.3.1). So each tag gets its own score and several tags can pass at once, which is what a multi-label tagger needs.
- **Text preprocessing:** the SigLIP 2 processor lowercases all text and pads to 64 tokens, and "overriding them may lead to degraded retrieval quality" (https://raw.githubusercontent.com/huggingface/transformers/main/docs/source/en/model_doc/siglip2.md). The ONNX repo declares `model_type: "siglip"`, and the transformers.js pipeline pads SigLIP to `max_length`. Whether the JS tokenizer also lowercases is **Unverified**, so lowercase the prompts ourselves.

### What contrastive models get wrong

- **Attributes and relations.** On the ARO benchmark, contrastive VLMs "have poor relational understanding, can blunder when linking objects to their attributes" and lack order sensitivity, because retrieval training can be solved without composition (https://arxiv.org/abs/2210.01936). For us: SigLIP can say "tote bag" and "floor" with confidence and still can't tell "standing on the floor" from "hanging from a hook". Relations stay a VLM job, with a check.
- **They read text.** In a typographic attack, a printed word on an object makes CLIP name the word: OpenAI's apple with a paper "iPod" label (https://distill.pub/2021/multimodal-neurons/). That page renders its body with scripts and I could read only its header, so the example is **Unverified** first-hand. Round 2 cites the effect for larger VLMs (https://arxiv.org/abs/2402.00626). On our covers that cuts both ways: "tote bag" printed on a tote bag helps; "Billboard Mockup" printed on the MacBook promo panel (OCR found it) would push a billboard tag. Because OCR gives the text boxes, one test is to grey out those boxes before scoring (experiment 4b).
- **Scores are miscalibrated.** Zero-shot CLIP is miscalibrated across prompts and datasets, and one learned temperature per model transfers across datasets and prompts (https://arxiv.org/abs/2303.12748). That supports fitting thresholds once per model on our gold set and expecting them to hold for new mockups, with the caveat that the paper covers softmax CLIP classification, not sigmoid multi-label tagging.
- **No mockup benchmark.** I found no published accuracy for contrastive models on product-photo attributes like "tote bag" vs "shopping bag" vs "paper bag", or "3D render" vs "realistic". Accuracy on our task is **Unverified** until the harness measures it.

### Thresholds, concretely

1. **Prompts:** two or three templates per tag ("a photo of a {tag}", "a {tag} mockup", "a 3D render of a {tag}"), averaged in embedding space. The CLIP paper describes prompt engineering and ensembling for zero-shot classification (https://arxiv.org/abs/2103.00020); I read only its abstract, which does not mention it, so both the practice and the size of its gain are **Unverified** here.
2. **Per-category rules:** object type is one decision (take the top tag in Device, Print & Branding, Apparel if it clears a floor); Environment and Style are multi-label (every tag above its own threshold).
3. **Thresholds from gold:** pick each tag's threshold on 38 covers and test on the 39th, for all 39 (leave-one-out). With 39 covers and some tags that appear once, many tags will have no positive example, so fall back to one threshold per category for those.
4. **Abstain:** when the top two object tags are within a small margin, say nothing and let the VLM and names decide.

## 3. Running them in Electron

| Route | What it takes | Notes |
|---|---|---|
| **transformers.js** `@huggingface/transformers` 4.3.1 | npm dependency; it brings `onnxruntime-node` 1.30.0 and `sharp ^0.35.4` | The package's Node backend lists `coreml`, `webgpu` and `cpu` as devices on macOS, with `cpu` the default (`src/backends/onnx.js`). Our sharp is 0.35 too. Pipelines for SigLIP, CLIP, OWLv2, Grounding DINO and Florence-2 are registered (`src/models/registry.js`). |
| **onnxruntime-node** directly | npm dependency, N-API addon | Supports Electron 15+ and ships prebuilt CoreML EP binaries for macOS arm64 (https://raw.githubusercontent.com/microsoft/onnxruntime/main/js/node/README.md). Latest 1.30.0, 2026-09-14 (npm). Smaller surface than transformers.js; we'd write the preprocessing (resize, normalise) with sharp and the tokenizer step is unnecessary if text embeddings are precomputed. |
| **Core ML through a Swift helper** | Convert the model with coremltools, ship an `.mlpackage` and a helper binary | Can use the Neural Engine. SigLIP Core ML conversions exist from third parties (https://huggingface.co/mlboydaisuke/SigLIP-base-patch16-224-CoreML); a SigLIP 2 one we'd convert ourselves. Same helper as the Vision work below, so the packaging cost is shared. |

**Where it runs.** Electron's `utilityProcess.fork()` starts a Node child with message ports through Chromium's services API (https://raw.githubusercontent.com/electron/electron/main/docs/api/utility-process.md), so ONNX inference can run off the main process the same way llama-server already runs as a child. This keeps the privileged-work-in-main rule from `CLAUDE.md`: the renderer never sees it.

**Speed.** I found no published SigLIP 2 B/16 latency on Apple Silicon for onnxruntime. The nearest primary number is MobileCLIP-B, an 86M image tower like SigLIP B/16, at 10.4 ms per image on an iPhone 12 Pro Max through Core ML (https://huggingface.co/apple/MobileCLIP2-S0). CPU ONNX on an M1 will be slower than that. **Unverified**; measure it (experiment 4).

**Memory.** **Unverified.** File sizes give a floor: 95 MB (int8) to 186 MB (fp16) for the vision tower, plus onnxruntime itself. It runs one after the other with llama-server, so it adds to the peak only if both stay loaded.

## 4. OCR from Electron, and the two uses

### Helper binary or node addon

**A helper binary, the same pattern as llama-server.** One Swift command-line tool, started on demand, that takes a cover path and returns JSON: OCR lines with boxes and confidence, classifier labels, the feature print, hand and person counts. The probe for this doc is that tool in about 100 lines; one call does all of it in about 0.25 s per cover (measured here).

- **For:** no Electron ABI concerns, a crash can't take the main process down, and it shares the bundling, signing and notarization work that the spec already lists as open for llama-server (`design/specs/ai.md`, "Packaging").
- **Against:** one more binary to sign, plus process start-up per batch (keep it alive for the length of an import, as llama-server is).
- **Prior art:** `mac-ocr` wraps Vision OCR as a CLI with a Node API and "ships a prebuilt universal binary" (https://raw.githubusercontent.com/privatenumber/mac-ocr/master/README.md). It does OCR only, so ours is still worth writing, but it shows the pattern works from Node.

**A node addon** needs an Objective-C++ bridge to Vision and a rebuild per Electron version. The one Vision addon on npm I found, `mac-system-ocr`, is deprecated (https://www.npmjs.com/package/mac-system-ocr). Not worth it for a 100 ms call.

### Use 1: take printed text out deterministically

The current clean-up (`stripQuoted`, `dropPrintedTextSentences` in `vision-provider.ts`) catches printed text only when the model quotes it. OCR lets us match the words themselves:

1. Normalise OCR lines into words and phrases (lowercase, strip punctuation and `®`).
2. A word in a title, description or tag that appears in the OCR text is removed **unless** it is also in the file name or folders, or it is an object or setting noun from the tag vocabulary (section 5).
3. Remove whole OCR phrases first ("download free mockup from ls.graphics"), then single words, then tidy with the existing `tidySpacing`.
4. Ignore OCR lines below a confidence floor (the probe saw 0.3 and 0.5 on misreads such as "FONLOAD TO HEROINES") and very short tokens.

Expected effect from the run data: it targets the 21 of 117 3B outputs and 4 of 117 7B outputs above. It can't hurt the covers with no print.

### Use 2: printed text as evidence

OCR found the right object noun on 17 of the 36 real covers: poster, billboard, cap, cup, tote/bag, iPhone, MacBook, ID card, notebook, envelope, light box, tape, package (measured here, against `gold.json`). It found a misleading one on 2: "billboard" on the MacBook-on-rocks cover (from a "Billboard Mockup" line on a promo panel) and "phone" on the stationery set (from "Phone: (123) 456-7890" on a business card).

So OCR nouns behave like file names: often right, sometimes about something else. They should enter the evidence-fusion rule from brief B in the same slot as names, never alone. A proposal for that slot:

- An OCR object noun counts as evidence only if it is a whole line or a short line (under about 4 words) and is in the object vocabulary.
- It is used when the image agrees (the contrastive tagger or the VLM names the same kind of object), as v4 already does for names.
- An OCR noun that names a different kind of object from the image and the names is ignored.

## 5. Image embeddings for later features

**Two options, both cheap:**

- **Vision feature prints** (768 floats, 4.6 ms, measured here): free, built in, and already good at "same series" on our set. They are image-only, so they can't support text search.
- **SigLIP 2 image embeddings:** the same vector serves tagging, "find similar", and text-to-image search once the text tower ships. Image embeddings from one model version are comparable; a model change means re-embedding the library.

**Storage.** Either fits in SQLite. `sqlite-vec` 0.1.9 is MIT or Apache 2.0 and publishes a `darwin-arm64` build (npm `sqlite-vec`; README https://raw.githubusercontent.com/asg017/sqlite-vec/main/README.md). For a library of a few thousand mockups, a plain BLOB column and a dot product in JS is enough and adds no native extension. Whether better-sqlite3's bundled SQLite in our build allows `loadExtension` is **Unverified**; check before choosing sqlite-vec.

**Grouping a new import with an old pile.** From the distances above, a cut near 0.75 on feature-print distance separates same-series variants from unrelated covers on this test set. That is one set of 39 covers with a handful of series; treat 0.75 as a starting point to tune.

## 6. Checkers for the recurring hallucinations

Published evidence that checking helps:

- **Detector-backed correction:** Woodpecker extracts the objects a caption claims, asks an open-set detector (Grounding DINO) and a VQA model about them, and rewrites the caption; it reports +30.66% and +24.33% POPE accuracy over MiniGPT-4 and mPLUG-Owl, with no training (https://arxiv.org/abs/2310.16045).
- **CLIP as a sentence-level check:** "CLIP similarity to the image acts as a stronger and more robust indicator of hallucination compared to token likelihoods" (https://arxiv.org/abs/2402.15300). They use it inside decoding; a post-hoc sentence or tag filter is the cheap version we can run outside llama-server.
- **Why tape and folders appear next to mailers:** objects that co-occur in training data with the objects in the image are the ones LVLMs hallucinate most (https://arxiv.org/abs/2305.10355).
- **Tags can steer captions:** Tag2Text and RAM train a tagger and use its tags to guide caption generation, and report better captioning and tagging than CLIP and BLIP (https://arxiv.org/abs/2303.05657, https://arxiv.org/abs/2306.03514). RAM++ is Apache 2.0 but its checkpoint is 3.0 GB plus a 479 MB tag embedding file (Hub tree API, https://huggingface.co/xinyu1205/recognize-anything-plus-model), too heavy as a default helper.

Mapping the brief's list to a helper:

| Hallucination | Helper that can catch it | Confidence |
|---|---|---|
| Quoting text printed on the product | OCR word removal (use 1) | High; deterministic |
| Placeholder notice described as a handwritten note | OCR finds "Remove this layer to start" (all 3 measured here); entropy already catches them | High |
| Apple Watches "on wrists" | No hands, no people from Vision → drop wrist and hand words | High on this set; recall on real hands **Unverified** |
| Stacked boxes called a lamp, book, sign or business card | Contrastive object-type vote over the vocabulary | **Unverified**: Apple's classifier also called them `document` |
| Long-scroll MacBook as a flexible, curved or foldable laptop, or a "laptop chair" | Names and OCR evidence for the noun; contrastive check of "chair" or "armchair" against the image; a ban list of form-factor adjectives ("flexible", "foldable", "curved") for Device nouns | Medium. Apple's classifier said `seat` and `armchair` on these covers, so contrastive models may share the confusion |
| "Cosmic, starry background" behind the iPhone on dark sand | Contrastive pair check: "a starry night sky" vs "dark sand" | **Unverified**; attribute binding is a known weak spot |
| "Glowing" unlit lightbox | Contrastive pair "an illuminated lightbox" vs "an unlit lightbox" | **Unverified** |
| Tote bags "hanging from a hook" | Detector query "hook"; relations are beyond contrastive models (ARO) | Medium with a detector, low without |
| Roll of tape and a folder invented next to mailers | Detector query for each claimed object | Medium; Grounding DINO tiny int8 is 204 MB (https://huggingface.co/onnx-community/grounding-dino-tiny-ONNX), speed on CPU **Unverified** |

Florence-2 base (0.23B, MIT, https://huggingface.co/microsoft/Florence-2-base) is a lighter detector and OCR model with transformers.js support (about 94 MB vision encoder plus 98 MB decoder at int8 in `onnx-community/Florence-2-base-ft`). It is generative, so it can hallucinate labels too, and Apple's OCR already covers its OCR task. Keep it as the fallback if Grounding DINO is too slow.

## 7. Hybrid designs

Three shapes, from least to most change:

1. **Check after (no prompt change).** The VLM runs as today; the Vision helper's facts (OCR words, no hands or people) and, later, contrastive scores remove words and tags that fail. Easiest to measure, since the prompt that took a week to tune stays fixed (the 7B lost 7 points of search from one removed line, `design/specs/ai.md`).
2. **Facts in, then check.** Add a short "seen by the app" line to the prompt: "Printed on the cover: tote bag" or "Likely object: box (stack)". This changes the prompt, so the 7B's sensitivity applies; measure over three passes.
3. **Contrastive tags, VLM prose.** The contrastive tagger picks the object type and the Environment and Style tags from the vocabulary; those become the tags. The VLM writes only the title and description, told the object noun. llama.cpp's grammar could force the chosen noun into the title with a `pattern`, but that is a hard constraint on a model that is sometimes right when the tagger is wrong; try the soft version first.

**The vocabulary is the hard part of design 3.** Taking each search term in `gold.json` and checking it against the seed taxonomy labels (`TAXONOMY` in `src/main/db/bootstrap.ts`), only 29 of 73 searches are covered word for word. Adding the gold's own tag labels raises it to 55, but that uses the answers. The rest ("long scroll", "iphone 15", "z fold", "boho") come from file names or free description. So a closed tagger can own object type and coarse scene and style, and the names plus the VLM still carry product models and specific scenes. The vocabulary should be written from a generic list of mockup subjects (a few hundred nouns) before looking at the gold, or the harness will overstate it.

## Ranked experiments

Run one change at a time, both models, three passes, through `pnpm ai-eval:score`. The helpers' output can be computed once per cover and cached next to `preview.jpg`, so experiments 1 to 3 don't need new model runs: they post-process the existing `results.json` from v4 and rescore.

| # | Change | How to measure on the harness | Expected effect | Cost |
|---|---|---|---|---|
| 1 | OCR word removal (section 4, use 1) on the v4 outputs | Count outputs with print-only words (today 21/117 on 3B, 4/117 on 7B); search found and clean | Removes most of those words; small "clean" gain, mostly on 3B | No model run. Helper about 100 lines of Swift; ships with the llama-server packaging work |
| 2 | No hands and no people → drop wrist, hand, held, person, model | Count such words before and after; add 2 or 3 hand-held covers to `gold.json` first to catch false drops | Fixes the Apple Watch wrist claims (3 of 3 7B passes on the clay watch) | Same helper; a few ms |
| 3 | OCR object nouns as name-like evidence | First offline: how often the OCR noun agrees with the gold object (17 right, 2 wrong of 36 measured here). Then as a prompt fact (design 2), three passes | Better object nouns on covers with print, which are most of the stationery, bag and packaging covers | Same helper; prompt change on the sensitive 7B |
| 4 | SigLIP 2 B/16 zero-shot tagging over a vocabulary written before reading gold | Tag precision and recall against gold per category, leave-one-out thresholds; time per cover on the M3 Max and, if possible, a base M1 or M2 | **Unverified.** Decides whether design 3 is viable | 95 to 186 MB download; transformers.js or onnxruntime-node in a utility process |
| 4b | Same, with OCR text boxes greyed out before scoring | Same metrics; look at the MacBook-on-rocks ("Billboard Mockup") and tote covers | Separates "reads the label" from "sees the object" | One sharp composite per cover |
| 5 | Feature-print grouping | For each test cover, is its nearest neighbour in the same series, and does a 0.75 cut split series from strangers | Already looks good on this set; turns into a product feature (pile suggestion) | Same helper; 3 KB per mockup |
| 6 | Contrastive checks for the scene and lighting words the models invent (starry, cosmic, glowing, hook, chair) | For each such word in an output, score a "with" and "without" prompt pair; drop the word when "without" wins; count wrong words removed vs right words removed | **Unverified**; ARO predicts weak results on attributes | Needs the text tower (283 MB int8) or precomputed pairs for a fixed word list |
| 7 | Grounding DINO tiny to confirm each claimed object | Extract object nouns from the description, query the detector, drop unconfirmed; measure clean rate and time | Strongest published effect (Woodpecker), but on general images with older VLMs | 204 MB int8; CPU speed **Unverified**, likely the slowest step |

The built-in `VNClassifyImageRequest` is left off the list as a tagger: it misses most of our nouns and fails on the same covers as the VLM. It stays useful as a free tie-breaker inside experiment 3 if one is needed.

## Open questions

- Speed of the Vision pass and of SigLIP 2 on an 8 GB M1 or M2 base.
- Whether the first-ever OCR call's 33 s stall happens on every Mac, and whether it can run at app start while idle.
- Hand and person detector recall on hand-held mockups (none in the test set).
- Whether better-sqlite3's bundled SQLite can load extensions, if sqlite-vec is chosen.
- Whether transformers.js lowercases SigLIP 2 text, or we must.
