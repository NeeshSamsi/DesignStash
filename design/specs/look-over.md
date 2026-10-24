# Look it over: AI working and the edit check

**Status:** Proposed (awaiting Neesh), designed 2026-10-23; the edit check reworked 2026-10-24 after experiment C. Nothing here is built.
**Figma:** _↳ Look it over_ › section _B3 · Look it over_, rows _AI working (L6)_ (L6.1–L6.5, L6.E1–E4; L6.E2 superseded, and L3.E3 superseded by L6.1 and L6.5) and _Edit check (L7)_ (L7.1–L7.12, L7.E1–E5; L7.5, L7.E1 and L7.E2 superseded), each screen with a Notes card, plus _Preview placement for L7.9_ (Option A chosen, Option B superseded, under L7.9). Components: **AiStatus** (new; `kind=none` since 2026-10-24), **PileStep** (new `note` line), **Popover** (its content is now a real slot; `shadow/raised` since 2026-10-24), **MockupMetaForm** (resting hint retired 2026-10-24) and every focusable component (focus ring rebuilt 2026-10-24). The component pass is under [Component pass](#component-pass-2026-10-24).
**Related:** [piles.md](piles.md) (the pile model these screens sit in), [tags.md](tags.md) (suggested and new chips), [ai.md](ai.md) (models and timings).

## Proposed (awaiting Neesh)

### The status line (AiStatus)

- **One line above the form, only when it has something to say** (Neesh, 2026-10-24: “if it's not necessary to say then it's weird to show it”): writing, taking a while, an offer, applied or reworded, couldn't write, and L7.1's heads-up that Next will check the edits. There is no resting text anywhere. MockupMetaForm's old hint (“AI suggested the title, description and tags. Give them a quick check before you stash it.”) is retired, on mockups on their own too, since it only ever said that the AI had done its job.
- **The row is decided when the mockup opens and never changes while it's on screen.** A mockup that opens with something to say gets the row; one that opens with nothing to say has none, and its form starts at the top. When a message has had its say (L6.3's “filled in” after 4 s, a dismissed offer in L7.10), its text fades and the row stays, empty (`kind=none`), until you move on. Nothing that can change later opens without a line: a mockup the AI is still writing opens on “Writing…”, a variant being checked on “Checking your edits…”. So the Title and Description fields never move under someone typing (8.17), and no screen carries a line that says nothing (1.6, no-obvious-status). Animating the row in was the alternative; it still moves the fields, only more slowly, so it doesn't solve the jump.
- **Kinds:**
  - **working:** a spinner. Writing suggestions, checking edits, or taking a while (with Fill it myself).
  - **done:** a sparkle. Filled in, applied, reworded.
  - **off:** an info icon. You’re filling it in, edits offered.
  - **none:** an empty row of the same height, kept after a message has had its say.
  - **failed:** an alert in `text/warning`. Couldn't write, couldn't check.
- **Actions** are xs buttons on the right: a ghost (lighter) on the left, a secondary on the right, no icons. They never compete with Next, the screen's primary action.
- **Copy stays one line** (about 75 characters with one action), so the line never grows.

### AI working (ask 1)

| Screen | What happens |
|---|---|
| L6.1 Writing with AI | Neesh, 2026-10-24. The line reads “Writing with AI…” with **Fill it myself** (ghost) in line from the start; it opts out the whole mockup. Title, Description and Tags each say “Writing with AI…”, pulsing like Skeleton (`animate-pulse`: opacity 100% to 50% over 2 s; static text with reduced motion), and each stays a real field you can click and type in (Input and Textarea `state=writing`; Tags show one thinking chip that says it). The file name doesn't appear while the AI writes. |
| L6.2 Typing while it writes | Typing opts out that field only (Neesh, 2026-10-24): it becomes a normal field, with no pulse, and stays yours. The other fields keep writing, and the suggestion fills only the fields you haven't touched when it lands (`landedDraft` already works this way). The line says what's still coming, still with Fill it myself. |
| L6.3 Suggestions land | The untouched fields fill in. Focus and the caret stay put. Each filled field gets a `background/primary-weak` tint that fades out over 1.2 s (ease out); with reduced motion it shows for 2 s with no fade. The line says what was filled; after 4 s its text fades and the row stays empty until you move on. |
| L6.4 Taking a while | When the run counts as slow (see **When it counts as slow**), the line changes to “Still writing with AI. This one is taking a while.” **Fill it myself** has been there since the start (one ghost button, for this mockup only; a pile-level stop meant the same thing). |
| L6.5 Writing with AI, on its own | The same writing state for a mockup outside a pile: every place the AI writes works this way. It replaces the old skeleton form (MockupMetaForm `state=thinking`, L3.E3), which couldn't be typed into; both are superseded. |
| L6.E1 Fill it myself | Suggestions stop for this mockup. The title starts as the file name, selected so typing replaces it. Description and tags start empty. **Write suggestions** asks again. |
| L6.E3 Couldn't write | “Couldn't write suggestions for this one, so the title is its file name.” with **Try again**. No error codes. |
| L6.E4 Review while one is still writing | Stash pile waits until every variant's suggestions have landed or been opted out (Neesh, 2026-10-24: “if it's taking a while, you can opt out and fill it yourself”). It's disabled, and the footer says why: “Stash pile waits until phone_top's suggestions arrive.” Each card still writing says “Writing suggestions…” and has a ghost **Fill it myself** under it, outside the card so the card stays one click target (8.19). The rail says “Writing suggestions…” too. |

- **The rail shows what's still coming.** PileStep gets a caption under its label: “Writing suggestions…” on the one in progress, and “Suggestions on the way” on the queued ones. That helps you pick a ready variant to work on next.
- **AI switched off in Settings** shows no line. The file-name title is expected there, so a notice would never say anything new.
- **When it counts as slow** (ai-eval rework, in code since 2026-10-24, `run-timing.ts`): about 2.5 times the median of this Mac's last 20 runs of that model, kept within a per-model floor and ceiling (Apple 8 to 30 s, Qwen3-VL 4B 20 to 60 s, Qwen3.5 9B 35 to 90 s; provisional until the 9B's timing run). With fewer than 5 runs on record the ceiling applies. The clock starts when the model begins on this mockup, after any model load, and the mockup on screen goes to the front of the queue. No timer is shown. ai-eval found the wait for a turn and the model load both short, so neither gets a state of its own.
- **One way out, for this mockup only.** No pile-level or haul-wide stop and no Settings link in the prompt: stopping for the pile meant the same as filling each one in, and changing model or turning AI off is a Settings decision.

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

**On accept (settled by Neesh, 2026-10-24):** the variant's own description is rewritten with only the change worked in, keeping its scene (L7.9: “warm beige” becomes “terracotta”, and it stays “seen from the side”). Tags take only the changes (Colour Terracotta in, Scene Studio out); the variant's own tags otherwise stay. An AI suggestion nobody approved is dropped when the edit sets its category (Neesh, 2026-10-24): “Colour Beige” goes once “Colour Terracotta” is applied, and other suggestions stay. The preview lists tags only, and Undo brings the suggestion back with the variant's own words (L7.3, L7.4, L7.8). This holds for every model. Copying the top mockup's changed words is only a fallback when a rewrite fails, and the preview marks it as copied.

**Preview before accepting (Neesh, 2026-10-24), for every model.** Hovering Apply here or Apply anyway (after 300 ms), or focusing it, opens a Popover that hangs from that button: right-aligned to the button's right edge, 8 px (spacing/2) below it so it clears the focus ring, at Popover's `lg` width (384, `w-96`) with `shadow/raised`. It may cover the Title and Description fields, since the preview shows the before and after itself, but it ends at least 8 px above the Tags row so no chip is ever half hidden; a longer diff scrolls inside the body (placement option A, chosen by Neesh on 2026-10-24; see [Placement](#placement-options-for-the-preview)). It has three regions, divided by full-width separators (hierarchy reworked 2026-10-24 after Neesh: “cluttered and without proper hierarchy”):
- **Header:** the title “Your top mockup edits” (body/sm/medium), with the reason under it (caption, text/secondary). With the 9B that's “This one is on a white backdrop.”; with 4B or Apple it's “Not checked for this variant, so look before you apply.” The status line then drops its reason (“Left out your top mockup edits.”), so the reason isn't said twice. Settled 2026-10-24 (Neesh): the 9B's reason lives only in this header.
- **Body:** the description as one sentence with an inline word diff. Unchanged words are in text/secondary; removed words are struck and in text/tertiary; added words are in text/brand at medium weight. When most of the sentence changes, it falls back to before and after on two rows, with before muted. Under it, short **Adds** and **Removes** rows of tag chips: `new` chips for added tags, display chips struck and muted for removed ones, with the words carrying the meaning. There are no section labels.
- **Footer:** real buttons, light to heavy, heaviest at the right: Close (ghost), then Apply here or Apply anyway (primary). No key chips: Return applies and Esc closes, as in every macOS dialog and every other dialog in DesignStash, and the filled button already marks the default.
- **Keys:** Tab reaches the status line's button and opens the preview. ↵ applies exactly what the preview shows. Esc closes the preview and keeps focus on the button. Tab moves into the footer.
- **Preparing:** the rewrite (any model; about 7 s with the 9B) is prepared in the background as soon as the offer shows. If it isn't ready, the body shows a spinner with “Preparing this one's version…” and one skeleton line, taking exactly the two lines the diff will, so the popover keeps its height and its buttons don't move when the version lands; the tag changes are already known. Apply works now and applies the moment the version is ready.
- **Popover component:** it now has a header description (`show-description`), dividers tied to the header and footer, a footer of buttons only, and `shadow/raised`, the elevation TagEditor's popover already uses in code (the base `PopoverContent` has none yet). It was extended once and is used the same way on every screen.

### Placement options for the preview

Neesh flagged L7.9's popover floating over the rail with no link to its trigger. Two options sit under L7.9. **Neesh chose A on 2026-10-24**; L7.7, L7.9 and L7.12 use it.

- **A, anchored popover (chosen):** it opens from Apply here, right-aligned to the button, 8 px below it, and may overlap the form. It keeps the 300 ms hover Neesh approved and one-step apply from the line, and nothing on the page moves when it opens (4.9, 8.12, 8.17).
- **B, inline panel (superseded, frame kept):** the preview opens in place under the status line, inside the form column, and pushes the fields down about 280 px. It covers nothing, and at the column's full width the sentence reads in two lines (3.5). A hover-opened panel would push the form out from under the pointer, so it opens on click or ↵ only (8.17). That replaces the 300 ms hover, and applying takes two steps: Show changes, then Apply here. The line's button toggles the panel, so the panel's footer holds only Apply here. A long description or many tags would make the column outgrow the body and scroll.

A keeps the approved interaction, the overlap is the one cost, and the preview carries the before and after so nothing hidden is lost.

### Focus ring

Button, Input and Textarea drew focus as a flush 2 px outside stroke, which any clipping parent cut into two side brackets (L7.9's Apply here). Their focus states now keep their own border and add a `focus-ring` layer: 2 px of `border/focus`, 2 px out from the control, `radius/xl`, matching the code's `focus-ring` utility (`outline 2px`, `outline-offset 2px`). Input's focus state also stopped shrinking 2 px, which had shifted the fields below a focused title. AiStatus's actions and the form column no longer clip.

Since 2026-10-24 every focusable component uses this ring: Checkbox, Switch, RadioGroup, Select (focus and open), Tabs Trigger, SidebarNav Item, MockupCard, AddMockupCard, FavouriteToggle and TagChip, and GlobalSearch through its Input. Each keeps its resting border, and the ring's radius is the control's plus 4 (`radius/lg`, `radius/xl`, `radius/full`); the two cards' rings use `radius/card-ring` (28, added 2026-10-24). Frames that cut a ring no longer clip: LibraryToolbar's `right`, MockupGrid's `cards`, TagEditor's `chips` and C4.1's page. In code, SidebarNavItem, MockupCard, AddMockupCard, FavouriteToggle and TagChip still draw `ring-2` flush, and GlobalSearch only recolours its border; they should move to `focus-ring` when built.

**Rail notes:** Checking your edits… (9B only), Edits applied, Edits reworded, and Edits offered. A dismissed offer leaves no note.

| Screen | What happens |
|---|---|
| L7.1 Top mockup edited | You change the top mockup's description or tags. The line says what Next will do. 9B: “When you go on, your edits get checked against the 3 variants.” 4B or Apple: “When you go on, your edits are offered on the 3 variants.” |
| L7.2 Checking (9B) | After Next, the model checks each untouched variant in the background, one at a time; you can carry on. The line and each untouched variant's rail note say “Checking your edits…”. Variants you edited yourself are left alone. |
| L7.3 Edits applied (9B, took it) | The edits are worked into the variant's own words (“terracotta backdrop”, still “seen from the side”), with only the tag changes; tinted as in L6.3. Line: “Worked your top mockup edits into this one's own words.” **Undo** puts back the variant's own words. Rail note: Edits applied. |
| L7.4 Edits reworded (9B, took it) | The edits are written into this variant's text, keeping its scene (“since it shows the back”). **Undo**. Rail note: Edits reworded. This is the usual 9B result. |
| L7.6 Review (9B) | Each card's line gives the result: Edits applied, Edits reworded for this one, or “Edits offered: open it to apply”. |
| L7.7 Left out, edits offered (9B) | The variant is “Clay iPhone 15 Pro · above” (renamed from “· top”, which read as the pile's top mockup). The model said no. The variant keeps its own words, and the line offers the edits (“Left out your top mockup edits.”) with **Apply anyway** · **×**, and the reason sits in the preview's header. Shown with the preview open on hover, with the 9B's rewrite in the diff. Rail note: Edits offered. |
| L7.8 Offer accepted | The edits are applied to this variant only, tinted, with **Undo**. Rail note: Edits applied. |
| L7.9 Edits offered, nothing judged (4B, Apple) | Every untouched variant keeps its own words and offers the edits, with no reason line: “Use your top mockup edits here too?” **Apply here** · **×**. There's no waiting. Shown with the keyboard path: Apply here focused and the preview open. The diff is the rewrite: “warm beige” becomes “terracotta” and the variant stays “seen from the side”; Adds Colour Terracotta, Removes Scene Studio. |
| L7.10 Offer dismissed | The line's text goes and its row stays empty (`kind=none`) until you move on; the rail note goes. Other variants keep their offers. |
| L7.11 Review (4B, Apple) | Applied, dismissed (its own tags) and unanswered (“Edits offered: open it to apply”) side by side. |
| L7.12 Preparing the preview | Hovering before the rewrite is ready (any model): the same header and footer, and a body with “Preparing this one's version…”, a spinner and one skeleton line in the diff's two lines, then the tag changes. The popover is the same height as when ready. |
| L7.E3 Undone on one variant | Back to the variant's own words, and the edits stay on offer: **Apply here** · **×**. Rail note: Edits offered. |
| L7.E4 Slow check (9B) | After 20 s the check stops waiting. Every variant it hasn't judged gets the offer, as in L7.9. Results already in stay, and a late answer for an offered variant is dropped, so nothing changes under the person. |
| L7.E5 Check failed (9B) | The variants keep their own words and each offers the edits, as in L7.9. |

**Superseded (2026-10-24), and marked so in Figma:**
- L6.E2 Stopped for this pile, by L6.4's single Fill it myself: the pile-level stop and its Turn back on are gone.
- L7.5 Kept its own, by L7.7: the offer now has a ×, and the rail reads Edits offered.
- L7.E1's Leave them · Apply to all, by L7.E4.
- L7.E2's copy-to-all, by L7.E5. Copying the edits to every variant is gone from the design.
- L7.9 · Option B (inline panel), by Option A, the anchored popover.

## Component pass (2026-10-24)

Neesh asked why the focus ring broke: “shouldn't focused variants of buttons be coming from components.”

**Why the ring broke.** It did come from the component. L7.9's Apply here was a real Button instance in `state=focus`, with no hand-drawn ring, detached instance or override. The fault was in the component: every focus variant drew focus as a 2 px stroke flush outside the button, so any parent that clips (AiStatus's `actions` frame, the form column) cut it down to its two sides. The focus states now carry a `focus-ring` layer 2 px out from the control, matching the code's `focus-ring` utility, on every focusable component (see [Focus ring](#focus-ring)).

**Sweep of every page with screens** (Flows, ↳ Start, ↳ Gather, ↳ Sort, ↳ Look it over, ↳ Library, ↳ Inboxes & Trash, ↳ Settings, ↳ Integrity & errors; Archive left alone, and the Marketing and Inspiration pages hold no app screens):
- **Detached instances:** none.
- **Hand-built stand-ins for components:** none. The only hand-made frames that look like controls are the details panel masters' `tags` and `title-field` rows, which hold real TagChip and Input instances.
- **Overrides faking a state,** each moved onto a real component option:

| Was | Now | Where |
|---|---|---|
| A Textarea's fill overridden to `background/primary-weak` to show the AI just filled it | Textarea `state=ai-filled` (rows 3 and 4–6) | ↳ Look it over: L6.3, L7.3, L7.4, L7.8, L7.E2 |
| A display TagChip with its text recoloured and struck to show a tag the change removes | TagChip `variant=removed` | ↳ Look it over: the previews in L7.7, L7.9, L7.12 and both placement options |
| ModelCard's quality and speed bars lit step by step with fill overrides | A new **StepBar** component (`value` 0 to 5, five 12×4 steps), exposed inside ModelCard as `quality-bar` and `speed-bar`, like the code's `quality` and `speed` props | ↳ Settings: all 52 cards keep their values (4B 4/4, Apple 3/5, 9B 5/3, Meaning search 0/0) |
| A border stroke added to CoverImage | CoverImage `show-border` (a 1 px `border/base` edge inside the cover, off by default) | ↳ Gather (36 covers), ↳ Inboxes & Trash (15), and CoverPanel (22) |
| An outline Button's border recoloured to `border/subtle` | Button `variant=outline-subtle`: `border/subtle`, no fill, `border/input` on hover, every size and state | LibraryToolbar's Filter and Toast's Undo and Retry (so every screen that uses them), Sort's Make pile (22 screens), the pile page's Disband pile (7) |

- **Left as they are, on purpose:** icon colours that come with a component (an icon in a primary button takes `text/on-primary`, DropdownMenu Item's destructive icon `text/error`, EmptyState's icons `text/tertiary`); the drag ghost's 0.92 opacity, which is the screen's own composition of a card being dragged; and identical-value overrides left behind on some instances by the fixes above, which change nothing on screen.

**Component checks** (all 156 components and sets on the Components page):
- **Properties:** every boolean, text, swap and slot property is wired to a layer.
- **Raw values fixed:** AiStatus's gap (now `spacing/2`), MeaningSearchCard's title-row gap (`spacing/2`) and its corner radius (`radius/xl`). No raw colours, and no text without a style.
- **Clipping that is intended:** VariantStrip (a carousel with faded ends), TagFilterPopover's tag list (now marked as a vertical scroll area), SettingsLayout's scrolling body, and MockupCard and GroupMemberThumb's hover zoom inside the cover.
- **Retired:** MockupMetaForm's resting hint and its two properties (see the status line).
- **Added:** AiStatus `kind=none`, Textarea `state=ai-filled`, TagChip `variant=removed`, CoverImage `show-border`, Button `variant=outline-subtle`, StepBar, and the `radius/card-ring` token (28).

**For the build:** the code sets the quiet outline with the same className in four places (LibraryToolbar, Toast, SortFlow's Make pile, PilePage's Disband pile); one `outline-subtle` Button variant can replace them. Textarea's AI-filled tint, TagChip `removed`, CoverImage `show-border` and the retired MockupMetaForm hint need their code counterparts.

## Design decisions

| Decision | Why | Principle |
|---|---|---|
| One status line in a fixed spot above the form, only when it has something to say; its row is set when the mockup opens and kept empty after a message ends (Neesh) | A line that only ever says the AI did its job adds nothing. AI states change on their own schedule, so adding or removing the row while the mockup is on screen would push the fields under someone typing; keeping the row for that mockup avoids it, and animating it in would still move them. One spot means one place to look for every AI state. | 1.6, 8.17, 4.9, 7.5, no-obvious-status |
| Every field says “Writing with AI…” with a Skeleton pulse and stays editable; Fill it myself sits in the line from the start (Neesh) | The file name as a title looked like a real value, which is the problem Neesh hit. A pulsing placeholder says a value is coming, borrowing the loading motion people already see in the app, and editable fields don't make anyone wait. The way out is there before anyone needs to look for it. | 8.1, 8.3, 8.14, 10.6 |
| Typing opts out that field only, and focus never moves (Neesh) | Overwriting someone's words, or yanking the caret, would break trust. The code's `landedDraft` already keeps edited fields. | 8.14, 8.17 |
| A 1.2 s fading tint on fields the AI just filled | It shows what changed without taking focus. It fades so it doesn't linger, and has a reduced-motion fallback. | 10.1, 10.5, 10.6, 10.7 |
| The opt-out when a run counts as slow for this Mac and model | Base Macs run several times slower than the Mac the limits were measured on, so the threshold follows this Mac's own runs; it never fires on a normal run and arrives before the wait feels broken. | 0.2, 8.3 |
| One opt-out, a ghost Fill it myself, for this mockup only (Neesh) | A pile-level stop did the same job, so two buttons offered one choice twice. A ghost button keeps the quiet line quiet and leaves Next as the strongest thing on screen. Model choice stays in Settings. | 1.6, 2.5, 9.2 |
| Text notes under rail steps, not icons | Words say exactly what's happening, and the rail is the running view of the pile. | 5.5, 8.20 |
| An honest fallback line with Try again where it failed; nothing when AI is off by choice | The error sits next to its cause and comes with the fix. A line that can only say one obvious thing is cut. | 8.4, 1.6, no-obvious-status |
| Stash pile waits until nothing in the pile is still writing; each card still writing offers Fill it myself (Neesh) | Nothing is stashed half-written, and the wait is never a dead end: the way out sits on the card that holds it up, and the footer says why the button is off. | 8.4, 8.7, 8.19 |
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
| The preview hangs from the button that opens it: right-aligned, 8 px below, Popover lg with `shadow/raised`, ending clear above the Tags row | A popover belongs to its trigger, so the eye goes from the button straight to what it does. The old spot over the rail had no link to the button and straddled the rail's header. Covering the fields is fine, since the preview shows the before and after. | 4.9, 8.12, 8.17, 7.5 |
| Accepting rewrites the variant's own words with only the change, and tags take only the changes (Neesh) | Experiment C showed copying the top's whole description overwrites the variant's scene. Copy survives only as a marked fallback when a rewrite fails. | 8.14, 0.3, 1.5 |
| The preview's “after” is exactly what ↵ applies | What you see is what you get. | 8.14, 7.12 |
| One focus ring for every focusable component: 2 px of `border/focus`, 2 px out, the control's own border kept | It matches the code's `focus-ring` utility, reads as one outline around the control, and no longer changes the control's size. | 8.2, 7.5, 8.17 |
| Preparing state with a spinner and one skeleton line in the diff's two lines, while the button still works | Something visible during the wait, the popover keeps its height so its buttons don't move, and the person never has to wait to act. | 8.3, 7.2, 8.17 |
| Popover's content became a real slot | The preview lives inside the popover, so the layer structure stays nested; nothing used the old placeholder. | 7.3, layer structure |
| The 9B gives a reason when it leaves the edits out, only in the preview's header; 4B and Apple show none (Neesh) | A reason only when one exists, so no line ever says something empty, and it's said once, where the person decides. | 1.6, 8.4 |
| A slow or failed check falls back to the offer | The person still gets the edits, by hand, and no late answer changes a variant under them. Copy-to-all is gone. | 8.17, 8.7 |
| Rail notes: Edits offered, Edits applied, Edits reworded | The rail shows at a glance which variants still have an answer waiting. | 8.20, 5.5 |
| A new AiStatus component, plus a `note` on PileStep | The form's hint row can't change state or hold actions, and a Banner is heavier and would push the fields. Two small additions cover every state in both asks. | 7.3, 7.5 |
| Labels say what happens: Fill it myself, Write suggestions, Apply anyway | The button tells you the next thing. | 1.7, 8.9 |

## Open questions for Neesh

1. **The status line in piles:** settled on 2026-10-24. No resting text anywhere, on piles or mockups on their own; the line shows only when it has something to say, and its row is kept for the mockup once shown.
2. **Threshold:** settled on 2026-10-24 by the ai-eval rework: 2.5 times this Mac's median for the model, within per-model limits, timed from the run's start (provisional until the 9B's timing run).
3. **Pile-level stop:** settled on 2026-10-24. Only the per-mockup Fill it myself (ghost); Stop for this pile is gone and L6.E2 is superseded.
4. **Stashing while one still writes:** settled on 2026-10-24. Stash pile waits; each card still writing offers Fill it myself (L6.E4).
5. **A failed or slow edit check:** settled on 2026-10-24. It falls back to the offer (L7.E4, L7.E5), and the old Apply to all is gone.
6. **The title in the edit check:** ask 2 names description and tags. Should an edited title go through the check too, reworded per variant ("· side")?
7. **The existing `thinking` state:** settled on 2026-10-24. Retired in favour of `state=writing` (L6.1, L6.5); MockupMetaForm `state=thinking` and L3.E3 are superseded.
8. **Accepting:** settled on 2026-10-24. Rewrite the variant's own text with only the change, tags take only the changes, and copy is a marked fallback when a rewrite fails.
9. **The offer's summary:** settled on 2026-10-24. A preview on hover or focus shows the change, for every model.
10. **A dismissed offer:** settled on 2026-10-24. ⌘Z brings it back, with no rail note.
11. **Preview placement:** settled on 2026-10-24. Option A, the anchored popover; Option B is superseded.
12. **A suggestion next to an applied tag of the same kind:** settled on 2026-10-24. Accepting drops an unapproved suggestion in a category the edit sets (L7.3, L7.4, L7.8).
