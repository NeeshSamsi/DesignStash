# Packaging and releases

## Build a DMG locally (unsigned beta)

```sh
pnpm package        # package:stage, build, then package:mac
```

That stages llama-server and the Swift helper into `build/`, builds the app, and writes
`dist/DesignStash-<version>-arm64.dmg`. The app is ad-hoc signed (identity `-`, no certificate), so
`codesign --verify --deep --strict` passes and a downloaded copy gets macOS's Open Anyway. electron-builder
rebuilds better-sqlite3 for Electron inside `node_modules`, so `postpackage:mac` puts the Node build
back for the unit tests.
The migrations, llama-server and the helper are shipped in `<resources>/drizzle`, `/llama-server`
and `/helper`. The helper needs the macOS 27 SDK (Command Line Tools 27 or Xcode 27).

To try a packaged build without touching your real profile, start it with its own user data:

```sh
/Applications/DesignStash.app/Contents/MacOS/DesignStash --user-data-dir=/tmp/ds-profile
```

A packaged app uses `~/Library/Application Support/DesignStash`, which on a case-insensitive disk
is the same folder `pnpm dev` uses (`designstash`). The override avoids sharing it.

## How a release happens

1. Commits land on `main` as conventional commits.
2. `.github/workflows/release.yml` runs release-please, which keeps a "chore(main): release x.y.z"
   PR open with the version bump and the `CHANGELOG.md` entry. Only `feat`, `fix` and `perf`
   reach the notes; `feat` bumps the minor, `fix` and `perf` the patch (below 1.0).
3. Merging that PR tags `vX.Y.Z` and creates the GitHub Release with the notes.
4. The same workflow's `build` job runs on the `xcode-27` runner (Apple Silicon, macOS 27, Xcode 27),
   builds the DMG with `POSTHOG_KEY` from the repository secret, attaches it to the release and
   appends the tester install steps from `.github/release-tester-notes.md`.

To rebuild a release's DMG: Actions > Release > Run workflow, with the tag.

Repository settings needed once: Actions > General > Workflow permissions set to "Read and write",
and "Allow GitHub Actions to create and approve pull requests" ticked. Add the `POSTHOG_KEY` secret.

## The update notice

Unsigned apps cannot replace themselves, so the app (`src/main/updates/update-service.ts`) reads
`https://api.github.com/repos/NeeshSamsi/DesignStash/releases/latest` at launch (at most once a day)
and on Check now, and offers a Download link to the release page. When builds are signed, an
`electron-updater` service replaces it behind the same `UpdateService` interface; the note in that
file lists the mapping. electron-updater also needs `publish` set in `electron-builder.yml` and the
`latest-mac.yml` and `.zip` artifacts uploaded to each release.

## Signing and notarization later

The config is ready; it needs an Apple Developer Program membership ($99 a year) and these, set as
repository secrets and exposed to the build step:

| What                                                                      | Variable                                                                            | How to get it                                                                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Developer ID Application certificate, exported as .p12 and base64 encoded | `CSC_LINK`                                                                          | Xcode or developer.apple.com > Certificates > Developer ID Application, then Keychain Access > Export |
| The .p12 password                                                         | `CSC_KEY_PASSWORD`                                                                  | Chosen at export                                                                                      |
| Notarization, option A (recommended): App Store Connect API key           | `APPLE_API_KEY` (path to the .p8), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`           | App Store Connect > Users and Access > Integrations > Keys                                            |
| Notarization, option B: Apple ID                                          | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (from appleid.apple.com), `APPLE_TEAM_ID` | Team ID is on developer.apple.com > Membership details                                                |

Then switch the workflow's package step from `pnpm package:mac` to `pnpm package:mac:signed` and
pass those variables. The hardened runtime and `scripts/packaging/entitlements.mac.plist` are
already configured. Check Vision and Foundation Models in the helper on the first signed build.
