# Demo videos from the real app

One command drives the packaged DesignStash app, records only its window, composes the clip with
HyperFrames and writes every format.

```sh
pnpm demo:render zip-to-pile
```

Outputs go to `demo/out/internal/zip-to-pile/` (gitignored). Work files go to `tmp/demo-work/`.
Background and options are in `design/research/demo-video.md`.

## What it needs

- A packaged app: `pnpm package` writes `dist/mac-arm64/DesignStash.app`, or set `DESIGNSTASH_E2E_APP`.
- The test set, for the zip the scene drops (`DESIGNSTASH_TEST_SET`, default `~/Downloads/DesignStash Test Set`). It is read, never written.
- Screen Recording permission for the terminal (or Solo) that runs the command, granted once.
- `swiftc` (Command Line Tools), `ffmpeg` and Node. HyperFrames runs through `npx hyperframes@0.8.214`, pinned in
  `scripts/demo-render.ts`, so nothing is added to `package.json`. The script turns its telemetry off.
  On the first run HyperFrames downloads a browser and caches the Inter font from Google Fonts.

**Internal test only.** The scene drops a real zip from the test set, whose mockups are not cleared for
public use. The output sits under `demo/out/internal/` and every format says "Internal test" on screen.
Public clips will use our own mockups.

## Layout

| Path                               | What it is                                                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/demo-render.ts`           | The pipeline: build capture, run the scene, constant frame rate, render each format, posters, timings                                                                   |
| `demo/scenes/zip-to-pile.ts`       | The scene: Playwright drives the packaged app, drag and drop through CDP as in `e2e/journey.spec.ts`, eased mouse moves, logs every cursor sample, drag event and click |
| `demo/capture/capture.swift`       | ScreenCaptureKit command: one window by pid, no cursor, no shadow, Retina, 60 fps, H.264                                                                                |
| `demo/compose/project.ts`          | Writes one HyperFrames project per format (16:9, 9:16, loop)                                                                                                            |
| `demo/compose/stage.js`            | The motion: camera, cursor, click rings, the dragged file, captions. A pure function of time, driven by the scene's log                                                 |
| `demo/scenes/check-loop-in-app.ts` | Checks a loop plays inside the packaged app under its CSP                                                                                                               |

To add a scene, write `demo/scenes/<name>.ts` that returns the same event log, and add the name to `SCENES`.

## How it works

1. `capture` records the app window (by process id) at the window's own Retina size, with the system cursor hidden.
   It prints the wall-clock time of its first frame, which is the scene's clock zero.
2. The scene moves the real mouse (so hover states show) and logs positions in window CSS pixels. The system
   cursor is never in the footage, so the composition draws its own cursor, click rings and the file icon being
   dragged in from outside the window, all timed to the log.
3. ffmpeg turns the capture (which only writes frames when pixels change) into steady 60 fps.
4. HyperFrames renders the composition per format. Camera push-ins, captions and labels are in `stage.js`.

## Proof of concept results

Run on 2026-10-29, M-series Mac, macOS 27, Electron 42.4.0 (packaged build from 2026-10-28), the held-out
`minimal-imac-mockup.zip` (3 PSDs, 45 MB), the stub AI.

**Outputs** (`demo/out/internal/zip-to-pile/`)

| File                          | Format                                           | Size   |
| ----------------------------- | ------------------------------------------------ | ------ |
| `zip-to-pile-16x9.mp4`        | 1920×1080, 60 fps, 13.3 s                        | 4.1 MB |
| `zip-to-pile-9x16.mp4`        | 1080×1920, 60 fps, 13.3 s                        | 3.9 MB |
| `zip-to-pile-loop.mp4`        | 1280×800, 30 fps, 4 s, silent                    | 242 KB |
| `zip-to-pile-poster.png`      | 1920×1080 still of the pile board at 1.4x        | 251 KB |
| `zip-to-pile-loop-poster.png` | 1280×800 still of the loop, the copy in progress | 142 KB |

**Capture**

- Window only: 2880×1800 pixels for a 1440×900 window. `ignoreShadowsSingleWindow` removed the shadow margin,
  so the frame is the window and nothing else. I looked at frames from the start, the drop, To sort, Sort and
  the pile: no other app, desktop or cursor appears. (Native capture earlier showed the parked cursor and the
  shadow; the Swift command removes both.)
- Rate: 854 and 850 frames in 14.8 s, so 57.4 to 57.7 fps average. Median gap 16.7 ms. One take had 1 gap over
  25 ms and the other 2, the longest 35 ms (two frames). None over 50 ms. No visible stutter on the drop overlay
  or the pile opening. The average sits under 60 because ScreenCaptureKit skips an occasional frame under load.
- Colour: H.264 BT.709, matches the app on screen.

**Zoom at 1.4x** (16:9): the pile board at 1.4x is as sharp as the app itself. Capture is 2 px per CSS px and the
output shows 1.06 px per CSS px at 1.0x and 1.48 px at 1.4x, so there is room. Text in the file names and the
"3 mockups" label stays crisp. Limit: roughly 2.0 px per CSS px is the source, so zoom up to about 1.9x at this
window size before softening.

**Two takes match**: yes. Same scene run twice: every event time within 0.08 s (copy time varies by 0 to 80 ms),
and frames at 0.8, 3.0, 7.5, 9.5 and 12.6 s have SSIM 0.999 to 1.000. The clip's cut points follow the log, so
the small drift does not show.

**End to end** (`pnpm demo:render zip-to-pile`, 93 s):

| Step                                                   | Seconds |
| ------------------------------------------------------ | ------- |
| build the capture command (cached after the first run) | 1.8     |
| drive the app and record                               | 17.7    |
| constant frame rate                                    | 2.7     |
| render 16:9                                            | 29.0    |
| render 9:16                                            | 31.4    |
| render loop                                            | 9.1     |
| posters, telemetry off                                 | 1.5     |

**In-app playback** (`check-loop-in-app.ts`, packaged app, current CSP `default-src 'self'`, no `media-src`):

- A loop at a `file://` path outside the bundle plays, muted, autoplay and loop (1280×800, 4.0 s).
- A `data:` URL is blocked (`media-src` falls back to `default-src 'self'`). An app that inlines video as base64 would need `media-src data:`.
- Not tested: a file inside `app.asar`. Fonts and images already load from there under `'self'`, so a Vite-imported asset URL should
  behave the same. Confirm when the first onboarding screen gets a loop. No CSP change is needed for bundled files.

**Choices and caveats**

- **"Sped up" label:** the stub AI answers at once, while the real model takes about 10 s a mockup (30 s for this zip).
  The clip shows a pill, "AI wait skipped: about 10 s per mockup on-device", on the To sort page. The copy, Sort and
  the pile opening run at real speed. Nothing else is sped up.
- **AI text on screen:** the last second of the clip shows the Look it over screen, which carries the stub's
  title, description and tags ("Silver iMac with keyboard and mouse"). They come from the stub, not the model, and they
  appear the moment the pile opens, so a shorter tail does not hide them. To keep AI text out, end the clip on the pile
  board (the `sorted` mark) or blur that panel.
- **Vertical reframe:** the 9:16 follows the action at 1.5x between a headline and a caption. It reads at phone size for the
  drop, the cards and the pile, but the Look it over screen is wider than the crop, so it needs a hand-tuned shot if it
  becomes a real social clip.
- **Loop:** 4 s of the drop and the copy, faded in and out at the ends. It does not end where it begins, so on repeat it
  fades through dark.
- **Deprecation:** the capture command uses `AVAssetWriterInputPixelBufferAdaptor`, which macOS 27 marks deprecated. It builds and
  works; swap to `AVAssetWriter.inputPixelBufferReceiver` when convenient.
- **Capture runs on a Mac with a screen:** it needs a logged-in session and Screen Recording permission, so it is not a CI job.
