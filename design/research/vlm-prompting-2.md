# Prompting a small local VLM for mockup metadata, round 2

**Question:** after five prompt versions on Qwen2.5-VL 3B and 7B (Q4_K_M, llama.cpp, json_schema) over 39 real covers, the same eight failures keep coming back. What do primary sources say about each, and which experiment should run next?

**Researched:** 2026-10-21. Builds on `design/research/vlm-prompting.md` (round 1), which is not repeated here.

**Sources read directly:** llama.cpp `grammars/README.md`, `docs/multimodal.md`, `tools/quantize/README.md`, `tests/test-json-schema-to-grammar.cpp`; the Qwen2.5-VL model card and technical report; the Anthropic multishot prompting page; arXiv abstracts for the papers cited below. I read only abstracts for the papers, so a finding that needs a number from a paper's body is marked unverified. **Unverified** also means no primary source was reachable. Those items are hypotheses for the harness.

**Repo evidence read:** `scripts/ai-eval/prompts/v1.ts` to `v4.ts`; `results.json` and `score.md` under `~/Library/Application Support/DesignStash-dev/ai-eval/runs/` for 3B v3 and 7B v2 (read-only; the eval was not run). Numbers quoted from those files are labelled "run data".

## Run data that shapes the advice

- 7B v2: 35 of 39 titles or descriptions contain the word "mockup". It tagged Angle on 36 of 39 covers, almost always `front` (15) or `side` (18). Source: `runs/qwen2.5-vl-7b/v2/results.json`.
- 3B v3: average 2.44 tags per cover, no Angle tags at all, only 13 Device tags. Source: `runs/qwen2.5-vl-3b/v3/score.md` and `results.json`. v3's schema had `minItems: 1`; v4 raises it to 3.
- The "missed queries" in 3B v3 are mostly vocabulary gaps between a searcher and the stored text: "packaging", "stationery", "wrapper", "badge", "phone", "scrolling website". The stored text names the specific object ("snack bar package", "notebook") and never the category word a person types. Source: `runs/qwen2.5-vl-3b/v3/score.md`.
- Printed text leaks into output: 3B v3 writes `'SNACKBAR'` and `'B-Mockups' and '16'` into descriptions even though the prompt says to leave printed words out. Source: `runs/qwen2.5-vl-3b/v3/results.json`.
- Filename leakage is a second route for the word "mockup": 3B v3 titles are "Blue Baseball Cap Mockup" and "Laptop Mockup on Stone Surface" for files named `Free_Cap_Mockup.psd` and `Macbook-Mockup-on-Rocks-...psd`. v4 now strips it from titles and tags only. Source: same `results.json`; `v4.ts`.

## 1. Models copy prompt examples

**What the sources say.**
- Anthropic's prompt guidance asks that examples be "Diverse: Cover edge cases and vary enough that Claude doesn't pick up unintended patterns" and recommends 3 to 5 of them. Source: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/multishot-prompting. This is vendor guidance for large models, not a measurement on 3B VLMs.
- In-context demonstrations mainly supply the label space, the input distribution and the output format, so a model reuses what the examples show whether or not it fits the input. Source: https://arxiv.org/abs/2202.12837 (text LMs only).
- Few-shot behaviour is biased toward answers near the end of the prompt and toward answers common in pretraining, and example choice and order swing results widely. Source: https://arxiv.org/abs/2102.09690 (GPT-3, text only).
- For VLMs, object hallucination rises for objects that are frequent in the visual instruction data or co-occur with objects in the image. Source: https://arxiv.org/abs/2305.10355. A prompt example is an extra instance of exactly that frequency signal.

**Is far-domain examples the known best fix?** It follows from the three text-model results above and from your v3 outcome (bicycle examples stopped the copying). I found no benchmark that compares fixes for example copying in small VLMs. **Unverified** as "best".

**Mitigations, ordered by how directly the evidence supports them:**
1. **Use no worked example for the fields where copying hurts search.** The format is already forced by the grammar, and llama.cpp says the model must be told the structure in prose, so describe each field in a sentence and give no sample value. Source for "describe the structure in the prompt": https://raw.githubusercontent.com/ggml-org/llama.cpp/master/grammars/README.md.
2. **If an example is kept, keep it far from the library** (the v3 bicycle), as above.
3. **Placeholders in angle brackets** (`<object>`) have no source behind them either way. **Unverified.** A risk is that the model emits the literal placeholder, which the grammar cannot stop. A cheap guard is to reject outputs that contain `<` or `>` in the schema `pattern`.
4. **Post-filter against the prompt**: drop any title, description or tag that equals a string appearing in the prompt text. This needs no model change, and it covers the 3B's "Isolated on a plain background" tag. It is an engineering guard, not a cited finding.
5. **Category descriptions that list example labels also count as examples.** v3's `CATEGORIES` lists "laptop, MacBook, phone..." per category. By the label-space result above, that list is the label space the model samples from. Test shortening each to the category definition only.

## 2. Printed-text (OCR) bias

**What the sources say.**
- Qwen2.5-VL pre-training includes OCR data alongside captions. Source: https://arxiv.org/html/2502.13923. The report and the model card also present document and text reading as a headline strength. Source: https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct/raw/main/README.md.
- Text rendered in an image can override what a vision-language model concludes about the image content (typographic attacks), including in models other than Qwen. Source: https://arxiv.org/abs/2402.00626 (abstract; reports drops up to 60% in classification). The paper is about classification attacks, so the link to captioning is an inference.

**Mitigations.**
1. **Instruction wording and placement.** I found no study that ranks wordings. The current instruction ("Words printed on the object ... are template filler ... Leave them out") sits in the middle of the user turn. **Unverified:** whether moving it into the field definitions (the lines the model reads while it generates each field) helps. This is the cheapest experiment.
2. **Lower resolution.** Smaller images make small print unreadable, and the model card says higher resolution improves performance. Source for resolution tradeoff: https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct/raw/main/README.md. Product titles on boxes and bags are large, so a 512 px long edge would still let big print through. **Unverified** as a fix; test it with Experiment 6 below.
3. **Grammar.** A `pattern` can ban quote characters (v3 already excludes `"`), which stops the `'SNACKBAR'` style only if the model uses double quotes. Banning both quote kinds is simple. It also blocks apostrophes in "men's", so exclude only straight quotes and test.
4. **Post-filter with our own OCR.** macOS ships the Vision framework's text recognition, but I did not verify its availability from the Electron main process or its accuracy on mockup covers. **Unverified.** The idea: OCR the cover, collect the words, and remove any of those words from title, description and tags unless they appear in the file name or folder trail. This is the only approach here that handles OCR copying deterministically. Cost: one extra pass per cover and a dependency on a native API.
5. **Cheaper post-filter, no OCR:** a model-side `seen` field already quotes the printed text in quotation marks in the runs (`'B-Mockups' and '16'`). Strip any quoted span from every field, and drop words that appear only inside quotes in `seen`. Engineering guard on observed behaviour, not a cited finding.

## 3. Misread stylised renders and hallucinated scenes

**What the sources say.**
- Object hallucination is a general, measured weakness of LVLMs. Source: https://arxiv.org/abs/2305.10355.
- A study of detailed captioning finds that hallucination arises when the description includes details finer than the vision module can ground, and it examines image resolution and decoder size as factors. Source: https://arxiv.org/abs/2310.01779 (abstract; the specific resolution and size effects are in the body, which I did not read). This supports asking for coarser, more certain facts: "main object, material, background colour" over "what it hangs from".
- Basic spatial relations are a documented weak spot across 18 VL models (best around 56% against 99% for humans on their benchmark). Source: https://arxiv.org/abs/2310.19785. "Hangs from a hook" and "stands on" are spatial-relation claims.
- Qwen2.5-VL reports its 3B and 7B scores below the 72B on grounding benchmarks (RefCOCO val 89.1 for 3B, 90.0 for 7B, 92.7 for 72B). Source: https://arxiv.org/html/2502.13923. So grounding exists at 3B and 7B, with a gap.

**Does describe-first help?** Round 1 gave an untested hypothesis; your runs say no on 3B and a small gain on 7B. The hallucination paper's finding (finer detail than the encoder can verify induces hallucination) predicts that a long free-text `seen` can add invented detail, which then feeds the other fields. **Unverified** for this model, but consistent with your 3B result. A `seen` capped to one short sentence about the main object only is a cheap variant.

**Grounding or region prompts.** Qwen2.5-VL can output boxes and points in JSON (model card). Source: https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct/raw/main/README.md. Asking for the bounding box of the main object, then re-running on the crop, is plausible and would also drop background clutter. I found no evidence of gain for captioning. **Unverified.** Cost: a second request per cover and a model that must emit valid coordinates.

**Known limits at Q4.** I found no primary measurement of VLM captioning quality at Q4_K_M versus higher precision (see §8).

**Practical reading.** The long-scroll MacBook (a screen that continues as a wavy sheet) is an unusual shape with no strong class prior, so a small model snaps to a familiar one. Names help here: v4 already allows the file name to supply the product word. A trust order of "file name product word wins when the image shows a plausible instance of that kind of object" is what v4 implements; the evidence for it is only your run data.

## 4. Keyword lists vs natural sentences, and a `keywords` field

**What the sources say.**
- Expanding a document with terms predicted to be searched improves retrieval. Source: https://arxiv.org/abs/1904.08375 (passage retrieval, a trained seq2seq model, not a VLM).
- Your 7B output shows the failure that the single description field creates: "MacBook, laptop, computers, indoor, side view, blue, white" is a keyword list in a field the UI shows as a sentence. Source: `runs/qwen2.5-vl-7b/v2/results.json`.
- Search is `fts5(title, description, tags)`, default `unicode61`, prefix match, all terms ANDed. Source: https://www.sqlite.org/fts5.html and `src/main/db/search-index.ts`.

**Is a separate `keywords` field the standard?** Document expansion into a separate indexed field is standard in search engineering. I found no study comparing a VLM's synonym quality in a dedicated field against synonyms inside a description. **Unverified.** The design argument is sound without it: the description stays a clean sentence to display, and the keyword field can be as list-like as the model wants.

**What the missed queries ask for** (run data): category words (packaging, stationery, wrapper, badge) and common names (phone, scrolling website). So the field should request, in this order: the category word a person would type, then other names, then the setting words. Index it as a fourth FTS column, or add its words to the `tags` column, and do not show it. The index change needs a migration, so decide that before the prompt work.

## 5. Tag count and category structure

**What the sources say.**
- llama.cpp supports nullable types in `json_schema`: its tests include `"type": ["array", "null"]` and enum values with `null`. Source: https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tests/test-json-schema-to-grammar.cpp. The grammar guide warns that `properties` cannot be mixed with `anyOf`/`oneOf` in the same type, and `type: [...]` arrays are a different construct. Source: https://raw.githubusercontent.com/ggml-org/llama.cpp/master/grammars/README.md. So `device: ["string","null"]` is supported, but test it, since the test file shows arrays and enums rather than a nullable string property.
- Tighter format constraints can reduce quality on reasoning tasks. Source: https://arxiv.org/abs/2408.02442. A rebuttal says prompt and structure must match. Source: https://blog.dottxt.co/say-what-you-mean.html.
- I found no study that compares an array of `{category, label}` pairs against per-category optional fields, or one-step against two-step tagging, for small VLMs. **Unverified.**

**Design reasoning (not cited).** With an array and an enum category, the grammar guarantees an entry for each tag it starts, and the model is free to stop at one. With per-category fields, the grammar forces a decision for every category, so a model that pads will pad with `string` values, and one that under-tags will pick `null`. The per-category form moves the failure into a place you can see. Per-category fields also remove the `Device: Monitor on a notebook` error only if the descriptions are strict, because the field name now carries the category. A two-step flow doubles requests (time cost: roughly the 3.6 to 6.8 s per cover measured in `design/specs/ai.md`).

**The count problem has an observed cause.** 3B v3 averaged 2.44 tags and v4 sets `minItems: 3`. A floor makes the grammar force padding when the model has fewer true things to say. Per-category nullable fields with a code-side floor ("accept 2 tags") avoid forcing false tags.

## 6. Camera angle

**What the sources say.**
- Spatial relations between objects are a documented weak spot for VL models. Source: https://arxiv.org/abs/2310.19785.
- Camera pose estimation is one of six tasks in a multi-view benchmark whose authors report MLLMs "frequently fall short" on multi-view geometric consistency, across 27 MLLMs including closed models. Source: https://arxiv.org/abs/2504.15280 (abstract). That benchmark compares several views of one scene, which is a harder task than naming a single view's angle, so it supports "weak" but not a rate.
- Your run data: 7B v2 labels Angle on 36 of 39 covers and nearly always `front` or `side`. The Angle labels are not near a 25% chance split across four options, which suggests a prior toward `front` and `side`, rather than a spread of guesses. Source: `runs/qwen2.5-vl-7b/v2/results.json`. How accurate they are against gold was not computed here.

**Recommendation.** Drop Angle from AI tagging unless a gold-labelled check shows better than the always-`front` baseline. The 3B already stopped producing Angle in v3 (zero tags), and the search gold queries I saw in `score.md` do not ask for angle. Whether users search by angle is a product question, so check `gold.json` before deleting the category. **Unverified** that the model cannot learn it with better definitions.

## 7. Chinese characters in English output

**What I found.** Nothing from Qwen itself. A web search for a Qwen2.5-VL issue about Chinese characters in English output found no matching report, only unrelated models. GitHub's issue-search API was not reachable from this environment. **Unverified** as "known Qwen issue".

**Mechanism (reasoning, not cited).** Qwen2.5-VL is trained on a corpus that includes Chinese data, and language mixing in a bilingual model is a general phenomenon. At a low temperature with `repeat_penalty` 1.05 it still occurs in your runs, so lowering temperature further is unlikely to fix it.

**The ASCII `pattern` in the grammar.**
- llama.cpp converts `pattern` to grammar, requires it to start with `^` and end with `$`, and skips unsupported features silently. Source: https://raw.githubusercontent.com/ggml-org/llama.cpp/master/grammars/README.md. The tests cover bounded-repeat and character-class patterns. Source: https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tests/test-json-schema-to-grammar.cpp.
- Downsides, by construction: accented brand or place names ("Café") are blocked, so the model is forced to write "Cafe" or to find some other ASCII token that continues; a bounded class like `{1,300}` makes a larger grammar than an unbounded one (compile time and memory, **unverified** magnitude); and a model that "wants" to write a non-ASCII token is steered to the next-best ASCII token, which can produce odd spellings rather than a clean English word. Check titles for broken words in the next run.
- Alternative: leave the grammar open and reject or retry any output matching `/[㐀-鿿]/`. It is more tolerant of accents and costs one retry on the rare bad output.

## 8. Quantization, model size, and other small VLMs

**Quantization.**
- llama.cpp's quantize README shows Q4_K_M at 4.89 bits per weight against Q8_0 at 8.50, and lists size and speed for Llama-3.1-8B (Q4_K_M 4.58 GiB, Q8_0 7.95 GiB; text generation 71.9 vs 50.9 t/s). It also says quantization "may introduce some accuracy loss" measured in perplexity and KL divergence. Its table has no quality column. Source: https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/quantize/README.md. Those numbers are for a text model on that hardware, not Qwen2.5-VL on an M3 Max.
- A large study of Llama-3.1 quantization finds INT8 within 1 to 3% of baseline and INT4 weight-only "more competitive than expected, rivaling 8-bit". Source: https://arxiv.org/abs/2411.02355 (abstract). It covers text-only Llama-3.1 and vLLM formats, not GGUF k-quants and not VLMs. It is the best primary evidence found, and it says Q4 is usually not the cause of large drops.
- The spike repo's mmproj files are already Q8_0 (`design/specs/ai.md`), so the vision encoder is not at 4 bits.

**Reading.** The primary evidence suggests Q4_K_M costs a few points of accuracy at most on text benchmarks, which is smaller than the prompt-driven differences you measured (44% to 58% found). **Unverified** for VLM captioning and for a 3B model, where smaller models are often more sensitive. The test is cheap since Q8_0 is the next file down; the 3B at Q8_0 is about 3.3 GB by size ratio (derived: Q4_K_M 1.93 GB at 4.89 bpw scales to about 3.4 GB at 8.5 bpw, plus the mmproj). Expect memory and speed cost near the 4.58 vs 7.95 GiB ratio in the README.

**Other small VLMs with GGUF and mmproj on llama.cpp.** The multimodal doc lists these as supported with `ggml-org` GGUF repos: Gemma 3 4B, Qwen2-VL 2B and 7B, Qwen2.5-VL 3B, 7B, 32B and 72B, InternVL2.5 1B and 4B, InternVL3 1B, 2B, 8B and 14B, SmolVLM2, Moondream2, and Gemma 4 E2B and E4B. Source: https://raw.githubusercontent.com/ggml-org/llama.cpp/master/docs/multimodal.md. That page is the current master branch. Whether release `b11748` (the pinned build) supports each model is **unverified**, and the doc lists Gemma 4, which may be newer than the pin. Check the release notes for `b11748` before testing a newer model.
- Candidates in the 3B class by size: Gemma 3 4B, InternVL3 2B, Gemma 4 E4B. I found no primary benchmark comparing them with Qwen2.5-VL 3B on caption or tagging tasks, so ranking them is not possible from sources. The earlier spike already showed SmolVLM2 2.2B and Moondream2 failing this task. `design/specs/ai.md`.

## Ranked experiments

Ordered by expected gain per unit of cost, using your run data and the evidence above. Token and time costs are estimates from the numbers in `design/specs/ai.md` and the prompts. Run each against both models, one change at a time.

| # | Change | Targets | Expected effect | Cost |
|---|---|---|---|---|
| 1 | Add a hidden `keywords` field (category word first, then other names, then setting) and keep `description` a clean sentence. Index it. | 4 (and the vocabulary-gap misses) | Largest direct hit on the missed queries in `score.md` ("packaging", "stationery", "phone"). Gain size unverified. | About 20 to 40 more output tokens, under 1 s. Needs an FTS column or tag merge. |
| 2 | Remove sample values from the prompt, and shorten each category line to its definition with no example list. Keep the schema the only format guide. | 1 | Targets the label-space copying that survives the bicycle fix. Evidence is indirect (§1). | Fewer prompt tokens, so slightly faster. |
| 3 | Post-filters, no model change: drop strings that appear in the prompt, strip quoted spans, strip the word "mockup" from descriptions by removing the whole clause rather than the word, ban `<`/`>`. | 1, 2 | Deterministic. Fixes "SNACKBAR" and "Isolated on a plain background" without touching recall. The v3 hole problem ("displaying a is placed") needs the clause-level strip. | None at run time. |
| 4 | Drop Angle from the AI schema (check `gold.json` first). | 6 | Removes a field that is mostly wrong and frees the model from padding it. | Saves tokens. |
| 5 | Per-category nullable fields (`device`, `print`, `apparel`, `setting`, `style`) in place of the tag array, with `minItems` gone and a code-side floor. | 5 | Makes padding and under-tagging visible. Evidence is design reasoning only. | Grammar change, no extra request. Test that nullable string properties compile. |
| 6 | Image edge 1024 to 768 and 512. | 2, speed | Less small print readable, fewer visual tokens (about 1,000 at 1024 by the 28 px rule; about 560 at 768; about 250 at 512 by the same rule). Quality effect unverified. | Faster per cover. |
| 7 | Move the printed-text rule into each field line (title, description, keywords) and quote nothing. | 2 | Cheap wording test. No source ranks wordings. | None. |
| 8 | Shorten `seen` to one sentence about the main object, or drop it for the 3B. | 3 | Your 3B result and the finer-detail hallucination finding both point away from long `seen`. Unverified. | Saves tokens on the 3B. |
| 9 | Replace the ASCII grammar `pattern` with a CJK reject-and-retry. | 7 | Keeps accents, avoids odd ASCII spellings. Trade: a retry on rare failures. | Near zero. |
| 10 | 3B at Q8_0. | 8 | Tests whether quantization matters. Primary evidence says it probably does little (§8). | About 1.4 GB more disk and RAM than Q4_K_M by size ratio. |
| 11 | OCR the cover with the macOS text recognizer and remove those words from output unless they are in the names. | 2 | Deterministic and the strongest answer to OCR copying. Availability from Electron unverified. | A native call and an extra pass per cover. Do only if 3 and 7 fall short. |
| 12 | Try a different small VLM (Gemma 3 4B or InternVL3 2B) after confirming `b11748` supports it. | 3, 8 | No benchmark found to predict the outcome. Last because the unknowns are highest. | Download, per-model server flags (`MODEL_SERVER_ARGS`), new harness runs. |

**Suggested first batch (v5):** experiments 1, 2, 3 and 4 together (they touch different parts of the output), then 5 and 7 as v6, so each round changes few things. A two-step classify-then-label flow and region prompting are left off the list: both double the requests and have the weakest evidence.
