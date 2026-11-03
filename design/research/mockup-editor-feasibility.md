# Bring-your-own-PSD mockup editor: feasibility

**Question:** can DesignStash take any PSD mockup a designer brings (free or paid, old or new), find the layer meant for their design, hide creator and ad overlays, let them drop or paste an image and place it inside an in-app editor, and export an image that looks like Photoshop's output, all without Photoshop?

**Researched:** 2026-10-21. Primary sources were fetched directly: Adobe's PSD file format specification, the `ag-psd` README and the compiled source shipped in `node_modules/ag-psd@30.1.1`, the psd-tools README and source, Aspose.PSD docs and forum, Adobe's Photoshop API docs, Photopea's API pages, and the PSD-upload docs of Mediamodifier, Aurigma Customers Canvas and Dynamic Mockups. Each claim carries its URL. Claims marked **Unverified** have no primary source I could read.

**Measured:** all 40 real PSDs in the test set (`psds/`, `folders/Long Website Mockup/PSD/`, and the 33 PSDs inside `zips/`), read-only with `ag-psd`. I also wrote a throwaway renderer (about 400 lines of plain JS) that re-renders each smart object from its embedded contents and composites the whole document, then diffs both against the pixels Photoshop saved in the same file. The scripts live in the session scratchpad and were not committed; the method is in the Appendix.

## Summary

1. **Yes, for most mockups, and exactly.** The geometry Photoshop applies to a smart object (free transform, perspective, the classic 4x4 warp and the Photoshop 2020+ "quilt" warp grid) can be reproduced from the file's own data. I checked 20 filter-free smart objects in 13 files against the pixels Photoshop saved: the shape matched on all 20 (coverage disagreed on at most 0.04% of pixels), and the colour matched within a mean of 2/255 on 14. The other 6, all long-scroll screens, differ by 5 to 10/255 because my test flattened their inner document too simply (section 4). The undocumented rules that make it work are in section 4.
2. **Coverage on our 40 PSDs:** by smart-object geometry and filters, 27 (68%) are reproducible exactly, 4 (10%) approximately (smart filters: Gaussian blur, displace, Perspective Warp), and 9 (22%) need the Liquify smart filter, whose data is an undocumented binary blob. Liquify files can still be rendered without the liquify step, which looks right on flat areas and loses the fabric or crease distortion. Whole-document numbers are in section 5: with the compositor alone, 27 of the 37 files with a usable reference match Photoshop to under 1/255 mean, and every miss but one skips adjustment layers.
3. **Every PSD in the set follows a recognisable convention.** 29 of 40 name the design layer `Change This` (with `Change Color` and a linear-burn `Shadow` plus screen `Reflection` above it); 6 use `Place Your Design Here`; 3 Pixeden files use `PUT YOUR DESIGN HERE`. Name heuristics alone found the design layer in all 40.
4. **Overlays matter for covers today.** 4 of 40 (10%) have a visible "REMOVE THIS LAYER" / "Delete this layer first" layer covering 49 to 100% of the canvas. In the 3 Pixeden files the saved composite is nothing but a white card reading "Remove this layer to start", and `resolveCover` reads that composite first (`src/main/psd/cover-resolver.ts:9`), so those covers, and the AI titles made from them, show the card. Our renderer recovered the real scene with the overlay hidden.
5. **Inner smart-object documents usually have no usable composite** (`hasRealMergedData: false` in 9 of the 11 inner documents I checked). That does not affect replacement, because the user's image replaces that content, but a renderer must never rely on the inner composite.
6. **Recommended architecture:** analyse at import in the main process (ag-psd, already a dependency), "bake" each mockup into a small recipe (static base image, the design slots with their mesh, and the few blend layers above each slot), and render the editor preview and the export with WebGL2 in the renderer. No cloud, no Photoshop, no new native code.
7. **Effort:** an MVP (design-slot detection, overlay hiding, transform + warp + quilt, masks, clipping, the separable blend modes, the common adjustment layers, drop/paste/position, full-resolution PNG/JPEG export) is about 8 to 11 engineer-weeks. Writing a PSD back with the smart object replaced is a separate 2 to 4 weeks with real compatibility risk, so it comes later.

## 1. How Photoshop stores a smart object

**Spec coverage.** Adobe's PSD specification (dated November 2019) documents byte layouts only: "This document does not explain how to interpret the data. This document describes the format of the data only." It also excludes the cloud document format (PSDC). Source: https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/ (adobe.com returned HTTP 403 to my fetch, so I read the Wayback Machine copy of the same URL: https://web.archive.org/web/2024/https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/).

**Placed layer records** (same spec):
- `PlLd` "Placed Layer (replaced by SoLd in Photoshop CS3)": unique ID, page number, placed layer type (0 unknown, 1 vector, 2 raster, 3 image stack), "Transformation: 8 doubles for x,y location of transform points", then a warp version and a "Descriptor for warping information".
- `SoLd` "Placed Layer Data (Photoshop CS3)" and `SoLE` "Smart Object Layer Data (Photoshop CC 2015)": an identifier `soLD`, a version, and a "Descriptor of placed layer information". The spec does not list the descriptor's keys.
- `lnkD`, `lnk2`, `lnk3` "Linked Layer": one record per smart-object content, typed `liFD` (linked file data, the bytes are embedded), `liFE` (linked file external, a path plus optional bytes) or `liFA` (alias). Each record carries a unique ID, the original file name, file type and creator codes, and the raw bytes.
- `FXid` / `FEid` "Filter Effects": the smart-filter mask channels.

**What the descriptors actually hold**, from the reader in `ag-psd` (handlers for `PlLd`, `SoLd`, `SoLE` and `lnk2/lnk3/lnkD/lnkE`: https://github.com/Agamnentzar/ag-psd/blob/master/src/additionalInfo.ts, read in the compiled `dist/additionalInfo.js` of version 30.1.1):
- `Idnt`: the ID that matches a linked-file record, so several layers can share one content.
- `Sz  `: the content's own width and height, the "inner canvas".
- `Trnf`: 8 numbers, the four corners (TL, TR, BR, BL) in document pixels.
- `nonAffineTransform`: 8 numbers; `ag-psd` keeps it only when it differs from `Trnf`. In our files it differs whenever the smart object has a perspective distort, and it is the quad that matches the saved pixels (section 4).
- `warp` or `quiltWarp`: style (`none`, a preset like `arc` or `flag`, or `custom`), `bounds`, `uOrder`/`vOrder`, and for custom warps `customEnvelopeWarp.meshPoints`. Photoshop 2020+ grid warps are stored as `quiltWarp` with `quiltSliceX` / `quiltSliceY` and `deformNumRows` / `deformNumCols`.
- `filterFX`: the smart filter list, each with its parameters, blend mode and opacity.

**Embedded vs linked.** In our 40 PSDs every one of the 117 visible smart objects is embedded (`liFD`); none is linked to an external file (measured, section 3).

**Embedded content type.** 117 of the 119 inner contents are PSB (large document format), 2 are PNG (`B.png`, `C.png` in two long-scroll files). `ag-psd`'s README lists "Does not support The Large Document Format (8BPB/PSB)" (https://github.com/Agamnentzar/ag-psd/blob/master/README.md), yet version 30.1.1 parsed the layer structure of every inner PSB in the set and decoded the pixels of every inner PSB I rendered. Its reader switches to 8-byte lengths and 4-byte RLE row counts when the version field is 2 (`reader.large = version === 2` in `dist/psdReader.js`). Treat the README line as out of date for reading, and keep a PNG/JPEG path (sharp) for raster contents.

**Inner composites are usually blank.** The spec says that when "maximize compatibility is unchecked then the merged/composite is not created and the layer data must be read to reproduce the final image" (spec, Layer and Mask Information section). In our set 9 of the 11 inner documents I checked report `hasRealMergedData: false` in their Version Info resource (ID 1057), and their merged image decodes as solid white. A renderer must flatten the inner layers itself, or (the normal case) ignore them because the user's image replaces them.

**Other features a full renderer would meet** (all present in the spec's layer record and additional-info keys): 27 blend mode keys (`pass`, `norm`, `diss`, `dark`, `mul `, `idiv`, `lbrn`, `dkCl`, `lite`, `scrn`, `div `, `lddg`, `lgCl`, `over`, `sLit`, `hLit`, `vLit`, `lLit`, `pLit`, `hMix`, `diff`, `smud`, `fsub`, `fdiv`, `hue `, `sat `, `colr`, `lum `), clipping ("0 = base, 1 = non-base"), layer masks, vector masks, adjustment layers, layer effects (`lfx2`) and layer comps.

## 2. Libraries and services that could render or replace smart objects

| Option | Reads SO data | Re-renders SO warp | Composites document | Local | Cost / licence | Notes |
|---|---|---|---|---|---|---|
| `ag-psd` (already in the app) | Yes: transform, warp, quilt, filters, linked files | No | No | Yes | MIT | "This library does NOT generate new composite canvas based on the layer data" and does not regenerate layer pixels for smart objects (README). Best parser for us. |
| psd-tools (Python) | Yes (low-level) | No | Partial | Yes | MIT | README: "Limited support: Composition of basic pixel-based layers... adjustment layers (BrightnessContrast, Levels, Curves, Exposure, Invert, Posterize, Threshold)... Blending modes except for dissolve"; "Not supported: Editing of ... smart objects" (https://github.com/psd-tools/psd-tools). Its compositor has no warp or placed-layer code (`src/psd_tools/composite/composite.py`), so smart objects composite from their saved pixels. Useful as a reference for blend formulas (`blend.py`). Would add Python to the app. |
| Aspose.PSD (.NET, Java, Python via .NET) | Yes | Yes, opt-in | Yes | Yes | Commercial | Docs: set `AllowWarpRepaint`; "supports Custom Warp with the standard mesh, and we are actively working on expanding our support to include all mesh types" (https://docs.aspose.com/psd/net/how-to-use-warp-in-aspose-psd/). Forum, March to October 2025: a user could not get warp to apply after `ReplaceContents`; staff: "The quality of rendering improves every release", issue PSDNET-2395 marked fixed in October 2025 (https://forum.aspose.com/t/smartobjects-functionality-limitations/310336). Would add a .NET runtime to an Electron app. |
| Photopea | Yes | Yes (it is a full editor) | Yes | Self-hosted package can run offline | Self-hosted "costs between $500 and $2000 per month", paid a year in advance (https://www.photopea.com/api/accounts) | Closed source; driven by URL JSON and postMessage scripting (https://www.photopea.com/api/). Embedding a whole second editor conflicts with owning the editor UX. |
| Adobe Photoshop API (Firefly Services) | n/a | Yes, it is Photoshop | Yes | **No**, cloud | **Unverified** pricing (enterprise sales) | `POST https://image.adobe.io/pie/psdService/smartObject`, async job, inputs and outputs via signed URLs. Known limits: "We currently don't support Linked Smart Objects"; to update a shared smart object "you need to update each of those layers"; "we rasterize our smart objects that are bigger than 2000x2000 pixels" (https://developer.adobe.com/firefly-services/docs/photoshop/guides/smart-objects-and-the-api/). Conflicts with local-first. |
| Write our own (TypeScript + WebGL2) | via `ag-psd` | Yes (measured, section 4) | Yes (measured, section 5) | Yes | Engineering time | The prototype for this research reproduced warps and full composites from Photoshop's own data. |

**How BYO-PSD services scope the problem.** Three products that accept customer PSDs publish what they support, and each draws the line near where our measurements say the hard parts start:
- Mediamodifier asks uploaders to prepare files: "No Smart filters or layer styles (these will be ignored)"; warped placeholders need an `mm_wrp:` name prefix and "can only use the Default Photoshop warp"; "Warp and Distort are supported, however these effects cannot be used simultaneously" (https://mediamodifier.com/blog/psd-format).
- Aurigma Customers Canvas Dynamic Image supports scale, rotate, skew, distort, perspective and warp, but "does not support a customized grid, so the Warp tool can only be used with Default settings (without internal lines)"; unsupported: "Layer effects other than Color Overlay, Drop Shadow, and Stroke", "Adjustment layers", "Smart filters" (https://customerscanvas.com/dev/dynamic-image/concepts/psd-files.html).
- Dynamic Mockups (cloud API, accepts PSD uploads at `POST /psd/upload`) lists full support for scale, rotate, skew, distort, perspective, "Warp (Default)" and "Warp (Custom)", clipping masks, layer masks, blending modes and adjustment layers (except Color Balance, Photo Filter, Color Lookup, Selective Color, Gradient Map); "Nested Smart Objects are not supported"; most layer styles not supported. The table does not mention smart filters (https://docs.dynamicmockups.com/knowledge-base/photoshop-api-feature-support.md, https://docs.dynamicmockups.com/api-reference/psd-upload-api.md).

Our measurement goes further than the first two on warps: the quilt grids they exclude are present in 17 of 40 files (section 3) and reproduce exactly (section 4).

**Library-only products.** Mockuuups Studio: "At the moment you will not be able to import your own mockups into Mockuuups Studio. But this is something we want to make possible and is in the pipeline for the future" (help article last updated December 28, 2021: https://mockuuups.studio/help/article/30-can-i-import-my-own-mockups-into-the-mockuuups-studio). How Mockuuups, Smartmockups, Placeit and Artboard Studio build their own templates (for example, a base photo plus shadow and highlight passes plus a warp) is **Unverified**: I found no first-party technical description.

## 3. Measured: smart objects in our 40 PSDs

Method: `ag-psd` `readPsd` with layer pixels skipped, inner contents decoded for their header and layer names. "Design SOs" are visible smart objects whose own name, linked-file name or inner layer names match design-placeholder wording (`Change This`, `Place Your Design Here`, `PUT YOUR DESIGN HERE`, `Edit Content`, screen, cover, label), excluding scene parts named Base, Object, Shadow, Background or Reflex. Quad: the shape of the transform quad (`nonAffineTransform` when present). Warp: `mesh` is a single 4x4 Bezier patch; `quilt` is the 2020+ grid; "identity" meshes count as none. Blend above: blend modes of visible layers above the design SOs. Verdict, by smart-object geometry and filters: **exact** (no smart filter, or only filters with published, reproducible maths), **approx** (a filter we can only approximate), **none** (Liquify).

| File | Design SOs | Inner canvas | Quad | Warp | Smart filters | Blend above | Overlay | Verdict |
|---|---|---|---|---|---|---|---|---|
| Macbook-Mockup-on-Rocks-Boho-Interior | 1 | 928x667 | perspective | none | gaussian blur, sharpen, sharpen edges | normal, soft light | - | approx |
| M003T1513 A long scroll | 1 | 3024x5892 | perspective | quilt | - | linear burn, linear dodge | - | exact |
| M003T1513 B long scroll | 2 | 3024x1964, 3024x3928 | perspective | quilt 2 | - | linear burn, linear dodge, normal | - | exact |
| M003T1513 C long scroll | 1 | 3024x8228 | perspective | quilt | - | linear burn, linear dodge | - | exact |
| M003T1514 A long scroll | 3 | 3024x1200 to 3024x2946 | perspective | quilt 3 | - | linear burn, linear dodge, normal | - | exact |
| M003T1514 B long scroll | 3 | 3024x1800 to 3024x2500 | perspective | quilt 3 | - | linear burn, linear dodge, normal | - | exact |
| M003T1514 C long scroll | 3 | 2500x1900 to 2500x4000 | perspective | quilt 3 | - | linear burn, linear dodge, normal | - | exact |
| 011 (MacBook Air) | 1 | 2880x1800 | perspective | none | - | - | - | exact |
| Sticker Mockup | 1 | 3180x3180 | scale | mesh | - | linear burn, screen | - | exact |
| Poster on construction fence | 1 | 2480x3508 | scale | mesh | displace | linear burn, linear dodge, normal, soft light | Delete this layer first | approx |
| Apple Watch Ultra, Realistic | 9 | 410x502 | perspective | none | - | normal | - | exact |
| Apple Watch Ultra, Clay | 3 | 410x502 | perspective | none | - | linear burn, normal, screen | - | exact |
| B-Mockups MacBook 16 Pro | 1 | 3456x2234 | perspective | none | - | - | - | exact |
| Boards Isolated | 3 | 1636x818 | translate | none | perspective warp | linear burn, normal, screen | - | approx |
| Boards Environment | 3 | 1636x818 | translate | none | perspective warp | linear burn, normal, screen | - | approx |
| Floating Z-Fold Brochure (Pixeden) | 1 | 4447x2634 | perspective | quilt | - | linear burn, linear dodge, multiply, normal, overlay | REMOVE THIS LAYER | exact |
| Free 2 ID Cards | 2 | 827x1181 | perspective | none | - | linear burn, normal, screen | - | exact |
| Free 3 Notebook, Business Cards and Envelope | 8 | 1004x650 to 1984x2480 | perspective 7, rotate/skew 1 | quilt 4, none 4 | - | linear burn, normal, screen | - | exact |
| Free Billboard | 1 | 4373x1640 | perspective | none | - | linear burn, screen | - | exact |
| Free Cap | 2 | 1621x1833, 3241x1833 | rotate/skew, scale | mesh 2 | liquify | linear burn, normal, screen | - | none |
| Free Craft Cup | 1 | 2031x2087 | scale | quilt | - | linear burn, normal, screen | - | exact |
| Free Fabric Shopper Bag | 1 | 2129x2342 | perspective | none | liquify | linear burn, screen | - | none |
| Free Fabric Tote Bag | 1 | 2568x2439 | perspective | none | liquify | linear burn, screen | - | none |
| Free iPhone 15 | 1 | 1179x2556 | perspective | none | - | - | - | exact |
| Free Notebook, Envelope and Business Card (EU) | 5 | 1004x650 to 1748x2480 | perspective 4, rotate/skew 1 | quilt 3, none 2 | - | linear burn, normal, screen | - | exact |
| Free Notebook, Envelope and Business Card (US) | 5 | 1051x602 to 1748x2480 | perspective 4, rotate/skew 1 | quilt 3, none 2 | - | linear burn, normal, screen | - | exact |
| Free Outdoor Banner | 1 | 4373x1640 | perspective | none | - | linear burn, screen | - | exact |
| Free Realistic Tote Bag | 1 | 1980x1980 | scale | quilt | - | linear burn, normal, screen | - | exact |
| Free Tote Bag | 1 | 1819x1960 | perspective | mesh | liquify | linear burn, normal, screen | - | none |
| Free Tote Bag on the Floor | 1 | 2089x1974 | perspective | mesh | liquify | linear burn, screen | - | none |
| Free paper postal packages | 4 | 1299x1299 to 2480x3508 | perspective | quilt 4 | - | linear burn, normal, screen | - | exact |
| MacBook Pro Showcase Scene (Pixeden) | 2 (1 content) | 3456x2234 | perspective | none | - | linear burn, linear dodge, linear light, multiply, normal, overlay | REMOVE THIS LAYER | exact |
| PaperBack Book on Mirror (Pixeden) | 1 (+1 reflection instance) | 1724x2379 | perspective | quilt | - | linear burn, linear dodge, multiply, normal, overlay | REMOVE THIS LAYER | exact |
| Qubus (EU) | 4 | about 708x5985 | perspective | quilt 3, none 1 | liquify | linear burn, normal, screen | - | none |
| Qubus (US) | 4 | about 708x5985 | perspective | quilt 3, none 1 | liquify | linear burn, normal, screen | - | none |
| free iPhone 16 (001) | 10 | 1179x2556 | perspective | none | - | normal | - | exact |
| Hanging Duct Tape | 2 | 591x2362, 591x2491 | perspective | mesh 1, none 1 | - | linear burn, normal, screen | - | exact |
| Free Lightbox | 1 | 2696x2699 | perspective | none | - | linear burn | - | exact |
| Matte Snack Bar | 1 | 2008x591 | perspective | none | liquify | linear burn, normal, screen | - | none |
| Tape Coiled Up in Spiral | 7 | 295x354 | perspective | mesh 1, quilt 1, none 5 | liquify | linear burn, normal, screen | - | none |

**Totals across the 40 files:**
- Every document is 8-bit RGB (colour mode 3). Sizes range from 3000x2000 to 8000x6000; 29 of 40 are 6000x4500.
- 117 visible smart objects, 111 distinct contents (shared instances in only 4 files: the two Pixeden scenes reuse the design for a reflection, the two Qubus files reuse ribbons). All embedded, none linked.
- Transform on the 104 design SOs: perspective (non-parallelogram quad) 89, translate 6, scale 5, rotate/skew 4.
- Warp: 23 of 40 files contain at least one non-identity warp; 17 use the 2020+ quilt grid (28 to 640 control points). No preset warp styles (arc, flag and so on) appear.
- Smart filters on design SOs: Liquify (9 files), Perspective Warp (2), Displace (1), Gaussian blur plus sharpen (1). Scene SOs also carry Curves and Gaussian blur.
- Blend modes, by number of files using them: normal 40, linear burn 34, screen 23, linear dodge 10, multiply 4, overlay 3, soft light 2, linear light 1. No non-separable modes (hue, colour, luminosity), no dissolve.
- Adjustment layers in 12 files: curves (7), colour balance (6), vibrance (4), levels (3), hue/saturation (2), photo filter (1), brightness/contrast (1).
- Layer effects on a design SO: only Qubus (9 effects on one ribbon).
- Layer comps: none. Artboards: none.

**Share a renderer could reproduce** (by smart-object geometry and filters): exact 27/40 (68%), approximate 4/40 (10%), not exactly 9/40 (22%). The sample is small and skewed: 29 files use the `Change This` convention, most with the same Shadow and Reflection structure, so treat the percentages as a first estimate. **Unverified** for paid marketplaces (Envato, Creative Market), where older templates may use more smart filters and layer styles.

## 4. Measured: re-rendering the smart object exactly

Test: for each smart object, take its embedded content (flattening the inner layers when the inner merged image is blank), apply the stored transform and warp, and diff the result against the layer pixels Photoshop saved for that smart object. Photoshop bakes transform, warp and smart filters into those saved pixels, so this isolates the geometry. "Alpha mismatch" is the share of covered pixels whose coverage disagrees; "mean diff" is the mean absolute RGB difference on fully covered pixels (0 to 255).

| File, smart object | Geometry | Smart filters | Alpha mismatch | Mean diff | Pixels off by more than 24 |
|---|---|---|---|---|---|
| Free iPhone 15, Change This | perspective | - | 0.01% | 0.33 | 0% |
| B-Mockups MacBook 16 Pro, Change This | perspective | - | 0.02% | 0.28 | 0.01% |
| Free Billboard, Change This | perspective | - | 0% | 0.16 | 0.05% |
| Free Lightbox, Change This | perspective | - | 0.03% | 0.78 | 0.98% |
| Sticker, Change This | 4x4 mesh warp | - | 0.02% | 0.38 | 0.54% |
| Poster on fence, Edit Content (hidden twin) | 4x4 mesh warp | - | 0.01% | 0.13 | 0.16% |
| Free Craft Cup, Change This | quilt, 4x1 patches | - | 0.03% | 0.91 | 1.19% |
| Free Realistic Tote Bag, Change This | quilt, 169 points | - | 0.04% | 0.27 | 0.33% |
| Long scroll 1513 C, Screen | perspective + quilt | - | 0.04% | 1.76 | 2.44% |
| Long scroll 1513 A/B, 1514 B screens (6 SOs) | perspective + quilt | - | 0.02 to 0.04% | 5.6 to 10.3 | 6 to 10% |
| Long scroll Object SOs (5) | translate | - | 0% | 0 | 0% |
| Boho MacBook, Laptop | perspective | gaussian blur, sharpen, sharpen edges | 0.03% | 1.43 | 1.68% |
| Poster on fence, Edit Content | 4x4 mesh warp | displace | 0.91% | 1.98 | 2.28% |
| Boards Isolated, Change This (3) | translate | Perspective Warp | 33 to 42% | (shape wrong) | - |
| Long scroll Base SOs (3) | translate | curves x2 | 0% | 32 to 77 | 74 to 100% |

Reading the table:
- **Every warp type present in the set (single mesh and quilt) reproduces exactly once these undocumented rules are applied**, found by testing alternatives against the saved pixels:
  1. The transform quad (`nonAffineTransform` when present, otherwise `Trnf`) is the image of the **bounding box of the warp's control points**, mapped by a projective transform. Mapping the warp `bounds` rectangle instead puts the sticker 1.9% out on alpha and the cup 27.6% out; mapping the control-point box brings both under 0.04%.
  2. Quilt slice positions (`quiltSliceX`, `quiltSliceY`) are used as fractions of their own span to divide the source image between patches. Using them as source pixel coordinates leaves the cup with a mean diff of 18.8 instead of 0.91.
  3. Each patch is a bicubic Bezier surface over a (3n+1) x (3m+1) control grid, row-major. These rules agree with how `ag-psd` names the fields; Adobe documents none of it.
- The long-scroll screens show perfect shape (alpha mismatch 0.04% or less) but a mean colour diff of 5 to 10. Supersampling 3x3 did not change it, and the inner document there contains a linear-burn grid layer that my test flattener blended as normal. With a full inner compositor these should drop to the level of the other quilt results. **Unverified** until re-run.
- Smart filters are where fidelity goes. Gaussian blur and sharpen at small radii leave the mean diff under 1.5, so skipping them is a usable fallback, and both have exact definitions to implement later. Curves is an exact lookup table; the large diffs on the Base SOs most likely come from skipping two Curves filters (**Unverified**: I did not implement Curves to confirm). Perspective Warp is a different geometry altogether (it folds the board along a crease), so skipping it gets the shape wrong; `ag-psd` parses its quads and vertex lists, which makes it implementable as piecewise projective maps. **Unverified** until built.
- **Displace references a file outside the PSD.** The poster's filter reads `displacementFile: { signature: 'txtu', path: 'C:\Users\...\Desktop\approved\5 DIS.psd' }`: a path on the creator's PC. The map itself is not embedded, so re-applying that displacement to a new design needs the creator's file, in Photoshop as much as in our renderer. Skipping it cost a mean diff of 1.98 on this poster.
- **Liquify** stores its mesh as an opaque byte array (`liquifyMesh: f.Fltr.LqMe` in `ag-psd`'s filter parser); I found no public description of the format. **Unverified**: whether it can be decoded. Two fallbacks: render without it, or estimate a displacement field at import by optical flow between our no-liquify render and Photoshop's saved pixels for the original content. The second is an untested idea.
- Speed: the plain-JS renderer took 18 to 340 ms per smart object on one CPU core with 96x96 tessellation per patch. A GPU draw of the same mesh is a few thousand triangles, so a live preview is cheap.

## 5. Measured: compositing the whole document

Test: composite every layer of the document with a minimal compositor (section 7 and Appendix) and diff against the merged image Photoshop saved in the file. Two runs per file:
- **A, compositor only:** smart objects use the pixels Photoshop saved for them. This isolates blending, masks, clipping and groups.
- **B, full pipeline:** each design slot is re-rendered by our warp renderer from its embedded content (smart filters skipped), as the editor would. Scene smart objects (Base, Object, Shadow) keep their saved pixels.

Values: mean absolute RGB difference over the whole canvas (0 to 255), and in brackets the share of pixels off by more than 24. Adjustment layers, layer effects and smart filters are skipped in both runs and listed.

| File | A: compositor only | B: full pipeline | Skipped |
|---|---|---|---|
| Macbook-Mockup-on-Rocks-Boho-Interior | 11.03 (1.85%) | 11.14 (2.12%) | 5 adjustments, 1 SO filter set |
| M003T1513 A long scroll | 0.58 (0.10%) | 2.19 (1.92%) | 1 SO filter set |
| M003T1513 B long scroll | 1.27 (0.04%) | 2.79 (1.98%) | 1 SO filter set |
| M003T1513 C long scroll | 28.94 (35.09%) | 29.27 (35.58%) | 1 adjustment, 1 SO filter set |
| M003T1514 A long scroll | 0.32 (0.00%) | 1.44 (1.31%) | - |
| M003T1514 B long scroll | 0.00 (0.00%) | 2.04 (2.25%) | 1 SO filter set |
| M003T1514 C long scroll | 0.88 (0.15%) | 2.02 (1.68%) | - |
| 011 (MacBook Air) | 0.00 (0.00%) | 0.06 (0.00%) | - |
| Sticker Mockup | 0.00 (0.00%) | 0.10 (0.14%) | - |
| Poster on construction fence | 3.09 (0.00%) | 3.38 (0.37%) | 1 adjustment, displace |
| Apple Watch Ultra, Realistic | 0.00 (0.00%) | 1.07 (1.46%) | - |
| Apple Watch Ultra, Clay | 0.06 (0.00%) | 0.06 (0.00%) | - |
| B-Mockups MacBook 16 Pro | 17.21 (0.78%) | 17.26 (0.78%) | 2 adjustments |
| Boards Isolated | 0.00 (0.00%) | 1.93 (2.97%) | 3 Perspective Warp filters |
| Boards Environment | 0.02 (0.00%) | 2.01 (2.56%) | 3 Perspective Warp filters |
| Floating Z-Fold Brochure (Pixeden) | 0.00 * | 0.00 * | 2 adjustments |
| Free 2 ID Cards | 0.00 (0.00%) | 0.04 (0.03%) | - |
| Free 3 Notebook, Business Cards and Envelope | 0.00 (0.00%) | 0.62 (0.64%) | - |
| Free Billboard | 0.00 (0.00%) | 0.03 (0.01%) | - |
| Free Cap | 0.02 (0.00%) | 0.21 (0.21%) | 2 Liquify |
| Free Craft Cup | 0.18 (0.00%) | 0.22 (0.06%) | - |
| Free Fabric Shopper Bag | 0.00 (0.00%) | 2.03 (1.93%) | Liquify |
| Free Fabric Tote Bag | 0.05 (0.00%) | 4.04 (3.11%) | Liquify |
| Free iPhone 15 | 0.00 (0.00%) | 0.06 (0.00%) | - |
| Free Notebook, Envelope and Business Card (EU) | 0.00 (0.00%) | 1.45 (1.04%) | - |
| Free Notebook, Envelope and Business Card (US) | 0.00 (0.00%) | 1.48 (1.06%) | - |
| Free Outdoor Banner | 0.00 (0.00%) | 0.03 (0.00%) | - |
| Free Realistic Tote Bag | 0.00 (0.00%) | 0.03 (0.03%) | - |
| Free Tote Bag | 0.02 (0.00%) | 1.16 (0.78%) | Liquify |
| Free Tote Bag on the Floor | 0.00 (0.00%) | 1.29 (0.90%) | Liquify |
| Free paper postal packages | 0.00 (0.00%) | 0.51 (0.43%) | - |
| MacBook Pro Showcase Scene (Pixeden) | 0.00 * | 0.00 * | 1 adjustment |
| PaperBack Book on Mirror (Pixeden) | 0.00 * | 0.00 * | 1 adjustment |
| Qubus (EU) | 1.64 (0.00%) | 12.72 (6.35%) | 2 adjustments, 1 layer with 9 effects, Liquify x2 |
| Qubus (US) | 1.64 (0.00%) | 12.88 (6.53%) | 2 adjustments, 1 layer with 9 effects, Liquify x2 |
| free iPhone 16 (001) | 0.00 (0.00%) | 0.08 (0.00%) | - |
| Hanging Duct Tape | 1.59 (0.00%) | 1.98 (0.31%) | 2 adjustments |
| Free Lightbox | 0.00 (0.00%) | 0.11 (0.13%) | - |
| Matte Snack Bar | 10.50 (0.76%) | 11.43 (1.37%) | 2 adjustments, Liquify |
| Tape Coiled Up in Spiral | 16.42 (7.79%) | 17.65 (9.17%) | 3 adjustments, Liquify x7 |

\* The three Pixeden files score 0 only because their saved composite is the full-canvas `REMOVE THIS LAYER` card ("Remove this layer to start", "thanks to this layer the file is smaller"), which both runs reproduce. With the overlay hidden, the renderer produced the real scene (a MacBook on a tiled plinth), with nothing in the file to compare it against. The comparison images are in the session scratchpad `so-measure/cmp/`.

Reading the table:
- **The compositor itself is exact where nothing is skipped.** Run A is under 1.0 on 27 of the 37 files with a meaningful reference; 21 of those are at 0.00 or 0.02, meaning the minimal compositor (separable blend modes, masks, clipping, groups) matches Photoshop pixel for pixel. Of the 10 files above 1.0, 9 skip adjustment layers. The tenth (1513 B, 1.27) is unexplained.
- **Adjustment layers are the biggest gap**, worth 3 to 29 mean when skipped (B-Mockups 17.2, long scroll 1513 C 28.9 from one hue/saturation layer). All seven types in the set have published or well-understood maths; psd-tools already implements several (README, section 2). They belong in the MVP.
- **The full pipeline (B) is under 2.5 on 27 of the 37 files with a usable reference.** Where B is worse than A on filter-free files (0.6 to 2.8), the gap traces to my test's inner flattening (normal blending only) and bilinear sampling; production code would composite the inner document properly. **Unverified** until re-run.
- **Liquify skipped: small on most files, large on one.** Tote bags and the cap lose only fabric creases (B between 0.21 and 4.04, visually near identical in the side-by-sides). Qubus breaks: the ribbon's twist and one strip come mostly from Liquify, so skipping it draws the ribbon in the wrong place. The tape and snack bar files mix Liquify with skipped adjustments, so their B values say little about Liquify alone.
- Speed of the plain-JS CPU compositor: 0.7 to 23 s per document on one core (the 8000x6000 Pixeden brochure was slowest). Fine for a one-off bake, too slow for a live preview, which is why the editor renders on the GPU (section 7).

## 6. Finding the design layer and the overlays

**Naming conventions found in the set:**
- `Change This` smart object (29 of 40 files), usually with `Change Color` shape layers for the product colour, a `Shadow` pixel layer in linear burn and a `Reflection` pixel layer in screen directly above. Inner layer names are often Russian defaults (`Слой 1`, "Layer 1").
- `Place Your Design Here` group holding `Screen`, `Screen 1..3` smart objects, with an `FX` group of `Shadow` (linear burn) and `Highlight` (linear dodge) above (the 6 long-scroll files).
- `PUT YOUR DESIGN HERE` smart object inside an `Overlays` structure, with a top-level `REMOVE THIS LAYER` (3 Pixeden files).
- `Edit Content` smart object whose inner document contains `Delete Me` and `Your Design Here` layers, under a top-level `Delete this layer first` (the poster).
- `Place Image Here` (Boho MacBook), `Change This (170x50)` with print dimensions in the name (snack bar, tape).

**Recommended detection, in order:**
1. Name match on the smart object, its linked-file name and its inner layer names: `change this`, `your design`, `design here`, `place (your|image)`, `put your`, `edit (content|me)`, `double.?click`, `replace`, `insert`, `screen`, `cover`, `label`, `artwork`, `logo`. This found the design layer in all 40 files.
2. Structure as a tie-breaker: a smart object directly under linear-burn/multiply "shadow" and screen/linear-dodge "highlight" layers, with a layer mask, and not the full-canvas size. Scene smart objects (`Base`, `Object`, `Shadow`) in the long-scroll files are full-canvas and translate-only.
3. Fallback: the largest visible smart object.
4. Always let the user switch slots, and show every candidate slot in the editor (multi-slot files like the iPhone 16 set have 10).

**Overlays to hide:**
- Name match on any non-smart-object layer: `remove this`, `delete this`, `delete me`, `hide this`, `read me`, `instructions`, `watermark`, a URL or `.com`, `promo`, `more mockups`, `freebie`. In our set this finds 4 overlays (3 `REMOVE THIS LAYER`, 1 `Delete this layer first`), covering 49 to 100% of the canvas, always the topmost layer.
- Inner instruction layers: when the design's inner document has a layer named `Delete Me` or similar, it disappears anyway because the user's image replaces the whole content.
- Text layers at the top level whose text is a URL or credit line: none in this set, but common on marketplaces. **Unverified** share.
- Hidden by default, with an undo, never deleted from the file.

**Cover benefit, independent of the editor:** `resolveCover` (`src/main/psd/cover-resolver.ts`) uses the embedded composite read by `src/main/psd/embedded.ts` before any sidecar image. For the 3 Pixeden files that composite is the "Remove this layer to start" card, so their cover, title, description and tags describe the card. Once the compositor exists, re-rendering the cover with overlays hidden fixes them (section 5).

## 7. Recommended architecture

**Principle:** parse once, bake what never changes, and render only what the user changes.

1. **Import-time analysis (main process, `ag-psd`).** Read layer records and linked-file headers with layer pixels skipped (this took 12 to 116 ms per file in the measurement pass, file read included). Produce a mockup description: design slots (ID, name, inner canvas size, quad, warp mesh, mask, filters), overlays, and a renderability verdict per slot. Store it with the mockup in SQLite. This is cheap enough to run during the existing import.
2. **Bake on first open of the editor (main process or a worker).** Read the full PSD once and render:
   - **Base:** everything below the lowest design slot, composited by our compositor, overlays hidden.
   - **Per slot:** the mask, the clipping and blend layers that sit directly above it (typically `Shadow` in linear burn, `Reflection` in screen), and the mesh.
   - **Top:** any remaining layers above all slots, kept as layers with their blend modes (adjustment layers above a slot affect the user's design, so they stay live).
   Save the recipe (PNG layers plus a JSON with meshes, blend modes, opacities) next to the PSD in the managed Library. This is the shape library products are said to use (base photo, shadow and highlight passes, a warp), but **Unverified** for any specific product.
3. **Editor (renderer, WebGL2).** Each slot shows the user's image in the slot's own inner canvas (the SO's `Sz` size), positioned, scaled and rotated by the user, then drawn through the slot's tessellated Bezier mesh and projective quad as textured triangles, masked, and blended with the slot's layers using the W3C formula `Cs = (1 - αb) x Cs + αb x B(Cb, Cs)` (https://www.w3.org/TR/compositing-1/). Blend functions follow psd-tools' implementations, which "follow Adobe's PDF Blend Mode specification" and include Photoshop's soft light variant (https://github.com/psd-tools/psd-tools/blob/main/src/psd_tools/composite/blend.py). The preview runs at screen resolution; nothing here needs Node.
4. **Export.** Same pipeline at full resolution into an offscreen framebuffer (our largest document is 8000x6000; **Unverified**: the WebGL2 `MAX_TEXTURE_SIZE` Electron 42 reports on Apple Silicon, check it at startup and tile if needed), read back, encode with sharp in main. PNG and JPEG first.
5. **Golden tests without Photoshop.** The measurement method doubles as a regression suite: for every test-set PSD, re-render with the original content and diff against Photoshop's own composite and layer pixels. Thresholds from this research: alpha mismatch under 0.1%, mean diff under 1.5 for slots without filters.
6. **Process isolation.** All file reads and the bake stay in main; the renderer gets the recipe through a typed, zod-validated IPC channel and image bytes through the existing custom protocol, in line with `CLAUDE.md`.

**Why not the alternatives:** Adobe's API needs uploads to Adobe (local-first breaks) and drops linked smart objects. Photopea would put a second editor's UI and licence inside ours. Aspose adds a .NET runtime and still describes warp support as in progress. Python psd-tools adds a runtime and does not render smart-object warps. A native Core Image or Metal renderer would work equally well geometrically; that choice belongs to the native-vs-Electron research (`design/research/native-vs-electron.md`) and does not change the architecture above.

## 8. Phased plan

**Phase 0, spike (1 to 2 weeks).** Turn the throwaway renderer into tested main-process modules: `psd/smart-objects.ts` (parse slots, mesh, overlays), `psd/composite.ts` (CPU compositor), golden tests against the test set (skipped when `DESIGNSTASH_TEST_SET` is missing, as now). Ship one visible win: covers re-rendered with overlays hidden.

**Phase 1, MVP editor (6 to 8 weeks).**
- Slot detection and overlay hiding, with manual override.
- Geometry: translate, scale, rotate, skew, perspective, preset warps (the Photoshop presets are closed-form envelopes; **Unverified**: their formulas, so test each against saved pixels), custom mesh and quilt.
- Compositing: masks, clipping, groups (pass-through and isolated), opacity and fill opacity, all separable blend modes, the adjustment layers seen in the set (curves, levels, hue/saturation, colour balance, vibrance, brightness/contrast, photo filter).
- Smart filters: Gaussian blur, Curves, sharpen. Others skipped with a "shown without its X effect" note.
- Editor: drop or paste an image, fit or fill, move, scale, rotate inside the slot canvas, live preview, one design to several slots, product colour for `Change Color` layers.
- Export full-resolution PNG and JPEG.
- Mockups with Liquify or Perspective Warp open, rendered without that filter and labelled as approximate.

**Phase 2 (4 to 6 weeks).** Perspective Warp filter (piecewise projective), layer effects on slots (drop shadow, stroke first), non-separable blend modes, 16-bit documents, more adjustment types, Liquify fallback via optical flow if the spike shows it works.

**Phase 3 (2 to 4 weeks, optional).** Write a PSD back with the smart object replaced: swap the `liFD` bytes for a PSB or PNG of the user's image, update `Sz`, write our rendered layer pixels and composite (because `ag-psd` "does NOT generate new composite canvas", README). **Unverified**: whether Photoshop accepts the result without re-rendering artefacts; test against real Photoshop before shipping.

## 9. Risks

- **Sample bias.** 29 of 40 files use one naming convention, most with one template structure. Older or premium PSDs may lean harder on smart filters, layer styles, 16-bit or CMYK. Mitigation: grow the test set with 20 paid mockups before committing to the MVP scope.
- **Undocumented behaviour.** Adobe does not document the warp rules in section 4; I derived them by measurement, and a Photoshop release could change them. The golden suite catches regressions.
- **Liquify (22% of our set).** No format documentation; fallback is approximate.
- **Displacement maps live outside the PSD.** Unfixable for anyone; label as approximate.
- **Memory.** Reading a 390 MB PSD with all layer pixels peaks at several GB in Node. Mitigation: parse in a worker, bake once, keep only the recipe.
- **Colour.** All files here are 8-bit RGB; `ag-psd` converts other modes to RGB on read and does not support 16 bits per channel (README). Colour profiles are not handled by this prototype. **Unverified**: how much embedded-profile handling changes exports compared with Photoshop.
- **Licensing of mockups.** Free mockup licences often forbid redistribution; the app only renders the user's own file locally, which raises no new issue. **Unverified** for any specific licence.

## 10. Honest estimate

- **Coverage.** Of the 40 real PSDs, about two thirds would export indistinguishably from Photoshop with the Phase 1 scope (exact geometry, plus the adjustments and blend modes measured in section 5). About one in ten would be close (minor smart filters). About one in five (Liquify) would look right on flat areas and lose fabric or crease distortion. These are first estimates from one small, skewed sample.
- **Effort.** Phase 0 plus Phase 1 is about 8 to 11 engineer-weeks for one developer who knows the codebase. The hard maths is already proven by this research; most of the time goes into the compositor details, the editor UI and the golden tests. Phase 2 adds 4 to 6 weeks; PSD write-back 2 to 4 weeks.
- **Recommendation.** Go, starting with Phase 0. It is low risk, reuses `ag-psd`, improves covers immediately, and produces the regression suite that keeps the rest honest.

## Appendix: method

- Scripts (session scratchpad `so-measure/`, not committed): `measure.cjs` (structure), `warp-test.cjs` (smart-object geometry), `composite-test.cjs` (whole document). Zips were extracted one at a time into the scratchpad and deleted after reading; nothing was written into the test set.
- Warp renderer: forward tessellation, 96x96 cells per Bezier patch, two triangles per cell, bilinear sampling, projective quad from the unit square to the stored corners.
- Compositor: separable blend functions from psd-tools' `blend.py`, W3C source-over formula, layer masks with default colour outside the mask rectangle, clipping groups limited by the base layer's coverage, pass-through groups inline, other groups isolated. Adjustment layers, layer effects and smart filters are skipped and counted.
- Comparison: mean absolute RGB difference over all pixels after flattening both images on white; share of pixels whose difference exceeds 8 and 24.
