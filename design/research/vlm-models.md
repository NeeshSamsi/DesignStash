# Which local vision models to test next

**Question:** is there a local vision-language model (or runtime) that hallucinates less than Qwen 2.5 VL 3B and 7B when it describes product photos, and that we can ship in a commercial, offline macOS app?

**Researched:** 2026-10-21. Builds on `design/research/vlm-prompting.md` and `vlm-prompting-2.md` (round 2, §8 listed Gemma 3 4B, InternVL3 2B and Gemma 4 E4B as untested candidates). Neither is repeated here.

**Sources read directly:** Hugging Face model cards (`README.md`), `generation_config.json`, `preprocessor_config.json` / `processor_config.json` and file listings (the `/api/models/<repo>/tree/main` endpoint, which gives each file's size and LFS sha256); llama.cpp source and docs at tag `b11748` (`tools/mtmd/clip-impl.h`, `src/llama-arch.cpp`, `tools/server/README.md`) and on master (`docs/multimodal.md`); llama.cpp pull requests and the GitHub compare API (to place each model's support relative to `b11748`); the Qwen2.5-VL, Qwen3-VL and InternVL3.5 technical reports (arXiv HTML); three 2026 arXiv papers that score several base models in one setup; Apple's Foundation Models documentation (JSON behind developer.apple.com) and the WWDC26 session page; the mlx-vlm README and the mlx-swift-lm repo listing.

**Rules for reading this doc.** Every number carries its source. Vendor numbers on a vendor's own model card are marked "(vendor)". Numbers I derived (memory, token counts, build numbers) say how. **Unverified** means no primary source was reachable; treat it as a hypothesis for the harness. Nothing here was run: no model was downloaded and the eval harness was not started.

## Summary

0. **The shipped default can't be sold as it stands.** Qwen2.5-VL 3B Instruct is under the Qwen Research License (`license_name: qwen-research`), which grants use "FOR NON-COMMERCIAL PURPOSES ONLY" and says "If you are commercially using the Materials, you shall request a license from us." Source: https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct/raw/main/LICENSE. The 7B is Apache 2.0 (https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct). The ggml-org GGUF is a conversion of the same weights, so the same terms apply. This alone means the default has to change or a licence has to be requested, whatever the hallucination results. Every shortlisted replacement below is Apache 2.0 except LFM2.5-VL.
1. **The runtime is already new enough.** llama.cpp `b11748` (published 2026-10-20) has projectors for every candidate below: `qwen3vl_merger`, `gemma4v`, `lfm2`, `internvl`, `minicpmv4_6`, `minicpmv4_7`, `granite4_vision`, `glm4v`, `kimivl`, `phi4`, `pixtral`, and the `qwen35` text architecture. Source: https://raw.githubusercontent.com/ggml-org/llama.cpp/b11748/tools/mtmd/clip-impl.h and https://raw.githubusercontent.com/ggml-org/llama.cpp/b11748/src/llama-arch.cpp. One exception: a fix to how LFM2-VL cuts images into tiles landed 26 commits after `b11748` (see §3).
2. **The newer Qwen generations score far higher on the hallucination benchmark that vendors report.** HallusionBench: Qwen2.5-VL 3B 46.3 and 7B 52.9 (Qwen2.5-VL report); Qwen3-VL 4B 64.1 and 2B 54.9 (vendor, quoted in the Qwen3.5 card); Qwen3.5 4B 65.0 and 9B 69.3 (vendor, mode not stated, the 4B and 9B default to thinking). HallusionBench tests image-context reasoning and visual illusions, so it is only a proxy for our failure.
3. **No public benchmark measures our failure** (inventing objects, settings and relations in a short product caption) across the current small models in one setup. The closest are three 2026 papers that score base models side by side on AMBER and Object HalBench (§2). They cover Qwen2.5-VL 7B, InternVL3.5 8B, Kimi-VL and Qwen3-VL 8B, never in the same paper as the 4B-class candidates. Our own harness is the only test that settles it.
4. **Thinking mode matters for Qwen3.5.** The 2B card reports HallusionBench 58.0 with thinking and 51.3 without, so Qwen3.5 2B without thinking is below Qwen3-VL 2B Instruct (54.9). The 4B and 9B think by default. We'd run them with thinking off for speed, so their published scores probably overstate what we'd get. That's why Qwen3-VL Instruct ranks first.
5. **Ranked shortlist** (details in §5): (1) Qwen3-VL 4B and 8B Instruct, (2) Qwen3.5 4B and 9B with thinking off, (3) Gemma 4 E4B, (4) LFM2.5-VL 3B. Optional: InternVL3.5 8B as a second large-tier candidate.
6. **Apple's Foundation Models framework takes images only from macOS 27.** `Attachment` and `ImageAttachmentContent` list macOS 27.0 as the first version. On macOS 26 it is text-only. It also needs Apple Intelligence turned on and a Swift helper, and Apple publishes no hallucination numbers for it. Not a default; possibly a later zero-download option (§4).
7. **MLX would mean a runtime change for no proven quality gain.** mlx-vlm (MIT) has an OpenAI-compatible server with `json_schema` structured outputs, but it is Python. mlx-swift-lm (MIT) runs Qwen3-VL, Qwen3.5, Gemma 4 and LFM2-VL from Swift. Both run the same weights, so they don't change hallucination. Speed could differ (**Unverified**). Stay on llama-server for these tests.

## 1. Comparison table

Sizes are the Q4_K_M model file plus an mmproj from the repo named, from the Hugging Face file listing. "Resident (est.)" adds 0.7 GB to the files, the overhead we measured for Qwen 2.5 VL 3B (2.77 GB of files, about 3.5 GB resident) and 7B (5.54 GB, about 6.3 GB) in `design/specs/ai.md`. It is an estimate and ignores per-architecture differences (**Unverified** until measured). "Tokens at 1024 px" assumes a 1024 x 768 cover.

| Model | Params | Licence | HallusionBench | POPE | MMStar | RealWorldQA | Q4_K_M + mmproj | Resident (est.) | Tokens at 1024 px | llama.cpp since |
|---|---|---|---|---|---|---|---|---|---|---|
| **Qwen2.5-VL 3B** (shipped default) | 3B | **Qwen Research License, non-commercial** | 46.3 [a] | 86.17 [f] | 55.9 [a] | 65.4 [a] | 1.93 + 0.84 = 2.77 GB | 3.5 GB (measured) | about 1,036 (28 px per token) | in use |
| **Qwen2.5-VL 7B** (shipped large) | 7B | Apache 2.0 | 52.9 [a] | 86.4 [c] | 63.9 [a] | 68.5 [a] | 4.68 + 0.85 = 5.54 GB | 6.3 GB (measured) | about 1,036 | in use |
| Qwen3-VL 2B Instruct | 2B | Apache 2.0 | 54.9 [b] | | 68.1 [b] | 69.5 [b] | 1.11 + 0.45 = 1.55 GB | 2.3 GB | 768 (32 px per token) | `b6887`, #16780 |
| **Qwen3-VL 4B Instruct** | 4B | Apache 2.0 | 64.1 [b] | | 73.2 [b] | 73.2 [b] | 2.50 + 0.45 = 2.95 GB | 3.7 GB | 768 | `b6887`, #16780 |
| **Qwen3-VL 8B Instruct** | 8B | Apache 2.0 | **Unverified** | | | | 5.03 + 0.75 = 5.78 GB | 6.5 GB | 768 | `b6887`, #16780 |
| Qwen3.5 2B (non-thinking default) | 2.3B | Apache 2.0 | 51.3 no-think, 58.0 think [b] | 88.7 [g] | 68.0 / 71.7 [b] | 71.2 / 74.5 [b] | 1.28 + 0.67 = 1.95 GB | 2.7 GB | 768 | `b7990`, #19468 |
| **Qwen3.5 4B** (thinking default) | 4.7B | Apache 2.0 | 65.0 [d] | 86.0 [g] | 78.3 [d] | 79.5 [d] | 2.74 + 0.67 = 3.41 GB | 4.1 GB | 768 | `b7990`, #19468 |
| **Qwen3.5 9B** (thinking default) | 9B | Apache 2.0 | 69.3 [d] | | 79.7 [d] | 80.3 [d] | 5.68 + 0.92 = 6.60 GB | 7.3 GB | 768 | `b7990`, #19468 |
| Gemma 4 E2B | 2.3B effective, 5.1B with embeddings | Apache 2.0 | | 84.0 [g] | 57.9 [g] | 56.2 [g] | QAT q4_0 3.35 + 0.99 = 4.34 GB | 5.0 GB | 280 by default (70 to 1,120) | about `b8641` (April 2026) |
| **Gemma 4 E4B** | 4.5B effective, 8B with embeddings | Apache 2.0 | | 86.9 [g] | 61.9 [g] | 61.8 [g] | QAT q4_0 5.15 + 0.99 = 6.15 GB | 6.9 GB | 280 by default | about `b8641`; vision fix `b10807`, #28335 |
| **LFM2.5-VL 3B** | 3.1B | LFM Open License 1.0 (revenue cap) | | 88.7 [g] | 63.3 [g] | 73.1 [g] | 1.67 + 0.58 = 2.26 GB | 3.0 GB | tiles of 512 px, 64 to 256 tokens each, plus a thumbnail | `b6183`, #15347; tile fix `b11774`, #30261 |
| LFM2-VL 3B | 3B | LFM Open License 1.0 | | 89.01 [f] | 57.73 [f] | 71.37 [f] | | | as above | `b6183` |
| InternVL3.5 4B | 4.7B | Apache 2.0 | 44.8 [c] | 88.9 [c] | 65.0 [c] | | 2.72 + 0.65 = 3.36 GB (bartowski) | 4.1 GB | | supported (`internvl`) |
| InternVL3.5 8B | 8B | Apache 2.0 | 54.5 [c] | 88.7 [c] | 69.3 [c] | | 5.03 + 0.68 = 5.71 GB (bartowski) | 6.4 GB | | supported (`internvl`) |
| MiniCPM-V 4.6 | 1.3B | Apache 2.0 | "Qwen3.5 2B level" (vendor, no number) | | | | 0.53 + 0.73 = 1.26 GB | 2.0 GB | | `b9049`, #22529 |
| MiniCPM-V 4.7 1B | 1B | Apache 2.0 | none published | | | | 0.67 + 0.90 = 1.57 GB | 2.3 GB | | `b11551`, #29416 |
| MiniCPM-V 4.5 | 8B | Apache 2.0 | | | | | 5.03 + 1.10 = 6.12 GB | 6.8 GB | "4x fewer than most" (vendor) | supported (`resampler`) |
| Granite Vision 4.1 4B | 4B | Apache 2.0 | | | | | 2.10 + 1.16 = 3.26 GB | 4.0 GB | | `b9532`, #23545 |
| Ministral 3 3B | 3B | Apache 2.0 | | | | | ggml-org has Q8_0 only: 3.65 + 0.45 = 4.10 GB | 4.8 GB | | `b7216`, #17644 |
| Phi-4-multimodal | 5.6B | MIT | | 85.6 [e] | | | no ggml-org GGUF | | | supported (`phi4`) |
| GLM-4.6V-Flash | 9B | MIT | GLM-4.1V-9B 63.2 [c] | GLM-4.1V-9B 87.1 [c] | | | 6.17 + 0.98 = 7.15 GB | 7.9 GB | | supported (`glm4v`) |
| Kimi-VL-A3B | 16B total, 3B active | MIT | 59.8 [c] | 86.5 [c] | 70.4 [c] | | only a Thinking GGUF on ggml-org | | | supported (`kimivl`) |
| Moondream 3.1 | 9B total, 2B active | Moondream licence 1.0 | | | | | no GGUF; runs in Moondream's Photon engine | | | not supported |

**Sources for the table:**
- [a] Qwen2.5-VL technical report, Table 3 (columns 72B, 7B, 3B; "HallBench avg"): https://arxiv.org/html/2502.13923
- [b] Qwen3.5 2B model card, vision table (Qwen3-VL 4B, Qwen3-VL 2B, Qwen3.5 2B, Qwen3.5 0.8B); Qwen3.5 scores "reported as Thinking / Non-thinking": https://huggingface.co/Qwen/Qwen3.5-2B (vendor)
- [c] InternVL3.5 technical report, Table 6 (MME, MMB, MMVet, MMStar, HallBench, CRPE, POPE; some rows sourced from OpenCompass): https://arxiv.org/html/2508.18265 (vendor of InternVL; competitors' rows are their own or OpenCompass runs)
- [d] Qwen3.5 4B and 9B model cards, vision table; the card doesn't say which mode these are in, and both models "operate in thinking mode by default": https://huggingface.co/Qwen/Qwen3.5-4B, https://huggingface.co/Qwen/Qwen3.5-9B (vendor)
- [e] Phi-4-multimodal card, vision table, POPE row (Phi-4 85.6, Qwen2.5-VL 3B 87.9, Qwen2.5-VL 7B 87.5 in Microsoft's run): https://huggingface.co/microsoft/Phi-4-multimodal-instruct (vendor)
- [f] LFM2-VL 3B card, VLMEvalKit run of all rows: https://huggingface.co/LiquidAI/LFM2-VL-3B (vendor)
- [g] LFM2.5-VL 3B card, second table (Liquid's run of Gemma 4 E2B/E4B, InternVL3.5, Qwen3.5 2B/4B): https://huggingface.co/LiquidAI/LFM2.5-VL-3B (vendor)

**Notes on the table:**
- **The same benchmark differs between sources.** POPE for Qwen2.5-VL 3B is 86.17 in Liquid's run [f] and 87.9 in Microsoft's [e]; MMStar is 55.9 in Qwen's report [a] and 56.13 in Liquid's [f]. Compare rows within one source where you can.
- **POPE barely separates these models:** every row sits between 84.0 and 90.7, including models far apart on everything else. HallusionBench spreads them over 44.8 to 69.3. Neither is a captioning test: POPE asks yes/no object-existence questions, and HallusionBench "emphasiz[es] nuanced understanding and interpretation of visual data" with control-group question pairs. Source: https://arxiv.org/abs/2310.14566.
- **Qwen2.5-VL 3B licence:** see Summary item 0. Every newer Qwen model above is Apache 2.0 by its card's `license:` field.
- **Gemma 4 sizes are large for the parameter count** because of Per-Layer Embeddings: E4B is "4.5B effective (8B with embeddings)". Source: https://huggingface.co/google/gemma-4-E4B-it. The ggml-org repo has only Q8_0 (8.03 GB); Google's own QAT file is `gemma-4-E4B_q4_0-it.gguf` at 5.15 GB.
- **The MiniCPM-V and Granite cards carry no hallucination numbers in text** (tables are images or missing). Granite Vision 4.1 is tuned for "structured document extraction tasks: chart extraction, table extraction, and semantic key-value pair extraction". Source: https://huggingface.co/ibm-granite/granite-vision-4.1-4b. That isn't our task, so it isn't shortlisted.

## 2. What the hallucination evidence says

**Vendor HallusionBench, newest first.** Qwen3.5 9B 69.3, Qwen3.5 4B 65.0 [d]; Qwen3-VL 4B 64.1, Qwen3-VL 2B 54.9, Qwen3.5 2B 58.0 with thinking and 51.3 without [b]; GLM-4.1V 9B 63.2, Kimi-VL-A3B 59.8, InternVL3.5 8B 54.5, InternVL3.5 4B 44.8, Gemma 3 12B 47.2 [c]; Qwen2.5-VL 7B 52.9, 3B 46.3 [a]. Gemma 4, LFM2.5-VL and the MiniCPM-V 4.x cards publish no HallusionBench number.

**Same-setup generative hallucination (2026 papers that test several base models).** These are the only side-by-side numbers on free-form description I found. Each paper trains a fix; only the untrained "vanilla/base" rows are quoted.

- ViPSy, Table 6, vanilla rows. Object HalBench response / mention rate (lower is better), AMBER CHAIR / Hal / Cog (lower is better):
  - Qwen2.5-VL 7B: 9.0 / 5.3, AMBER 5.0 / 26.4 / 1.7.
  - InternVL3.5 8B: 8.3 / 4.6, AMBER 4.3 / 24.6 / 1.5.
  - Kimi-VL-A3B: 5.6 / 3.5, AMBER 5.9 / 38.8 / 3.8.

  Source: https://arxiv.org/html/2606.28401 (Appendix G.1). So InternVL3.5 8B hallucinates a little less than our 7B in free description, and Kimi-VL trades fewer object errors for many more AMBER hallucinated responses.
- SAVOR, Table 1, base rows (their own eval settings): InternVL3-8B AMBER CHAIR 18.2, Qwen3-VL 8B Instruct 16.4; POPE F1 85.2 and 86.5. Source: https://arxiv.org/html/2609.16601. The CHAIR scale differs from ViPSy's by a factor of three or more, so the two papers can't be compared with each other.
- The same SAVOR table shows decoding-time methods (VCD, OPERA, HALC, Woodpecker) lowering AMBER CHAIR on InternVL3-8B from 18.2 to between 12.4 and 14.8 without training. That is research-methods territory (brief B), noted here because it is the same size of gain as a model change.

**What the evidence does not show.** No source scores Qwen3-VL 4B, Qwen3.5 4B, Gemma 4 E4B or LFM2.5-VL on AMBER, CHAIR or Object HalBench next to Qwen2.5-VL 3B. A search for such a table found only papers covering one or two of them. So the gain on our 39 covers is **Unverified** for every candidate. The evidence is strong only for "Qwen3-VL and Qwen3.5 answer image-context questions better than Qwen2.5-VL", and moderate for "InternVL3.5 8B describes slightly more faithfully than Qwen2.5-VL 7B".

**How our failures map to the benchmarks.** Our recurring errors (`design/specs/ai.md` "Known limits" and the brief) are: a wrong object class for an unusual shape (curved laptop, laptop chair), invented scene content (cosmic sky, tape and folder), wrong spatial relations (hanging from a hook, on wrists), and copying printed text. The first two are AMBER/CHAIR-type object and attribute hallucinations; the third is a relation error (AMBER has a relation dimension: https://arxiv.org/abs/2311.07397); the fourth is an instruction-following failure that no hallucination benchmark measures. So even a perfect benchmark ranking would leave text copying to prompt and post-processing work.

## 3. Runtime: llama.cpp support and flags

**`b11748` is recent.** It was published 2026-10-20 (GitHub releases API: `published_at` 2026-10-20T00:23:31Z). The newest release on 2026-10-21 was `b11796`. Source: https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/b11748.

**When each model's support landed.** llama.cpp tags each master commit as `b<N>`, so a PR merged k commits before `b11748` landed near `b(11748 - k)`. I took k from the GitHub compare API (`ahead_by` from the merge commit to `b11748`). This assumes a linear master and is an approximation; check the exact tag before pinning.

| Model | PR | Merged | Approx. first tag | In `b11748`? |
|---|---|---|---|---|
| LFM2-VL family | #15347 | 2025-08-16 | `b6183` | yes |
| Qwen3-VL | #16780 | 2025-10-30 | `b6887` | yes |
| Ministral 3 | #17644 | 2025-12-01 | `b7216` | yes |
| Qwen3.5 (dense and MoE, with vision) | #19468 | 2026-02-10 | `b7990` | yes |
| Gemma 4 (template fix, support existed by then) | #21326 | 2026-04-02 | `b8641` | yes |
| MiniCPM-V 4.6 | #22529 | 2026-05-06 | `b9049` | yes |
| Granite 4 Vision | #23545 | 2026-06-05 | `b9532` | yes |
| "use pillow-accurate algo, correct resize_algo for all models" | #27594 | 2026-08-23 | `b10598` | yes |
| Gemma 4 vision fix (causal attention for E2B/E4B, vision token budget) | #28335 | 2026-09-04 | `b10807` | yes |
| MiniCPM-V 4.7 | #29416 | 2026-10-10 | `b11551` | yes |
| **LFM2 tiles and layout match transformers** | #30261 | 2026-10-20 16:54 | `b11774` | **no, 26 commits later** |

Sources: https://github.com/ggml-org/llama.cpp/pull/16780, /pull/19468, /pull/21326, /pull/22529, /pull/23545, /pull/27594, /pull/28335, /pull/29416, /pull/30261 (all under `https://github.com/ggml-org/llama.cpp`). The Qwen3.5 PR says it "has been verified with preview checkpoints from the Qwen Team in both vision and pure text modes". The LFM2 fix PR says llama.cpp "kept the image's shape and filled the rest with black bars" where the Python reference stretches the image, and that rounding gave some sizes "another number of tokens". **Test LFM2.5-VL on `b11774` or later**, or its results won't reflect the model.

**Flags we'd need per model** (for `MODEL_SERVER_ARGS` in `provider-factory.ts`). From the `b11748` server README: https://raw.githubusercontent.com/ggml-org/llama.cpp/b11748/tools/server/README.md.
- **Thinking off:** `--reasoning off` ("Use reasoning/thinking in the chat ('on', 'off', or 'auto')"), or per request `chat_template_kwargs: {"enable_thinking": false}`. `--reasoning-budget 0` is the other route ("0 for immediate end"). Needed for Qwen3.5 4B and 9B. Gemma 4 thinks only when the system prompt starts with `<|think|>`, so it needs nothing. Source: https://huggingface.co/google/gemma-4-E4B-it.
- **Image token budget:** `--image-min-tokens` / `--image-max-tokens` ("only used by vision models with dynamic resolution"). Useful to hold Gemma 4 at its default 280 or test 560, and to cap LFM2.5-VL.
- **JSON schema:** all candidates go through the same llama.cpp grammar, so `response_format: json_schema` and our ASCII `pattern` work unchanged. With thinking on, the grammar would have to allow a reasoning block first; with thinking off this doesn't arise. **Unverified** for Qwen3.5 with thinking on; don't test that combination first.

**Sampling the vendors recommend** (our harness uses temperature 0.2, `repeat_penalty` 1.05, tuned for Qwen2.5-VL):
- Qwen3-VL 4B and 8B: `temperature` 0.7, `top_p` 0.8, `top_k` 20, `repetition_penalty` 1.0; the card's VL eval settings add `presence_penalty` 1.5. Sources: https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct/raw/main/generation_config.json and the card.
- Qwen3.5, non-thinking, general tasks: `temperature` 0.7, `top_p` 0.8, `top_k` 20, `presence_penalty` 1.5, `repetition_penalty` 1.0. The card warns a high presence penalty "may occasionally result in language mixing". Source: https://huggingface.co/Qwen/Qwen3.5-4B.
- Gemma 4: `temperature` 1.0, `top_p` 0.95, `top_k` 64 "across all use cases"; put the image before the text. Source: https://huggingface.co/google/gemma-4-E4B-it.
- LFM2.5-VL: text `temperature` 0.2, `top_k` 50, `repetition_penalty` 1.0. Source: https://huggingface.co/LiquidAI/LFM2.5-VL-3B.

These are vendor defaults for general chat. For tagging, the harness should run each model at our 0.2 first (comparable to the baseline), then at the vendor setting, because round 1 found Qwen2.5-VL ships a near-greedy default and the right setting for this task is **Unverified** per model.

**Visual tokens.** Qwen3-VL and Qwen3.5 use `patch_size` 16 and `merge_size` 2 (https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct/raw/main/preprocessor_config.json, https://huggingface.co/Qwen/Qwen3.5-4B/raw/main/preprocessor_config.json), so one token covers 32 x 32 px. A 1024 x 768 cover is 768 tokens against about 1,036 for Qwen2.5-VL's 28 px (derived). Gemma 4's `image_seq_length` is 280, with budgets 70, 140, 280, 560 and 1,120, and the card advises "lower budgets for classification, captioning". LFM2.5-VL tiles at 512 px with 64 to 256 tokens per tile, up to 10 tiles, plus a thumbnail (https://huggingface.co/LiquidAI/LFM2.5-VL-3B/raw/main/processor_config.json). Fewer image tokens means a faster prompt; whether it changes hallucination on our covers is **Unverified**.

## 4. Other runtimes

**Apple Foundation Models framework.**
- The framework exists from macOS 26.0, but image input arrives in macOS 27. `Attachment` ("Use Attachment to include media such as images alongside text in your prompts") and `ImageAttachmentContent` list iOS, iPadOS, macOS and visionOS 27.0 as their first versions. Sources: https://developer.apple.com/tutorials/data/documentation/foundationmodels.json, https://developer.apple.com/tutorials/data/documentation/foundationmodels/attachment.json, https://developer.apple.com/tutorials/data/documentation/foundationmodels/imageattachmentcontent.json.
- Apple's guide suggests "isolating a region of interest" before passing an image "to an on-device model", using `Generable` "to constrain responses to specific formats", and says the framework does its own scaling and colour conversion. Source: https://developer.apple.com/documentation/foundationmodels/analyzing-images-with-multimodal-prompting (JSON form under the same path).
- The WWDC26 session "What's new in image understanding" covers "Image inputs for Foundation Models" for "caption generation, scene understanding" and compares it with the Vision framework. Source: https://developer.apple.com/videos/play/wwdc2026/237/.
- The 2025 tech report describes a roughly 3B on-device model that understands images. Source: https://arxiv.org/abs/2507.13575. I found no Apple hallucination benchmark for it and no 2026 report.
- Fit for us: zero download and no RAM of our own, but macOS 27 or later only, Apple Intelligence must be on, and it needs a Swift helper (the app can ship small native helpers). Its licence terms for app use were not read (**Unverified**). Worth a later spike as an optional provider on macOS 27. It can't be the default while we support macOS 26.

**MLX.**
- mlx-vlm: MIT, v0.7.9 released 2026-10-19 (GitHub API). It supports Gemma 4, MiniCPM-V 4.6 and 4.7, Qwen3.5 and more, and its server's `/v1/chat/completions` "support[s] OpenAI-compatible `json_schema` structured outputs". It disables thinking by default on the server. Source: https://raw.githubusercontent.com/Blaizzy/mlx-vlm/main/README.md. It is a Python package, so shipping it means bundling Python and MLX.
- mlx-swift-lm (MIT, "LLMs and VLMs with MLX Swift") has VLM model files for `Qwen3VL`, `Qwen35`, `Gemma4`, `LFM2VL`, `Qwen25VL`, `Mistral3`, `SmolVLM2`, `FastVLM` and others. Source: https://github.com/ml-explore/mlx-swift-lm/tree/main/Libraries/MLXVLM/Models. A Swift helper built on it would avoid Python. I didn't check whether it has grammar-constrained JSON (**Unverified**).
- Neither changes the weights, so neither should change hallucination by itself. Image preprocessing can differ between runtimes (the LFM2 tiling bug above is an example), which could move quality either way. Speed versus llama.cpp Metal on M1/M2 is **Unverified**; I found no primary benchmark. Recommendation: keep llama-server for model selection. Revisit MLX only if a chosen model is too slow on a base M1.

## 5. Ranked shortlist to test

Ordered by expected hallucination gain per unit of effort and risk. Every one runs on `b11748` except LFM2.5-VL, and every one fits the existing `model.gguf` + `mmproj.gguf` layout and `MODEL_SERVER_ARGS`. The download URL pattern is `https://huggingface.co/<repo>/resolve/main/<file>`; sha256 is the LFS oid from the file listing.

### 1. Qwen3-VL 4B Instruct (default) and 8B Instruct (large tier)

- **Why first.**
  - HallusionBench 64.1 against our 3B's 46.3 [a][b], RealWorldQA 73.2 against 65.4, MMStar 73.2 against 55.9.
  - Instruct-only, so no thinking mode can leak in.
  - First-party GGUFs from the Qwen team with a Q8_0 mmproj, the same packaging as today.
  - Same chat family as Qwen2.5-VL, so the tuned prompt is the most likely to carry over.
  - Fewer image tokens: 768 against about 1,036 at 1024 px.
- **Files** (repo `Qwen/Qwen3-VL-4B-Instruct-GGUF`):
  - model `Qwen3VL-4B-Instruct-Q4_K_M.gguf`, 2,497,281,664 B, sha256 `66358cb18bb6b3b1b6675aa412c7a88ef01d228f481184d13668e5201c730a0a`
  - mmproj `mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf`, 453,974,304 B, sha256 `30ba2c7dd3127a4561b6cba9d13d0f711c91bdb38742e2f56d73c8cb596bd06d`
  - Variant worth one run: `Qwen3VL-4B-Instruct-Q8_0.gguf`, 4,280,406,144 B, sha256 `054721f478bc5fa6beffb7f38eae575d45298f88cbb8d2f83ef675a727863eb1`. With the mmproj it is 4.73 GB of files (about 5.4 GB resident, est.), still under the 6 GB target, and it tests round 2's quantisation question on a model that fits.
- **Files** (repo `Qwen/Qwen3-VL-8B-Instruct-GGUF`):
  - model `Qwen3VL-8B-Instruct-Q4_K_M.gguf`, 5,027,784,800 B, sha256 `67d1659bfe71b89d50b45a4ad1a9e5b997e5bb16ce5da66a6a6167abd569e9e2`
  - mmproj `mmproj-Qwen3VL-8B-Instruct-Q8_0.gguf`, 752,289,728 B, sha256 `c6ba85508d82f42590e6eb77d5340369ab6fecf107a7561d809523d8aa5f3bfd`
- **llama.cpp:** `b11748` as pinned (support since about `b6887`). **Flags:** none expected.
- **Risks:**
  - The 8B's HallusionBench number was not found in text (**Unverified**).
  - The 4B is larger than our 3B (2.95 GB against 2.77 GB of files), so speed on a base M1 may be slower (**Unverified**; measure it).
  - The prompt was tuned on Qwen2.5-VL and the 7B moved 7 points from one line, so expect a re-tune.
  - The vendor sampling defaults (temperature 0.7) are far from ours.

### 2. Qwen3.5 4B (default) and 9B (large tier), thinking off

- **Why.**
  - The newest Qwen generation, "early fusion training on multimodal tokens" (https://huggingface.co/Qwen/Qwen3.5-2B).
  - Highest vendor HallusionBench of the shortlist (65.0 and 69.3 [d]), RealWorldQA 79.5 and 80.3, Apache 2.0, the same 768-token image budget.
- **Why second.**
  - Those scores are probably in thinking mode, and at 2B, turning thinking off costs 6.7 HallusionBench points and drops below Qwen3-VL 2B [b].
  - Liquid's run puts Qwen3.5 4B's POPE at 86.0, the lowest in its table [g].
  - No first-party GGUF; the files are from unsloth. The Qwen cards also describe the small Qwen3.5 sizes as meant for "prototyping, task-specific fine-tuning, and other research or development purposes" (2B card). The licence itself is Apache 2.0, so this reads as a usage note.
- **Files** (repo `unsloth/Qwen3.5-4B-GGUF`):
  - model `Qwen3.5-4B-Q4_K_M.gguf`, 2,740,937,888 B, sha256 `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`
  - mmproj `mmproj-F16.gguf`, 672,423,616 B, sha256 `cd88edcf8d031894960bb0c9c5b9b7e1fea6ebee02b9f7ce925a00d12891f864`
  - Alternative: `lmstudio-community/Qwen3.5-4B-GGUF`, `Qwen3.5-4B-Q4_K_M.gguf` 2,707,513,696 B, sha256 `25082a7dd3776cc3c741c6347d3bd04523f05796607b3fbc32fa3a25dfa1418c`, with `mmproj-Qwen3.5-4B-BF16.gguf`.
- **Files** (repo `unsloth/Qwen3.5-9B-GGUF`):
  - model `Qwen3.5-9B-Q4_K_M.gguf`, 5,680,522,464 B, sha256 `03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8`
  - mmproj `mmproj-F16.gguf`, 918,166,080 B, sha256 `f70dc3509053962b0d0d3ee8a7eacebf5d60aa560cad78254ae8698516ae029f`
  - The 9B's 6.6 GB of files (about 7.3 GB resident, est.) suits the 16 GB+ tier only.
- **llama.cpp:** `b11748` (support since about `b7990`). **Flags:** `--reasoning off` (or `chat_template_kwargs: {"enable_thinking": false}` in the request).
- **Risks:**
  - Thinking text leaking into the JSON if the flag is missed.
  - The hybrid Gated DeltaNet architecture's speed on Metal is unmeasured (**Unverified**).
  - Third-party quantisation; the Qwen card's recommended `presence_penalty` 1.5 can cause language mixing, which our ASCII grammar blocks but may distort.
- A one-off run with thinking on and a small `--reasoning-budget` (for example 128) would show whether reasoning helps hallucination. Its time cost likely breaks the 10 s target (**Unverified**).

### 3. Gemma 4 E4B (E2B as the small fallback)

- **Why.**
  - A different model family, so its errors won't share Qwen's priors: a cross-check on whether our hallucinations are Qwen habits or hard covers.
  - Apache 2.0, first-party QAT GGUF from Google.
  - Only 280 image tokens by default, so the prompt is short.
  - The card lists "Object detection" and "pointing" among image skills.
- **Why third.**
  - No hallucination number published.
  - Liquid's run scores it below Qwen3.5 4B on MMStar (61.9 vs 73.3), RealWorldQA (61.8 vs 76.2) and above it on POPE (86.9 vs 86.0) [g].
  - E4B's files are 6.15 GB because of Per-Layer Embeddings, over the 6 GB default target.
- **Files** (repo `google/gemma-4-E4B-it-qat-q4_0-gguf`):
  - model `gemma-4-E4B_q4_0-it.gguf`, 5,154,941,280 B, sha256 `676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee`
  - mmproj `gemma-4-E4B-it-mmproj.gguf`, 991,552,256 B, sha256 `7498a37cb619e55f2fcf87eb931f56e99389ed6d432e4c5c66110694c0d65578`
  - Or `unsloth/gemma-4-E4B-it-GGUF`: `gemma-4-E4B-it-Q4_K_M.gguf` 4,977,171,584 B, sha256 `85a896a047553e842f25297ee5b031d64ff30147d9c4af17b1e4b394cd1fab87`.
- **E2B** (repo `google/gemma-4-E2B-it-qat-q4_0-gguf`):
  - model `gemma-4-E2B_q4_0-it.gguf`, 3,349,516,256 B, sha256 `fa401b55b07ee70a54c6dae3903c783a6e65064312529ea57175cb5f8dec6634`
  - mmproj `gemma-4-E2B-it-mmproj.gguf`, 986,833,664 B, sha256 `021059cce659fe7f9170d5599761d7bbaf644b798dab9503aca30dc43e6beb14`
- **llama.cpp:** `b11748`, which includes the E2B/E4B vision fix #28335 (about `b10807`). **Flags:** none required; try `--image-max-tokens 560` as a variant.
- **Risks:**
  - Memory over target.
  - The vendor sampling (temperature 1.0) is far from ours.
  - Whether the PLE weights page well under memory pressure on an 8 GB Mac is **Unverified**.

### 4. LFM2.5-VL 3B

- **Why.**
  - Smallest and likely fastest of the shortlist (2.26 GB of files).
  - Liquid's runs put it above Qwen2.5-VL 3B on MMStar (63.3 for LFM2.5 against 56.13 for Qwen2.5-VL 3B) and RealWorldQA (73.1 against 65.23), with POPE 88.7 against 86.17 [f][g]; those Qwen2.5 numbers are from Liquid's VLMEvalKit run of LFM2-VL 3B's table.
  - A useful low-memory option for 8 GB Macs.
- **Why fourth.**
  - Vendor-only evidence.
  - The licence: LFM Open License 1.0 grants commercial use only while "You or Your Legal Entity" stays under annual revenue of $10,000,000; above that, commercial use "is not licensed under this Agreement". Source: https://huggingface.co/LiquidAI/LFM2-VL-3B/raw/main/LICENSE. Fine for now, a ceiling later.
  - The b11748 tiling bug.
- **Files** (repo `LiquidAI/LFM2.5-VL-3B-GGUF`):
  - model `LFM2.5-VL-3B-Q4_K_M.gguf`, 1,674,455,072 B, sha256 `2436cf4bbac9a16e5dfc7799a140e583c2bc15958f4b24a391f8a8b10ecb8884`
  - mmproj `mmproj-LFM2.5-VL-3B-Q8_0.gguf`, 583,109,984 B, sha256 `ecbbe7097f696dba67172738d79c9f01132cdb6c0b457606315e268df3d67e64`
- **llama.cpp:** `b11774` or later (#30261, the tile and layout fix, is not in `b11748`). **Flags:** none known; `--image-max-tokens` if tiling makes prompts long.
- **Risks:**
  - The licence cap.
  - The pin bump.
  - Up to 10 tiles of 256 tokens could make long-scroll covers slow (**Unverified**).

### Optional 5. InternVL3.5 8B (large tier only)

- **Why.** The only candidate with same-setup evidence of more faithful free description than our 7B: AMBER CHAIR 4.3 against 5.0, Object HalBench response rate 8.3 against 9.0 (ViPSy Table 6); HallBench 54.5 against 52.9 [c].
- **Why optional.** The gain is small; the 4B scores below our 3B on HallBench (44.8 against 46.3 [c]); the GGUF is third-party (`bartowski/OpenGVLab_InternVL3_5-8B-GGUF`: `OpenGVLab_InternVL3_5-8B-Q4_K_M.gguf` 5,027,780,800 B, sha256 `f3792d241a77a88be986445fed2498489e7360947ae4556e58cb0833e9fbc697`, with `mmproj-OpenGVLab_InternVL3_5-8B-f16.gguf` 678,065,568 B).
- **Flags:** none known.

### Not shortlisted, and why

- **MiniCPM-V 4.6 and 4.7 1B:** tiny (1.26 and 1.57 GB) and Apache 2.0. But Artificial Analysis reports 4.6 "shows weaknesses on knowledge recall and hallucination avoidance" (secondary source, https://artificialanalysis.ai/articles/openbmb-launches-minicpm-v-4-6-1-3b-instruct). The spike already showed 2B-class models (SmolVLM2) failing this task (`design/specs/ai.md`).
- **MiniCPM-V 4.5 8B:** no hallucination number in text; Qwen3-VL 8B covers the 8B slot.
- **Phi-4-multimodal:** below Qwen2.5-VL on POPE in Microsoft's own table (85.6 against 87.9 and 87.5 [e]), and no ggml-org GGUF.
- **Kimi-VL-A3B:** 16B total weights, and its AMBER Hal of 38.8 is the worst in ViPSy's table.
- **GLM-4.6V-Flash:** a 9B reasoning model at 7.15 GB of files; too heavy and slow for the default.
- **Granite Vision 4.1:** built for document extraction.
- **Ministral 3 3B:** Apache 2.0 and supported since about `b7216`, but no hallucination numbers in text and only a Q8_0 GGUF on ggml-org.
- **Moondream 3.1:** custom licence and no llama.cpp support.
- **Gemma 3 4B:** superseded by Gemma 4 under a simpler licence; its card is gated and wasn't read.
- **Apple Foundation Models:** macOS 27 only (§4).
- **Qwen3.6 and Qwen3.8:** the Qwen org lists only 27B and larger for these (https://huggingface.co/Qwen, sorted by date), too big for the default.

## 6. How to run the comparison on our harness

1. **One baseline row per model, no prompt change:** run the shipped `v4` request (the brief's "v4 is the shipped request") at temperature 0.2, three passes, as for the Qwen2.5 numbers. This shows how much of the gain is the model.
2. **Then the vendor sampling** for that model, three passes.
3. **Measure per model:** found and clean (as now), count of the brief's named hallucinations (curved laptop, cosmic sky, lamp or book for boxes, hook, wrist, tape and folder, handwritten note, glowing lightbox, quoted text), seconds per cover, and resident memory after one request (as in the spike).
4. **Measure speed on a base M1 or M2,** not only the M3 Max. The spike's 3.6 to 4.3 s for the current 3B was on an M3 Max with 36 GB, and the 10 s target is for a base chip. Estimating base-chip speed from the M3 Max is **Unverified**.
5. **Order:** Qwen3-VL 4B, Qwen3.5 4B, Gemma 4 E4B, LFM2.5-VL 3B for the default tier; Qwen3-VL 8B, Qwen3.5 9B, InternVL3.5 8B against Qwen2.5-VL 7B for the large tier. Stop early if one 4B-class model beats the 7B's 70% / 75% on found / clean.

## Open questions

- Qwen3-VL 8B's HallusionBench and any AMBER or CHAIR result for Qwen3-VL 4B, Qwen3.5 4B, Gemma 4 E4B or LFM2.5-VL in the same setup as Qwen2.5-VL 3B. None found.
- Exact first release tags: the build numbers above are derived from commit counts.
- Apple Foundation Models' app-use terms and whether its on-device model hallucinates less; nothing published.
- Real memory and speed of each candidate on an 8 GB M1 or M2.
