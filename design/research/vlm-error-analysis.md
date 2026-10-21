# Where the local models go wrong: error analysis of the tuning runs

**Date:** 2026-10-21. **Data:** the shipped request (`v4` in `scripts/ai-eval/prompts/`), three passes with seeds 42, 43 and 44, on Qwen 2.5 VL 3B and 7B, over the 39 real test-set mockups; my per-answer judgements; the 73 searches in `scripts/ai-eval/gold.json`. Run outputs are under `~/Library/Application Support/DesignStash-dev/ai-eval/runs/<model>/v4/`.

## 1. The main object is almost always right

The file name or folder names the right object for 34 of 39 mockups. Four names mislead ("Boards" for stacked boxes, "Tape" for a sticker roll, "Qubus" for packing tape) and one says nothing ("011.psd").

The models name the main object correctly far more often than they get anything else right:

| | Object named correctly | Misses |
|---|---|---|
| 7B | 39 of 39 | none |
| 3B | 35 of 39 | four MacBooks called "laptop" (still the right kind of thing) |

So "what is it" is a solved problem on this set. The errors live in the details: scene, attributes, accessories, and tags.

## 2. Hallucinations are systematic, not random

**Seed voting would not help.** Of the 7B's 20 wrong (non-Angle) tags in pass 0, 8 appear in all three passes, 6 in two, 6 in one. For the 3B: 7 of 17 in all three, 6 in two, 4 in one. Keeping only tags that repeat in all three passes removes about 60% of the wrong tags but also 37% of the right ones.

Description hallucinations repeat just as reliably:

| Hallucination | 3B answers | 7B answers |
|---|---|---|
| Long-scroll MacBook called flexible / curved / curled / folding | 5 of 18 | 16 of 18 |
| iPhone 15 against a cosmic or starry background | 0 of 3 | 3 of 3 |
| Roll of tape and a folder invented beside the postal mailers | 0 of 3 | 3 of 3 |
| The wavy MacBook called a chair | 3 of 3 | 1 of 3 |
| Unlit lightbox called glowing | 2 of 3 | 0 of 3 |
| Stacked boxes called a lamp, sign, book or business card | 3 of 6 | 2 of 6 |
| Tote bags hanging from a hook | 2 of 9 | 0 of 9 |

**The two models hallucinate different things.** A claim only one of them makes is suspect, which points to checking claims with a second, different source (another model or a contrastive image-text model) rather than with more samples from the same one.

## 3. Wrong tags are in two categories

With Angle no longer suggested, the remaining wrong tags (pass 0) are:

| | Environment | Device | Other |
|---|---|---|---|
| 3B v4 | 7 | 10 | 0 |
| 7B v4 | 15 | 5 | 1 |

- **Environment** fills with filler labels ("Background", "Neutral", "Studio", "Surface", "Sunlight") or the wrong setting ("Outdoor" for an interior).
- **Device** is the 3B's dumping ground for non-devices ("Box", "Tape", "Sign", "Notebook", "Monitor").

Both categories already have a seed vocabulary in `db/bootstrap.ts`, so both could be closed lists instead of free text.

## 4. Search misses are omissions, not hallucinations

The best run (7B) misses at least one mockup on 28 of 73 searches. The biggest misses:

- **Category words nobody writes:** packaging (7 of 7 missed), stationery (3 of 3).
- **Other names:** canvas bag (5 of 5), shopping bag (2 of 5), hat, wrapper, candy bar, mailer, badge, paper cup.
- **Product specificity:** MacBook Pro (7 of 9 missed).
- **The concept of the mockup:** long scroll (5 of 6), scrolling website (6 of 6).

None of these needs the model to see more. A curated thesaurus applied when tags are indexed (tote bag to shopping bag and canvas bag, cap to hat, box/wrapper/cup to packaging, notebook/envelope/business card to stationery) would supply them deterministically and let the model say less.

## 5. Caveats

- The 39 mockups and 73 searches are both the tuning set and the test set. Anything built from them (a thesaurus, thresholds) needs a held-out set: new mockups, and searches written by someone who hasn't seen the thesaurus.
- "Wrong tag" and "made up" are my judgement of each answer, partly applied by rule in later rounds; the search numbers are mechanical.
