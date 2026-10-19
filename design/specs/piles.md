# Piles in Look it over

**Status:** designed 2026-10-12, not built. The pending tests in `src/renderer/src/components/PileRail/PileRail.behaviour.test.tsx` (`it.todo`) track it.
**Figma:** components PileRail, PileStep and CoverPanel (deck). The flow is in _↳ Look it over_ › sub-flow _2 · Piles_ (L2.1–L2.5, L2.E1–E5) and _5 · Moving around_ (L5.1–L5.3, L5.E1–E3).

## Model: a pile is a sub-form of drafts

- **Two levels:** the haul has horizontal main steps (Sort → Look it over → Tucked away), and the pile inside the current step is vertical.
- **Drafts until the end:** everything in a pile is a draft until **Stash pile**. Nothing goes into the stash one mockup at a time, so every mockup in the pile stays clickable and editable. There's never a mix of stashed and unstashed mockups in one pile.
- **Order:** the top mockup comes first, then the variants, pre-filled from the top mockup. Editing the top mockup later updates the variants you haven't touched, and keeps the ones you edited (L2.E1).
- **Moving around:** **Next** goes on in order, any step in the rail jumps there, and **Review pile** jumps to the end.
- **No Skip for now inside a pile:** Next already moves on without stashing. Skip for now exists only for mockups on their own, where it sends one to the end of the queue.

## Screen

```
[ cover + deck ]  [ form ]                    [ PileRail ]
 └ deck: mockups still to come peek            PILE 1 OF 3
   out behind the cover                        Clay iPhone 15 Pro
   ("2 left in this pile"); not clickable      ✓ Top · phone_front
                                               ● Variant · phone_side
                                               ○ Variant · phone_back
                                               ○ Variant · phone_top
                                               ○ Review & stash pile
```

- **The cover never moves:** it sits exactly where it does on a single-mockup screen. The rail docks to the right as a recessed well (`background/surface-1`, full body height), so only the form narrows.
- **PileStep statuses:** `done` means the draft is ready (a neutral tick, not green, because nothing is stashed yet). `current`. `todo`. `skipped` (dashed) means you jumped past it (via the rail or Review pile) without opening it.
- **Deck:** `show-deck` peeks one card, `deck-more` a second, and `deck-label` reads “N left in this pile”. It counts the mockups not looked at yet, so it thins as you go. There's no deck on the last one.

## Header badge

- **In piles:** “Pile n of m”, and “Pile n of m · review” on the review step.
- **After the last pile:** the mockups on their own use the plain haul count (“11 of 12”).

## Review & stash (the “check your answers” step)

- **Cards:** the pile's drafts as library **MockupCard**s (no new card type). Clicking one goes back to that draft.
- **Skipped mockups** read “Not checked · pre-filled from the top mockup”. They're still stashable.
- **Stash pile (N)** commits the whole pile. A toast with Undo appears and the next pile starts on its top mockup.

## Back

Back always means “the previous thing”. Anything already stashed reopens editable.

| Where you are | Back goes to |
|---|---|
| A draft inside a pile | The previous draft (same as the step above in the rail) · L5.1 |
| A pile’s top mockup | The previous pile’s review, marked stashed (“Pile 1 of 3 · stashed”). Open a card to edit and Save; Next returns to the pile you were on · L5.2 |
| A mockup on its own | The previous one; if stashed, the primary is Save & next · L5.3. From the first one on its own: the last pile’s review |
| The very first mockup | The Sort board, piles as you left them, only while nothing is stashed. After that, Back is hidden there · L5.E3 |

## Order and header

Piles come first, then the mockups on their own. The header reads “Pile n of m” in piles and the haul count (“11 of 12”) after them.

## Leaving mid-pile

- **Finish later** keeps every draft and parks the pile in To stash. Coming back resumes on the same step.
