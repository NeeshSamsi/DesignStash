# Tags field (inline add)

**Status:** designed 2026-10-09, built 2026-10-20. Its behaviour tests are real tests now (`src/renderer/src/components/TagEditor/TagEditor.behaviour.test.tsx`).
**Figma:** components TagChip and TagEditor. The flow is in _↳ Look it over_ › sub-flow _3 · Tags_ (L3.1–L3.4, L3.E1–E5). Detail & edit uses the same field.

**Used in:** Look it over (MockupMetaForm `approval`) and the Detail & edit panel (MockupMetaForm `detail`), so the two must behave the same.

```
Tags
[+ Add tag] [Device iPhone 15 Pro] [Style Clay] [Scene Studio] │ [✦ Colour Beige] [✦ Mood Warm]
 └ add chip, always first      your tags, newest last           └ AI suggestions, after a divider
```

## The rule

**Add where the result appears.** Adding never happens in a separate input elsewhere. The add affordance is a chip in the same row, and it turns into the input in place. The same rule applies to any collection with an "add" action (for example, a new card is the first card in a grid, not a toolbar button).

## Chips (TagChip)

| Variant | Looks like | States |
|---|---|---|
| `add` | Dashed pill with a stronger, longer dash (`border/strong`), “+ Add tag”. Always the first chip. | default, hover |
| `input` | The add chip while typing: inset, focus ring, caret. | default (empty, placeholder “Type a tag…”), typing, invalid |
| `removable` | Your tag: `category label`. | default; hover (× appears); focus (keyboard ring); marked (selected by ⌫, error tint) |
| `new` | A tag you just added: brand outline. It fades to `removable` after about 2s. | default, hover |
| `suggested` | AI suggestion: faint dashed outline (`border/base`, tight dash) and neutral text; the orange sparkle is the only colour. | default; hover (fills with the tag surface, ✓ accept, × dismiss); thinking (same dashed pill with a shimmer bar) |

**Solid means your tag; dashed means not a tag yet.** The add chip is an empty dashed slot, and a suggestion is a filled one (fainter dash, sparkle). Accepting or adding makes it solid. Don't use a brand-coloured outline for suggestions; that's the `new` (just added) state.

**A suggestion becomes a tag only when it lands on a mockup** (Neesh, 2026-10-27, audit F-034): accepted, or stashed with its mockup. Until then Settings › Tags, the tag filter and the matches popover don't list it, and neither do they list a category the AI made only for suggestions. A suggestion that's dismissed, or whose mockup leaves without being stashed (tossed or deleted), leaves nothing behind. A dismissed one stays while its mockup is still waiting, so ⌘Z can bring it back. Typing a suggestion's name makes it yours at once. Tags a person makes are never removed for being unused, and neither is a tag that has landed on a mockup once.

## Behaviour

- **Order:** add chip, your tags (oldest → newest), a divider, then AI suggestions. New tags append to the end of your tags.
- **Open:** click the add chip, or Tab to it and press ↵. The chip becomes the input, in the same spot.
- **Matches:** typing opens a popover under the input. It lists matching existing tags grouped by category, each with its use count. ↑ ↓ move, ↵ adds, Esc closes.
- **Adding:** the tag appends, marked `new` for a moment. The input stays open and empty for the next one. If the added tag matches an AI suggestion, that suggestion disappears.
- **No match:** the popover becomes “No ‘x’ tag yet. Add it to…” with the categories listed, plus *New category…*. Picking one creates the tag and appends it. One step; there's no separate category dialog.
- **Already tagged:** typing a tag this mockup already has turns the input `invalid`. The existing chip gets the focus ring, and the popover says “Already tagged: Category · Label”. ↵ does nothing.
- **AI suggestions:** clicking the chip (or ✓) accepts it, and it moves to the end of your tags as `new`. × dismisses it for this mockup only.
- **Removing:**
  - **Mouse:** × on hover. Removal is instant, and ⌘Z undoes it.
  - **Keyboard:** with the input empty, ⌫ marks the last tag; ⌫ again removes it. ← → move between tags; Esc clears the mark.
- **Paste:** pasting “a, b, c” adds every existing match. For new names it shows the create popover one at a time; *Skip it* drops one.
- **Close:** Esc or clicking elsewhere turns the input back into the add chip. Typed text that wasn't added is dropped.
- **Long names:** truncate at about 150px, with the full name in a tooltip.
- **Many tags:** the row wraps and the field grows; there's no inner scroll. The add chip stays first, on the first line.

## Empty and AI states (TagEditor states)

| State | Shows |
|---|---|
| `empty` | The add chip and “Tags help you find this mockup later.” |
| `thinking` | The add chip, then two shimmering `suggested` placeholders. The add chip works straight away. |
| No AI suggestions (off, or nothing found) | The add chip and your tags only, with no divider. |

The TagEditor states mirror the flow: `idle · adding · suggestions · no-match · added · duplicate · marked · empty · thinking`, plus `read-only` for display.

## Build notes

- **The popover overlays the form.** In code, render it in a portal (shadcn Popover / Command), so it never gets clipped by the form or scroll containers. In Figma the fields are unclipped only so the mock can show it.
- **The input chip grows with its text** and has a minimum width of about 120px.
- **Keyboard order:** add chip → your tags → suggestions. Every chip is focusable.
