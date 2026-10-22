# Figma sync, 2026-10-22

Brings the DesignStash Figma file (`fB8PHTrzz89lAQOhXbsHMK`) in line with the app as of `78e9252` and `19b2f16` on `feat/shadcn-ui`. Inventory: `git log --since=2026-10-19 -- src/renderer src/shared`, the specs in `design/specs/`, and Roadmap scratchpad 46. Everything up to the 2026-10-21 full sync was already in Figma, so the gaps are the 2026-10-22 commits.

Status key: **fixed** (done in Figma), **added** (new screen or layer), **left** (not changed, with the reason).

## How text was edited

The plugin can't load Forma DJR Text, but existing text can still be changed: set the node to Inter, write the characters, then re-apply its text style (`setTextStyleIdAsync`). The node keeps its style and ends up in Forma again. So no instance was detached, and nothing here waits on Figma desktop for copy.

One side effect: text written this way renders in a fallback face in plugin screenshots until a Figma client with Forma lays it out again. Instances also kept stale glyphs after their component's text changed. So every changed instance text was re-touched the same way, including every ⌘F hint on the flow pages (323) and the text inside the touched SettingsLayout panes.

## Inventory

### Model catalogue

| Change | Code source | Figma node | Status |
|---|---|---|---|
| Qwen3-VL 4B is the default, best fit on every Mac: 3.0 GB, 7 languages, quality 4, speed 4, “Accurate titles and tags at a quick pace…” | `src/main/ai/registry.ts:61`, `:157` | ModelCard samples `795:9758`; ModelRow samples `223:4073`; SettingsLayout ai-model `797:9714` | fixed |
| Qwen3.5 9B for 16 GB+ Macs: 6.6 GB, quality 5, speed 3, “The richest descriptions…” | `src/main/ai/registry.ts:87` | SettingsLayout ai-model `797:9901`; ModelPicker model-2 | fixed |
| Apple’s on-device model: “Built in” tag in setup, “Built into macOS” group in Settings, size “Built in, no download”, no Delete | `registry.ts:113`, `screens/onboarding/AiStep.tsx:91`, `ai-setup.ts:26`, `components/ModelCard/ModelCard.tsx:165`, `screens/settings/AiModelPane.tsx:243` | ModelPicker gains `model-3` (`1013:6574`, `1013:6636`); SettingsLayout ai-model `797:9795` with Delete hidden and a “Built into macOS” label | fixed |
| Qwen 2.5 VL 3B and 7B, SmolVLM 2B and Moondream 2 are gone | `registry.ts` | every A3 screen, F1.2, F3.1 to F3.7, F3.4 dialog title (“Delete Qwen3-VL 4B?”), component samples, RadioGroup sample | fixed |
| A3 screens select the 4B row (the best fit) and carry each state on it; Apple’s row is hidden on the Intel screen | `ai-setup.ts:13` | `↳ Start` › A3a to A3e, No connection, Not enough disk space, Unsupported hardware, Resume partial download? | fixed |
| Download in A3a names what it fetches: “Download 3.1 GB” (model plus meaning search) | `ai-setup.ts:170`, `AiStep.tsx:155` | A3a footer | fixed |
| Disk and resume copy follow the 4B: “needs 3.0 GB”, “1.2 GB of 3.0 GB” | `ai-setup.ts:134`, `AiStep.tsx:182` | Not enough disk space, Resume partial download?, A3c | fixed |
| A3e body names the 4B | `ai-setup.ts` (`aiHeading`) | A3e | fixed |
| ModelRow samples: progress “1.2 GB of 3.0 GB · 18 MB/s · about 2 min left”, paused “Paused · 1.2 GB of 3.0 GB”, failure copy from `downloadFailureCopy` | `components/ModelRow/ModelRow.tsx:110`, `settings-copy.ts:50` | ModelRow `223:4073` | fixed |
| ModelCard verifying has no Cancel | `ModelCard.tsx:205` | ModelCard state=verifying `926:166554` hidden | fixed |
| Quality and speed bars per model | `registry.ts` | bar steps bound to `background/primary` and `background/surface-3` | fixed |

### Settings › AI model

| Change | Code source | Figma node | Status |
|---|---|---|---|
| Switch line reads “Suggests titles and tags by looking at each cover. Nothing leaves your Mac.” | `AiModelPane.tsx:207` | SettingsLayout ai-model `797:9706` | fixed |
| Hardware line on a 32 GB Mac: “Your Mac can comfortably run large models.” | `ai/hardware.ts:37` | SettingsLayout ai-model `797:9681` | fixed |
| The pane scrolls; the body is now a vertical scroller | `SettingsModal` | SettingsLayout ai-model body | fixed |
| Warning Banner when the active model can’t run (Apple Intelligence off), no action, no dismiss | `AiModelPane.tsx:219`, `lib/model-notice.ts:10` | `problem` frame `1005:171888` (hidden by default); new **F3.8 AI model · Apple Intelligence off** `1009:15405` | added |
| Search group with the Meaning search row: Not downloaded / Download, progress with Cancel, Try again, Ready with Delete | `screens/settings/MeaningSearchRow.tsx:49`, `:62`, `AiModelPane.tsx:259` | `search` frame `1005:171793` (a ModelCard with bars, globe and Use hidden); new **F3.10** to **F3.13** (`1009:15442`, `1009:15479`, `1009:15516`, `1009:15553`), shown scrolled to the bottom | added |
| F1.2, F3.1 to F3.7 re-applied on the new pane: AI off disables Use this model on both cards; Intel hides Apple’s card and disables Download | `AiModelPane.tsx` | `↳ Settings` F1.2, F3.1 to F3.7 | fixed |

### Notices at launch

| Change | Code source | Figma node | Status |
|---|---|---|---|
| Apple Intelligence toast with Choose a model | `lib/model-notice.ts:42` | new **F3.9 Apple Intelligence off · toast at launch** `1014:178017` | added |
| New-version toast: “DesignStash 1.1.0 is out”, “See what’s new in Settings › About.”, Download | `lib/update-notice.ts:38` | new **F5.10 New version · toast at launch** `1014:178547` | added |

### Settings › About and Report a problem

| Change | Code source | Figma node | Status |
|---|---|---|---|
| Report a problem row: “Tell us what went wrong. You see exactly what is sent first. No files are included.” and Report… | `AboutPane.tsx:141` | SettingsLayout about `797:10398`, `797:10376`; F1.5, F5.1 to F5.5 overrides | fixed |
| Updates row: update available with the version tag, “Version 1.1.0 is available.”, What’s new and Download | `AboutPane.tsx:107` | hidden primary Download `1015:26498` in the Updates row; new **F5.6 Update available** `1014:178400` | added |
| What’s new dialog with the release notes | `AboutPane.tsx:153` | new **F5.7 What’s new** `1014:178436`; body component **Modal body · release notes** `1015:21322` | added |
| Couldn’t check: “Couldn’t check. You may be offline, or GitHub is busy.” | `AboutPane.tsx:104` | new **F5.8 Couldn’t check for updates** `1014:178475` | added |
| The menu’s Check for Updates… runs one check in About (button loading) | `AboutPane.tsx:63`, `src/main/menu.ts:54` | new **F5.9 Checking from the menu** `1014:178511` | added |
| Report a problem dialog: message box, “Also sent with it”, Show all / Hide with the exact text, Cancel and Send | `screens/settings/ReportDialog.tsx:110` | new row F6: **F6.1** `1014:178930`, **F6.2** `1014:178969`; body component **Modal body · report** `1015:21324` (booleans `details`, `unsent`) | added |
| Couldn’t send, with Copy report | `ReportDialog.tsx:146` | new **F6.3** `1014:179008` | added |
| Sent toast (and the offline “Saved for later” in the notes) | `ReportDialog.tsx:71` | new **F6.4 Report sent** `1014:179047` | added |
| F5.1 Downloading, F5.2 Restart to update, F5.4 Starting the download | `src/main/updates/update-service.ts:112` | `↳ Settings` F5 row | left: the unsigned beta never reaches them (Download opens the release page), but `AboutPane` still renders them for signed builds. Notes now say “Signed builds only”. |

### Privacy

| Change | Code source | Figma node | Status |
|---|---|---|---|
| Onboarding: usage data on by default; the two answers become a “Share anonymous usage data” switch row; Continue | `components/ConsentPanel/ConsentPanel.tsx:108`, `:180`, `screens/onboarding/OnboardingFlow.tsx` | ConsentPanel `223:4078` (`switch-row` `1014:175934`, buttons removed); A4 Privacy consent `180:181` primary shown | fixed |
| Onboarding body copy | `screens/onboarding/onboarding-copy.ts:53` | A4 heading body | fixed |
| Never collect: “Titles, tags, descriptions or what you search for” | `ConsentPanel.tsx:43` | ConsentPanel, SettingsLayout privacy | fixed |
| Settings › Privacy line: “On by default. Helps us squash bugs and decide what to fix next.” | `ConsentPanel.tsx:106` | SettingsLayout privacy `797:10225`; F1.4, F1.4b | fixed |
| The longer never-collect line overflowed its column | | SettingsLayout privacy list items now fill and wrap | fixed |

### Search and menus

| Change | Code source | Figma node | Status |
|---|---|---|---|
| The search field hints ⌘F (⌘K still works) | `components/GlobalSearch/GlobalSearch.tsx:38` | Input search variants `212:190`; KeyboardShortcut samples `211:38`, `211:40`; spec cards and the Input, KeyboardShortcut and GlobalSearch descriptions; 323 instance hints re-touched, no ⌘K left on the flow pages | fixed |
| View has no page shortcuts (⌘1 to ⌘5 removed) | `src/main/menu.ts:76` | no Figma screen showed them | fixed (nothing to change) |
| macOS menu reference | `src/main/menu.ts:47` | new **X5 macOS menu bar · reference** `1017:185612` on `↳ Integrity & errors` › X, built from DropdownMenu and DropdownMenu Item, with notes | added |

### Import

| Change | Code source | Figma node | Status |
|---|---|---|---|
| A dropped folder’s name starts the folder trail | `src/main/import/scanner.ts` (`fe16a9e`) | the trail is never shown on screen; it feeds the model and search | fixed (nothing to draw) |
| Loose PSDs in a dropped folder form a pile named after it | `design/specs/pile-titles.md:19` | S9.1 already shows a folder-titled pile; its note now says so | fixed |

### Component and docs fixes found on the way

| Change | Figma node | Status |
|---|---|---|
| Banner’s `dismissible` property wasn’t wired to its ✕, so every Banner showed one | Banner `214:777`, all four tones | fixed |
| ConsentPanel, ModelPicker, ModelCard, ModelRow descriptions updated | Components page | fixed |
| Notes cards rewritten for every changed or new screen | `↳ Start`, `↳ Settings`, `↳ Sort` (S9.1), `↳ Integrity & errors` (X5) | fixed |

## Overflow scan

Every non-absolute TEXT, FRAME and INSTANCE was checked against its auto-layout parent, on the touched component sets (SettingsLayout, ModelPicker, ModelRow, ModelCard, ConsentPanel, Input, KeyboardShortcut, Button, Banner, Toast, DropdownMenu, DropdownMenu Item) and on every screen of `↳ Start`, `↳ Settings` and `↳ Integrity & errors`. Scrollers (`overflowDirection` set) are skipped. Result: clean, apart from two older issues this pass didn’t touch:

- **Sidebar brand name:** “DesignStash” is 116 px in a 112 px space in SidebarNav’s brand row, on every screen with the sidebar. It shows as a clipped last letter.
- **Integrity background grid:** on G1.1 to G1.8, G1.E1, G1.E2 and X4, the library grid behind the modal runs 26 px past the page slot.

## For Neesh

Nothing needs Figma desktop to fix copy. Three things to check or decide:

1. **Open the file in Figma desktop** and look over F1.2, F3.x, F5.x, F6.x, A3 and A4. Text edited through the Inter swap, and the re-touched ⌘F hints, render in a fallback face in plugin screenshots. They should snap back to Forma once a client with the font lays them out.
2. **Apple Intelligence toast (F3.9).** At the toast’s 360 px width, the description wraps to seven lines of two or three words beside Choose a model. The app does the same (`components/Toast/Toast.tsx:50`). A line that short is hard to read (Anton 3.5). Options: a shorter description, or the action under the text for long toasts.
3. **Copy report placement (F6.3).** In code, Copy report sits with Cancel and Send on the right. Figma’s ActionBar has two end buttons, so it sits at the start of the bar. Either accept the difference, or give ActionBar a third end button.

## For the orchestrator

- **Snapshot:** not refreshed. `extract.figma.js` will pick up:
  - 16 new screens (F3.8 to F3.13, F5.6 to F5.10, F6.1 to F6.4, X5);
  - ModelPicker’s new `model-3` nested ModelRow, which becomes a `model3` slot (code already has `model3`);
  - the two new local body components on `↳ Settings`.

  Then run `pnpm ds` and `pnpm ds:check`.
- **MeaningSearchCard:** its content and components weren’t edited. The re-layout pass on `↳ Start` re-touches any FILL text whose width was stale. That may have re-laid text inside those cards, with the same characters.
