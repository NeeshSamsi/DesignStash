# Demo videos from the real app

Researched 2026-10-29. Everything marked "measured" was run on this Mac (Apple Silicon, macOS 27, Electron 42.4.0 / Chrome 148) from files under `tmp/demo-research/`. Everything else cites a URL and was read or searched on the same day.

## Short answer

**Feasible, and cheap.** We can script the real packaged app, record its own window at Retina, and render every format from one source with free tools.

Recommended pipeline:

1. **Seed and drive** the packaged app with Playwright, reusing `e2e/fixtures` (fresh profile, stub AI, 1440×900 window). Playwright logs every click and move with timestamps.
2. **Capture natively**: `screencapture -v -l <windowId>` (or ScreenCaptureKit with a window filter later). It records only the DesignStash window, with the real macOS window frame, at about 55 fps and 2x pixels. Measured.
3. **Compose with HyperFrames**: HTML plus GSAP. It puts the footage in a frame, draws our own cursor and click rings from the logged coordinates, zooms and pans, adds titles and captions.
4. **Render all formats** from the one composition: 16:9, 9:16, 4:5, 1:1, MP4 H.264, WebM, GIF and poster frames.
5. **Bundle** short silent MP4 loops in the app, played by a plain `<video>`.

Rough cost: no licence fees. About one day to build `pnpm demo:render` and a first clip, then roughly an hour per new clip. Disk: a few hundred MB of dev dependencies kept outside the app.

**Remotion or HyperFrames:** both rendered the same 6-second test to near-identical output. Pick HyperFrames and do not run both (section 7).

**Two things need Neesh's decision:** which mockups we may show in public (section Risks), and whether the demo says the AI step is sped up.

---

## 1. Capture

Measured results first, then the table.

| Check | Result |
|---|---|
| Packaged app under Playwright | Launches with a seeded profile and `DESIGNSTASH_E2E_STUB_AI=1`. |
| Window pixels | 1440×900 CSS px at devicePixelRatio 2. `page.screenshot` gives 2880×1800. |
| Playwright `recordVideo` on Electron | VP8, 1440×900 (1x), 25 fps, 164 KB for 4.9 s. Soft and low bitrate. Not usable as final footage. |
| CDP `Page.startScreencast` | Frames arrive, JPEG, at 1x viewport size (1440×900 metadata). 280 events in 3 s, which looks like duplicate ticks. Not Retina by default. |
| `screencapture -v -V 4 -l <windowId>` | Window only. 2972×1892 (the window plus its shadow margin), H.264 yuv420p BT.709, average 54.6 fps, 4 s. The real traffic-light capsule, rounded corners and the macOS cursor are in the picture. Looked at one frame: only DesignStash, nothing else on screen. |
| Codecs the packaged app plays | `canPlayType` says "probably" for H.264, HEVC, AV1 (MP4 and WebM), VP9, VP8 and AAC. |

| Option | Quality | Smoothness | Unattended | Upkeep when UI changes | Verdict |
|---|---|---|---|---|---|
| Playwright `recordVideo` | VP8, 1x, hardcoded about 1 Mbit/s ([issue 31424](https://github.com/microsoft/playwright/issues/31424)) | 25 fps | Yes | None | Fine for a debugging clip, no more |
| CDP screencast | 1x JPEG frames | Uneven | Yes | None | Loses to native |
| Frame-by-frame renderer capture (virtual time, `capturePage`, `beginFrame`) | Could be sharp at 2x | Perfect in theory | Yes | High | Not tested. CSS transitions, view transitions and React timers all need the page clock frozen and stepped, and we know view transitions behave oddly (see the browser-harness note). Skip unless native capture stutters |
| **Native window capture (`screencapture -l`, later ScreenCaptureKit)** | Retina, real window chrome, real fonts and blur | About 55 fps, variable | Yes, with Screen Recording permission granted once | None. The footage is whatever the app shows | **Winner** |
| Real renderer in a browser harness inside a composition | Sharp, clock-driven | Perfect | Yes | Medium: stub `window.api` must track the real one | Reserve for tricky shots. Window chrome and vibrancy are missing, so it is not quite "the real app" |

Notes on the winner:

- **Cursor:** Playwright's mouse events are synthetic, so the system cursor did not move in my test. The captured frame showed it parked. Plan: hide or crop the system cursor, log Playwright's own coordinates, and draw the cursor in the composition. That also gives smooth easing paths and click rings.
- **Window-only is enforced by the window id.** Capture the window by id, never a screen rectangle, so notifications and other apps cannot leak in. Get the id with `CGWindowListCopyWindowInfo` (my `winid.swift`, 8 lines). A Swift helper command is the clean long-term home, since `native/designstash-helper` already exists.
- **Shadow margin:** the output includes the shadow area as black. Crop to the window rectangle in the composition.
- **Permission:** capture needs Screen Recording granted to the process that runs it. Unattended runs on a fresh machine or CI need a one-time grant, so this pipeline runs on Neesh's Mac only.
- **Smoothness:** animation in the app runs on its own clock, so footage is as smooth as the app is while captured. Keep other CPU work off during a take. Re-record on a bad take; takes are cheap.

## 2. Polish

| Option | Scriptable | Licence and price | Notes |
|---|---|---|---|
| In code (our composition) | Fully | Free | Cursor path with easing, click rings, zoom keyframes from logged click coordinates. Deterministic and reviewable in git |
| Screen Studio | No CLI or API found | Sources disagree: subscription about $29/month or $9/month yearly ([Trainn](https://trainn.co/blog/screen-studio-pricing/)), older listings show one-time $89. Check [screen.studio](https://screen.studio) | Best-looking manual tool. Hand-driven, so every re-take means a manual edit |
| FocuSee | Not scriptable as far as I found | $19.99/month or one-time about $70 to $180 per [TrustRadius](https://www.trustradius.com/compare-products/focusee-vs-screen-studio). Vendor page: focusee.imobie.com/pricing.htm | Auto zoom like Screen Studio. Manual |
| Cap | Manual recorder | AGPL-3.0 with MIT crates, [LICENSE](https://github.com/CapSoftware/Cap/blob/main/LICENSE). About 24k stars | Free to use as an app. AGPL matters only if we embed its code, which we will not |
| Screenize | Search found nothing | Unknown | Not verified. Skip |

Decision: do polish in code. The zoom and cursor are a few lines of GSAP once click coordinates are logged, and re-renders stay in sync with re-takes. A manual recorder breaks the "one script, every format" goal.

Resolution limit to know: a 2x capture lets us zoom about 1.5x at 1920 px output before it softens. My test zoomed 2.4x into a 2880 px still and the result looked soft in both tools. Keep zooms at or under 1.5x for 1080p output, or accept softness. Capturing at a larger window size helps; Retina at 1440×900 is the floor.

## 3. Composition and rendering

| Option | Quality | Scriptable | Determinism | Licence and price | Maturity | Effort |
|---|---|---|---|---|---|---|
| **HyperFrames** | Rendered CRF 16 by default, 1.1 MB for 6 s at 1080p | CLI, non-interactive | Seeks each frame in headless Chrome, encodes with FFmpeg; `--docker` for pinned renders | Apache-2.0, no per-render fees ([README](https://github.com/heygen-com/hyperframes)) | About 74.8k stars, npm package created 2026-03-23, latest 0.8.214 on 2026-10-28, very fast releases, still 0.x, 197 open issues | Low |
| Remotion | Same picture; default bitrate lower (0.5 MB for 6 s) | CLI | Same approach | Free up to 3 employees, else paid ([LICENSE](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)) | About 68.6k stars, since 2021, company-backed, license changing in v5 | Low to medium |
| Revideo | Unknown | Yes | Unknown | The GitHub lookup for `redotvideo/revideo` returned nothing; the repo may have moved | Unverified | Skip |
| Motion Canvas | Good for animation | Yes | Yes | MIT, 19.5k stars, last push 2026-07-02 | Slowing | Built for stylised animation, so a poor fit for footage |
| Plain ffmpeg (`zoompan`, `overlay`) | Good | Yes | Yes | LGPL/GPL | Mature | Fine for a crop and encode, painful for titles, easing and captions |

HyperFrames output formats from one CLI: `--format mp4|webm|mov|gif|png-sequence|hls`, `--fps`, `--quality`, `--crf`, `--video-bitrate`, `--resolution` presets for landscape, portrait, square and 4K (measured via `render --help` and `init --help`, v0.8.214). Poster frames are a one-line `ffmpeg -ss` or `hyperframes snapshot`.

One gotcha: HyperFrames' CLI sends anonymous usage telemetry by default. I turned it off on this machine with `hyperframes telemetry disable`. Put that in the pipeline script.

## 4. Playing inside the app

- **Codecs:** measured in the packaged build (Electron 42.4.0, Chrome 148): H.264, HEVC, AV1, VP9 and VP8 all report "probably". I did not find an Electron docs page that states it, so treat the measurement as the source. Use H.264 MP4 as the safe default and AV1 or VP9 WebM where smaller.
- **Size:** a 4-second 1600 px loop of a mostly still screen measured 24.5 KB (H.264 CRF 26), 23.1 KB (VP9 CRF 36), 23.0 KB (AV1 CRF 40), 80 KB as a 15 fps GIF. Real clips with a pile sorting will be bigger; budget **150 to 400 KB per loop** and **under 3 MB for the whole set**. Because the gap between codecs is small, ship H.264 MP4 only and skip a second format.
- **CSP:** `src/main/csp.ts` has `default-src 'self'` and no `media-src`, so media falls under `'self'`. Loops bundled in the app and loaded from the same origin play with no change. Loading through a custom scheme (like `stash-cover:`) would need a `media-src` entry. Add that only if the loops cannot be served from the bundle.
- **Behaviour:** `<video autoplay muted loop playsinline>`, no controls. Under `prefers-reduced-motion: reduce`, show the poster frame as an `<img>` and do not play. Give each loop a text description in the step's copy (an `aria-label` or visible caption) and mark the video `aria-hidden` if the step text already says the same.
- **Download size:** about 2 to 3 MB added to a DMG. Negligible against the app and its model files.

## 5. The website

- **Self-hosted MP4 files are enough** for a small site: a handful of clips, each a few hundred KB to a couple of MB. Serve with `preload="metadata"`, a poster image and `muted autoplay loop playsinline`. Add HLS only if a clip passes about 20 MB (HyperFrames can write HLS).
- **Interactive demo tools** work as a complement to video, because a visitor can click through a scripted tour:

| Tool | Free plan and price (vendor and review pages, unverified; checked 2026-10-29) | Good for |
|---|---|---|
| Arcade | Free, 3 published demos; Pro $32/user/month ([Arcade](https://www.arcade.software/post/arcade-pricing)) | Quick click-through demos and embeds |
| Supademo | Free tier, about 5 demos; paid from about $38/creator/month ([Supademo comparison](https://supademo.com/blog/storylane-alternatives)) | Same, generous free tier |
| Storylane | Very limited free tier; about $40/seat/month annual ([Hackceleration](https://hackceleration.com/labs/storylane-pricing)) | HTML-captured demos at higher tiers |
| Navattic | Sources conflict; one says $500/month for 5 seats ([Supademo](https://supademo.com/blog/navattic-pricing)) | Sales-led teams |

  Most of these capture a web page's DOM or screenshots, so for an Electron app they would use screenshots of our footage. Treat them as a later add-on to the video files.

## 6. Risks

- **Content rights.** Free mockup sites vary a lot. Search results show typical clauses: commercial use for one business with caps on sold products, no redistribution of source files, and sometimes an exclusion for advertising ([PSD Covers](https://psdcovers.com/commercial-use), [Smarty Mockups FAQ](https://smartymockups.com/f-a-q/), Gumroad listings). A public demo is advertising, and our test set was not checked file by file (I did not read `MANIFEST.md`; the orchestrator should say whether I may). **Do:** use our own mockups made for the demo, or mockups whose licence explicitly allows advertising. Keep a `demo-assets/LICENSES.md` row per file. Photos in the mockup previews need the same check.
- **Showing the AI honestly.** The real 9B model takes about 10 s per mockup. The demo uses the stub AI for a speed-up, so say so. Show a small "sped up" label or a "10 s on-device, shown at 8x" caption on the sorting step, the way product demos label time-lapses. Do not show the stub's "Stub <file>" titles; seed believable titles. If any clip claims a result, a real model run should have produced it.
- **Determinism.** Pin so re-takes match: the window size (1440×900), the seeded library and ids from `seedStash`, fixed "added" dates (set the system date for the take or have the seed write fixed timestamps; the app shows "added 28 Oct"-style text), fonts (the app bundles them), the stub AI, a fixed cursor path, and `hyperframes` pinned to one version (the scaffold already pins it). HyperFrames forbids `Date.now()` and `Math.random()` in compositions. Native capture itself is not frame-deterministic (about 55 fps, variable), so judge takes by eye.
- **Screen Recording permission and privacy.** Capture by window id only, never full screen. Delete any test file that catches anything else.
- **Tool churn.** HyperFrames is 0.x and ships constantly. Pin the version, commit the composition, and re-render by script.

## 7. Remotion and HyperFrames, head to head

Neesh asked: how are they different, and can we use both?

### What I rendered

The same 6-second piece in each, in `tmp/demo-research/hf2/` and `tmp/demo-research/rm/`: a 2880×1800 Retina screenshot of the app that zooms smoothly, a 5-second capture of the app inset in a corner, and a title. Output 1920×1080 and 1080×1920, H.264, 30 fps.

| | HyperFrames 0.8.214 | Remotion 4.0.539 |
|---|---|---|
| Setup | `npx hyperframes init` 2 s, no install into the project | `npm i remotion @remotion/cli react react-dom` 32 s |
| Project size | 2.6 MB | about 1.0 GB `node_modules` |
| Render 1080p / 1080×1920 | 4.2 s / 4.1 s (6 workers) | 15 s first run (includes the one-time bundle), then 4 s |
| File size, 1080p | 1.1 MB (about 1.5 Mbit/s, CRF 16 default) | 0.5 MB (about 0.7 Mbit/s) |
| Look | Matches Remotion: structural similarity 0.976 between the two 1080p files | Same |
| Friction | A scaffold flag typo cost one try (`init .` refuses a non-empty folder). Caught a missing duration with a clear message. Telemetry on by default | Worked first time |

I did not change codecs or bitrates to equalise the files, so size differences come from defaults.

### How you write a video

HyperFrames (the whole composition, about 25 lines):

```html
<div id="root" data-composition-id="main" data-start="0" data-duration="6" data-width="1920" data-height="1080">
  <img id="shot" class="clip" data-start="0" data-duration="6" src="shot.png"/>
  <video class="clip" data-start="1" data-duration="4.9" src="clip.mp4" muted playsinline></video>
  <h1 id="title" class="clip" data-start="0" data-duration="6">Sort in seconds</h1>
</div>
<script>
  const tl = gsap.timeline({ paused: true });
  tl.fromTo("#shot", {scale:1}, {scale:2.4, duration:5, ease:"power2.inOut"}, 0.5);
  window.__timelines = { main: tl };
</script>
```

Remotion:

```tsx
const f = useCurrentFrame()
const scale = interpolate(f, [15, 165], [1, 2.4], { easing: Easing.inOut(Easing.quad), extrapolateRight: 'clamp' })
return <AbsoluteFill>
  <Img src={staticFile('shot.png')} style={{ transform: `scale(${scale})` }} />
  <Sequence from={30}><OffthreadVideo src={staticFile('clip.mp4')} muted /></Sequence>
</AbsoluteFill>
```

Fit for our codebase: we are React and Tailwind, so Remotion can import our real components and tokens directly. HyperFrames can use Tailwind through `init --tailwind` and plain CSS variables copied from our theme, but cannot import React components. For footage-led demos, titles and captions are the only things we compose, so the reuse gain is small. A branded title card in HTML with our font and colours is a few lines in either.

### How each renders

Both drive headless Chrome and ffmpeg. HyperFrames seeks each frame, runs parallel workers (about 256 MB RAM each) and has a `--docker` mode for pinned renders. It also has an AWS Lambda package ([README](https://github.com/heygen-com/hyperframes)). Remotion has a more mature distributed renderer, Remotion Lambda, at about $0.001 per simple render plus AWS ([cost page](https://remotion.dev/docs/lambda/cost-example)). We render a few clips on this Mac, so cloud rendering does not matter. Both run unattended locally. Neither needs CI for us, since capture needs this Mac anyway.

### Real footage inside

Remotion has `OffthreadVideo` for frame-exact extraction of source video. HyperFrames treats `<video>` as a timed clip and extracts frames itself; its `--video-frame-format png` option is documented for "UI recordings, screen captures, and color-sensitive source videos" (render `--help`). I used it. Neither tool's trim or zoom gets sharper than the source, so the 2x capture resolution rule in section 2 applies equally. Cursor overlays from logged coordinates are plain absolutely positioned elements animated by GSAP (HyperFrames) or `interpolate` (Remotion).

### Players

Both ship an embeddable player (`@remotion/player`, `<hyperframes-player>`). Remotion's package is 518 KB unpacked at version 4.0.290 ([npm](https://npmjs.com/package/@remotion/player)); I did not measure its gzipped size or CPU in Electron. A live composition would add a runtime, a React tree and continuous painting to every onboarding step. A 300 KB MP4 loop does the same job with hardware decode and no dependencies. Not worth it. Use files.

### Captions, titles, transitions, audio

HyperFrames ships about 450 registry blocks (transitions, captions, camera moves) and `@hyperframes/shader-transitions` for WebGL transitions ([README](https://github.com/heygen-com/hyperframes)). Remotion has `@remotion/captions` and `@remotion/transitions`. Our clips are silent loops with a title, so both cover it. I did not test either's caption packages.

### Licence and price

- **HyperFrames:** Apache-2.0, "no per-render fees or commercial-use thresholds" (README). The hosted parts are separate products (HeyGen's desktop app and cloud); we do not need them. I found no pricing for them.
- **Remotion:** free for individuals, for-profit organisations with up to 3 employees, and non-profits. A company of 4 or more needs a licence: Automators $0.01 per render with a $100/month minimum, Creators $25 per seat per month, Enterprise from $500/month (third-party summary dated 2026-10-21 of [Remotion's pricing](https://www.remotion.dev/docs/license/pricing); check the source). The LICENSE file also says it changes in Remotion 5.0 ([PR 3750](https://github.com/remotion-dev/remotion/pull/3750)). DesignStash with one to three people pays nothing today. The risk is a future hire pushing it over three.

### Working with agents

HyperFrames ships Claude Code skills and a plugin, and its scaffold writes `CLAUDE.md`/`AGENTS.md` with rules (`npm run check` lints, `snapshot` shows frames). Remotion ships `npx skills add remotion-dev/skills` with a `remotion-best-practices` skill ([docs](https://www.remotion.dev/docs/ai/skills); contents not read). Agents write plain HTML more reliably than a React project with a bundler, and HyperFrames' `check` and `snapshot` close the loop. I expect HyperFrames to need fewer retries, but I only tested hand-written code.

### Maturity

| | Stars | Created | Latest release | Open issues | Maintainer |
|---|---|---|---|---|---|
| HyperFrames | about 74.8k | 2026-03-23 (npm) | 0.8.214, 2026-10-28 | 197 | HeyGen, used in production there |
| Remotion | about 68.6k | 2021 | 4.0.539 | 215 | Remotion (company) |

HyperFrames moves much faster and is younger, still 0.x, so pin it. Remotion is steadier.

### Can we use both?

No. Both produce near-identical files from the same inputs, so a split earns nothing and costs two toolchains (and a 1 GB `node_modules`). Players are not worth using for onboarding or the site. **Use HyperFrames alone.** Revisit Remotion only if we later want live, data-driven React compositions (for example personalised videos), which is not on our list.

## Recommended pipeline in the repo

```
demo/
  README.md                 how to run, permission note, licences
  scenes/zip-to-pile.ts     Playwright script: seed, drive app, log cursor and click coordinates + timestamps
  seeds/                    our own mockups (cleared for promotion) + LICENSES.md
  capture/winid.swift       window id (later: a helper command)
  compose/                  HyperFrames project (index.html, gsap, brand CSS), reads footage + events.json
  out/                      gitignored: mp4, webm, gif, posters per format
scripts/demo-render.ts      pnpm demo:render <scene>
```

`pnpm demo:render zip-to-pile`:

1. Build or point at the packaged app (`DESIGNSTASH_E2E_APP`), seed a fresh profile with fixed dates.
2. Start `screencapture -v -l <id>` on the window, run the scene script at human pace, stop. Write `events.json` (cursor path, clicks, timestamps).
3. Trim and crop the capture to the window rectangle with ffmpeg.
4. Render the HyperFrames composition once per target: 16:9 (website), 9:16, 4:5, 1:1, and a silent short loop; then MP4 H.264, WebM where smaller, GIF at 15 fps, poster PNGs.
5. Copy the onboarding loops and posters into `src/renderer/assets/onboarding/`.

HyperFrames and ffmpeg stay out of `package.json`: run them through `npx hyperframes@<pinned>` from `demo/compose`.

## Runners-up and why they lost

- **Remotion:** equal output, 1 GB of dependencies, a licence tier that bites at four people. Wins only if we need React components inside the video.
- **Screen Studio and FocuSee:** nicer out of the box, but hand-edited and paid. Every UI change means a manual re-edit.
- **Playwright `recordVideo` and CDP screencast:** 1x and low bitrate.
- **Frame-stepped renderer capture:** would be deterministic in principle, but stepping view transitions and timers in the real app is the risky part, and native capture already looks good.
- **Browser harness in a composition:** loses the window chrome and vibrancy. Keep it for shots where the real app cannot be driven.
- **Players and interactive demo tools for onboarding:** a runtime and CPU cost for what a small MP4 does better.

## Proof of concept for the orchestrator

One clip, 10 to 15 s: drop a zip on the window, watch the sort run and a pile form, open the pile.

1. Write `scenes/zip-to-pile.ts` against the packaged app with our own seed mockups (not the test set). Drive the drop with the same IPC/picker stubs as `e2e/journey.spec.ts`.
2. Capture by window id, log coordinates.
3. Compose in HyperFrames: crop to window, drawn cursor with eased path, one click ring, one zoom of 1.4x into the pile, a title, a "sped up 8x" label over the sort.
4. Render 16:9 and 9:16, plus a 4 s loop MP4 and poster.

Measure for success:

- Footage at 55 fps or better with no dropped-frame stutter on the pile animation.
- Zoomed text is legible at 1080p and 1080×1920, with no visible softness at 1.4x.
- Re-running the script produces visually matching footage (same seed, same dates, same cursor path) within a couple of re-takes.
- Total time from `pnpm demo:render` to all formats under 5 minutes.
- Loop file under 400 KB, whole 16:9 clip under 6 MB.
- Only the DesignStash window is ever visible in captured footage.
- The loop plays in the packaged app with the current CSP, stops under reduced motion, and the poster shows.

## Not tested

Frame-stepped capture, ScreenCaptureKit through the Swift helper (I used `screencapture -l`, which is the same system service), Remotion and HyperFrames caption packages, player CPU in Electron, and licences of the test-set mockup sites.

## Sources (checked 2026-10-29)

- HyperFrames README, repo and npm data: https://github.com/heygen-com/hyperframes, https://raw.githubusercontent.com/heygen-com/hyperframes/main/README.md, https://registry.npmjs.org/hyperframes
- Remotion licence: https://github.com/remotion-dev/remotion/blob/main/LICENSE.md ; pricing summaries: https://www.remotion.dev/docs/license/pricing, https://www.wireflow.ai/blog/remotion-pricing ; v5 licence change: https://github.com/remotion-dev/remotion/pull/3750
- Remotion skills: https://www.remotion.dev/docs/ai/skills ; Lambda cost: https://remotion.dev/docs/lambda/cost-example ; player package: https://npmjs.com/package/@remotion/player
- Cap licence: https://github.com/CapSoftware/Cap/blob/main/LICENSE
- Motion Canvas: https://github.com/motion-canvas/motion-canvas
- Playwright video bitrate: https://github.com/microsoft/playwright/issues/31424
- Screen Studio and FocuSee prices: https://trainn.co/blog/screen-studio-pricing/, https://www.trustradius.com/compare-products/focusee-vs-screen-studio
- Interactive demo tools: https://www.arcade.software/post/arcade-pricing, https://supademo.com/blog/storylane-alternatives, https://hackceleration.com/labs/storylane-pricing, https://supademo.com/blog/navattic-pricing
- Mockup licence examples: https://psdcovers.com/commercial-use, https://smartymockups.com/f-a-q/
- Measured on this Mac: `tmp/demo-research/` (probe.mjs, probe3.mjs, native-win.mov, sz/, hf2/, rm/)
