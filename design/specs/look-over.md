# Look it over: AI working and the edit check

**Status:** Proposed (awaiting Neesh), designed 2026-10-23; the edit check reworked 2026-10-24 after experiment C. Nothing here is built.
**Figma:** _↳ Look it over_ › section _B3 · Look it over_, rows _AI working (L6)_ (L6.1–L6.4, L6.E1–E4) and _Edit check (L7)_ (L7.1–L7.12, L7.E1–E5; L7.5, L7.E1 and L7.E2 superseded), each screen with a Notes card, plus _Preview placement for L7.9_ (Option A and Option B, under L7.9). Components: **AiStatus** (new), **PileStep** (new `note` line), **Popover** (its content is now a real slot; `shadow/raised` since 2026-10-24) and **Button**, **Input** and **Textarea** (focus ring rebuilt 2026-10-24).
**Related:** [piles.md](piles.md) (the pile model these screens sit in), [tags.md](tags.md) (suggested and new chips), [ai.md](ai.md) (models and timings).

## Proposed (awaiting Neesh)

### The status line (AiStatus)

- **One line above the form, on every Look it over screen,** in the same place and at the same height. It says where the values came from or what the AI is doing for the mockup on screen, with up to two small actions and, for the edit offer, a × to dismiss. Today's hint row ("AI suggested the title, description and tags…") is that line's resting state. It's hidden in piles today; this proposal shows it there too, so the fields never jump when the AI's state changes.
- **Kinds:**
  - **working:** a spinner. Writing suggestions, checking edits, or taking a while (with the opt-outs).
  - **done:** a sparkle. Filled in, applied, reworded.
  - **off:** an info icon. You’re filling it in, stopped for the pile, edits offered.
  - **failed:** an alert in `text/warning`. Couldn't write, couldn't check.
- **Actions** are xs buttons on the right: a ghost (lighter) on the left, a secondary on the right, no icons. They never compete with Next, the screen's primary action.
- **Copy stays one line** (about 75 characters with one action), so the line never grows.

### AI working (ask 1)

| Screen | What happens |
|---|---|
| L6.1 Still writing | Title and Description show “Writing a title…” and “Writing a description…” as placeholders and stay editable. Tags show two thinking chips. The file name doesn't appear while the AI writes. |
| L6.2 Typing while it writes | Typing wins: a field you type in is yours, and a late suggestion fills only the fields you haven't touched (`landedDraft` already works this way). The line says what's still coming. |
| L6.3 Suggestions land | The untouched fields fill in. Focus and the caret stay put. Each filled field gets a `background/primary-weak` tint that fades out over 1.2 s (ease out); with reduced motion it shows for 2 s with no fade. The line says what was filled, then goes back to its resting text after 4 s. |
| L6.4 Taking a while | After **20 s** on screen with nothing back, the line reads “Still writing. This one is taking a while.” with **Stop for this pile** (ghost) and **Fill it in myself** (secondary). For a mockup on its own, only Fill it in myself. |
| L6.E1 Filling it in myself | Suggestions stop for this mockup. The title starts as the file name, selected so typing replaces it. Description and tags start empty. **Write suggestions** asks again. |
| L6.E2 Stopped for this pile | The rest of the pile skips the AI: titles start as file names and the rail notes go. **Turn back on** restarts it for the variants you haven't edited. The next pile uses the AI again. |
| L6.E3 Couldn't write | “Couldn't write suggestions for this one, so the title is its file name.” with **Try again**. No error codes. |
| L6.E4 Review while one is still writing | Stash pile stays enabled. The card and the rail say “Writing suggestions…”, and the footer says the mockup fills in when its suggestions arrive, even after stashing (only fields nobody edited). |

- **The rail shows what's still coming.** PileStep gets a caption under its label: “Writing suggestions…” on the one in progress, and “Suggestions on the way” on the queued ones. That helps you pick a ready variant to work on next.
- **AI switched off in Settings** shows no line. The file-name title is expected there, so a notice would never say anything new.
- **Why 20 s:** it's twice the slowest model's measured time per mockup (Qwen3.5 9B, 10.1 s on an M3 Max; Qwen3-VL 4B 3.6 s, Apple 2.5 s). Normal runs never see the prompt; base chips and a long queue do. The clock starts when the mockup is on screen, and no timer is shown.
- **No haul-wide stop and no Settings link in the prompt.** Changing model or turning AI off is a Settings decision. A pile is the unit people work through, so the pile-level stop covers the repetitive case.

### Edit check (ask 2, coming soon)

**Updated 2026-10-24, after experiment C.**
- **Today's rule is wrong for most variants.** `carriedEdit` copies the top mockup's whole description and tags over every untouched variant. That overwrote the scene of all 23 variants that needed the edit adapted, and gave the edit to all 14 that shouldn't get it.
- **What's likely to ship:**
  - **9B:** the model checks whether what the edit added is true of each untouched variant's cover. On a yes it rewrites the variant's own text with the edit, keeping its scene. On a no it leaves the variant alone. It takes about 7 s per variant, in the background.
  - **4B and Apple:** nothing is judged.
- **Neesh's decision:** when the edit doesn't reach a variant, the variant **offers the edit**. The design covers both models, since the split isn't confirmed yet.

**The offer:** one quiet, dismissable line per variant, in the status line (AiStatus `off`, with an action and `dismissible`).
- It shows when you reach the variant. Nothing changes until you accept.
- **Apply here** (or **Apply anyway** after a no) applies the edits to that variant only, with Undo. **×** dismisses it for that variant, and ⌘Z brings it back.
- An offer nobody answers never blocks Stash pile. The variant is stashed with its own words.

**On accept (settled by Neesh, 2026-10-24):** the variant's own description is rewritten with only the change worked in, keeping its scene (L7.9: “warm beige” becomes “terracotta”, and it stays “seen from the side”). Tags take only the changes (Colour Terracotta in, Scene Studio out); the variant's own tags and its AI suggestions otherwise stay. This holds for every model. Copying the top mockup's changed words is only a fallback when a rewrite fails, and the preview marks it as copied.

**Preview before accepting (Neesh, 2026-10-24), for every model.** Hovering Apply here or Apply anyway (after 300 ms), or focusing it, opens a Popover that hangs from that button: right-aligned to the button's right edge, 8 px (spacing/2) below it so it clears the focus ring, at Popover's default width (md, 288) with `shadow/raised`. It may cover the Title and Description fields, since the preview shows the before and after itself (placement option A, recommended; option B is under [Placement](#placement-options-for-the-preview)). It has three regions, divided by full-width separators (hierarchy reworked 2026-10-24 after Neesh: “cluttered and without proper hierarchy”):
- **Header:** the title “Your top mockup edits” (body/sm/medium), with the reason under it (caption, text/secondary). With the 9B that's “This one is on a white backdrop.”; with 4B or Apple it's “Not checked for this variant, so look before you apply.” The status line then drops its reason (“Left out your top mockup edits.”), so the reason isn't said twice.
- **Body:** the description as one sentence with an inline word diff. Unchanged words are in text/secondary; removed words are struck and in text/tertiary; added words are in text/brand at medium weight. When most of the sentence changes, it falls back to before and after on two rows, with before muted. Under it, short **Adds** and **Removes** rows of tag chips: `new` chips for added tags, display chips struck and muted for removed ones, with the words carrying the meaning. There are no section labels.
- **Footer:** real buttons, light to heavy, heaviest at the right: Close (ghost), then Apply here or Apply anyway (primary). No key chips: Return applies and Esc closes, as in every macOS dialog and every other dialog in DesignStash, and the filled button already marks the default.
- **Keys:** Tab reaches the status line's button and opens the preview. ↵ applies exactly what the preview shows. Esc closes the preview and keeps focus on the button. Tab moves into the footer.
- **Preparing:** the rewrite (any model; about 7 s with the 9B) is prepared in the background as soon as the offer shows. If it isn't ready, the body shows the current sentence muted, a spinner with “Preparing this one's version…” and two skeleton lines; the tag changes are already known. Apply works now and applies the moment the version is ready.
- **Popover component:** it now has a header description (`show-description`), dividers tied to the header and footer, a footer of buttons only, and `shadow/raised`, the elevation TagEditor's popover already uses in code (the base `PopoverContent` has none yet). It was extended once and is used the same way on every screen.

### Placement options for the preview

Neesh flagged L7.9's popover floating over the rail with no link to its trigger. Two options sit under L7.9.

- **A, anchored popover (recommended):** it opens from Apply here, right-aligned to the button, 8 px below it, and may overlap the form. It keeps the 300 ms hover Neesh approved and one-step apply from the line, and nothing on the page moves when it opens (4.9, 8.12, 8.17).
- **B, inline panel:** the preview opens in place under the status line, inside the form column, and pushes the fields down about 280 px. It covers nothing, and at the column's full width the sentence reads in two lines (3.5). A hover-opened panel would push the form out from under the pointer, so it opens on click or ↵ only (8.17). That replaces the 300 ms hover, and applying takes two steps: Show changes, then Apply here. The line's button toggles the panel, so the panel's footer holds only Apply here. A long description or many tags would make the column outgrow the body and scroll.

A is recommended. It keeps the approved interaction, the overlap is the one cost, and the preview carries the before and after so nothing hidden is lost.

### Focus ring

Button, Input and Textarea drew focus as a flush 2 px outside stroke, which any clipping parent cut into two side brackets (L7.9's Apply here). Their focus states now keep their own border and add a `focus-ring` layer: 2 px of `border/focus`, 2 px out from the control, `radius/xl`, matching the code's `focus-ring` utility (`outline 2px`, `outline-offset 2px`). Input's focus state also stopped shrinking 2 px, which had shifted the fields below a focused title. AiStatus's actions and the form column no longer clip. Checkbox, Switch, RadioGroup, Select, Tabs Trigger, GlobalSearch, SidebarNav Item, MockupCard, AddMockupCard, FavouriteToggle and TagChip still draw focus the old way, outside these flows.

**Rail notes:** Checking your edits… (9B only), Edits applied, Edits reworded, and Edits offered. A dismissed offer leaves no note.

| Screen | What happens |
|---|---|
| L7.1 Top mockup edited | You change the top mockup's description or tags. The line says what Next will do. 9B: “When you go on, your edits get checked against the 3 variants.” 4B or Apple: “When you go on, your edits are offered on the 3 variants.” |
| L7.2 Checking (9B) | After Next, the model checks each untouched variant in the background, one at a time; you can carry on. The line and each untouched variant's rail note say “Checking your edits…”. Variants you edited yourself are left alone. |
| L7.3 Edits applied (9B, took it) | The edits are worked into the variant's own words (“terracotta backdrop”, still “seen from the side”), with only the tag changes; tinted as in L6.3. Line: “Worked your top mockup edits into this one's own words.” **Undo** puts back the variant's own words. Rail note: Edits applied. |
| L7.4 Edits reworded (9B, took it) | The edits are written into this variant's text, keeping its scene (“since it shows the back”). **Undo**. Rail note: Edits reworded. This is the usual 9B result. |
| L7.6 Review (9B) | Each card's line gives the result: Edits applied, Edits reworded for this one, or “Edits offered: open it to apply”. |
| L7.7 Left out, edits offered (9B) | The model said no. The variant keeps its own words, and the line offers the edits (“Left out your top mockup edits.”) with **Apply anyway** · **×**, and the reason sits in the preview's header. Shown with the preview open on hover, with the 9B's rewrite in the diff. Rail note: Edits offered. |
| L7.8 Offer accepted | The edits are applied to this variant only, tinted, with **Undo**. Rail note: Edits applied. |
| L7.9 Edits offered, nothing judged (4B, Apple) | Every untouched variant keeps its own words and offers the edits, with no reason line: “Use your top mockup edits here too?” **Apply here** · **×**. There's no waiting. Shown with the keyboard path: Apply here focused and the preview open. The diff is the rewrite: “warm beige” becomes “terracotta” and the variant stays “seen from the side”; Adds Colour Terracotta, Removes Scene Studio. |
| L7.10 Offer dismissed | The line goes back to its resting text and the rail note goes. Other variants keep their offers. |
| L7.11 Review (4B, Apple) | Applied, dismissed (its own tags) and unanswered (“Edits offered: open it to apply”) side by side. |
| L7.12 Preparing the preview | Hovering before the rewrite is ready (any model): the same header and footer, and a body with the current sentence muted, “Preparing this one's version…” with a spinner, two skeleton lines and the tag changes. |
| L7.E3 Undone on one variant | Back to the variant's own words, and the edits stay on offer: **Apply here** · **×**. Rail note: Edits offered. |
| L7.E4 Slow check (9B) | After 20 s the check stops waiting. Every variant it hasn't judged gets the offer, as in L7.9. Results already in stay, and a late answer for an offered variant is dropped, so nothing changes under the person. |
| L7.E5 Check failed (9B) | The variants keep their own words and each offers the edits, as in L7.9. |

**Superseded (2026-10-24), and marked so in Figma:**
- L7.5 Kept its own, by L7.7: the offer now has a ×, and the rail reads Edits offered.
- L7.E1's Leave them · Apply to all, by L7.E4.
- L7.E2's copy-to-all, by L7.E5. Copying the edits to every variant is gone from the design.

## Design decisions

| Decision | Why | Principle |
|---|---|---|
| One status line in a fixed spot above the form, always present | AI states change on their own schedule, so a line that appears and disappears would push the fields while someone types. One spot also means one place to look for every AI state. | 8.17, 4.9, 7.5 |
| Placeholders while the AI writes, with editable fields | The file name as a title looked like a real value, which is the problem Neesh hit. Placeholders say a value is coming, and editable fields don't make anyone wait. | 8.1, 8.3, 8.14 |
| Typing wins per field, and focus never moves | Overwriting someone's words, or yanking the caret, would break trust. The code's `landedDraft` already keeps edited fields. | 8.14, 8.17 |
| A 1.2 s fading tint on fields the AI just filled | It shows what changed without taking focus. It fades so it doesn't linger, and has a reduced-motion fallback. | 10.1, 10.5, 10.6, 10.7 |
| The opt-out after 20 s, tied to measured model times | It never fires on normal runs, and it's there before the wait feels broken. | 0.2, 8.3 |
| Two opt-outs: Fill it in myself (heavier, right) and Stop for this pile (lighter, left); nothing haul-wide | Each earns its place: one mockup, or the repetitive pile case. Model choice stays in Settings. | 2.5, 9.2, action weight |
| Text notes under rail steps, not icons | Words say exactly what's happening, and the rail is the running view of the pile. | 5.5, 8.20 |
| An honest fallback line with Try again where it failed; nothing when AI is off by choice | The error sits next to its cause and comes with the fix. A line that can only say one obvious thing is cut. | 8.4, 1.6, no-obvious-status |
| Stash pile stays enabled while one is still writing, and the late fill keeps working after stash | Waiting on a slow model shouldn't block the person, and nothing they typed is ever overwritten. | 8.5, 8.7 |
| The edit check runs in the background after Next | It never blocks the flow. Progress shows where the person already looks (the line and the rail). | 8.3, 8.17 |
| Every check result names what happened and why, with Undo or Apply anyway | No silent changes; every result can be reversed in place. | 8.4, 8.14, reversible actions |
| When the edit doesn't reach a variant, it's offered there: one line, in the status line, dismissable | The person decides per variant, next to what it changes. One quiet line keeps the screen's primary action (Next) the strongest thing on it. | 4.9, 2.3, 2.5 |
| Nothing changes until you accept, and accepting touches that variant only | Experiment C showed blanket copying is wrong for most variants. A variant's own words are the safe default. | 8.7, 8.14, 0.3 |
| × to dismiss, after Banner's dismiss, with ⌘Z to bring the offer back and no rail note (Neesh, 2026-10-24) | A familiar control for a quiet offer, and the same look as other dismissable messages. | 8.10, 7.5 |
| A preview on hover and focus of the apply button, showing exactly what will change | People see the result before committing, right where they'd click, and the keyboard gets the same route as the mouse. | 8.12, 8.20, 4.9, 8.13 |
| The preview splits into header, body and footer, with dividers | Title and reason, the change itself, and the actions are three different jobs. Separate regions give one reading order: what this is, what changes, what to do. | 2.1, 2.6, 4.6 |
| An inline word diff in one sentence | Only a word or two changes, so showing just those words makes the change readable at a glance. | 1.5, 2.2, 1.6 |
| Added words in text/brand at medium weight, removed words struck and muted | The change gets the most contrast and the unchanged words step back. Strikethrough and weight carry the meaning as well as colour. | 2.4, 2.3, 5.5 |
| Row labels Adds and Removes; no Description or Tags labels | The sentence and the chips explain themselves, and the remaining labels are words that say what happens. | 1.6, 3.6, 5.5 |
| Real buttons in the footer, light to heavy, and no key chips | Actions look like actions, with the heavy one at the right. Return and Esc behave as in every macOS dialog. No other DesignStash dialog shows key chips, and the buttons are already the visible route the shortcuts need, so the chips only added clutter. | 2.5, 8.2, 8.9, 8.12, 1.6, action weight |
| The preview hangs from the button that opens it: right-aligned, 8 px below, Popover md with `shadow/raised` | A popover belongs to its trigger, so the eye goes from the button straight to what it does. The old spot over the rail had no link to the button and straddled the rail's header. Covering the fields is fine, since the preview shows the before and after. | 4.9, 8.12, 8.17, 7.5 |
| Accepting rewrites the variant's own words with only the change, and tags take only the changes (Neesh) | Experiment C showed copying the top's whole description overwrites the variant's scene. Copy survives only as a marked fallback when a rewrite fails. | 8.14, 0.3, 1.5 |
| The preview's “after” is exactly what ↵ applies | What you see is what you get. | 8.14, 7.12 |
| One focus ring for Button, Input and Textarea: 2 px of `border/focus`, 2 px out, the control's own border kept | It matches the code's `focus-ring` utility, reads as one outline around the control, and no longer changes the control's size. | 8.2, 7.5, 8.17 |
| Preparing state with a spinner and skeleton lines, while the button still works | Something visible during the wait, and the person never has to wait to act. | 8.3, 7.2 |
| Popover's content became a real slot | The preview lives inside the popover, so the layer structure stays nested; nothing used the old placeholder. | 7.3, layer structure |
| The 9B gives a reason when it leaves the edits out; 4B and Apple show none | A reason only when one exists, so no line ever says something empty. | 1.6, 8.4 |
| A slow or failed check falls back to the offer | The person still gets the edits, by hand, and no late answer changes a variant under them. Copy-to-all is gone. | 8.17, 8.7 |
| Rail notes: Edits offered, Edits applied, Edits reworded | The rail shows at a glance which variants still have an answer waiting. | 8.20, 5.5 |
| A new AiStatus component, plus a `note` on PileStep | The form's hint row can't change state or hold actions, and a Banner is heavier and would push the fields. Two small additions cover every state in both asks. | 7.3, 7.5 |
| Labels say what happens: Fill it in myself, Write suggestions, Turn back on, Apply anyway | The button tells you the next thing. | 1.7, 8.9 |

## Open questions for Neesh

1. **The status line in piles:** show the resting line ("Pre-filled from the top mockup…") on every mockup, which keeps the layout stable? Piles hide it today.
2. **Threshold:** a flat 20 s, or scaled per model (about twice its typical time)?
3. **Pile-level stop:** keep Stop for this pile next to Fill it in myself, or only the per-mockup option?
4. **Stashing while one still writes:** let the late suggestion fill in after stashing (proposed), or hold Stash pile until it lands?
5. **A failed or slow edit check:** settled on 2026-10-24. It falls back to the offer (L7.E4, L7.E5), and the old Apply to all is gone.
6. **The title in the edit check:** ask 2 names description and tags. Should an edited title go through the check too, reworded per variant ("· side")?
7. **The existing `thinking` state** (MockupMetaForm skeleton, L3.E3) can't be typed into. Retire it in favour of L6.1's editable placeholders?
8. **Accepting:** settled on 2026-10-24. Rewrite the variant's own text with only the change, tags take only the changes, and copy is a marked fallback when a rewrite fails.
9. **The offer's summary:** settled on 2026-10-24. A preview on hover or focus shows the change, for every model.
10. **A dismissed offer:** settled on 2026-10-24. ⌘Z brings it back, with no rail note.
11. **Preview placement:** A, the anchored popover (recommended), or B, the inline panel that opens on click and drops the hover?
12. **A suggestion next to an applied tag of the same kind:** after accepting, the variant can show an AI suggestion “Colour Beige” beside the applied “Colour Terracotta” (L7.3, L7.4, L7.8). Should accepting drop suggestions in a category the edit just set?
