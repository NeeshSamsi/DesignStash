# Cover image (Look it over + Detail & edit)

**Status:** designed 2026-10-12, built 2026-10-20. Its behaviour tests are real tests now (`src/renderer/src/components/CoverPanel/CoverPanel.behaviour.test.tsx`).
**Figma:** components CoverPanel, CoverDropZone and DropOverlay. The flow is in _↳ Look it over_ › sub-flow _4 · Cover_ (L4.1–L4.6, L4.E1–E8). Detail & edit uses the same CoverPanel.

```
┌──────────────────────────────┐
│                              │   hover → Replace (+ Use the PSD’s preview on your own cover)
│            cover             │   drag  → DropOverlay (same component as the library)
│                              │
└──────────────────────────────┘
[Embedded preview]  Cropped to 4:3            ⤢ Zoom
 └ source tag        └ note (optional)          └ always visible
```

## At rest

- **Cover:** the image only, with no buttons on it.
- **Tag row underneath:**
  - **Source tag:** `Embedded preview`, `Sidecar image` or `Uploaded`.
  - **Note** (optional): see "Crop or bars" below.
  - **Zoom:** a ghost button, always visible. Zoom (or Space) opens the Lightbox at full size.

## Hover

- **Replace:** a scrim over the cover with **Replace** (icon `refresh-01`) in the centre. It opens the system file picker; the current cover stays in place until a new one is chosen.
- **Use the PSD's preview:** stacked under Replace, only when the current cover isn't the embedded preview (`Uploaded` or `Sidecar image`). It's instant, and ⌘Z undoes it.
- **Hint:** “or drop or paste an image to replace” sits under the buttons.

## Getting a new cover in

| Way | What happens |
|---|---|
| Replace → file picker | Uploads; shows `replacing` |
| Drag an image onto the cover | `DropOverlay` (drag-over) over the cover, the same component as dragging PSDs onto the library; drop → `replacing` |
| ⌘V with an image on the clipboard | Same as a drop |
| Sidecar image next to the PSD | Automatic. The app uses it only when the PSD has no embedded preview, so there is no prompt. The tag reads `Sidecar image`, and **Use the PSD's preview** still works as for any cover that isn't the embedded preview. |

- **Replacing:** the old cover stays visible, dimmed, with progress on top. Esc cancels and keeps it.
- **No cover at all** (no embedded preview, no sidecar): the required `CoverDropZone` is shown, and **Stash & next is disabled** with a tooltip until a cover is added. Its drag-over is the same `DropOverlay`.

## Problems

- **Not an image** (caught while dragging): `DropOverlay` rejected, “That’s not an image · Covers can be PNG, JPG or WebP, up to 25 MB”.
- **Several files dropped:** use the first image and say so (“We’ll use the first image (3 files)”).
- **Over 25 MB, or unreadable:** the cover is unchanged, and an error `Banner` appears under the tag row: “We couldn’t use that image · Your cover hasn’t changed…”. In the required zone (nothing to fall back to), the error shows inside the drop zone.
- **Accepted types:** PNG, JPG and WebP, up to **25 MB**.

## Crop or bars (covers are 4:3 everywhere)

- **Crop** when cropping to 4:3 keeps **at least 75%** of the image (roughly 1:1 up to 16:9 landscape). Cover-fill, centred. Note: “Cropped to 4:3”.
- **Bars** otherwise (for example a 9:16 phone screenshot or a long scroll capture): show the whole image, centred, with bars in the darkest surface (`background/surface-1`). Note: “Shown whole · much taller than 4:3” (or “wider”).
- **Never edit the file.** Only the display changes; Zoom always shows the full original.
- In CoverPanel, this is `bars` (true for letterbox), `show-note` and `note`. In code, `bars` and the note are derived from the image's dimensions; they're never set by hand.

## Detail & edit

Detail uses the same CoverPanel: tag row, Zoom, and hover Replace / Use the PSD's preview. A missing cover file (`CoverImage` missing-file) offers **Replace cover**, which uses the same picker and drop behaviour.
