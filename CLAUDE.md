# DesignStash — Project Instructions

A local-first macOS (Electron, Apple Silicon) app for designers to organise and semantically search mockups (Phase 1) and fonts (Phase 2).

**Source of truth:** the spec and roadmap live in Solo scratchpads — Spec: `solo://proj/6/scratchpad/designstash-spec-doc--8`, Phase 1 Roadmap: `solo://proj/6/scratchpad/designstash-phase-1--9`. Keep them in sync when scope changes.

## Styling — Tailwind CSS (strict)

**Avoid arbitrary values.** Do NOT reach for Tailwind arbitrary-value syntax (e.g. `w-[437px]`, `text-[#1a1a1a]`, `gap-[13px]`, `top-[7px]`) as a default. They fragment the design system and bypass our tokens.

**The rule:**

1. **Prefer theme tokens first** — use the scale already defined in the Tailwind config (spacing, colors, radius, typography, etc.).
2. **If a value you need isn't in the theme,** do NOT inline it as an arbitrary value. Instead:
   - **Pause and ask for approval**, and
   - **Add the value to the Tailwind config** (`theme.extend`…) as a named token, then use that token's utility class.
3. Arbitrary values are only acceptable as a deliberate, approved exception (e.g. a genuine one-off that should never become a reusable token) — and even then, call it out explicitly when proposing the change.

**Why:** every recurring value should be a reusable, named design token so the system stays consistent and a single config change can re-theme the app. Treat the Tailwind config as the design-token source of truth.

## Engineering conventions

- **Package manager:** pnpm. **State:** Zustand. **Validation/IPC contracts:** zod. **DB:** SQLite (better-sqlite3).
- **Process isolation:** all privileged work in the main process; renderer talks only via the typed preload bridge (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`). Never expand the preload surface beyond typed, validated channels.
- **Test-first** for main-process modules (DB, PSD, import, inference, entitlements): interface-driven, unit-tested with stubs. No real model or network calls in tests/CI.
- **No Reveal-in-Finder for the Library** — all file operations go through the app (see spec §3.5).
