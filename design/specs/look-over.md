# Look it over: AI working and the edit check

**Status:** Proposed (awaiting Neesh), designed 2026-10-23. Nothing here is built.
**Figma:** _↳ Look it over_ › section _B3 · Look it over_, rows _AI working (L6)_ (L6.1–L6.4, L6.E1–E4) and _Edit check (L7)_ (L7.1–L7.6, L7.E1–E3), each screen with a Notes card. Components: **AiStatus** (new) and **PileStep** (new `note` line).
**Related:** [piles.md](piles.md) (the pile model these screens sit in), [tags.md](tags.md) (suggested and new chips), [ai.md](ai.md) (models and timings).

## Proposed (awaiting Neesh)

### The status line (AiStatus)

- **One line above the form, on every Look it over screen,** in the same place and at the same height. It says where the values came from or what the AI is doing for the mockup on screen, with up to two small actions. Today's hint row ("AI suggested the title, description and tags…") is that line's resting state. It's hidden in piles today; this proposal shows it there too, so the fields never jump when the AI's state changes.
- **Kinds:**
  - **working:** a spinner. Writing suggestions, checking edits, or taking a while (with the opt-outs).
  - **done:** a sparkle. Filled in, applied, reworded.
  - **off:** an info icon. You're filling it in, stopped for the pile, kept its own.
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

| Screen | What happens |
|---|---|
| L7.1 Top mockup edited | You change the top mockup's description or tags. The line says “When you go on, your edits get checked against the 3 variants.” |
| L7.2 Checking | After Next, the model checks each untouched variant in the background, one at a time; you can carry on. The line and each untouched variant's rail note say “Checking your edits…”. Variants you edited yourself are left alone. |
| L7.3 Edits applied | The edits fit as they are, so they're applied (tinted as in L6.3). **Undo** puts back the variant's own values. Rail note: Edits applied. |
| L7.4 Edits reworded | The edits apply, reworded for this variant, with a short reason (“since it shows the back”). **Undo**. Rail note: Edits reworded. |
| L7.5 Kept its own | The variant differs enough that the edits would be wrong, so it keeps its own values, with the reason. **Apply anyway**. Rail note: Kept its own. |
| L7.6 Review | Each card's line gives the result. Open a card to change it. |
| L7.E1 Taking a while | After 20 s: **Leave them** (ghost: variants keep their own values) and **Apply to all** (secondary: the edits go to every untouched variant, as today). Results that already landed stay. |
| L7.E2 Couldn't check | The edits go to every untouched variant, as today, so the outcome is predictable. The line says so, with **Undo**. |
| L7.E3 Undone on one variant | Back to the variant's own values, with **Apply edits** to redo. Rail note: Kept its own. |

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
| A failed check falls back to today's behaviour | It's a sensible default that matches what people already know. | 8.7, 0.3 |
| A new AiStatus component, plus a `note` on PileStep | The form's hint row can't change state or hold actions, and a Banner is heavier and would push the fields. Two small additions cover every state in both asks. | 7.3, 7.5 |
| Labels say what happens: Fill it in myself, Write suggestions, Turn back on, Apply anyway | The button tells you the next thing. | 1.7, 8.9 |

## Open questions for Neesh

1. **The status line in piles:** show the resting line ("Pre-filled from the top mockup…") on every mockup, which keeps the layout stable? Piles hide it today.
2. **Threshold:** a flat 20 s, or scaled per model (about twice its typical time)?
3. **Pile-level stop:** keep Stop for this pile next to Fill it in myself, or only the per-mockup option?
4. **Stashing while one still writes:** let the late suggestion fill in after stashing (proposed), or hold Stash pile until it lands?
5. **A failed edit check:** apply to all as today (proposed), or leave the variants alone?
6. **The title in the edit check:** ask 2 names description and tags. Should an edited title go through the check too, reworded per variant ("· side")?
7. **The existing `thinking` state** (MockupMetaForm skeleton, L3.E3) can't be typed into. Retire it in favour of L6.1's editable placeholders?
