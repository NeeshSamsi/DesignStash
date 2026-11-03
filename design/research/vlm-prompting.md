# Prompting a small local VLM for mockup metadata

**Question:** how to prompt Qwen2.5-VL 3B and 7B Instruct (GGUF Q4_K_M, llama.cpp `llama-server`, OpenAI-compatible chat with `response_format` json_schema) so titles, descriptions and tags work well for keyword search over PSD mockup previews.

**Researched:** 2026-10-21. Sources were fetched directly (model card, `generation_config.json`, `chat_template.json`, `preprocessor_config.json`, the arXiv HTML of the technical report, llama.cpp `grammars/README.md` and `tools/server/README.md`, the SQLite FTS5 page, arXiv abstracts). Each claim carries its URL. Claims marked **Unverified** have no primary source I could read; they are hypotheses to test with the eval harness (`scripts/ai-eval/`), not facts.

**Repo context read:** `src/main/ai/vision-provider.ts` (prompt, schema), `design/specs/ai.md` (spike results), `src/main/db/search-index.ts` and `src/main/db/repositories/search.ts` (FTS5).

## Summary of actionable findings

1. Keep the system message but make it short. The Qwen2.5-VL chat template inserts `You are a helpful assistant.` when no system message is given, so a custom one replaces a default the model was tuned with. Put the task detail in the user turn after the image. (Q1)
2. The prompt must spell out the JSON shape. llama.cpp does not show the schema to the model. (Q2)
3. Put a free-text "what I see" field first in the schema, and keep its length generous. Field-order benefit is **Unverified**, but constrained decoding can hurt reasoning-style output, and a first field costs about 40 tokens. (Q2)
4. Use `additionalProperties: false` (already the llama.cpp default) and avoid tight `maxLength` on the field the model fills first, because a cap cuts the text mid-thought. Truncate in code afterwards, as `clip()` already does. (Q2)
5. Few-shot text examples: use at most one, with invented content far from your categories, or none. Demonstrations mostly teach format and label space, which is exactly the copying risk seen in the spike. (Q3)
6. Sampling: Qwen's shipped default is near-greedy with `repetition_penalty` 1.05. Keep `temperature` at 0.2 or lower and consider `repeat_penalty` 1.05. Note llama-server's own default is 1.0 here. (Q4)
7. Search is FTS5 with the default `unicode61` tokenizer: no stemming, so "bag" matches "bags" through the trailing `*`, but "bags" does not match "bag". Tell the model to write labels and descriptions in singular form plus the common plural or synonym once in the description. (Q5)
8. Tell the model to leave out watermark text, stock site names and "mockup" (the app is already a mockup library, so the word matches everything). (Q5)
9. 1024 px long edge is about 1,000 visual tokens for Qwen2.5-VL by the documented 28 px rule. The model card recommends capping at 1,280 tokens; 512 px edge would be about a quarter of that. Measure 768 px before changing. (Q6)

## 1. System vs user message, image order

**Chat template.** The Qwen2.5-VL 7B `chat_template.json` emits a default system turn, `You are a helpful assistant.`, when the first message is not a system message. Each content part renders as `<|vision_start|><|image_pad|><|vision_end|>` for an image and the raw text for text, in the order the parts appear in the message.
Source: https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct/raw/main/chat_template.json

**What that means.**
- A custom system message replaces the default. The model card's own multi-message example passes `{"role": "system", "content": "You are a helpful assistant."}` explicitly (https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct/raw/main/README.md), so a system turn is a supported path. Nothing I read says the model is sensitive to system content beyond that.
- The model card's examples all list the image part before the text part in the user content, for example `{"type": "image", ...}` followed by `{"type": "text", "text": "Describe this image."}`. Source: same model card. Our `buildRequest` already does this.
- Technical report: SFT uses ChatML with explicit role tagging and "structured injection of visual" inputs. It does not state that image-first ordering is required or measurably better. Source: https://arxiv.org/html/2502.13923
- **Unverified:** that image-first beats text-first for caption quality. I found no ablation. The cheap test is to swap the order in the eval harness and compare.

**Recommendation.** Keep image first, then text. Keep the system message to the role and the ignore rules (watermarks, placeholder text), which the current `SYSTEM_PROMPT` already does. Move the long field-by-field instructions out of the system turn only if the eval shows the 3B ignoring them; there is no primary evidence either way.

## 2. Constrained JSON

**llama.cpp does not show the model the schema.** The grammar guide says the schema "is only used to constrain the model output and is not injected into the prompt. The model has no visibility into the schema, so if you want it to understand the expected structure, describe it explicitly in your prompt." Source: https://raw.githubusercontent.com/ggml-org/llama.cpp/master/grammars/README.md
Our prompt already lists title, description and tags. Keep it in sync with the schema: any field in the schema must be explained in the text.

**Supported subset and pitfalls.** `additionalProperties` defaults to `false` ("faster grammars + reduces hallucinations"); `enum`, `minLength`/`maxLength`, `minItems`/`maxItems` appear in the guide's own example; unsupported keywords are skipped silently; `prefixItems` is broken, nested `$ref` is broken, `properties` cannot be mixed with `anyOf`/`oneOf`. Source: same guide. Our schema stays inside the supported subset.

**Endpoint shape.** `/chat/completions` takes the schema in `response_format`, as `{type: "json_schema", json_schema: {"schema": ...}}`. Source: same guide, and the server README: https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md

**Does strict grammar hurt?** One paper reports that format restrictions lower LLM reasoning performance, and stricter formats lower it more. Source: https://arxiv.org/abs/2408.02442 (Tam et al., "Let Me Speak Freely?"). A reply from a structured-generation vendor argues the paper's prompts for structured mode did not describe the task or schema, so the comparison is unfair, and that prompt and structure must match. Source: https://blog.dottxt.co/say-what-you-mean.html (the vendor sells structured-generation tooling, so weigh it as an interested party). Both studies are about text LLM reasoning tasks (last-letter puzzles, math), not captioning with a VLM. **Unverified** for Qwen2.5-VL captioning at Q4_K_M. Our task is mostly perception and naming, not multi-step reasoning, so the exposure is smaller than in those papers.

**Field order.** The dottxt post constructs a reasoning field ahead of the answer, so the model "thinks" before it commits. Source: https://blog.dottxt.co/say-what-you-mean.html. That supports putting a free-text field first. I found no primary study of field order for VLM captioning. **Unverified.**

**Suggested schema order** (test in the harness, A/B against the current order):

```
seen        string   what is visible: object, setting, colours, angle (free text, no tight cap)
title       string   short title built from `seen`
description string   one sentence, built from `seen`
tags        array    category + label
```

`seen` is dropped before storing. Cost: roughly 30 to 60 extra generated tokens per cover. At the spike's 3.6 to 6.8 s per cover, this adds a few tenths of a second (derived from `design/specs/ai.md`, not measured).

**`maxLength` effects.** A grammar-level cap forces the string to end at the limit; the model cannot see the cap unless the prompt says so. Our prompt states both limits, which helps. For the first-filled field, do not set a cap, because a cap that cuts a sentence yields an incomplete observation that the following fields then build on. This is reasoning from how grammar-constrained sampling works (the guide's `maxLength` example confirms the keyword is enforced); no source measures the quality effect. **Unverified.** Keep `TITLE_MAX` and `DESCRIPTION_MAX` for title and description, and `clip()` after parsing as the safety net.

**`max_tokens`.** The current 400 is enough for the present schema. If `seen` is added, raise it, otherwise a long `seen` can end the reply before the JSON closes (the spike saw this once with Moondream, `design/specs/ai.md`).

## 3. Few-shot examples for small VLMs

- Demonstrations in the prompt mostly teach the label space, the input distribution and the output format; correct labels matter far less than expected. Source: https://arxiv.org/abs/2202.12837 (Min et al., "Rethinking the Role of Demonstrations"). Models tested were text LMs up to GPT-3 size, not VLMs.
- Few-shot results are unstable: the choice and order of examples moved accuracy from near chance to near state-of-the-art, and models are biased toward answers near the end of the prompt or common in pretraining. Source: https://arxiv.org/abs/2102.09690 (Zhao et al., "Calibrate Before Use"). GPT-3, text only.
- Qwen's report does not describe few-shot prompting for captioning, and none of the Qwen model card examples use few-shot. Source: https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct/raw/main/README.md

**Reading for our case.** The label-copying seen in `design/specs/ai.md` fits the first paper: examples and label lists present the label space, so the model samples from it regardless of the image. Both papers are about text models, so applying them to a 3B VLM is an inference. **Unverified** for Qwen2.5-VL.

**Recommendation.**
- Keep the current approach of describing categories in words with no label list.
- If an example is needed to fix format, use one example from a domain far from the library (for instance a bicycle in a garage) so the copied label space is harmless, and place it before the final instruction so recency bias works for the real task.
- Do not add an example per category.

## 4. Sampling

- Qwen ships `do_sample: true`, `temperature: 0.000001` (effectively greedy) and `repetition_penalty: 1.05` for both 3B and 7B. Sources: https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct/raw/main/generation_config.json and https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct/raw/main/generation_config.json
- llama-server defaults: `temperature` 0.8 (`--temp`), `repeat-penalty` 1.0 (disabled) on the CLI, and `repeat_penalty` documented as 1.1 on the completion endpoint docs. These differ within the same README, so state the value in the request. Source: https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md

**Recommendation.** Our `temperature: 0.2` is close to Qwen's own greedy default. Dropping to 0 to 0.1 is consistent with the shipped config. Send `repeat_penalty: 1.05` explicitly to match Qwen's setting; this stops tag lists repeating a word. Whether it changes tag quality here is **Unverified**; check it on the harness covers. I found no Qwen guidance on `top_p` or `top_k` for captioning.

## 5. Writing metadata for keyword search

**What the search does.** `mockups_fts` is `fts5(title, description, tags)` with no `tokenize` option, so it uses the default `unicode61` tokenizer, not `porter`. Source for tokenizers and the default: https://www.sqlite.org/fts5.html. The query builder appends `*` to every term (prefix match) and ANDs them (`src/main/db/repositories/search.ts`).

**Consequences** (derived from the FTS5 tokenizer behaviour plus our query builder):
- A stored token matches a query term only if the stored token starts with the term. Stored "bag" is found by "bag" and "ba" but not by "bags". Stored "bags" is found by "bag" and "bags".
- So store the longer form of a word pair when you must choose, or both. For nouns that gain a suffix (bag, bags; poster, posters; tee, tees), the plural contains the singular as a prefix, so **writing plurals in the indexed text matches both queries**. Pairs where the plural changes the stem (shelf, shelves) need both forms.
- No synonyms: "tee" does not find "t-shirt", "hoodie" does not find "sweatshirt", "cellphone" does not find "phone". The description is the cheapest place to add them.
- All terms are ANDed, so extra irrelevant words in a field reduce nothing, but a wrong word makes a mockup show up for a query it does not fit. Precision of nouns matters more than volume.
- FTS5 is a tokenizer match, so hyphenated labels ("t-shirt", "flat-lay") split into two tokens ("t", "shirt"); the query builder keeps `-` in terms. **Check the real behaviour** with a query test before relying on hyphenated tags in either direction; I did not run one.

**Expansion helps retrieval.** Adding terms that are likely to be searched to a document before indexing improves retrieval; this is document expansion. Source: https://arxiv.org/abs/1904.08375 (Nogueira et al., "Document Expansion by Query Prediction"). Their method uses a trained model on passage retrieval; the principle carries over, the numbers do not. Asking the VLM for "what a designer would type to find this" in the description is the cheap analogue. **Unverified** for VLM output.

**Prompt rules to add** (all follow from the points above; the model-behaviour side is **Unverified** until run on the harness):
1. Name the object in plain nouns a designer would search: "t-shirt", "hoodie", "iPhone", "business card", "paper bag".
2. Write the description so it contains the common alternative word once ("t-shirt, tee"), and the plural of the main object once.
3. Name brands and models only when printed on or clearly part of the device (MacBook, iPhone). Do not guess a model number.
4. Never copy visible text from the image into any field: watermarks, stock site names (the spike's MockupFree.co case), placeholder text, UI copy. The current system prompt says to ignore them; repeat the rule in the field list, where the model is generating.
5. Never write the word "mockup" or "template" in title, description or tags. Every item in the library is one, so the word matches everything and tells nobody anything.
6. Keep tag labels one to two words, lowercase, with no category word repeated in the label.

## 6. Image resolution and token cost

- Qwen2.5-VL resizes height and width to multiples of 28 and uses a 14 px patch stride, with 2x2 patches merged into one token. Source: technical report https://arxiv.org/html/2502.13923 (resizing to multiples of 28, stride 14) and `preprocessor_config.json` (`patch_size` 14, `merge_size` 2): https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct/raw/main/preprocessor_config.json
- So one visual token covers 28 x 28 px. A 1024 x 768 image is about 37 x 27, near 1,000 tokens (derived from the rule above).
- Model card: "The default range for the number of visual tokens per image in the model is 4-16384." It recommends setting `min_pixels` and `max_pixels` to something like a 256 to 1,280 token range "to balance speed and memory usage", and notes that "higher resolutions can enhance performance at the cost of more computation". Source: https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct/raw/main/README.md
- `preprocessor_config.json` defaults: `min_pixels` 3136, `max_pixels` 12,845,056. Source: same file as above.
- llama-server exposes `--image-min-tokens` and `--image-max-tokens` "only used by vision models with dynamic resolution (default: read from model)". Source: https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md. Qwen2.5-VL is in the llama.cpp multimodal list (https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/mtmd/README.md).

**Reading for our case.** Our 1024 px long edge lands at roughly 1,000 tokens, inside the card's recommended range. Mockup previews are large objects on plain backgrounds, so a smaller image probably names them just as well; the spike (`design/specs/ai.md`) found that shrinking SmolVLM2's input cut prompt time by more than half with no loss. **Unverified** for Qwen: test 768 px and 640 px on the harness covers. Smaller edges also trade away small printed text, which this task does not want read anyway. If tag quality on the clean MacBook cover drops, restore 1024.

## Open questions for the eval harness

1. Schema with a leading `seen` field vs the current order (title, description, tags). Measure tag precision and category correctness on 3B.
2. Image first vs text first.
3. `repeat_penalty` 1.05 vs 1.0, temperature 0 vs 0.2.
4. 768 px vs 1024 px edge, time and tag quality.
5. Description with synonyms and plural vs the current description, measured as recall on a list of realistic searches against the stored text (run through the real FTS5 query builder).
6. Hyphenated labels in FTS5: confirm what `t-shirt` and `flat-lay` match.
