# Plan: bringing the rest of DesignStash up to par

**Written:** 2026-10-22, after the AI tuning sign-off. **Status:** decided 2026-10-22 (see "Decisions"); each workstream is an agent brief in flight.

## Decisions (Neesh, 2026-10-22)

| Topic | Decision |
|---|---|
| Audience | **Public release, private beta first.** |
| Search | **Measure both:** text meaning search (small embedding models through our llama-server) and image meaning search (SigLIP 2). Build whichever earns its size. A bigger word list isn't a long-term answer. |
| Old placeholder covers | Only Neesh's dev library has them: fix it there directly, no rollout. |
| Design backlog | **Build now:** B4 to B7, D2, plus a real macOS menu. |
| Signing | **Unsigned beta for now.** Testers open it once with right-click > Open. Signing and notarization come with an Apple Developer account later. |
| Releases | **GitHub Releases**, made by an automated workflow that writes a changelog from the conventional commits. |
| Updates | Unsigned apps can't install updates themselves, so: **an update notice with what's new and a Download link**, from GitHub Releases. Self-installing updates switch on with signing. |
| Analytics | **PostHog US cloud, opt-out,** with the opt-out made clear in onboarding (already there). Revisit opt-in for EU at public release. Neesh creates the PostHog project; the key goes into release builds through a CI secret. |
| Problem reports | **To PostHog, always sendable** (the tester presses Send and sees what goes), anonymous, with the tail of a scrubbed log. No email, no GitHub account needed. |
| Pricing | **Free beta.** Pricing gets its own research before public release; entitlements stay all-free. |
| Next big feature | **Neither yet.** Ship the beta and learn from testers first. |

## Who it's for

**Brand designers who treat mockups as part of the work, not decoration.**
- Professionals, freelance or in-house, and small design agencies.
- They present brand work across many surfaces: apps and screens, print and stationery, packaging, food and drink, apparel, signage, merch.
- They juggle several brands and projects at once.
- **Their library:** they own a large mockups folder, hundreds to thousands of PSDs, built up over years. It mixes free downloads with paid kits (Pixeden, ls.graphics, Mockups Design, Mockup Maison, Bendito), and its file names range from neat to "Scene 02.psd" and random IDs.
- **What they care about:** the quality and realism of a mockup. They pick a specific scene for a specific brand ("a matte can on concrete, warm light") rather than taking whatever comes up.
- **On AI:** they're wary of blanket AI. They want help finding and organising, not generated imagery, and they want to correct what it gets wrong. So suggestions they approve, on-device and private, and honest descriptions with no invented details, matter more than clever ones.
- **The job DesignStash does:** "I know I have a mockup of a hanging shop sign somewhere. Find it in seconds, and show me the variants." Then it opens in Photoshop.
- **Agencies add:** several people searching one shared library, consistent tags, and knowing which kits are paid and licensed. These are later needs, but they shape the data model.

The core (import, AI, search) is built and measured. Around it sit facets that were started as seams and never finished (analytics, updates, licensing), or never started (packaging, semantic search, fonts). This plan lists every one, what exists, what "up to par" means, and the decision each needs.

## 0. The decision everything hangs on: who is it for?

Your AI_OS note (early October) says DesignStash became an internal tool, with no release and no Pro tier. This week's work assumed a release (a commercial licence check on the model, packaging the helper). The answer sets the scope of most workstreams:

| | Just me | A private beta (friends, classmates) | A public release |
|---|---|---|---|
| Signing and notarization | Optional (macOS lets you open your own unsigned app) | Needed: others get "can't be opened" without it | Needed |
| Updates | Not needed (rebuild) | Needed | Needed |
| Analytics | Not needed | Useful | Needed |
| Crash reports and logs | A log file | Needed | Needed |
| Licensing and payments | No | No | Only if paid |
| Website and docs | No | A short guide | Needed |

## Workstreams

Each has an owner type (agent), a size, and its dependencies. A, B and C are independent of the release decision; D onward depend on it.

### A. AI: ship what the tuning proved (Agent: main-import, about 1 day)

- **What exists:** per-model prompt profiles in `src/main/ai/prompts/` (all still the old shipped prompt), the Swift helper wired in, the model catalogue switched.
- **To do:**
  1. Put the tuned prompts into the app:
     - the names-only rule for covers with no image (all models);
     - Apple's names rule;
     - the scene-thing check (a yes/no question about each desk, table, chair, plate, hand or person the model mentions, removing it on "no"). It caught every invented desk on the held-out and sign-off sets at no measurable time cost.
  2. Fix the two AI input bugs on the Roadmap:
     - a dropped folder's own name never reaches the model;
     - pile context is built but never sent.
  3. Tell the person when Apple's model stops working because Apple Intelligence was turned off.
  4. **Refresh covers for mockups already in a library.** Placeholder covers ("Delete this layer") are fixed for new imports only.
- **Question:** how existing placeholder covers get fixed (Q-A1).

### B. Search: match meaning, not only words (Agent: search, 1 to 5 days depending on the choice)

- **What exists:** keyword search (SQLite FTS) with a hand-written synonym list and file names as hidden words.
- **What the sign-off showed:** new searches miss when the word differs from what the model wrote ("jumper" for a sweatshirt, "food packaging" for fries, "shop sign" for a signboard). The synonym list only knows what I thought to add.
- **Options:**
  1. **A much bigger word list** from a general dictionary of related words (WordNet is free). No download for people, but it stays word-for-word and adds wrong matches ("bank" the river).
  2. **Text meaning search:** a small embedding model (about 30 to 130 MB) turns each mockup's title, description and tags, and the search, into numbers that are close when the meaning is close, so "jumper" finds "sweatshirt". Runs offline. Results blend with keyword search.
  3. **Image meaning search:** a picture-and-text model (SigLIP 2, about 95 to 190 MB, Apache 2.0) compares the search with the cover image itself, so it can find things the AI never wrote down ("yellow", "flags"). Heaviest, and the most "semantic search" in the sense the CLAUDE.md promises.
- **Feasibility of option 2:**
  - **Runtime:** our `llama-server` already runs embedding models (`--embedding`), so no new runtime ships. Licence-safe candidates: bge-small-en v1.5 (MIT, about 35 to 70 MB), nomic-embed-text v1.5 (Apache 2.0, about 80 to 140 MB), Qwen3-Embedding 0.6B (Apache 2.0, about 400 to 640 MB, strongest).
  - **Cost:** one vector of 384 to 1,024 numbers per mockup, made when it's tagged, a few ms. A search embeds the query (about 20 ms) and compares against every mockup in JS: under 10 ms for thousands, stored as a BLOB in SQLite, with no vector database.
  - **Risks:** meaning search always returns something, and half-typed words embed badly. So it blends with keyword search (keywords for prefixes and exact hits, meaning for other words), with a cut-off so weak matches don't show.
  - **Measurable first:** embed the stored eval answers and score the tuning, held-out and sign-off searches with and without it, before building anything.
- **Question:** which (Q-B1).

### C. Design backlog already approved in Figma (Agent: ui, 2 to 3 days)

- **B4 to B7:** double-click opens Detail, card corners, quieter search and sort, motion for the panel and card hovers. Designed and approved, but code is on hold at your request.
- **D2:** the piles and editing model, decided on 2026-10-20 (read-only panel with Edit).
- **Question:** release them to build (Q-C1).

### D. Packaging, signing and notarization (Agent: release, 1 to 2 days, needs you for the Apple account)

- **What exists:** an `electron-builder.yml` for an Apple Silicon DMG with the hardened runtime, and staging scripts for llama-server and the Swift helper. electron-builder isn't installed and no build has ever been made. This Mac has no signing certificate.
- **Why it matters:** macOS blocks apps from unknown developers. To open on someone else's Mac without warnings, the app must be signed with a **Developer ID** certificate (an Apple Developer account, US$99 a year) and **notarized** (uploaded to Apple for an automatic check). Signing also decides whether the Swift helper's Vision and Apple Intelligence calls still work, which nobody has checked.
- **Distribution:** a DMG you host (direct download), or the Mac App Store. The App Store sandbox makes our llama-server and helper child processes and free file access hard, so direct download is the realistic route.
- **Questions:** Apple account (Q-D1), distribution route (Q-D2).

### E. Updates (Agent: release, about 1 day after D)

- **What exists:** an "Updates · Up to date" row in About, backed by a stub that always says up to date.
- **Up to par:** `electron-updater` checking a release feed, downloading in the background, and asking to restart. It needs a signed app (D) and somewhere to host releases. Your repo is public, so GitHub Releases on it is free and simple. A private repo or your own storage also works.
- **Question:** where releases live, and whether updates install themselves or ask (Q-E1).

### F. Analytics with PostHog (Agent: telemetry, about 1 day, needs you to create the project)

- **What exists (since June):**
  - consent in onboarding and in Settings › Privacy, opt-in;
  - 8 named events;
  - a PostHog client in the main process that strips paths, file names, titles, tags and search text.
- **Why nothing is sent:** there's no PostHog project, the key is read from an environment variable at launch (so a packaged app never has it), and 4 of the 8 events are never fired (import completed, AI approved, AI skipped, mandatory upload).
- **Up to par:**
  - a PostHog project with its key built into release builds;
  - the missing events, plus a few that answer real questions: model download finished or failed, time to first suggestion, search with no results (counts only, never the words);
  - a dashboard for the path from install to first search.
- **Questions:** whether you want it, the region, and opt-in or opt-out (Q-F1, Q-F2).

### G. Crash reports, logs and "Report a problem" (Agent: telemetry, about 1 day)

- **What exists:** uncaught JavaScript errors go to PostHog (when consent and a key exist). "Report a problem" copies versions and counts to the clipboard. Logs go to the console only.
- **Missing:**
  - native crashes (Electron's crash reporter isn't on);
  - a log file on disk, so a problem on another Mac can be diagnosed;
  - a place for problem reports to go.
- **Up to par:**
  - a rotating log file (a few MB, paths scrubbed);
  - "Report a problem" that opens an email or a GitHub issue with the report and, if the person agrees, the last log;
  - native crash reports, if analytics is on.
- **Question:** where reports go (Q-G1).

### H. Licensing and payments (Agent: release, 2 to 4 days, only if paid)

- **What exists:** an offline entitlements layer with 8 feature keys, all free. No feature checks a key.
- **Up to par for a paid app:**
  - a payment provider that handles tax for you (Lemon Squeezy or Paddle act as the seller of record, so you don't register for VAT; Stripe needs you to handle tax);
  - licence keys signed by the provider and checked offline in the app;
  - the Pro features actually checking their key.
- **Question:** free or paid, and what Pro would hold (Q-H1).

### I. App basics people expect (Agent: ui, 1 to 2 days)

- **What exists:** Electron's default menu, auto-hidden. No Help.
- **Up to par:**
  - a real macOS menu (DesignStash, File, Edit, View, Window, Help) with shortcuts matching the app's own, such as ⌘, for Settings and ⌘F for search;
  - "Check for updates" in the app menu;
  - a Help menu pointing to a short guide and Report a problem.
- **Question:** folded into Q-C1 (it's UI work), no separate decision unless you want a guide site.

### J. Bigger features with feature keys but no code (later, each its own project)

- **Fonts (Phase 2):** the second half of the original product. Large: font import, preview, comparison, pairing.
- **Mockup editor:** edit a mockup's smart object in the app and export, like mockuuups.studio for your own PSDs. Researched: 68% of mockups reproduce exactly; an MVP is 8 to 11 weeks (Research hub, Mockup editor tab).
- **Batch export, bring-your-own-key cloud AI, a mockup limit:** feature keys only.
- **Question:** which, if any, to plan next (Q-J1).

## Order

1. **Now, in parallel:** A (AI finishing), B (search), C (design backlog, if released).
2. **After the release decision:** D (signing), then E (updates), F and G (analytics and logs) in parallel, then H (if paid).
3. **Later:** J.

Every workstream follows the house rules:
- test-first for main-process code;
- no e2e by agents (you run the suite once per batch);
- Roadmap, Technical guide and Changelog kept current;
- explicit-path commits with no AI attribution.
