# Demo video references: measured rules for our clips

Checked 2026-10-29. Research agent, for Neesh and the orchestrator. Follows `design/research/demo-video.md`.

I downloaded 16 videos (all under 1080p, 155 MB together) into `tmp/demo-references/<slug>/`. Nothing from there is committed. I ran ffmpeg scene detection on every file (thresholds 0.3 and 0.15, numbers in `tmp/demo-references/cuts.json`) and viewed contact sheets for all of them (`tmp/demo-references/_sheets/*.png`).

## How far to trust the numbers

- **Measured with tools:** length, resolution, frame rate, file size, shot count and shot length, loop closure (SSIM of first against last frame).
- **Estimated by eye from contact sheets:** text height, zoom amount, cursor size, caption hold, camera move duration. Each is a share of frame height read off sheet tiles, good to about plus or minus a third. Where a rule rests on an estimate, I say "about".
- **Not measured:** typing speed in search fields (the sheets sampled too sparsely), and audio, except that the Things video carries an AAC track. Two gaps in the brief are open and listed at the end.
- **Scene detection caveat:** Linear's videos, the loops and the Eagle loops each read as one or two shots because their camera moves continuously and their changes are dissolves. I checked those by eye, so their "shots" column says what I saw.

## 1. The rules for our clips

Frame height is written H. At 1080p, 1% of H is 10.8 px.

1. **Show real UI within 2 s.** Linear Agent, CleanShot, Screen Studio and Superhuman show UI at 0 s. Raycast shows the search bar at about 2 s, mymind at about 2 s. The slow ones (Notion Calendar about 8 s, Things about 20 s for its Mac window) open on a presenter or phone shots and feel like ads. Brand card at the start: 1.5 s at most. *(Linear, CleanShot, Raycast, mymind, Notion Calendar, Things)*
2. **Any text the viewer must read is at least 3% of H** (about 32 px at 1080p). Raycast reads 3 to 6%, Things phone shots about 4%, Granola captions about 4%. Under 2% the UI reads as texture. Notion Calendar's unzoomed laptop shots sit near 1% and Superhuman's hero near 1%, and both use them as scenery. Our POC put text at about 0.8% (9 px). *(Raycast, Things, Granola, Notion Calendar, Superhuman)*
3. **At a reading moment, show about 35 to 50% of the window's width.** Screen Studio's auto-zoom lands at roughly 2 to 3 times the window; Notion Calendar's laptop-to-window pushes reach about 3 to 4 times; Raycast shows one component at over 4 times. Whole-window shots appear only as 1 to 2 s establishing shots. *(Screen Studio, Notion Calendar, Raycast)*
4. **Where the window is wide, re-lay out the UI.** Raycast, Granola and Linear lift one component (a search bar, a chat card, a list) and place it at 40 to 60% of frame width on a plain or soft gradient ground. Nothing in the 16 videos squeezes a full desktop window into the frame for more than about 2 s, other than the Superhuman hero, which treats it as scenery. This needs a "component shot" in our storyboard format, with its own layout. *(Raycast, Granola, Linear Agent, Things)*
5. **A camera move takes 0.6 to 0.9 s with ease-out (fast start, slow settle).** I sampled Screen Studio's hero at 10 fps: the zoom-in goes from a small window to full crop in 7 to 8 frames, about 0.7 s, with motion blur on the middle frames. The zoom-out is slower to start. *(Screen Studio; Notion Calendar looks similar)*
6. **The move finishes before the action it shows.** In the Screen Studio sampled run the framing was settled while the cursor was still travelling to its target. The click lands on a held frame. Our POC zoomed during the click. *(Screen Studio, mymind)*
7. **Hold each readable state at least 1.8 s, and 2.5 to 3 s when it holds a sentence or a list.** Granola holds each caption for 2 s or more (the same caption showed in two samples 2 s apart). Linear's Agent holds each answer state for about 3 s. *(Granola, Linear Agent)*
8. **One idea per shot, median 2.5 to 3.5 s.** Edited pieces measure 2.0 s (Things), 2.25 s (Notion Calendar), 2.4 s (mymind), 3.3 s (CleanShot), 4.7 s (Raycast), 5.8 s (Granola). The POC's 2 s per beat is the same rate but each beat carried several ideas. At 30 to 40 s, plan 10 to 14 shots. *(table below)*
9. **Cut waits with a hard cut.** None of the 16 videos shows a loading state for longer than about 1 s (Raycast's "Checking for updates" spinner is the longest I found). They cut to the finished state. Where our AI step has to show, use a cut plus a short label such as "On-device, about 10 s per mockup". No reference uses a time-lapse label, so this is our decision and the label is the honest part. *(Raycast, Granola, Linear)*
10. **Transitions are hard cuts or a 0.3 to 0.4 s dissolve or soft push.** Things uses a tilt and push on phone shots and cuts to a plain title; Linear uses dissolves between tilted components; Notion Calendar cuts hard between presenter and UI. No wipes or flips in any of them. *(Things, Linear, Notion Calendar)*
11. **Titles run 10 to 14% of H, captions 3.5 to 4.5% of H.** Things "all-new feel" about 14%, Apple Creator Studio titles about 11%, Granola captions about 4% with a dark pill behind, Screen Studio captions about 3.7% in a pill. Captions are 3 to 6 words and read at about 2 words per second. *(Things, Apple, Granola, Screen Studio)*
12. **Put the window on a ground.** The wallpaper in mymind, Screen Studio and Superhuman, the soft gradient in Granola and the dark space in Linear all keep the window at 55 to 90% of frame width with margin. Full-bleed UI is for component shots only. *(mymind, Screen Studio, Superhuman, Granola, Linear)*
13. **Draw a cursor only when the click is the story, at about 6 to 10% of H when zoomed.** mymind and Screen Studio use a large arrow or hand. Raycast, Linear and Apple show no cursor and drive the story with typed text and highlights. I did not check whether any of them hides an idle cursor. Our choice: show it for the DesignStash drag and clicks, hide it for typing and search. *(mymind, Screen Studio, Raycast, Linear)*
14. **Click feedback stays small.** The contact sheets are too sparse to show click animations, so this is partly my call. In the frames I have, none of the cursors carries a large ring, and the cursor itself changes shape (arrow to hand) on targets in mymind and Screen Studio. Use a small press scale on the target plus the cursor's own change. *(Screen Studio, mymind)*
15. **End card of 2 to 4 s: logo plus one line.** Linear holds "Linear. At your command." and its logo, Things holds its icon and name, Granola animates its wordmark. None holds longer than about 4 s. *(Linear, Things, Granola)*
16. **Loops run 3 to 7 s, make one change, and end on their first frame.** SSIM of last against first frame: Eagle 0.91 to 0.99, Superhuman 0.99, Screen Studio hero 0.88 (not designed as a loop). Linear's site clips, which are filmed footage, score 0.18 to 0.48 and visibly jump at the loop point. Sizes: 292 to 584 KB at 564×612 for Eagle's four, 1.7 MB at 1368×1712 for Superhuman. *(Eagle, Superhuman, Linear)*
17. **Loops are silent and have no cursor and no caption.** All four Eagle loops and the Superhuman loop show the result with no on-screen words. The explanation sits in the page text next to the loop. *(Eagle, Superhuman, Linear site)*
18. **Real UI plus an overlay that is not UI.** The best-liked pieces (Raycast, Linear, Granola) never show raw app chrome for long. They add a label ("NEW", "COMPACT MODE") or a caption in a separate typographic layer, in a type size 2 to 4 times the UI text. *(Raycast, Linear, Granola)*

## 2. Our four failures, answered

**Everything is tiny.**
- The POC showed a 1440 px window in 1080p, so UI text was about 0.8% of H.
- The references put reading text at 3 to 6% of H (rule 2). That is a 4 to 7 times scale-up of our UI text, or a crop of the window to about 35 to 50% of its width (rule 3), or a re-laid-out component (rule 4).
- Raycast's search field text is about 15% of H, because the whole frame is one component.
- DesignStash's window is roughly 16:10, so one crop per beat (the drop zone, the To sort list, one pile card, the Look it over panel, the search field) will cover the readable area.

**The camera has no intent.**
- Screen Studio's default auto-zoom is the "click follows" look, and its own hero shows how it feels: zoom in over about 0.7 s, hold about 3 s, zoom out, with motion blur in the move.
- The better pieces (Linear, Raycast) choose a framing for each beat and cut or dissolve to the next. They do not follow the cursor.
- Our storyboard should name a framing per beat (rule 3), move once per beat (rule 5), and finish the move before the click (rule 6).
- No move under 0.6 s and none longer than 1 s.

**The pacing is rushed.**
- The shot lengths are not much slower than ours (rule 8). The difference is that each reference shot holds one idea for at least 1.8 s (rule 7).
- To fit a 35 s clip at those holds, use about 10 to 14 shots and cut the beats that carry no new idea (for example the empty-window opening and the second wait).
- Rule 9 shortens waits with cuts.

**The content works against it.**
- Raycast, Linear and Granola use short, specific captions or typed prompts, and their UI shows real-looking content: real tasks, real issue numbers, real names.
- Granola and Raycast set the UI on a soft or dark ground, which is how they avoid white-on-white.
- For us: a made-up demo brand with a coherent colour range (the sweatshirt, the jumper, the iMac in one palette), no stub AI text, and captions of 3 to 6 words written against the shot they sit on (rule 11), not generic ones.

## 3. Comparison table

All shot data is from ffmpeg scene detection at 0.3, corrected by eye where marked. "Zoom" is the window's width against the frame, as I judged from the sheets. "n/a" means no UI in that part.

| Video | Length | First UI | Shots (median, range) | Typical zoom / framing | Caption or title size | Cursor | Transitions |
|---|---|---|---|---|---|---|---|
| Raycast, "New Raycast. Coming 2026" | 38.6 s | about 2 s | 7 (4.7 s, 2.1 to 13.6) | Re-laid-out component fills 40 to 100% of the frame width | Labels about 3%, mono; field text up to 15% | none | dissolve, soft push |
| Linear Agent | 54.9 s | 0 s | 1 continuous (3D tilt) | UI at 3D perspective, dark ground, text 3 to 5% | tagline about 5% | none | slow dissolve, camera drift |
| Linear Releases | 30.1 s | 0 s | 1 continuous, title fades | abstract UI, perspective | labels about 3%, mono | none | fades through black |
| Linear hero loop | 12.6 s | 0 s | 1 (12.6 s) | perspective drift, shallow depth of field | none | none | none |
| Granola, Recipes | 43.3 s | about 0.5 s then 8 s | 8 (5.8 s, 3.5 to 10.6) | card at 40 to 60% of width on a gradient; presenter shots between | captions about 4% in dark pill; title about 9% | none | hard cuts |
| Notion Calendar | 79.6 s | about 8 s | 23 (2.25 s, 0.9 to 9.1) | laptop shot, then window push to 3 to 4 times | name caption about 5% | small, system | hard cuts, push-ins |
| Things, "Meet the all-new Things" | 70.9 s | about 2 s (phone) | 24 (2.0 s, 1.0 to 16.7) | device tilted, UI 4% in phone shots | titles about 14% | none | tilt, push, cut to plain title |
| Arc 1.0 | 34.3 s | about 28 s | 21 (1.3 s, 0.7 to 5.1) | brand film. UI only at the end, window about 60% of frame | titles about 15% serif | none | hard cuts |
| CleanShot X | 156.0 s | 0 s | 35 (3.3 s, 0.5 to 14.2) | laptop in 3D tilt, then window crop 2 to 3 times | none | small, system, hand | 3D tilt, cuts |
| mymind intro | 158.6 s | about 2 s | 41 (2.4 s, 0.0 to 21.4) | browser window at 85% of width on a wallpaper, pushes to cards | quote about 8% | large, hand and arrow, about 9% | dissolves, pushes |
| Screen Studio hero (their own demo) | 6.3 s | 0 s | 1 (6.3 s) | window about 53% of width, zooms about 2 to 3 times | caption about 3.7% in pill | large, about 10% when zoomed | zoom with motion blur |
| Superhuman hero loop | 7.0 s | 0 s | 1 (7.0 s) | window at about 90% width on a gradient, 4:5 | none | small arrow, nearly still | none |
| Eagle home loops (4) | 2.7 to 4.2 s | 0 s | 1 each | abstract shapes in a mini UI, 564×612 | none | none | none |
| Apple Creator Studio | 35.1 s | about 2 s | 9 at 0.15 (2.1 s) | type-led, devices small | titles about 11% | none | cuts, type animation |
| Apple, "Siri and iPhone" | 96.0 s | about 3 s | 18 (3.0 s, 0.03 to 29.6) | phone crop, UI fills bezel | titles about 15%, heavy type | finger only | cuts, glow |
| Cosmos OG video | 9.0 s | n/a | 1 | brand animation, no product UI | none | none | none |

## 4. One section per video

Frame paths are under `tmp/demo-references/`. Sheets are in `_sheets/`. Competitors are marked.

### Raycast, "New Raycast. Coming 2026"
- **Link:** https://www.youtube.com/watch?v=Mi173xGb0ZA (Raycast channel). File: `raycast-2026/raycast-2026.mp4`. Sheet: `_sheets/raycast.png`.
- **Borrow:** each feature gets one component at huge scale on a black or glossy ground; the field text types out; labels such as "NEW / COMPACT MODE" sit in a small mono layer. The camera barely moves because the component is already the right size.
- **Avoid:** the glossy-grey background is heavy and the end-card sequence runs long (about 6 captions).

### Linear Agent and Linear Releases
- **Links:** https://www.youtube.com/watch?v=mRql2VJ99gM and https://www.youtube.com/watch?v=6dIwFoQ0eVg (Linear channel). Files: `linear-agent/`, `linear-releases/`. Sheets: `_sheets/linear-agent.png`, `_sheets/linear-releases.png`.
- **Borrow:** a single slow camera drift over a tilted UI, with typing as the story and a one-line tagline at the end. Text grows into focus as the plane tilts toward the camera, so the reading moment is the settled moment.
- **Avoid:** the tilt makes small text hard to read between moments; our UI has less text weight than theirs and would need the tilt toned down.

### Linear site loops
- **Links:** page https://linear.app/now (the three filmed clips) and https://static.linear.app/assets/hero/PLANNING-MONITORING.output.h264.crf19.mp4 (the UI hero). Files: `linear-loops/`. Sheets: `_sheets/linear-loop*.png`, `_sheets/linear-hero.png`.
- **Borrow:** each loop ships in three encodings (AV1, VP9 and H.264 crf 19) listed in the page source, and the H.264 hero is 12.6 s at 1080p in 1.7 MB. The page's `<video>` tags use `muted loop playsInline preload="metadata"`.
- **Avoid:** the three "Now" clips are filmed people footage with cuts and do not end on their first frame (SSIM 0.18 to 0.48), so they are no model for our loops. The UI hero (SSIM 0.75) drifts and does not close either.

### Granola, "Say hello to Recipes"
- **Link:** https://www.youtube.com/watch?v=ekSyfD7uoiU. File: `granola-recipes/`. Sheet: `_sheets/granola.png`.
- **Borrow:** the app shown as one card at about half the frame width on a soft gradient; captions in a dark pill, 3 to 6 words; recipe names appear as floating chips before the app card, so the viewer meets the idea before the UI.
- **Avoid:** it cuts to a talking presenter every 3 to 6 s. We have no presenter.

### Notion Calendar, "Meet Notion Calendar"
- **Link:** https://www.youtube.com/watch?v=C4Q2ezioTUM. File: `notion-calendar/`. Sheet: `_sheets/notion.png`.
- **Borrow:** a clear sequence of "laptop, then push into window, then push into the detail". The camera moves in only twice per feature, and the cursor stays small and calm.
- **Avoid:** the unzoomed laptop shots are about 1% text, unreadable. It is a product film with a presenter; the pacing is 2 to 3 s a cut but each shot is a different place in the app.

### Things, "Meet the all-new Things"
- **Link:** https://culturedcode.com/things/ (file: `https://static.culturedcode.com/things/videos/2026-06-25-meet-things-remastered-2/meettheallnewthings.mp4`). File: `things-remastered/things.mp4`. Sheet: `_sheets/things.png`.
- **Borrow:** UI at 4% of H inside phone crops; big plain title cards at about 14% between feature groups; the device sits in a tilted perspective with a light shadow. A good model for the hero title card.
- **Avoid:** a 71 s runtime and a 20 s wait for the Mac window.

### Arc 1.0, "Everything or nothing"
- **Link:** https://www.youtube.com/watch?v=n5Vwrj1gEWs. File: `arc-1-0/`. Sheet: `_sheets/arc.png`.
- **Borrow:** the brand-film structure of a 28 s story ending on a 6 s UI reveal and a "download now" card.
- **Avoid:** it is a manifesto, not a feature demo. Only the last 6 s are product shots, and it uses archive footage we do not have.

### CleanShot X
- **Link:** https://www.youtube.com/watch?v=FZbICrBKWIU. File: `cleanshot-x/`. Sheet: `_sheets/cleanshot.png`.
- **Borrow:** a laptop tilt that rotates into the window, so the transition from "device" to "UI" is a camera move. It handles several small features in a row at about 3 s each.
- **Avoid:** 156 s is too long, and the desktop wallpaper stays visible behind small UI, which makes the UI tiny (rule 2).

### mymind (competitor)
- **Link:** https://www.youtube.com/watch?v=pQZKRf1gF9w. File: `mymind-intro/`. Sheet: `_sheets/mymind.png`.
- **What it does:** a browser window at about 85% of frame width on a landscape wallpaper, pushes to the cards, types "celine" into search and shows two results appear. A large hand cursor, about 9% of H. AI tags show as a side panel with chips.
- **Borrow:** the typed-search moment, which is the same story as our "jumper" search. They hold the typed word and the first results on one screen.
- **How we differ:** mymind shows a whole browser on a wallpaper and a stream of saves from the web. We have local files, a drop, and Photoshop opening. Do not copy the wallpaper.

### Eagle (competitor)
- **Links:** https://eagle.cool, loops at `https://r2-web.eagle.cool/media/home-feature-search_H265.mov` and its siblings. Files: `eagle-*/`. Sheets: `_sheets/eagle-search.png`, `_sheets/eagle-organize.png`.
- **What it does:** four home-page loops of 2.7 to 4.2 s at 564×612, each in H.265 `.mov` with a VP9 `.webm` sibling, 290 to 580 KB. They are drawn shapes in a small UI shell (a pill, coloured hexagons, circles and triangles), not real screenshots. All end on their first frame (SSIM 0.91 to 0.99).
- **Borrow:** the loop structure: start state, one change, return. Size and length are a good budget for onboarding loops.
- **How we differ:** Eagle's loops never show a real library. Ours can, since the footage is the real app. Eagle's Photoshop link is only a file-type list on their site; I found no hand-off demo.

### Cosmos (competitor)
- **Link:** https://www.cosmos.so/videos/og-video.mp4. File: `cosmos-og/og.mp4`. Sheet: `_sheets/cosmos.png`.
- **What it does:** a 9 s brand animation of image tiles drifting around six black dots. No product UI.
- **Borrow:** nothing for the demos. Worth knowing that its public video is a mood piece.

### Screen Studio hero (the "default auto-zoom look")
- **Link:** https://screen.studio/videos/hero/hero-demo.mp4 (from https://screen.studio). File: `screenstudio-hero/hero-demo.mp4`. Sheets: `_sheets/screenstudio.png`, `_sheets/ss-zoom-in.png`.
- **What the default looks like:** zoom to about 2 to 3 times over about 0.7 s with motion blur, hold for as long as the cursor works in that region, zoom out; large smooth cursor; a face-cam bubble in the corner; word-by-word captions in a dark pill at the bottom; a coloured macOS wallpaper behind the window.
- **Borrow:** the 0.7 s ease-out move, the motion blur in the move, and the caption pill.
- **How far to move away:** the zoom follows the cursor and ends when the cursor leaves. We choose framing per beat from the storyboard (rule 6), drop the face-cam, and keep a quieter cursor.

### Superhuman hero loop
- **Link:** https://superhumanstatic.com/vwfkeyj6n9ac/10yg8nDUh9XLV2wfk6D91h/48ffdd7ef1999828d74257aadd046374/hero-go-desktop-2x.mp4 (from https://www.superhuman.com). File: `superhuman-hero/hero.mp4`. Sheet: `_sheets/superhuman.png`.
- **Borrow:** 7 s, 1368×1712 (4:5), 1.7 MB, window at about 90% of frame width, near-still scene with one small animated change and a small cursor. It ends on its first frame (SSIM 0.99).
- **Avoid:** its text is about 1% of H. It works because the surrounding page text carries the message.

### Apple, "Creator Studio" and "Siri and iPhone"
- **Links:** https://www.youtube.com/watch?v=ISYIEmQxs2M and https://www.youtube.com/watch?v=2PW5y3zAvPE (Apple channel). Files: `apple-creator-studio/`, `apple-siri-iphone/`. Sheets: `_sheets/apple-creator.png`, `_sheets/apple-siri.png`.
- **What I found:** I did not find a Photos or Spotlight search-by-description segment in these two. The Siri clip crops UI to the one card that matters (the "Alex is about 2 miles away" map card fills the phone screen) and sets heavy 15%-of-H titles between feature groups. Creator Studio is type-led, with devices small and a 2 s pace of single-word captions ("Loop it.", "Write it.").
- **Borrow:** crop to the card, hold 2 to 3 s, title between groups.
- **Gap:** the brief asked for a Photos or Spotlight search segment. A WWDC keynote segment would need a longer download; I stopped at these two and flag this as open.

## 5. Three specific answers

### Onboarding loops
- **How they make loops that read small:** Eagle and Superhuman use one visible change in a 3 to 7 s clip and no text, and add the explanation as page text beside it. Their frame is square-ish (564×612, 1368×1712), so a small slot shows a big, clear object. Linear's site loops are not good models for closing: they are filmed clips that do not end where they start.
- **Closing:** Eagle's loops return to the first frame (SSIM 0.91 to 0.99), and Superhuman's does too (0.99). Our loops should start on the resting state and finish on the same one. The POC loop faded through dark because the UI did not end where it began.
- **Budget:** 3 to 7 s, under 600 KB for a small slot (Eagle), under 2 MB for a large one (Superhuman, Linear hero).
- **Format:** Eagle and Linear each ship two or three encodings (H.265 or H.264 plus VP9 or AV1) because browsers differ. Our packaged app is one browser (Electron), so one H.264 file is enough; see the earlier playback check.
- **For DesignStash:** one loop per onboarding step, one change each: a file landing in To sort, a pile forming, a name changing, a search result appearing. Each begins and ends on the resting state, with no caption and no cursor except the drop.

### 9:16 for socials
- **What the references do:** none of the 16 is a native 9:16 file. Superhuman's hero is 4:5 and re-laid out: the window is cropped to a tall column and the surrounding page, not the video, holds the text. Raycast, Granola and Linear all lift one component to the centre of the frame, which crops cleanly to 9:16. Things puts the UI inside a tall phone shape.
- **What this means for us:** a component-shot storyboard (rule 4) works in 9:16 with a crop of the same footage, while whole-window shots do not. Where the 16:9 uses a component at 40 to 60% of width, 9:16 should stack title, component and caption. A follow-the-action crop of the whole window (the POC's approach) cut off the wide screen.
- **Evidence limit:** this is inferred from the layouts above, since no reference shows both ratios of the same piece.

### The Photoshop hand-off

**How good demos cross into another app (what I saw):**
- I did not find a clean example of a Photoshop-style hand-off in the 16. CleanShot's "Copy / Save" moves a capture into Telegram, and Notion Calendar's "Open in Notion" opens a page, but both cut to the result with no visible launch.
- The pattern that appears in both is: click on the button, a hard cut to the second app already open and showing the file, a 0.3 s dissolve at most.
- **How to hide a slow launch:** cut on the click and start the next shot with Photoshop already running and the file showing (rule 9). With a pre-launched Photoshop and a real file, the recording needs no launch time at all. Show the file name in Photoshop's tab for 1.5 to 2 s so the viewer sees it is the same file.
- I did not find a published account of how other makers hide this. That is my recommendation from the pattern, not a measurement.

**Adobe's rules (partly verified):**
- I could not fetch Adobe's pages directly, because the site returned HTTP 403 to my requests, so this part comes from search snippets of Adobe's own documents. Check the current text before publishing.
- The July 30, 2025 trademark guidelines have a "Displaying Adobe products" section (https://www.adobe.com/cc-shared/assets/pdf/legal/documents/adobe-trademark-guidelines.pdf). I could not read that section.
- From the same document as quoted in the search results: third parties may use Adobe trademarks in text, but not Adobe logos, product icons or taglines, to identify Adobe products in packaging and advertising.
- Adobe's permissions page says screenshots, box shots and images are "owned by Adobe" and may be used only as its guidelines authorise (https://www.adobe.com/legal/permissions/images-user-guides.html, via search snippet). The same page permits box shots in advertising and video under conditions (no implied endorsement, no comparative advertising, no alteration beyond resizing) and says other product imagery needs written permission.
- Written permission, when needed, goes through an online form that Adobe says it answers in about two weeks (via search snippet of the trademark page).
- **What this means for us:** a Photoshop window shown in a clip is Adobe product imagery, and the Photoshop icon is an icon. That points to asking Adobe for written permission before publishing the 20 to 30 s "Find it again" clip, or showing Photoshop with its UI minimal. Say "Photoshop" in text, with Adobe's attribution line, and do not use the Photoshop icon in our overlays. I cannot confirm from here that a real Photoshop screenshot in a video is covered by the box-shot allowance, so treat it as needing permission until Adobe says otherwise.

## 6. Open items

1. **Typing speed in search fields** is not measured. A denser sample (10 fps across the typing span) of the mymind "celine" search and the Linear Agent prompt is a short follow-up job.
2. **A Photos or Spotlight search-by-description segment from Apple** is missing. The two Apple clips I used give crop and title rules only.
3. **Adobe's "Displaying Adobe products" text** still needs a read from Neesh's browser. The pages blocked my requests.
4. **Cursor and caption sizes** are estimates from contact sheets (plus or minus a third). Before the storyboard fixes a size, a pixel measurement on three frames would tighten it.

## 7. Sources (all checked 2026-10-29)

Downloaded and measured:
- Raycast: https://www.youtube.com/watch?v=Mi173xGb0ZA
- Linear Agent: https://www.youtube.com/watch?v=mRql2VJ99gM; Linear Releases: https://www.youtube.com/watch?v=6dIwFoQ0eVg
- Linear site: https://linear.app/now, https://linear.app/plan, https://static.linear.app/assets/hero/PLANNING-MONITORING.output.h264.crf19.mp4
- Granola: https://www.youtube.com/watch?v=ekSyfD7uoiU
- Notion Calendar: https://www.youtube.com/watch?v=C4Q2ezioTUM
- Things: https://static.culturedcode.com/things/videos/2026-06-25-meet-things-remastered-2/meettheallnewthings.mp4 (page https://culturedcode.com/things)
- Arc: https://www.youtube.com/watch?v=n5Vwrj1gEWs
- CleanShot X: https://www.youtube.com/watch?v=FZbICrBKWIU
- mymind: https://www.youtube.com/watch?v=pQZKRf1gF9w
- Eagle: https://r2-web.eagle.cool/media/home-feature-search_H265.mov and the organize, browse and collect siblings (page https://eagle.cool)
- Cosmos: https://www.cosmos.so/videos/og-video.mp4
- Screen Studio: https://screen.studio/videos/hero/hero-demo.mp4
- Superhuman: https://superhumanstatic.com/vwfkeyj6n9ac/10yg8nDUh9XLV2wfk6D91h/48ffdd7ef1999828d74257aadd046374/hero-go-desktop-2x.mp4
- Apple: https://www.youtube.com/watch?v=ISYIEmQxs2M and https://www.youtube.com/watch?v=2PW5y3zAvPE

Adobe (search snippets only; the pages returned HTTP 403 to my requests):
- https://www.adobe.com/cc-shared/assets/pdf/legal/documents/adobe-trademark-guidelines.pdf (July 30, 2025)
- https://www.adobe.com/legal/permissions/trademarks.html
- https://www.adobe.com/legal/permissions/images-user-guides.html
- https://www.adobe.com/jp/misc/agreement.html (older permissions page)
