# Settings

**Status:** designed 2026-10-19, not built.
**Figma:** SettingsLayout (one variant per section), ModelCard, TagTree, HardwareSummary, Switch, and the shared dialogs. The flows are on _↳ Settings_ › _F · Settings_: the panes (F1), My Stash cases (F2), AI model cases (F3), editing tags (F4) and updates (F5). The exploration behind it is on the Archive page.

## The modal

- **Opening:** the sidebar's Settings button opens an 880×760 modal over whatever page you're on. Esc or ✕ closes it and you're back where you were. Settings never takes over the main window.
- **Sections:** My Stash, AI model, Tags, Privacy and About, listed on the left with the same selected style as the main sidebar. Panes scroll inside the modal.
- **Rows:** every pane uses the same grouped rows: a title, a line that shows the real value (a path, a size, when something was last checked), and the control on the right. Every inline button is the same secondary button; only the close ✕ is a ghost icon button.
- **Status rows:** title + status tag on one line (“Stash check · In sync”, “Updates · Up to date”), when it was checked underneath, the action on the right.
- **Accordions:** a switch that unlocks more (on-device AI, usage data) heads its own container, and its options open underneath when it's on, the same as onboarding.

## My Stash

- **Stash folder:** title and description, then a full-width path field: folder icon, path, “128 mockups · 14.2 GB”, and Change… attached on the right. Change… picks a folder, then asks Move files · Point only · Cancel; moving shows progress, and the new folder takes effect after a restart (Restart now · Later).
- **Stash check:** runs every time DesignStash opens, comparing the folder with its records. It reads “In sync, checked when DesignStash opened, today 9:41” with Check now. When it finds drift: “3 to review”, what it found, and Review… (opens reconciliation).
- **Trash:** “3 mockups · 412 MB, kept until you empty it”, with Open Trash and Empty Trash…. Empty Trash asks once; there's no undo.

## AI model

- **This Mac** (HardwareSummary) on top, the same card as onboarding.
- **Vision models.** The model looks at the mockup's cover (the PSD's embedded preview); the file name and folder trail are extra text context. Each model is a llama.cpp GGUF plus its mmproj projector, downloaded together with one progress figure; sizes include both. Catalogue: SmolVLM2 2.2B (small, fastest), Qwen 2.5 VL 3B (medium, the default and usual best fit), Qwen 2.5 VL 7B (large, 16 GB+), and Moondream 2 if a compatible build exists.
- **Use on-device AI:** the switch heads the container; your models open underneath. Off collapses them and says titles come from file names; downloaded models stay on the Mac.
- **Lists:** Your models (the one in use first), then Available to download.
- **ModelCard** (after Handy): name, In use / Best fit for this Mac, one plain line, quality and speed as five-step bars; a divider; languages, size, and the action. The model in use has an orange border and no fill.
- **Actions are buttons,** never the whole card: Use this model, Download, Cancel, Try again, Delete. Downloading shows progress, speed and time left in the card's footer. A stopped download says why in the footer and offers Try again (it resumes).
- **Delete:** deleting the model in use asks first and says AI titles and tags stop until another is picked. Deleting any other model is instant with Undo.

## Tags

The rule from `tags.md` holds here too: **add where the result appears.**

- **Layout:** one container per category: the name, “3 tags” and ⋯ (Rename, Delete category…). Tag rows show the use count (“24 mockups”).
- **Adding:** Add tag closes each category and turns into an input row in place; ↵ adds and keeps the input open. The new row is outlined in orange for about 2s.
- **Already a tag elsewhere:** the input turns red, says which category has it, and offers “Move it to <this category>”. Nothing is created twice.
- **Tag menu:** ⋯ on hover or right-click: Rename (inline), Move to ›, Merge into…, Delete.
- **Delete** is instant: the row goes, the count drops, and the toast offers Undo, which restores the tag on every mockup. No confirm.
- **Merge** asks first (it changes many mockups at once): pick the tag to keep and see how many mockups move. It joins two names for the same thing, for example “iPhone” into “iPhone 15 Pro”.
- **Two tiers, no nesting:** category, then tag. Each category is its own container with its own Add tag row; New category closes the list. Roll-up is at the category level: filtering by a category includes all its tags. Search already matches partial names (“iPhone” finds iPhone 15 Pro and iPhone 14). The old parent field (`parent_tag_id`, `TAG_SET_PARENT`) has been removed.
- **New category:** the dashed New category row closes the list and turns into a header input.
- **Delete a category:** with tags, it asks where they go (mockups keep their tags); an empty one deletes at once with Undo.
- **Empty:** one line on where tags come from, and New category.

## Privacy

- **Share anonymous usage data** heads its container; when it's on, What we collect (green ticks) and What we never collect (red crosses) open underneath, the same lists and colours as onboarding. Off collapses them and stops sending at once.

## About

- **Version,** then Updates with its tag and when it last checked, and Check for updates. When one is found the tag shows the version, the line shows download progress and the button becomes Cancel; when it's ready, Restart now.
- **Licences** (View) and **Report a problem** (Report…). No orange text links.

## Stash check: resolving changes (G1)

- **When:** the launch check, or Check now, finds PSDs that turned up in the stash folder or mockups whose PSD went missing. A blocking modal lists them (Esc does nothing until it's resolved).
- **Found in your stash folder:** cover thumbnail, name, size; Ignore · Add. Add puts it in To sort, like anything you gather, with a toast and Undo. No extra dialog.
- **Gone from your stash folder:** the stored cover, the mockup's name, “Its PSD isn't in your stash folder any more”; Remove · Relink… (point it at where the file went).
- **Bulk:** Add all and Remove all per group; one Ignore all in the footer, instant with Undo. “N left” and Done, enabled at 0.
- **Checking again:** skeleton rows in place of the groups; never a spinner.
- **Couldn't check:** nothing blocks; a toast says so and points at Settings › My Stash, where the Stash check row reads “Couldn't check” with Check now.
- **Copy:** plain names, never file paths or error codes.

