# AI suggestions, round 3: placeholders, piles and carried edits

**Started:** 2026-10-23, after Neesh's feedback on "Long scroll Macbook". **Brief:** three experiments, in order: A (placeholders and invented surfaces), B (variants with the top as a reference), C (model-judged edit carry-over). Work lives in `scripts/ai-eval/`; run outputs stay under `~/Library/Application Support/DesignStash-dev/ai-eval/` and are never committed. No app code changed.

The feedback, on Apple's model: "A long scroll MacBook, also called a website, resting on a stack of white books with a blue and white grid pattern." The title is right. The grid is the placeholder (where the designer's screen goes), the books are invented (it is a plain white ledge), and "website" is a bad alternate name.

## A. Placeholders and invented surfaces

### A1. Measuring it

**Where the placeholder is.** The app never looks inside a PSD's layers today: `src/main/psd/placeholder.ts` only asks whether a whole cover is a blank notice (greyscale entropy under 1), and `cover-resolver.ts` swaps such a cover for a sidecar image. So there was nothing to reuse for finding the design slot. `pnpm ai-eval:slots` (`scripts/ai-eval/slots.ts`) finds it with `ag-psd`, which the app already ships:
- A slot is a visible smart object named like a design layer ("Change This", "Place Your Design Here", "Screen 1", "Edit Content", "Design", "Label", "Cover") or inside a group named so, and never a scene part (Base, Object, Shadow, Background, Reflection). When no layer has such a name (the three Mockups Design apparel files name the smart object "Leggings"), every visible smart object that is not a scene part counts.
- Its mask is the pixels Photoshop saved for that layer, times its layer mask and its clipping base, less the plain opaque layers painted above it (the finger over the HomeView screen, a higher colourway's background over a lower one). Layers inside a blend-mode group (Highlights in screen mode, Contrast in overlay) never hide a slot.
- The mask is in document pixels, so it fits an embedded cover exactly. A sidecar cover fits only when its shape matches the document (within 1.5%).

Result on the 90 unique mockups: a slot in all 90; a mask that fits the cover for 85. The 5 that don't fit are the Pixeden and Office Identity files whose cover is a 960x836 sidecar image of a different framing; those can't be masked this way. Two have an empty mask with reason: the Clay Apple Watch's screens are blank, and nothing else is hidden. Coverage runs from 0.5% (the apron's small print) to 54% (an open book's pages); the median is about 13%. Each item gets `slot-mask.png` and a `placeholder.jpg` (everything but the slot dimmed) beside its cover.

**What each placeholder shows.** I looked at all 90 `placeholder.jpg` and wrote `scripts/ai-eval/placeholders.json`: what the slot shows ("blue grid with white lines", "white to violet gradient print with sample text", "neon blue and purple light-line wallpaper") and regex fragments for it, plus generic fragments for any slot (grid on a screen, checkerboard, "screen showing", wallpaper, app interface, "grey screen"). `placeholder.ts` scores an answer's title, description, saved tags and keywords against them, as `hallucination.ts` does for `absent` words. `ai-eval:score` now reports the share of answers that mention their placeholder, and `ai-eval:table` prints one row per run and set.

**The gold describes placeholders too.** 37 of 90 gold entries match their own placeholder words: the lighters are "white and violet", the flags "blue", the gift card holders "purple and pink", the leggings "blue to pink gradient", the iMacs show a "dark screen". These are the sample art's colours, which every designer replaces. They don't change the search scores much: only three gold searches use a placeholder word for a relevant item ("sticker", "stickers", "sticker roll" for the tape roll), and on reflection those name the product (a sticker roll), so I took "sticker" out of its placeholder words. The gold entries are the orchestrator's; see "For Neesh".

**Bad "also called" names.** The description rule asks for "one or two other words people use for it". Apple's model answers with a broad word in 30% of its answers (27 of 90): "a laptop, also called a computer", "a MacBook, also called a website", "a holder, also called a design", "a lighter, also called a prop", "also called a mock-up", "a printed thing". The Qwen models never do (0 of 270 each). `placeholder.ts` `badAlternate` counts them.

**The books.** Apple's scene check would have caught them: asked "Is there a book in this image?" about the long-scroll covers it says no. The phrase survives because the removal can't cut it: `withoutThing` (`src/main/ai/scene-check.ts`, and ck-2) allows at most two words between the article and the noun, so "on a stack of white books" matches neither of its patterns and stays. That is a bug in the removal, separate from the model.

### A2. Baseline

The tuned versions' existing runs (ck-2 for both Qwen models, three passes, seeds 42 to 44; ap-6 for Apple, one greedy pass), rescored with the new metrics. Found / right are search recall and precision; "Invented" is the share of answers with a gold `absent` word; "Placeholder" the share of answers about an item with a slot that mention it. Held-out and sign-off rows count those items' answers for invention and placeholders; their searches include the tuning items, as `ai-eval:score --held-out` does.

| Run | Set | Found / right | Invented | Placeholder | Bad "also called" |
|---|---|---|---|---|---|
| 4B ck-2 | tuning | 87.2 / 85.5 | 5.1% | 48.7% | 0% |
| 4B ck-2 | held-out | 88.3 / 82.2 | 0.0% | 32.2% | |
| 4B ck-2 | sign-off | 85.3 / 81.3 | 1.6% | 34.9% | |
| 9B ck-2 | tuning | 92.7 / 87.5 | 6.0% | 34.2% | 0% |
| 9B ck-2 | held-out | 92.9 / 82.8 | 0.0% | 24.4% | |
| 9B ck-2 | sign-off | 91.3 / 85.1 | 0.0% | 30.2% | |
| Apple ap-6 | tuning | 79.7 / 79.1 | 2.6% | 53.8% | 30% |
| Apple ap-6 | held-out | 82.8 / 78.9 | 3.3% | 43.3% | |
| Apple ap-6 | sign-off | 79.4 / 77.1 | 4.8% | 42.9% | |

So a third to a half of all answers describe the placeholder, on every model.

### A3. Options (Apple measured; Qwen not yet run)

Versions in `scripts/ai-eval/prompts/`, built by `r3.ts` on top of the tuned ones (ck-2 for Qwen, ap-6 for Apple), each changing one thing:
- **m (grey mask):** the cover the model sees has the design slot painted flat mid grey (`masked.ts`, `masked-grey.png` beside the cover). The scene check asks about the same masked image.
- **s (soft mask):** the slot filled with a heavy blur of itself in grey (`masked-soft.png`): the shading and shape stay, the text, art and colours go.
- **r (rule):** `PLACEHOLDER_RULE` after the printed-words rule: the screen, label or print area shows a stand-in (a grid, a checkerboard, a flat grey or colour fill, sample text, an app screen or sample art); leave it out of every field.
- **mr:** grey mask and rule.

Apple, one greedy pass each:

| Run | Set | Found / right | Invented | Placeholder |
|---|---|---|---|---|
| ap-6 (baseline) | tuning | 79.7 / 79.1 | 2.6% | 53.8% |
| | held-out | 82.8 / 78.9 | 3.3% | 43.3% |
| | sign-off | 79.4 / 77.1 | 4.8% | 42.9% |
| ap-7m grey mask | tuning | 83.1 / 84.1 | 2.6% | 10.3% |
| | held-out | 85.6 / 82.3 | 0.0% | 16.7% |
| | sign-off | 82.2 / 81.6 | 4.8% | 0.0% |
| **ap-7s soft mask** | tuning | **83.7 / 84.5** | 2.6% | **5.1%** |
| | held-out | 85.0 / 80.9 | **0.0%** | **6.7%** |
| | sign-off | 82.7 / 81.9 | 4.8% | **4.8%** |
| ap-7r rule | tuning | 81.1 / 80.4 | 2.6% | 41.0% |
| | held-out | 83.1 / 77.5 | 6.7% | 43.3% |
| | sign-off | 80.5 / 78.3 | 9.5% | 33.3% |

Bad "also called" names: ap-6 30%, ap-7m 20%, ap-7s 18%, ap-7r 20% (over all 90 answers).

What this says so far, for Apple:
- **Masking works; the rule alone doesn't.** Either mask cuts placeholder mentions from about half the answers to 5 to 17%, and search gets better (found +3 to +4 points, right +3 to +5), because the words that went to the grid and sample art now go to the object and scene. The rule alone barely moves mentions and raises inventions on held-out and sign-off, so it fails the target.
- **Soft beats grey.** The grey mask leaks its own colour into answers ("grey screen", a gift card holder called "a gray rectangular holder, also called a design"). Soft keeps the object's form, so fewer such slips.
- **Masking has its own errors**, which the gold `absent` lists don't catch, so they need reading by hand. On ap-7s: one long-scroll cover becomes "resting on a stack of paper" (the blurred sheet), another sits "on a white desk" (it is a ledge), and the gift card holder becomes "a clear plastic holder, also called a pouch". Some titles lose "long scroll" with the grey mask, because the flat sheet no longer looks like a screen.
- Remaining mentions on ap-7s are the 5 covers whose mask can't be fitted (Pixeden and Office Identity sidecars) plus a few colour words.

Times in these runs are not clean: Apple ran alongside the Qwen runs for part of the time. Masking itself is cheap (a one-off image write of well under a second per cover); the time cost has to be re-measured with one run at a time.

### Where this stopped (paused 2026-10-23 at Neesh's request)

**Done:**
- The slot finder, the placeholder labels and metric, the "also called" metric, the table script, all A versions, and the B and C harnesses (written and type-checked, never run).
- Baselines rescored for all three models (A2).
- Apple: ap-7m, ap-7s and ap-7r ran in full and are scored above.

**Stopped or not run:**
- Apple ap-7mr (mask and rule) was stopped at 65 of 90; nothing was saved.
- Qwen 4B and 9B: none of ck-3m, ck-3s, ck-3r or ck-3mr has a finished run. Partial runs were stopped (they save nothing until the end).
- Not written yet: the wider scene-thing check version (`r3.ts` already has `SURFACE_THINGS`, the `things` option, and a `withoutThing` that cuts "a stack of white books" and the "resting" before it) and the Apple "also called" version (`alternates: true` option, `ALTERNATES_RULE`).
- B and C have not run.

**Lessons for the resume:**
- Run one model at a time. With Apple, 4B and 9B running together, the 9B fell from about 11 s to 47 s per mockup and the 4B from about 9 s to 20 s, so parallel runs are slower than running them in turn.
- Solo terminals: 266 (`ai-eval-run`), 268 (`ai-eval-apple`), 269 (`ai-eval-9b`), all idle.
- A `pgrep -f "<pattern>"` wait loop matches its own shell; use a log line to wait on instead (as below).

**To resume** (from the repo root, in one Solo terminal, one command at a time). Covers, masks and `placeholder.jpg` are already made; `pnpm ai-eval:slots` only needs to run again if `items.json` changes.

```sh
# A, Apple: the last variant
pnpm ai-eval:run --model apple --prompt ap-7mr > tmp/round3/run-apple-ap-7mr.log 2>&1

# A, Qwen: soft mask and rule first (the two that tell most), then grey and both
for v in ck-3s ck-3r ck-3m ck-3mr; do pnpm ai-eval:run --model qwen3-vl-4b --prompt $v --repeat 3 > tmp/round3/run-4b-$v.log 2>&1; done
for v in ck-3s ck-3r ck-3m ck-3mr; do pnpm ai-eval:run --model qwen3.5-9b --prompt $v --repeat 3 > tmp/round3/run-9b-$v.log 2>&1; done

# Score: one row per run and set
pnpm ai-eval:table qwen3-vl-4b/ck-2 qwen3-vl-4b/ck-3s qwen3-vl-4b/ck-3r qwen3-vl-4b/ck-3m qwen3-vl-4b/ck-3mr \
  qwen3.5-9b/ck-2 qwen3.5-9b/ck-3s qwen3.5-9b/ck-3r qwen3.5-9b/ck-3m qwen3.5-9b/ck-3mr \
  apple/ap-6 apple/ap-7m apple/ap-7s apple/ap-7r apple/ap-7mr
```

Expected time alone: Apple about 5 minutes; 4B about 45 minutes per variant; 9B about 50 minutes per variant.

**Next steps after that:**
1. Write the wider-check versions on each model's best mask, e.g. `prompts/ap-8.ts`: `appleR3({ id: 'ap-8', notes: '...', mask: 'soft', things: [...CK2_THINGS, ...SURFACE_THINGS, 'paper'] })`, and the same with `qwenR3` as `ck-4`. Check new false removals against gold (a real bench, pedestal or box taken out).
2. Apple only: the same plus `alternates: true` (`ap-9`), to cut the bad "also called" names.
3. Time per mockup for the winners, one run at a time on 10 items: `pnpm ai-eval:run --model <id> --prompt <winner> --only <10 ids>`, against the baseline on the same ids.
4. B: for each model's winner `<w>`, write `prompts/<w>-pile.ts` as `pileVersion(base, { id, notes })` from `pile.ts` (it reads the tops from `runs/<model>/<w>/`), and run it on the variants only: `--only` with `pileIds()` (13 piles, 31 variants, from the app's own `GroupingService.propose`: 12 by zip, the six long-scroll files by folder). Compare against the same variants in the winner's own run. Also try `variantRule` (e.g. "Describe this image's own setting, angle and colours; they may differ.") for the copying worry, which is sharpest in the long-scroll pile.
5. C: `pnpm ai-eval:edit-carry --model <id> --drafts <winner> --mask soft` per model. The 24 edits are in `scripts/ai-eval/round3/edits.json`; labels come from gold.

### For Neesh (so far)

1. **The gold describes placeholders in 37 of 90 entries** (violet lighters, blue flags, purple gift card holders, gradient leggings, dark iMac screens). By your rule these words shouldn't be there. Should the gold entries drop them? It barely changes the search scores (no search depends on them), but it changes what "right" means for colour words.
2. **The apparel and print slots cover the whole product.** On the leggings, top, T-shirt and flags, the "placeholder" is the fabric print itself, so a masked cover gives no colour at all ("three blank flags"). That matches "never describe the placeholder", but it means those mockups get no colour. Is that what you want?
3. **The books are a code bug as well as a model one.** Apple's check says "no" to a book on those covers, but the app's `withoutThing` can't cut "on a stack of white books". The eval's `r3.ts` version fixes it; the app fix waits for your go-ahead.
