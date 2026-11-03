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

- **Same zip first:** PSDs that came out of one dropped zip are proposed as one pile (reason `archive`) before the folder and stem passes, whatever folders and names they have inside it. The zip is recorded as `importContext.archiveName` (as dropped) and `archiveTitle` (cleaned, only when it says something).

- **Generic folders:** the folder pass groups by the whole `folderTrail`. ~/Downloads or ~/Desktop shouldn't form a pile on their own (S9.E1). Skip generic last segments there too.
- **Generic stems:** `extractStem('IMG_2041.psd')` returns `img`, so camera dumps become one stem group (S9.E2). Skip generic stems in the stem pass.
- **Confidence:** stem groups are tagged `'medium'`, but the UI no longer shows confidence. Either drop the field or only propose groups the UI treats as confident.
