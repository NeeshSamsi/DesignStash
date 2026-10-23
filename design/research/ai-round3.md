# AI suggestions, round 3: placeholders, piles and carried edits

**Started:** 2026-10-23, after Neesh's feedback on "Long scroll Macbook". **Brief:** three experiments, in order: A (placeholders and invented surfaces), B (variants with the top as a reference), C (model-judged edit carry-over). Work lives in `scripts/ai-eval/`; run outputs stay under `~/Library/Application Support/DesignStash-dev/ai-eval/` and are never committed. The winners are in the app (`src/main/ai/`, `src/main/psd/design-slot.ts`); the commits are named in each section.

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

### A3. Options

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

| ap-7mr soft mask and rule | tuning | 81.9 / 84.0 | 2.6% | 2.6% |
| | held-out | 84.0 / 81.5 | 0.0% | 6.7% |
| | sign-off | 81.3 / 81.6 | 4.8% | 0.0% |
| ap-8 soft mask, wider check | tuning | 82.0 / 83.6 | 2.6% | 5.1% |
| | held-out | 83.8 / 80.2 | 0.0% | 6.7% |
| | sign-off | 81.3 / 81.0 | 4.8% | 4.8% |
| ap-9 ap-8 and the "also called" rule | tuning | 79.9 / 81.0 | 0.0% | 5.1% |
| | held-out | 83.5 / 80.0 | 0.0% | 10.0% |
| | sign-off | 79.6 / 79.0 | 4.8% | 4.8% |

Bad "also called" names: ap-6 30%, ap-7m 20%, ap-7s 18%, ap-7r 20%, ap-7mr 11%, ap-8 18%, ap-9 9% (over all 90 answers).

The wider check (ap-8: pedestal, plinth, podium, box, crate, cube, block, stand, rock, stone, step, ledge, platform, paper, with "stack of" cut) catches nothing on Apple and does harm. Apple says "yes" to every new thing that is really there, and also to "paper" for the blurred long-scroll sheet, so "resting on a stack of paper" stays. It said "no" twice, both wrongly: "a brown paper pouch" lost "brown paper", and the postal package lost "mailer box", leaving "also called, resting on". Apple's yes/no check is only useful for what it already rejects (desks, tables). The removal fix still matters: for the reported sentence Apple says "no" to "book", and only the new `withoutThing` can cut "on a stack of white books".

The "also called" rule (ap-9) halves the bad names (18% to 9%) but costs 1.5 to 3.8 points of recall, because the good alternates go too.

What this says so far, for Apple:
- **Masking works; the rule alone doesn't.** Either mask cuts placeholder mentions from about half the answers to 5 to 17%, and search gets better (found +3 to +4 points, right +3 to +5), because the words that went to the grid and sample art now go to the object and scene. The rule alone barely moves mentions and raises inventions on held-out and sign-off, so it fails the target.
- **Soft beats grey.** The grey mask leaks its own colour into answers ("grey screen", a gift card holder called "a gray rectangular holder, also called a design"). Soft keeps the object's form, so fewer such slips.
- **Masking has its own errors**, which the gold `absent` lists don't catch, so they need reading by hand. On ap-7s: one long-scroll cover becomes "resting on a stack of paper" (the blurred sheet), another sits "on a white desk" (it is a ledge), and the gift card holder becomes "a clear plastic holder, also called a pouch". Some titles lose "long scroll" with the grey mask, because the flat sheet no longer looks like a screen.
- Remaining mentions on ap-7s are the 5 covers whose mask can't be fitted (Pixeden and Office Identity sidecars) plus a few colour words.

Times in these runs are not clean: Apple ran alongside the Qwen runs for part of the time. Masking itself is cheap (a one-off image write of well under a second per cover); the time cost has to be re-measured with one run at a time.

### A4. Qwen 4B, first pass (resumed 2026-10-23, one model at a time)

| Run | Set | Found / right | Invented | Placeholder |
|---|---|---|---|---|
| 4B ck-2 (baseline) | tuning | 87.2 / 85.5 | 5.1% | 48.7% |
| | held-out | 88.3 / 82.2 | 0.0% | 32.2% |
| | sign-off | 85.3 / 81.3 | 1.6% | 34.9% |
| 4B ck-3s soft mask | tuning | 87.4 / 85.5 | 7.7% | 12.8% |
| | held-out | 86.9 / 76.7 | 0.0% | 5.6% |
| | sign-off | 85.3 / 80.9 | 0.0% | 0.0% |
| 4B ck-3r rule | tuning | 88.5 / 87.5 | 6.8% | 42.7% |
| | held-out | 88.7 / 84.0 | 3.3% | 30.0% |
| | sign-off | 86.2 / 83.1 | 0.0% | 31.7% |

- **The soft mask fixes the placeholder on the 4B too, but it reads the blur as an object.** The three stacked boxes, whose lime print is the slot, become "a glowing white cube lamp" in all three passes; the blurred long-scroll sheet "flows like a chair" in two. The scene check keeps both, because it asks about the same masked image and the model agrees with itself. The old "flexible solar panel" reading of the 1514-B sheet is gone. Net: 6 to 9 invented answers of 117 on tuning, which fails the strict target.
- **Held-out precision drops 5.5 points,** mostly in a few searches: answers that used to say "screen displaying" matched "smart display" by accident, and a few new loose matches (a menu matched "brochure", the long-scroll MacBook "notebook").
- **The rule alone does little on the 4B** (placeholder 49% to 43%) and adds inventions ("flexible" on three long-scroll covers), as on Apple.
- A finer blur (radius a quarter of the soft one) keeps the grid and the mug lettering readable, so it was dropped without a run.

### A5. Free rein: fills, two looks, and the fixes in the app (2026-10-23)

Neesh gave free rein to fix this and ship the winners. Done so far:

**The withoutThing fix is in the app** (`src/main/ai/scene-check.ts`, commit `28a9739`, test-first). A refused thing now goes out as a whole phrase: "resting on a stack of white books" (a stack, pile, heap, set, row, pair or couple of the thing, with up to two words before it, and the verb that placed the object there), and -es plurals ("benches") are found and cut. The reported sentence becomes "A long scroll MacBook, also called a website with a blue and white grid pattern." once the check says no to the book. All 234 AI unit tests pass.

**The slot mask is made at import** (`src/main/psd/design-slot.ts`, test-first). It is the eval's `slots.ts` logic, unchanged in behaviour: on 8 real PSDs the app's mask matches the eval's to the hundredth of a percent. The copy queue writes `slot-mask.png` beside the cover after `resolveCover`; the cover people see is untouched. Reading every layer's pixels takes 0.25 to 4 s and up to about a gigabyte on the large 6000x4500 documents, so the app runs it in a worker thread per PSD (`design-slot-worker.ts`, electron-vite `?nodeWorker`): the main process never blocks, the memory goes when the worker exits, and a failure or a 60 s timeout only means the AI sees the plain cover. The built worker wrote the 1514-A mask in 0.66 s, start-up included.

**Fills screened on the 4B.** New fills in `masked.ts`: `outline` (flat grey with a thin dark edge), `tone` (flat, in the scene's colour just around the slot), `inpaint` (filled from the surroundings) and `label` (light grey with "DESIGN AREA" in each slot). `inpaint` was dropped on sight: the push-pull fill is blocky and lets the lime and blue placeholder bleed back in at the edges. The others run with two new options in `r3.ts`:
- `checkCover`, the "two looks" idea: the scene check asks its yes/no questions about the cover as it is, so a lamp read into the masked blur is checked against the real boxes;
- `maskRule`: "The screen, label or print area ... has been blanked out in the image: it shows as a flat or blurred grey area, or one marked DESIGN AREA. That area is not an object and has no colour or pattern of its own."

The screen is 27 covers chosen for the trouble (all six long-scroll files, both box files, lighters, the gift card holder, a mug, HomeView, the Apple set, iPhones, 011, B-Mockups, the apparel, flags, stationery, the sticker, an iMac, the boho MacBook, the lightbox), three passes. `tmp/round3/subscore.mts` counts placeholder mentions, gold `absent` words, and misreadings (lamp, chair, paper, glowing, translucent, solar, flexible, books, blank, "grey screen", "design area" and the like; 011's real armchair is skipped).

**Screen results, 4B, 27 covers × 3 passes** ("Grey leak": "grey" or "gray" in a title or description whose gold has neither; the fill's own colour read as the product's):

| Version | Placeholder | Gold `absent` | Misreadings | Grey leak |
|---|---|---|---|---|
| ck-2 (today) | 59% | 7% | 5% | 0% |
| ck-3s soft | 7% | 11% | 11% | 9% |
| ck-5s soft, two looks | 7% | 10% | 10% | 9% |
| ck-5o outline, two looks | 11% | 4% | 1% | 15% |
| ck-5t tone, two looks | 10% | 2% | 5% | 16% |
| ck-5l label, two looks | 7% | 4% | 6% | 7% |
| ck-5sr soft, two looks, mask rule | 6% | 9% | 7% | 9% |
| ck-5or outline, two looks, mask rule | 7% | 4% | 5% | 15% |
| **ck-5lr label, two looks, mask rule** | **6%** | **4%** | **1%** | **7%** |

What the screen showed:
- **Two looks works, but the cut can't mend a misnamed object.** Asked about the real cover, the 4B says no to the lamp (P(yes) 1e-9) and the chair (0.0004). They stay because they name the object itself ("Stacked white cube lamp", "laptop as chair"), which taking a phrase out can't fix. That is why the redo step exists: when the check refuses a thing, the model is asked once more, told "Checked against the image: there is no lamp in it."
- **Flat fills leak their colour.** Outline and tone turn a white mug "gray", a lighter "gray", the flags "gray". Label plus the mask rule does this least; its only real leak is the gift card holder, whose whole surface is the slot (no true colour exists there), and its "grey perforated floor" for 1513-B is accurate.
- **Label alone leaks its own words** ("Colorful T-Shirt with Design Area"); with the mask rule it doesn't.
- **The mask rule doesn't stop the soft blur reading as an object** (ck-5sr still has the cube lamp five times).
- **Every mask loses "long scroll" from the long-scroll titles**, since the sheet no longer looks like a screen: "MacBook on White Shelf". The search scores on the full runs say what that costs.
- **Gift card holder:** outline gives "Gray rectangular on light background"; label plus rule keeps "Grey gift card holder".

So the 4B's lead is **label, two looks, mask rule**, with redo added (ck-6lr) for the cases the cut can't mend.

**In the app so far** (commits, all test-first, AI unit tests 254 passing):
- `ddc7ddf`: a profile can set `mask` (the fill), and then the scene check asks about the cover as it is; `redo` asks once more on a refusal.
- `99e2307`: the `label` fill (`masked-cover.ts`), pixel-identical to the eval's.
- `2a7b982`: `MASK_RULE`, said only when the image shown really has its slot painted over (`AnalysisInput.slotMasked`, set by the provider).
- The eval now has an `app` version (`prompts/app.ts`) that runs the app's own provider and profile for `--model`, so the final numbers come from the code that ships.

### A6. Full runs, the recall cost, and naming the object from the cover

**Apple: soft mask, two looks, redo (ap-10s) meets the target on all three sets** and is in the app (`d808ea8`). The two looks and redo change nothing measurable for Apple (identical to ap-7s: its yes/no check rarely says no), but they cost nothing and guard the same failure.

| Run | Set | Found / right | Invented | Placeholder |
|---|---|---|---|---|
| ap-6 (before) | tuning | 79.7 / 79.1 | 2.6% | 53.8% |
| | held-out | 82.8 / 78.9 | 3.3% | 43.3% |
| | sign-off | 79.4 / 77.1 | 4.8% | 42.9% |
| **ap-10s** | tuning | **83.7 / 84.5** | 2.6% | **5.1%** |
| | held-out | **85.0 / 80.9** | **0.0%** | **6.7%** |
| | sign-off | **82.7 / 81.9** | 4.8% | **4.8%** |
| ap-10o outline | tuning | 83.0 / 82.5 | 2.6% | 7.7% |
| | held-out | 85.6 / 81.1 | 0.0% | 20.0% |
| | sign-off | 82.0 / 80.7 | 4.8% | 0.0% |
| ap-10t tone | tuning | 83.5 / 82.9 | 2.6% | 7.7% |
| | held-out | 85.9 / 80.7 | 0.0% | 16.7% |
| | sign-off | 82.6 / 81.0 | 4.8% | 4.8% |
| ap-10l label, mask rule | tuning | 74.7 / 78.4 | 2.6% | 15.4% |
| | held-out | 77.6 / 76.4 | 0.0% | 3.3% |
| | sign-off | 75.7 / 77.5 | 4.8% | 0.0% |

The label hurts Apple (recall down 5 points), so Apple keeps the soft blur. Apple's "grey" words under the soft mask are mostly the real scene ("grey pavement", "grey walls", "grey sky"); the true slips are few (a poster's "large gray square", notebooks with "grey covers").

**4B: label, mask rule, two looks, redo (ck-6lr), full run.** Inventions and placeholder mentions improve on every set, but recall falls 3 to 4 points:

| Run | Set | Found / right | Invented | Placeholder |
|---|---|---|---|---|
| ck-2 (before) | tuning | 87.2 / 85.5 | 5.1% | 48.7% |
| | held-out | 88.3 / 82.2 | 0.0% | 32.2% |
| | sign-off | 85.3 / 81.3 | 1.6% | 34.9% |
| ck-6lr | tuning | 83.4 / 83.6 | 2.6% | 9.4% |
| | held-out | 85.0 / 77.4 | 0.0% | 3.3% |
| | sign-off | 82.3 / 80.0 | 1.6% | 1.6% |

The loss is concentrated. The two stacked-box mockups' slot is every visible face of all three boxes, so masked they are "white cubes" or (from the file name) "white boards", and drop out of "box", "boxes", "stacked boxes", "packaging" and "pedestal". The postal packages lose "envelope" (masked, "white paper"), HomeView loses "smart display" ("tablet"), the fence poster loses "outdoor". The pattern: **the 4B named the product from its sample art.** A lime print made "a branded box", address text "envelopes", app icons "a smart display".

**Naming the object from the cover as it is (ck-7lr).** Two looks again, for the name: before answering from the masked cover, one short request on the cover as it is, "What kind of object is this mockup of? Give its everyday name in one to three words, plural if there are several of it. No colours, brands, printed words or setting.", and the masked request is told "Seen in full, the main object is: boxes. Use that name for it." The names come back right (boxes, envelopes, smart display, gift cards, posters, laptop), and the answers follow ("Stacked Boxes in Concrete Space", "White envelopes on gray surface"). On the 32 trouble covers merged into the full ck-6lr run, recall comes back to within a point of today's: 86.3 / 87.8 / 84.7 against 87.2 / 88.3 / 85.3, with inventions at or below today's. Two problems: the question about the unmasked cover can read the placeholder too (the two blue-grid long-scroll covers came back "solar panels"; the answers didn't take it up), and "design area" leaked into seven answers. ck-7b rewords the hint line and adds "never write the words design area" to the mask rule; ck-7c also gives the question the file name.

**ck-7b screen (32 covers merged into ck-6lr's full run):** 87.3 / 85.3, 88.6 / 80.2, 85.4 / 81.9; inventions 0 / 0 / 1.6%; placeholder 10 / 7 / 0%; one misreading in 96 answers. ck-7c (the file name in the object question) scored lower on every set and was dropped. The "solar panels" name for two blue-grid covers was never taken up: the answers say MacBook every time.

**4B winner, full run: ck-7b** (label fill, mask rule that also bans "design area", object name from the cover as it is, scene check on the cover as it is, redo). It meets the target on all three sets and is in the app (`0567dfc`):

| Run | Set | Found / right | Invented | Placeholder |
|---|---|---|---|---|
| ck-2 (before) | tuning | 87.2 / 85.5 | 5.1% | 48.7% |
| | held-out | 88.3 / 82.2 | 0.0% | 32.2% |
| | sign-off | 85.3 / 81.3 | 1.6% | 34.9% |
| **ck-7b** | tuning | 87.3 / 85.5 | **0.0%** | **9.4%** |
| | held-out | 87.8 / 81.7 | 0.0% | **10.0%** |
| | sign-off | 85.3 / 80.8 | **0.0%** | **0.0%** |

Recall and precision are within half a point of today's (inside the pass-to-pass noise); inventions go to zero; placeholder mentions fall by three to four times. Over all 270 answers the misreading count falls from 48 to 32, and what remains is mostly real ("book" on the books, "pouch" on the pouches); the true slips left are "blank" ID cards (3), the Z-fold brochure "glowing" (3, 2 before) and one "design area". The app's `MASK_RULE`, object question and hint line are word for word the eval's (checked).

### A7. The 9B

The 9B does not take the 4B's pipeline. Screens on the 32 trouble covers, merged into ck-2's full run (so the other 58 covers are unmasked and the placeholder gain is understated):

| Version | Set | Found / right | Invented | Placeholder |
|---|---|---|---|---|
| ck-2 (today) | tuning | 92.7 / 87.5 | 6.0% | 34.2% |
| | held-out | 92.9 / 82.8 | 0.0% | 24.4% |
| | sign-off | 91.3 / 85.1 | 0.0% | 30.2% |
| ck-7b (the 4B winner) | tuning | 89.6 / 84.5 | 1.7% | 12.0% |
| | held-out | 90.6 / 81.1 | 4.4% | 16.7% |
| | sign-off | 87.6 / 81.1 | 0.0% | 14.3% |
| ck-8s (soft in place of label) | tuning | 88.7 / 84.2 | 5.1% | 12.8% |
| | held-out | 90.0 / 80.8 | 0.0% | 16.7% |
| | sign-off | 87.0 / 80.6 | 0.0% | 12.7% |
| ck-7d (hint prefers exact names) | tuning | 87.6 / 82.4 | 0.9% | 12.0% |
| | held-out | 89.2 / 79.6 | 3.3% | 16.7% |
| | sign-off | 86.4 / 79.7 | 0.0% | 12.7% |
| ck-6lr (no object name) | tuning | 85.6 / 81.7 | 0.0% | 7.7% |
| | held-out | 88.0 / 79.1 | 3.3% | 16.7% |
| | sign-off | 85.4 / 79.6 | 0.0% | 11.1% |

Every masked version costs the 9B 2 to 7 points of recall and adds one or two invented answers on held-out (an invented "desk" on HomeView that the check scored 0.30, just over the 0.2 cut, and the masked iPhone 15 "on cosmic dust"). The 9B, more than the 4B, read exact names from the sample art: "iPhone 15" from the screen's own text, "mailer" from the address panel. Masked, even told the name from the cover as it is, it falls back to "smartphone" and "shipping envelopes"; telling it to prefer exact names from the file name (ck-7d) did worse.

**Reverse two looks (ck-9v).** For the 9B the answer comes from the cover as it is (keeping every name it reads), and then each colour or pattern word in it (blue, pink, gradient, grid, wallpaper, lettering and the like; grey, white and black left out as too common) is asked about on the soft-masked cover: "Is anything in this image blue in colour?" A "no" means the word only described the placeholder, and the answer is asked for once more: "Checked against the image without its design area ... nothing outside it is blue or grid. Those belong to the stand-in design, so leave them out of every field."

The checks find the right words, but the 9B, still looking at the placeholder, writes them again: on the 32-cover screen placeholder mentions barely move (34.2 / 24.4 / 30.2% to 33.3 / 23.3 / 30.2%).

**Answer again from the labelled cover only when needed (ck-9m).** The same checks; when a word is only on the placeholder, the answer is made again from the label-filled cover with the mask rule, told the object's name from the first title less those words. Covers whose placeholder went undescribed keep their first answer untouched, so the 9B keeps the names it reads from the sample art everywhere else. 19 of 90 covers (52 of 270 answers) are answered again. Full run:

| Run | Set | Found / right | Invented | Placeholder |
|---|---|---|---|---|
| ck-2 (before) | tuning | 92.7 / 87.5 | 6.0% | 34.2% |
| | held-out | 92.9 / 82.8 | 0.0% | 24.4% |
| | sign-off | 91.3 / 85.1 | 0.0% | 30.2% |
| ck-9m | tuning | 92.6 / 87.7 | 6.0% | **22.2%** |
| | held-out | 92.8 / 82.9 | 0.0% | **16.7%** |
| | sign-off | 90.0 / 84.0 | 0.0% | **20.6%** |

Inventions are unchanged and placeholder mentions fall by a third (81 to 54 of 270 answers), much less than the 4B's and Apple's. Tuning and held-out recall are within 0.1 point. Sign-off recall is 1.3 points lower, and it is a real drop: scored pass by pass, ck-2's sign-off recall is 91.7 / 91.0 / 91.2 and ck-9m's 90.0 / 89.9 / 90.1. Almost all of it is one cover. The signboard's blue panel is its placeholder; the first answer is "A blue hanging signboard, also called a shop sign", and the re-answer, told only "hanging signboard", drops "shop sign" on every pass, so the "shop sign" search falls from 100 to 0. The same happens to "Zippo-style" on one lighter answer and "concrete" on one MacBook. Misreadings rise from 36 to 43: the labelled covers bring back "blank" (the tape, a long-scroll screen, the can, 6 answers).

**Give the re-answer the first answer (ck-9d).** The same, but the labelled request is given the first answer less the placeholder words, and told: "Keep its names, other names and details where the image agrees, mend any sentence the cuts left broken, and never describe the design area." Only the 19 re-answered covers change, so they were run alone (57 answers) and merged into ck-9m's full run:

| Run | Set | Found / right | Invented | Placeholder |
|---|---|---|---|---|
| ck-2 (before) | tuning | 92.7 / 87.5 | 6.0% | 34.2% |
| | held-out | 92.9 / 82.8 | 0.0% | 24.4% |
| | sign-off | 91.3 / 85.1 | 0.0% | 30.2% |
| **ck-9d** | tuning | 92.3 / 86.8 | 6.0% | **17.9%** |
| | held-out | 92.6 / 82.6 | 0.0% | **15.6%** |
| | sign-off | 90.6 / 84.2 | 0.0% | **15.9%** |

"Also called a shop sign" and "Zippo-style" come back. Pass by pass, ck-9d's sign-off recall is 91.7 / 91.0 / 89.0 against ck-2's 91.7 / 91.0 / 91.2: two passes match today's, and the third loses two one-item searches to wording ("shop sign" once more, and "peeling sticker" to "peeled corner"). Over all 270 answers placeholder mentions fall from 81 to 45 (30% to 17%), inventions stay at 7, misreadings are 40 (36 before). The new slips come from the light grey label: a "round grey sticker", a MacBook "resting on an abstract grey shape" (the hidden scroll), a "Black MacBook".

What is left (45 answers) is mostly where the check says yes because the colour really is elsewhere in the picture: blue sky behind the blue flags, a colourful graffiti wall behind the poster, lime boxes beside the lime print. The question asks about the whole image; asking about the object itself ("Are the flags blue?") would be the next thing to try.

**9B in the app: ck-9d** (`0d2246a`). It does not meet the target in full: placeholder mentions halve but stay at about one answer in six, against one in ten or fewer for the 4B and Apple; inventions are unchanged and recall is within the pass-to-pass spread on two sets and about half a point under it on sign-off. It is the best option that cuts placeholder mentions without adding inventions. Its time cost is in A8.

**Covers the label leaves blank.** Two covers (the leggings, and the top and leggings) are all grey on grey once labelled, and `readCoverAsDataUrl` refuses them as near-blank, as it should a "Remove this layer" notice. So the 4B answered them from the names alone ("A digital leggings designed for female wear", one tag) and the 9B kept its first answer. A profile can now name a `blankFallback` fill. With the soft blur there, the 4B (ck-7e) says "White leggings on neutral background ... also called workout tights" and "Monochrome athletic wear", with every score as ck-7b's; it is in the app (`0d2246a`). The 9B (ck-9e) gets the leggings right but calls the top and leggings "a grey athletic bodysuit" in two passes of three, losing "tank top"; a wrong object name is worse than leftover sample colours, so the 9B goes without it.

### A8. The app's own code, and the time cost

**The app gives the eval's answers.** The `app` eval version runs the app's own provider and each model's shipped profile:
- Apple, all 90 covers: 90 of 90 answers identical to ap-10s.
- 9B, the 19 covers it answers again (57 answers): 57 of 57 identical to ck-9d.
- 4B, the 32 trouble covers plus the top and leggings (99 answers): 89 identical to ck-7e. The other 10 follow a redo, and the eval's redo note had a slip the app's doesn't ("there is no a lamp in it"); merged into the full run, the app's answers score the same as ck-7e to 0.1 point (87.3 / 85.4, 87.8 / 81.7, 85.3 / 80.8; inventions 0 / 0 / 0; placeholder 9.4 / 10.0 / 0%).

**Time per mockup.** Ten covers per model, today's version against the app's, run back to back twice (A, B, A, B) with nothing else of mine running. Other work on the machine moved token speed between pairs (the 9B ran at 32, 12, 24 and 23 tokens a second), so each pair is read only against itself; in the second pair both sides ran at the same speed.

| Model | Today | In the app | Requests per mockup |
|---|---|---|---|
| Apple | 2.7 s (ap-6) | 2.6 s (ap-10s) | one helper call each |
| 4B | 4.0 s, 5.2 s (ck-2) | 6.8 s, 8.5 s (ck-7e) | 1.5 to 2.7 |
| 9B | 10.8 s (ck-2) | 12.9 s (ck-9d) | 1.4 to 2.0 |

- Apple costs nothing: the soft fill replaces the cover it was already sent.
- The 4B costs about two thirds more. Every masked cover adds the object question, and the scene check now looks at a different image (the cover as it is) from the one answered, so each check encodes an image of its own.
- The 9B costs about a fifth more on average. A cover with no colour or pattern word costs nothing extra; each word checked adds about a second; a cover answered again adds about 7 s (the blue-grid long scroll: 15.1 to 22.6 s).
- The slot mask is made once at import (in a worker) and each fill once per cover on its first analysis; neither is counted here, since the eval's are already on disk.

### A, in sum

| Model | In the app | Found / right (tuning, held-out, sign-off) | Invented | Placeholder (all answers) | Time |
|---|---|---|---|---|---|
| Apple | ap-10s: soft blur, check on the cover, redo (`d808ea8`) | 83.7 / 84.5, 85.0 / 80.9, 82.7 / 81.9 (was 79.7 / 79.1, 82.8 / 78.9, 79.4 / 77.1) | 2.6, 0, 4.8% (was 2.6, 3.3, 4.8%) | 6% (was 48%) | same |
| 4B | ck-7e: label, mask rule, object name from the cover, check on the cover, redo, soft where the label leaves it blank (`0567dfc`, `0d2246a`) | 87.3 / 85.5, 87.8 / 81.7, 85.3 / 80.8 (was 87.2 / 85.5, 88.3 / 82.2, 85.3 / 81.3) | 0, 0, 0% (was 5.1, 0, 1.6%) | 7% (was 40%) | +65% |
| 9B | ck-9d: answer from the cover, check colour and pattern words on the blurred slot, answer again from the label with the first answer, redo (`0d2246a`) | 92.3 / 86.8, 92.6 / 82.6, 90.6 / 84.2 (was 92.7 / 87.5, 92.9 / 82.8, 91.3 / 85.1) | 6.0, 0, 0% (same) | 17% (was 30%) | +20% |

Apple and the 4B meet the target on all three sets. The 9B does not: placeholder mentions halve but stay at one answer in six, and its recall is within the pass-to-pass spread on two sets and about half a point under it on sign-off. Every version tried that masks the 9B's cover first cost it 2 to 7 points of recall, because it reads exact names from the sample art.


### The pause (2026-10-23)

Neesh paused the work on 2026-10-23 and it resumed the same day. One lesson from it holds: run one model at a time. With Apple, the 4B and the 9B running together, the 9B slowed from about 11 s to 47 s per mockup and the 4B from about 9 s to 20 s. Everything since has run in turn in one Solo terminal, each run logging to `tmp/round3/run-<model>-<version>.log` for the progress view.

### For Neesh

1. **The gold describes placeholders in 37 of 90 entries** (violet lighters, blue flags, purple gift card holders, gradient leggings, dark iMac screens). By your rule these words shouldn't be there. Should the gold entries drop them? It barely changes the search scores (no search depends on them), but it changes what "right" means for colour words.
2. **The apparel and print slots cover the whole product.** On the leggings, top, T-shirt and flags, the "placeholder" is the fabric print itself, so a masked cover gives no colour at all ("three blank flags", "white leggings"). That matches "never describe the placeholder", but it means those mockups get no colour. Is that what you want?
3. **The books were a code bug as well as a model one.** Apple's check says "no" to a book on those covers, but the app's `withoutThing` couldn't cut "on a stack of white books". Fixed in the app with your go-ahead (`28a9739`): it now cuts the whole phrase, "resting on a stack of" included.
4. **The 9B still describes the placeholder in about one answer in six** (Apple one in eighteen, the 4B one in fourteen). Most of what is left is where the colour really is elsewhere in the picture (blue sky behind blue flags). The next thing to try is asking about the object itself ("Are the flags blue?") in place of the whole image.
5. **Apple's bad "also called" names fall but stay**: from 30% of its answers to 18% with the soft blur, since the placeholder supplied many of them ("a MacBook, also called a website"). A rule that holds the other names to real names halves them but costs 1.5 to 3.8 points of recall (ap-9, A3), so it is not in the app. Dropping the "also called" request for Apple alone is the other way to go; it would cost the searches those names win.
6. **The 4B is about two thirds slower per mockup** (about 5 s to 8.5 s here). The checks could look at the masked image the answer came from to save the extra image encodes, but on the masked image they miss things read into the painted slot.

## B. Variants with the top as a reference

### B1. The piles

Piles are what the app's `GroupingService.propose` makes of the eval items when they are all dropped at once (same zip, then same folder, then same name stem), and the top is each pile's first file by name, as in the app (`scripts/ai-eval/prompts/pile.ts`). That gives 13 piles and 31 variants (8 in tuning, 12 held-out, 11 sign-off): 12 piles from zips and the long-scroll MacBooks from their folder, one top and five variants.

In most piles the variants' gold matches the top's: the same product and scene from another angle or crop (iMac, mug, iPhone, gift card holder, apron, stationery, most lighters and books). 12 variants differ from their top in scene or product:
- the five long-scroll variants: a metal mesh floor, a dark concrete bench, a window ledge, isolated with the sheet rolled up, and floating on grey (the wavy render Neesh named);
- two menus on a wooden table, where the top is one menu on a plate (menu 3 and 4);
- the open book (book 4), the white clay Apple Watch, and the isolated boxes whose top stands in a concrete room;
- the leggings zip, which holds three products: leggings (the top), a tank top, and a top-and-leggings set.

Each variant gets its usual inputs plus the top's suggestion in the app's `groupContext` shape and words: "This is a variant of "<title>" (<description>). Keep the title and tags consistent with it. Its tags: …". The top's suggestion is the same model's answer for the top from its winner run, on the same pass. A second wording (`-own`) replaces the second sentence with "Use the same name for the product and keep the tags consistent with it, but describe what this image shows: its own setting, surface, angle and colours, which may differ from the first one."

What is measured (`pnpm ai-eval:pile-score`, which also writes the winner run with the variants' answers swapped in, `<version>-merged`, for `ai-eval:table`):
- the searches, found / right, per set;
- per variant answer: gold inventions, tag support, placeholder mentions, and consistency with the top (tag overlap, share of the top's title words kept);
- by hand, on the first pass of the 12 variants that differ: answers that carry a detail from the top that is wrong for the variant (scene, pose, product, or the top's own mistake). A word-match count of this proved too noisy ("minimal", "grey" and "against" dominated it).

### B2. The top's suggestion as a reference

Runs: `b-ap`, `b-ap-own` (Apple, one pass), `b-4b`, `b-4b-own`, `b-9b`, `b-9b-own` (three passes), each on the 31 variants, on the shipped winners (ap-10s, ck-7e, ck-9d).

| Model | Variants given | Found / right (tuning, held-out, sign-off) | Tag overlap with top | Tag support | Placeholder (variants) | Wrong detail from the top (of 12) |
|---|---|---|---|---|---|---|
| Apple | nothing (ap-10s) | 83.7 / 84.5, 85.0 / 80.9, 82.7 / 81.9 | 0.47 | 62.0% | 0% | 0 |
| Apple | the top's suggestion | 83.0 / 82.4, 84.0 / 79.9, 82.1 / 80.6 | 0.95 | 56.4% | 6.5% | 9 |
| Apple | the same, own-scene wording | 83.0 / 82.4, 84.0 / 79.8, 82.1 / 80.2 | 0.93 | 58.1% | 6.5% | 9 |
| 4B | nothing (ck-7e) | 87.3 / 85.5, 87.8 / 81.7, 85.3 / 80.8 | 0.63 | 62.7% | 3.2% | 0 |
| 4B | the top's suggestion | 86.6 / 84.2, 87.3 / 80.8, 84.8 / 79.8 | 0.94 | 59.1% | 2.2% | 7 |
| 4B | the same, own-scene wording | 86.5 / 84.4, 87.2 / 81.0, 84.7 / 79.9 | 0.94 | 58.2% | 1.1% | 6 |
| 9B | nothing (ck-9d) | 92.3 / 86.8, 92.6 / 82.6, 90.6 / 84.2 | 0.53 | 72.3% | 15.1% | 0 |
| 9B | the top's suggestion | 91.5 / 86.7, 91.6 / 82.8, 89.4 / 83.0 | 0.89 | 66.4% | 17.2% | 8 |
| 9B | the same, own-scene wording | 91.5 / 86.7, 91.6 / 82.7, 89.4 / 82.9 | 0.90 | 65.3% | 17.2% | 6 |

No gold inventions with a reference, for any model (the 9B's variants had 3.2% alone; the top's words replaced them). The time per mockup barely moves.

**The consistency is copying.** Tag overlap with the top goes from about 0.5 to about 0.9 for every model, and the titles keep 0.7 to 0.97 of the top's title words (0.62 to 0.65 alone). Where the variant shows the same thing that is harmless, but where it differs the top's words win:
- **Apple** repeats the top almost word for word. All five long-scroll variants become "Long scroll laptop on paper stack", which is the top's own invention. The clay watch becomes "Apple Watch Ultra - Realistic … with silver and yellow accents", the isolated boxes "White box in concrete room", and the tank top and the top-and-leggings set both "a pair of leggings". On the same-scene piles it spreads the top's mistakes too: both gift card holders become "a clear plastic holder, also called a pouch" (they are purple hanging card holders; alone, one was named right).
- **The 4B** carries the top's pose and furniture. Every long-scroll variant "leans against a modular shelf" (or a curved surface, or an abstract form), the isolated boxes stand "on a gray concrete floor", and the open book becomes the top's closed "white book". It keeps its own product names (the tank top stays a tank top) and the menus' wooden table.
- **The 9B** carries the scene. The menus on wood move "onto a grey ceramic plate in sunlight", the isolated boxes are "in a minimalist concrete room", the window-ledge and rolled-sheet MacBooks sit "on a white bench", and the wavy floating render becomes "Blue grid MacBook on white bench", the top's placeholder included. It also drops names it read right alone: three lighters lose "Zippo-style" for the top's "cigarette lighter".

The own-scene wording saves one or two of the twelve for the Qwen models and none for Apple. The searches fall with every reference, on every set and model: 0.5 to 1.2 points of recall, and up to 2.1 of precision for Apple. The steps are small, but they all point the same way, and only a third of the items changed.

### B3. What the app does today, and product names alone

The app already gives variants a reference, in one case: once the pile's top is stashed, `pileContextFor` (`src/main/ai/inference-queue.ts`) passes its approved title, description and tags in the same words. Three more runs per model, on the same 31 variants:
- `b-*-gold`: today's path, with the top's gold standing in for the words a person approved;
- `b-*-name`: the top's suggestion cut to its product names (its Device, Print & Branding and Apparel tags), with no title, description or scene tags: "It is one of several mockups of the same product, which the first one names: Laptop. Use those names where this image shows that product, and describe this image's own setting, surface, angle and colours." (`productOnlyLines` in `pile.ts`);
- `b-*-goldname`: the same lines from the approved tags (gold), which is what `pileContextFor` would pass if it were cut to names.

| Model | Variants given | Found / right (tuning, held-out, sign-off) | Tag overlap with top | Placeholder (variants) | Invented (variants) | Wrong detail from the top (of 12) |
|---|---|---|---|---|---|---|
| Apple | nothing (ap-10s) | 83.7 / 84.5, 85.0 / 80.9, 82.7 / 81.9 | 0.47 | 0% | 0% | 0 |
| Apple | approved words (today) | 84.1 / 85.2, 84.9 / 80.7, 83.9 / 83.9 | | 22.6% | 0% | 9 |
| Apple | product names | 83.0 / 83.1, 84.5 / 80.2, 82.1 / 80.6 | 0.45 | 0% | 0% | 0 |
| Apple | approved product names | 83.0 / 83.1, 84.5 / 80.2, 82.1 / 80.6 | 0.43 | 0% | 0% | 1 |
| 4B | nothing (ck-7e) | 87.3 / 85.5, 87.8 / 81.7, 85.3 / 80.8 | 0.63 | 3.2% | 0% | 0 |
| 4B | approved words (today) | 87.5 / 85.5, 88.4 / 80.9, 86.3 / 81.9 | | 6.5% | 0% | 3 |
| 4B | product names | 87.1 / 84.6, 87.7 / 81.0, 85.2 / 80.1 | 0.57 | 6.5% | 0% | 0 |
| 4B | approved product names | 87.0 / 84.6, 87.6 / 80.7, 85.1 / 80.1 | 0.57 | 5.4% | 0% | 0 |
| 9B | nothing (ck-9d) | 92.3 / 86.8, 92.6 / 82.6, 90.6 / 84.2 | 0.53 | 15.1% | 3.2% | 0 |
| 9B | approved words (today) | 92.4 / 87.1, 92.2 / 83.1, 90.9 / 84.4 | | 23.7% | 3.2% | 7 |
| 9B | product names | 92.5 / 87.4, 92.9 / 82.9, 90.9 / 84.7 | 0.56 | 12.9% | 1.1% | 0 |
| 9B | approved product names | 92.0 / 86.9, 92.4 / 82.5, 90.5 / 84.2 | 0.53 | 12.9% | 2.2% | 0 |

(Tag overlap is measured against the top's draft, so it means nothing for the approved-words runs.)

**Today's path carries the scene too.** With the approved words, 9 (Apple), 3 (4B) and 7 (9B) of the 12 differing variants take a detail from the top that is wrong for them:
- Apple puts the floating render, the isolated one and the mesh-floor one "on a light grey wall" and the concrete-bench one "on a white slatted bench", gives the clay watch the top's "yellow and beige trail loop bands", stands the isolated boxes "in a bright concrete room", and calls the tank top and the set "gradient leggings";
- the 9B copies the top's sentence "in a bright concrete room with stairs" onto the isolated boxes word for word, moves both menus on wood onto the plate, sets three long-scroll variants "on a white bench", and calls the set "leggings";
- the 4B is the most careful (the clay watch's "trail loop bands", the boxes' "concrete interior", one menu title on the plate).
The searches look as good or better, but that flatters it: the reference here is the gold itself, and most variants share their top's gold word for word, so copying it is copying the answer. Placeholder mentions rise for Apple and the 9B (to 23 and 24% of variant answers), because the gold names the sample art's colours (item 1 of "For Neesh" above); a person who approves such words would see the same.

**Product names alone carry none of it.** No variant took a wrong detail from the top, for any model, and Apple's invented "paper" (tagged Print & Branding on its long-scroll top) did not spread either. The mixed leggings pile came through too: the tank top stayed a tank top for every model, and the set became "athletic wear" (4B), "a female athletic set" (9B) or "a bodysuit" (Apple). What it buys differs by model:
- **9B:** a little better on every number. Found and right rise by 0.2 to 0.6 on all three sets, placeholder mentions on variants fall from 15.1 to 12.9%, and inventions from 3.2 to 1.1%. Consistency barely moves (tag overlap 0.53 to 0.56). The steps are within the spread, but all point the same way.
- **4B:** recall holds (0.1 to 0.2 under), right falls 0.7 to 0.9, placeholder mentions on variants go from 3 to 6 answers of 93, and consistency falls (0.63 to 0.57).
- **Apple:** found falls 0.5 to 0.7 and right 0.7 to 1.4, and three variants of 31 get their file name as a title ("DL_Menu_Mockup_3"; one alone). There is no consistency gained (0.47 to 0.45).

**Taken from the approved tags, the names buy nothing either.** The 9B's small gain goes (found 0.1 to 0.3 under alone, right within 0.1), the 4B loses 0.7 to 1.0 of right again, and Apple calls the top-and-leggings set "leggings" (the top's approved name) and gives 6 of 31 variants their file name as a title ("Lighter_Mockup_3"). Consistency stays where it was alone for every model.

### B, in sum

| Model | Best option | Why |
|---|---|---|
| Apple | each variant alone | Every reference makes it copy: the top's words (draft or approved) carry the scene onto 9 of 12; product names leave consistency where it was and cost 0.5 to 1.4 points and more file-name titles. |
| 4B | each variant alone | The draft words carry the scene onto 6 or 7 of 12 and the approved words onto 3; product names cost 0.7 to 1.0 of right and gain no consistency. |
| 9B | each variant alone | The draft words carry the scene onto 6 to 8 of 12 and the approved words onto 7; product names are safe and within the spread, so not worth a change. |

No reference passes the test the brief set: the consistency they bring is the top's words, and where a variant's scene differs those words are wrong for it. Product names alone are the one safe form, but they don't make variants more consistent, so there is nothing to ship from B.

The app gives variants the stashed top's approved words today, and that path copies the scene now (3, 7 and 9 of the 12 differing variants for the 4B, 9B and Apple). Making `pileContextFor` return nothing would analyse every variant alone, a one-line change with its tests. It isn't made, because it removes a behaviour Neesh chose. Where the variants do share the scene, the consistent words can come from the person's own edits instead: that is experiment C.

### For Neesh (B)

1. **Should variants stop getting the stashed top's words?** Today they do, and the models copy the top's scene from them onto variants whose scene differs: Apple and the 9B do it on most such variants, the 4B on a quarter. I recommend analysing every variant alone (`pileContextFor` returns null). Product names alone are safe but gain nothing measurable.
2. **One zip can hold different products.** The leggings zip holds leggings, a tank top and a top-and-leggings set, and the grouping makes them one pile because it groups by zip first. Any reference from the top then risks naming the other two "leggings" (Apple did with the top's words, draft or approved, and with its approved name). Should a zip's files with different name stems become separate piles?

