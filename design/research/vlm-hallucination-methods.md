# Inference-time techniques against VLM hallucination

**Question:** with no training, what measurably reduces hallucination when a small VLM captions and tags a mockup, and which of those techniques fit our setup: llama.cpp `llama-server` b11748 running Qwen 2.5 VL 3B/7B at Q4_K_M?

**Researched:** 2026-10-21 (round 3, brief B). This builds on `vlm-prompting.md` and `vlm-prompting-2.md` and doesn't repeat them.

**Sources read directly:**
- llama.cpp at tag `b11748` (sparse clone of `tools/server`, `tools/mtmd`), and its server README.
- arXiv abstracts for every paper cited.
- The full text of these papers: VCD, M3ID, ICD, OPERA, POPE, LURE, CLIP-Guided Decoding, "Delve into VCD", "Words or Vision", reference-free hallucination detection, and the Qwen2.5-VL-7B self-correction paper.
- The Qwen2.5-VL model card, `config.json` and technical report.
- The NeurIPS 2026 page for the FaceTri paper.
- Crossref records for the two statistics papers.

**Repo evidence:**
- Code: `src/main/ai/*`, `scripts/ai-eval/run.ts` and `prompts/prompt-version.ts`.
- Data: `gold.json`, plus `results.json` and `score.md` for v4 on both models, read-only. Numbers from these files are labelled **run data**.

Nothing was run on the GPU. **Unverified** marks a claim with no primary source behind it, or a cost estimate that hasn't been measured.

## Summary

1. **llama-server b11748 already has the plumbing for verification.** All of this is confirmed in the source:
   - token logprobs on the chat endpoint;
   - several samples per request;
   - a prompt cache that keeps the image's KV when the prefix is the same.

   In our own runs, asking again about a cached cover processed one new prompt token in 13 ms (3B) and 27 ms (7B). A follow-up question about the same cover costs about as much as the new text plus the reply.
2. **Contrastive and attention-based decoding (VCD, M3ID, ICD, OPERA, PAI, SID, DeCo and others) can't run through llama-server's HTTP API.** They need the logits of two inputs combined at every token, or access to attention and hidden states. Their evidence also comes mostly from yes/no benchmarks on 2023-era models, and the gains vary a lot by model. Park them.
3. **The best-supported cheap wins are verification and consistency.**
   - Verification: ask the model yes/no about each claim, with the image cached, and read P(yes) from logprobs.
   - Consistency: keep only the tags that recur across samples or views.

   In a study of reference-free detection, consistency checks beat token-probability checks on open-ended text. Token probability was still about twice the random baseline on yes/no answers.
4. **Run data says where to aim.** The object noun is mostly right: a gold object label is in the title or tags for 86% of 3B answers and 95% of 7B answers. Only 52% (3B) and 56% (7B) of tag labels appear anywhere in the gold text. The labels that miss most are setting and style words the model reaches for by default ("Minimal", "Desk", "Indoor"). Setting, relation and attribute claims are where the hallucinations are.
5. **Fuse evidence in code.** VLMs over-trust text in the prompt when it disagrees with the image, and an instruction to focus on the image barely moves that (Qwen2-VL-7B: 16.8% to 14.2%). So weigh the names, the printed text and the image per field in code, with weights measured on the gold set:
   - the names and printed text decide the object noun and product name, when the image confirms it;
   - the image alone decides the setting, colours and relations.

## 1. What our failures are

The recurring failures in the brief, sorted into AMBER's three hallucination types (existence, attribute, relation; https://arxiv.org/abs/2311.07397), plus two of our own:

| Type | Examples from the runs |
|---|---|
| Existence (an object that isn't there) | roll of tape and folder next to postal mailers; Laptop and T-shirt tags on stacked boards; "leather chair"; Environment: Desk where gold has none |
| Attribute | "flexible", "curved" or "foldable" MacBook; "glowing" unlit lightbox; "cosmic, starry" sand |
| Relation | tote "hanging from a hook"; Apple Watch "on wrists" |
| Misidentification | stacked boxes called a lamp, book, sign or business card |
| Printed text | quoting words printed on the product (handled by `parseResult`; brief C covers OCR) |

**Run data, v4, 39 covers × 3 passes:** a gold object label appears in the title or tags for 86% of 3B answers and 95% of 7B answers. Only 52% (3B) and 56% (7B) of tag labels appear anywhere in the gold title, description or tags. The labels that miss most:

| Model | Most frequent labels not in the gold text |
|---|---|
| 3B | Style: Minimal 41, Minimalist 33; Environment: Desk 15, Indoor 13, White background 11 |
| 7B | Style: Minimal 55; Environment: Indoor 18, Desk 15; Style: Realistic 14; Device: Screen 10 |

This is a string match, so a missing label isn't always a wrong one: "minimal" can be true without gold saying it. It still shows that the weak fields are setting and style.

**Why the defaults look like this.** POPE found that LVLMs hallucinate objects that are frequent in instruction data, or that co-occur with objects really in the image (laptop, mouse and keyboard). Source: https://arxiv.org/abs/2305.10355 (§3). "Desk" next to a laptop or stationery, and "tape" next to mailers, fit that pattern. LURE found three things (https://arxiv.org/abs/2310.00754):

- hallucinated objects cluster where decoding is uncertain;
- they cluster in the later part of a description;
- they cluster on co-occurring objects.

CLIP-Guided Decoding found later sentences hallucinate more across several LVLMs. Source: https://arxiv.org/abs/2402.15300 (§3, Fig. 2a). Both argue for short output with the main object first, which the shipped prompt already does.

## 2. What llama-server b11748 can do (checked in source)

All paths are in `ggml-org/llama.cpp` at tag `b11748`, published 2026-10-20 (`gh api repos/ggml-org/llama.cpp/releases/tags/b11748`).

| Capability | Where | Notes |
|---|---|---|
| Logprobs on `/v1/chat/completions` | `tools/server/server-common.cpp` (search `Handle "logprobs" field`) | `logprobs: true` sets `n_probs` to `top_logprobs`, default 20. The code says the response shape is "not yet OAI-compatible". |
| Probabilities after sampling | server README, `post_sampling_probs` | Returns `top_probs` after the sampler chain, grammar included. With greedy sampling the plain probabilities are "a simple softmax of the logits". |
| Several samples per request | `server-schema.cpp`: `n_cmpl`, alias `n`, hard limit `n_parallel` | The prompt is processed once and its state is copied to the child slots (`server-context.cpp`, "copying state to child"). With our `--parallel 1`, `n` can only be 1. |
| Image prompt cache | `server_tokens::get_common_prefix` in `server-common.cpp`; `mtmd_helper_bitmap_init_from_buf` in `tools/mtmd/mtmd-helper.cpp` | An image chunk matches when its id matches, and the id is the sha256 of the image bytes. Same system message plus same image means the image KV is reused, and only the text after it is processed. |
| Host-RAM prompt cache | README `--cache-ram` (default 8192 MiB), `--cache-idle-slots` | This is why later passes hit the cache across different covers. |
| `logit_bias`, `seed`, `grammar`, `samplers` | README `/completion` options; `server-common.cpp` copies unknown chat params through ("This allows user to use llama.cpp-specific params") | Per request. |
| Combining logits of two inputs per token, attention maps, hidden states | none | Needs a custom native build (§3). |

**Cost model from run data** (M3 Max, v4, pass 0, averages over 39 covers):

| Model | Whole request | Prompt (about 1,362 tokens, about 1,000 of them image) | Reply |
|---|---|---|---|
| 3B | 3.6 s | 2.2 s | 112 tokens in 1.3 s (86 t/s) |
| 7B | 10.6 s | 5.1 s | 126 tokens in 5.3 s (24 t/s) |

The 7B rate looks low next to its later passes (up to 32 t/s), so the GPU may have been shared.

On passes 1 and 2, `cache_n` was 1,417 and `prompt_n` was 1, with `prompt_ms` of 13 ms (3B) and 22 to 27 ms (7B). The whole prompt, image included, came from the cache.

**Estimate (Unverified):** a yes/no question about a cached cover adds about 30 to 50 prompt tokens and 1 to 2 reply tokens. That's roughly 0.1 to 0.2 s on the 3B and 0.3 to 0.5 s on the 7B on this machine, and a few times more on an M1/M2 base. Experiment 1 measures it.

**A memory risk for the app.** Each cover's prompt holds about 52 MB of KV on the 3B and about 81 MB on the 7B. That's derived from `config.json`:

| Model | Layers | KV heads | Head dim | Bytes per token (f16) | 1,417 tokens |
|---|---|---|---|---|---|
| 3B | 36 | 2 | 128 | 36,864 | about 52 MB |
| 7B | 28 | 4 | 128 | 57,344 | about 81 MB |

Sources: https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct/raw/main/config.json and https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct/raw/main/config.json.

With the default `--cache-ram 8192`, a large import can grow the server toward 8 GiB of cached prompts. That breaks the 8 GB Mac budget. A small cap, enough for one cover plus its follow-up questions, keeps the verification benefit. **Unverified** on a real import; worth checking with Activity Monitor during a 200-cover import.

## 3. Decoding methods

| Method | What it does | Evidence (as reported) | What it needs | Fits our setup? |
|---|---|---|---|---|
| VCD (https://arxiv.org/abs/2311.16922) | Subtracts the logits for a noised image: (1+α)·logit(image) − α·logit(noised), and keeps only tokens the clean pass finds plausible | Up to +7.4 F1 on POPE, +18% on MME's hallucination subset, for LLaVA-1.5, InstructBLIP, Qwen-VL (2023 Qwen, 7B). α=1, β=0.1, 500 to 999 noise steps (App. A). Gains on LLaVA and Qwen-VL "predominantly driven by a recall boost" on POPE (§4.2). | Two inputs per token, so a second image encode and a second sequence | Not through HTTP. A native sampler could do it. |
| M3ID (https://arxiv.org/abs/2403.14003) | Contrasts against the model with no image at all, more strongly as the text grows | LLaVA 13B: 25% fewer hallucinated objects in captioning, +21% on POPE. Shows reliance on the image fading as more tokens are generated. | A second, text-only sequence (no image encode) | The cheapest contrastive option for a native build. |
| ICD (https://arxiv.org/abs/2403.18715) | Contrasts against the same input with a "disturbance" role prefix ("You are a confused object detector") | 3.9% over VCD overall on POPE (MiniGPT-4, InstructBLIP), and calls VCD "sensitive to the choice of hyperparameters" (§4) | Second sequence with a different prefix, so the image KV is recomputed | Same as VCD. |
| DoLa (https://arxiv.org/abs/2309.03883) | Contrasts final-layer logits with earlier layers | TruthfulQA +12 to 17 points on LLaMA (text only) | Intermediate layer outputs | No. |
| OPERA (https://arxiv.org/abs/2311.17911) | Beam search with a penalty on attention "summary tokens", plus rollback | CHAIR and POPE gains on 2023 LVLMs | Attention matrices and beam search | No. |
| PAI, SID, DeCo, MemVR, AttnReal, VaLiD, IFCD, ResDec | Amplify image attention, or contrast with internally disturbed states | All report POPE, CHAIR or MME gains. ResDec lists Qwen2.5-VL on POPE (https://arxiv.org/abs/2602.01047; table read through a search snippet only, **Unverified**) | Attention or hidden states inside the compute graph | No. |

Paper links for the last row:
- PAI: https://arxiv.org/abs/2407.21771
- SID: https://arxiv.org/abs/2408.02032
- DeCo: https://arxiv.org/abs/2410.11779
- MemVR: https://arxiv.org/abs/2410.03577
- AttnReal: https://arxiv.org/abs/2503.08342
- VaLiD: https://arxiv.org/abs/2411.15839
- IFCD: https://arxiv.org/abs/2502.01056

**How much to trust the contrastive results.**
- A follow-up study of VCD-style decoding found that "the effect of these samples in mitigating hallucinations varies a lot across LVLMs and benchmarks". Noised and downsampled contrast images tend to push answers toward "yes" and can "subtract the probability of correct answers". Source: https://arxiv.org/abs/2412.06775 (§1, §4).
- SID argues that holistic input disturbances "bring uncertainty noise" into normal decoding. Source: https://arxiv.org/abs/2408.02032.
- Almost all the evidence is POPE (yes/no existence) or CHAIR on COCO with LLaVA-1.5-era models. I found no result for Qwen2.5-VL at 3B or 7B on short structured captions. **Unverified** that any of these transfer to our task.

**Doing it in our stack.** Through HTTP you'd have to step one token at a time with two requests per token, about 240 round trips per cover. Our JSON grammar couldn't run across those separate requests, so it isn't practical.

A native route is a small C++ helper on llama.cpp's library API. It would decode two sequences in one context and combine their logits before the grammar sampler. That's a new binary to build, sign and ship, plus upkeep on every llama.cpp bump.

**Cost (Unverified):** for M3ID, one extra short text-only sequence decoded in the same batch, maybe 10 to 30% more generation time. For VCD, a second image encode as well (most of the 2.2 s prompt on the 3B), plus batched decode.

**Verdict:** last on the list. Try it only if verification and fusion leave a gap.

**One decode-level control we already have:** `logit_bias` can forbid tokens. It could ban words like "cosmic" or "starry", but they are true for some mockups, and no source supports deny-lists against hallucination. Not recommended.

## 4. Verification

### 4.1 Check each claim with a yes/no question

**Evidence.**
- Woodpecker is training-free. It extracts key concepts, asks questions about them, validates them against the image, then corrects the text. It reports +30.66% / +24.33% POPE accuracy over MiniGPT-4 / mPLUG-Owl. It used outside models (a detector and a VQA model) to answer. Source: https://arxiv.org/abs/2310.16045.
- LogicCheckGPT asks the LVLM itself linked questions (object to attribute and back) and flags objects whose answers don't close the loop. It reports gains on three benchmarks across four LVLMs. Source: https://arxiv.org/abs/2402.11622.
- A training-free loop on **Qwen2.5-VL-7B** asks "Is there a [object] visible in this region?" on crops of uncertain regions. It reports 9.8 points lower hallucination rate and +4.7 POPE-adversarial accuracy. Source: https://arxiv.org/abs/2512.07564 (abstract, §3.3.2). It's a single-author-style preprint with only Qwen2.5-VL-7B tested, so treat the size of the gain as **Unverified**.
- Yes-bias is real: in POPE, LLaVA, MultiModal-GPT and mPLUG-Owl answered "Yes" near 99% of the time. Source: https://arxiv.org/abs/2305.10355 (§4.2, Table 3). Qwen2.5-VL's rate on our covers is unknown, so a threshold on P(yes) must be tuned, and argmax yes/no isn't enough.

**For us.**

1. After the main request, collect the claims:
   - every tag;
   - the setting and relation phrases in the description ("on a desk", "hanging from a hook").
2. For each claim, send the same system message and the same cover, then a short question:
   - Existence or attribute: "Is there a roll of tape in this image? Answer yes or no."
   - Relation: a forced choice works better than yes/no. Example: "Is the bag hanging, standing on the floor, lying flat, or held by a person?" as a grammar enum. This avoids the yes-bias. The choice wording is design reasoning; LogicCheckGPT's linked questions are the closest evidence.
3. Use temperature 0, `logprobs: true`, `top_logprobs: 5`, and a grammar that allows only the answer words. Read P(yes) / (P(yes)+P(no)) from `top_logprobs` on the first token.
4. Drop tags below a threshold tuned on gold.
5. Drop description phrases that contain a dropped claim. A cut that leaves the sentence broken falls back to the next description strategy (§5.1).

**Cost:** one cached request per claim, about 6 to 9 per cover. That's 1 to 2 s on the 3B and 3 to 4 s on the 7B (**Unverified**, §2). A one-request variant puts all claims into one JSON object of `{claim: "yes"|"no"}` enums, which is cheaper. Each answer then sees the earlier ones, which may make them agree with each other. Test both.

**What it should fix:** tape and folder, Laptop and T-shirt padding tags, chair, desk, hook, wrists, glowing. It won't fix attributes the model believes, like "flexible" for a wavy screen, which are wrong words for something that is really there. Fusion and closed choices handle those (§5, §6).

### 4.2 Self-consistency across samples, seeds, crops and resolutions

**Evidence.**
- SelfCheckGPT: facts a model knows recur across sampled answers, and hallucinated ones diverge. Sentence-level detection beat grey-box (probability-based) baselines on GPT-3 text. Source: https://arxiv.org/abs/2303.08896.
- On LVLMs, consistency methods beat uncertainty (probability and entropy) methods on open-ended sentences in most settings. The NLI variant was best, by about 12% over the best uncertainty metric on one dataset (LLaVA-v1.6-7B, M-Hal). A supervised probe beat both by about 15%. Source: https://arxiv.org/abs/2408.05767 (§4.1). That probe needs hidden states and labelled data, so it's out of reach here.
- VL-Uncertainty perturbs the image and the prompt, clusters answers by meaning, and uses the cluster entropy. It reports beating baselines on 10 LVLMs. Source: https://arxiv.org/abs/2411.11919.
- MVP looks at several image views and aggregates answer certainty over several decoding paths. It's training-free and reports gains on four LVLMs. Source: https://arxiv.org/abs/2408.17150.
- Semantic entropy is the text-model basis for grouping answers by meaning. Source: https://arxiv.org/abs/2302.09664.

**For us.**

- **Samples.** Request `n: 3` at temperature about 0.7. That needs `--parallel 3`, because `n` is capped at `n_parallel`. Keep a tag that comes back, after `snapTags`, in at least 2 of the 3 answers. Our labels are short and snapped, so exact matching stands in for NLI clustering. Run data: the 7B was stable across seeds at temperature 0.2, so at 0.2 the samples carry little signal. The temperature has to rise for this to work.
  - **Cost:** the prompt is processed once and copied to the other slots (§2). The three replies decode as a batch, so expect well under 3 times the reply time. **Unverified.**
  - **Context:** with explicit `--parallel 3` the KV is split per slot unless it's unified. Each slot needs about 1,900 tokens, so `--ctx-size 8192` is enough.
- **Views.** Send the full cover at 1024 px, the same cover at 768 px, and a crop of the main object. Keep tags that come back in at least 2 views. Each view is a new image encode, about +1.5 to 2 s per view on the 3B (from the 2.2 s prompt figure; **Unverified**).

### 4.3 Asking the model to say it's unsure

**Evidence is mixed.**
- One study found that simply prompting VLMs to abstain from uncertain predictions gave "significant reliability gains", near-perfect robustness on ImageNet-style natural images. Source: https://arxiv.org/abs/2505.11804.
- A NeurIPS 2026 study found prompt-induced "Uncertain" answers "acutely unstable". Swapping "Answer:" and "Reason:" moved uncertainty rates by up to 34 points. Abstention was overbroad: 65.5% of one model's "uncertain" answers were on images every annotator agreed on. Source: https://neurips.cc/virtual/2026/178170.
- The run data echoes this: the 7B moved from 70% to 63% found when one prompt line was removed.

**For us:** cheap to try as an allowed `none` value in a closed setting enum (§5.2), so that "no clear setting" is a legal answer instead of a forced invention. Don't build on free-text "unsure" wording.

### 4.4 Confidence from token logprobs

**Evidence.**
- LURE: hallucinated objects sit mostly in the high-uncertainty range of decoding. Source: https://arxiv.org/abs/2310.00754 (§2.2, Fig. 1b).
- On yes/no answers, average token probability scored about twice the random baseline (AUC-PR). On whole passages, uncertainty methods were "weakly better than the random baseline". Source: https://arxiv.org/abs/2408.05767 (§4.1).
- Sentence likelihood was a weaker hallucination signal than CLIP similarity, and less stable across datasets. Source: https://arxiv.org/abs/2402.15300 (§3). That makes brief C's contrastive model a candidate verifier.
- Larger models are well calibrated on yes/no and multiple-choice questions "in the right format". Calibration of P(IK) on new tasks is weaker. Source: https://arxiv.org/abs/2207.05221. Those were large text models; a 3B VLM's calibration is **Unverified**.

**For us:** turn on `logprobs: true, top_logprobs: 5` for the main request. Record the lowest and the average probability of each tag label's tokens. Grammar-forced tokens (field names, punctuation) carry no signal, so only the label tokens count.

It costs no extra requests, so it can run in every experiment. On its own it's probably too weak to delete tags. Use it to choose which claims get the §4.1 question, the way the Qwen2.5-VL self-correction paper uses uncertainty to choose what to re-examine.

## 5. Structure

### 5.1 Describe, then extract in a second pass

The earlier rounds tested a free-text `seen` field first in the same request. It gave no gain on the 3B and a small, costly gain on the 7B (`design/specs/ai.md`).

A separate text-only extraction pass can't add visual hallucinations, but it can't remove any either. LURE, CLIP-Guided Decoding and the EOS study all find that longer descriptions hallucinate more toward the end. Sources: https://arxiv.org/abs/2310.00754, https://arxiv.org/abs/2402.15300 and https://arxiv.org/abs/2402.14545.

So "describe more, then extract" works against the evidence. The order that fits is extract, verify, then write. Two ways to write the description from verified facts:
- **(a)** a second request with the image and "use only these facts: …". The model may still add details; **Unverified**.
- **(b)** assemble the sentence in code from the verified fields. It can't invent anything, but it reads plainer. Example: "A white tote bag, also called a shopping bag, lying on a grey floor."

### 5.2 Per-category questions and closed choices

AMBER evaluates generative and discriminative hallucination separately and finds they differ. Source: https://arxiv.org/abs/2311.07397.

The grammar already enforces enums (round 2, §5), so:

- **Setting:** turn the free-text Environment tag into a closed enum, for example indoor, outdoor, street, desk, floor, wall, water, plain backdrop, none.
- **Relation:** one enum per main object, for example standing, lying flat, hanging, leaning, floating, worn or held, none.

A closed list can't produce "cosmic, starry" or "laptop chair", and `none` is allowed.

Evidence for gains on small VLMs is **Unverified**; this is design reasoning from the run data's failure list. It costs nothing extra if it goes in the main request. Search needs the enum words to be the words people type, and `gold.json` queries ("concrete", "street", "outdoor") can check that.

### 5.3 Grounding with boxes

Qwen2.5-VL outputs boxes and points as JSON, in absolute coordinates. Sources: https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct/raw/main/README.md and https://arxiv.org/html/2502.13923 (§1).

Two uses:
1. **As verification:** ask for a `bbox_2d` per claimed object, and drop claims with no box or an implausible one, such as a zero-area box or one covering the whole image for a small object.
2. **As a zoom:** crop the main object for a closer look.

On zoom: MLLM accuracy is "very sensitive to the size of the visual subject", and training-free cropping helps small details. Source: https://arxiv.org/abs/2502.17422. Mockup objects are usually large, so zoom matters less for the main object. It might matter for relation claims: is there a hook, is that a wrist?

**Cost:** about 20 reply tokens per box on the cached image, plus a new image encode per crop. No study measures box-based verification for captions on small Qwen models. **Unverified.**

## 6. Evidence fusion

### What the literature says about sources of different reliability

- **Per-source error rates can be estimated without ground truth.** Dawid and Skene estimate each source's confusion matrix by EM from many items labelled by several sources. Source: Dawid & Skene, "Maximum Likelihood Estimation of Observer Error-Rates Using the EM Algorithm", *Applied Statistics* 28(1), 1979, https://doi.org/10.2307/2346806.
- **Optimal voting weights each independent source by its log-odds of being right.** For independent sources with known accuracy p_i, the optimal decision rule is a weighted majority with weight log(p_i / (1 − p_i)). Source: Nitzan & Paroush, "Optimal Decision Rules in Uncertain Dichotomous Choice Situations", *International Economic Review*, 1982, https://doi.org/10.2307/2526438. Only the Crossref record was read; the weight formula is the paper's well-known result.
- **Truth discovery** integrates conflicting multi-source data by estimating each source's reliability jointly with the truth. Source: https://arxiv.org/abs/1505.02463.
- **Data programming (Snorkel)** combines noisy, conflicting heuristic labelers ("labeling functions") with unknown accuracies through a generative model. File-name rules, an OCR match and a VLM answer are exactly such labelers. Sources: https://arxiv.org/abs/1605.07723 and https://arxiv.org/abs/1711.10160.
- **VLMs over-trust text in their prompt.** When text in the prompt disagrees with the image, VLMs tend to follow the text, and more so when the text looks relevant. Qwen2-VL-7B followed corrupted text more often (29%) than matching text (13%), and its accuracy fell to about half under corrupted text. "Focus on the image" instructions moved its text preference only from 16.8% to 14.2%. Putting text before the image made the bias worse (shown in Phi-3.5). Source: https://arxiv.org/abs/2503.02199 (§4.1, §4.3, Figs. 5 and 6).

**What that means for us.** The shipped prompt hands the names to the model and asks it to weigh them. The text-bias result says a model does that weighing poorly, and prompts barely change it. Weighing in code makes each source's weight explicit, measurable and the same every time.

### How reliable our sources are (run data, crude string matching against `gold.json`)

**File name and folder words**, with junk words and short codes removed:
- 79% of them (89 of 113) appear in the gold text.
- The misses are codes ("agu", "toj", "qubus") and synonyms ("shopper", "postal", "packages", "fabric").
- Names contain a gold object label for 33 of 39 covers (85%). The 6 without are names like `011.psd`, `001.psd`, `Qubus (EU).psd` and `Boards Environment.psd`.

**VLM:**
- Object label in the title or tags: 3B 86%, 7B 95%.
- Tag labels overall: 3B 52%, 7B 56%. Settings and style are the weak part.

**Printed text (OCR):** no measurement yet; brief C covers it. On this set it often names the object ("SNACKBAR") and says nothing about the scene.

The names and the image fail on different covers (names fail on numbered files, the image on stacked boxes and long-scroll MacBooks). So combining them should beat either alone. That's a reasonable inference from independent errors; **Unverified** until it's measured.

### Proposed scheme

Weights are log-odds, w = ln(a / (1 − a)), where a is a source's per-field accuracy measured on `gold.json`. Re-estimate later with Dawid–Skene on unlabelled libraries. Sources:

| Symbol | Source |
|---|---|
| N | names (file name and folder trail) |
| O | printed text on the cover (OCR) |
| V | the VLM's answer from the image |
| Q | the VLM's verified P(yes) from §4.1 |

| Field | Who decides | Rule |
|---|---|---|
| Object noun ("tote bag", "billboard") | N and O propose, V and Q confirm | Take the most specific noun proposed by N or O that is a known object word. Keep it when Q(noun) ≥ τ_obj, or when V names the same object kind. If neither confirms it, use V's noun. Without N or O, use V's noun. |
| Product or model ("iPhone 16", "MacBook Pro", "Apple Watch Ultra") | N and O only | The image can't tell an iPhone 15 from a 16. V and Q only confirm the kind (phone, laptop, watch). This is what v4's prompt line does; doing it in code makes it hold. |
| Setting and background | V, checked by Q | Image only. Use a name's setting words ("on rocks", "on the floor", "boho interior") only when Q confirms them, since names can describe a scene the cover doesn't show. OCR is never used for the setting. |
| Relation (hanging, standing, worn) | V via the closed enum (§5.2), checked by Q | Image only. A name word such as "Hanging" counts as a proposal and needs Q. |
| Colour and material | V | Image only. Names and OCR are never used. |
| Style (clay, realistic, 3D render) | N when present, else V | Folder names like "Clay Version" or "Realistic" are deliberate labels, and style is ambiguous in the image. |
| Printed words | O | Never a claim about the scene. Use them to strip quoted text from output, and as an object-noun proposal only when the word is in the object vocabulary. |

Starting thresholds: τ_obj at about 0.5. For setting and relation claims, set τ higher, from the gold set, because they have the lowest accuracy.

**Prompt-side change that follows from the text-bias result:** test a main request with no names for the setting, relation and colour fields. The names would then only feed the code-side fusion for noun and product. This is Experiment 5.

## 7. Ranked experiments

**Two harness changes come first.**

1. **A hallucination metric.** Today's harness scores search recall and precision, which mixes misses with inventions. Add to each `gold.json` item an `absent` list: words that must not appear for that cover. Seed it from the recurring failures (flexible, curved, foldable, chair, cosmic, starry, hook, hanging, wrist, tape, folder, glowing, handwritten, lamp, sign, book) and the common defaults where gold has none (desk, indoor). Report:
   - the share of covers with any absent word;
   - absent words per cover;
   - tag precision against gold tags plus a small synonym list.
2. **Multi-request versions.** Add an optional `analyze(input, imageUrl, chat)` to `PromptVersion` (`scripts/ai-eval/prompts/prompt-version.ts`), so a version can make several requests. Log the time of each request, and drop the fixed `seed` for sampling experiments.

**Experiments**, ordered by expected gain for the cost, using the evidence above and the run data. Run each on both models with three passes, against v4:

| # | Experiment | Targets | Evidence | Extra cost per cover | Measure |
|---|---|---|---|---|---|
| 1 | Logprobs on the main request, recorded only | Shows whether low-probability labels are the wrong ones | §4.4 | None | AUC of each tag's lowest token probability against "label in gold". Also records `prompt_ms` for a cached follow-up, which calibrates every cost below. |
| 2 | Yes/no or forced-choice verification of every tag and setting/relation phrase, cached image, P(yes) from logprobs, threshold from gold | Existence, relation, padding tags | §4.1 (Woodpecker, LogicCheckGPT, Qwen2.5-VL-7B self-correction); POPE yes-bias | 6 to 9 cached requests, about 1 to 2 s (3B) and 3 to 4 s (7B), **Unverified** | Absent-word rate, tag precision, search found and clean, time. Sweep the threshold. Also test the one-request JSON variant. |
| 3 | Closed enums for setting and relation, with `none` allowed | Invented settings and relations | §5.2, §4.3 | None | Absent-word rate; search on "outdoor", "street", "concrete" and other setting queries. |
| 4 | Code-side fusion for object noun and product name (§6), with weights from gold | Misidentified objects (boxes as book, sign), product names | §6 | None, or 1 to 2 Q requests when N and V disagree | Object accuracy against gold; "box", "packaging", "macbook pro" queries. |
| 5 | Main request without names; names used only in fusion | Text bias carrying name words into the scene ("hanging", "on rocks") | "Words or Vision" (§6) | None | As 3 and 4. Watch whether product names drop (fusion should restore them). |
| 6 | Self-consistency: `n: 3`, temperature 0.7, `--parallel 3`, keep tags in at least 2 of 3 | Unstable tags | §4.2 | Shared prompt; three batched replies, maybe 1.3 to 2 times the reply time, **Unverified** | Tag precision and recall, time, memory with three slots. |
| 7 | Description assembled from verified fields (§5.1b) against a constrained second request (§5.1a) | Hallucinated description text | LURE, CGD, EOS | (a) one cached request; (b) none | Absent words in descriptions only; whether people find it readable on the review page. |
| 8 | Multi-view consistency: 1024 px, 768 px and a main-object crop | Attribute errors from one view | §4.2 (VL-Uncertainty, MVP), §5.3 | About +1.5 to 2 s per view on the 3B, **Unverified** | As 6. |
| 9 | Box-based verification: `bbox_2d` per claimed object, drop boxless claims | Existence | §5.3 | About 20 tokens per object, cached | As 2; compare with 2 for cost. |
| 10 | Native M3ID or VCD sampler (C++ helper on libllama) | Language-prior hallucination | §3, mixed | A new binary to build and ship; +10 to 100% compute | Only if 2 to 5 leave a gap. |

**Suggested order:**
1. Experiment 1 alone (free, and it calibrates the costs).
2. Experiments 2 and 3 together; they touch different fields.
3. Experiments 4 and 5.
4. Experiment 6 only if tags are still noisy.

**Two things to settle as the experiments land:**
- **The time budget.** The 3B already takes 3.6 s per cover on an M3 Max. The 10 s target on an M1/M2 base leaves little room, so check verification's extra time on a base Mac before shipping it. Brief A may have speed data.
- **The prompt cache cap.** Set `--cache-ram` well below the 8 GiB default in the app's server flags (§2).
