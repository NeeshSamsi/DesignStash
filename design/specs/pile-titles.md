# Pile titles (Sort into piles)

**Status:** designed 2026-10-08, built 2026-10-20. Its behaviour tests are real tests now (`src/shared/pile-title.test.ts`).
**Figma:** GroupCard header, plus the Sort flow sub-flow _9 · Pile titles_ (S9.1, S9.E1–E4) in section _B2 · Sort into piles_.

Every pile on the Sort board is titled by what its mockups share. The count is a meta badge, never the title.

```
[📁] Title   [4 mockups]  [similar names]                      ⋯
 └ folder icon only when the title is a folder name
```

## Title: the first rule that fits

| # | Rule | Example | Folder icon | Reason badge |
|---|------|---------|-------------|--------------|
| 0 | **Top mockup already stashed.** Use the stashed top mockup's real title. | `Clay iPhone 15 Pro` | no | `top mockup stashed` |
| 0a | **Same zip.** Every member came out of the same dropped zip, and its cleaned name says something (`y1PjyY3rTTWYuCfHXkQo_Tape-Mockup.zip` reads `Tape Mockup`; `011.zip` says nothing). | `Apple Watch Ultra Mockup` | yes | none |
| 1 | **Shared folder.** Every member has the same last `folderTrail` segment, and it isn't generic. | `iPhone 15 Clay` | yes | none (the title says it) |
| 2 | **Shared filename start.** The longest common prefix of the filenames, cut back to the last `_`, `-` or space, with at least 3 letters or digits and not generic. Shown as written, plus an ellipsis: `mug_…`. | `mug_…` | no | `similar names` |
| 3 | **The top mockup's filename**, extension included. | `poster_a3.psd` | no | none |

- **Generic folder names** never become titles: Desktop, Downloads, Documents, mockups, New Folder, Untitled Folder (case-insensitive). The list lives next to the function.
- **Generic name starts** never become titles: IMG, DSC, Untitled, Final, Copy, Artboard, Layer, Scan, Screenshot, mockup.
- **Rule 3 follows the top mockup.** Putting another one on top renames the pile straight away (S9.E3). Rule 1 and rule 2 titles don't change.
- **Hand-made piles** (drop a tile on a tile, or ⌘G) use the same chain. They often land on rule 3.
- **No renaming in Sort.** A pile only lives until it's stashed. Then the top mockup's title becomes the pile's name in My Stash.

## Meta badges

- **Count:** `1 mockup` or `N mockups`. Drop ghosts and left-behind slots don't count.
- **Reason:** shown only when the title doesn't already explain the pile. That covers rule 2 (`similar names`) and rule 0 (`top mockup stashed`).
- **No confidence badge.** We only suggest piles we're confident about.

## Where it lives

- **Function:** `pileTitle(members, opts)` in `src/shared/pile-title.ts`. It's a pure function, shared because the renderer re-titles live on every board edit: move, merge, disband, Put on top. Main uses it when it builds the proposal.
- **Return value:** `{ title, source: 'leader' | 'folder' | 'filename' | 'primary', reason?: string }`. The code keeps `leader` and `primary` as identifiers; the UI says “top mockup” and “Top”.
- **GroupCard props (from Figma):**
  - `title` gets the title.
  - `showFolder` is `source === 'folder'`.
  - `showReason` is `!!reason`, and the reason badge takes `reason` as its label.
  - The count badge takes the count label.

## Notes for the grouping service (`src/main/import/grouping-service.ts`)

- **Same zip first:** PSDs that came out of one dropped zip are proposed as one pile (reason `archive`) before the folder and stem passes, whatever folders they have inside it. The zip is recorded as `importContext.archiveName` (as dropped) and `archiveTitle` (cleaned, only when it says something).
- **A zip of different products splits by stem** (`splitZip`, 2026-10-24). The zip stays one pile when every file name shares a start (the rule 2 test) or every `extractStem` is the same. Otherwise each stem is its own pile: the largest keeps the zip's name, a tie going to the one whose first file sorts first, and each other pile is named after its stem as written ("Tank Top"), carried in its members' `archiveTitle` so rule 0a titles it. A stem of one file is a mockup on its own, and the zip's mockups never regroup by the zip's folder later. Example: `female-top-and-leggings-mockup.zip` (leggings, a top, a set) gives three mockups on their own.
- **Variant suffixes** `extractStem` strips, repeatedly: numbers and versions (`_2`, `-v2`, `2b`), a single letter (`-A`), `(copy)`, and angle words (front, back, rear, side, left, right, angle, angled, perspective, overhead, isometric, close up). `Phone_Back_2` and `Phone Front` are both `phone`.

- **Generic folders:** the folder pass groups by the whole `folderTrail`. ~/Downloads or ~/Desktop shouldn't form a pile on their own (S9.E1). Skip generic last segments there too.
- **Generic stems:** `extractStem('IMG_2041.psd')` returns `img`, so camera dumps become one stem group (S9.E2). Skip generic stems in the stem pass.
- **Confidence:** stem groups are tagged `'medium'`, but the UI no longer shows confidence. Either drop the field or only propose groups the UI treats as confident.

## Base title and variations (Proposed, Neesh 2026-10-24)

Neesh: “I don't think variants should ever have COMPLETELY different titles.” A pile has a **base title**, and every mockup in it, the top included, has a **variation** of 1 to 3 words. A mockup's full title is `base · variation`:

- Long scroll MacBook · front
- Long scroll MacBook · side view
- Long scroll MacBook · wavy surface

**The rules**
- **The base belongs to the pile.** Editing it on any mockup, the top included, renames the pile and every mockup in it. It's exact: no AI, ⌘Z undoes it. The edit check (look-over.md) carries the base exactly and never carries a variation.
- **The variation belongs to the mockup,** and is edited per mockup.
- **Where the variation comes from** (round 4, B, in `design/research/ai-round4.md`):
  - **The 4B and the 9B** write every variation in the pile from one request, the top included: the whole pile in one numbered image, about 2 s a pile on the 4B and 4 s on the 9B. A mockup the model calls “same”, or gives no answer for, takes the fallback.
  - **Apple** gets the fallback only, since half to two thirds of its own words were wrong.
  - **The fallback** is the file name's own marker (A, B, 02, “clay”), or the mockup's number in the pile when the names give none, or give the same one twice (2, 3, and so on).
- **Length** (Neesh, 2026-10-26): 1 to 3 words is only suggested, and longer variations are never blocked. The AI is asked for 1 to 3, and a person can write more. The suggestion shows in one place: an empty variation field's placeholder says “1 to 3 words”. A variation left empty takes its file marker or number back when focus leaves, so every mockup keeps one. A long variation scrolls inside its field, and rail steps and cards cut it to one line with an ellipsis.
- **Two mockups with the same words** (Neesh, 2026-10-26): the first in pile order keeps them and the next gets a number, “side”, then “side 2”, “side 3”. Only words the app wrote are numbered, from the AI or the fallback. The number is added once, when the words land, and never changes afterwards. Words a person types are kept exactly as typed, even when another mockup has the same ones; when someone has already typed “side”, the app's “side” is the one that gets the number. The number doesn't count toward the 1 to 3 words. This replaces round 4's proposal that both mockups take their file markers.
- **Casing:** a variation is stored as written (“side view”). Shown on its own, as a card title or the sidebar heading, it starts with a capital (“Side view”).
- **Search** covers both: “wavy” finds Long scroll MacBook · wavy surface.
- **Mockups on their own** keep a single title.
- **The Sort board's pile title** (the rule chain above) is the provisional name until the AI writes the base in Look it over. The old “top mockup's title becomes the pile's name in My Stash” is replaced by the base.

**Where it shows** (Figma)

| Place | What it shows | Frames |
|---|---|---|
| Look it over, a mockup in a pile | Title is two inputs under one label (**TitlePair**): the base with the pile icon, a 4 px round dot in `text/secondary` (the colour of the field borders), and the variation (180 px). Editing the base shows “Renames the pile: all 4 mockups.” under the field while it has focus, and the rail header follows as you type. | ↳ Look it over: L8.1, L8.2, L8.3; every pile step in L2, L5, L6, L7 |
| Look it over, two with the same words | The first keeps “side”; the next shows “side 2” in its field and its rail step. | ↳ Look it over: L8.4 |
| The rail | The header shows the base; each step shows only its variation (“Top · three-quarter”, “Variant · side”). Before the AI has written, a step shows the file name. | every pile step |
| Review and stash pile | Each card's title is its variation (“Side”); the rail header names the pile. | L2.4, L2.E3, L5.2, L6.E4, L7.6, L7.11 |
| While the AI writes | In a pile the base is already known, so only the variation says “Writing with AI…”. | L6.1, L6.4 |
| My Stash | The pile card shows the base. | ↳ Library: C1.1 |
| The opened pile | The header shows the base; each card shows its variation. The header isn't editable: Edit pile details renames the pile (D3.3). | ↳ Library: D3.1 to D3.E2 |
| Details sidebar, a mockup in a pile | Read: the heading is the variation, and the line under it names the pile (“Variant in Clay iPhone 15 Pro · added 12 Oct”, “Top of …”). Edit: TitlePair `size=compact` (variation 120 px). | D3.2 (read), D3.3 (edit) |

**Decisions**

| Decision | Why | Principle |
|---|---|---|
| Two inputs under one Title label, joined by a dot, for a mockup in a pile | The title has two owners, the pile and the mockup, so each part gets its own field: you can see which part you're changing and what it affects. One label and the dot keep it reading as one title, the way it shows everywhere else. A single field with a fixed base would need a separate place to rename the pile, and splitting one string on the dot breaks the moment someone types one. | 4.9, 7.12, 8.14, 1.7 |
| The base input carries the pile icon, and a hint shows only while it has focus | The icon says the base is shared before anyone types. The hint says what an edit will do at the moment it matters and is gone otherwise, so a quiet screen stays quiet. It appears because the person focused the field, so the small shift is theirs. | 8.12, 1.6, 8.17 |
| Rail steps and review cards show only the variation | The rail header already names the pile, so repeating the base made every label truncate (“Variant · Clay iPhone…”). The variation is the part that tells the steps apart. | 1.6, 2.2, 3.5 |
| The base renames exactly, with no AI | Renaming a pile is a direct edit; a model guessing per mockup would bring back the completely different titles Neesh wants to avoid. | 8.14, 0.3 |
| The separator is a drawn 4 px dot in `text/secondary` | A text “·” at app sizes is 2 to 3 px of ink and vanished at 1x between two bordered fields. A 4 px dot in the borders' colour reads as part of the pair without competing with the text (contrast 7.8:1 on `surface-2`). | 2.4, 5.5 |
| 1 to 3 words shows only as an empty variation's placeholder | The AI and the fallback always fill the field with 1 to 3 words, so the field teaches the length by example, and its width (180 px, 120 in the sidebar) says short before anyone types. A hint under the field or a word count would say the same thing on every mockup, and would make a longer variation look wrong when it's allowed. The placeholder shows only when someone clears the field to write their own, the moment it helps. | 8.15, 8.11, 1.6, no-obvious-status |
| A variation left empty takes its file marker or number back when focus leaves | Every mockup in a pile keeps a variation, as Neesh's model has it, so no two titles fall back to the bare base, and nobody meets an error for an empty field. | 8.5, 8.7 |
| Same words the app wrote get a number (“side 2”); same words a person typed stay as typed | The rail and the review cards show only the variation, so two “Side” cards would read as a mistake; numbering what the app wrote keeps every step distinct. Rewriting what someone typed would change their words without asking, and two mockups with the same words is their call. The number is added once, when the words land, so nothing changes under someone typing. | 8.14, 8.17, 2.2, 7.12 |
| Edit pile details is the one way to rename a pile from My Stash; the pile page header stays plain text (Neesh) | One route to one action, in the place that already edits the pile's other details. | 8.9, 9.2 |
| A variation shown on its own starts with a capital | Card titles and headings read as names; inside a full title the variation reads as part of one phrase. | 3.6, 7.5 |

**Open questions**
1. **Length:** settled on 2026-10-26. Suggest 1 to 3 words and never block longer ones; the suggestion shows only as an empty field's placeholder.
2. **Two mockups with the same variation:** settled on 2026-10-26. The second gets a number (“side 2”) when the app wrote the words; words a person typed stay as typed (L8.4).
3. **Renaming the base from the pile page header:** settled on 2026-10-26. No; Edit pile details (D3.3) is the one way to rename a pile from My Stash, and a mockup's base field renames it in Look it over.

## Contracts (main and shared, for L8)

Built on 2026-10-26, through the existing typed invoke and pushes, with no preload changes. The shapes are in `src/shared/pile-variation.ts`, `src/shared/approval.ts`, `src/shared/ipc/pile.ts`, `src/shared/ipc/mockup.ts` and `src/shared/library.ts`; the rules in `src/main/library/pile-titles.ts`.

**The data** (migration 0016). In a pile, every mockup's `title` is the pile's base, the same on each. Each mockup in a pile also has a `variation`: `{ words, source }`, where `source` is `ai`, `marker` (the file name's own marker), `number` (its number in the pile) or `typed` (the person's, never rewritten). A mockup on its own has a `title` and no variation. While a pile waits in To stash, both live in its drafts; Stash pile writes them to the mockups.

**Shared helpers** (`pile-variation.ts`): `fullTitle(base, variation)` gives `Long scroll MacBook · wavy surface`, or the title alone on its own; `variationHeading(words)` starts a variation shown on its own with a capital (“Side view”); `fileMarkers` and `fallbackVariations` are the fallback; `numberRepeats` is the duplicate rule; `VariationSchema` and `VariationSourceSchema` are the zod shapes.

**What each place reads**

| Place | Fields |
|---|---|
| Look it over, the Title field | `LookOverItem.title`: the base in a pile, the title on its own |
| Look it over, the variation field | `LookOverItem.variation`: null on its own |
| Rail header | the pile's base: any of its items' `title` |
| Rail step, review card | `variationHeading(item.variation.words)` |
| My Stash pile card | `LibraryItem.title`: the base (as before) |
| Opened pile, each card | `mockup:detail` per mockup: `item.variation` (the strip: `variants[].variation`) |
| Details sidebar, read (D3.2) | heading `variationHeading(item.variation.words)`; the line under it names the pile with `item.title`, and says “Top of” when `item.pileId === item.id`, “Variant in” otherwise |
| Details sidebar, edit (D3.3) | `item.title` in the base input, `item.variation.words` in the variation input |

`variation` (and `pileId` on `LibraryItem`) is on every item main sends; the zod fields are optional only so renderer fixtures from before base titles still type.

**Saving and renaming**
- `look-over:save-draft` takes `variation?: string`. On a pile item `title` is the base: a new one renames every draft in the pile, exactly, and is kept from a late AI suggestion. `variation` left out stays as it is; empty, it takes its file marker or number back. `propagatedIds` now also lists the other mockups a rename changed.
- `pile:rename` `{ pileId, base }` answers `{ pileId, base, previous, mockupIds }`. It renames the pile in Look it over (its drafts) or My Stash (its mockups). The base is trimmed and must say something. Undo: rename to `previous`.
- `pile:set-variation` `{ mockupId, words, source? }` answers `{ mockupId, variation, previous }`. Typed words are kept exactly, even when another mockup has them. Empty words take the file marker or number back, for when focus leaves an emptied field. `source` is for Undo only: it puts `previous` back as it was.
- `mockup:update` takes `variation?: string`. On a mockup in a pile, `title` is the base: a new one renames the pile (Edit pile details, D3.3).
- `look-over:draft`: when the top's suggestion lands and names the pile, every other item in it is pushed with the new base.
- Undo snapshots: the pile actions' snapshots (`PileRow`) carry each row's title and variation, and a stash snapshot carries the variations.

**For the AI variation step (ai-eval).** `new PileTitles(repo).landAi(pileId, answers)`, with `answers` a `Map` of mockup id to the model's words (or null). Each answer lands as `ai` unless the person typed there; “same” or no answer takes the fallback; words another mockup already has get a number. It writes the drafts while the pile waits in To stash, and the mockups once stashed, and returns the mockups it changed, for `look-over:draft`. Apple needs no call: the fallback fills every variation when Look it over makes a pile's drafts.

**Rules as built**
- **The fallback fills in** when Look it over makes a pile's drafts, on the mockups that join a pile in My Stash (create, add, merge; typed words kept), and at launch for piles from before base titles, whose base is the top's title.
- **The base** is the top's AI title once it lands, unless a person has renamed the pile. A variant's own AI title isn't used. Until the AI writes one, the base is what the Sort board named the pile: the zip or folder name as it is, otherwise the shared start of the names or the top's file name, without separators, ellipsis or extension (“oval mug”, “poster a3”).
- **Leaving a pile** (taken out, or the pile disbanded): the mockup keeps its full title as its own, “Long scroll MacBook · wavy surface”, and has no variation. Undo puts the pile's back.
- **Put on top** changes no titles: every mockup already holds the base.
- **Touched:** renaming the base or editing a variation doesn't mark a variant touched. Only its description and tags do, as before.
- **Search** indexes the full title, by keyword and meaning, and a hit on a mockup in a pile brings up its pile in My Stash: “wavy” finds Long scroll MacBook.
