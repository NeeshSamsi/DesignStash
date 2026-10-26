# AI suggestions, round 4: the object and its setting, variation words, 4B speed

**Started:** 2026-10-24. **Brief:** `ai-round4.md` (ai-eval agent). **Neesh's decisions (2026-10-24):**
- "All colours and placeholder areas are MEANT to be edited by the designer... ideally only the object and the background should be described, a white hoodie can almost ALWAYS be edited to be a different colour in the settings of the PSD."
- Describe no object colours ("a hoodie", never "a white hoodie"). Background and surface colours stay ("on a terracotta backdrop", "on a wooden table"). Placeholder and print areas are never described, as before.
- Pile titles become a base title plus a 1 to 3 word variation on every mockup in a pile, the top included ("Long scroll MacBook · side view").
- 4B speed: "see if there's an optimisation possible but also I want quality over speed in this case."

Work lives in `scripts/ai-eval/`; run outputs stay under `~/Library/Application Support/DesignStash-dev/ai-eval/` and are never committed. No app code changes in this round until Neesh's go.

## A. Describing no object colours

### A1. The gold (414fcc7)

75 of the 90 gold entries change: 30 of 39 tuning, 24 of 30 held-out, all 21 sign-off. Object colours go ("a silver MacBook" becomes "a MacBook", "a dark blue baseball cap with yellow stitching" becomes "a baseball cap"), and so do placeholder and print colours ("a red paper poster", "a colourful screen", "pink and green gradient covers"), with the two placeholder-only style tags (Style: Gradient, Style: Colorful on the apparel). Colours of the setting stay: backdrops, walls, surfaces and furniture ("on a white slatted bench", "an orange velvet armchair"), and the colours of props in the scene ("a yellow stapler", "a green herb sprig").

Round 3's files are kept as `gold-r3.json`, `gold-heldout-r3.json` and `gold-signoff-r3.json`; `--gold r3` picks them in `ai-eval:score`, `ai-eval:table`, `edit-carry`, `edit-carry-score` and `pile-score`. Scored with `--gold r3`, round 3's table comes out exactly as published.

The edit changes no search score: no tuning, held-out or sign-off search depends on an object colour ("phone dark" finds the iPhone in dark sand through its setting). What it changes is what the gold describes, and the gold now passes the object-colour check below with no entry flagged.

Two calls to confirm:
- **Props keep their colours.** A stapler or a sprig in the scene is part of the setting; the object's own parts lose theirs (the HomeView's speaker base, the mug's handle, the apron's straps).
- **"Amber" goes.** An amber bottle is a recognised packaging type, but amber is the bottle's colour, so the gold says "a plastic pump bottle". Materials stay: kraft paper, metallic foil, titanium, matte.

**Blind searches that only work through an object colour** (`gold-blind.json`, written by an agent who saw only the covers): "red gradient bottle", "silver zip bag", "black and white mug", "brown cosmetic bottle", "yellow apron" and "colourful", and half of "metal and gold" (the lighters). Searches by setting or mood still work under the rule: "can on teal", "white background product", "dark moody". Proposal: score those seven as their own group, outside the headline, so what the rule costs a person who searches by an object's colour stays visible.

### A2. Counting object colours (cd6a09e, a6ce3e0)

`scripts/ai-eval/object-colour.ts` counts a colour given to the mockup's object or one of its parts: a colour phrase an object noun follows within three words ("white mug", "dark blue baseball cap", "brown kraft paper stand-up pouch", "black handle"), or an object then "in" a colour that ends the phrase ("leggings in a blue to pink gradient"). A colour straight after "on", "in", "against" and the like, or with a setting noun or a word like "with" between it and the object, is the setting's ("on a small black box", "a white desk with stationery", "floating in white", "a tube in grey smoke"). Tuned on round 3's answers until its finds read right by eye; `ai-eval:table` has a column for it, and `ai-eval:score` names any gold entry that breaks the rule.

Round 3's shipped answers, share of answers with an object colour:

| Model | Tuning | Held-out | Sign-off |
|---|---|---|---|
| Apple (ap-10s) | 44% | 40% | 43% |
| 4B (ck-7e) | 81% | 59% | 54% |
| 9B (ck-9d) | 84% | 64% | 87% |

### A3. Three ways to get there

- **Strip, in code (cr-0):** `withoutObjectColours` cuts each object colour from the answer, as `withoutThing` cuts a refused thing, and mends the article and capital it leaves ("An orange box with a white lid" becomes "A box with a lid"). It needs no model, so it was measured on round 3's own answers (`strip-colours.ts` writes `<run>-strip`).
- **Prompt (cr-1):** the app's own profile with both bike examples given no colour ("Road bike against a white garage door") and a rule after the printed-words rule: "The designer sets the colours of the object itself (its body, fabric, finish, print and parts) in the mockup file, so give the object no colour in any field: write "a road bike" and never "a red road bike". The colours of the background, surfaces and things around it help people find it, so keep those." Everything else (masks, object name, checks, redo) is as shipped.
- **Both (cr-1 stripped).**

The strip and the count share their matching, so the strip's 0% partly measures itself. To check it apart from the count, every colour word left in the stripped answers was read by eye: nearly all describe the setting ("against a plain white", "on a grey tiled floor"), and the few object colours left are whole-scene tones ("in black and grey tones") or parts the count doesn't know.

Stripped answers read as they should:
- "A white ceramic mug, also called a coffee cup, featuring a black handle and interior" becomes "A ceramic mug, also called a coffee cup, featuring a handle and interior".
- "A yellow bib apron with black straps, also called a cooking apron" becomes "A bib apron with straps, also called a cooking apron".
- "A gold office stapler … surrounded by scattered white business cards" becomes "… surrounded by scattered business cards": the stapler is a prop and keeps its colour.

### A4. Results

Found / right, invented, placeholder and object colour; tuning, held-out, sign-off.

**Apple** (one greedy pass):

| Version | Found / right | Invented | Placeholder | Object colour | Bad "also called" |
|---|---|---|---|---|---|
| ap-10s (round 3) | 83.7 / 84.5, 85.0 / 80.9, 82.7 / 81.9 | 2.6, 0, 4.8% | 5.1, 6.7, 4.8% | 44, 40, 43% | 17.8% |
| strip | the same | the same | the same | 0, 0, 0% | 17.8% |
| cr-1 | 78.5 / 79.5, 81.4 / 78.8, 78.5 / 77.7 | 2.6, 0, 4.8% | 5.1, 0, 4.8% | 21, 3, 19% | 27.8% |
| cr-1 stripped | as cr-1 | as cr-1 | as cr-1 | 0, 0, 0% | 27.8% |

The prompt costs Apple 4 to 5 points of recall and precision on every set and raises its bad "also called" names from 18% to 28% of answers ("a laptop, also called a web interface"); its answers get shorter and lose search words, and they still give the object a colour in about one answer in five. The strip gets to none with no cost. **Apple: strip.**

**4B** (three passes each):

| Version | Found / right | Invented | Placeholder | Object colour |
|---|---|---|---|---|
| ck-7e (round 3) | 87.3 / 85.5, 87.8 / 81.7, 85.3 / 80.8 | 0, 0, 0% | 9.4, 10.0, 0% | 81, 59, 54% |
| strip | the same | 0, 0, 0% | 6.8, 10.0, 0% | 0, 0, 0% |
| cr-1 | 87.4 / 85.2, 87.8 / 81.9, 85.4 / 82.0 | 0, 1.1, 0% | 6.0, 7.8, 0% | 36, 23, 27% |
| cr-1 stripped | as cr-1 | 0, 1.1, 0% | as cr-1 | 0, 0, 0% |

The prompt leaves the 4B's search numbers where they were (within a pass's spread) and halves its object colours, but still leaves one in four answers with one. It adds one invention in 270 answers: "displaying a mountain landscape on its screen" for the hand-held foldable iPhone, a description of the screen's sample art. The strip reaches no object colours with no invention and the same search numbers. **4B: strip.** The prompt's only gain is slightly fewer placeholder mentions, which isn't worth an invention under a strict target.

**9B** (three passes each):

| Version | Found / right | Invented | Placeholder | Object colour | Bad "also called" |
|---|---|---|---|---|---|
| ck-9d (round 3) | 92.3 / 86.8, 92.6 / 82.6, 90.6 / 84.2 | 6.0, 0, 0% | 17.9, 15.6, 15.9% | 84, 64, 87% | 0.4% |
| strip | the same | the same | 9.4, 12.2, 6.3% | 0, 0, 0% | 0.4% |
| cr-1 | 91.5 / 84.8, 92.0 / 80.4, 90.2 / 83.7 | 8.5, 1.1, 4.8% | 11.1, 5.6, 3.2% | 16, 19, 30% | 2.6% |
| cr-1 stripped | as cr-1 | as cr-1 | 8.5, 3.3, 1.6% | 0, 0, 0% | 2.6% |

The prompt costs the 9B about 2 points of precision on tuning and held-out, and it makes things up more often. Without "a black book" to say, it reads the words printed on the open-spine book's cover into all three sign-off answers ("A sewn book block, also called a stationery item"). It also puts the HomeView smart display "on a white desk" once, and gives the postal packages tape on every pass instead of one in three. Its bad "also called" names go from 1 to 7 in 270 answers, nearly all "a MacBook, also called a computer". Object colours drop to one answer in five, and placeholder mentions fall the most of any model: the prompt keeps the 9B off its sample screens. **9B: strip.** The placeholder gain is real, but under a strict target it doesn't pay for three new kinds of invention.

The prompt also makes the 9B quicker: 1.9 requests per mockup against 2.4, 16.3 s against 18.8 s on average, because its placeholder check asks about every colour word in the answer and there are fewer. The strip can get the same saving without the prompt if it runs before the check, so the check never asks about a colour that's about to be cut. That changes the answer in some cases (a check that finds a colour only on the slot makes the answer again), so it needs its own run before it ships.

**What the count misses.** Read by eye, a handful of object colours survive the 9B's strip in both runs, in phrasings the count doesn't know: "a white Apple HomePod mini", "a silver finish", "a red and white gradient finish" on the cosmetic tube, "a gold wire bail closure" on the jam jar, "colored lanyards", and "three boxes, including a lime green one". That's about 2% of the 9B's answers; Apple's and the 4B's leftovers were read the same way (A3). The fix is a few more words for the count and the strip (HomePod, finish, closure, "coloured", a colour before "one"), which I'll make with tests when the strip goes into the app.

**Summary.** The strip wins on all three models. It reaches no object colours and leaves every search, invention and also-called number where it was. On the 4B and the 9B it also cuts placeholder mentions, because many of them are colours given to the object ("a colourful screen"). The prompt costs Apple 4 to 5 points of recall and precision, costs the 9B about 2 points of precision and new inventions, and still leaves object colours in one answer in four or five. Proposal: ship `withoutObjectColours` for every model after the answer is parsed, and keep the shipped prompts. For the 9B, move the strip before the placeholder check once a run shows the answers hold.

### A5. What the rule costs a search by colour

The blind searches (`gold-blind.json`, 90 written from the covers alone), split into the seven that only find their mockups through an object's colour (A1) and the other 83. Recall / precision:

| Model | Version | 7 by object colour | The other 83 |
|---|---|---|---|
| Apple | ap-10s (round 3) | 28.6 / 28.6 | 41.4 / 47.4 |
| | strip | 14.3 / 14.3 | the same |
| | cr-1 | 9.5 / 14.3 | 42.2 / 47.3 |
| 4B | ck-7e (round 3) | 42.9 / 42.9 | 48.6 / 56.8 |
| | strip | 0 / 0 | the same |
| | cr-1 | 23.8 / 28.6 | 47.2 / 54.4 |
| 9B | ck-9d (round 3) | 59.5 / 69.0 | 54.1 / 62.3 |
| | strip | 9.5 / 9.5 | the same |
| | cr-1 | 28.6 / 38.1 | 55.2 / 63.9 |

The strip leaves the other 83 exactly where they were, so it costs nothing outside the colour searches. Inside them, it costs nearly everything: the 9B goes from finding 6 in 10 of those mockups to 1 in 10, and its one find left ("red gradient bottle") comes through "a red and white gradient finish", a colour the count misses (A4), so with the count fixed it finds none. The gold reaches none of them now, so these seven measure only what the rule gives up. Searches by setting colour ("can on teal", "white background product") aren't in the seven and still work.

This is the trade the rule makes, and it's Neesh's call. A person who remembers "the yellow apron" won't find it by "yellow"; "apron" still finds it. To keep the colour searchable without saying it, the object's colours could go into a hidden field the search reads and the details never show. That's a design question for the spec, and I haven't built it.

## B. Variation words

### B1. The gold (4a25855, d4371b0)

`scripts/ai-eval/round4/variations.json` covers the 41 mockups in the eval's 12 B piles, tops included, written from the covers. For each one it gives what I'd say, the words that make an answer right, `subtle` where only a slight turn or crop sets it apart (so "same" isn't wrong there), and `same` for the two notebook files that look identical.

Three fixes came after the first runs:
- Accepted words now match from the start of a word. Apple's "open, closed" had counted as "close-up", and "side" matched "inside".
- The notebook pair accepts "EU" and "US". The files are `..._EU.psd` and `..._US.psd`, the prompt shows the file names, and the 9B read them ("European layout", "US layout"). That's a better answer than my "same".
- "multiple" joined "two" and "pair", and "indoor" joined "interior".

### B2. Two ways of asking

Each model gets the same prompt on one composite image, because Apple's helper takes one image (`scripts/ai-eval/variation.ts`). Both ways ask for 1 to 3 words about the angle or view, the setting or surface, the state and how many objects. They forbid the object's colour and what's printed on it, and ask for "same" where two look alike.
- **Pair:** the top beside the mockup: what does 2 show differently from 1? The top is asked beside its first variant. One request per mockup.
- **Pile:** every mockup in the pile, numbered, in one image (three to a row, 1024 px wide), with one answer each. One request per pile, and the top's variation comes with the rest.

### B3. Results

Right by the gold; "same" calls where only a slight difference sets the mockup apart (fair) and where a clear one does (wrong); the rest read by eye as vague but true, or wrong. "Told apart" counts piles where every mockup got its own words. Times are per mockup, with nothing else running.

| Model · how | Right | Tops right | "Same": fair / wrong | Other: vague but true / wrong | Told apart | Time per mockup |
|---|---|---|---|---|---|---|
| Apple · pair | 14 of 41 | 4 of 12 | 0 / 2 | 7 / 17, 1 failed | 9 of 12 | 1.1 s |
| Apple · pile | 5 of 41 | 2 of 12 | 2 / 9 | 6 / 19 | 12 of 12 | 0.4 s |
| 4B · pair | 25 of 41 | 8 of 12 | 5 / 6 | 4 / 1 | 6 of 12 | 1.3 s |
| 4B · pile | 26 of 41 | 8 of 12 | 1 / 0 | 10 / 4 | 11 of 12 | 0.6 s |
| 9B · pair | 29 of 41 | 9 of 12 | 0 / 0 | 11 / 1 | 7 of 12 | 2.8 s |
| 9B · pile | **35 of 41** | **11 of 12** | 1 / 0 | 4 / 1 | 11 of 12 | 1.3 s |

- **Apple can't do this.** Most of its answers repeat the prompt's own examples, whatever the image shows ("open, closed, single object" for a mug, "folded" for an apron lying flat, "lit" for a rolled sheet). About half its pair answers and two thirds of its pile answers are false.
- **The 4B** is right about as often either way. Asked in pairs, it calls clear differences "same" six times and gives two mockups in a pile the same words in half the piles. Asked as a pile, it makes no wrong "same" calls, but makes 4 wrong differences: two on the menus ("open, side view" for a menu lying on a plate), and "side view" for a phone and a book both seen from above.
- **The 9B** asked as a pile is right on 35 of 41, and on the top in 11 of 12 piles. Its one wrong answer is "floating view" for the rolled sheet lying on white. Its vague ones are true but name something the pile shares, like "with keyboard" for the angled iMac when the top has a keyboard too.
- **Pairs repeat themselves.** Each pair only sees two mockups, so two variants of one top often get the same words ("angled view", "angled view"). The pile request sees them all and gives each its own words in 11 of 12 piles. For the 4B and the 9B, the one pile left is a pair of identical-looking mockups: the notebooks for the 4B ("same", "same"), and for the 9B, two open lighters that differ only by angle ("open, unlit" twice).
- **The pile is quicker.** It's one request per pile, which comes to 2.2 s for the 4B and 4.4 s for the 9B, or about half the pair's time per mockup. The 9B's first pile run took three times as long because something else was loading the Mac; a rerun with llama-server's timings gave the same 41 answers in 58 s, mostly spent reading the image (570 to 1,100 prompt tokens, 1.7 to 3.5 s).

### B4. The top's own variation

Ask for it in the pile step, in the same request as the variants. The pile request gets the top right as often as asking beside its first variant (8 of 12 for the 4B both ways) or more often (11 against 9 of 12 for the 9B), and it costs no request of its own. Asked beside one variant, the top's words only say how it differs from that one ("with keyboard and mouse" beside the floating iMac). In the pile, they're chosen against all of them.

### B5. The fallback

`fileMarkers` in `variation-score.ts`: the short part of a file's name that the pile's other names don't share at the same place. That's a letter ("A" in tote-a), a number up to two digits ("2" in mug-2), or a word up to 12 letters ("EU", "clay", "isolated"). Words are lower case unless written all in capitals. Long numbers and codes ("4821", "M003T1513") don't count. When the names give no marker, or the same one twice, every mockup gets its number in the pile.

On the B piles, three piles get words from their names ("realistic" and "clay", "environment" and "isolated", "EU" and "US"), and the other nine get numbers, because their names differ only by a number anyway, or, for the long scrolls, by a code and a letter that both repeat.

It's used when the model says "same", gives no answer, or gives two mockups in a pile the same words. In those cases the mockups take their markers in place of the words ("Lighter · 2", "Lighter · 3").

### For Neesh: B

- Proposal: for the 4B and the 9B, ask for the variations in the pile step, the whole pile in one numbered image and one request, the top included. That's about 2 s a pile on the 4B and 4 s on the 9B.
- Apple gets file markers only: half to two thirds of its variation words are wrong.
- When a mockup joins a pile, the pile is asked again, and words a person edited stay. That's for the spec to confirm.
- The 9B reads file names when the covers look the same ("EU", "US"). That's the behaviour we want, and the fallback does the same from the names.

## C. 4B speed, quality first

### C1. Where the time goes

The 4B makes three kinds of request per mockup (round 3):
- **The object hint** names the object from the cover as it is.
- **The answer** is written from the masked cover.
- **A yes/no check** runs for each scene word in the answer, on the cover as it is. When one comes back no, the answer is made again.

The baseline (sp-base, three passes, 269 warm mockups) takes 9.7 s a mockup:

| Request | Count | Each | Per mockup | Reads | Writes |
|---|---|---|---|---|---|
| Object hint | 251 | 2.37 s | 2.21 s | 809 tokens in 2.1 s | 13 tokens in 0.3 s |
| Answer, and any redo | 294 | 6.25 s | 6.83 s | 1,343 tokens in 3.1 s | 114 tokens in 3.2 s |
| First check | 68 | 1.90 s | 0.48 s | 718 tokens in 1.9 s | 1 token |
| Later checks | 31 | 0.05 s | 0.01 s | 15 tokens, the rest cached | 1 token |

Most of each read is the cover image, and the cover is read three times: by the hint, by the answer (masked) and by the first check. llama-server keeps one prompt cached, and each request's image differs from the one before it. About one mockup in four gets a check: the ones whose answers name scene things.

### C2. What was tried

From the brief's list, plus one:
- **Batching the yes/no checks:** not run. Only the first check reads the image. Later checks cost 0.05 s because the cover is already cached, so one request for all of them would save under 0.01 s a mockup.
- **sp-check512:** the checks look at the cover scaled to 512 px.
- **sp-maskcheck:** the checks look at the image the answer came from, the masked cover, so the first check reuses the answer's cached image.
- **sp-2slot (caching the image):** two llama-server slots, so the hint's cover stays cached for the checks. A cached image only helps a request that starts with the same tokens, so the hint gets the answer's system prompt.
- **sp-hint512 (added):** the object hint looks at the cover scaled to 512 px. It only has to name the object.

Each ran one pass (seed 42) over the 90 covers. Two baseline passes, sp-base before the candidates and sp-base-end after, show the Mac's drift. They gave identical answers, at 9.5 s and 9.7 s a mockup.

### C3. The screen

| Version | Per mockup | Against sp-base | Answers as sp-base | Found / right, sign-off | Invented | Placeholder, tuning | By eye |
|---|---|---|---|---|---|---|---|
| sp-base | 9.47 s | | | 85.4 / 81.1 | 0% | 5 of 39 | |
| sp-check512 | 9.23 s | -2% | 90 of 90 | 85.4 / 81.1 | 0% | 5 of 39 | no change |
| sp-maskcheck | 8.86 s | -6% | 88 of 90 | 85.4 / 81.1 | 0% | 5 of 39 | keeps two "desk"s the full check turned down |
| sp-2slot | 8.76 s | -7% | 70 of 90 | 85.4 / 82.9 | 0% | 6 of 39 | a different hint, and one more placeholder mention |
| sp-hint512 | 8.21 s | -13% | 69 of 90 | 85.4 / 81.2 | 0% | 5 of 39 | about as many better as worse |

On tuning and held-out, no version moved found or right by more than 0.2 points.

- **sp-maskcheck costs quality.** On the masked cover, the check accepts a "desk" in two answers that the full cover's check had turned down: the menu cards ("on a warm wooden table", tagged desk) and the postal packages ("on a minimalist gray desk"). The gold has a desk in neither, and the invention count doesn't look for the word.
- **sp-2slot costs quality and gains little.** With the answer's system prompt, the hint changes for 20 mockups, and their answers change with it. The outdoor banner gets "a blank screen" (a placeholder mention), and the MacBook on the platform becomes a "MacBook 16 Pro". What two slots cache is the first check's image, and sp-check512 gets most of that saving without changing a word.
- **sp-hint512 is a wash.** It changes the hint for 22 mockups and the answer for 21. Read against the gold, about as many changes help as hurt:
  - Better: the long-scroll MacBook's hint was "solar panels" and becomes "laptop". The gift card holders, the sticker roll, the single poster and the ID cards are named right.
  - Worse: both stationery sets become "notebooks" and lose their business cards. The lilac background behind a gift card holder becomes white, and one menu table is tagged "floor". Three covers get no hint at all (the can, the duct tape and the Apple set), though their answers don't suffer for it.
  - Most of the rest are plurals made singular, which suits covers with one object.

### C4. Three passes

The two versions with no measured cost ran three passes (seeds 42, 43 and 44) against three baseline passes. sp-check512 ran alone, and sp-hc512 has both the hint and the checks at 512 px (the second and third passes are `--seed-base 43 --repeat 2` runs, sp-base-s43 and sp-check512-s43, joined to the first).

| Version | Per mockup | Against baseline | Answers as baseline | Found / right (tuning, held-out, sign-off) | Invented | Placeholder |
|---|---|---|---|---|---|---|
| baseline | 9.67 s | | | 87.3 / 85.4, 87.8 / 81.3, 85.3 / 80.8 | 0, 0, 0% | 12.0, 10.0, 0% |
| sp-check512 | 9.30 s | -4% | 270 of 270 | the same | the same | the same |
| sp-hc512 | 7.89 s | -18% | 207 of 270 | 87.3 / 85.5, 87.8 / 81.3, 85.3 / 80.8 | 0, 0, 0% | 12.0, 10.0, 0% |

- **sp-check512 changes nothing.** On every seed, all 270 answers and all 100 check verdicts match the baseline's. The first check drops from 1.9 s to 0.6 s. That's 0.4 s a mockup on average, and about 1.3 s on the one mockup in four that gets a check.
- **sp-hc512 keeps every number** over 270 answers. The hint is greedy, so the same 21 mockups change on every pass, and its first pass is exactly sp-hint512's. It saves 1.8 s a mockup: the hint drops from 2.4 s to 0.8 s and the first check from 1.9 s to 0.6 s. It makes the answer again 8 more times in 270 (302 answers against 294).

### C5. What's left

The answer takes 6.8 s of the 9.7 s, half reading the masked cover and half writing about 114 tokens. Making it quicker means a smaller image for the answer or a shorter answer, and both change what the model says, so neither was tried under this brief. These were 4B runs only. The 9B's colour check (A4) wasn't measured at 512 px.

### For Neesh: C

- Proposal: ship sp-check512 for the 4B, so the scene checks look at the cover scaled to 512 px. It changes no answer and saves about 4%.
- Your call: the hint at 512 px as well, 18% in all (9.7 s to 7.9 s a mockup). Every measured number holds over three passes, and by eye the changed answers (one in four) are as often better as worse. My lean is yes: on quality it comes out even, and it fixes the "solar panels" hint. It isn't a clear zero-cost change under "quality over speed", though, so it's your decision.
- Not shipping: checking the masked image (it keeps two wrong "desk"s) and two slots (a placeholder mention, and most of its saving comes from sp-check512 anyway).

## D. Apple's "also called" names (for the record)

**Decided (Neesh, 2026-10-26): keep them exactly as today.** Apple is still asked for other names, with no rule and no cut: "let's keep it because it might be useful sometimes, I'd rather have you search for something and see the wrong thing a few times than have it be buried because it's not very accessible."

Measured before the decision, on today's profile with the colour strip applied:
- **No other names (ac-1):** the description lines stop asking for other words. One greedy Apple pass.
- **Code cut:** keep asking, then cut the "also called" clause when its name is one of `badAlternate`'s vague words, with its commas. "A laptop, also called a computer, resting on…" becomes "A laptop resting on…". It's measured on today's answers (`withoutBadAlternate` in `placeholder.ts`, `cut-alternates.ts`).
- Both are compared with round 3's rule (ap-9, real names only). ap-9 ran on ap-8, which differs from today in two descriptions.

| Version | Found / right (tuning, held-out, sign-off) | Invented | Bad "also called" | Good other names | Blind, the 83 not by colour |
|---|---|---|---|---|---|
| today (ap-10s) | 83.7 / 84.5, 85.0 / 80.9, 82.7 / 81.9 | 2.6, 0, 4.8% | 17.8% (16) | 62 | 41.4 / 47.4 |
| code cut | the same | the same | 0% | 62 | the same |
| no other names (ac-1) | 83.0 / 82.4, 84.3 / 80.0, 81.9 / 79.3 | 7.7, 3.3, 0% | 0% | 0 | 42.3 / 51.2 |
| ap-8 (round 3) | 82.0 / 83.6, 83.8 / 80.2, 81.3 / 81.0 | 2.6, 0, 4.8% | 17.8% (16) | 62 | 41.4 / 47.4 |
| ap-9, the rule (round 3) | 79.9 / 81.0, 83.5 / 80.0, 79.6 / 79.0 | 0, 0, 4.8% | 8.9% (8) | 79 | 45.7 / 52.4 |

- **The code cut** moved no number. The words it cut ("design" 6 times, "computer" 3, "container" 3, "screen device" 2, "packaging item", "prop") won no search.
- **No other names** cost 0.7 to 2.6 points on the gold sets. It added three inventions ("an orange cushion", "sand and sky", "outdoor") and lost all 62 good names ("an iMac, also called a desktop computer", "an apron, also called a bib").
- **The rule** gave more and better names ("a cosmetic bottle", "a flame lighter", "a bus stop") and the best blind searches. It cost 0.3 to 2.6 points on the gold sets against ap-8.

**What the strip misses.** Two object colours turned up that the count doesn't know: "a pump bottle… with dark brown accents" and an apron "in bright yellow and black". Today's oval mugs have the same "with black accents". "Accents" can belong to the setting too (a notebook "with green accents and red accents" from the props around it).
