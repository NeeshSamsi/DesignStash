# Analytics, problem reports, logs and crashes

PostHog US cloud, on by default (opt-out), anonymous. Revisit EU opt-in at public release.

## Rules

- On by default for a new install. Onboarding's privacy step says so plainly and shows the switch, on, as easy to turn off as Settings › Privacy. An existing settings file keeps its choice.
- Nothing is sent until onboarding is done.
- Events are counts, durations and enums. Never paths, file or folder names, titles, tags, descriptions, search text, images, or free text. The tester's own words appear only in `problem_reported`, which they send themselves.
- Anonymous: `distinctId` is a random install id, no person profile, GeoIP off.
- Dev, tests and builds made without a key are Noop. The key is baked in at build time (`POSTHOG_KEY`, `POSTHOG_HOST`, default `https://us.i.posthog.com`) by `electron.vite.config.ts`.

## Events

| Event | Properties | Fired when |
|---|---|---|
| `app_opened` | `version`, `library_size_bucket` (`0`, `1-9`, `10-49`, `50-199`, `200-999`, `1000+`, or `unavailable` if the library did not open) | each launch |
| `import_started` | `paths` (count) | a drop or pick starts a haul |
| `import_completed` | `files` (landed), `skipped` (count), `duration_ms` | a haul reaches done, once |
| `group_confirmed` | counts (existing) | a sort board is confirmed |
| `ai_item_approved` | `count` (mockups stashed), `had_model` | Stash on a mockup or a pile |
| `ai_item_skipped` | none | Skip for now |
| `suggestion_edited` | `field` (`title`, `description`, `tags`) | a look-over save changes that field |
| `first_suggestion` | `seconds_since_install` | the first suggestion ever finishes, once per install |
| `search_performed` | `hasQuery`, `tagFilter`, `results_bucket`, `had_results` | a search with text |
| `model_tier_chosen` | `tier` | the active model changes |
| `model_download_finished` | `model_id`, `size_mb`, `duration_s` | a download completes |
| `model_download_failed` | `model_id`, `size_mb`, `duration_s`, `reason` | a download fails (not a cancel) |
| `app_crashed` | `process_type` (`main`, `renderer`, `GPU`, ...), `version` | next launch after a crash dump appeared |
| `problem_reported` | `message`, `details` | the tester presses Send in Report a problem. Sent even with analytics off. |
| `$exception` | scrubbed message, type, stack | `uncaughtException`, `unhandledRejection` |

`mandatory_upload_hit` was dropped: entitlements are all free, so nothing can hit it.

## Problem reports

Settings › About › Report a problem opens a dialog: a text box, the exact text that goes with it (version, system, library counts, crash line and the last 200 log lines, all path-scrubbed; expandable), and Send. Limits: message 4,000 characters, details 40,000. Offline, the report is kept (up to 5) and sent next launch. If PostHog refuses it or no key is built in, the dialog offers Copy report.

## Logs and crashes

- `userData/logs/designstash.log`, rolling at 1 MB across 3 files, every line scrubbed of paths.
- Electron `crashReporter` runs with `uploadToServer: false`. The next launch sends `app_crashed` for each new dump (with consent) and adds a "Crashes" line to the next problem report.

## Dashboard to build in PostHog

**Activation funnel** (unique installs, ordered, 14 day window):
1. `app_opened`
2. `model_download_finished` (or `model_tier_chosen` for Apple's built-in model)
3. `import_completed` where `files` > 0
4. `ai_item_approved`
5. `search_performed` where `had_results` = true

Add a breakdown by `model_id` on step 2, and a trend of `first_suggestion` `seconds_since_install` (median).

**Weekly use:** weekly active installs (`app_opened`), `import_completed` files summed, `ai_item_approved` count summed, `search_performed` count.

**Search quality:** `search_performed` split by `had_results`, as a share per week. The no-results share is the number to push down. Breakdown by `results_bucket`.

**Health:** `model_download_failed` by `reason`, `app_crashed` by `process_type`, `$exception` count per version, `problem_reported` list (message, details).

## Setting up PostHog (Neesh)

1. Create a PostHog Cloud project in the US region. Copy the project API key (`phc_...`).
2. In the GitHub repo: Settings › Secrets and variables › Actions › New repository secret `POSTHOG_KEY`. Optionally `POSTHOG_HOST` (leave unset for the US default).
3. The release workflow passes both to the build step as environment variables. The key is baked into the app at build time.
4. In the project settings, turn off "Capture IP address" / discard client IP data, and set a data retention that suits a beta.
5. Build the dashboard above from the events (they appear after the first release build sends them).
